// ─── Smart Media Cache ─────────────────────────────────────────────────────────
// Thumbnails, avatars, and story previews are cached on-device so they never
// need to be re-downloaded. Exactly how Instagram/TikTok avoid re-fetching
// the same profile picture on every scroll.

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { getDB } from "./db";

const THUMB_DIR = (FileSystem.cacheDirectory ?? "") + "afuchat_thumbs/";
const AVATAR_DIR = (FileSystem.cacheDirectory ?? "") + "afuchat_avatars/";
const MAX_CACHE_ENTRIES = 500;
const CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

// In-memory hot cache for the current session
const _memCache = new Map<string, string>();

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
 * Get a local URI for a remote image URL.
 * Returns the local file URI if cached, otherwise starts a background
 * download and returns the original URL (so nothing blocks rendering).
 */
export async function getCachedImageUri(
  url: string,
  type: "avatar" | "thumb" = "thumb",
): Promise<string> {
  if (Platform.OS === "web" || !url || !url.startsWith("http")) return url;

  // 1. Hot memory cache — zero I/O
  if (_memCache.has(url)) return _memCache.get(url)!;

  // 2. SQLite registry
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ local_path: string; cached_at: number }>(
      "SELECT local_path, cached_at FROM media_cache WHERE url_hash = ?",
      [urlHash(url)],
    );
    if (row) {
      const info = await FileSystem.getInfoAsync(row.local_path);
      if (info.exists && (info as any).size > 0) {
        _memCache.set(url, row.local_path);
        return row.local_path;
      }
    }
  } catch {}

  // 3. Start background download — return original URL immediately so UI renders
  downloadAndCache(url, type).catch(() => {});
  return url;
}

/** Force-download and cache a URL. Resolves with local path or null. */
export async function downloadAndCache(
  url: string,
  type: "avatar" | "thumb" = "thumb",
): Promise<string | null> {
  if (Platform.OS === "web" || !url || !url.startsWith("http")) return null;
  if (_memCache.has(url)) return _memCache.get(url)!;

  try {
    const dir = type === "avatar" ? AVATAR_DIR : THUMB_DIR;
    await ensureDir(dir);
    const localPath = urlToFilename(url, dir);

    const existing = await FileSystem.getInfoAsync(localPath);
    if (existing.exists && (existing as any).size > 0) {
      _memCache.set(url, localPath);
      await registerInDB(url, localPath, type);
      return localPath;
    }

    const result = await FileSystem.downloadAsync(url, localPath);
    const check = await FileSystem.getInfoAsync(result.uri);
    if (!check.exists || (check as any).size === 0) return null;

    _memCache.set(url, result.uri);
    await registerInDB(url, result.uri, type, (check as any).size ?? 0);

    // Background prune — don't await
    pruneMediaCache().catch(() => {});
    return result.uri;
  } catch {
    return null;
  }
}

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
       (url_hash, url, local_path, media_type, file_size, cached_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [urlHash(url), url, localPath, type, fileSize, Date.now()],
    );
  } catch {}
}

/** Preload a list of image URLs in the background (no-op on web) */
export function preloadImages(urls: string[], type: "avatar" | "thumb" = "thumb"): void {
  if (Platform.OS === "web") return;
  for (const url of urls) {
    if (!url || _memCache.has(url)) continue;
    downloadAndCache(url, type).catch(() => {});
  }
}

/** Clear all cached media */
export async function clearMediaCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(THUMB_DIR, { idempotent: true });
    await FileSystem.deleteAsync(AVATAR_DIR, { idempotent: true });
    _memCache.clear();
    const db = await getDB();
    await db.runAsync("DELETE FROM media_cache");
  } catch {}
}

/** Get total number of cached media files and approximate size */
export async function getMediaCacheStats(): Promise<{ count: number; bytes: number }> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ count: number; bytes: number }>(
      "SELECT COUNT(*) as count, SUM(file_size) as bytes FROM media_cache",
    );
    return { count: row?.count ?? 0, bytes: row?.bytes ?? 0 };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

async function pruneMediaCache(): Promise<void> {
  try {
    const db = await getDB();
    // Expire TTL
    const expiry = Date.now() - CACHE_TTL_MS;
    const expired = await db.getAllAsync<{ local_path: string }>(
      "SELECT local_path FROM media_cache WHERE cached_at < ?",
      [expiry],
    );
    await db.runAsync("DELETE FROM media_cache WHERE cached_at < ?", [expiry]);
    for (const f of expired) {
      await FileSystem.deleteAsync(f.local_path, { idempotent: true }).catch(() => {});
    }

    // Trim to MAX
    const count = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM media_cache",
    );
    if ((count?.c ?? 0) > MAX_CACHE_ENTRIES) {
      const toDelete = await db.getAllAsync<{ url_hash: string; local_path: string }>(
        `SELECT url_hash, local_path FROM media_cache ORDER BY cached_at ASC LIMIT ?`,
        [(count?.c ?? 0) - MAX_CACHE_ENTRIES],
      );
      for (const f of toDelete) {
        await FileSystem.deleteAsync(f.local_path, { idempotent: true }).catch(() => {});
        await db.runAsync("DELETE FROM media_cache WHERE url_hash = ?", [f.url_hash]);
      }
    }
  } catch {}
}
