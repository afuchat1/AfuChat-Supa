import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
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
  webm: "audio/webm",
  caf: "audio/x-caf",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function getMime(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const cleaned = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = cleaned.length;
  const outLen = (len * 3) >> 2;
  const bytes = new Uint8Array(outLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64.indexOf(cleaned[i]);
    const b = B64.indexOf(cleaned[i + 1]);
    const c = B64.indexOf(cleaned[i + 2]);
    const d = B64.indexOf(cleaned[i + 3]);
    bytes[p++] = (a << 2) | (b >> 4);
    if (c >= 0) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.buffer;
}

export async function uploadToStorage(
  bucket: string,
  filePath: string,
  fileUri: string,
  contentType?: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  try {
    const ext = fileUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "bin";
    const mime = contentType || getMime(ext);

    let uploadData: ArrayBuffer | Blob;

    if (Platform.OS !== "web") {
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      uploadData = base64ToArrayBuffer(base64);
    } else {
      const response = await fetch(fileUri);
      uploadData = await response.blob();
    }

    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, uploadData, { contentType: mime, upsert: true });

    if (error) {
      return { publicUrl: null, error: error.message };
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    const url = data?.publicUrl;
    if (!url) return { publicUrl: null, error: "Could not get public URL" };

    const cacheBustedUrl = `${url}?t=${Date.now()}`;
    return { publicUrl: cacheBustedUrl, error: null };
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

export async function uploadChatMedia(
  bucket: string,
  chatId: string,
  userId: string,
  fileUri: string,
  originalName?: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const ext = fileUri.split(".").pop()?.split("?")[0] || "file";
  const fileName = originalName || `${Date.now()}.${ext}`;
  const filePath = bucket === "voice-messages"
    ? `${userId}/${fileName}`
    : `${userId}/${chatId}/${fileName}`;

  return uploadToStorage(bucket, filePath, fileUri);
}
