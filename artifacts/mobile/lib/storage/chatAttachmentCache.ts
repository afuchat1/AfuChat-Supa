// ─── Chat Attachment Permanent Cache ──────────────────────────────────────────
// Every received chat file (image, gif, audio, file) is downloaded ONCE to
// documentDirectory and kept permanently — the same model as WhatsApp / Telegram.
//
// RULES:
//   • Files go to documentDirectory (permanent user data), never cacheDirectory
//   • Downloaded images/gifs/audio are also mirrored to the device media library
//     (silently, if permissions are already granted) so they appear in the Gallery
//   • If a file is already on disk → return it instantly, no network call
//   • If the file was deleted from the device → re-download transparently
//   • Video attachments are NOT auto-downloaded (too large) — they stream from URL
//   • openChatFile() opens the local copy with the device's native file viewer
//   • saveAttachmentToGallery(url) saves to the device gallery from user interaction
//
// All metadata (url → local path) is stored in the existing `media_cache` SQLite
// table using media_type values: chat_image, chat_gif, chat_audio, chat_file.

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { getDB } from "./db";
import { storage } from "./mmkv";
import {
  getChatAttachmentExtension,
  getChatAttachmentName,
  normalizeChatAttachmentMimeType,
  normalizeChatAttachmentSize,
  type ChatAttachmentMetadata,
} from "../chatAttachmentMetadata";

const BASE = ((FileSystem as any).documentDirectory ?? "") + "afuchat_media/chat/";
const LEGACY_BASE = ((FileSystem as any).documentDirectory ?? "") + "afuchat_attachments/";
const GALLERY_WRITE_PERMISSION_KEY = "chat_gallery_write_permission";
let _galleryPermissionRequest: Promise<boolean> | null = null;

const DIRS: Record<string, string> = {
  image:       BASE + "images/",
  gif:         BASE + "gifs/",
  audio:       BASE + "audio/",
  file:        BASE + "files/",
  story_reply: BASE + "images/",
};

// ── In-memory hot cache: url → localPath (reset on app restart) ────────────
const _mem = new Map<string, string>();

// ── Dedup concurrent downloads for the same URL ────────────────────────────
const _inFlight = new Map<string, Promise<string | null>>();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Synchronous lookup — returns the local path from memory cache, or null.
 * Use this for the initial render before the async download resolves.
 */
export function getLocalAttachmentUri(url: string): string | null {
  return _mem.get(url) ?? null;
}

/**
 * Resolve an already-downloaded chat attachment without starting a network
 * request. Safe to use before opening the full-screen image viewer.
 */
export async function getCachedChatAttachmentUri(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("file://")) return url;
  if (!url.startsWith("http")) return null;

  const memoryPath = _mem.get(url);
  if (memoryPath) {
    try {
      const info = await FileSystem.getInfoAsync(memoryPath);
      if (info.exists && (info as any).size > 0) return memoryPath;
      _mem.delete(url);
    } catch {}
  }

  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ local_path: string; media_type: string | null }>(
      "SELECT local_path, media_type FROM media_cache WHERE url_hash = ?",
      [_urlHash(url)],
    );
    if (!row?.local_path || !row.media_type?.startsWith("chat_")) return null;
    const info = await FileSystem.getInfoAsync(row.local_path);
    if (!info.exists || !(info as any).size) return null;
    _mem.set(url, row.local_path);
    return row.local_path;
  } catch {
    return null;
  }
}

/**
 * Ensure a chat attachment is on device and return its local URI.
 * - Already downloaded → returns local path instantly (no network).
 * - Not yet downloaded → downloads it, caches permanently, returns local path.
 * - Concurrent calls for the same URL share a single download promise.
 * - Returns null on error (caller should fall back to the remote URL).
 */
