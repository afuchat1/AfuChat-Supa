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

import { Router, type Request, type Response } from "express";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import {
  isR2Configured,
  presignPutUrl,
  publicUrlForKey,
  R2_PUBLIC_BASE_URL,
} from "../lib/r2";
import { logger } from "../lib/logger";

const router = Router();

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
    publicBaseUrl: R2_PUBLIC_BASE_URL,
    configured: isR2Configured(),
  });
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

export default router;
