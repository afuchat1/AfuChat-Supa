/**
 * Client-side helpers for the AfuChat video pipeline.
 *
 *   registerVideoAsset  — call after uploading a source file to Storage
 *   getPostVideoManifest — fetch playback manifest for a post
 *   getAssetVideoManifest — fetch playback manifest for an asset
 *   pickBestSource      — choose the best rendition for the current device
 */
import { supabase, supabaseUrl } from "./supabase";

// All video API calls go directly to the Supabase Edge Function.
// No Express API server needed.
const EDGE_BASE: string = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/videos`;

export interface VideoSource {
  codec: "h264" | "av1";
  container: "mp4" | "webm" | "hls" | "dash";
  height: number;
  width: number | null;
  bitrate_kbps: number | null;
  mime: string;
  url: string;
}

export interface VideoManifest {
  id: string;
  status: "pending" | "processing" | "ready" | "failed";
  duration: number | null;
  width: number | null;
  height: number | null;
  poster: string | null;
  fallback_url: string;
  sources: VideoSource[];
}

async function authHeader(): Promise<Record<string, string>> {
  const session = (await supabase.auth.getSession()).data.session;
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export interface RegisterVideoAssetInput {
  source_path: string;
  post_id?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  source_size_bytes?: number | null;
  source_mime?: string | null;
}

export interface RegisterVideoAssetResult {
  id: string;
  status: string;
  planned_renditions: number;
}

/**
 * Register a freshly uploaded source video so the server-side encoder
 * pipeline can produce H.264 + AV1 renditions in the background.
 *
 * Failures here MUST NOT break the upload flow — the original `video_url`
 * fallback remains usable until renditions are ready.
 */
export async function registerVideoAsset(
  input: RegisterVideoAssetInput,
): Promise<RegisterVideoAssetResult | null> {
  if (!EDGE_BASE) return null;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(await authHeader()),
    };
    if (!headers.Authorization) return null;

    const res = await fetch(`${EDGE_BASE}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!text || text.trimStart().startsWith("<")) {
      // Either an empty body or an HTML page from the SPA fallback —
      // neither of which we can parse as JSON.
      console.warn("registerVideoAsset: non-JSON response", res.status);
      return null;
    }
    if (!res.ok) {
      try {
        const err = JSON.parse(text);
        console.warn("registerVideoAsset failed:", res.status, err?.error);
      } catch {
        console.warn("registerVideoAsset failed:", res.status);
      }
      return null;
    }
    return JSON.parse(text) as RegisterVideoAssetResult;
  } catch (e) {
    console.warn("registerVideoAsset network error:", e);
    return null;
  }
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || text.trimStart().startsWith("<")) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Manifests are tiny metadata, so keep them in memory only. This avoids
// duplicate requests when a virtualized feed remounts nearby video cards.
const MANIFEST_CACHE_LIMIT = 256;
const READY_MANIFEST_TTL_MS = 5 * 60_000;
const PENDING_MANIFEST_TTL_MS = 8_000;
const EMPTY_MANIFEST_TTL_MS = 5_000;
const manifestCache = new Map<string, { expiresAt: number; value: VideoManifest | null }>();
const manifestRequests = new Map<string, Promise<VideoManifest | null>>();

function readManifestCache(key: string): { hit: boolean; value: VideoManifest | null } {
  const entry = manifestCache.get(key);
  if (!entry) return { hit: false, value: null };
  if (entry.expiresAt <= Date.now()) {
    manifestCache.delete(key);
    return { hit: false, value: null };
  }
  manifestCache.delete(key);
  manifestCache.set(key, entry);
  return { hit: true, value: entry.value };
}

function writeManifestCache(key: string, value: VideoManifest | null, ttlMs: number): void {
  manifestCache.delete(key);
  manifestCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (manifestCache.size > MANIFEST_CACHE_LIMIT) {
    const oldestKey = manifestCache.keys().next().value;
    if (oldestKey === undefined) break;
    manifestCache.delete(oldestKey);
  }
}

