import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getSupabaseAdmin, VIDEO_BUCKET } from "./supabaseAdmin";
import { logger } from "./logger";

/** Download an object from the `videos` bucket to a local file path. */
export async function downloadObjectToFile(
  storagePath: string,
  destFsPath: string,
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin client not configured");

  await mkdir(dirname(destFsPath), { recursive: true });

  const { data, error } = await admin.storage
    .from(VIDEO_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new Error(
      `download ${storagePath} failed: ${error?.message ?? "no data"}`,
    );
  }

  // `data` is a Web Blob — pipe it through a Node stream to disk.
  const ab = await data.arrayBuffer();
  const buf = Buffer.from(ab);
  const ws = createWriteStream(destFsPath);
  await pipeline(Readable.from(buf), ws);
}

/** Upload a local file to the `videos` bucket. */
export async function uploadFileToBucket(
  srcFsPath: string,
  storagePath: string,
  contentType: string,
): Promise<{ size: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin client not configured");

  const buf = await readFile(srcFsPath);
  const { error } = await admin.storage
    .from(VIDEO_BUCKET)
    .upload(storagePath, buf, {
      contentType,
      upsert: true,
      cacheControl: "31536000", // 1 year — paths include asset_id so they're immutable.
    });
  if (error) throw new Error(`upload ${storagePath} failed: ${error.message}`);

  const s = await stat(srcFsPath);
  return { size: s.size };
}

/** Public URL helper for a `videos` bucket path. */
export function publicUrlFor(storagePath: string): string {
  const admin = getSupabaseAdmin();
  if (!admin) {
    // Fallback when admin isn't configured — still produce a usable URL.
    const base = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
    return `${base}/storage/v1/object/public/${VIDEO_BUCKET}/${encoded}`;
  }
  const { data } = admin.storage.from(VIDEO_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

/** rm -rf a directory, swallowing errors. */
export async function safeRemoveDir(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch (e) {
    logger.warn({ err: e, path }, "safeRemoveDir failed");
  }
}
