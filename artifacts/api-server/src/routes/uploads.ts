/**
 * Upload signing endpoint
 * ───────────────────────
 *   POST /api/uploads/sign
 *     body: { bucket: string, path: string, contentType: string }
 *     auth: Bearer <supabase access_token>
 *
 * Returns: { uploadUrl, publicUrl, key, expiresIn }
 *
 * The mobile client calls this to get a short-lived presigned PUT URL,
 * uploads the file directly to Cloudflare R2, then writes `publicUrl`
 * into the relevant DB column.
 *
 * `bucket` is the *logical* bucket name (e.g. "avatars", "post-images").
 * Internally it's used as a key prefix inside the single R2 bucket so
 * all paths remain stable across the migration:
 *
 *     r2://afuchat-media/<bucket>/<path>
 */

import { Router, raw, type Request, type Response } from "express";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import {
  isR2Configured,
  presignPutUrl,
  publicUrlForKey,
  getR2PublicBaseUrl,
  sumPrefix,
  listPrefixPage,
  deleteObject,
  putObject,
} from "../lib/r2";
import { logger } from "../lib/logger";

const router = Router();

const MAX_PROXY_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Default storage quota per user, in bytes (5 GB). */
const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
function quotaBytesForUser(_userId: string): number {
  // Hook for future per-tier quotas (e.g. premium users get more).
  return DEFAULT_QUOTA_BYTES;
}

/** Buckets whose paths are scoped by user id (path begins with `<userId>/`). */
const USER_SCOPED_BUCKETS = [
  "avatars",
  "banners",
  "post-images",
  "videos",
  "stories",
  "group-avatars",
  "chat-media",
  "voice-messages",
  "shop-media",
  "match-photos",
];

/** Allow-list of logical bucket names to prevent arbitrary writes. */
const ALLOWED_BUCKETS = new Set([
  "avatars",
  "banners",
  "post-images",
  "videos",
  "stories",
  "group-avatars",
  "chat-media",
  "voice-messages",
  "shop-media",
  "match-photos",
]);

const MAX_PATH_LEN = 512;

async function authedUserId(req: Request, res: Response): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    res.status(503).json({ error: "Server not configured" });
    return null;
  }
  const auth = req.headers.authorization || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) {
    res.status(401).json({ error: "Missing authorization token" });
    return null;
  }
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
  return data.user.id;
}

/** Public, unauthenticated endpoint so clients know R2 base URL + bucket. */
router.get("/uploads/config", (_req, res) => {
  res.json({
    publicBaseUrl: getR2PublicBaseUrl(),
    configured: isR2Configured(),
  });
});

/**
 * GET /api/uploads/usage
 *   Returns the calling user's R2 storage footprint, broken down per
 *   logical bucket, plus their quota.
 */
router.get("/uploads/usage", async (req, res) => {
  if (!isR2Configured()) {
    return res.status(503).json({ error: "R2 storage not configured" });
  }
  const userId = await authedUserId(req, res);
  if (!userId) return;

  try {
    const perBucket: Record<string, { bytes: number; count: number }> = {};
    let totalBytes = 0;
    let totalCount = 0;

    await Promise.all(
      USER_SCOPED_BUCKETS.map(async (bucket) => {
        const prefix = `${bucket}/${userId}/`;
        const { bytes, count } = await sumPrefix(prefix);
        perBucket[bucket] = { bytes, count };
        totalBytes += bytes;
        totalCount += count;
      }),
    );

    const quota = quotaBytesForUser(userId);
    res.json({
      user_id: userId,
      used_bytes: totalBytes,
      used_count: totalCount,
      quota_bytes: quota,
      remaining_bytes: Math.max(0, quota - totalBytes),
      percent_used: quota > 0 ? totalBytes / quota : 0,
      per_bucket: perBucket,
    });
  } catch (e: any) {
    logger.error({ err: e, userId }, "usage lookup failed");
    res.status(500).json({ error: e?.message || "Failed to compute usage" });
  }
});

/**
 * GET /api/uploads/list?bucket=<bucket>&token=<continuation>
 *   Lists the calling user's files inside a single bucket. Paginated.
 */
