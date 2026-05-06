import { useEffect, useRef, useState } from "react";
import {
  getPostVideoManifest,
  pickBestSource,
  type VideoManifest,
} from "@/lib/videoApi";

interface ResolvedSource {
  uri: string;
  codec: "av1" | "h264" | "source";
  height: number | null;
  manifest: VideoManifest | null;
}

/**
 * Resolve the best playback URL for a post.
 *
 *   - Returns the unencoded `fallbackUrl` immediately so the player starts right away.
 *   - Fetches the encoding manifest in the background and swaps in the best
 *     codec/height once available.
 *   - If the manifest returns null on the first attempt the hook stops polling
 *     immediately (the server is not configured or the post has no encoded
 *     versions). This prevents flooding the API with repeated 503 requests.
 *   - If the manifest exists but has no sources yet (still encoding), it retries
 *     every 8 s for up to 64 s so freshly-uploaded posts get the optimised
 *     rendition without the user refreshing.
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
    const MAX_ATTEMPTS = 8; // ~64 s while encoding

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
        // Keep polling only while more renditions may still arrive
        const av1Done = manifest.sources.some((s) => s.codec === "av1");
        const h264Done = manifest.sources.some((s) => s.codec === "h264");
        if (av1Done && h264Done) return;
      }

      // Stop conditions:
      //   - manifest === null  → server unavailable / not configured (503) or no
      //     manifest at all — stop immediately, no point retrying
      //   - manifest exists but empty → still encoding, keep retrying
      //   - attempts exhausted
      if (manifest !== null && attempts < MAX_ATTEMPTS) {
        timer = setTimeout(tick, 8000);
      }
      // If manifest === null we fall through without scheduling another tick.
    }

    tick();

    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, fallbackUrl, opts.targetHeight]);

  return state;
}
