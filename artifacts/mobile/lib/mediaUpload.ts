/**
 * Media upload helpers — Cloudflare R2 backed via Supabase Edge Function.
 *
 * Uploads flow:
 *   Native (iOS/Android):
 *     1. Call POST /sign on the `uploads` edge function → get presigned PUT URL.
 *     2. PUT bytes directly to Cloudflare R2 using the presigned URL.
 *     3. Write the returned CDN URL into Supabase DB.
 *
 *   Web (Vercel/browser):
 *     1. POST bytes to /upload on the edge function.
 *     2. The edge function streams them to R2 server-side (avoids R2 CORS issues).
 *     3. Write the returned CDN URL into Supabase DB.
 *
 * No separate API server deployment required — everything goes through
 * the Supabase Edge Function at:
 *   https://<project>.supabase.co/functions/v1/uploads/<action>
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, supabaseUrl, supabaseAnonKey } from "./supabase";

/** Base URL of the uploads edge function */
const UPLOADS_FN = `${supabaseUrl}/functions/v1/uploads`;

function uploadsUrl(action: string): string {
  return `${UPLOADS_FN}/${action}`;
}

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
 * Map legacy/logical bucket names to the canonical R2 key prefix.
 */
const BUCKET_ALIAS: Record<string, string> = {
  "chat-media": "chat-media",
  "chat-attachments": "chat-media",
  banners: "banners",
  "profile-banners": "banners",
};

function resolveBucket(bucket: string): string {
  return BUCKET_ALIAS[bucket] || bucket;
}

async function edgeFnHeaders(accessToken: string): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: supabaseAnonKey,
  };
}

async function getAccessToken(): Promise<string | null> {
  const session = (await supabase.auth.getSession()).data.session;
  return session?.access_token ?? null;
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

interface SignedUpload {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

async function getSignedUpload(
  bucket: string,
  filePath: string,
  contentType: string,
): Promise<{ data: SignedUpload | null; error: string | null }> {
  const token = await getAccessToken();
  if (!token) return { data: null, error: "Not authenticated" };

  let resp: Response;
  try {
    resp = await fetch(uploadsUrl("sign"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await edgeFnHeaders(token)),
      },
      body: JSON.stringify({ bucket, path: filePath, contentType }),
    });
  } catch (e: any) {
    return { data: null, error: `Network error: ${e?.message || e}` };
  }

  const text = await resp.text().catch(() => "");
  if (!text) return { data: null, error: `Sign failed (HTTP ${resp.status})` };
  if (text.trimStart().startsWith("<")) return { data: null, error: "Upload service unreachable" };

  let json: any;
  try { json = JSON.parse(text); } catch {
    return { data: null, error: `Sign failed (HTTP ${resp.status}): ${text.slice(0, 120)}` };
  }
  if (!resp.ok) return { data: null, error: json?.error || `Sign failed (HTTP ${resp.status})` };
  if (!json?.uploadUrl || !json?.publicUrl) return { data: null, error: "Sign endpoint returned no URL" };

  return { data: { uploadUrl: json.uploadUrl, publicUrl: json.publicUrl, key: json.key }, error: null };
}

async function proxyUpload(
  bucket: string,
  filePath: string,
  body: Blob | ArrayBuffer,
  contentType: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const token = await getAccessToken();
  if (!token) return { publicUrl: null, error: "Not authenticated" };

  const bodySize = body instanceof Blob ? body.size : body instanceof ArrayBuffer ? body.byteLength : 0;
  if (!bodySize) return { publicUrl: null, error: "Selected file is empty or could not be read." };

  const qs = new URLSearchParams({ bucket, path: filePath }).toString();
  let resp: Response;
  try {
    resp = await fetch(`${uploadsUrl("upload")}?${qs}`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        ...(await edgeFnHeaders(token)),
      },
      body: body as any,
    });
  } catch (e: any) {
    return { publicUrl: null, error: `Upload failed: ${e?.message || e}` };
  }

  const text = await resp.text().catch(() => "");
  if (!text) return { publicUrl: null, error: `Upload failed (HTTP ${resp.status}). Please try again.` };
  if (text.trimStart().startsWith("<")) return { publicUrl: null, error: "Upload service unreachable" };

  let json: any;
  try { json = JSON.parse(text); } catch {
    return { publicUrl: null, error: `Upload failed (HTTP ${resp.status}): ${text.slice(0, 120)}` };
  }
  if (!resp.ok) return { publicUrl: null, error: json?.error || `Upload failed (HTTP ${resp.status})` };
  if (!json?.publicUrl) return { publicUrl: null, error: "Upload service returned no URL" };

  return { publicUrl: json.publicUrl, error: null };
}

