/**
 * Storage abstraction layer.
 * Currently implements Cloudflare R2 via S3-compatible API.
 * Replace implementations without changing the interface.
 */
import crypto from "crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? "";
const SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "";
const BUCKET_NAME = process.env.R2_BUCKET_NAME ?? "afucloud-images";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";
const DEV_STORAGE_ROOT = path.resolve(
  process.env.AFU_DEV_STORAGE_DIR ?? path.join(process.cwd(), ".dev-storage"),
);

function devObjectPath(key: string): string {
  const normalizedKey = key.replace(/^\/+/, "");
  const objectPath = path.resolve(DEV_STORAGE_ROOT, normalizedKey);
  if (objectPath !== DEV_STORAGE_ROOT && !objectPath.startsWith(`${DEV_STORAGE_ROOT}${path.sep}`)) {
    throw new Error("Invalid storage key");
  }
  return objectPath;
}

export async function putDevObject(key: string, body: Buffer): Promise<void> {
  const objectPath = devObjectPath(key);
  await mkdir(path.dirname(objectPath), { recursive: true });
  await writeFile(objectPath, body);
}

export async function readDevObject(key: string): Promise<Buffer | null> {
  try {
    return await readFile(devObjectPath(key));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function getPublicUrl(key: string): string {
  if (R2_PUBLIC_URL) return `${R2_PUBLIC_URL}/${key}`;
  // Fallback: route through the API server image-serving endpoint
  return `/api/v1/storage/${encodeURIComponent(key)}`;
}

export function getDownloadUrl(key: string, filename: string): string {
  return `/api/v1/storage/${encodeURIComponent(key)}?download=1&filename=${encodeURIComponent(filename)}`;
}

export function hasCredentials(): boolean {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY);
}

// ── Shared SigV4 helpers ──────────────────────────────────────────────────────

function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${key}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function r2Host(): string {
  return `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function amzTimestamps(): { dateStamp: string; amzDate: string } {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  return { dateStamp, amzDate };
}

// ── Pre-signed PUT URL (browser upload) ───────────────────────────────────────

/**
 * Generate an S3-compatible pre-signed PUT URL for Cloudflare R2.
 */
export async function generateUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (!hasCredentials()) {
    return `/api/v1/storage/dev-upload/${encodeURIComponent(key)}`;
  }

  const host = r2Host();
  const region = "auto";
  const service = "s3";
  const { dateStamp, amzDate } = amzTimestamps();

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${ACCESS_KEY_ID}/${credentialScope}`;

  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": "host",
  });

  const canonicalRequest = [
    "PUT",
    `/${BUCKET_NAME}/${key}`,
    params.toString(),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const signingKey = getSignatureKey(SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  params.append("X-Amz-Signature", signature);
  return `https://${host}/${BUCKET_NAME}/${key}?${params.toString()}`;
}

export async function generateSignedDownloadUrl(
  key: string,
  filename: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (!hasCredentials()) {
    return getDownloadUrl(key, filename);
  }

  const host = r2Host();
  const region = "auto";
  const service = "s3";
  const { dateStamp, amzDate } = amzTimestamps();
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${ACCESS_KEY_ID}/${credentialScope}`;
  const disposition = `attachment; filename="${filename.replace(/["\\\r\n]/g, "_")}"`;

  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": "host",
    "response-content-disposition": disposition,
  });

  const canonicalRequest = [
    "GET",
    `/${BUCKET_NAME}/${key}`,
    params.toString(),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const signingKey = getSignatureKey(SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  params.append("X-Amz-Signature", signature);
  return `https://${host}/${BUCKET_NAME}/${key}?${params.toString()}`;
}

// ── Pre-signed GET URL (image serving) ───────────────────────────────────────

/**
 * Generate a pre-signed GET URL so the API can redirect browsers to the object
 * without exposing long-lived credentials.
 */
export async function generateSignedGetUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  if (!hasCredentials()) {
    throw new Error("R2 credentials not configured");
  }

  const host = r2Host();
  const region = "auto";
  const service = "s3";
  const { dateStamp, amzDate } = amzTimestamps();

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${ACCESS_KEY_ID}/${credentialScope}`;

  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": "host",
  });

  const canonicalRequest = [
    "GET",
    `/${BUCKET_NAME}/${key}`,
    params.toString(),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const signingKey = getSignatureKey(SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  params.append("X-Amz-Signature", signature);
  return `https://${host}/${BUCKET_NAME}/${key}?${params.toString()}`;
}