export async function ensureChatAttachmentDownloaded(
  url: string,
  type: string,
  metadata?: ChatAttachmentMetadata,
  onProgress?: (progress: number) => void,
): Promise<string | null> {
  if (!url?.startsWith("http")) return null;
  if (_mem.has(url)) {
    onProgress?.(1);
    return _mem.get(url)!;
  }
  if (_inFlight.has(url)) return _inFlight.get(url)!;

  const p = _download(url, type, false, metadata, onProgress);
  _inFlight.set(url, p);
  p.finally(() => _inFlight.delete(url));
  return p;
}

export type AutoDownloadOpts = {
  /** Mirrors the chat_preferences.auto_download / chat_media_autodownload setting.
   *  "never"     → no auto-downloads at all (user must tap to download manually).
   *  "wifi_only" → download only on Wi-Fi (default).
   *  "always"    → download on any connection.
   *  Pass the boolean from ChatPrefs as: auto_download ? "wifi_only" : "never"
   */
  autoDownloadPref?: "always" | "wifi_only" | "never";
  /** Mirror downloaded images/gifs to the device gallery.
   *  Only effective when MediaLibrary permission is already granted.
   *  Controlled by chat_preferences.save_to_gallery.
   */
  saveToGallery?: boolean;
};

/**
 * Fire-and-forget background download for all attachments in a message list.
 * Videos and raw files are always skipped (too large / user-initiated only).
 * Respects the user's autoDownloadPref — pass "never" to disable completely.
 */
export function autoDownloadChatAttachments(
  messages: Array<{
    attachment_url?: string | null;
    attachment_type?: string | null;
    encrypted_content?: string | null;
  }>,
  opts: AutoDownloadOpts = {},
): void {
  const { autoDownloadPref = "wifi_only", saveToGallery = false } = opts;
  if (autoDownloadPref === "never") return;
  for (const msg of messages) {
    const { attachment_url: url, attachment_type: type } = msg;
    if (!url || !type) continue;
    if (type === "image_group") {
      try {
        const groupedUrls: unknown = JSON.parse(url);
        if (Array.isArray(groupedUrls)) {
          groupedUrls.forEach((imageUrl) => {
            if (typeof imageUrl === "string" && imageUrl.startsWith("http")) {
              _downloadWithOpts(imageUrl, "image", saveToGallery).catch(() => {});
            }
          });
        }
      } catch {}
      continue;
    }
    if (type === "video") continue;  // too large — stream from URL
    if (type === "file") continue;   // user must decide to download
    if (_mem.has(url)) continue;
    _downloadWithOpts(url, type, saveToGallery, msg.encrypted_content ?? undefined).catch(() => {});
  }
}

/**
 * Request MediaLibrary permission exactly once — call this when the user
 * enables "Save to Gallery" in settings so subsequent background saves never
 * need to show a dialog.
 * Returns true if permission was granted (or was already granted).
 */
export async function requestGalleryPermissionOnce(): Promise<boolean> {
  if (_galleryPermissionRequest) return _galleryPermissionRequest;

  _galleryPermissionRequest = (async () => {
    try {
      const ML = await import("expo-media-library");
      // Chat auto-save only creates new assets; it never reads the user's
      // existing gallery. Write-only avoids Android's selected-photos access
      // flow, which can otherwise appear again while each new asset is saved.
      const { status: current } = await ML.getPermissionsAsync(true);
      if (current === "granted") {
        storage.setString(GALLERY_WRITE_PERMISSION_KEY, "granted");
        return true;
      }

      // A denial is remembered so a failed Save to Phone action cannot reopen
      // the native dialog on every subsequent image. A silent status check
      // above still lets a later Settings change take effect.
      if (storage.getString(GALLERY_WRITE_PERMISSION_KEY) === "denied") return false;

      const { status } = await ML.requestPermissionsAsync(true);
      const granted = status === "granted";
      storage.setString(GALLERY_WRITE_PERMISSION_KEY, granted ? "granted" : "denied");
      return granted;
    } catch {
      return false;
    } finally {
      _galleryPermissionRequest = null;
    }
  })();

  return _galleryPermissionRequest;
}

/**
 * Open a locally-cached file with the device's native file viewer / share sheet.
 */
