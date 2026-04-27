/**
 * Video pipeline endpoints
 * ────────────────────────
 *   POST /api/videos                      — register a freshly uploaded source
 *   GET  /api/videos/:id                  — full asset + renditions (debug/admin)
 *   GET  /api/videos/:id/manifest         — playback manifest for an asset_id
 *   GET  /api/videos/by-post/:postId/manifest
 *                                         — playback manifest looked up by post
 *
 * The manifest endpoint is the only thing clients need at playback time.
 */

import { Router, type Request, type Response } from "express";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { publicUrlFor } from "../lib/videoStorage";
import { RENDITION_HEIGHTS, type Codec } from "../lib/ffmpeg";
import { logger } from "../lib/logger";
import { notifyJobsAvailable } from "../services/videoEncoder";

const router = Router();

// ─── helpers ──────────────────────────────────────────────────────────────

async function authedUser(
  req: Request,
  res: Response,
): Promise<{ userId: string } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    res.status(503).json({ error: "Server not configured for video pipeline" });
    return null;
  }
  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) {
    res.status(401).json({ error: "Missing authorization token" });
    return null;
  }
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
  return { userId: user.id };
}

const HEIGHT_PRIORITY: Record<number, number> = { 720: 0, 1080: 5, 360: 10 };

const PRIORITY_BY_CODEC: Record<Codec, number> = {
  h264: 10, // fast, baseline — encode first so playback is available quickly
  av1: 50,  // background — bandwidth optimization
};

function planRenditions(sourceHeight: number | null) {
  // If we don't know source dimensions, plan all heights and rely on ffmpeg
  // to upscale-skip via the worker (it will short-circuit when source < target).
  const heights = RENDITION_HEIGHTS.filter(
    (h) => sourceHeight == null || h <= sourceHeight,
  );
  // Always include at least 360p so universally-compatible playback exists.
  const finalHeights = heights.length ? heights : [360];

  const plan: Array<{
    codec: Codec;
    height: number;
    priority: number;
  }> = [];
  for (const codec of ["h264", "av1"] as const) {
    for (const height of finalHeights) {
      const heightBoost = HEIGHT_PRIORITY[height] ?? 20;
      plan.push({
        codec,
        height,
        priority: PRIORITY_BY_CODEC[codec] + heightBoost,
      });
    }
  }
  return plan;
}

function mimeFor(codec: Codec, container: string): string {
  if (container === "mp4") {
    return codec === "av1"
      ? 'video/mp4; codecs="av01.0.05M.08"'
      : 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';
  }
  if (container === "webm") return "video/webm";
  if (container === "hls") return "application/vnd.apple.mpegurl";
  if (container === "dash") return "application/dash+xml";
  return "video/mp4";
}

// ─── POST /api/videos ─────────────────────────────────────────────────────

interface RegisterBody {
  source_path: string;          // path in the `videos` bucket
  post_id?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  source_size_bytes?: number | null;
  source_mime?: string | null;
}

