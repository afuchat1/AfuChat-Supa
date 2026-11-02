import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import type { AfuMusicTrack } from "@/modules/afumusic";
import { cacheMusicFile, getOfflineMusicEntries, getOfflineMusicUri } from "./musicCache";
import { deleteUserFile, getSignedR2ReadUrl, uploadToStorage } from "./mediaUpload";
import { supabase } from "./supabase";
import { isVerifiedCreator } from "./creatorEntitlements";

const MUSIC_BUCKET = "music";
const MUSIC_COVER_BUCKET = "music-covers";
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_COVER_BYTES = 15 * 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/ogg", "audio/aac"]);
const COVER_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MUSIC_TRACK_COLUMNS = "id,creator_id,title,artist,audio_url,genre,price_acoin,storage_path,mime_type,file_size,duration_seconds,play_count,usage_count,is_featured,cover_url,cover_storage_path,created_at";

type MusicRow = {
  id: string;
  creator_id: string | null;
  title: string;
  artist?: string | null;
  audio_url?: string | null;
  genre: string;
  price_acoin: number | null;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  play_count: number | null;
  usage_count?: number | null;
  is_featured?: boolean | null;
  cover_url?: string | null;
  cover_storage_path?: string | null;
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
  const artist = row.creator?.display_name?.trim() || row.creator?.handle?.trim() || row.artist?.trim() || "AfuMusic creator";
  const handle = row.creator?.handle ? `@${row.creator.handle.replace(/^@/, "")}` : undefined;
  return {
    id: row.id,
    creatorId: row.creator_id ?? undefined,
    title: row.title,
    artist,
    handle,
    genre: row.genre,
    duration: formatDuration(row.duration_seconds),
    plays: row.play_count ?? row.usage_count ?? 0,
    price: Math.max(0, row.price_acoin ?? 0),
    isOwned: ownedIds.has(row.id) || row.creator_id === currentUserId,
    isCached: cachedIds.has(row.id),
    coverUrl: row.cover_url ?? undefined,
    coverStoragePath: row.cover_storage_path ?? undefined,
    coverColor,
    accentColor,
    storagePath: row.storage_path ?? undefined,
    mimeType: row.mime_type ?? undefined,
    fileSize: row.file_size ?? undefined,
    audioUrl: row.audio_url ?? null,
    isFeatured: row.is_featured ?? false,
    createdAt: row.created_at,
  };
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in to use AfuMusic.");
  return data.user.id;
}

