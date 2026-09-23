import { AwsClient } from "aws4fetch";
import type { Env } from "../types";

export function getStorageClient(env: Env): AwsClient {
  return new AwsClient({
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
}

function r2BaseUrl(env: Env): string {
  return `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}`;
}

export function buildStorageKey(userId: string, projectId: string, imageId: string, ext: string): string {
  return `${userId}/${projectId}/${imageId}.${ext}`;
}

export async function generateUploadUrl(key: string, contentType: string, env: Env): Promise<string> {
  const aws = getStorageClient(env);
  const url = new URL(`${r2BaseUrl(env)}/${key}`);
  url.searchParams.set("X-Amz-Expires", "3600");
  const signed = await aws.sign(
    new Request(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": contentType },
    }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

/**
 * Returns a relative URL that the CF Worker handles via the
 * /v1/storage/:key redirect route (generates a short-lived presigned GET).
 * When R2_PUBLIC_URL is explicitly set (CDN), use that directly instead.
 */
export function getPublicUrl(key: string, env: Env): string {
  if (env.R2_PUBLIC_URL) {
    return `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }
  return `/v1/storage/${encodeURIComponent(key)}`;
}

export async function generateDownloadUrl(key: string, env: Env, expiresIn = 3600): Promise<string> {
  const aws = getStorageClient(env);
  const url = new URL(`${r2BaseUrl(env)}/${key}`);
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await aws.sign(
    new Request(url.toString(), { method: "GET" }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

export async function deleteObject(key: string, env: Env): Promise<void> {
  const aws = getStorageClient(env);
  await aws.fetch(`${r2BaseUrl(env)}/${key}`, { method: "DELETE" });
}

export async function copyObject(sourceKey: string, destinationKey: string, env: Env): Promise<void> {
  const aws = getStorageClient(env);
  const destination = `${r2BaseUrl(env)}/${destinationKey}`;
  const response = await aws.fetch(destination, {
    method: "PUT",
    headers: {
      "x-amz-copy-source": `/${env.R2_BUCKET_NAME}/${sourceKey}`,
    },
  });
  if (!response.ok) throw new Error(`R2 copy failed: ${response.status}`);
}