router.get("/uploads/list", async (req, res) => {
  if (!isR2Configured()) {
    return res.status(503).json({ error: "R2 storage not configured" });
  }
  const userId = await authedUserId(req, res);
  if (!userId) return;

  const bucket = String(req.query.bucket || "");
  if (!bucket || !ALLOWED_BUCKETS.has(bucket)) {
    return res.status(400).json({ error: "Invalid or missing bucket" });
  }
  const token = req.query.token ? String(req.query.token) : undefined;

  try {
    const prefix = `${bucket}/${userId}/`;
    const { items, nextToken } = await listPrefixPage(prefix, token, 100);
    const baseUrl = getR2PublicBaseUrl();
    res.json({
      bucket,
      items: items.map((o) => ({
        key: o.key,
        size: o.size,
        last_modified: o.lastModified ? o.lastModified.toISOString() : null,
        url: baseUrl
          ? `${baseUrl}/${o.key.split("/").map(encodeURIComponent).join("/")}`
          : null,
      })),
      next_token: nextToken,
    });
  } catch (e: any) {
    logger.error({ err: e, userId, bucket }, "list failed");
    res.status(500).json({ error: e?.message || "Failed to list files" });
  }
});

/**
 * DELETE /api/uploads/object
 *   body: { key: string }
 *   Deletes a single object the user owns. The key must start with
 *   `<bucket>/<userId>/` so users can't delete each other's files.
 */
router.delete("/uploads/object", async (req, res) => {
  if (!isR2Configured()) {
    return res.status(503).json({ error: "R2 storage not configured" });
  }
  const userId = await authedUserId(req, res);
  if (!userId) return;

  const key = String((req.body || {}).key || "").trim();
  if (!key || key.length > MAX_PATH_LEN) {
    return res.status(400).json({ error: "Invalid or missing key" });
  }
  if (key.includes("..") || key.startsWith("/")) {
    return res.status(400).json({ error: "Invalid key" });
  }
  const slash = key.indexOf("/");
  const bucket = slash > 0 ? key.slice(0, slash) : "";
  if (!bucket || !ALLOWED_BUCKETS.has(bucket)) {
    return res.status(400).json({ error: "Invalid bucket in key" });
  }
  const expectedPrefix = `${bucket}/${userId}/`;
  if (!key.startsWith(expectedPrefix)) {
    return res.status(403).json({ error: "Cannot delete other users' files" });
  }

  try {
    await deleteObject(key);

    // Best-effort cleanup of DB rows that reference this file so the UI
    // doesn't show broken posts/avatars after a deletion.
    const admin = getSupabaseAdmin();
    if (admin) {
      const baseUrl = getR2PublicBaseUrl();
      const publicUrl = baseUrl
        ? `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`
        : null;
      try {
        if (bucket === "avatars" && publicUrl) {
          await admin
            .from("profiles")
            .update({ avatar_url: null })
            .eq("id", userId)
            .like("avatar_url", `${publicUrl}%`);
        } else if (bucket === "banners" && publicUrl) {
          await admin
            .from("profiles")
            .update({ banner_url: null })
            .eq("id", userId)
            .like("banner_url", `${publicUrl}%`);
        } else if (bucket === "post-images" && publicUrl) {
          await admin
            .from("posts")
            .delete()
            .eq("author_id", userId)
            .like("image_url", `${publicUrl}%`);
        } else if (bucket === "videos" && publicUrl) {
          await admin
            .from("posts")
            .delete()
            .eq("author_id", userId)
            .like("video_url", `${publicUrl}%`);
        } else if (bucket === "stories" && publicUrl) {
          await admin
            .from("stories")
            .delete()
            .eq("user_id", userId)
            .like("media_url", `${publicUrl}%`);
        }
      } catch (cleanupErr: any) {
        logger.warn(
          { err: cleanupErr, key, bucket },
          "DB cleanup after delete failed (non-fatal)",
        );
      }
    }

    res.json({ ok: true, key });
  } catch (e: any) {
    logger.error({ err: e, userId, key }, "delete failed");
    res.status(500).json({ error: e?.message || "Failed to delete file" });
  }
});

