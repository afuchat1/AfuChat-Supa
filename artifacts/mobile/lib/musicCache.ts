import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import type { AfuMusicTrack } from "@/modules/afumusic";

const REGISTRY_KEY = "afumusic:offline-registry:v1";
const MUSIC_DIRECTORY = `${FileSystem.documentDirectory ?? ""}afumusic/`;
const MAX_OFFLINE_TRACKS = 100;
const MAX_OFFLINE_BYTES = 2 * 1024 * 1024 * 1024;

export type OfflineMusicEntry = {
  trackId: string;
  fileUri: string;
  fileSize: number;
  cachedAt: number;
  track: AfuMusicTrack;
};

async function ensureMusicDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error("Private app storage is unavailable.");
  }
  const info = await FileSystem.getInfoAsync(MUSIC_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MUSIC_DIRECTORY, { intermediates: true });
  }
}

async function readRegistry(): Promise<OfflineMusicEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRegistry(entries: OfflineMusicEntry[]) {
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(entries));
}

function extensionFor(track: AfuMusicTrack) {
  const mime = (track.mimeType ?? "").toLowerCase();
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  return "audio";
}

function filenameFor(track: AfuMusicTrack) {
  return `track_${track.id.replace(/[^a-z0-9_-]/gi, "")}.${extensionFor(track)}`;
}

export async function getOfflineMusicEntries(): Promise<OfflineMusicEntry[]> {
  const entries = await readRegistry();
  const valid: OfflineMusicEntry[] = [];
  for (const entry of entries) {
    try {
      const info = await FileSystem.getInfoAsync(entry.fileUri);
      if (info.exists && (info as any).size > 0) valid.push(entry);
    } catch {}
  }
  if (valid.length !== entries.length) await writeRegistry(valid);
  return valid.sort((a, b) => b.cachedAt - a.cachedAt);
}

export async function getOfflineMusicTrackIds(): Promise<string[]> {
  const entries = await getOfflineMusicEntries();
  return entries.map((entry) => entry.trackId);
}

export async function getOfflineMusicUri(trackId: string): Promise<string | null> {
  const entry = (await getOfflineMusicEntries()).find((item) => item.trackId === trackId);
  return entry?.fileUri ?? null;
}

export async function cacheMusicFile(
  track: AfuMusicTrack,
  remoteUri: string,
): Promise<OfflineMusicEntry> {
  if (!remoteUri) throw new Error("The track is not available for offline playback.");
  await ensureMusicDirectory();

  const fileUri = `${MUSIC_DIRECTORY}${filenameFor(track)}`;
  const existing = await FileSystem.getInfoAsync(fileUri);
  let fileSize = (existing as any).size ?? 0;
  if (!existing.exists || fileSize <= 0) {
    const result = await FileSystem.downloadAsync(remoteUri, fileUri);
    const info = await FileSystem.getInfoAsync(result.uri);
    if (!info.exists || !((info as any).size > 0)) {
      throw new Error("The track could not be saved to private storage.");
    }
    fileSize = (info as any).size ?? 0;
  }

  const next: OfflineMusicEntry = {
    trackId: track.id,
    fileUri,
    fileSize,
    cachedAt: Date.now(),
    track: { ...track, audioUrl: fileUri, isCached: true },
  };
  const entries = (await readRegistry()).filter((entry) => entry.trackId !== track.id);
  entries.unshift(next);

  let totalBytes = entries.reduce((sum, entry) => sum + Math.max(0, entry.fileSize || 0), 0);
  while (entries.length > MAX_OFFLINE_TRACKS || totalBytes > MAX_OFFLINE_BYTES) {
    const removed = entries.pop();
    if (!removed) break;
    totalBytes -= Math.max(0, removed.fileSize || 0);
    if (removed.trackId !== track.id) {
      await FileSystem.deleteAsync(removed.fileUri, { idempotent: true }).catch(() => {});
    }
  }
  await writeRegistry(entries);
  return next;
}

export async function removeOfflineMusic(trackId: string): Promise<void> {
  const entries = await readRegistry();
  const removed = entries.find((entry) => entry.trackId === trackId);
  await writeRegistry(entries.filter((entry) => entry.trackId !== trackId));
  if (removed) await FileSystem.deleteAsync(removed.fileUri, { idempotent: true }).catch(() => {});
}

export async function clearOfflineMusic(): Promise<void> {
  const entries = await readRegistry();
  await writeRegistry([]);
  for (const entry of entries) {
    await FileSystem.deleteAsync(entry.fileUri, { idempotent: true }).catch(() => {});
  }
  await FileSystem.deleteAsync(MUSIC_DIRECTORY, { idempotent: true }).catch(() => {});
}