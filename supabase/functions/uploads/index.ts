/**
 * Supabase Edge Function: uploads
 *
 * Handles all Cloudflare R2 upload operations.  Zero external npm/CDN
 * dependencies — uses only native Deno Web Crypto for AWS Signature V4
 * and the built-in Supabase environment variables for auth.
 *
 * Routes  (sub-path after /functions/v1/uploads):
 *   GET    /config  — public R2 base URL (no auth required)
 *   POST   /sign    — presigned PUT URL for direct native upload
 *   POST   /upload  — proxy-upload bytes to R2 (web clients)
 *   GET    /usage   — per-bucket storage totals for the calling user
 *   GET    /list    — paginated file list inside one bucket
 *   DELETE /object  — delete one object owned by the calling user
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const ALLOWED_BUCKETS = new Set([
  "avatars", "banners", "post-images", "videos", "stories",
  "group-avatars", "chat-media", "voice-messages", "shop-media", "match-photos",
]);
const SCOPED_BUCKETS = ALLOWED_BUCKETS; // all buckets are user-scoped
const USER_BUCKETS = [...ALLOWED_BUCKETS];

const MAX_PATH = 512;
const MAX_UPLOAD = 100 * 1024 * 1024;   // 100 MB
const QUOTA = 5 * 1024 * 1024 * 1024;   // 5 GB

// ── JSON helpers ──────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── AWS Signature V4 (native Web Crypto, no external deps) ───────────────────

const enc = new TextEncoder();

function buf2hex(b: ArrayBuffer): string {
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function sha256hex(data: string | ArrayBuffer): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : new Uint8Array(data);
  return buf2hex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmacSHA256(key: ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}

async function signingKey(secret: string, date: string, region: string, svc: string): Promise<ArrayBuffer> {
  const kDate = await hmacSHA256(enc.encode(`AWS4${secret}`), date);
  const kRegion = await hmacSHA256(kDate, region);
  const kSvc = await hmacSHA256(kRegion, svc);
  return hmacSHA256(kSvc, "aws4_request");
}

function amzDate(d = new Date()): { datetime: string; date: string } {
  const dt = d.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  return { datetime: dt, date: dt.slice(0, 8) };
}

/** URI-encode a path segment per S3 rules (preserve /, don't double-encode) */
function encodeKey(key: string): string {
  return key.split("/").map((s) => encodeURIComponent(s)).join("/");
}

