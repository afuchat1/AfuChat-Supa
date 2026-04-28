/**
 * Media upload helpers — Cloudflare R2 backed.
 *
 * The mobile client never touches R2 credentials directly. Instead it
 * asks the API server for a short-lived presigned PUT URL, then PUTs
 * the file to R2 from the device. The returned `publicUrl` is what we
 * persist into the relevant DB column.
 */

import { Platform } from "react-native";
import { supabase } from "./supabase";

// Resolve the API server base URL the same way videoApi.ts does so all
// modules agree on where /api lives.
const API_BASE: string = (() => {
  const domain = (process.env.EXPO_PUBLIC_DOMAIN || "").trim();
  if (domain) return `https://${domain}`;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
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
  const base = API_BASE.replace(/\/+$/, "");
  return `${base}/api${path}`;
}

async function getSignedUpload(
  bucket: string,
  filePath: string,
  contentType: string,
  accessToken: string,
): Promise<{ uploadUrl: string; publicUrl: string } | { error: string }> {
  try {
    const r = await fetch(apiUrl("/uploads/sign"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ bucket, path: filePath, contentType }),
    });
    if (!r.ok) {
      let msg = `Sign failed (${r.status})`;
      try {
        const j = await r.json();
        msg = j.error || j.message || msg;
      } catch {}
      return { error: msg };
    }
    const j = await r.json();
    if (!j.uploadUrl || !j.publicUrl) return { error: "Bad sign response" };
    return { uploadUrl: j.uploadUrl as string, publicUrl: j.publicUrl as string };
  } catch (e: any) {
    return { error: e?.message || "Sign request failed" };
  }
}

async function putToR2(
  uploadUrl: string,
  body: Blob | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const r = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: body as any,
    });
    if (!r.ok) {
      let msg = `Upload failed (${r.status})`;
      try {
        const t = await r.text();
        if (t) msg += `: ${t.slice(0, 200)}`;
      } catch {}
      return { ok: false, error: msg };
    }
    return { ok: true, error: null };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Upload error" };
  }
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

    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return { publicUrl: null, error: "Not authenticated" };

    const signed = await getSignedUpload(bucket, filePath, mime, session.access_token);
    if ("error" in signed) return { publicUrl: null, error: signed.error };

    let body: Blob | ArrayBuffer;

    if (Platform.OS !== "web" && !fileUri.startsWith("data:") && !fileUri.startsWith("blob:")) {
      // React Native: prefer reading as ArrayBuffer via fetch — RN's fetch
      // supports file:// URIs and works for binary PUT bodies.
      try {
        const r = await fetch(fileUri);
        body = await r.arrayBuffer();
      } catch (e: any) {
        return { publicUrl: null, error: `Could not read file: ${e?.message || e}` };
      }
    } else {
      try {
        body = await fileUriToBlob(fileUri, mime);
      } catch (e: any) {
        return { publicUrl: null, error: "Could not read selected file. Please try again." };
      }
    }

    const put = await putToR2(signed.uploadUrl, body, mime);
    if (!put.ok) return { publicUrl: null, error: put.error };

    return { publicUrl: `${signed.publicUrl}?t=${Date.now()}`, error: null };
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
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

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
