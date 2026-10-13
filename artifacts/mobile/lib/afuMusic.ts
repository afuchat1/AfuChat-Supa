import * as FileSystem from "expo-file-system/legacy";

import type { AfuMusicTrack } from "@/modules/afumusic";
import { cacheMusicFile, getOfflineMusicEntries, getOfflineMusicUri } from "./musicCache";
import { deleteUserFile, getSignedR2ReadUrl, prepareMediaForUpload, uploadToStorage } from "./mediaUpload";
import { supabase } from "./supabase";

const MUSIC_BUCKET = "music";
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_COVER_BYTES = 10 * 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/ogg", "audio/aac"]);
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MUSIC_TRACK_COLUMNS = "id,creator_id,title,artist,audio_url,genre,price_acoin,storage_path,mime_type,file_size,duration_seconds,play_count,usage_count,is_featured,video_use_allowed,cover_art_url,created_at";
const MUSIC_TRACK_COLUMNS_LEGACY = MUSIC_TRACK_COLUMNS.replace(",cover_art_url", "");
let warnedAboutCoverMigration = false;

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
  cover_art_url?: string | null;
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

function isMissingCoverColumns(error: any) {
  const message = String(error?.message ?? error?.details ?? "").toLowerCase();
  return /cover_art_(url|path)/.test(message)
    && ["42703", "PGRST204"].includes(String(error?.code ?? ""));
}

function warnCoverMigrationMissing() {
  if (warnedAboutCoverMigration) return;
  warnedAboutCoverMigration = true;
  console.warn("[AfuMusic] Apply 20261013000003_afumusic_cover_art.sql to enable track cover art.");
}

