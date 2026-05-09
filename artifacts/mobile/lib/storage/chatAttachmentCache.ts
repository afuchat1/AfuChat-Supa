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

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { getDB } from "./db";

const BASE = ((FileSystem as any).documentDirectory ?? "") + "afuchat_media/chat/";

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
 * Ensure a chat attachment is on device and return its local URI.
 * - Already downloaded → returns local path instantly (no network).
 * - Not yet downloaded → downloads it, caches permanently, returns local path.
 * - Concurrent calls for the same URL share a single download promise.
 * - Returns null on error (caller should fall back to the remote URL).
 */
export async function ensureChatAttachmentDownloaded(
  url: string,
  type: string,
  _hint?: string,
): Promise<string | null> {
  if (Platform.OS === "web" || !url?.startsWith("http")) return null;
  if (_mem.has(url)) return _mem.get(url)!;
  if (_inFlight.has(url)) return _inFlight.get(url)!;

  const p = _download(url, type);
  _inFlight.set(url, p);
  p.finally(() => _inFlight.delete(url));
  return p;
}

/**
 * Fire-and-forget background download for all attachments in a message list.
 * Videos are skipped (streamed from URL instead — they can be very large).
 */
export function autoDownloadChatAttachments(
  messages: Array<{
    attachment_url?: string | null;
    attachment_type?: string | null;
    encrypted_content?: string | null;
  }>,
): void {
  if (Platform.OS === "web") return;
  for (const msg of messages) {
    const { attachment_url: url, attachment_type: type } = msg;
    if (!url || !type) continue;
    if (type === "video") continue; // stream, don't cache
    if (_mem.has(url)) continue;
    ensureChatAttachmentDownloaded(url, type, msg.encrypted_content ?? undefined).catch(() => {});
  }
}

/**
 * Open a locally-cached file with the device's native file viewer / share sheet.
 */
export async function openChatFile(localPath: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Sharing = await import("expo-sharing");
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(localPath, { dialogTitle: "Open file" });
    }
  } catch {}
}

/**
 * Save a received chat attachment to the device's media gallery.
 * Requests MediaLibrary permissions if not yet granted.
 * Call this from user interaction (long-press → Save to Phone).
 * Returns true if saved successfully, false otherwise.
 */
export async function saveAttachmentToGallery(url: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const ML = await import("expo-media-library");

    // Resolve local path from memory or SQLite
    let localPath: string | null = _mem.get(url) ?? null;
    if (!localPath) {
      const hash = _urlHash(url);
      const db = await getDB();
      const row = await db.getFirstAsync<{ local_path: string }>(
        "SELECT local_path FROM media_cache WHERE url_hash = ?",
        [hash],
      );
      if (row) localPath = row.local_path;
    }
    if (!localPath) return false;

    // Request permissions — this CAN show a dialog, called from user action
    const { status } = await ML.requestPermissionsAsync();
    if (status !== "granted") return false;

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
    const hash = _urlHash(url);
    const db = await getDB();
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

function _guessExt(url: string, type: string): string {
  // Try to pull the extension from the URL path
  const path = url.split("?")[0];
  const parts = path.split(".");
  const raw = parts[parts.length - 1]?.toLowerCase() ?? "";
  const allowed: Record<string, string[]> = {
    image:       ["jpg", "jpeg", "png", "webp", "heic", "avif"],
    gif:         ["gif"],
    audio:       ["m4a", "mp3", "aac", "wav", "ogg", "opus"],
    file:        ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "zip", "csv"],
    story_reply: ["jpg", "jpeg", "png", "webp"],
  };
  const allowed_for_type = allowed[type] ?? [];
  if (raw && allowed_for_type.includes(raw)) return raw;
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
): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO media_cache
       (url_hash, url, local_path, media_type, file_size, stored_at, saved_to_device)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [hash, url, localPath, `chat_${type}`, fileSize, Date.now()],
    );
  } catch {}
}

/**
 * Silently mirror an attachment to the device media library after download.
 * Only runs if MediaLibrary permissions are ALREADY granted — no popup here.
 * Handles image, gif, audio, and story_reply types.
 */
async function _saveToDeviceLibrary(
  localPath: string,
  type: string,
  urlHash: string,
): Promise<void> {
  if (Platform.OS === "web") return;
  if (!["image", "gif", "audio", "story_reply"].includes(type)) return;
  try {
    const ML = await import("expo-media-library");

    // Check permission WITHOUT requesting — no dialog during background download
    const { status } = await ML.getPermissionsAsync();
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
    const db = await getDB();
    await db.runAsync(
      "UPDATE media_cache SET saved_to_device = 1 WHERE url_hash = ?",
      [urlHash],
    );
  } catch {}
}

async function _download(url: string, type: string): Promise<string | null> {
  try {
    const dir = DIRS[type] ?? DIRS.file;
    await _ensureDir(dir);

    const hash = _urlHash(url);
    const ext  = _guessExt(url, type);
    const localPath = dir + `att_${hash}.${ext}`;

    // 1. Check SQLite registry (survived app restarts)
    const db = await getDB();
    const row = await db.getFirstAsync<{ local_path: string }>(
      "SELECT local_path FROM media_cache WHERE url_hash = ?",
      [hash],
    );
    if (row) {
      const check = await FileSystem.getInfoAsync(row.local_path);
      if (check.exists && (check as any).size > 0) {
        _mem.set(url, row.local_path);
        return row.local_path;
      }
      // File was deleted from device — fall through and re-download
    }

    // 2. File already exists at the expected path (no DB entry yet)
    const existing = await FileSystem.getInfoAsync(localPath);
    if (existing.exists && (existing as any).size > 0) {
      _mem.set(url, localPath);
      await _registerDB(url, hash, localPath, type, (existing as any).size);
      // Mirror to device library if permissions allow (fire-and-forget)
      _saveToDeviceLibrary(localPath, type, hash).catch(() => {});
      return localPath;
    }

    // 3. First time — download permanently to documentDirectory (user data)
    const result = await FileSystem.downloadAsync(url, localPath);
    const verify = await FileSystem.getInfoAsync(result.uri);
    if (!verify.exists || (verify as any).size === 0) return null;

    _mem.set(url, result.uri);
    await _registerDB(url, hash, result.uri, type, (verify as any).size);
    // Mirror to device media library — silent, no popup (background behaviour)
    _saveToDeviceLibrary(result.uri, type, hash).catch(() => {});
    return result.uri;
  } catch {
    return null;
  }
}
