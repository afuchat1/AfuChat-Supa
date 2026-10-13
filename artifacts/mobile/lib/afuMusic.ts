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
const MUSIC_TRACK_COLUMNS_NO_COVER = MUSIC_TRACK_COLUMNS.replace(",cover_art_url", "");
const MUSIC_TRACK_COLUMNS_BASE = MUSIC_TRACK_COLUMNS_NO_COVER.replace(",video_use_allowed", "");
let warnedAboutCoverMigration = false;
let warnedAboutPlatformMigration = false;

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

function isMissingPlatformColumns(error: any) {
  const message = String(error?.message ?? error?.details ?? "").toLowerCase();
  return /(cover_art_(url|path)|video_use_allowed)/.test(message)
    && ["42703", "PGRST204"].includes(String(error?.code ?? ""));
}

function warnCoverMigrationMissing() {
  if (warnedAboutCoverMigration) return;
  warnedAboutCoverMigration = true;
  console.warn("[AfuMusic] Apply 20261013000003_afumusic_cover_art.sql to enable track cover art.");
}

function warnPlatformMigrationMissing() {
  if (warnedAboutPlatformMigration) return;
  warnedAboutPlatformMigration = true;
  console.warn("[AfuMusic] Apply the AfuMusic platform integration migration to enable video licensing and music posts.");
}

async function selectTracksWithCompatibleColumns(makeRequest: (columns: string) => any) {
  let result = await makeRequest(MUSIC_TRACK_COLUMNS);
  if (!isMissingPlatformColumns(result.error)) return result;
  if (/cover_art_(url|path)/i.test(String(result.error?.message ?? ""))) {
    warnCoverMigrationMissing();
  } else {
    warnPlatformMigrationMissing();
  }

  result = await makeRequest(MUSIC_TRACK_COLUMNS_NO_COVER);
  if (!isMissingPlatformColumns(result.error)) return result;

  result = await makeRequest(MUSIC_TRACK_COLUMNS_BASE);
  return result;
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
    // Paid playback must go through the authenticated read-URL endpoint, never
    // through the public CDN URL stored in legacy rows.
    audioUrl: (row.price_acoin ?? 0) > 0 ? null : row.audio_url ?? null,
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

async function optionalCurrentUserId(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id;
  } catch {
    return undefined;
  }
}

