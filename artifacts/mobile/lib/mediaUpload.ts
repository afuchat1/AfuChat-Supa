import { Platform } from "react-native";
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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  let bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === "=") bufferLength--;
  if (base64[base64.length - 2] === "=") bufferLength--;

  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const e1 = lookup[base64.charCodeAt(i)];
    const e2 = lookup[base64.charCodeAt(i + 1)];
    const e3 = lookup[base64.charCodeAt(i + 2)];
    const e4 = lookup[base64.charCodeAt(i + 3)];
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    bytes[p++] = ((e3 & 3) << 6) | e4;
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

    console.log("[Upload] bucket:", bucket, "path:", filePath, "mime:", mime, "platform:", Platform.OS);

    if (Platform.OS === "web") {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      console.log("[Upload] Web blob size:", blob.size);
      const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, blob, { contentType: mime, upsert: true });
      if (error) {
        console.warn("[Upload] Supabase error:", error.message);
        return { publicUrl: null, error: error.message };
      }
    } else {
      let FileSystem: any;
      try {
        FileSystem = require("expo-file-system/legacy");
      } catch {
        FileSystem = require("expo-file-system");
      }

      const b64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuffer = base64ToArrayBuffer(b64);

      const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, arrayBuffer, { contentType: mime, upsert: true });
      if (error) return { publicUrl: null, error: error.message };
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    const url = data?.publicUrl;
    if (!url) return { publicUrl: null, error: "Could not get public URL" };

    const cacheBustedUrl = `${url}?t=${Date.now()}`;
    return { publicUrl: cacheBustedUrl, error: null };
  } catch (e: any) {
    console.warn("[Upload] Error:", e?.message || e);
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
  const filePath = `chat-attachments/${chatId}/${userId}/${fileName}`;

  return uploadToStorage(bucket, filePath, fileUri);
}
