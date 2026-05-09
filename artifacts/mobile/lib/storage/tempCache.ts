// ─── Temporary Cache Manager ────────────────────────────────────────────────
// Uses FileSystem.cacheDirectory — the OS CAN clear this under storage pressure.
// Android classifies this as "Cache" (not "User data").
//
// USE THIS FOR:
//   • Upload staging files (compressed images waiting to be uploaded)
//   • Feed image preloads / prefetch
//   • Video thumbnails / preview frames
//   • Any file that can be recreated from the network
//
// NEVER USE THIS FOR:
//   • Chat attachments (use chatAttachmentCache.ts → documentDirectory)
//   • Videos the user has watched (use videoCache.ts → documentDirectory)
//   • Avatars / profile photos (use mediaCache.ts → documentDirectory)
//
// AUTO-CLEANUP:
//   • Files older than 7 days are deleted on app startup and periodically
//   • Total cache is capped at CACHE_SIZE_LIMIT_BYTES
//
// FILE NAMING: deterministic hash → img_<hash>.webp  vid_<hash>.mp4
// so re-requesting the same URL returns the cached file instantly.

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";

// ─── Config ────────────────────────────────────────────────────────────────

const TEMP_DIR = ((FileSystem as any).cacheDirectory ?? "") + "afuchat_temp/";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_SIZE_LIMIT_BYTES = 200 * 1024 * 1024; // 200 MB

// ─── In-memory path map for the current session ────────────────────────────
const _mem = new Map<string, string>(); // key → local path

// ─── Helpers ───────────────────────────────────────────────────────────────

function djb2Hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}

async function ensureDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(TEMP_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(TEMP_DIR, { intermediates: true });
    }
  } catch {}
}

function guessExt(url: string, fallback = "bin"): string {
  const path = url.split("?")[0];
  const raw = path.split(".").pop()?.toLowerCase() ?? "";
  const known = ["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "m4a", "mp3", "webm", "pdf", "zip"];
  return known.includes(raw) ? raw : fallback;
}

function prefixForExt(ext: string): string {
  if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) return "img";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "vid";
  if (["m4a", "mp3", "aac", "wav", "ogg", "opus"].includes(ext)) return "aud";
  return "tmp";
}

// ─── Core API ──────────────────────────────────────────────────────────────

/**
 * Returns the deterministic file path in cacheDirectory for a given key
 * (URL or any stable string) and extension. Does NOT create the file.
 */
export function getTempFilePath(key: string, ext: string): string {
  const hash = djb2Hash(key);
  const prefix = prefixForExt(ext);
  return TEMP_DIR + `${prefix}_${hash}.${ext}`;
}

/**
 * Get the cached local path for a URL if it already exists on disk.
 * Returns null if the file doesn't exist yet.
 */
export async function getTempCachedUri(url: string): Promise<string | null> {
  if (Platform.OS === "web" || !url) return null;

  // 1. Memory map (fastest)
  if (_mem.has(url)) {
    const p = _mem.get(url)!;
    try {
      const info = await FileSystem.getInfoAsync(p);
      if (info.exists && (info as any).size > 0) return p;
    } catch {}
    _mem.delete(url);
  }

  // 2. Check expected disk path
  const ext = guessExt(url);
  const localPath = getTempFilePath(url, ext);
  try {
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists && (info as any).size > 0) {
      _mem.set(url, localPath);
      return localPath;
    }
  } catch {}

  return null;
}

/**
 * Download a URL into cacheDirectory (temp). Returns local path on success.
 * - Already cached → returns path instantly (no network).
 * - Deduplicates concurrent requests for the same URL.
 */
const _inFlight = new Map<string, Promise<string | null>>();

export function downloadToTemp(url: string, extHint?: string): Promise<string | null> {
  if (Platform.OS === "web" || !url) return Promise.resolve(null);

  const cached = _mem.get(url);
  if (cached) return Promise.resolve(cached);
  if (_inFlight.has(url)) return _inFlight.get(url)!;

  const task = (async (): Promise<string | null> => {
    try {
      await ensureDir();
      const ext = extHint ?? guessExt(url);
      const localPath = getTempFilePath(url, ext);

      const existing = await FileSystem.getInfoAsync(localPath);
      if (existing.exists && (existing as any).size > 0) {
        _mem.set(url, localPath);
        return localPath;
      }

      const result = await FileSystem.downloadAsync(url, localPath);
      const check = await FileSystem.getInfoAsync(result.uri);
      if (!check.exists || (check as any).size === 0) return null;

      _mem.set(url, result.uri);
      return result.uri;
    } catch {
      return null;
    }
  })().finally(() => _inFlight.delete(url));

  _inFlight.set(url, task);
  return task;
}

/**
 * Write a local Buffer/blob/file into cacheDirectory under a stable key.
 * Used for compressed upload staging files.
 * Returns the local path on success, null on failure.
 */
