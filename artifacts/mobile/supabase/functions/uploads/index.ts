// uploads — Supabase Edge Function (Deno)
// Handles all media uploads to Cloudflare R2.
//
// Routes:
//   POST   /uploads/sign     → presigned PUT URL for direct R2 upload
//   POST   /uploads/upload   → proxied upload (bytes → R2 server-side)
//   GET    /uploads/usage    → storage usage stats for the caller
//   GET    /uploads/list     → list user files in a bucket
//   DELETE /uploads/object   → delete an R2 object
//
// Supabase secrets used (set via Dashboard → Settings → Edge Functions):
//   SUPABASE_URL                  — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY     — auto-injected
//   CLOUDFLARE_ACCOUNT_ID         — Cloudflare account ID
//   CLOUDFLARE_R2_ACCESS_KEY_ID   — R2 API token key ID
//   CLOUDFLARE_R2_SECRET_ACCESS_KEY — R2 API token secret
//   R2_BUCKET                     — R2 bucket name (e.g. "afuchat-media")
//   R2_PUBLIC_BASE_URL            — CDN base URL (e.g. "https://cdn.afuchat.com")
//
// R2 key structure: {logical-bucket}/{user-id}/{filename}
// CDN URL:          {R2_PUBLIC_BASE_URL}/{logical-bucket}/{user-id}/{filename}

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

// ── CORS ────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Config ───────────────────────────────────────────────────────────────────

interface Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}

function getConfig(): Config {
  return {
    accountId: Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "",
    accessKeyId: Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID") ?? "",
    secretAccessKey: Deno.env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY") ?? "",
    bucket: Deno.env.get("R2_BUCKET") ?? "afuchat-media",
    publicBaseUrl: (Deno.env.get("R2_PUBLIC_BASE_URL") ?? "").replace(/\/$/, ""),
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  };
}

