// ─── Permanent Media Store (avatars + thumbnails) ──────────────────────────────
// Images are downloaded ONCE to documentDirectory and never re-downloaded.
// documentDirectory is NOT cleared by OS cache pressure — data stays until
// the app is deleted or the user explicitly clears it.
//
// RULES:
//   • Files go to documentDirectory (permanent), not cacheDirectory (volatile)
//   • No TTL, no auto-expiry, no auto-pruning
//   • If a file is on disk, use it — no network call
//   • clearMediaCache() is user-initiated only

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { getDB } from "./db";
import { toAfuCloudMediaUrl } from "../afuCloudMedia";

// ── documentDirectory = permanent; OS never clears this automatically ──────────
// Computed lazily so we never capture a null documentDirectory at module-eval
// time (can happen in some restricted/sandboxed environments during early boot).
function getBaseDir(): string {
  return ((FileSystem as any).documentDirectory ?? "") + "afuchat_media/";
}
function getThumbDir(): string { return getBaseDir() + "thumbs/"; }
function getAvatarDir(): string { return getBaseDir() + "avatars/"; }

// In-memory hot cache for the current session (reset on app restart)
const _memCache = new Map<string, string>();
const _inflight = new Map<string, Promise<string | null>>();

// ─── Helpers ───────────────────────────────────────────────────────────────────

function urlHash(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h) ^ url.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}

function urlToFilename(url: string, dir: string): string {
  const hash = urlHash(url);
  const raw = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
  const ext = ["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(raw) ? raw : "jpg";
  return dir + `img_${hash}.${ext}`;
}

async function ensureDir(dir: string) {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {}
}

// ─── Main API ──────────────────────────────────────────────────────────────────

/**
 * Synchronous in-memory lookup only. Returns the local file path if this URL
 * has already been downloaded and is still in the session's hot cache.
 * Returns null if the path is not in memory (need to call getCachedImageUri).
 *
 * Use this to provide an instant initial render value without any I/O.
 */
export function getCachedImageUriSync(url: string | null | undefined): string | null {
  if (!url) return null;
  return _memCache.get(url) ?? null;
}

/**
 * Get a local URI for a remote image URL.
 * - If already on disk → return local path instantly (no network).
 * - Otherwise → start background download and return original URL immediately.
 *   Next time the same URL is requested, the local copy is used.
 */
export async function getCachedImageUri(
  url: string,
  type: "avatar" | "thumb" = "thumb",
): Promise<string> {
  if (!url || !url.startsWith("http")) return url;

  // 1. In-memory map — zero I/O
  if (_memCache.has(url)) return _memCache.get(url)!;

  // 2. SQLite registry — check if we've already downloaded this before
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ local_path: string }>(
      "SELECT local_path FROM media_cache WHERE url_hash = ?",
      [urlHash(url)],
    );
    if (row) {
      const info = await FileSystem.getInfoAsync(row.local_path);
      if (info.exists && (info as any).size > 0) {
        _memCache.set(url, row.local_path);
        // Touch last_accessed for LRU tracking (fire-and-forget)
        db.runAsync(
          "UPDATE media_cache SET last_accessed = ? WHERE url_hash = ?",
          [Date.now(), urlHash(url)],
        ).catch(() => {});
        return row.local_path;
      }
      // File was deleted (e.g. user cleared storage) — re-download it once
    }
  } catch {}

  // 3. Not on device — download in background; return original URL for now
  downloadAndCache(url, type).catch(() => {});
  return url;
}

/**
 * Force-download and permanently store a URL. Returns local path or null.
 * Already-stored files are returned instantly with no download.
 */
export async function downloadAndCache(
  url: string,
  type: "avatar" | "thumb" = "thumb",
): Promise<string | null> {
  if (!url || !url.startsWith("http")) return null;
  const resolvedUrl = toAfuCloudMediaUrl(url) || url;
  if (_memCache.has(resolvedUrl)) return _memCache.get(resolvedUrl)!;
  if (Platform.OS === "web") return null;
  const running = _inflight.get(resolvedUrl);
  if (running) return running;

  const promise = (async () => {
    try {
    const dir = type === "avatar" ? getAvatarDir() : getThumbDir();
    await ensureDir(dir);
     const localPath = urlToFilename(resolvedUrl, dir);

    // Already downloaded — no network call
    const existing = await FileSystem.getInfoAsync(localPath);
    if (existing.exists && (existing as any).size > 0) {
       _memCache.set(resolvedUrl, localPath);
       await registerInDB(resolvedUrl, localPath, type, (existing as any).size ?? 0);
      return localPath;
    }

    // First time — download and store permanently
     const result = await FileSystem.downloadAsync(resolvedUrl, localPath);
    const check = await FileSystem.getInfoAsync(result.uri);
    if (!check.exists || (check as any).size === 0) return null;

     _memCache.set(resolvedUrl, result.uri);
     await registerInDB(resolvedUrl, result.uri, type, (check as any).size ?? 0);
    return result.uri;
    } catch {
      return null;
    }
  })();
   _inflight.set(resolvedUrl, promise);
   promise.finally(() => _inflight.delete(resolvedUrl)).catch(() => {});
  return promise;
}

/** Preload a list of image URLs silently in background. */
export function preloadImages(urls: string[], type: "avatar" | "thumb" = "thumb"): void {
  if (Platform.OS === "web") return;
  for (const url of urls) {
    if (!url || _memCache.has(url)) continue;
    downloadAndCache(url, type).catch(() => {});
  }
}

/** User-initiated only — clears ALL downloaded media from device. */
export async function clearMediaCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(getBaseDir(), { idempotent: true });
    _memCache.clear();
    _inflight.clear();
    const db = await getDB();
    await db.runAsync("DELETE FROM media_cache");
  } catch {}
}

/** Returns total count and size of permanently stored media files. */
export async function getMediaCacheStats(): Promise<{ count: number; bytes: number }> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ count: number; bytes: number }>(
      "SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as bytes FROM media_cache",
    );
    return { count: row?.count ?? 0, bytes: row?.bytes ?? 0 };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────────

async function registerInDB(
  url: string,
  localPath: string,
  type: string,
  fileSize = 0,
): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO media_cache
       (url_hash, url, local_path, media_type, file_size, stored_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [urlHash(url), url, localPath, type, fileSize, Date.now()],
    );
  } catch {}
}