async function loadTracks(query?: string): Promise<AfuMusicTrack[]> {
  const userId = await optionalCurrentUserId();
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
  const [{ data: rows, error }, { data: purchases }, offline] = await Promise.all([
    selectTracksWithCompatibleColumns(buildRequest),
    userId
      ? supabase.from("music_purchases").select("track_id").eq("buyer_id", userId)
      : Promise.resolve({ data: [] as { track_id: string }[] }),
    userId ? getOfflineMusicEntries(userId) : Promise.resolve([]),
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

  const base = () => (supabase.from("music_tracks") as any)
      .select(MUSIC_TRACK_COLUMNS)
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(24);
  const loadRows = (columns: string) => (supabase.from("music_tracks") as any)
    .select(columns)
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(24);
  const [{ data: rows, error }, { data: purchases }, offline, { data: creator }] = await Promise.all([
    selectTracksWithCompatibleColumns(loadRows),
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
  const query = (columns: string) => (supabase.from("music_tracks") as any)
    .select(columns)
    .eq("id", trackId)
    .eq("status", "published")
    .maybeSingle();
  const [{ data: row, error }, { data: purchase }, offline] = await Promise.all([
    selectTracksWithCompatibleColumns(query),
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
  const { data: paymentsReady, error: readinessError } = await supabase.rpc("afumusic_payments_ready");
  if (readinessError || paymentsReady !== true) {
    throw new Error("Secure AfuMusic purchases are not deployed yet. Your ACoin was not charged.");
  }
  const { data: purchase, error } = await supabase.rpc("purchase_music_track", { p_track_id: trackId });
  if (error) throw error;
  if (!purchase || (purchase as any).ok !== true) {
    throw new Error("The purchase was not confirmed. Your ACoin was not charged.");
  }

  const buyerId = await currentUserId();
  const { data: receipt, error: receiptError } = await supabase
    .from("music_purchases")
    .select("id")
    .eq("track_id", trackId)
    .eq("buyer_id", buyerId)
    .maybeSingle();
  if (receiptError) throw receiptError;
  if (!receipt) throw new Error("The purchase receipt could not be verified.");
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
  if (track.price > 0 && track.creatorId !== userId && !track.isOwned) {
    throw new Error("Purchase this track before playing it.");
  }
  const cached = await getOfflineMusicUri(userId, track.id);
  if (cached) return cached;
  if (track.price === 0 && track.audioUrl?.startsWith("file://")) return track.audioUrl;
  if (!track.storagePath) {
    if (track.price === 0 && track.audioUrl && !track.audioUrl.includes(".supabase.co/storage/")) {
      return track.audioUrl;
    }
    return null;
  }
  const result = await getSignedR2ReadUrl(MUSIC_BUCKET, track.storagePath, track.id);
  if (result.error || !result.url) throw new Error(result.error || "This track is not available for playback.");
  return result.url;
}

export async function getMusicDownloadUri(track: AfuMusicTrack, filename: string): Promise<string | null> {
  const userId = await currentUserId();
  if (track.price > 0 && track.creatorId !== userId && !track.isOwned) {
    throw new Error("Purchase this track before downloading it.");
  }
  if (!track.storagePath) {
    return track.price === 0 && track.audioUrl && !track.audioUrl.includes(".supabase.co/storage/")
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
  if (mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("aac")) return "aac";
  throw new Error("Use an MP3, M4A, WAV, OGG, or AAC audio file.");
}

function resolveAudioMimeType(fileName: string, mimeType?: string) {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (normalized && AUDIO_TYPES.has(normalized)) return normalized;
  const extension = fileName.split(".").pop()?.toLowerCase();
  const inferred: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
  };
  return inferred[extension ?? ""] ?? "";
}

async function verifiedFileSize(uri: string, reportedSize: number | undefined, label: string) {
  let info: { exists?: boolean; size?: number } | null = null;
  try {
    info = await FileSystem.getInfoAsync(uri) as { exists?: boolean; size?: number };
  } catch {
    // Picker metadata is the fallback for browser/blob and provider-backed URIs.
  }
  const size = Number(info?.size && info.size > 0 ? info.size : reportedSize);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(`Could not verify the ${label} file size. Choose the file again and retry.`);
  }
  return size;
}

async function extractDurationSeconds(uri: string): Promise<number | null> {
  if (typeof document !== "undefined") {
    return new Promise((resolve) => {
      const audio = document.createElement("audio");
      let settled = false;
      const finish = (value: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audio.removeAttribute("src");
        audio.load();
        resolve(value);
      };
      const timeout = setTimeout(() => finish(null), 12_000);
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        finish(Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null);
      };
      audio.onerror = () => finish(null);
      audio.src = uri;
      audio.load();
    });
  }

  let sound: { unloadAsync: () => Promise<unknown> } | null = null;
  try {
    const { Audio } = await import("expo-av");
    const loaded = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false },
      undefined,
      false,
    );
    sound = loaded.sound;
    const durationMillis = loaded.status.isLoaded ? loaded.status.durationMillis : undefined;
    return typeof durationMillis === "number" && Number.isFinite(durationMillis) && durationMillis > 0
      ? Math.round(durationMillis / 1000)
      : null;
  } catch {
    return null;
  } finally {
    await sound?.unloadAsync().catch(() => {});
  }
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
  const mimeType = resolveAudioMimeType(input.fileName, input.mimeType);
  if (!AUDIO_TYPES.has(mimeType)) throw new Error("Use an MP3, M4A, WAV, OGG, or AAC audio file.");
  const title = input.title.trim();
  if (!title || title.length > 120) throw new Error("Track titles must be between 1 and 120 characters.");
  if (!Number.isInteger(input.price) || (input.price !== 0 && (input.price < 5 || input.price > 1000))) {
    throw new Error("Free tracks must cost 0 ACoin; paid tracks must cost between 5 and 1,000 ACoin.");
  }
  if (input.price > 0) {
    const { data: allowed, error } = await supabase.rpc("afumusic_creator_has_premium", {
      p_creator_id: creatorId,
    });
    if (error || allowed !== true) {
      throw new Error("Paid publishing needs the AfuMusic premium-entitlement migration. Apply the production migration before retrying.");
    }
  }
  const fileSize = await verifiedFileSize(input.fileUri, input.fileSize, "audio");
  if (fileSize > MAX_AUDIO_BYTES) throw new Error("Audio files must be 100 MB or smaller.");
  const durationSeconds = await extractDurationSeconds(input.fileUri);
  if (durationSeconds !== null && durationSeconds > 7200) {
    throw new Error("Audio tracks must be two hours or shorter.");
  }

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
      const coverSize = await verifiedFileSize(input.coverUri, input.coverFileSize, "cover image");
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
      title,
      audio_url: input.price > 0 ? null : upload.publicUrl,
      genre: input.genre,
      price_acoin: input.price,
      storage_path: path,
      mime_type: mimeType,
      file_size: fileSize,
      duration_seconds: durationSeconds,
    };
    let includeVideoLicense = true;
    let includeCover = true;
    let inserted: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      const selectedColumns = MUSIC_TRACK_COLUMNS
        .replace(includeCover ? "" : ",cover_art_url", "")
        .replace(includeVideoLicense ? "" : ",video_use_allowed", "");
      const values = {
        ...trackValues,
        ...(includeVideoLicense ? { video_use_allowed: input.videoUseAllowed ?? false } : {}),
        ...(includeCover ? { cover_art_url: coverUrl, cover_art_path: coverPath } : {}),
      };
      inserted = await (supabase.from("music_tracks") as any)
        .insert(values)
        .select(selectedColumns)
        .single();
      if (!inserted.error) break;

      if (isMissingPlatformColumns(inserted.error)) {
        const message = String(inserted.error.message ?? "").toLowerCase();
        if (message.includes("video_use_allowed")) {
          warnPlatformMigrationMissing();
          if (input.price > 0 || input.videoUseAllowed) {
            throw new Error("Track publishing needs the AfuMusic platform migration. Apply it before publishing paid tracks or enabling video use.");
          }
          includeVideoLicense = false;
          continue;
        }
        if (message.includes("cover_art_")) {
          warnCoverMigrationMissing();
          if (coverUrl) {
            throw new Error("Track cover art needs the AfuMusic cover-art migration. Apply it before publishing with artwork.");
          }
          includeCover = false;
          continue;
        }
      }
      break;
    }
    if (inserted?.error) {
      if (input.price > 0 && inserted.error.code === "23502") {
        throw new Error("Paid-track privacy needs the AfuMusic production migration. Apply it before publishing paid music.");
      }
      throw inserted.error;
    }
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