import { Platform } from "react-native";
import { supabase, supabaseUrl as SUPABASE_URL, supabaseAnonKey as SUPABASE_ANON_KEY } from "./supabase";

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function getMime(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
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

    if (Platform.OS === "web") {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, blob, { contentType: mime, upsert: true });
      if (error) return { publicUrl: null, error: error.message };
    } else {
      const FileSystem = require("expo-file-system");

      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return { publicUrl: null, error: "Not authenticated" };

      const storageUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;
      const uploadResult = await FileSystem.uploadAsync(storageUrl, fileUri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          "Content-Type": mime,
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
          "x-upsert": "true",
        },
      });

      if (uploadResult.status >= 400) {
        let errorMsg = `Upload failed (${uploadResult.status})`;
        try {
          const body = JSON.parse(uploadResult.body);
          errorMsg = body.message || body.error || errorMsg;
        } catch {}
        return { publicUrl: null, error: errorMsg };
      }
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
  const filePath = `chat-attachments/${chatId}/${userId}/${fileName}`;

  return uploadToStorage(bucket, filePath, fileUri);
}