export async function writeTempFile(
  sourceUri: string,
  key: string,
  ext: string,
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    await ensureDir();
    const destPath = getTempFilePath(key, ext);
    // If already there (idempotent), return immediately
    const existing = await FileSystem.getInfoAsync(destPath);
    if (existing.exists && (existing as any).size > 0) return destPath;
    await FileSystem.copyAsync({ from: sourceUri, to: destPath });
    const check = await FileSystem.getInfoAsync(destPath);
    if (!check.exists || (check as any).size === 0) return null;
    _mem.set(key, destPath);
    return destPath;
  } catch {
    return null;
  }
}

// ─── Prefetch API (fire-and-forget background downloads) ───────────────────

/**
 * Prefetch a list of URLs into cacheDirectory in the background.
 * Used for feed image preloading (thumbnails, post images).
 * Safe to call repeatedly — already-cached URLs are skipped.
 */
export function prefetchUrls(urls: string[], extHint?: string): void {
  if (Platform.OS === "web") return;
  for (const url of urls) {
    if (!url || _mem.has(url)) continue;
    downloadToTemp(url, extHint).catch(() => {});
  }
}

// ─── Cache Stats ───────────────────────────────────────────────────────────

export type TempCacheStats = {
  bytes: number;
  count: number;
  oldFileCount: number; // files older than MAX_AGE_MS
};

export async function getTempCacheStats(): Promise<TempCacheStats> {
  if (Platform.OS === "web") return { bytes: 0, count: 0, oldFileCount: 0 };
  try {
    await ensureDir();
    const now = Date.now();
    const items = await FileSystem.readDirectoryAsync(TEMP_DIR);
    let bytes = 0;
    let count = 0;
    let oldFileCount = 0;

    for (const name of items) {
      try {
        const info = await FileSystem.getInfoAsync(TEMP_DIR + name, { md5: false });
        if (!info.exists) continue;
        const size = (info as any).size ?? 0;
        const mtime: number = (info as any).modificationTime
          ? (info as any).modificationTime * 1000
          : 0;
        bytes += size;
        count += 1;
        if (mtime > 0 && now - mtime > MAX_AGE_MS) oldFileCount += 1;
      } catch {}
    }

    return { bytes, count, oldFileCount };
  } catch {
    return { bytes: 0, count: 0, oldFileCount: 0 };
  }
}

// ─── Cleanup ───────────────────────────────────────────────────────────────

/**
 * Delete all temp files older than MAX_AGE_MS (7 days).
 * Also enforces CACHE_SIZE_LIMIT_BYTES — deletes oldest files if over limit.
 * Safe to call on every app start; runs silently in the background.
 * Returns the number of files deleted.
 */
export async function cleanupTempCache(): Promise<number> {
  if (Platform.OS === "web") return 0;
  try {
    await ensureDir();
    const now = Date.now();
    const items = await FileSystem.readDirectoryAsync(TEMP_DIR);

    type FileEntry = { name: string; path: string; size: number; mtime: number };
    const entries: FileEntry[] = [];

    for (const name of items) {
      try {
        const path = TEMP_DIR + name;
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) continue;
        const size = (info as any).size ?? 0;
        const mtime: number = (info as any).modificationTime
          ? (info as any).modificationTime * 1000
          : 0;
        entries.push({ name, path, size, mtime });
      } catch {}
    }

    let deleted = 0;

    // Phase 1: Delete files older than 7 days
    for (const e of entries) {
      if (e.mtime > 0 && now - e.mtime > MAX_AGE_MS) {
        try {
          await FileSystem.deleteAsync(e.path, { idempotent: true });
          _mem.delete(e.path);
          deleted++;
        } catch {}
      }
    }

    // Phase 2: Enforce size cap — remove oldest first until under limit
    const remaining = entries.filter(
      (e) => !(e.mtime > 0 && now - e.mtime > MAX_AGE_MS),
    );
    const totalBytes = remaining.reduce((s, e) => s + e.size, 0);

    if (totalBytes > CACHE_SIZE_LIMIT_BYTES) {
      // Sort oldest first
      remaining.sort((a, b) => a.mtime - b.mtime);
      let runningBytes = totalBytes;
      for (const e of remaining) {
        if (runningBytes <= CACHE_SIZE_LIMIT_BYTES) break;
        try {
          await FileSystem.deleteAsync(e.path, { idempotent: true });
          _mem.delete(e.path);
          runningBytes -= e.size;
          deleted++;
        } catch {}
      }
    }

    return deleted;
  } catch {
    return 0;
  }
}

/**
 * User-initiated: clear the entire temp cache.
 * Safe — only deletes cacheDirectory files, never documentDirectory.
 */
export async function clearTempCache(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await FileSystem.deleteAsync(TEMP_DIR, { idempotent: true });
    _mem.clear();
  } catch {}
}

// ─── Directory path export (for external tooling) ──────────────────────────
export const TEMP_CACHE_DIR = TEMP_DIR;