export async function openChatFile(
  localPath: string,
  options: { fileName?: string | null; mimeType?: string | null; dialogTitle?: string } = {},
): Promise<boolean> {
  if (!localPath) return false;
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return false;
    window.open(localPath, "_blank", "noopener,noreferrer");
    return true;
  }
  const Sharing = await import("expo-sharing");
  const available = await Sharing.isAvailableAsync();
  if (!available) return false;
  await Sharing.shareAsync(localPath, {
    dialogTitle: options.dialogTitle ?? "Open or share file",
    mimeType: normalizeChatAttachmentMimeType(options.mimeType, options.fileName),
  });
  return true;
}

export function downloadChatAttachmentInBrowser(url: string, fileName: string): boolean {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;
  const link = document.createElement("a");
  link.href = url;
  link.download = getChatAttachmentName(fileName);
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

export async function saveChatAttachmentToDevice(
  localPath: string,
  options: { fileName?: string | null; mimeType?: string | null } = {},
): Promise<boolean> {
  try {
    return await openChatFile(localPath, {
      ...options,
      dialogTitle: "Save or share file",
    });
  } catch (error) {
    console.warn("[ChatAttachment] Could not open the system file actions:", error);
    return false;
  }
}

/**
 * Save a received chat attachment to the device's media gallery.
 * Requests MediaLibrary permissions if not yet granted.
 * Call this from user interaction (long-press → Save to Phone).
 * Returns true if saved successfully, false otherwise.
 */
export async function saveAttachmentToGallery(url: string): Promise<boolean> {
  try {
    // Resolve local path from memory or SQLite
    const hash = _urlHash(url);
    const db = await getDB();
    const row = await db.getFirstAsync<{
      local_path: string;
      media_type: string | null;
      saved_to_device: number | null;
    }>(
      "SELECT local_path, media_type, saved_to_device FROM media_cache WHERE url_hash = ?",
      [hash],
    );
    if (row?.media_type?.startsWith("chat_") && row.saved_to_device === 1) return true;
    const localPath: string | null = _mem.get(url) ?? row?.local_path ?? null;
    if (!localPath) return false;

    // Ask at most once. Later saves reuse the OS grant and never reopen the
    // permission dialog for each individual received image.
    if (!(await requestGalleryPermissionOnce())) return false;

    const ML = await import("expo-media-library");

    const asset = await ML.createAssetAsync(localPath);
    try {
      const album = await ML.getAlbumAsync("AfuChat");
      if (album) {
        await ML.addAssetsToAlbumAsync([asset], album, false);
      } else {
        await ML.createAlbumAsync("AfuChat", asset, false);
      }
    } catch {}

    // Mark saved in SQLite
    await db.runAsync(
      "UPDATE media_cache SET saved_to_device = 1 WHERE url_hash = ?",
      [hash],
    );

    return true;
  } catch {
    return false;
  }
}

// ─── Internal ──────────────────────────────────────────────────────────────

function _urlHash(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h) ^ url.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}

function _guessExt(url: string, type: string, metadata?: ChatAttachmentMetadata): string {
  const fileName = getChatAttachmentName(metadata?.attachment_name, url);
  const nameExt = getChatAttachmentExtension(fileName, metadata?.attachment_mime_type);
  if (nameExt) return nameExt;
  try {
    const path = new URL(url).pathname;
    const raw = path.split("/").pop()?.split(".").pop()?.toLowerCase() ?? "";
    if (/^[a-z0-9]{1,16}$/.test(raw) && raw !== "invalid") return raw;
  } catch {}
  // Fallback defaults per type
  const defaults: Record<string, string> = {
    image: "jpg", gif: "gif", audio: "m4a", file: "bin", story_reply: "jpg",
  };
  return defaults[type] ?? "bin";
}

async function _ensureDir(dir: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {}
}

