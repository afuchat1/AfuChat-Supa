/**
 * Client-side helpers for the AfuChat video pipeline.
 *
 *   registerVideoAsset  — call after uploading a source file to Storage
 *   getPostVideoManifest — fetch playback manifest for a post
 *   getAssetVideoManifest — fetch playback manifest for an asset
 *   pickBestSource      — choose the best rendition for the current device
 */
import { Platform } from "react-native";
import { supabase, supabaseUrl } from "./supabase";

// The API server base URL. _layout.tsx sets the api-client base URL via
// `setBaseUrl(https://${EXPO_PUBLIC_DOMAIN})`, but this module fetches
// directly so it can be used outside the generated react-query client.
const API_BASE: string = (() => {
  const domain = (process.env.EXPO_PUBLIC_DOMAIN || "").trim();
  if (domain) return `https://${domain}`;
  // In local dev the API server is the same origin on web; native bundles
  // need to reach it through the public URL anyway, so this is mostly a
  // safety fallback used when EXPO_PUBLIC_DOMAIN is unset.
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
})();

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
  if (!API_BASE) return null;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(await authHeader()),
    };
    if (!headers.Authorization) return null;

    const res = await fetch(`${API_BASE}/api/videos`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      try {
        const err = await res.json();
        console.warn("registerVideoAsset failed:", res.status, err?.error);
      } catch {
        console.warn("registerVideoAsset failed:", res.status);
      }
      return null;
    }
    return (await res.json()) as RegisterVideoAssetResult;
  } catch (e) {
    console.warn("registerVideoAsset network error:", e);
    return null;
  }
}

export async function getAssetVideoManifest(
  assetId: string,
): Promise<VideoManifest | null> {
  if (!API_BASE || !assetId) return null;
  try {
    const res = await fetch(`${API_BASE}/api/videos/${assetId}/manifest`);
    if (!res.ok) return null;
    return (await res.json()) as VideoManifest;
  } catch {
    return null;
  }
}

export async function getPostVideoManifest(
  postId: string,
): Promise<VideoManifest | null> {
  if (!API_BASE || !postId) return null;
  try {
    const res = await fetch(
      `${API_BASE}/api/videos/by-post/${postId}/manifest`,
    );
    if (!res.ok) return null;
    return (await res.json()) as VideoManifest;
  } catch {
    return null;
  }
}

// ─── Capability detection ─────────────────────────────────────────────────

let _av1Supported: boolean | null = null;
function detectAv1Support(): boolean {
  if (_av1Supported !== null) return _av1Supported;
  // expo-av on iOS/Android does not reliably play AV1 — H.264 only.
  if (Platform.OS !== "web") {
    _av1Supported = false;
    return false;
  }
  try {
    if (typeof MediaSource !== "undefined" && MediaSource?.isTypeSupported) {
      _av1Supported = MediaSource.isTypeSupported(
        'video/mp4; codecs="av01.0.05M.08"',
      );
      return _av1Supported;
    }
    // Fallback to <video>.canPlayType which returns "", "maybe" or "probably".
    if (typeof document !== "undefined") {
      const v = document.createElement("video");
      _av1Supported = !!v.canPlayType('video/mp4; codecs="av01.0.05M.08"');
      return _av1Supported;
    }
  } catch {
    /* ignore */
  }
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
  opts: { targetHeight?: number } = {},
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
    const atOrBelow = candidates.filter((s) => s.height <= target);
    if (atOrBelow.length) {
      return atOrBelow.reduce((a, b) => (a.height >= b.height ? a : b));
    }
    return candidates.reduce((a, b) => (a.height <= b.height ? a : b));
  }

  const av1 = av1Ok ? pickFor("av1") : null;
  if (av1) return { url: av1.url, codec: "av1", height: av1.height };

  const h264 = pickFor("h264");
  if (h264) return { url: h264.url, codec: "h264", height: h264.height };

  return { url: manifest.fallback_url, codec: "source", height: null };
}

// Re-export the raw supabase URL so callers can resolve storage paths if
// they ever need to bypass the manifest.
export const SUPABASE_PUBLIC_URL: string = supabaseUrl;
