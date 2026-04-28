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

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const endpoint =
  process.env.R2_S3_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "";

export const R2_BUCKET = process.env.R2_BUCKET || "afuchat-media";
export const R2_PUBLIC_BASE_URL = (
  process.env.R2_PUBLIC_BASE_URL ||
  process.env.R2_DEV_PUBLIC_URL ||
  ""
).replace(/\/+$/, "");

let cached: S3Client | null = null;
let warned = false;

export function getR2Client(): S3Client | null {
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
  if (cached) return cached;
  cached = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cached;
}

export function isR2Configured(): boolean {
  return Boolean(endpoint && accessKeyId && secretAccessKey && R2_PUBLIC_BASE_URL);
}

/** Build the public URL for an R2 object key. */
export function publicUrlForKey(key: string): string {
  const safe = key.split("/").map(encodeURIComponent).join("/");
  return `${R2_PUBLIC_BASE_URL}/${safe}`;
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
    Bucket: R2_BUCKET,
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
      Bucket: R2_BUCKET,
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
      Bucket: R2_BUCKET,
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

  const out = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  if (!out.Body) throw new Error(`R2 download ${key} failed: empty body`);
  const ws = createWriteStream(destFsPath);
  await pipeline(out.Body as Readable, ws);
}

export async function headObject(key: string) {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");
  return s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

export async function deleteObject(key: string) {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");
  return s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
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
        Bucket: R2_BUCKET,
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
      Bucket: R2_BUCKET,
      LifecycleConfiguration: { Rules: rules },
    }),
  );
}
