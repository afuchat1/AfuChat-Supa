import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDB } from "./storage/db";

// ─── Explicit offline-video store ───────────────────────────────────────────────
// Viewing a video never downloads it for offline use. Only an explicit user
// save writes media to documentDirectory (Android app-private User data).
//
// RULES:
//   • Network media is streamed; it is not automatically downloaded to disk
//   • Explicitly saved videos survive app restarts and OS cache cleanup
//   • Saved videos are removed only by explicit user action
//   • Refuse new saves at the storage limit rather than deleting older saves
//
// documentDirectory:
//   Android → /data/data/<pkg>/files/
//   iOS     → <app>/Documents/

// ─── Directories ───────────────────────────────────────────────────────────────

// Permanent watched-video store — bounded and user-visible in storage settings.
// FileSystem.documentDirectory is always a non-null string on Android.
const VIDEO_DIR = (FileSystem.documentDirectory ?? "") + "afuchat_videos/";
const VIDEO_STAGING_DIR = (FileSystem.cacheDirectory ?? "") + "afuchat_video_staging/";

const MAX_VIDEO_CACHE_BYTES = 512 * 1024 * 1024;
const MAX_VIDEO_CACHE_ENTRIES = 50;

// ─── Types ─────────────────────────────────────────────────────────────────────

export type OfflineVideoEntry = {
  postId: string;
  url: string;
  fileUri: string;
  fileSize: number;
  cachedAt: number;    // first-download timestamp (stored_at)
  watchedAt?: number;  // last time user watched this video
  title: string;
  thumbnail: string | null;
  // Author info (saved since db v13) — may be undefined for old entries
  authorId?: string;
  authorHandle?: string;
  authorName?: string;
  authorAvatar?: string | null;
};

// ─── In-memory maps ────────────────────────────────────────────────────────────

const memoryMap = new Map<string, string>();      // url → local path
const saveInProgress = new Set<string>();

// ─── Helpers ───────────────────────────────────────────────────────────────────

function urlToFilename(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h) ^ url.charCodeAt(i);
    h = h >>> 0;
  }
  const raw = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "mp4";
  const ext = ["mp4", "mov", "webm", "m4v", "mkv"].includes(raw) ? raw : "mp4";
  return `v_${h.toString(16)}.${ext}`;
}

async function ensureDir(dir: string) {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {}
}

// ─── SQLite registry ───────────────────────────────────────────────────────────

async function dbGetEntry(postId: string): Promise<OfflineVideoEntry | null> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<any>(
      "SELECT * FROM video_registry WHERE post_id = ?",
      [postId],
    );
    if (!row) return null;
    return {
      postId: row.post_id,
      url: row.url,
      fileUri: row.file_uri,
      fileSize: row.file_size,
      cachedAt: row.stored_at,
      title: row.title ?? "",
      thumbnail: row.thumbnail ?? null,
      authorId: row.author_id ?? undefined,
      authorHandle: row.author_handle ?? undefined,
      authorName: row.author_name ?? undefined,
      authorAvatar: row.author_avatar ?? undefined,
    };
  } catch {
    return null;
  }
}

function rowToEntry(row: any): OfflineVideoEntry {
  return {
    postId: row.post_id,
    url: row.url,
    fileUri: row.file_uri,
    fileSize: row.file_size,
    cachedAt: row.stored_at,
    watchedAt: row.watched_at ?? row.stored_at,
    title: row.title ?? "",
    thumbnail: row.thumbnail ?? null,
    authorId: row.author_id ?? undefined,
    authorHandle: row.author_handle ?? undefined,
    authorName: row.author_name ?? undefined,
    authorAvatar: row.author_avatar ?? undefined,
  };
}

async function dbGetAll(): Promise<OfflineVideoEntry[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM video_registry ORDER BY COALESCE(watched_at, stored_at) DESC",
    );
    return rows.map(rowToEntry);
  } catch {
    return [];
  }
}

async function dbGetRecent(sinceMs: number): Promise<OfflineVideoEntry[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM video_registry WHERE COALESCE(watched_at, stored_at) >= ? ORDER BY COALESCE(watched_at, stored_at) DESC",
      [sinceMs],
    );
    return rows.map(rowToEntry);
  } catch {
    return [];
  }
}