interface R2Config {
  endpoint: string;   // e.g. https://<id>.r2.cloudflarestorage.com
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

/** Build a presigned PUT URL for direct client → R2 uploads. */
async function presignPut(cfg: R2Config, key: string, contentType: string, expiresIn = 600): Promise<string> {
  const { datetime, date } = amzDate();
  const region = "auto";
  const svc = "s3";
  const host = new URL(cfg.endpoint).hostname;
  const path = `/${cfg.bucket}/${encodeKey(key)}`;
  const credential = `${cfg.accessKeyId}/${date}/${region}/${svc}/aws4_request`;

  const qs = new URLSearchParams([
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", datetime],
    ["X-Amz-Expires", String(expiresIn)],
    ["X-Amz-SignedHeaders", "content-type;host"],
    ["X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD"],
  ].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const canonicalQS = qs.toString().replace(/\+/g, "%20");

  const canonHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonReq = [
    "PUT", path, canonicalQS, canonHeaders, signedHeaders, "UNSIGNED-PAYLOAD",
  ].join("\n");

  const scope = `${date}/${region}/${svc}/aws4_request`;
  const sts = ["AWS4-HMAC-SHA256", datetime, scope, await sha256hex(canonReq)].join("\n");
  const sk = await signingKey(cfg.secretAccessKey, date, region, svc);
  const sig = buf2hex(await hmacSHA256(sk, sts));

  return `${cfg.endpoint}/${cfg.bucket}/${encodeKey(key)}?${canonicalQS}&X-Amz-Signature=${sig}`;
}

/** Sign and execute an S3 request (PUT, DELETE, LIST). */
async function s3Fetch(
  cfg: R2Config,
  method: string,
  key: string | null,
  body: ArrayBuffer | null,
  extraHeaders: Record<string, string> = {},
  queryParams: Record<string, string> = {},
): Promise<Response> {
  const { datetime, date } = amzDate();
  const region = "auto";
  const svc = "s3";
  const host = new URL(cfg.endpoint).hostname;
  const path = key ? `/${cfg.bucket}/${encodeKey(key)}` : `/${cfg.bucket}`;

  const payloadHash = body
    ? await sha256hex(body)
    : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  const hdrs: Record<string, string> = {
    host,
    "x-amz-date": datetime,
    "x-amz-content-sha256": payloadHash,
    ...extraHeaders,
  };

  const sortedKeys = Object.keys(hdrs).map((k) => k.toLowerCase()).sort();
  const canonHeaders = sortedKeys.map((k) => `${k}:${hdrs[k].trim()}`).join("\n") + "\n";
  const signedHeaders = sortedKeys.join(";");

  const qs = new URLSearchParams(
    Object.entries(queryParams).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
  );
  const canonQS = qs.toString().replace(/\+/g, "%20");

  const canonReq = [method, path, canonQS, canonHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${region}/${svc}/aws4_request`;
  const sts = ["AWS4-HMAC-SHA256", datetime, scope, await sha256hex(canonReq)].join("\n");
  const sk = await signingKey(cfg.secretAccessKey, date, region, svc);
  const sig = buf2hex(await hmacSHA256(sk, sts));

  const fetchHdrs: Record<string, string> = {
    Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
    "x-amz-date": datetime,
    "x-amz-content-sha256": payloadHash,
    ...extraHeaders,
  };

  const url = `${cfg.endpoint}${path}${canonQS ? `?${canonQS}` : ""}`;
  return fetch(url, { method, headers: fetchHdrs, body: body ?? undefined });
}

// ── R2 config (cached per warm instance) ─────────────────────────────────────

let r2Cache: R2Config | null = null;

async function getR2(serviceKey: string, supabaseUrl: string): Promise<R2Config | null> {
  if (r2Cache) return r2Cache;

  // Fast path: secrets set in Supabase dashboard
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "";
  const aki = Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID") || "";
  const sak = Deno.env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY") || "";
  const bucket = Deno.env.get("R2_BUCKET") || "afuchat-media";
  const pub = (Deno.env.get("R2_PUBLIC_BASE_URL") || Deno.env.get("R2_DEV_PUBLIC_URL") || "").replace(/\/+$/, "");
  const ep = Deno.env.get("R2_S3_ENDPOINT") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (aki && sak && ep && pub) {
    r2Cache = { endpoint: ep, accessKeyId: aki, secretAccessKey: sak, bucket, publicBaseUrl: pub };
    return r2Cache;
  }

  // Slow path: load from app_settings (same source as Express API server)
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/app_settings?select=key,value`, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
    });
    if (!resp.ok) { console.error("app_settings fetch failed:", resp.status); return null; }
    const rows: { key: string; value: string }[] = await resp.json();
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;

    const aid = s["CLOUDFLARE_ACCOUNT_ID"] || "";
    const a = s["CLOUDFLARE_R2_ACCESS_KEY_ID"] || "";
    const k = s["CLOUDFLARE_R2_SECRET_ACCESS_KEY"] || "";
    const b = s["R2_BUCKET"] || "afuchat-media";
    const p = (s["R2_PUBLIC_BASE_URL"] || s["R2_DEV_PUBLIC_URL"] || "").replace(/\/+$/, "");
    const e = s["R2_S3_ENDPOINT"] || (aid ? `https://${aid}.r2.cloudflarestorage.com` : "");

    if (!a || !k || !e || !p) { console.error("R2 credentials incomplete"); return null; }
    r2Cache = { endpoint: e, accessKeyId: a, secretAccessKey: k, bucket: b, publicBaseUrl: p };
    return r2Cache;
  } catch (err) {
    console.error("Failed to load app_settings:", err);
    return null;
  }
}