async function loadTracks(query?: string, ids?: string[]): Promise<AfuMusicTrack[]> {
  const userId = await currentUserId();
  let request = supabase
    .from("music_tracks")
    .select(MUSIC_TRACK_COLUMNS)
    .eq("status", "published");
  if (ids) {
    if (!ids.length) return [];
    request = request.in("id", ids);
  } else if (query?.trim()) {
    const escaped = query.trim().replace(/[%_,]/g, "");
    if (escaped) request = request.or(`title.ilike.%${escaped}%,artist.ilike.%${escaped}%,genre.ilike.%${escaped}%`);
  }
  request = request.order("created_at", { ascending: false }).limit(100);
  const [{ data: rows, error }, { data: purchases }, { data: profiles }, offline] = await Promise.all([
    request,
    supabase.from("music_purchases").select("track_id").eq("buyer_id", userId),
    supabase.from("profiles").select("id,display_name,handle").limit(1000),
    getOfflineMusicEntries(userId),
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

export async function listCreatorMusicTracks(): Promise<AfuMusicTrack[]> {
  const userId = await currentUserId();
  const [{ data: rows, error }, offline] = await Promise.all([
    supabase
      .from("music_tracks")
      .select(MUSIC_TRACK_COLUMNS)
      .eq("creator_id", userId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(200),
    getOfflineMusicEntries(userId),
  ]);
  if (error) throw error;

  const cached = new Set(offline.map((entry) => entry.trackId));
  return ((rows ?? []) as MusicRow[]).map((row) => ({
    ...rowToTrack(row, new Set([row.id]), cached, userId),
    artist: "You",
    handle: "@you",
  }));
}

export async function searchMusicTracks(query: string) {
  return loadTracks(query);
}

export async function searchMusicTracksByIds(ids: string[]) {
  return loadTracks(undefined, ids);
}

export async function purchaseMusicTrack(trackId: string) {
  const { data, error } = await supabase.rpc("purchase_music_track", { p_track_id: trackId });
  if (error) throw error;
  const result = data as { ok?: boolean; already_owned?: boolean; price_acoin?: number } | null;
  if (!result?.ok) throw new Error("The music purchase was not confirmed.");
  return { alreadyOwned: !!result.already_owned, price: Number(result.price_acoin) || 0 };
}

export async function getMusicPlaybackUri(track: AfuMusicTrack): Promise<string | null> {
  const userId = await currentUserId();
  const cached = await getOfflineMusicUri(userId, track.id);
  if (cached) return cached;
  if (track.audioUrl?.startsWith("file://")) return track.audioUrl;
  if (!track.storagePath) {
    if (track.audioUrl && !track.audioUrl.includes(".supabase.co/storage/")) {
      return track.audioUrl;
    }
    return null;
  }
  const result = await getSignedR2ReadUrl(MUSIC_BUCKET, track.storagePath, track.id);
  if (result.error || !result.url) throw new Error(result.error || "This track is not available for playback.");
  return result.url;
}

export async function cacheMusicTrackOffline(track: AfuMusicTrack) {
  const userId = await currentUserId();
  if (track.price > 0 && track.creatorId !== userId && !track.isOwned) {
    throw new Error("Purchase this track before saving it offline.");
  }
  const remoteUri = await getMusicPlaybackUri({ ...track, audioUrl: undefined });
  if (!remoteUri) throw new Error("This track is not available for offline playback.");
  await cacheMusicFile(userId, track, remoteUri);
}

export async function listOfflineMusicTracks() {
  const userId = await currentUserId();
  const entries = await getOfflineMusicEntries(userId);
  return entries.map((entry) => entry.track);
}

export async function removeMusicTrackOffline(track: AfuMusicTrack) {
  const userId = await currentUserId();
  const { removeOfflineMusic } = await import("./musicCache");
  await removeOfflineMusic(userId, track.id);
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

export type MusicTrackInput = {
  title: string;
  genre: string;
  price: number;
  fileUri?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  coverFileUri?: string;
  coverFileName?: string;
  coverMimeType?: string;
  coverFileSize?: number;
};

function validateTrackDetails(input: MusicTrackInput) {
  const title = input.title.trim();
  const genre = input.genre.trim();
  if (!title || title.length > 120) throw new Error("Track titles must be between 1 and 120 characters.");
  if (!genre || genre.length > 40) throw new Error("Choose a valid music genre.");
  if (!Number.isInteger(input.price) || input.price < 0 || input.price > 100000) {
    throw new Error("Choose a whole-number price from 0 to 100,000 ACoin.");
  }
  return { title, genre, price: input.price };
}

async function assertCreatorCanSell(creatorId: string) {
  const [{ data: creator, error: creatorError }, { data: activeSubscription, error: subscriptionError }] = await Promise.all([
    supabase.from("profiles").select("is_verified").eq("id", creatorId).maybeSingle(),
    supabase
      .from("user_subscriptions")
      .select("is_active,expires_at,subscription_plans(tier)")
      .eq("user_id", creatorId)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
  ]);
  if (creatorError || subscriptionError) throw new Error("Could not verify creator eligibility. Try again.");
  const plan = (activeSubscription as any)?.subscription_plans;
  if (!isVerifiedCreator(creator?.is_verified, activeSubscription ? {
    is_active: activeSubscription.is_active,
    expires_at: activeSubscription.expires_at,
    plan_tier: Array.isArray(plan) ? plan[0]?.tier : plan?.tier,
  } : null)) {
    throw new Error("An active Standard or Pro plan, or an existing verified badge, is required to sell music.");
  }
}

async function selectedFileSize(uri: string, reportedSize?: number) {
  let size = Number(reportedSize ?? 0);
  if (Platform.OS === "web" && (uri.startsWith("blob:") || uri.startsWith("data:"))) {
    try {
      const response = await fetch(uri);
      if (!response.ok) throw new Error("Could not read the selected file.");
      const blob = await response.blob();
      size = blob.size || size;
    } catch {
      if (!size) throw new Error("The selected file is no longer available. Please choose it again.");
    }
  } else if (!size) {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) throw new Error("The selected file is no longer available. Please choose it again.");
    size = Number((info as any).size ?? 0);
  }
  return size;
}

function uniqueStorageName() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function uploadMusicAudio(creatorId: string, input: MusicTrackInput) {
  if (!input.fileUri || !input.fileName) throw new Error("Choose an audio file before publishing.");
  const mimeType = (input.mimeType || "audio/mpeg").split(";")[0].toLowerCase();
  if (!AUDIO_TYPES.has(mimeType)) throw new Error("Use an MP3, M4A, WAV, OGG, or AAC audio file.");
  const fileSize = await selectedFileSize(input.fileUri, input.fileSize);
  if (fileSize > MAX_AUDIO_BYTES) throw new Error("Audio files must be 100 MB or smaller.");

  const extension = audioExtension(input.fileName, mimeType);
  const path = `${creatorId}/${uniqueStorageName()}.${extension}`;
  const upload = await uploadToStorage(MUSIC_BUCKET, path, input.fileUri, mimeType);
  if (upload.error || !upload.publicUrl) throw new Error(upload.error || "Audio upload failed.");
  return { path, url: upload.publicUrl, mimeType, fileSize };
}

function coverDetails(input: MusicTrackInput) {
  if (!input.coverFileUri) return null;
  const suppliedMime = (input.coverMimeType || "").split(";")[0].toLowerCase();
  const namedExtension = input.coverFileName?.split(".").pop()?.toLowerCase();
  const mimeFromExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const mimeType = suppliedMime === "image/jpg"
    ? "image/jpeg"
    : suppliedMime || mimeFromExtension[namedExtension || ""] || "image/jpeg";
  if (!COVER_TYPES.has(mimeType)) throw new Error("Use a JPEG, PNG, or WebP image for cover art.");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return { uri: input.coverFileUri, mimeType, extension };
}

async function uploadMusicCover(creatorId: string, input: MusicTrackInput) {
  const cover = coverDetails(input);
  if (!cover) return null;
  const fileSize = await selectedFileSize(cover.uri, input.coverFileSize);
  if (fileSize > MAX_COVER_BYTES) throw new Error("Cover images must be 15 MB or smaller.");
  const path = `${creatorId}/covers/${uniqueStorageName()}.${cover.extension}`;
  const upload = await uploadToStorage(MUSIC_COVER_BUCKET, path, cover.uri, cover.mimeType);
  if (upload.error || !upload.publicUrl) throw new Error(upload.error || "Cover upload failed.");
  return { path, url: upload.publicUrl };
}

async function removeUploadedObject(bucket: string, path?: string | null) {
  if (!path) return;
  const result = await deleteUserFile(`${bucket}/${path}`);
  if (!result.ok) console.warn(`[AfuMusic] R2 cleanup failed: ${result.error}`);
}

export async function publishMusicTrack(input: MusicTrackInput & { fileUri: string; fileName: string }) {
  const creatorId = await currentUserId();
  const details = validateTrackDetails(input);
  if (details.price > 0) await assertCreatorCanSell(creatorId);

  const audio = await uploadMusicAudio(creatorId, input);
  let cover: { path: string; url: string } | null = null;
  try {
    cover = await uploadMusicCover(creatorId, input);
    const { data, error } = await supabase.from("music_tracks").insert({
      creator_id: creatorId,
      title: details.title,
      audio_url: audio.url,
      genre: details.genre,
      price_acoin: Math.floor(details.price),
      storage_path: audio.path,
      mime_type: audio.mimeType,
      file_size: audio.fileSize,
      cover_url: cover?.url ?? null,
      cover_storage_path: cover?.path ?? null,
    }).select(MUSIC_TRACK_COLUMNS).single();
    if (error) throw error;
    return {
      ...rowToTrack(data as MusicRow, new Set([data.id]), new Set(), creatorId),
      artist: "You",
      handle: "@you",
    };
  } catch (error) {
    await removeUploadedObject(MUSIC_BUCKET, audio.path);
    if (cover) await removeUploadedObject(MUSIC_COVER_BUCKET, cover.path);
    throw error;
  }
}

export async function updateMusicTrack(track: AfuMusicTrack, input: MusicTrackInput) {
  const creatorId = await currentUserId();
  const details = validateTrackDetails(input);
  const { data: existing, error: existingError } = await supabase
    .from("music_tracks")
    .select("price_acoin,storage_path,cover_storage_path")
    .eq("id", track.id)
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("This track was not found or is no longer available to edit.");
  if (details.price > 0 && details.price !== Number(existing.price_acoin ?? 0)) {
    await assertCreatorCanSell(creatorId);
  }

  let audio: Awaited<ReturnType<typeof uploadMusicAudio>> | null = null;
  let cover: { path: string; url: string } | null = null;
  try {
    if (input.fileUri) audio = await uploadMusicAudio(creatorId, input);
    cover = await uploadMusicCover(creatorId, input);
    const update: Record<string, unknown> = {
      title: details.title,
      genre: details.genre,
      price_acoin: Math.floor(details.price),
    };
    if (audio) {
      update.audio_url = audio.url;
      update.storage_path = audio.path;
      update.mime_type = audio.mimeType;
      update.file_size = audio.fileSize;
    }
    if (cover) {
      update.cover_url = cover.url;
      update.cover_storage_path = cover.path;
    }

    const { data, error } = await supabase
      .from("music_tracks")
      .update(update)
      .eq("id", track.id)
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .select(MUSIC_TRACK_COLUMNS)
      .single();
    if (error) throw error;

    if (audio && existing.storage_path) {
      await removeUploadedObject(MUSIC_BUCKET, existing.storage_path);
    }
    if (cover && existing.cover_storage_path) {
      await removeUploadedObject(MUSIC_COVER_BUCKET, existing.cover_storage_path);
    }
    return {
      ...rowToTrack(data as MusicRow, new Set([track.id]), new Set(), creatorId),
      artist: "You",
      handle: "@you",
    };
  } catch (error) {
    if (audio) await removeUploadedObject(MUSIC_BUCKET, audio.path);
    if (cover) await removeUploadedObject(MUSIC_COVER_BUCKET, cover.path);
    throw error;
  }
}

export async function removeMusicTrack(track: AfuMusicTrack) {
  const creatorId = await currentUserId();
  const { data, error } = await supabase
    .from("music_tracks")
    .update({ status: "removed" })
    .eq("id", track.id)
    .eq("creator_id", creatorId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This track was not found or is no longer yours.");

  await removeUploadedObject(MUSIC_BUCKET, track.storagePath);
  await removeUploadedObject(MUSIC_COVER_BUCKET, track.coverStoragePath);
}