import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import type { AfuMusicTrack } from "@/modules/afumusic";

const REGISTRY_KEY_PREFIX = "afumusic:offline-registry:v2:";
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

function registryKey(ownerId: string) {
  return `${REGISTRY_KEY_PREFIX}${ownerId}`;
}

function accountDirectory(ownerId: string) {
  return `${MUSIC_DIRECTORY}${ownerId.replace(/[^a-z0-9_-]/gi, "")}/`;
}

async function readRegistry(ownerId: string): Promise<OfflineMusicEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(registryKey(ownerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRegistry(ownerId: string, entries: OfflineMusicEntry[]) {
  await AsyncStorage.setItem(registryKey(ownerId), JSON.stringify(entries));
}

export async function getOfflineMusicEntries(ownerId: string): Promise<OfflineMusicEntry[]> {
  if (Platform.OS === "web") return [];
  const entries = await readRegistry(ownerId);
  const valid: OfflineMusicEntry[] = [];
  for (const entry of entries) {
    try {
      const info = await FileSystem.getInfoAsync(entry.fileUri);
      if (info.exists && (info as any).size > 0) valid.push(entry);
    } catch {}
  }
  if (valid.length !== entries.length) await writeRegistry(ownerId, valid);
  return valid.sort((a, b) => b.cachedAt - a.cachedAt);
}

export async function getOfflineMusicTrackIds(ownerId: string): Promise<string[]> {
  const entries = await getOfflineMusicEntries(ownerId);
  return entries.map((entry) => entry.trackId);
}

export async function getOfflineMusicUri(ownerId: string, trackId: string): Promise<string | null> {
  const entry = (await getOfflineMusicEntries(ownerId)).find((item) => item.trackId === trackId);
  return entry?.fileUri ?? null;
}

export async function cacheMusicFile(
  ownerId: string,
  track: AfuMusicTrack,
  remoteUri: string,
): Promise<OfflineMusicEntry> {
  if (!remoteUri) throw new Error("The track is not available for offline playback.");
  if (Platform.OS === "web") {
    throw new Error("Offline music is available in the mobile app.");
  }
  await ensureMusicDirectory();

  const directory = accountDirectory(ownerId);
  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
  const fileUri = `${directory}${filenameFor(track)}`;
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
  const entries = (await readRegistry(ownerId)).filter((entry) => entry.trackId !== track.id);
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
  await writeRegistry(ownerId, entries);
  return next;
}

export async function removeOfflineMusic(ownerId: string, trackId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const entries = await readRegistry(ownerId);
  const removed = entries.find((entry) => entry.trackId === trackId);
  await writeRegistry(ownerId, entries.filter((entry) => entry.trackId !== trackId));
  if (removed) await FileSystem.deleteAsync(removed.fileUri, { idempotent: true }).catch(() => {});
}

export async function clearOfflineMusic(ownerId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const entries = await readRegistry(ownerId);
  await writeRegistry(ownerId, []);
  for (const entry of entries) {
    await FileSystem.deleteAsync(entry.fileUri, { idempotent: true }).catch(() => {});
  }
  await FileSystem.deleteAsync(accountDirectory(ownerId), { idempotent: true }).catch(() => {});
}