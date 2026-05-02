/**
 * Media upload helpers — Supabase Storage backed.
 *
 * All file uploads go directly from the client to Supabase Storage via the
 * Supabase JS SDK. No API server is involved — works on web, iOS, and Android
 * without any proxy or presigned URL dance.
 *
 * Public URLs are returned by supabase.storage.from(bucket).getPublicUrl(path).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  m4a: "audio/mp4",
  aac: "audio/aac",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "video/webm",
  caf: "audio/x-caf",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/x-caf": "caf",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

function getMime(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
}

/**
 * Map legacy/logical bucket names to the actual Supabase Storage bucket ids.
 */
const BUCKET_ALIAS: Record<string, string> = {
  "chat-media": "chat-attachments",
  banners: "profile-banners",
  "match-media": "match-photos",
};

function resolveBucket(bucket: string): string {
  return BUCKET_ALIAS[bucket] || bucket;
}

async function fileUriToBlob(fileUri: string, mime: string): Promise<Blob> {
  if (fileUri.startsWith("data:")) {
    const [header, b64] = fileUri.split(",");
    const dataMime = header?.match(/data:([^;]+)/)?.[1] || mime;
    const byteStr = atob(b64);
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
    return new Blob([bytes], { type: dataMime });
  }
  try {
    const response = await fetch(fileUri);
    return await response.blob();
  } catch {
    return await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", fileUri, true);
      xhr.responseType = "blob";
      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 0) {
          resolve(xhr.response as Blob);
        } else {
          reject(new Error(`XHR failed: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("XHR network error"));
      xhr.send();
    });
  }
}

/**
 * Upload a file directly to Supabase Storage.
 *
 * `bucket` is the logical bucket name (avatars, post-images, videos, …).
 * Returns the public URL of the uploaded object on success.
 */
export async function uploadToStorage(
  bucket: string,
  filePath: string,
  fileUri: string,
  contentType?: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  try {
    let resolvedMime = contentType;
    if (!resolvedMime && fileUri.startsWith("data:")) {
      resolvedMime = fileUri.match(/data:([^;]+)/)?.[1] || undefined;
    }
    const ext = fileUri.startsWith("data:")
      ? resolvedMime?.split("/")?.[1]?.replace("jpeg", "jpg") || "bin"
      : fileUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "bin";
    const mime = resolvedMime || getMime(ext);

    let body: Blob;
    try {
      body = await fileUriToBlob(fileUri, mime);
    } catch (e: any) {
      return { publicUrl: null, error: `Could not read file: ${e?.message || e}` };
    }

    if (body.size === 0) {
      return { publicUrl: null, error: "Selected file is empty or could not be read." };
    }

    const realBucket = resolveBucket(bucket);

    const { error: uploadError } = await supabase.storage
      .from(realBucket)
      .upload(filePath, body, { contentType: mime, upsert: true });

    if (uploadError) {
      return { publicUrl: null, error: uploadError.message };
    }

    const { data: urlData } = supabase.storage
      .from(realBucket)
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      return { publicUrl: null, error: "Could not get public URL after upload" };
    }

    return { publicUrl: `${urlData.publicUrl}?t=${Date.now()}`, error: null };
  } catch (e: any) {
    return { publicUrl: null, error: e?.message || "Upload failed" };
  }
}

export async function uploadAvatar(
  userId: string,
  imageUri: string,
): Promise<string | null> {
  const result = await uploadAvatarWithError(userId, imageUri);
  if (result.error) {
    console.warn("Avatar upload failed:", result.error);
  }
  return result.publicUrl;
}

/**
 * Same as `uploadAvatar` but returns the error string so callers can
 * surface a specific message to the user instead of a generic failure.
 */
export async function uploadAvatarWithError(
  userId: string,
  imageUri: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const ext = imageUri.startsWith("data:")
    ? imageUri.match(/data:image\/([^;]+)/)?.[1]?.replace("jpeg", "jpg") || "jpg"
    : imageUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
  const safeExt = ["png", "webp"].includes(ext) ? ext : "jpg";
  const fileName = `${userId}/avatar_${Date.now()}.${safeExt}`;
  const contentType = `image/${safeExt === "jpg" ? "jpeg" : safeExt}`;

  return uploadToStorage("avatars", fileName, imageUri, contentType);
}

export async function uploadChatMedia(
  bucket: string,
  chatId: string,
  userId: string,
  fileUri: string,
  originalName?: string,
  contentType?: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const isBlobOrData = fileUri.startsWith("blob:") || fileUri.startsWith("data:");
  const nameExt = originalName?.split(".").pop()?.toLowerCase();
  const uriExt = isBlobOrData
    ? undefined
    : fileUri.split(".").pop()?.split("?")[0]?.toLowerCase();
  const mimeExt = contentType ? MIME_TO_EXT[contentType.toLowerCase()] : undefined;
  const ext = nameExt || uriExt || mimeExt || "file";
  const fileName = originalName || `${Date.now()}.${ext}`;
  const filePath =
    bucket === "voice-messages"
      ? `${userId}/${fileName}`
      : `${userId}/${chatId}/${fileName}`;

  const resolvedContentType = contentType || getMime(ext);
  return uploadToStorage(bucket, filePath, fileUri, resolvedContentType);
}

/** Format a byte count like 1234567 → "1.18 MB" with sensible units. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`;
}

export interface StorageUsage {
  user_id: string;
  used_bytes: number;
  used_count: number;
  quota_bytes: number;
  remaining_bytes: number;
  percent_used: number;
  per_bucket: Record<string, { bytes: number; count: number }>;
}

export interface StoredFile {
  key: string;
  size: number;
  last_modified: string | null;
  url: string | null;
}

const USAGE_CACHE_KEY = "@afuchat:storage_usage_v1";

const USER_BUCKETS = [
  "avatars",
  "chat-attachments",
  "post-images",
  "stories",
  "videos",
  "group-avatars",
  "voice-messages",
  "profile-banners",
  "match-photos",
  "shop-media",
  "ai-chat-attachments",
  "ai-generated-images",
];

const QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

/** Read the last-known usage from disk for instant first paint. */
export async function getCachedStorageUsage(): Promise<StorageUsage | null> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.used_bytes !== "number") return null;
    return parsed as StorageUsage;
  } catch {
    return null;
  }
}