function rowToTrack(
  row: MusicRow,
  ownedIds: Set<string>,
  cachedIds: Set<string>,
  currentUserId?: string,
): AfuMusicTrack {
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
    storagePath: row.storage_path ?? undefined,
    mimeType: row.mime_type ?? undefined,
    fileSize: row.file_size ?? undefined,
    audioUrl: row.audio_url ?? null,
    videoUseAllowed: row.video_use_allowed ?? false,
    coverArtUrl: row.cover_art_url ?? undefined,
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
  const searchTerm = query?.trim().replace(/[%_,()."]/g, "");
  let matchingCreatorIds: string[] = [];
  if (searchTerm) {
    const { data: matchingCreators, error: creatorSearchError } = await supabase
      .from("profiles")
      .select("id")
      .or(`display_name.ilike.%${searchTerm}%,handle.ilike.%${searchTerm}%`)
      .limit(100);
    if (creatorSearchError) throw creatorSearchError;
    matchingCreatorIds = (matchingCreators ?? []).map((profile: any) => profile.id);
  }
  const buildRequest = (columns: string) => {
    let request = (supabase.from("music_tracks") as any)
      .select(columns)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100);
    if (searchTerm) {
      const filters = [
        `title.ilike.%${searchTerm}%`,
        `artist.ilike.%${searchTerm}%`,
        `genre.ilike.%${searchTerm}%`,
      ];
      if (matchingCreatorIds.length) {
        filters.push(`creator_id.in.(${matchingCreatorIds.join(",")})`);
      }
      request = request.or(filters.join(","));
    }
    return request;
  };
  const loadRows = async () => {
    let result = await buildRequest(MUSIC_TRACK_COLUMNS);
    if (isMissingCoverColumns(result.error)) {
      warnCoverMigrationMissing();
      result = await buildRequest(MUSIC_TRACK_COLUMNS_LEGACY);
    }
    return result;
  };
  const [{ data: rows, error }, { data: purchases }, offline] = await Promise.all([
    loadRows(),
    supabase.from("music_purchases").select("track_id").eq("buyer_id", userId),
    getOfflineMusicEntries(userId),
  ]);
  if (error) throw error;

  const creatorIds = [...new Set((rows ?? []).map((row: any) => row.creator_id).filter(Boolean))];
  const { data: profiles, error: profileError } = creatorIds.length
    ? await supabase.from("profiles").select("id,display_name,handle").in("id", creatorIds)
    : { data: [], error: null };
  if (profileError) throw profileError;

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

export async function listMusicTracksByCreator(creatorId: string) {
  if (!creatorId) return [];
  let viewerId: string | undefined;
  try {
    viewerId = (await supabase.auth.getUser()).data.user?.id;
  } catch {
    viewerId = undefined;
  }

  const loadRows = async () => {
    const base = () => (supabase.from("music_tracks") as any)
      .select(MUSIC_TRACK_COLUMNS)
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(24);
    let result = await base();
    if (isMissingCoverColumns(result.error)) {
      warnCoverMigrationMissing();
      result = await (supabase.from("music_tracks") as any)
        .select(MUSIC_TRACK_COLUMNS_LEGACY)
        .eq("creator_id", creatorId)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(24);
    }
    return result;
  };
  const [{ data: rows, error }, { data: purchases }, offline, { data: creator }] = await Promise.all([
    loadRows(),
    viewerId
      ? supabase.from("music_purchases").select("track_id").eq("buyer_id", viewerId)
      : Promise.resolve({ data: [] as { track_id: string }[] }),
    viewerId ? getOfflineMusicEntries(viewerId) : Promise.resolve([]),
    supabase.from("profiles").select("id,display_name,handle").eq("id", creatorId).maybeSingle(),
  ]);
  if (error) throw error;

  const purchasedIds = new Set((purchases ?? []).map((item: any) => item.track_id));
  const cachedIds = new Set(offline.map((entry) => entry.trackId));
  return ((rows ?? []) as MusicRow[]).map((row) => rowToTrack({
    ...row,
    creator: creator?.id === creatorId ? creator : null,
  }, purchasedIds, cachedIds, viewerId));
}

export async function getMusicTrackById(trackId: string) {
  const userId = await currentUserId();
  const loadTrack = async () => {
    const query = (columns: string) => (supabase.from("music_tracks") as any)
      .select(columns)
      .eq("id", trackId)
      .eq("status", "published")
      .maybeSingle();
    let result = await query(MUSIC_TRACK_COLUMNS);
    if (isMissingCoverColumns(result.error)) {
      warnCoverMigrationMissing();
      result = await query(MUSIC_TRACK_COLUMNS_LEGACY);
    }
    return result;
  };
  const [{ data: row, error }, { data: purchase }, offline] = await Promise.all([
    loadTrack(),
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
  coverUri?: string;
  coverFileName?: string;
  coverMimeType?: string;
  coverFileSize?: number;
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
  const audioKey = `${MUSIC_BUCKET}/${path}`;
  let coverPath: string | null = null;
  let coverKey: string | null = null;
  try {
    const upload = await uploadToStorage(MUSIC_BUCKET, path, input.fileUri, mimeType);
    if (upload.error || !upload.publicUrl) {
      throw new Error(upload.error || "Audio upload failed.");
    }

    let coverUrl: string | null = null;
    if (input.coverUri) {
      const coverName = input.coverFileName || "cover.jpg";
      const coverExtension = coverName.split(".").pop()?.toLowerCase() || "jpg";
      const inferredType = coverExtension === "png" ? "image/png"
        : coverExtension === "webp" ? "image/webp"
        : coverExtension === "jpg" || coverExtension === "jpeg" ? "image/jpeg"
        : "";
      const coverMimeType = input.coverMimeType || inferredType;
      if (!COVER_TYPES.has(coverMimeType)) {
        throw new Error("Use a JPG, PNG, or WebP image for the cover.");
      }
      const coverInfo = await FileSystem.getInfoAsync(input.coverUri).catch(() => ({ exists: true, size: input.coverFileSize ?? 0 } as any));
      const coverSize = Number((coverInfo as any).size ?? input.coverFileSize ?? 0);
      if (coverSize > MAX_COVER_BYTES) throw new Error("Cover images must be 10 MB or smaller.");
      const safeExtension = coverMimeType === "image/png" ? "png" : coverMimeType === "image/webp" ? "webp" : "jpg";
      coverPath = `${creatorId}/${uniquePart}_cover.${safeExtension}`;
      coverKey = `${MUSIC_BUCKET}/${coverPath}`;
      const stableCoverUri = await prepareMediaForUpload(input.coverUri, safeExtension);
      const coverUpload = await uploadToStorage(MUSIC_BUCKET, coverPath, stableCoverUri, coverMimeType);
      if (coverUpload.error || !coverUpload.publicUrl) {
        throw new Error(coverUpload.error || "Cover upload failed.");
      }
      coverUrl = coverUpload.publicUrl;
    }

    const trackValues: Record<string, unknown> = {
      creator_id: creatorId,
      title: input.title.trim(),
      audio_url: upload.publicUrl,
      genre: input.genre,
      price_acoin: input.price,
      storage_path: path,
      mime_type: mimeType,
      file_size: fileSize,
      video_use_allowed: input.videoUseAllowed ?? false,
    };
    const insertTrack = (includeCover: boolean) => (supabase.from("music_tracks") as any)
      .insert(includeCover ? {
        ...trackValues,
        cover_art_url: coverUrl,
        cover_art_path: coverPath,
      } : trackValues)
      .select(includeCover ? MUSIC_TRACK_COLUMNS : MUSIC_TRACK_COLUMNS_LEGACY)
      .single();
    let inserted = await insertTrack(true);
    if (isMissingCoverColumns(inserted.error) && !coverUrl) {
      warnCoverMigrationMissing();
      inserted = await insertTrack(false);
    }
    if (inserted.error) throw inserted.error;
    const data = inserted.data as MusicRow;
    return {
      ...rowToTrack(data, new Set([data.id]), new Set(), creatorId),
      artist: "You",
      handle: "@you",
    };
  } catch (error) {
    await Promise.all([
      deleteUserFile(audioKey).catch(() => {}),
      coverKey ? deleteUserFile(coverKey).catch(() => {}) : Promise.resolve(),
    ]);
    if (input.coverUri && isMissingCoverColumns(error)) {
      throw new Error("Track cover uploads need the AfuMusic cover-art database migration. Apply 20261013000003_afumusic_cover_art.sql in Supabase, then retry.");
    }
    throw error;
  }
}

export async function removeMusicTrack(track: AfuMusicTrack) {
  const creatorId = await currentUserId();
  const remove = (includeCoverPath: boolean) => (supabase.from("music_tracks") as any)
    .update({ status: "removed" })
    .eq("id", track.id)
    .eq("creator_id", creatorId)
    .select(includeCoverPath ? "storage_path,cover_art_path" : "storage_path")
    .maybeSingle();
  let result = await remove(true);
  if (isMissingCoverColumns(result.error)) {
    warnCoverMigrationMissing();
    result = await remove(false);
  }
  if (result.error) throw result.error;
  if (!result.data) throw new Error("This track is unavailable or you do not have permission to remove it.");
  if (result.data.storage_path) {
    const deleted = await deleteUserFile(`${MUSIC_BUCKET}/${result.data.storage_path}`);
    if (!deleted.ok) {
      console.warn("[AfuMusic] R2 cleanup failed:", deleted.error);
    }
  }
  if (result.data.cover_art_path) {
    const deleted = await deleteUserFile(`${MUSIC_BUCKET}/${result.data.cover_art_path}`);
    if (!deleted.ok) {
      console.warn("[AfuMusic] cover cleanup failed:", deleted.error);
    }
  }
}