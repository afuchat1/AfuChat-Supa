/**
 * Media upload helpers — Supabase Storage backed.
 *
 * The mobile client uploads files directly to Supabase Storage using the
 * authenticated user's session. Buckets and RLS policies are configured
 * server-side in Supabase. The returned `publicUrl` is what we persist
 * into the relevant DB column.
 *
 * Works identically on native (iOS/Android) and on the web because we
 * always normalize the file URI into a Blob/ArrayBuffer before upload.
 */

import { Platform } from "react-native";
import { supabase } from "./supabase";

// Resolve the API server base URL — used for storage usage stats and the
// optional video transcoding pipeline. Uploads themselves go straight to
// Supabase Storage, so they don't need this.
const API_BASE: string = (() => {
  const explicit = (process.env.EXPO_PUBLIC_API_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const domain = (process.env.EXPO_PUBLIC_DOMAIN || "").trim();
  if (domain) return `https://${domain}`.replace(/\/+$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "";
})();

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

function getMime(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
}

function apiUrl(path: string): string {
  return `${API_BASE}/api${path}`;
}

/**
 * Map "logical" bucket names (used throughout the app) to the actual
 * Supabase Storage bucket id. Most buckets share the same name, but a
 * couple were renamed in Supabase.
 */
const BUCKET_ALIAS: Record<string, string> = {
  "chat-media": "chat-attachments",
  banners: "profile-banners",
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

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { publicUrl: null, error: "Not authenticated" };
    }

    let body: Blob | ArrayBuffer;

    if (
      Platform.OS !== "web" &&
      !fileUri.startsWith("data:") &&
      !fileUri.startsWith("blob:")
    ) {
      // React Native: read the file as ArrayBuffer. The supabase-js client
      // uploads ArrayBuffer cleanly without going through Blob, which can
      // be flaky on Hermes for large files.
      try {
        const r = await fetch(fileUri);
        body = await r.arrayBuffer();
      } catch (e: any) {
        return {
          publicUrl: null,
          error: `Could not read file: ${e?.message || e}`,
        };
      }
    } else {
      try {
        body = await fileUriToBlob(fileUri, mime);
      } catch {
        return {
          publicUrl: null,
          error: "Could not read selected file. Please try again.",
        };
      }
    }

    const realBucket = resolveBucket(bucket);
    const { error: upErr } = await supabase.storage
      .from(realBucket)
      .upload(filePath, body as any, {
        contentType: mime,
        upsert: true,
        cacheControl: "3600",
      });

    if (upErr) {
      return { publicUrl: null, error: upErr.message || "Upload failed" };
    }

    const { data: pub } = supabase.storage
      .from(realBucket)
      .getPublicUrl(filePath);
    if (!pub?.publicUrl) {
      return { publicUrl: null, error: "Failed to resolve public URL" };
    }
    return { publicUrl: `${pub.publicUrl}?t=${Date.now()}`, error: null };
  } catch (e: any) {
    return { publicUrl: null, error: e?.message || "Upload failed" };
  }
}

export async function uploadAvatar(
  userId: string,
  imageUri: string,
): Promise<string | null> {
  const ext = imageUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
  const safeExt = ["png", "webp"].includes(ext) ? ext : "jpg";
  const fileName = `${userId}/avatar_${Date.now()}.${safeExt}`;
  const contentType = `image/${safeExt === "jpg" ? "jpeg" : safeExt}`;

  const { publicUrl, error } = await uploadToStorage(
    "avatars",
    fileName,
    imageUri,
    contentType,
  );

  if (error) {
    console.warn("Avatar upload failed:", error);
    return null;
  }
  return publicUrl;
}

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
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

/**
 * Per-bucket usage breakdown for the calling user.
 * Backed by GET /api/uploads/usage on the API server. If the API server
 * isn't reachable (or R2 isn't configured), returns null silently.
 */
export interface StorageUsage {
  user_id: string;
  used_bytes: number;
  used_count: number;
  quota_bytes: number;
  remaining_bytes: number;
  percent_used: number;
  per_bucket: Record<string, { bytes: number; count: number }>;
}

export async function getStorageUsage(): Promise<StorageUsage | null> {
  try {
    if (!API_BASE) return null;
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return null;
    const r = await fetch(apiUrl("/uploads/usage"), {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!r.ok) return null;
    const text = await r.text();
    if (!text || text.trimStart().startsWith("<")) return null;
    return JSON.parse(text) as StorageUsage;
  } catch {
    return null;
  }
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