async function listAllInBucket(
  bucket: string,
  prefix: string,
): Promise<{ size: number; lastModified: string | null }[]> {
  const results: { size: number; lastModified: string | null }[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data || data.length === 0) break;
    for (const f of data) {
      if (f.id) {
        results.push({
          size: (f.metadata as any)?.size ?? 0,
          lastModified: (f.metadata as any)?.lastModified ?? f.updated_at ?? null,
        });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return results;
}

export async function getStorageUsage(): Promise<StorageUsage | null> {
  try {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return null;
    const uid = session.user.id;

    const per_bucket: Record<string, { bytes: number; count: number }> = {};
    let total_bytes = 0;
    let total_count = 0;

    await Promise.all(
      USER_BUCKETS.map(async (bucket) => {
        try {
          const files = await listAllInBucket(bucket, uid);
          const bytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
          per_bucket[bucket] = { bytes, count: files.length };
          total_bytes += bytes;
          total_count += files.length;
        } catch {
          per_bucket[bucket] = { bytes: 0, count: 0 };
        }
      }),
    );

    const usage: StorageUsage = {
      user_id: uid,
      used_bytes: total_bytes,
      used_count: total_count,
      quota_bytes: QUOTA_BYTES,
      remaining_bytes: Math.max(0, QUOTA_BYTES - total_bytes),
      percent_used: Math.min(100, (total_bytes / QUOTA_BYTES) * 100),
      per_bucket,
    };

    AsyncStorage.setItem(USAGE_CACHE_KEY, JSON.stringify(usage)).catch(() => {});
    return usage;
  } catch {
    return null;
  }
}

/**
 * List the user's files inside one logical bucket. Paginated via numeric offset token.
 * `key` format: "<bucket>/<userId>/<filename>" — used by deleteUserFile.
 */
export async function listUserFiles(
  bucket: string,
  token?: string,
): Promise<{ items: StoredFile[]; nextToken: string | null } | null> {
  try {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return null;

    const realBucket = resolveBucket(bucket);
    const limit = 50;
    const offset = token ? parseInt(token, 10) : 0;

    const { data, error } = await supabase.storage
      .from(realBucket)
      .list(session.user.id, {
        limit,
        offset,
        sortBy: { column: "updated_at", order: "desc" },
      });

    if (error || !data) return null;

    const items: StoredFile[] = data
      .filter((f) => f.id)
      .map((f) => {
        const filePath = `${session.user.id}/${f.name}`;
        const { data: urlData } = supabase.storage
          .from(realBucket)
          .getPublicUrl(filePath);
        return {
          key: `${realBucket}/${filePath}`,
          size: (f.metadata as any)?.size ?? 0,
          last_modified: (f.metadata as any)?.lastModified ?? f.updated_at ?? null,
          url: urlData?.publicUrl ?? null,
        };
      });

    const nextToken = data.length === limit ? String(offset + limit) : null;
    return { items, nextToken };
  } catch {
    return null;
  }
}

/**
 * Delete one file from the user's storage.
 * `key` format: "<bucket>/<path>" as returned by listUserFiles.
 */
export async function deleteUserFile(
  key: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const slashIdx = key.indexOf("/");
    if (slashIdx === -1) return { ok: false, error: "Invalid file key" };

    const bucket = key.slice(0, slashIdx);
    const path = key.slice(slashIdx + 1);

    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) return { ok: false, error: error.message };

    AsyncStorage.removeItem(USAGE_CACHE_KEY).catch(() => {});
    return { ok: true, error: null };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Delete failed" };
  }
}