function getS3Client(cfg: Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function verifyAuth(req: Request, cfg: Config): Promise<string | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;
  if (!cfg.serviceRoleKey) return null;

  const admin = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the R2 object key from logical bucket + caller-supplied path.
 * Key structure: {logicalBucket}/{callerPath}
 * The callerPath from the app is always "{userId}/{filename}", so the full key
 * ends up as "{logicalBucket}/{userId}/{filename}" — a clean, routable path.
 */
function buildKey(logicalBucket: string, callerPath: string): string {
  // Strip leading slashes so we never double-slash.
  const bucket = logicalBucket.replace(/^\/+/, "").replace(/\/+$/, "");
  const path = callerPath.replace(/^\/+/, "");
  const parts = path.split("/").filter(Boolean);
  if (!bucket || !parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Invalid storage path");
  }
  return `${bucket}/${path}`;
}

function publicUrl(cfg: Config, key: string): string {
  return `${cfg.publicBaseUrl}/${key}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const cfg = getConfig();

  if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey) {
    console.error("[uploads] R2 credentials not configured");
    return json({ error: "Storage service not configured" }, 503);
  }
  if (!cfg.publicBaseUrl) {
    console.error("[uploads] R2_PUBLIC_BASE_URL not set");
    return json({ error: "Storage service not configured" }, 503);
  }

  // Extract the action from the URL path.
  // Deployed URL: https://<project>.functions.supabase.co/uploads/<action>
  // or:           https://<project>.supabase.co/functions/v1/uploads/<action>
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const action = segments[segments.length - 1]; // last non-empty segment

  // Verify caller JWT for every route.
  const userId = await verifyAuth(req, cfg);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const s3 = getS3Client(cfg);

  try {

    // ── POST /uploads/sign ──────────────────────────────────────────────────
    // Returns a presigned PUT URL so the client can stream bytes directly to R2.
    if (action === "sign" && req.method === "POST") {
      let body: { bucket?: string; path?: string; contentType?: string } = {};
      try { body = await req.json(); } catch { /* empty body is fine */ }

      const logicalBucket = (body.bucket ?? "uploads").trim();
      const callerPath = (body.path ?? `${userId}/${Date.now()}`).trim();
      const contentType = (body.contentType ?? "application/octet-stream").trim();

      const key = buildKey(logicalBucket, callerPath);
      const cdnUrl = publicUrl(cfg, key);

      const command = new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        ContentType: contentType,
      });

      // Presigned URL valid for 5 minutes — plenty for large video uploads.
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

      console.log(`[uploads/sign] userId=${userId} key=${key}`);
      return json({ uploadUrl, publicUrl: cdnUrl, key });
    }

    // ── POST /uploads/read ───────────────────────────────────────────────────
    // Returns a short-lived R2 GET URL for a private AfuMusic track. The
    // database check is intentionally server-side so a client cannot turn a
    // track key into an unrestricted download URL.
    if (action === "read" && req.method === "POST") {
      let body: { bucket?: string; path?: string; trackId?: string } = {};
      try { body = await req.json(); } catch { /* invalid body handled below */ }

      const logicalBucket = (body.bucket ?? "").trim();
      const callerPath = (body.path ?? "").trim();
      const trackId = (body.trackId ?? "").trim();
      if (logicalBucket !== "music" || !callerPath || !trackId) {
        return json({ error: "A music bucket, path, and trackId are required" }, 400);
      }

      const admin = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: track, error: trackError } = await admin
        .from("music_tracks")
        .select("creator_id,price_acoin,storage_path,status")
        .eq("id", trackId)
        .maybeSingle();

      if (trackError) throw trackError;
      if (
        !track ||
        track.status !== "published" ||
        track.storage_path !== callerPath
      ) {
        return json({ error: "Track not available" }, 404);
      }

      const isCreator = track.creator_id === userId;
      if (!isCreator && (track.price_acoin ?? 0) > 0) {
        const { data: purchase, error: purchaseError } = await admin
          .from("music_purchases")
          .select("id")
          .eq("track_id", trackId)
          .eq("buyer_id", userId)
          .maybeSingle();
        if (purchaseError) throw purchaseError;
        if (!purchase) return json({ error: "Purchase required" }, 403);
      }

      const key = buildKey(logicalBucket, callerPath);
      const readUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
        { expiresIn: 3600 },
      );
      return json({ url: readUrl, key });
    }

    // ── POST /uploads/upload ────────────────────────────────────────────────
    // Proxied upload: client POSTs bytes here, we stream them to R2.
    // Used as fallback when direct presigned PUT is unavailable (e.g. web).
    if (action === "upload" && req.method === "POST") {
      const logicalBucket = (url.searchParams.get("bucket") ?? "uploads").trim();
      const callerPath = (url.searchParams.get("path") ?? `${userId}/${Date.now()}`).trim();
      const contentType = (req.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();

      const key = buildKey(logicalBucket, callerPath);
      const cdnUrl = publicUrl(cfg, key);

      const bodyBytes = await req.arrayBuffer();
      if (!bodyBytes.byteLength) {
    return json({ error: "Empty file body. Nothing to upload." }, 400);
      }

      await s3.send(new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: new Uint8Array(bodyBytes),
        ContentType: contentType,
        ContentLength: bodyBytes.byteLength,
      }));

      console.log(`[uploads/upload] userId=${userId} key=${key} bytes=${bodyBytes.byteLength}`);
      return json({ publicUrl: cdnUrl, key });
    }

    // ── GET /uploads/usage ──────────────────────────────────────────────────
    // Returns per-bucket and total storage usage for the authenticated user.
    if (action === "usage" && req.method === "GET") {
      const logicalBuckets = [
        "stories", "avatars", "chat-media", "voice-messages",
        "post-images", "banners", "uploads",
      ];

      const perBucket: Record<string, { bytes: number; count: number }> = {};
      let totalBytes = 0;
      let totalCount = 0;

      await Promise.all(logicalBuckets.map(async (lb) => {
        const prefix = `${lb}/${userId}/`;
        let bytes = 0;
        let count = 0;
        let continuationToken: string | undefined;

        do {
          const resp = await s3.send(new ListObjectsV2Command({
            Bucket: cfg.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }));
          for (const obj of resp.Contents ?? []) {
            bytes += obj.Size ?? 0;
            count += 1;
          }
          continuationToken = resp.NextContinuationToken;
        } while (continuationToken);

        perBucket[lb] = { bytes, count };
        totalBytes += bytes;
        totalCount += count;
      }));

      const quotaBytes = 5 * 1024 * 1024 * 1024; // 5 GB default quota
      return json({
        user_id: userId,
        used_bytes: totalBytes,
        used_count: totalCount,
        quota_bytes: quotaBytes,
        remaining_bytes: Math.max(0, quotaBytes - totalBytes),
        percent_used: Math.min(100, (totalBytes / quotaBytes) * 100),
        per_bucket: perBucket,
      });
    }

    // ── GET /uploads/list ───────────────────────────────────────────────────
    // Lists the authenticated user's files in a given logical bucket.
    if (action === "list" && req.method === "GET") {
      const logicalBucket = (url.searchParams.get("bucket") ?? "uploads").trim();
      const pageToken = url.searchParams.get("token") ?? undefined;

      const prefix = `${logicalBucket}/${userId}/`;
      const resp = await s3.send(new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: prefix,
        MaxKeys: 50,
        ContinuationToken: pageToken,
      }));

      const items = (resp.Contents ?? []).map((obj) => ({
        key: obj.Key ?? "",
        size: obj.Size ?? 0,
        last_modified: obj.LastModified?.toISOString() ?? null,
        url: obj.Key ? publicUrl(cfg, obj.Key) : null,
      }));

      return json({
        items,
        next_token: resp.NextContinuationToken ?? null,
      });
    }

    // ── DELETE /uploads/object ──────────────────────────────────────────────
    // Deletes an R2 object. Only allows deleting the caller's own files.
    if (action === "object" && req.method === "DELETE") {
      let body: { key?: string } = {};
      try { body = await req.json(); } catch { /* ignore */ }

      const { key } = body;
      if (!key) return json({ error: "key is required" }, 400);

      // Ownership check: the key must contain the user's ID as a path segment.
      // All app-generated keys follow {logicalBucket}/{userId}/{filename}.
      const keySegments = key.split("/");
      const ownerSegment = keySegments[1]; // index 1 = userId after logicalBucket
      if (ownerSegment !== userId) {
        console.warn(`[uploads/object] Forbidden delete: userId=${userId} key=${key}`);
        return json({ error: "Forbidden" }, 403);
      }

      await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
      console.log(`[uploads/object] userId=${userId} deleted key=${key}`);
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 404);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[uploads/${action}] Unhandled error:`, message);
    return json({ error: "Internal server error" }, 500);
  }
});