async function _registerDB(
  url: string,
  hash: string,
  localPath: string,
  type: string,
  fileSize: number,
  metadata?: ChatAttachmentMetadata,
): Promise<void> {
  try {
    const fileName = getChatAttachmentName(metadata?.attachment_name, url);
    const mimeType = normalizeChatAttachmentMimeType(metadata?.attachment_mime_type, fileName);
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO media_cache
       (url_hash, url, local_path, media_type, file_size, file_name, mime_type, stored_at, saved_to_device)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        hash,
        url,
        localPath,
        `chat_${type}`,
        normalizeChatAttachmentSize(fileSize) ?? fileSize,
        fileName,
        mimeType,
        Date.now(),
      ],
    );
  } catch {}
}

/**
 * Silently mirror an attachment to the device media library after download.
 * Only runs if:
 *   1. saveToGallery is true (user has the "Save to Gallery" setting enabled)
 *   2. MediaLibrary permission is ALREADY granted — no popup triggered here.
 *      Permission is requested once up-front via requestGalleryPermissionOnce().
 * Handles image, gif, and story_reply types only.
 */
async function _saveToDeviceLibrary(
  localPath: string,
  type: string,
  urlHash: string,
  saveToGallery: boolean,
): Promise<void> {
  if (!saveToGallery) return;
  // Skip audio — Android requires READ_MEDIA_AUDIO in AndroidManifest which is
  // not declared, causing a hard crash when MediaLibrary checks permissions.
  if (!["image", "gif", "story_reply"].includes(type)) return;
  try {
    const ML = await import("expo-media-library");
    const db = await getDB();
    const cacheRow = await db.getFirstAsync<{
      media_type: string | null;
      saved_to_device: number | null;
    }>(
      "SELECT media_type, saved_to_device FROM media_cache WHERE url_hash = ?",
      [urlHash],
    );
    // The app cache and the gallery are separate stores. Once this URL has
    // been mirrored to the gallery, never create another gallery asset when
    // the chat list is rendered again.
    if (cacheRow?.media_type?.startsWith("chat_") && cacheRow.saved_to_device === 1) return;

    // Check permission WITHOUT requesting — no dialog during background download
    let status: string;
    try {
      // This code runs after an attachment download and must never prompt.
      // We only need write access to create a new gallery asset; asking for
      // read access here can invoke Android's selected-photos UI per asset.
      const perm = await ML.getPermissionsAsync(true);
      status = perm.status;
    } catch {
      // Permission check itself can throw on Android if the manifest doesn't
      // declare the required permission for the media type. Bail out silently.
      return;
    }
    if (status !== "granted") return;

    const asset = await ML.createAssetAsync(localPath);
    try {
      const album = await ML.getAlbumAsync("AfuChat");
      if (album) {
        await ML.addAssetsToAlbumAsync([asset], album, false);
      } else {
        await ML.createAlbumAsync("AfuChat", asset, false);
      }
    } catch {}

    // Mark saved in SQLite
    await db.runAsync(
      "UPDATE media_cache SET saved_to_device = 1 WHERE url_hash = ?",
      [urlHash],
    );
  } catch {}
}

/**
 * Internal download entry-point called by autoDownloadChatAttachments.
 * Carries the saveToGallery flag through to _saveToDeviceLibrary.
 */
async function _downloadWithOpts(
  url: string,
  type: string,
  saveToGallery: boolean,
  _hint?: string,
  metadata?: ChatAttachmentMetadata,
): Promise<string | null> {
  if (_mem.has(url)) return _mem.get(url)!;
  if (_inFlight.has(url)) return _inFlight.get(url)!;
  const p = _download(url, type, saveToGallery, metadata);
  _inFlight.set(url, p);
  p.finally(() => _inFlight.delete(url));
  return p;
}

