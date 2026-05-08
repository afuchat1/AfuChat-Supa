import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDB } from "./storage/db";

// ─── Permanent Video Store ──────────────────────────────────────────────────────
// Videos are stored in documentDirectory once watched — permanently.
// The OS never auto-clears documentDirectory (unlike cacheDirectory).
// Data is only removed when the user explicitly clears storage, or uninstalls.
//
// RULES:
//   • No TTL — watched videos stay forever
//   • No auto-prune — grows until user clears it
//   • getCachedVideoUri() returns local path instantly if already on device
//   • markVideoWatched() is idempotent — calling it twice does nothing extra
//
// documentDirectory:
//   Android → /data/data/<pkg>/files/
//   iOS     → <app>/Documents/

// ─── Directories ───────────────────────────────────────────────────────────────

// Permanent watched-video store — survives cache pressure, lives until user deletes
const VIDEO_DIR = (FileSystem.documentDirectory ?? "") + "afuchat_videos/";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type OfflineVideoEntry = {
  postId: string;
  url: string;
  fileUri: string;
  fileSize: number;
  cachedAt: number; // kept for compat — now means "storedAt"
  title: string;
  thumbnail: string | null;
};

// ─── In-memory maps ────────────────────────────────────────────────────────────

const memoryMap = new Map<string, string>();      // url → local path
const inProgress = new Map<string, Promise<string | null>>();
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
    };
  } catch {
    return null;
  }
}

async function dbGetAll(): Promise<OfflineVideoEntry[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM video_registry ORDER BY stored_at DESC",
    );
    return rows.map((row) => ({
      postId: row.post_id,
      url: row.url,
      fileUri: row.file_uri,
      fileSize: row.file_size,
      cachedAt: row.stored_at,
      title: row.title ?? "",
      thumbnail: row.thumbnail ?? null,
    }));
  } catch {
    return [];
  }
}

async function dbSaveEntry(entry: OfflineVideoEntry): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO video_registry
       (post_id, url, file_uri, file_size, title, thumbnail, stored_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.postId, entry.url, entry.fileUri, entry.fileSize,
        entry.title, entry.thumbnail, Date.now(),
      ],
    );
  } catch {}
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
  if (Platform.OS === "web" || !url) return null;

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

/**
 * Pre-fetch a video to local storage (e.g. for the next video in the feed).
 * Returns immediately if already on device — no duplicate download.
 */
export function cacheVideo(url: string): Promise<string | null> {
  if (Platform.OS === "web" || !url) return Promise.resolve(null);
  if (memoryMap.has(url)) return Promise.resolve(memoryMap.get(url)!);
  if (inProgress.has(url)) return inProgress.get(url)!;

  const task = (async (): Promise<string | null> => {
    try {
      await ensureDir(VIDEO_DIR);
      const localPath = VIDEO_DIR + urlToFilename(url);
      const existing = await FileSystem.getInfoAsync(localPath);
      if (existing.exists && (existing as any).size > 0) {
        memoryMap.set(url, localPath);
        return localPath;
      }
      const result = await FileSystem.downloadAsync(url, localPath);
      const check = await FileSystem.getInfoAsync(result.uri);
      if (check.exists && (check as any).size > 0) {
        memoryMap.set(url, result.uri);
        return result.uri;
      }
    } catch {}
    return null;
  })().finally(() => inProgress.delete(url));

  inProgress.set(url, task);
  return task;
}

// ─── Watch → Permanent Store ───────────────────────────────────────────────────

/**
 * Called when a user watches a video. Saves it permanently to device storage.
 * Idempotent — if already stored, updates metadata only (no extra download).
 * The video is NEVER re-downloaded if already on device.
 */
