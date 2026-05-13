// ─── Media Auto-Downloader ──────────────────────────────────────────────────────
// When a message with an attachment arrives (image, video, audio, doc),
// download it to documentDirectory immediately so it's available offline.
//
// Rules:
//   • documentDirectory is PERMANENT — OS never clears it.
//   • Already-downloaded files are never re-fetched (check registry first).
//   • Respects the user's chat_media_autodownload setting:
//       "always"    — download on any connection
//       "wifi_only" — download only on Wi-Fi (default)
//       "never"     — no auto-download; user taps to download manually
//   • Videos > 100 MB are skipped from auto-download regardless of setting.
//   • All downloads are fire-and-forget; errors are silently ignored.

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Network from "expo-network";
import { getDB } from "./db";

const BASE_DIR = ((FileSystem as any).documentDirectory ?? "") + "afuchat_attachments/";
const IMG_DIR = BASE_DIR + "images/";
const AUDIO_DIR = BASE_DIR + "audio/";
const DOC_DIR = BASE_DIR + "docs/";

const VIDEO_SIZE_LIMIT = 100 * 1024 * 1024;

// In-memory set of URLs currently downloading (prevent duplicate concurrent fetches)
const _inFlight = new Set<string>();

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Auto-download an attachment to permanent device storage.
 * Call this whenever a message with an attachment_url is saved locally.
 *
 * @param messageId        ID of the owning message (for registry)
 * @param url              Remote URL of the attachment
 * @param attachmentType   "image" | "video" | "audio" | "doc" | "file"
 * @param conversationId   ID of the owning conversation (for registry)
 * @param autoDownloadPref User's setting: "always" | "wifi_only" | "never"
 */
export async function autoDownloadAttachment(
  messageId: string,
  url: string,
  attachmentType: string,
  conversationId: string = "",
  autoDownloadPref: "always" | "wifi_only" | "never" = "wifi_only",
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!url || !url.startsWith("http")) return null;
  if (autoDownloadPref === "never") return null;

  // Check if already downloaded
  const existing = await getDownloadedAttachmentUri(url);
  if (existing) return existing;

  if (_inFlight.has(url)) return null;

  // Check network conditions
  try {
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected || !net.isInternetReachable) return null;
    if (autoDownloadPref === "wifi_only" && net.type !== Network.NetworkStateType.WIFI) return null;
  } catch {
    return null;
  }

  _inFlight.add(url);
  try {
    return await downloadToDevice(url, attachmentType, messageId, conversationId);
  } finally {
    _inFlight.delete(url);
  }
}

/**
 * Get the local file URI for an already-downloaded attachment.
 * Returns null if not yet on device.
 */
export async function getDownloadedAttachmentUri(url: string): Promise<string | null> {
  if (Platform.OS === "web" || !url) return null;
  try {
    const db = await getDB();
    const hash = urlHash(url);
    const row = await db.getFirstAsync<{ local_path: string }>(
      "SELECT local_path FROM media_cache WHERE url_hash = ? AND saved_to_device = 1",
      [hash],
    );
    if (!row) return null;
    const info = await FileSystem.getInfoAsync(row.local_path);
    if (info.exists && (info as any).size > 0) return row.local_path;
    return null;
  } catch {
    return null;
  }
}

/**
 * Batch-download all attachments from a list of messages.
 * Used when opening a conversation to pre-fetch all media.
 */
export async function preloadConversationMedia(
  messages: Array<{ id: string; conversation_id: string; attachment_url: string | null; attachment_type: string | null }>,
  autoDownloadPref: "always" | "wifi_only" | "never" = "wifi_only",
): Promise<void> {
  if (Platform.OS === "web" || autoDownloadPref === "never") return;
  for (const msg of messages) {
    if (!msg.attachment_url || !msg.attachment_type) continue;
    autoDownloadAttachment(
      msg.id,
      msg.attachment_url,
      msg.attachment_type,
      msg.conversation_id,
      autoDownloadPref,
    ).catch(() => {});
  }
}

/** Returns total count and bytes of stored attachments. */
export async function getAttachmentStorageStats(): Promise<{ count: number; bytes: number }> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ count: number; bytes: number }>(
      "SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as bytes FROM media_cache WHERE saved_to_device = 1 AND owner_id IS NOT NULL",
    );
    return { count: row?.count ?? 0, bytes: row?.bytes ?? 0 };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

/** User-initiated clear of all downloaded attachments (not avatars/thumbs). */
export async function clearAttachmentStorage(): Promise<void> {
  try {
    await FileSystem.deleteAsync(BASE_DIR, { idempotent: true });
    const db = await getDB();
    await db.runAsync(
      "DELETE FROM media_cache WHERE owner_id IS NOT NULL AND saved_to_device = 1",
    );
  } catch {}
}

// ─── Internal ───────────────────────────────────────────────────────────────────

async function downloadToDevice(
  url: string,
  attachmentType: string,
  messageId: string,
  conversationId: string,
): Promise<string | null> {
  try {
    const dir = resolveDir(attachmentType);
    await ensureDir(dir);

    const localPath = dir + buildFilename(url, attachmentType);

    // Already exists on disk (race between calls)
    const existing = await FileSystem.getInfoAsync(localPath);
    if (existing.exists && (existing as any).size > 0) {
      await registerAttachment(url, localPath, attachmentType, (existing as any).size, messageId, conversationId);
      return localPath;
    }

    // Skip very large video files
    if (attachmentType === "video") {
      try {
        const head = await fetch(url, { method: "HEAD" });
        const len = Number(head.headers.get("content-length") ?? "0");
        if (len > VIDEO_SIZE_LIMIT) return null;
      } catch {}
    }

    const result = await FileSystem.downloadAsync(url, localPath);
    const info = await FileSystem.getInfoAsync(result.uri);
    if (!info.exists || (info as any).size === 0) return null;

    await registerAttachment(url, result.uri, attachmentType, (info as any).size ?? 0, messageId, conversationId);
    return result.uri;
  } catch {
    return null;
  }
}

function resolveDir(type: string): string {
  if (type === "image" || type === "photo") return IMG_DIR;
  if (type === "audio" || type === "voice") return AUDIO_DIR;
  return DOC_DIR;
}

function buildFilename(url: string, type: string): string {
  const hash = urlHash(url);
  const rawExt = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = rawExt.length > 0 && rawExt.length <= 5 ? rawExt : mimeToExt(type);
  return `${type}_${hash}.${ext}`;
}

function mimeToExt(type: string): string {
  switch (type) {
    case "image": return "jpg";
    case "audio":
    case "voice": return "m4a";
    case "video": return "mp4";
    default: return "bin";
  }
}

async function ensureDir(dir: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {}
}

async function registerAttachment(
  url: string,
  localPath: string,
  type: string,
  fileSize: number,
  messageId: string,
  conversationId: string,
): Promise<void> {
  try {
    const db = await getDB();
    const now = Date.now();
    await db.runAsync(
      `INSERT OR REPLACE INTO media_cache
       (url_hash, url, local_path, media_type, file_size, stored_at,
        saved_to_device, last_accessed, owner_id, message_id)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [urlHash(url), url, localPath, type, fileSize, now, now, conversationId, messageId],
    );
  } catch {}
}

function urlHash(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h) ^ url.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}
