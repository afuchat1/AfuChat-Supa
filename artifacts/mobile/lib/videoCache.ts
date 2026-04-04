import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";

const CACHE_DIR = (FileSystem.cacheDirectory ?? "") + "afuchat_videos/";
const MAX_FILES = 60;

const memoryMap = new Map<string, string>();
const inProgress = new Map<string, Promise<string | null>>();

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

async function ensureDir() {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
  } catch (_) {}
}

export async function getCachedVideoUri(url: string): Promise<string | null> {
  if (Platform.OS === "web" || !url) return null;
  if (memoryMap.has(url)) return memoryMap.get(url)!;
  try {
    await ensureDir();
    const localPath = CACHE_DIR + urlToFilename(url);
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists && (info as any).size > 0) {
      memoryMap.set(url, localPath);
      return localPath;
    }
  } catch (_) {}
  return null;
}

export function cacheVideo(url: string): Promise<string | null> {
  if (Platform.OS === "web" || !url) return Promise.resolve(null);
  if (memoryMap.has(url)) return Promise.resolve(memoryMap.get(url)!);
  if (inProgress.has(url)) return inProgress.get(url)!;

  const task = (async (): Promise<string | null> => {
    try {
      await ensureDir();
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
    if (files.length <= MAX_FILES) return;
    const infos = await Promise.all(
      files.map(async (f) => {
        const p = CACHE_DIR + f;
        const i = await FileSystem.getInfoAsync(p);
        return { path: p, mt: (i as any).modificationTime ?? 0 };
      })
    );
    infos.sort((a, b) => a.mt - b.mt);
    const toDelete = infos.slice(0, infos.length - MAX_FILES);
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