async function dbSaveEntry(entry: OfflineVideoEntry): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO video_registry
       (post_id, url, file_uri, file_size, title, thumbnail, stored_at, watched_at,
        author_id, author_handle, author_name, author_avatar)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET
       url           = excluded.url,
       file_uri      = excluded.file_uri,
       file_size     = excluded.file_size,
       title         = excluded.title,
       thumbnail     = excluded.thumbnail,
       watched_at    = excluded.watched_at,
       author_id     = COALESCE(excluded.author_id, author_id),
       author_handle = COALESCE(excluded.author_handle, author_handle),
       author_name   = COALESCE(excluded.author_name, author_name),
       author_avatar = COALESCE(excluded.author_avatar, author_avatar)`,
    [
      entry.postId, entry.url, entry.fileUri, entry.fileSize,
      entry.title, entry.thumbnail, entry.cachedAt || now,
      entry.watchedAt || now,
      entry.authorId ?? null, entry.authorHandle ?? null,
      entry.authorName ?? null, entry.authorAvatar ?? null,
    ],
  );
}

async function dbDeleteEntry(postId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM video_registry WHERE post_id = ?", [postId]);
  } catch {}
}

async function dbDeleteAll(): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM video_registry");
  } catch {}
}

// ─── Playback: get local path or null ──────────────────────────────────────────

/**
 * Returns the local file path for a video URL if it's already on device.
 * Zero network — looks in memory map first, then the video directory.
 * Returns null if the video hasn't been downloaded yet.
 */
export async function getCachedVideoUri(url: string): Promise<string | null> {
  if (!url) return null;

  // 1. Memory map
  if (memoryMap.has(url)) return memoryMap.get(url)!;

  // 2. Check the permanent video directory
  try {
    await ensureDir(VIDEO_DIR);
    const localPath = VIDEO_DIR + urlToFilename(url);
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists && (info as any).size > 0) {
      memoryMap.set(url, localPath);
      return localPath;
    }
  } catch {}

  return null;
}

/** Video prefetch is intentionally disabled; feed videos stream when played. */
export function cacheVideo(_url: string): Promise<string | null> {
  return Promise.resolve(null);
}

// ─── User-controlled offline saves ──────────────────────────────────────────────

/**
 * Save a video only after an explicit user action. Downloads first to the
 * OS-clearable staging directory, then moves it into persistent app storage
 * after it passes the storage limit check and its registry row is committed.
 */
export type SaveOfflineVideoResult =
  | { success: true; alreadySaved: boolean }
  | { success: false; reason: "invalid_video" | "already_saving" | "download_failed" | "storage_limit" | "storage_failed" };

export async function saveVideoForOffline(
  postId: string,
  url: string,
  meta: {
    title: string;
    thumbnail: string | null;
    authorId?: string;
    authorHandle?: string;
    authorName?: string;
    authorAvatar?: string | null;
  },
): Promise<SaveOfflineVideoResult> {
  if (!url || !postId) return { success: false, reason: "invalid_video" };
  if (saveInProgress.has(postId)) return { success: false, reason: "already_saving" };
  saveInProgress.add(postId);

  let stagedPath: string | null = null;
  let movedPath: string | null = null;
  try {
    const oldEntry = await dbGetEntry(postId);
    if (oldEntry?.url === url) {
      const existing = await FileSystem.getInfoAsync(oldEntry.fileUri);
      if (existing.exists && (existing as any).size > 0) {
        await dbSaveEntry({
          ...oldEntry,
          title: meta.title,
          thumbnail: meta.thumbnail,
          authorId: meta.authorId ?? oldEntry.authorId,
          authorHandle: meta.authorHandle ?? oldEntry.authorHandle,
          authorName: meta.authorName ?? oldEntry.authorName,
          authorAvatar: meta.authorAvatar ?? oldEntry.authorAvatar,
          watchedAt: Date.now(),
        });
        memoryMap.set(url, oldEntry.fileUri);
        return { success: true, alreadySaved: true };
      }
    }

    await ensureDir(VIDEO_STAGING_DIR);
    const filename = urlToFilename(url);
    const safePostId = postId.replace(/[^a-zA-Z0-9_-]/g, "_");
    stagedPath = `${VIDEO_STAGING_DIR}${safePostId}_${Date.now()}_${filename}`;
    const result = await FileSystem.downloadAsync(url, stagedPath);
    if (result.status < 200 || result.status >= 400) {
      return { success: false, reason: "download_failed" };
    }
    const info = await FileSystem.getInfoAsync(result.uri);
    if (!info.exists || (info as any).size === 0) {
      return { success: false, reason: "download_failed" };
    }
    const fileSize = (info as any).size ?? 0;

    const entries = await dbGetAll();
    const remaining = entries.filter((entry) => entry.postId !== postId);
    const storedBytes = remaining.reduce((total, entry) => total + Math.max(0, entry.fileSize || 0), 0);
    if (remaining.length >= MAX_VIDEO_CACHE_ENTRIES || storedBytes + fileSize > MAX_VIDEO_CACHE_BYTES) {
      return { success: false, reason: "storage_limit" };
    }

    await ensureDir(VIDEO_DIR);
    const fileUri = VIDEO_DIR + filename;
    const finalExists = await FileSystem.getInfoAsync(fileUri);
    if (finalExists.exists && (finalExists as any).size > 0) {
      await FileSystem.deleteAsync(stagedPath, { idempotent: true });
    } else {
      await FileSystem.moveAsync({ from: stagedPath, to: fileUri });
      movedPath = fileUri;
    }

    const finalInfo = await FileSystem.getInfoAsync(fileUri);
    if (!finalInfo.exists || (finalInfo as any).size === 0) {
      return { success: false, reason: "download_failed" };
    }
    await dbSaveEntry({
      postId, url, fileUri, fileSize: (finalInfo as any).size ?? fileSize,
      cachedAt: Date.now(), watchedAt: Date.now(),
      title: meta.title, thumbnail: meta.thumbnail,
      authorId: meta.authorId,
      authorHandle: meta.authorHandle,
      authorName: meta.authorName,
      authorAvatar: meta.authorAvatar,
    });
    memoryMap.set(url, fileUri);
    if (oldEntry?.fileUri && oldEntry.fileUri !== fileUri) {
      await FileSystem.deleteAsync(oldEntry.fileUri, { idempotent: true }).catch(() => {});
    }
    return { success: true, alreadySaved: false };
  } catch {
    if (movedPath) await FileSystem.deleteAsync(movedPath, { idempotent: true }).catch(() => {});
    return { success: false, reason: "storage_failed" };
  } finally {
    if (stagedPath) await FileSystem.deleteAsync(stagedPath, { idempotent: true }).catch(() => {});
    saveInProgress.delete(postId);
  }
}

/** Watching a saved video updates its timestamp; it never downloads media. */
export async function markVideoWatched(
  postId: string,
  _url: string,
  _meta: {
    title: string;
    thumbnail: string | null;
    authorId?: string;
    authorHandle?: string;
    authorName?: string;
    authorAvatar?: string | null;
  },
): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("UPDATE video_registry SET watched_at = ? WHERE post_id = ?", [Date.now(), postId]);
  } catch {}
}

// ─── Registry queries ──────────────────────────────────────────────────────────

/** Returns all permanently stored videos, ordered by last-watched newest first. */
export async function getOfflineVideos(): Promise<OfflineVideoEntry[]> {
  return dbGetAll();
}

/**
 * Returns videos the user watched within the last `hours` hours (default 24).
 * These are already on-device — no network needed to play them.
 */
export async function getRecentlyWatchedVideos(hours = 24): Promise<OfflineVideoEntry[]> {
  const since = Date.now() - hours * 60 * 60 * 1000;
  return dbGetRecent(since);
}

/** Total size and count of permanently stored videos. */
export async function getOfflineCacheStats(): Promise<{ count: number; bytes: number }> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ count: number; bytes: number }>(
      "SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as bytes FROM video_registry",
    );
    return { count: row?.count ?? 0, bytes: row?.bytes ?? 0 };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

/** User-initiated: delete ALL stored videos from device. */
export async function clearAllOfflineVideos(): Promise<void> {
  const entries = await dbGetAll();
  await dbDeleteAll();
  memoryMap.clear();
  await FileSystem.deleteAsync(VIDEO_DIR, { idempotent: true }).catch(() => {});
  // No-op for any entry whose file doesn't exist
  for (const e of entries) {
    await FileSystem.deleteAsync(e.fileUri, { idempotent: true }).catch(() => {});
  }
}

/** User-initiated: delete a single video by postId. */
export async function removeOfflineVideo(postId: string): Promise<void> {
  const entry = await dbGetEntry(postId);
  if (!entry) return;
  await dbDeleteEntry(postId);
  await FileSystem.deleteAsync(entry.fileUri, { idempotent: true }).catch(() => {});
  for (const [k, v] of memoryMap.entries()) {
    if (v === entry.fileUri) memoryMap.delete(k);
  }
}

// Kept as a compatibility export for older settings screens. Offline saves are
// user data now; they must not be deleted by age or a background maintenance job.
export async function clearExpiredOfflineVideos(): Promise<number> {
  return 0;
}

/** @deprecated Offline videos are removed only by explicit user action. */
export async function runScheduledVideoPurge(): Promise<void> {
}

/** Migrate old AsyncStorage registry entries into SQLite. Safe to call repeatedly. */
export async function migrateOfflineCacheV2toV3(): Promise<void> {
  const KEYS = ["afu_offline_video_registry_v2", "afu_offline_video_registry_v3"];
  for (const key of KEYS) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const entries: OfflineVideoEntry[] = JSON.parse(raw);
      for (const e of entries) {
        // Check if file still exists before migrating
        const info = await FileSystem.getInfoAsync(e.fileUri);
        if (info.exists && (info as any).size > 0) {
          // Move to permanent VIDEO_DIR if not already there
          await ensureDir(VIDEO_DIR);
          const destPath = VIDEO_DIR + urlToFilename(e.url);
          if (e.fileUri !== destPath) {
            try {
              await FileSystem.copyAsync({ from: e.fileUri, to: destPath });
              e.fileUri = destPath;
            } catch {}
          }
          await dbSaveEntry(e);
          memoryMap.set(e.url, e.fileUri);
        }
      }
      await AsyncStorage.removeItem(key);
    } catch {}
  }
}

/** @deprecated Use clearAllOfflineVideos instead */
export async function clearVideoCache(): Promise<void> {
  await clearAllOfflineVideos();
}

export const OFFLINE_TTL_MS_EXPORT = 0;
