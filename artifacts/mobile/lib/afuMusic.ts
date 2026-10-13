import * as FileSystem from "expo-file-system/legacy";

import type { AfuMusicTrack } from "@/modules/afumusic";
import { cacheMusicFile, getOfflineMusicEntries, getOfflineMusicUri } from "./musicCache";
import { deleteUserFile, getSignedR2ReadUrl, uploadToStorage } from "./mediaUpload";
import { supabase } from "./supabase";

const MUSIC_BUCKET = "music";
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/ogg", "audio/aac"]);

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
  video_use_allowed?: boolean | null;
  created_at: string;
  creator?: { display_name?: string | null; handle?: string | null } | null;
};

export type AfuMusicLedgerItem = {
  id: string;
  trackId: string | null;
  title: string;
  artist: string;
  amount: number;
  happenedAt: string;
  counterpartyName: string;
  counterpartyHandle: string | null;
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
    coverColor,
    accentColor,
    storagePath: row.storage_path ?? undefined,
    mimeType: row.mime_type ?? undefined,
    fileSize: row.file_size ?? undefined,
    audioUrl: row.audio_url ?? null,
    videoUseAllowed: row.video_use_allowed ?? false,
    isFeatured: row.is_featured ?? false,
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
    .select("id,creator_id,title,artist,audio_url,genre,price_acoin,storage_path,mime_type,file_size,duration_seconds,play_count,usage_count,is_featured,video_use_allowed,created_at")
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

export async function searchMusicTracks(query: string) {
  return loadTracks(query);
}

export async function getMusicTrackById(trackId: string) {
  const userId = await currentUserId();
  const [{ data: row, error }, { data: purchase }, offline] = await Promise.all([
    supabase
      .from("music_tracks")
      .select("id,creator_id,title,artist,audio_url,genre,price_acoin,storage_path,mime_type,file_size,duration_seconds,play_count,usage_count,is_featured,video_use_allowed,created_at")
      .eq("id", trackId)
      .eq("status", "published")
      .maybeSingle(),
    supabase.from("music_purchases").select("track_id").eq("buyer_id", userId).eq("track_id", trackId).maybeSingle(),
    getOfflineMusicEntries(userId),
  ]);
  if (error) throw error;
  if (!row) return null;
  const [{ data: profile }, cached] = await Promise.all([
    row.creator_id
      ? supabase.from("profiles").select("id,display_name,handle").eq("id", row.creator_id).maybeSingle()
      : Promise.resolve({ data: null }),
    Promise.resolve(offline.some((entry) => entry.trackId === trackId)),
  ]);
  return rowToTrack({
    ...(row as MusicRow),
    creator: profile?.id === row.creator_id ? profile : null,
  }, new Set(purchase ? [trackId] : []), new Set(cached ? [trackId] : []), userId);
}

export async function purchaseMusicTrack(trackId: string) {
  const { error } = await supabase.rpc("purchase_music_track", { p_track_id: trackId });
  if (error) throw error;
}

async function loadMusicLedger(kind: "purchase" | "earning"): Promise<AfuMusicLedgerItem[]> {
  const userId = await currentUserId();
  const { data, error } = kind === "purchase"
    ? await supabase
        .from("music_purchases")
        .select("id,track_id,creator_id,price_acoin,purchased_at")
        .eq("buyer_id", userId)
        .order("purchased_at", { ascending: false })
        .limit(100)
    : await supabase
        .from("music_transactions")
        .select("id,track_id,buyer_id,amount_acoin,created_at")
        .eq("creator_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
  if (error) throw error;
  const records = data ?? [];
  if (records.length === 0) return [];

  const trackIds = [...new Set(records.map((row: any) => row.track_id).filter(Boolean))] as string[];
  const profileIds = [...new Set(records.map((row: any) => kind === "purchase" ? row.creator_id : row.buyer_id))] as string[];
  const [{ data: tracks, error: tracksError }, { data: profiles, error: profilesError }] = await Promise.all([
    trackIds.length
      ? supabase.from("music_tracks").select("id,title,artist").in("id", trackIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from("profiles").select("id,display_name,handle").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tracksError) throw tracksError;
  if (profilesError) throw profilesError;
  const trackMap = new Map((tracks ?? []).map((track: any) => [track.id, track]));
  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  return records.map((row: any) => {
    const track = row.track_id ? trackMap.get(row.track_id) : null;
    const counterparty = profileMap.get(kind === "purchase" ? row.creator_id : row.buyer_id);
    return {
      id: row.id,
      trackId: row.track_id ?? null,
      title: track?.title || "Unavailable track",
      artist: track?.artist || "AfuMusic creator",
      amount: kind === "purchase" ? row.price_acoin : row.amount_acoin,
      happenedAt: kind === "purchase" ? row.purchased_at : row.created_at,
      counterpartyName: counterparty?.display_name || counterparty?.handle || "AfuMusic user",
      counterpartyHandle: counterparty?.handle ? `@${counterparty.handle.replace(/^@/, "")}` : null,
    };
  });
}

export function listMusicPurchases() {
  return loadMusicLedger("purchase");
}

export function listMusicEarnings() {
  return loadMusicLedger("earning");
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

export async function getMusicDownloadUri(track: AfuMusicTrack, filename: string): Promise<string | null> {
  await currentUserId();
  if (!track.storagePath) {
    return track.audioUrl && !track.audioUrl.includes(".supabase.co/storage/")
      ? track.audioUrl
      : null;
  }
  const result = await getSignedR2ReadUrl(MUSIC_BUCKET, track.storagePath, track.id, filename);
  if (result.error || !result.url) throw new Error(result.error || "This track is not available for download.");
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

export async function publishMusicTrack(input: {
  title: string;
  genre: string;
  price: number;
  fileUri: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  videoUseAllowed?: boolean;
}) {
  const creatorId = await currentUserId();
  const mimeType = input.mimeType || "audio/mpeg";
  if (!AUDIO_TYPES.has(mimeType)) throw new Error("Use an MP3, M4A, WAV, OGG, or AAC audio file.");
  if (!Number.isInteger(input.price) || (input.price !== 0 && (input.price < 5 || input.price > 1000))) {
    throw new Error("Free tracks must cost 0 ACoin; paid tracks must cost between 5 and 1,000 ACoin.");
  }
  const info = await FileSystem.getInfoAsync(input.fileUri).catch(() => ({ exists: true, size: input.fileSize ?? 0 } as any));
  const fileSize = Number((info as any).size ?? input.fileSize ?? 0);
  if (fileSize > MAX_AUDIO_BYTES) throw new Error("Audio files must be 100 MB or smaller.");

  const extension = audioExtension(input.fileName, mimeType);
  const uniquePart = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const path = `${creatorId}/${uniquePart}.${extension}`;
  const upload = await uploadToStorage(MUSIC_BUCKET, path, input.fileUri, mimeType);
  if (upload.error || !upload.publicUrl) {
    throw new Error(upload.error || "Audio upload failed.");
  }
  const { data, error } = await supabase.from("music_tracks").insert({
    creator_id: creatorId,
    title: input.title.trim(),
    audio_url: upload.publicUrl,
    genre: input.genre,
    price_acoin: input.price,
    storage_path: path,
    mime_type: mimeType,
    file_size: fileSize,
    video_use_allowed: input.videoUseAllowed ?? false,
  }).select("id,creator_id,title,artist,audio_url,genre,price_acoin,storage_path,mime_type,file_size,duration_seconds,play_count,usage_count,is_featured,video_use_allowed,created_at").single();
  if (error) {
    await deleteUserFile(`${MUSIC_BUCKET}/${path}`).catch(() => {});
    throw error;
  }
  return {
    ...rowToTrack(data as MusicRow, new Set([data.id]), new Set(), creatorId),
    artist: "You",
    handle: "@you",
  };
}

export async function removeMusicTrack(track: AfuMusicTrack) {
  const { error } = await supabase
    .from("music_tracks")
    .update({ status: "removed" })
    .eq("id", track.id)
    .eq("creator_id", await currentUserId());
  if (error) throw error;
  if (track.storagePath) {
    const deleted = await deleteUserFile(`${MUSIC_BUCKET}/${track.storagePath}`);
    if (!deleted.ok) {
      console.warn("[AfuMusic] R2 cleanup failed:", deleted.error);
    }
  }
}