function publicUrl(cfg: R2Config, key: string): string {
  return `${cfg.publicBaseUrl}/${encodeKey(key)}`;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function authedUserId(req: Request, supabaseUrl: string, serviceKey: string): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!jwt) return null;
  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: serviceKey },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.id ?? null;
  } catch { return null; }
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleSign(req: Request, userId: string, cfg: R2Config): Promise<Response> {
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { bucket, path, contentType } = body || {};
  if (!bucket || !ALLOWED_BUCKETS.has(bucket)) return json({ error: "Invalid or missing bucket" }, 400);
  if (!path || typeof path !== "string" || path.length > MAX_PATH || path.includes("..") || path.startsWith("/"))
    return json({ error: "Invalid or missing path" }, 400);
  if (!contentType || typeof contentType !== "string") return json({ error: "Invalid or missing contentType" }, 400);
  if (SCOPED_BUCKETS.has(bucket) && !path.startsWith(`${userId}/`))
    return json({ error: "Path must start with your user id" }, 403);

  const key = `${bucket}/${path}`;
  try {
    const uploadUrl = await presignPut(cfg, key, contentType);
    return json({ uploadUrl, publicUrl: publicUrl(cfg, key), key, expiresIn: 600 });
  } catch (e: any) {
    console.error("presign failed:", e?.message);
    return json({ error: e?.message || "Failed to sign upload" }, 500);
  }
}

async function handleUpload(req: Request, userId: string, cfg: R2Config): Promise<Response> {
  const url = new URL(req.url);
  const bucket = url.searchParams.get("bucket") || "";
  const path = url.searchParams.get("path") || "";
  const contentType = req.headers.get("content-type") || "application/octet-stream";

  if (!bucket || !ALLOWED_BUCKETS.has(bucket)) return json({ error: "Invalid or missing bucket" }, 400);
  if (!path || path.length > MAX_PATH || path.includes("..") || path.startsWith("/"))
    return json({ error: "Invalid or missing path" }, 400);
  if (SCOPED_BUCKETS.has(bucket) && !path.startsWith(`${userId}/`))
    return json({ error: "Path must start with your user id" }, 403);

  let bodyBuf: ArrayBuffer;
  try { bodyBuf = await req.arrayBuffer(); } catch { return json({ error: "Failed to read body" }, 400); }
  if (!bodyBuf.byteLength) return json({ error: "Empty body" }, 400);
  if (bodyBuf.byteLength > MAX_UPLOAD) return json({ error: "File too large" }, 413);

  const key = `${bucket}/${path}`;
  try {
    const resp = await s3Fetch(cfg, "PUT", key, bodyBuf, { "content-type": contentType });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return json({ error: `R2 PUT failed (${resp.status}): ${txt.slice(0, 200)}` }, 502);
    }
    return json({ ok: true, key, publicUrl: publicUrl(cfg, key), size: bodyBuf.byteLength });
  } catch (e: any) {
    console.error("proxy upload failed:", e?.message);
    return json({ error: e?.message || "Upload failed" }, 500);
  }
}

function parseListXml(xml: string): { keys: string[]; sizes: number[]; dates: string[]; nextToken: string | null } {
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  const sizes = [...xml.matchAll(/<Size>(\d+)<\/Size>/g)].map((m) => parseInt(m[1], 10));
  const dates = [...xml.matchAll(/<LastModified>([^<]+)<\/LastModified>/g)].map((m) => m[1]);
  const nt = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
  return { keys, sizes, dates, nextToken: nt ? nt[1] : null };
}

