import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutBucketLifecycleConfigurationCommand,
  type LifecycleRule,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { logger } from "./logger";

/**
 * Lazy env readers — values come from `process.env` at *call* time so they
 * pick up settings injected by `loadAppSettings()` during server boot.
 * Reading them at module-load time would freeze them as empty strings
 * because `r2.ts` is imported by routes long before bootstrap runs.
 */
function readEnv() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
  return {
    accountId,
    endpoint:
      process.env.R2_S3_ENDPOINT ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : ""),
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "",
    bucket: process.env.R2_BUCKET || "afuchat-media",
    publicBaseUrl: (
      process.env.R2_PUBLIC_BASE_URL ||
      process.env.R2_DEV_PUBLIC_URL ||
      ""
    ).replace(/\/+$/, ""),
  };
}

export function getR2Bucket(): string {
  return readEnv().bucket;
}

export function getR2PublicBaseUrl(): string {
  return readEnv().publicBaseUrl;
}


let cached: S3Client | null = null;
let cachedKey = "";
let warned = false;

export function getR2Client(): S3Client | null {
  const { endpoint, accessKeyId, secretAccessKey } = readEnv();
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    if (!warned) {
      warned = true;
      logger.warn(
        { hasEndpoint: !!endpoint, hasKey: !!accessKeyId, hasSecret: !!secretAccessKey },
        "R2 client not configured — set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_SECRET_ACCESS_KEY",
      );
    }
    return null;
  }
  // Re-create the client if any of the inputs changed (e.g. bootstrap injected
  // a different endpoint after the first warning).
  const key = `${endpoint}|${accessKeyId}`;
  if (cached && cachedKey === key) return cached;
  cached = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  cachedKey = key;
  return cached;
}

export function isR2Configured(): boolean {
  const { endpoint, accessKeyId, secretAccessKey, publicBaseUrl } = readEnv();
  return Boolean(endpoint && accessKeyId && secretAccessKey && publicBaseUrl);
}

/** Build the public URL for an R2 object key. */
export function publicUrlForKey(key: string): string {
  const safe = key.split("/").map(encodeURIComponent).join("/");
  return `${getR2PublicBaseUrl()}/${safe}`;
}

/** Returns a presigned PUT URL the client can use to upload directly. */
export async function presignPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 60 * 10,
): Promise<string> {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");
  const cmd = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
}

/** Upload a Node Buffer / stream / file to R2. */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array | Readable,
  contentType: string,
  cacheControl?: string,
): Promise<{ size: number }> {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: getR2Bucket(),
      Key: key,
      Body: body as any,
      ContentType: contentType,
      CacheControl: cacheControl,
    },
  });
  await upload.done();
  // Size best-effort: only known if Buffer
  const size =
    body instanceof Buffer
      ? body.length
      : body instanceof Uint8Array
        ? body.byteLength
        : 0;
  return { size };
}

/** Upload a local file from disk to R2. */
export async function putFile(
  fsPath: string,
  key: string,
  contentType: string,
  cacheControl?: string,
): Promise<{ size: number }> {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: getR2Bucket(),
      Key: key,
      Body: createReadStream(fsPath),
      ContentType: contentType,
      CacheControl: cacheControl,
    },
  });
  await upload.done();
  const s = await stat(fsPath);
  return { size: s.size };
}

/** Download an R2 object to a local file path (streaming). */
export async function downloadObjectToFile(
  key: string,
  destFsPath: string,
): Promise<void> {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");
  const { mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");

  await mkdir(dirname(destFsPath), { recursive: true });

  const out = await s3.send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }));
  if (!out.Body) throw new Error(`R2 download ${key} failed: empty body`);
  const ws = createWriteStream(destFsPath);
  await pipeline(out.Body as Readable, ws);
}

export async function headObject(key: string) {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");
  return s3.send(new HeadObjectCommand({ Bucket: getR2Bucket(), Key: key }));
}

export async function deleteObject(key: string) {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");
  return s3.send(new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }));
}

export interface ListedObject {
  key: string;
  size: number;
  lastModified?: Date;
}

/**
 * List a single page of objects under a key prefix.
 * Returns up to `maxKeys` items plus a continuation token if more exist.
 */
export async function listPrefixPage(
  prefix: string,
  continuationToken?: string,
  maxKeys = 100,
): Promise<{ items: ListedObject[]; nextToken: string | null }> {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");
  const out = await s3.send(
    new ListObjectsV2Command({
      Bucket: getR2Bucket(),
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: Math.max(1, Math.min(1000, maxKeys)),
    }),
  );
  const items: ListedObject[] = (out.Contents ?? []).map((o) => ({
    key: o.Key || "",
    size: o.Size ?? 0,
    lastModified: o.LastModified,
  }));
  return {
    items,
    nextToken: out.IsTruncated ? out.NextContinuationToken || null : null,
  };
}

/**
 * List all objects under a key prefix and sum their sizes.
 * Walks pagination internally. Use for storage-usage calculations.
 */
export async function sumPrefix(
  prefix: string,
): Promise<{ bytes: number; count: number }> {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");

  let bytes = 0;
  let count = 0;
  let token: string | undefined = undefined;
  do {
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: getR2Bucket(),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of out.Contents ?? []) {
      bytes += obj.Size ?? 0;
      count += 1;
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return { bytes, count };
}

/**
 * Apply the AfuChat default lifecycle rules to the R2 bucket.
 *
 *   1. Abort incomplete multipart uploads after 7 days (defensive cleanup).
 *   2. Expire objects under stories/ after 30 days (stories are ephemeral).
 *   3. Expire objects under chat-media/ that have an `expiresAt` tag of
 *      "ephemeral" after 30 days (used for disappearing-message media).
 */
export async function applyDefaultLifecycle(): Promise<void> {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");

  const rules: LifecycleRule[] = [
    {
      ID: "abort-incomplete-multipart-7d",
      Status: "Enabled",
      Filter: { Prefix: "" },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
    },
    {
      ID: "expire-stories-30d",
      Status: "Enabled",
      Filter: { Prefix: "stories/" },
      Expiration: { Days: 30 },
    },
    {
      ID: "expire-ephemeral-chat-media-30d",
      Status: "Enabled",
      Filter: {
        And: {
          Prefix: "chat-media/",
          Tags: [{ Key: "lifecycle", Value: "ephemeral" }],
        },
      },
      Expiration: { Days: 30 },
    },
  ];

  await s3.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: getR2Bucket(),
      LifecycleConfiguration: { Rules: rules },
    }),
  );
}
