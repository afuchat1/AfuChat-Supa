import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Directories ──────────────────────────────────────────────────────────────

const CACHE_DIR = (FileSystem.cacheDirectory ?? "") + "afuchat_videos/";
const OFFLINE_DIR = (FileSystem.cacheDirectory ?? "") + "afuchat_offline/";

// ─── Offline registry ─────────────────────────────────────────────────────────

const OFFLINE_REGISTRY_KEY = "afu_offline_video_registry_v2";
const OFFLINE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_FILES = 60;

export type OfflineVideoEntry = {
  postId: string;
  url: string;
  fileUri: string;
  fileSize: number;
  cachedAt: number;
  title: string;
  thumbnail: string | null;
};

// ─── In-memory maps ───────────────────────────────────────────────────────────

const memoryMap = new Map<string, string>();
const inProgress = new Map<string, Promise<string | null>>();
const offlineInProgress = new Set<string>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch (_) {}
}

async function readRegistry(): Promise<OfflineVideoEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_REGISTRY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineVideoEntry[];
  } catch {
    return [];
  }
}

async function writeRegistry(entries: OfflineVideoEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OFFLINE_REGISTRY_KEY, JSON.stringify(entries));
  } catch (_) {}
}

// ─── Regular playback cache ───────────────────────────────────────────────────

/**
 * Check if a video URL is already cached locally.
 * Checks both the playback cache dir and the offline cache dir.
 */
export async function getCachedVideoUri(url: string): Promise<string | null> {
  if (Platform.OS === "web" || !url) return null;
  if (memoryMap.has(url)) return memoryMap.get(url)!;
  try {
    await ensureDir(CACHE_DIR);
    const filename = urlToFilename(url);

    // Check regular playback cache first
    const localPath = CACHE_DIR + filename;
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists && (info as any).size > 0) {
      memoryMap.set(url, localPath);
      return localPath;
    }

    // Also check offline dir — a watched video lives there
    const offlinePath = OFFLINE_DIR + filename;
    const offlineInfo = await FileSystem.getInfoAsync(offlinePath);
    if (offlineInfo.exists && (offlineInfo as any).size > 0) {
      memoryMap.set(url, offlinePath);
      return offlinePath;
    }
  } catch (_) {}
  return null;
}

/**
 * Download a video to the local playback cache.
 * Returns immediately if already cached (no re-download).
 */
export function cacheVideo(url: string): Promise<string | null> {
  if (Platform.OS === "web" || !url) return Promise.resolve(null);
  if (memoryMap.has(url)) return Promise.resolve(memoryMap.get(url)!);
  if (inProgress.has(url)) return inProgress.get(url)!;

  const task = (async (): Promise<string | null> => {
    try {
      await ensureDir(CACHE_DIR);
      const localPath = CACHE_DIR + urlToFilename(url);
      const existing = await FileSystem.getInfoAsync(localPath);
      if (existing.exists && (existing as any).size > 0) {
        memoryMap.set(url, localPath);
        return localPath;
      }
      const result = await FileSystem.downloadAsync(url, localPath);
      const check = await FileSystem.getInfoAsync(result.uri);
      if (check.exists && (check as any).size > 0) {
        memoryMap.set(url, result.uri);
        pruneCache().catch(() => {});
        return result.uri;
      }
    } catch (_) {}
    return null;
  })().finally(() => inProgress.delete(url));

  inProgress.set(url, task);
  return task;
}

async function pruneCache() {
  try {
    const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
    if (files.length <= MAX_CACHE_FILES) return;
    const infos = await Promise.all(
      files.map(async (f) => {
        const p = CACHE_DIR + f;
        const i = await FileSystem.getInfoAsync(p);
        return { path: p, mt: (i as any).modificationTime ?? 0 };
      })
    );
    infos.sort((a, b) => a.mt - b.mt);
    const toDelete = infos.slice(0, infos.length - MAX_CACHE_FILES);
    await Promise.all(toDelete.map((f) => FileSystem.deleteAsync(f.path, { idempotent: true })));
    for (const f of toDelete) {
      for (const [k, v] of memoryMap.entries()) {
        if (v === f.path) memoryMap.delete(k);
      }
    }
  } catch (_) {}
}

export async function clearVideoCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    memoryMap.clear();
  } catch (_) {}
}

// ─── Offline cache (auto 24h TTL, TikTok-style) ───────────────────────────────

/**
 * Called automatically when a video starts playing.
 * Saves it to the offline cache and registers it with a 24h expiry.
 * If the video is already cached (playback cache or offline cache) the file
 * is simply registered / expiry refreshed — no extra download.
 */