async function _download(
  url: string,
  type: string,
  saveToGallery = false,
  metadata?: ChatAttachmentMetadata,
  onProgress?: (progress: number) => void,
): Promise<string | null> {
  try {
    const dir = DIRS[type] ?? DIRS.file;
    await _ensureDir(dir);

    const hash = _urlHash(url);
    const ext = _guessExt(url, type, metadata);
    const fileName = getChatAttachmentName(metadata?.attachment_name, url);
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-96) || `file.${ext}`;
    const localPath = dir + `att_${hash}_${safeName}`;

    // 1. Check SQLite registry (survived app restarts)
    const db = await getDB();
    const row = await db.getFirstAsync<{
      local_path: string;
      media_type: string | null;
      saved_to_device: number | null;
      file_size: number | null;
      file_name: string | null;
      mime_type: string | null;
    }>(
      "SELECT local_path, media_type, saved_to_device, file_size, file_name, mime_type FROM media_cache WHERE url_hash = ?",
      [hash],
    );
    if (row) {
      const check = await FileSystem.getInfoAsync(row.local_path);
      if (check.exists && (check as any).size > 0) {
        // Migrate old hashed .bin paths so the OS sees the original extension
        // and name when the user opens or saves an unfamiliar document format.
        if (row.local_path !== localPath) {
          try {
            await FileSystem.copyAsync({ from: row.local_path, to: localPath });
            const migrated = await FileSystem.getInfoAsync(localPath);
            if (migrated.exists && (migrated as any).size > 0) {
              await db.runAsync(
                `UPDATE media_cache
                 SET local_path = ?, media_type = ?, file_name = ?, mime_type = ?,
                     file_size = ?, saved_to_device = 0, last_accessed = ?
                 WHERE url_hash = ?`,
                [
                  localPath,
                  `chat_${type}`,
                  metadata?.attachment_name ?? row.file_name ?? fileName,
                  metadata?.attachment_mime_type ?? row.mime_type ?? "application/octet-stream",
                  metadata?.attachment_size ?? row.file_size ?? (migrated as any).size,
                  Date.now(),
                  hash,
                ],
              );
              if (row.local_path.startsWith(BASE) || row.local_path.startsWith(LEGACY_BASE)) {
                await FileSystem.deleteAsync(row.local_path, { idempotent: true });
              }
              _mem.set(url, localPath);
              return localPath;
            }
          } catch {
            // Keep using the old copy if the one-time migration cannot finish.
          }
        }
        _mem.set(url, row.local_path);
        await _registerDB(url, hash, row.local_path, type, (check as any).size, {
          attachment_name: metadata?.attachment_name ?? row.file_name,
          attachment_mime_type: metadata?.attachment_mime_type ?? row.mime_type,
          attachment_size: metadata?.attachment_size ?? row.file_size,
        });
        onProgress?.(1);
        return row.local_path;
      }
      // File was deleted from device — fall through and re-download
    }

    // 2. File already exists at the expected path (no DB entry yet)
    const existing = await FileSystem.getInfoAsync(localPath);
    if (existing.exists && (existing as any).size > 0) {
      _mem.set(url, localPath);
      await _registerDB(url, hash, localPath, type, (existing as any).size, metadata);
      _saveToDeviceLibrary(localPath, type, hash, saveToGallery).catch(() => {});
      onProgress?.(1);
      return localPath;
    }

    // 3. First time — download permanently to documentDirectory (user data)
    const task = FileSystem.createDownloadResumable(url, localPath, {}, (event) => {
      if (event.totalBytesExpectedToWrite > 0) {
        onProgress?.(Math.min(1, event.totalBytesWritten / event.totalBytesExpectedToWrite));
      }
    });
    const result = await task.downloadAsync();
    if (!result) return null;
    const verify = await FileSystem.getInfoAsync(result.uri);
    if (!verify.exists || (verify as any).size === 0) return null;

    _mem.set(url, result.uri);
    await _registerDB(url, hash, result.uri, type, (verify as any).size, metadata);
    // Mirror to gallery only if user has save_to_gallery enabled and permission is granted
    _saveToDeviceLibrary(result.uri, type, hash, saveToGallery).catch(() => {});
    onProgress?.(1);
    return result.uri;
  } catch {
    return null;
  }
}
