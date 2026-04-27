import { useEffect, useRef, useState } from "react";
import {
  getPostVideoManifest,
  pickBestSource,
  type VideoManifest,
} from "@/lib/videoApi";

interface ResolvedSource {
  /** URL to feed into the player. Always defined (falls back to `fallbackUrl`). */
  uri: string;
  /** Which codec is being played: "av1", "h264", or "source" (unencoded original). */
  codec: "av1" | "h264" | "source";
  /** Selected rendition height, or null when playing the source fallback. */
  height: number | null;
  manifest: VideoManifest | null;
}

/**
 * Resolve the best playback URL for a post.
 *
 *   - Returns the unencoded `fallbackUrl` immediately so the player can start.
 *   - In the background, fetches the encoding manifest from the API server
 *     and (when ready) swaps in the best codec/height for the device.
 *   - Re-checks every 8 seconds for up to 60s if the asset is still encoding,
 *     so users on a freshly uploaded post get the optimized rendition without
 *     having to refresh.
 */
export function useResolvedVideoSource(
  postId: string | null | undefined,
  fallbackUrl: string,
  opts: { videoAssetId?: string | null; targetHeight?: number } = {},
): ResolvedSource {
  const [state, setState] = useState<ResolvedSource>({
    uri: fallbackUrl,
    codec: "source",
    height: null,
    manifest: null,
  });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    setState({ uri: fallbackUrl, codec: "source", height: null, manifest: null });

    if (!postId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 8; // ~64s of polling while encoding

    async function tick() {
      if (cancelled.current) return;
      attempts++;
      const manifest = await getPostVideoManifest(postId!);
      if (cancelled.current) return;

      if (manifest && manifest.sources.length > 0) {
        const picked = pickBestSource(manifest, {
          targetHeight: opts.targetHeight ?? 720,
        });
        setState({
          uri: picked.url || fallbackUrl,
          codec: picked.codec,
          height: picked.height,
          manifest,
        });
        // Keep polling if more renditions might still arrive (e.g. AV1).
        const av1Done = manifest.sources.some((s) => s.codec === "av1");
        const h264Done = manifest.sources.some((s) => s.codec === "h264");
        if (av1Done && h264Done) return; // Fully ready; stop polling.
      }

      if (attempts < MAX_ATTEMPTS) {
        timer = setTimeout(tick, 8000);
      }
    }

    tick();

    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  // We intentionally treat fallbackUrl + postId as the cache key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, fallbackUrl, opts.targetHeight]);

  return state;
}
