// ─── Chat Attachment Permanent Cache ──────────────────────────────────────────
// Every received chat file (image, gif, audio, file) is downloaded ONCE to
// documentDirectory and kept permanently — the same model as WhatsApp / Telegram.
//
// RULES:
//   • Files go to documentDirectory (permanent), never cacheDirectory (volatile)
//   • If a file is already on disk → return it instantly, no network call
//   • If the file was deleted from the device → re-download transparently
//   • Video attachments are NOT auto-downloaded (too large) — they stream from URL
//   • openChatFile() opens the local copy with the device's native file viewer
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
       (url_hash, url, local_path, media_type, file_size, stored_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [hash, url, localPath, `chat_${type}`, fileSize, Date.now()],
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
      return localPath;
    }

    // 3. First time — download permanently
    const result = await FileSystem.downloadAsync(url, localPath);
    const verify = await FileSystem.getInfoAsync(result.uri);
    if (!verify.exists || (verify as any).size === 0) return null;

    _mem.set(url, result.uri);
    await _registerDB(url, hash, result.uri, type, (verify as any).size);
    return result.uri;
  } catch {
    return null;
  }
}