async function handleUsage(userId: string, cfg: R2Config): Promise<Response> {
  const perBucket: Record<string, { bytes: number; count: number }> = {};
  let totalBytes = 0;
  let totalCount = 0;

  await Promise.all(USER_BUCKETS.map(async (bucket) => {
    const prefix = `${bucket}/${userId}/`;
    let bytes = 0;
    let count = 0;
    let token: string | undefined;
    do {
      const qp: Record<string, string> = { "list-type": "2", prefix, "max-keys": "1000" };
      if (token) qp["continuation-token"] = token;
      try {
        const r = await s3Fetch(cfg, "GET", null, null, {}, qp);
        const xml = await r.text();
        const parsed = parseListXml(xml);
        bytes += parsed.sizes.reduce((a, b) => a + b, 0);
        count += parsed.keys.length;
        token = parsed.nextToken ?? undefined;
      } catch { token = undefined; }
    } while (token);
    perBucket[bucket] = { bytes, count };
    totalBytes += bytes;
    totalCount += count;
  }));

  return json({
    user_id: userId,
    used_bytes: totalBytes,
    used_count: totalCount,
    quota_bytes: QUOTA,
    remaining_bytes: Math.max(0, QUOTA - totalBytes),
    percent_used: (totalBytes / QUOTA) * 100,
    per_bucket: perBucket,
  });
}

async function handleList(req: Request, userId: string, cfg: R2Config): Promise<Response> {
  const url = new URL(req.url);
  const bucket = url.searchParams.get("bucket") || "";
  const token = url.searchParams.get("token") || undefined;

  if (!bucket || !ALLOWED_BUCKETS.has(bucket)) return json({ error: "Invalid or missing bucket" }, 400);

  const prefix = `${bucket}/${userId}/`;
  const qp: Record<string, string> = { "list-type": "2", prefix, "max-keys": "100" };
  if (token) qp["continuation-token"] = token;

  try {
    const r = await s3Fetch(cfg, "GET", null, null, {}, qp);
    const xml = await r.text();
    const { keys, sizes, dates, nextToken } = parseListXml(xml);
    return json({
      bucket,
      items: keys.map((key, i) => ({
        key,
        size: sizes[i] ?? 0,
        last_modified: dates[i] ?? null,
        url: publicUrl(cfg, key),
      })),
      next_token: nextToken,
    });
  } catch (e: any) {
    return json({ error: e?.message || "List failed" }, 500);
  }
}

async function handleDelete(req: Request, userId: string, cfg: R2Config): Promise<Response> {
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const key = String((body || {}).key || "").trim();
  if (!key || key.length > MAX_PATH || key.includes("..") || key.startsWith("/"))
    return json({ error: "Invalid or missing key" }, 400);

  const slash = key.indexOf("/");
  const bucket = slash > 0 ? key.slice(0, slash) : "";
  if (!bucket || !ALLOWED_BUCKETS.has(bucket)) return json({ error: "Invalid bucket in key" }, 400);

  // Security: key must be <bucket>/<userId>/...
  const afterBucket = key.slice(slash + 1);
  const ownerId = afterBucket.split("/")[0];
  if (ownerId !== userId) return json({ error: "Cannot delete other users' files" }, 403);

  try {
    const r = await s3Fetch(cfg, "DELETE", key, null);
    if (!r.ok && r.status !== 204 && r.status !== 404)
      return json({ error: `R2 DELETE failed (${r.status})` }, 502);
    return json({ ok: true, key });
  } catch (e: any) {
    return json({ error: e?.message || "Delete failed" }, 500);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  // Derive action from the last URL path segment
  const pathname = new URL(req.url).pathname;
  const action = pathname.split("/").filter(Boolean).pop() || "";

  // Unauthenticated config
  if (action === "config" && req.method === "GET") {
    const cfg = await getR2(serviceKey, supabaseUrl);
    return json({ publicBaseUrl: cfg?.publicBaseUrl ?? null, configured: !!cfg });
  }

  // All other routes require auth
  const userId = await authedUserId(req, supabaseUrl, serviceKey);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const cfg = await getR2(serviceKey, supabaseUrl);
  if (!cfg) return json({ error: "R2 storage not configured" }, 503);

  if (action === "sign" && req.method === "POST") return handleSign(req, userId, cfg);
  if (action === "upload" && req.method === "POST") return handleUpload(req, userId, cfg);
  if (action === "usage" && req.method === "GET") return handleUsage(userId, cfg);
  if (action === "list" && req.method === "GET") return handleList(req, userId, cfg);
  if (action === "object" && req.method === "DELETE") return handleDelete(req, userId, cfg);

  return json({ error: "Not found" }, 404);
});