export async function markVideoWatched(
  postId: string,
  url: string,
  meta: { title: string; thumbnail: string | null },
): Promise<void> {
  if (Platform.OS === "web" || !url || !postId) return;
  if (saveInProgress.has(postId)) return;
  saveInProgress.add(postId);

  try {
    await ensureDir(VIDEO_DIR);
    const filename = urlToFilename(url);
    const localPath = VIDEO_DIR + filename;

    // Check if already on device (in video dir)
    const existing = await FileSystem.getInfoAsync(localPath);
    if (existing.exists && (existing as any).size > 0) {
      // Already stored — just update metadata in registry, no download
      memoryMap.set(url, localPath);
      await dbSaveEntry({
        postId, url, fileUri: localPath,
        fileSize: (existing as any).size ?? 0,
        cachedAt: Date.now(),
        title: meta.title,
        thumbnail: meta.thumbnail,
      });
      return;
    }

    // Not yet on device — if a download is in progress, reuse it
    let fileUri = localPath;
    let fileSize = 0;

    if (inProgress.has(url)) {
      const result = await inProgress.get(url)!;
      if (result) {
        // Copy from wherever it landed to our permanent path (if different)
        if (result !== localPath) {
          try {
            await FileSystem.copyAsync({ from: result, to: localPath });
            const info = await FileSystem.getInfoAsync(localPath);
            fileSize = (info as any).size ?? 0;
          } catch {
            fileUri = result;
            const info = await FileSystem.getInfoAsync(result);
            fileSize = (info as any).size ?? 0;
          }
        } else {
          const info = await FileSystem.getInfoAsync(result);
          fileSize = (info as any).size ?? 0;
        }
      }
    }

    if (fileSize === 0) {
      // Download fresh directly to permanent location
      const result = await FileSystem.downloadAsync(url, localPath);
      const info = await FileSystem.getInfoAsync(result.uri);
      if (!info.exists || (info as any).size === 0) return;
      fileUri = result.uri;
      fileSize = (info as any).size ?? 0;
    }

    memoryMap.set(url, fileUri);
    await dbSaveEntry({
      postId, url, fileUri, fileSize,
      cachedAt: Date.now(), title: meta.title, thumbnail: meta.thumbnail,
    });
  } catch {
  } finally {
    saveInProgress.delete(postId);
  }
}

// ─── Registry queries ──────────────────────────────────────────────────────────

/** Returns all permanently stored videos, newest first. No TTL filtering. */
export async function getOfflineVideos(): Promise<OfflineVideoEntry[]> {
  if (Platform.OS === "web") return [];
  return dbGetAll();
}

/** Total size and count of permanently stored videos. */
export async function getOfflineCacheStats(): Promise<{ count: number; bytes: number }> {
  if (Platform.OS === "web") return { count: 0, bytes: 0 };
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
  if (Platform.OS === "web") return;
  const entries = await dbGetAll();
  await dbDeleteAll();
  memoryMap.clear();
  await FileSystem.deleteAsync(VIDEO_DIR, { idempotent: true }).catch(() => {});
  // Also clear any in-progress downloads
  inProgress.clear();
  // No-op for any entry whose file doesn't exist
  for (const e of entries) {
    await FileSystem.deleteAsync(e.fileUri, { idempotent: true }).catch(() => {});
  }
}

/** User-initiated: delete a single video by postId. */
export async function removeOfflineVideo(postId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const entry = await dbGetEntry(postId);
  if (!entry) return;
  await dbDeleteEntry(postId);
  await FileSystem.deleteAsync(entry.fileUri, { idempotent: true }).catch(() => {});
  for (const [k, v] of memoryMap.entries()) {
    if (v === entry.fileUri) memoryMap.delete(k);
  }
}

// ─── Legacy compat / migration helpers ─────────────────────────────────────────

/** No-op — kept so callers don't break. TTL is gone; nothing expires. */
export async function clearExpiredOfflineVideos(): Promise<number> {
  return 0;
}

/** Migrate old AsyncStorage registry entries into SQLite. Safe to call repeatedly. */
export async function migrateOfflineCacheV2toV3(): Promise<void> {
  if (Platform.OS === "web") return;
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

export const OFFLINE_TTL_MS_EXPORT = 0; // TTL removed — kept for import compat