/**
 * Upload a file to Cloudflare R2.
 *
 * On web: proxied through the Supabase Edge Function (no CORS issues).
 * On native: presigned PUT URL, bytes go directly to R2 (faster).
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

    let body: Blob | ArrayBuffer;
    if (
      Platform.OS !== "web" &&
      !fileUri.startsWith("data:") &&
      !fileUri.startsWith("blob:")
    ) {
      try {
        const r = await fetch(fileUri);
        body = await r.arrayBuffer();
      } catch (e: any) {
        return { publicUrl: null, error: `Could not read file: ${e?.message || e}` };
      }
    } else {
      try {
        body = await fileUriToBlob(fileUri, mime);
      } catch {
        return { publicUrl: null, error: "Could not read selected file. Please try again." };
      }
    }

    const realBucket = resolveBucket(bucket);

    if (Platform.OS === "web") {
      const proxied = await proxyUpload(realBucket, filePath, body, mime);
      if (proxied.error || !proxied.publicUrl) {
        return { publicUrl: null, error: proxied.error || "Upload failed" };
      }
      return { publicUrl: `${proxied.publicUrl}?t=${Date.now()}`, error: null };
    }

    const sign = await getSignedUpload(realBucket, filePath, mime);
    if (sign.error || !sign.data) {
      return { publicUrl: null, error: sign.error || "Sign failed" };
    }

    let putResp: Response;
    try {
      putResp = await fetch(sign.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mime },
        body: body as any,
      });
    } catch (e: any) {
      return { publicUrl: null, error: `Upload failed: ${e?.message || e}` };
    }
    if (!putResp.ok) {
      const text = await putResp.text().catch(() => "");
      return { publicUrl: null, error: `Upload rejected (${putResp.status}): ${text.slice(0, 120) || "no body"}` };
    }

    return { publicUrl: `${sign.data.publicUrl}?t=${Date.now()}`, error: null };
  } catch (e: any) {
    return { publicUrl: null, error: e?.message || "Upload failed" };
  }
}

export async function uploadAvatar(userId: string, imageUri: string): Promise<string | null> {
  const result = await uploadAvatarWithError(userId, imageUri);
  if (result.error) console.warn("Avatar upload failed:", result.error);
  return result.publicUrl;
}

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
  const uriExt = isBlobOrData ? undefined : fileUri.split(".").pop()?.split("?")[0]?.toLowerCase();
  const mimeExt = contentType ? MIME_TO_EXT[contentType.toLowerCase()] : undefined;
  const ext = nameExt || uriExt || mimeExt || "file";
  const fileName = originalName || `${Date.now()}.${ext}`;
  const filePath =
    bucket === "voice-messages" ? `${userId}/${fileName}` : `${userId}/${chatId}/${fileName}`;
  return uploadToStorage(bucket, filePath, fileUri, contentType || getMime(ext));
}

/** Format a byte count like 1234567 → "1.18 MB" with sensible units. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
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

export async function getCachedStorageUsage(): Promise<StorageUsage | null> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.used_bytes !== "number") return null;
    return parsed as StorageUsage;
  } catch { return null; }
}

export async function getStorageUsage(): Promise<StorageUsage | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const r = await fetch(uploadsUrl("usage"), {
      headers: await edgeFnHeaders(token),
    });
    if (!r.ok) return null;
    const text = await r.text();
    if (!text || text.trimStart().startsWith("<")) return null;
    const parsed = JSON.parse(text) as StorageUsage;
    AsyncStorage.setItem(USAGE_CACHE_KEY, JSON.stringify(parsed)).catch(() => {});
    return parsed;
  } catch { return null; }
}

export async function listUserFiles(
  bucket: string,
  token?: string,
): Promise<{ items: StoredFile[]; nextToken: string | null } | null> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return null;
    const qs = new URLSearchParams({ bucket });
    if (token) qs.set("token", token);
    const r = await fetch(`${uploadsUrl("list")}?${qs}`, {
      headers: await edgeFnHeaders(accessToken),
    });
    if (!r.ok) return null;
    const text = await r.text();
    if (!text || text.trimStart().startsWith("<")) return null;
    const json = JSON.parse(text);
    return {
      items: Array.isArray(json.items) ? json.items : [],
      nextToken: json.next_token || null,
    };
  } catch { return null; }
}

export async function deleteUserFile(key: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: "Not signed in" };
    const r = await fetch(uploadsUrl("object"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(await edgeFnHeaders(token)),
      },
      body: JSON.stringify({ key }),
    });
    const text = await r.text();
    if (text.trimStart().startsWith("<")) return { ok: false, error: "Service unreachable" };
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    if (!r.ok) return { ok: false, error: json?.error || `Failed (${r.status})` };
    AsyncStorage.removeItem(USAGE_CACHE_KEY).catch(() => {});
    return { ok: true, error: null };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Delete failed" };
  }
}