export async function markVideoWatched(
  postId: string,
  url: string,
  meta: { title: string; thumbnail: string | null },
): Promise<void> {
  if (Platform.OS === "web" || !url || !postId) return;
  if (offlineInProgress.has(postId)) return;
  offlineInProgress.add(postId);

  try {
    const now = Date.now();
    const entries = await readRegistry();
    const existing = entries.find((e) => e.postId === postId);

    if (existing) {
      // Already registered — just refresh the expiry so the 24h resets from now
      await writeRegistry(entries.map((e) =>
        e.postId === postId ? { ...e, cachedAt: now, title: meta.title, thumbnail: meta.thumbnail } : e
      ));
      return;
    }

    await ensureDir(OFFLINE_DIR);
    const filename = urlToFilename(url);
    const offlinePath = OFFLINE_DIR + filename;

    // Check if file already exists in offline dir
    let fileUri = offlinePath;
    let fileSize = 0;
    const existingOffline = await FileSystem.getInfoAsync(offlinePath);
    if (existingOffline.exists && (existingOffline as any).size > 0) {
      fileSize = (existingOffline as any).size ?? 0;
    } else {
      // Try to copy from the regular playback cache (avoids a second download)
      const regularPath = CACHE_DIR + filename;
      const regularFile = await FileSystem.getInfoAsync(regularPath);
      if (regularFile.exists && (regularFile as any).size > 0) {
        await FileSystem.copyAsync({ from: regularPath, to: offlinePath });
        fileSize = (regularFile as any).size ?? 0;
      } else {
        // Download fresh to the offline dir
        const result = await FileSystem.downloadAsync(url, offlinePath);
        const info = await FileSystem.getInfoAsync(result.uri);
        if (!info.exists || (info as any).size === 0) return;
        fileSize = (info as any).size ?? 0;
      }
    }

    memoryMap.set(url, offlinePath);

    const entry: OfflineVideoEntry = {
      postId,
      url,
      fileUri,
      fileSize,
      cachedAt: now,
      title: meta.title,
      thumbnail: meta.thumbnail,
    };

    const fresh = await readRegistry();
    await writeRegistry([entry, ...fresh.filter((e) => e.postId !== postId)]);
  } catch (_) {
  } finally {
    offlineInProgress.delete(postId);
  }
}

/** Returns all non-expired offline videos, newest first. */
export async function getOfflineVideos(): Promise<OfflineVideoEntry[]> {
  if (Platform.OS === "web") return [];
  const now = Date.now();
  const entries = await readRegistry();
  return entries
    .filter((e) => now - e.cachedAt < OFFLINE_TTL_MS)
    .sort((a, b) => b.cachedAt - a.cachedAt);
}

/** Returns total size and count of currently cached offline videos. */
export async function getOfflineCacheStats(): Promise<{ count: number; bytes: number }> {
  const videos = await getOfflineVideos();
  return {
    count: videos.length,
    bytes: videos.reduce((acc, v) => acc + v.fileSize, 0),
  };
}

/**
 * Deletes expired offline entries and their files.
 * Should be called once at app startup.
 * Returns the number of entries cleaned up.
 */
export async function clearExpiredOfflineVideos(): Promise<number> {
  if (Platform.OS === "web") return 0;
  const now = Date.now();
  const entries = await readRegistry();
  const valid: OfflineVideoEntry[] = [];
  const expired: OfflineVideoEntry[] = [];

  for (const e of entries) {
    if (now - e.cachedAt < OFFLINE_TTL_MS) {
      valid.push(e);
    } else {
      expired.push(e);
    }
  }

  if (expired.length === 0) return 0;

  await writeRegistry(valid);
  await Promise.all(
    expired.map((e) => FileSystem.deleteAsync(e.fileUri, { idempotent: true }).catch(() => {}))
  );
  for (const e of expired) {
    for (const [k, v] of memoryMap.entries()) {
      if (v === e.fileUri) memoryMap.delete(k);
    }
  }
  return expired.length;
}

/** Clears all offline videos immediately (user-initiated). */
export async function clearAllOfflineVideos(): Promise<void> {
  if (Platform.OS === "web") return;
  const entries = await readRegistry();
  await writeRegistry([]);
  await Promise.all(
    entries.map((e) => FileSystem.deleteAsync(e.fileUri, { idempotent: true }).catch(() => {}))
  );
  try {
    await FileSystem.deleteAsync(OFFLINE_DIR, { idempotent: true });
  } catch (_) {}
  for (const e of entries) {
    for (const [k, v] of memoryMap.entries()) {
      if (v === e.fileUri) memoryMap.delete(k);
    }
  }
}

/** Removes a single offline video by postId. */
export async function removeOfflineVideo(postId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const entries = await readRegistry();
  const entry = entries.find((e) => e.postId === postId);
  if (!entry) return;
  await writeRegistry(entries.filter((e) => e.postId !== postId));
  await FileSystem.deleteAsync(entry.fileUri, { idempotent: true }).catch(() => {});
  for (const [k, v] of memoryMap.entries()) {
    if (v === entry.fileUri) memoryMap.delete(k);
  }
}

export const OFFLINE_TTL_MS_EXPORT = OFFLINE_TTL_MS;