router.post("/videos", async (req: Request, res: Response) => {
  try {
    const auth = await authedUser(req, res);
    if (!auth) return;

    const admin = getSupabaseAdmin()!;
    const body = (req.body || {}) as RegisterBody;

    if (!body.source_path || typeof body.source_path !== "string") {
      return res.status(400).json({ error: "source_path is required" });
    }

    // Sanity: the path must live under the user's folder. Existing app uploads
    // go to `${userId}/...`, matching the storage RLS policy.
    if (!body.source_path.startsWith(`${auth.userId}/`)) {
      return res.status(403).json({ error: "source_path is not owned by caller" });
    }

    // Insert asset.
    const { data: asset, error: assetErr } = await admin
      .from("video_assets")
      .insert({
        owner_id: auth.userId,
        post_id: body.post_id ?? null,
        source_path: body.source_path,
        source_size_bytes: body.source_size_bytes ?? null,
        source_mime: body.source_mime ?? null,
        duration_seconds: body.duration ?? null,
        width: body.width ?? null,
        height: body.height ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (assetErr || !asset) {
      logger.error({ err: assetErr }, "video_assets insert failed");
      return res.status(500).json({ error: assetErr?.message || "insert failed" });
    }

    const assetId = (asset as { id: string }).id;

    // Plan renditions + jobs.
    const plan = planRenditions(body.height ?? null);
    const renditionRows = plan.map((p) => ({
      asset_id: assetId,
      codec: p.codec,
      container: "mp4",
      height: p.height,
      status: "pending" as const,
    }));

    const { data: renditions, error: renErr } = await admin
      .from("video_renditions")
      .insert(renditionRows)
      .select("id, codec, height");
    if (renErr || !renditions) {
      logger.error({ err: renErr }, "video_renditions insert failed");
      return res.status(500).json({ error: renErr?.message || "insert failed" });
    }

    const jobRows = (renditions as Array<{
      id: string;
      codec: Codec;
      height: number;
    }>).map((r) => ({
      asset_id: assetId,
      rendition_id: r.id,
      codec: r.codec,
      height: r.height,
      priority: PRIORITY_BY_CODEC[r.codec] + (HEIGHT_PRIORITY[r.height] ?? 20),
      status: "queued" as const,
    }));
    const { error: jobErr } = await admin.from("video_jobs").insert(jobRows);
    if (jobErr) {
      logger.error({ err: jobErr }, "video_jobs insert failed");
      return res.status(500).json({ error: jobErr.message });
    }

    // Best-effort: link to post.
    if (body.post_id) {
      await admin
        .from("posts")
        .update({ video_asset_id: assetId })
        .eq("id", body.post_id)
        .eq("author_id", auth.userId);
    }

    notifyJobsAvailable();

    return res.status(201).json({
      id: assetId,
      status: "pending",
      planned_renditions: plan.length,
    });
  } catch (e) {
    logger.error({ err: e }, "POST /videos failed");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ─── manifest helpers ─────────────────────────────────────────────────────

interface AssetRow {
  id: string;
  status: string;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  poster_path: string | null;
  source_path: string;
}
interface RenditionRow {
  codec: string;
  container: string;
  height: number;
  width: number | null;
  bitrate_kbps: number | null;
  storage_path: string | null;
  status: string;
}

const CODEC_ORDER: Record<string, number> = { av1: 0, h264: 1 };

async function loadAssetWithRenditions(
  assetId: string,
): Promise<{ asset: AssetRow; renditions: RenditionRow[] } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data: asset, error: aErr } = await admin
    .from("video_assets")
    .select("id, status, duration_seconds, width, height, poster_path, source_path")
    .eq("id", assetId)
    .maybeSingle();
  if (aErr || !asset) return null;

  const { data: renditions, error: rErr } = await admin
    .from("video_renditions")
    .select("codec, container, height, width, bitrate_kbps, storage_path, status")
    .eq("asset_id", assetId);
  if (rErr) return null;

  return {
    asset: asset as unknown as AssetRow,
    renditions: (renditions as unknown as RenditionRow[]) ?? [],
  };
}

function buildManifest(
  asset: AssetRow,
  renditions: RenditionRow[],
): Record<string, unknown> {
  const sources = renditions
    .filter((r) => r.status === "ready" && r.storage_path)
    .sort((a, b) => {
      const codecA = CODEC_ORDER[a.codec] ?? 9;
      const codecB = CODEC_ORDER[b.codec] ?? 9;
      if (codecA !== codecB) return codecA - codecB;
      return b.height - a.height;
    })
    .map((r) => ({
      codec: r.codec,
      container: r.container,
      height: r.height,
      width: r.width,
      bitrate_kbps: r.bitrate_kbps,
      mime: mimeFor(r.codec as Codec, r.container),
      url: publicUrlFor(r.storage_path!),
    }));

  return {
    id: asset.id,
    status: asset.status,
    duration: asset.duration_seconds,
    width: asset.width,
    height: asset.height,
    poster: asset.poster_path ? publicUrlFor(asset.poster_path) : null,
    // Source URL is always available as the universal fallback while encoding
    // is still in flight. Clients should prefer `sources` when populated.
    fallback_url: publicUrlFor(asset.source_path),
    sources,
  };
}

// ─── GET /api/videos/:id ──────────────────────────────────────────────────

router.get("/videos/:id", async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ error: "Server not configured" });

  const loaded = await loadAssetWithRenditions(req.params.id);
  if (!loaded) return res.status(404).json({ error: "Not found" });

  return res.json({
    asset: loaded.asset,
    renditions: loaded.renditions,
  });
});

// ─── GET /api/videos/:id/manifest ─────────────────────────────────────────

router.get("/videos/:id/manifest", async (req, res) => {
  const loaded = await loadAssetWithRenditions(req.params.id);
  if (!loaded) return res.status(404).json({ error: "Not found" });
  return res.json(buildManifest(loaded.asset, loaded.renditions));
});

// ─── GET /api/videos/by-post/:postId/manifest ─────────────────────────────

router.get("/videos/by-post/:postId/manifest", async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ error: "Server not configured" });

  const { data: post, error } = await admin
    .from("posts")
    .select("video_asset_id")
    .eq("id", req.params.postId)
    .maybeSingle();
  if (error || !post) return res.status(404).json({ error: "Not found" });

  const assetId = (post as { video_asset_id: string | null }).video_asset_id;
  if (!assetId) return res.status(404).json({ error: "No video asset for post" });

  const loaded = await loadAssetWithRenditions(assetId);
  if (!loaded) return res.status(404).json({ error: "Not found" });
  return res.json(buildManifest(loaded.asset, loaded.renditions));
});

export default router;
