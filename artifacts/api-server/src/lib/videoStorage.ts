/**
 * Video pipeline storage helpers — Cloudflare R2 backed.
 *
 * All paths are stored as keys inside the single R2 bucket
 * (afuchat-media), prefixed with the logical bucket name "videos/".
 *
 * Public URLs are served via the R2 public base URL (custom domain or
 * R2.dev subdomain), so consumers just need `publicUrlFor(path)`.
 */

import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import {
  downloadObjectToFile as r2DownloadToFile,
  putFile,
  publicUrlForKey,
} from "./r2";
import { logger } from "./logger";

export const VIDEO_BUCKET = "videos" as const;

/** Build the R2 key for a path inside the logical "videos" bucket. */
function videoKey(storagePath: string): string {
  return `${VIDEO_BUCKET}/${storagePath}`;
}

/** Download an object from the `videos` logical bucket to a local file path. */
export async function downloadObjectToFile(
  storagePath: string,
  destFsPath: string,
): Promise<void> {
  await mkdir(dirname(destFsPath), { recursive: true });
  await r2DownloadToFile(videoKey(storagePath), destFsPath);
}

/** Upload a local file to the `videos` logical bucket. */
export async function uploadFileToBucket(
  srcFsPath: string,
  storagePath: string,
  contentType: string,
): Promise<{ size: number }> {
  // 1 year cache because asset_id is in the path and renditions are immutable.
  return putFile(srcFsPath, videoKey(storagePath), contentType, "public, max-age=31536000, immutable");
}

/** Public URL helper for a `videos` bucket path. */
export function publicUrlFor(storagePath: string): string {
  return publicUrlForKey(videoKey(storagePath));
}

/** rm -rf a directory, swallowing errors. */
export async function safeRemoveDir(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch (e) {
    logger.warn({ err: e, path }, "safeRemoveDir failed");
  }
}