router.post("/uploads/sign", async (req, res) => {
  if (!isR2Configured()) {
    return res.status(503).json({ error: "R2 storage not configured" });
  }

  const userId = await authedUserId(req, res);
  if (!userId) return;

  const { bucket, path, contentType } = (req.body || {}) as {
    bucket?: string;
    path?: string;
    contentType?: string;
  };

  if (!bucket || !ALLOWED_BUCKETS.has(bucket)) {
    return res.status(400).json({ error: "Invalid or missing bucket" });
  }
  if (!path || typeof path !== "string" || path.length > MAX_PATH_LEN) {
    return res.status(400).json({ error: "Invalid or missing path" });
  }
  if (path.includes("..") || path.startsWith("/")) {
    return res.status(400).json({ error: "Invalid path" });
  }
  if (!contentType || typeof contentType !== "string") {
    return res.status(400).json({ error: "Invalid or missing contentType" });
  }

  // Per-bucket scoping rules: most buckets must have the path begin with
  // the user's id so users can't overwrite each other's uploads.
  const SCOPED = new Set([
    "avatars",
    "banners",
    "post-images",
    "videos",
    "stories",
    "shop-media",
    "match-photos",
    "voice-messages",
    "chat-media",
    "group-avatars",
  ]);
  if (SCOPED.has(bucket) && !path.startsWith(`${userId}/`)) {
    return res.status(403).json({ error: "Path must start with your user id" });
  }

  const key = `${bucket}/${path}`;
  try {
    const uploadUrl = await presignPutUrl(key, contentType);
    const publicUrl = publicUrlForKey(key);
    res.json({ uploadUrl, publicUrl, key, expiresIn: 600 });
  } catch (e: any) {
    logger.error({ err: e, key }, "presign failed");
    res.status(500).json({ error: e?.message || "Failed to sign upload" });
  }
});

/**
 * POST /api/uploads/upload?bucket=<bucket>&path=<path>
 *   Body: raw bytes of the file, with `Content-Type` header set.
 *   Auth: Bearer <supabase access_token>.
 *
 * Server-side proxy that streams the bytes to R2. Used by the web client
 * because browser PUT directly to *.r2.cloudflarestorage.com is blocked
 * by CORS unless the bucket is explicitly configured. Native clients can
 * still use the presigned PUT path above.
 */
router.post(
  "/uploads/upload",
  raw({ type: () => true, limit: MAX_PROXY_UPLOAD_BYTES }),
  async (req, res) => {
    if (!isR2Configured()) {
      return res.status(503).json({ error: "R2 storage not configured" });
    }
    const userId = await authedUserId(req, res);
    if (!userId) return;

    const bucket = String(req.query.bucket || "").trim();
    const path = String(req.query.path || "").trim();
    const contentType =
      String(req.headers["content-type"] || "application/octet-stream") ||
      "application/octet-stream";

    if (!bucket || !ALLOWED_BUCKETS.has(bucket)) {
      return res.status(400).json({ error: "Invalid or missing bucket" });
    }
    if (!path || path.length > MAX_PATH_LEN) {
      return res.status(400).json({ error: "Invalid or missing path" });
    }
    if (path.includes("..") || path.startsWith("/")) {
      return res.status(400).json({ error: "Invalid path" });
    }

    const SCOPED = new Set([
      "avatars",
      "banners",
      "post-images",
      "videos",
      "stories",
      "shop-media",
      "match-photos",
      "voice-messages",
      "chat-media",
      "group-avatars",
    ]);
    if (SCOPED.has(bucket) && !path.startsWith(`${userId}/`)) {
      return res.status(403).json({ error: "Path must start with your user id" });
    }

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: "Empty or invalid body" });
    }
    if (body.length > MAX_PROXY_UPLOAD_BYTES) {
      return res.status(413).json({ error: "File too large" });
    }

    const key = `${bucket}/${path}`;
    try {
      await putObject(key, body, contentType);
      const publicUrl = publicUrlForKey(key);
      res.json({ ok: true, key, publicUrl, size: body.length });
    } catch (e: any) {
      logger.error({ err: e?.message, key }, "R2 upload failed — Cloudflare R2 is the only storage backend");
      res.status(502).json({ error: e?.message || "Upload to Cloudflare R2 failed" });
    }
  },
);

export default router;
