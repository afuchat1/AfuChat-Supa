import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import type { AfuMusicTrack } from "@/modules/afumusic";
import { cacheMusicFile, getOfflineMusicEntries, getOfflineMusicUri } from "./musicCache";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";

const MUSIC_BUCKET = "music";
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/ogg", "audio/aac"]);

type MusicRow = {
  id: string;
  creator_id: string;
  title: string;
  genre: string;
  price_acoin: number;
  storage_path: string;
  mime_type: string;
  file_size: number;
  duration_seconds: number | null;
  play_count: number;
  created_at: string;
  creator?: { display_name?: string | null; handle?: string | null } | null;
};

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return undefined;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function colorsFor(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  const palettes = [
    ["#252143", "#F7BB75"],
    ["#E85949", "#19172F"],
    ["#25356D", "#E9C35B"],
    ["#6D7B77", "#F7E6C1"],
    ["#5A2C62", "#F06451"],
  ];
  return palettes[hash % palettes.length];
}

function rowToTrack(
  row: MusicRow,
  ownedIds: Set<string>,
  cachedIds: Set<string>,
  currentUserId?: string,
): AfuMusicTrack {
  const [coverColor, accentColor] = colorsFor(row.id);
  const artist = row.creator?.display_name?.trim() || row.creator?.handle?.trim() || "AfuMusic creator";
  const handle = row.creator?.handle ? `@${row.creator.handle.replace(/^@/, "")}` : undefined;
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    artist,
    handle,
    genre: row.genre,
    duration: formatDuration(row.duration_seconds),
    plays: row.play_count ?? 0,
    price: Math.max(0, row.price_acoin ?? 0),
    isOwned: ownedIds.has(row.id) || row.creator_id === currentUserId,
    isCached: cachedIds.has(row.id),
    coverColor,
    accentColor,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
  };
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in to use AfuMusic.");
  return data.user.id;
}

async function loadTracks(query?: string): Promise<AfuMusicTrack[]> {
  const userId = await currentUserId();
  let request = supabase
    .from("music_tracks")
    .select("id,creator_id,title,genre,price_acoin,storage_path,mime_type,file_size,duration_seconds,play_count,created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(100);
  if (query?.trim()) {
    const escaped = query.trim().replace(/[%_,]/g, "");
    if (escaped) request = request.or(`title.ilike.%${escaped}%,genre.ilike.%${escaped}%`);
  }
  const [{ data: rows, error }, { data: purchases }, { data: profiles }, offline] = await Promise.all([
    request,
    supabase.from("music_purchases").select("track_id").eq("buyer_id", userId),
    supabase.from("profiles").select("id,display_name,handle").limit(1000),
    getOfflineMusicEntries(),
  ]);
  if (error) throw error;

  const purchased = new Set((purchases ?? []).map((item: any) => item.track_id));
  const cached = new Set(offline.map((entry) => entry.trackId));
  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  return ((rows ?? []) as MusicRow[]).map((row) => rowToTrack({
    ...row,
    creator: profileMap.get(row.creator_id),
  }, purchased, cached, userId));
}

export async function listMusicTracks() {
  return loadTracks();
}

export async function searchMusicTracks(query: string) {
  return loadTracks(query);
}

export async function purchaseMusicTrack(trackId: string) {
  const { error } = await supabase.rpc("purchase_music_track", { p_track_id: trackId });
  if (error) throw error;
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Your session expired. Please sign in again.");
  return data.session.access_token;
}

export async function getMusicPlaybackUri(track: AfuMusicTrack): Promise<string | null> {
  const cached = await getOfflineMusicUri(track.id);
  if (cached) return cached;
  if (track.audioUrl?.startsWith("file://")) return track.audioUrl;
  if (!track.storagePath) return track.audioUrl ?? null;
  const { data, error } = await supabase.storage.from(MUSIC_BUCKET).createSignedUrl(track.storagePath, 60 * 60);
  if (error || !data?.signedUrl) throw error ?? new Error("This track is not available for playback.");
  return data.signedUrl;
}

export async function cacheMusicTrackOffline(track: AfuMusicTrack) {
  const remoteUri = await getMusicPlaybackUri({ ...track, audioUrl: undefined });
  if (!remoteUri) throw new Error("This track is not available for offline playback.");
  await cacheMusicFile(track, remoteUri);
}

function audioExtension(name: string, mimeType: string) {
  const fromName = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName && ["mp3", "m4a", "wav", "ogg", "aac"].includes(fromName)) return fromName;
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "audio";
}

async function uploadPrivateAudio(fileUri: string, path: string, mimeType: string) {
  const token = await accessToken();
  const endpoint = `${supabaseUrl}/storage/v1/object/${MUSIC_BUCKET}/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: supabaseAnonKey,
    "Content-Type": mimeType,
    "x-upsert": "false",
  };

  if (Platform.OS === "web") {
    const response = await fetch(fileUri);
    const body = await response.blob();
    const uploadResponse = await fetch(endpoint, { method: "POST", headers, body });
    if (!uploadResponse.ok) throw new Error("Audio upload failed.");
    return;
  }

  const result = await FileSystem.uploadAsync(endpoint, fileUri, {
    httpMethod: "POST",
    headers,
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });
  if (result.status < 200 || result.status >= 300) throw new Error("Audio upload failed.");
}

export async function publishMusicTrack(input: {
  title: string;
  genre: string;
  price: number;
  fileUri: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
}) {
  const creatorId = await currentUserId();
  const mimeType = input.mimeType || "audio/mpeg";
  if (!AUDIO_TYPES.has(mimeType)) throw new Error("Use an MP3, M4A, WAV, OGG, or AAC audio file.");
  if (!Number.isFinite(input.price) || input.price < 0 || input.price > 100000) {
    throw new Error("Choose a price from 0 to 100,000 ACoin.");
  }
  const info = await FileSystem.getInfoAsync(input.fileUri).catch(() => ({ exists: true, size: input.fileSize ?? 0 } as any));
  const fileSize = Number((info as any).size ?? input.fileSize ?? 0);
  if (fileSize > MAX_AUDIO_BYTES) throw new Error("Audio files must be 100 MB or smaller.");

  const extension = audioExtension(input.fileName, mimeType);
  const uniquePart = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const path = `${creatorId}/${uniquePart}.${extension}`;
  await uploadPrivateAudio(input.fileUri, path, mimeType);
  const { data, error } = await supabase.from("music_tracks").insert({
    creator_id: creatorId,
    title: input.title.trim(),
    genre: input.genre,
    price_acoin: Math.floor(input.price),
    storage_path: path,
    mime_type: mimeType,
    file_size: fileSize,
  }).select("id,creator_id,title,genre,price_acoin,storage_path,mime_type,file_size,duration_seconds,play_count,created_at").single();
  if (error) {
    await supabase.storage.from(MUSIC_BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return rowToTrack(data as MusicRow, new Set([data.id]), new Set(), creatorId);
}

export async function removeMusicTrack(track: AfuMusicTrack) {
  const { error } = await supabase
    .from("music_tracks")
    .update({ status: "removed" })
    .eq("id", track.id)
    .eq("creator_id", await currentUserId());
  if (error) throw error;
}