async function getVideoManifest(key: string, url: string): Promise<VideoManifest | null> {
  const cached = readManifestCache(key);
  if (cached.hit) return cached.value;
  const inFlight = manifestRequests.get(key);
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      const res = await fetch(url);
      const manifest = res.ok ? await safeJson<VideoManifest>(res) : null;
      const ttl = manifest
        ? (manifest.sources.length > 0 ? READY_MANIFEST_TTL_MS : PENDING_MANIFEST_TTL_MS)
        : EMPTY_MANIFEST_TTL_MS;
      writeManifestCache(key, manifest, ttl);
      return manifest;
    } catch {
      // A failed connection is not cached; a later network event can retry.
      return null;
    }
  })();
  manifestRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (manifestRequests.get(key) === request) manifestRequests.delete(key);
  }
}

export async function getAssetVideoManifest(
  assetId: string,
): Promise<VideoManifest | null> {
  if (!EDGE_BASE || !assetId) return null;
  return getVideoManifest(`asset:${assetId}`, `${EDGE_BASE}/${assetId}/manifest`);
}

export async function getPostVideoManifest(
  postId: string,
): Promise<VideoManifest | null> {
  if (!EDGE_BASE || !postId) return null;
  return getVideoManifest(`post:${postId}`, `${EDGE_BASE}/by-post/${postId}/manifest`);
}

// ─── Capability detection ─────────────────────────────────────────────────

let _av1Supported: boolean | null = null;
function detectAv1Support(): boolean {
  if (_av1Supported !== null) return _av1Supported;
  // Android playback uses the native H.264 path.
  _av1Supported = false;
  return false;
}

export function isAv1Supported(): boolean {
  return detectAv1Support();
}

/**
 * Pick the best playback URL for the current device given a manifest.
 *
 * Preference order:
 *   1. AV1 (highest height ≤ targetHeight) when supported
 *   2. H.264 (highest height ≤ targetHeight)
 *   3. The unencoded source URL (`fallback_url`) if no rendition is ready yet
 */
export function pickBestSource(
  manifest: VideoManifest | null,
  opts: { targetHeight?: number; maxBitrateKbps?: number } = {},
): { url: string; codec: "h264" | "av1" | "source"; height: number | null } {
  const target = opts.targetHeight ?? 720;
  if (!manifest) {
    return { url: "", codec: "source", height: null };
  }
  const av1Ok = isAv1Supported();
  const ready = manifest.sources.filter(
    (s) => s.codec === "h264" || (s.codec === "av1" && av1Ok),
  );

  function pickFor(codec: "av1" | "h264"): VideoSource | null {
    const candidates = ready.filter((s) => s.codec === codec);
    if (!candidates.length) return null;
    const bitrateCandidates = opts.maxBitrateKbps
      ? candidates.filter((s) => s.bitrate_kbps == null || s.bitrate_kbps <= opts.maxBitrateKbps!)
      : candidates;
    if (opts.maxBitrateKbps && bitrateCandidates.length === 0) {
      return candidates.reduce((best, candidate) => {
        const bestBitrate = best.bitrate_kbps ?? Number.POSITIVE_INFINITY;
        const candidateBitrate = candidate.bitrate_kbps ?? Number.POSITIVE_INFINITY;
        if (candidateBitrate !== bestBitrate) return candidateBitrate < bestBitrate ? candidate : best;
        return candidate.height < best.height ? candidate : best;
      });
    }
    const available = bitrateCandidates.length > 0 ? bitrateCandidates : candidates;
    const atOrBelow = available.filter((s) => s.height <= target);
    if (atOrBelow.length) {
      return atOrBelow.reduce((a, b) => (a.height >= b.height ? a : b));
    }
    return available.reduce((a, b) => (a.height <= b.height ? a : b));
  }

  const av1 = av1Ok ? pickFor("av1") : null;
  if (av1) return { url: av1.url, codec: "av1", height: av1.height };

  const h264 = pickFor("h264");
  if (h264) return { url: h264.url, codec: "h264", height: h264.height };

  return { url: manifest.fallback_url, codec: "source", height: null };
}

// Re-export the Supabase project URL for callers that need it directly.
export const SUPABASE_PUBLIC_URL: string = supabaseUrl;