// ── Bucket CORS configuration (called once at server startup) ─────────────────

/**
 * Configure CORS on the R2 bucket so browsers can PUT directly via pre-signed URLs.
 * This is idempotent — safe to call on every startup.
 */
export async function configureBucketCors(): Promise<void> {
  if (!hasCredentials()) {
    return; // Skip in environments without R2 credentials
  }

  const corsXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<CORSConfiguration>",
    "<CORSRule>",
    "<AllowedOrigin>*</AllowedOrigin>",
    "<AllowedMethod>GET</AllowedMethod>",
    "<AllowedMethod>PUT</AllowedMethod>",
    "<AllowedMethod>DELETE</AllowedMethod>",
    "<AllowedMethod>HEAD</AllowedMethod>",
    "<AllowedHeader>*</AllowedHeader>",
    "<MaxAgeSeconds>86400</MaxAgeSeconds>",
    "</CORSRule>",
    "</CORSConfiguration>",
  ].join("");

  const host = r2Host();
  const region = "auto";
  const service = "s3";
  const { dateStamp, amzDate } = amzTimestamps();

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const payloadHash = crypto.createHash("sha256").update(corsXml).digest("hex");
  const contentMd5 = crypto.createHash("md5").update(corsXml).digest("base64");
  const contentType = "application/xml";

  const canonicalHeaders = [
    `content-md5:${contentMd5}`,
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join("\n") + "\n";

  const signedHeaders = "content-md5;content-type;host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    `/${BUCKET_NAME}`,
    "cors=",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const signingKey = getSignatureKey(SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}/${BUCKET_NAME}?cors`, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-MD5": contentMd5,
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Host: host,
    },
    body: corsXml,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to configure R2 bucket CORS: HTTP ${res.status} — ${text}`);
  }
}

// ── Delete object ─────────────────────────────────────────────────────────────

/**
 * Permanently delete an object from R2.
 */
export async function deleteObject(key: string): Promise<void> {
  if (!hasCredentials()) {
    return; // Dev mode: skip actual deletion
  }

  const region = "auto";
  const service = "s3";
  const host = r2Host();
  const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  const { dateStamp, amzDate } = amzTimestamps();
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const canonicalRequest = [
    "DELETE",
    `/${BUCKET_NAME}/${key}`,
    "",
    `host:${host}\nx-amz-content-sha256:${EMPTY_HASH}\nx-amz-date:${amzDate}\n`,
    "host;x-amz-content-sha256;x-amz-date",
    EMPTY_HASH,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const signingKey = getSignatureKey(SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${credentialScope}`,
    `SignedHeaders=host;x-amz-content-sha256;x-amz-date`,
    `Signature=${signature}`,
  ].join(", ");

  const fetchRes = await fetch(`https://${host}/${BUCKET_NAME}/${key}`, {
    method: "DELETE",
    headers: {
      Authorization: authorization,
      "x-amz-content-sha256": EMPTY_HASH,
      "x-amz-date": amzDate,
      Host: host,
    },
  });

  // R2 returns 204 on success; 404 is also fine (already gone)
  if (!fetchRes.ok && fetchRes.status !== 204 && fetchRes.status !== 404) {
    throw new Error(`R2 delete failed: ${fetchRes.status}`);
  }
}

export async function copyObject(sourceKey: string, destinationKey: string): Promise<void> {
  if (!hasCredentials()) return;

  const region = "auto";
  const service = "s3";
  const host = r2Host();
  const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const { dateStamp, amzDate } = amzTimestamps();
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const copySource = `/${BUCKET_NAME}/${sourceKey}`;
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-copy-source:${copySource}`,
    `x-amz-content-sha256:${emptyHash}`,
    `x-amz-date:${amzDate}`,
  ].join("\n") + "\n";
  const signedHeaders = "host;x-amz-copy-source;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    `/${BUCKET_NAME}/${destinationKey}`,
    "",
    canonicalHeaders,
    signedHeaders,
    emptyHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const signingKey = getSignatureKey(SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");
  const response = await fetch(`https://${host}/${BUCKET_NAME}/${destinationKey}`, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "x-amz-copy-source": copySource,
      "x-amz-content-sha256": emptyHash,
      "x-amz-date": amzDate,
      Host: host,
    },
  });
  if (!response.ok) throw new Error(`R2 copy failed: ${response.status}`);
}

export function buildStorageKey(userId: string, projectId: string, imageId: string, ext: string): string {
  return `${userId}/${projectId}/${imageId}.${ext}`;
}
