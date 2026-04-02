import { Platform } from "react-native";
import { supabase, supabaseUrl, supabaseAnonKey } from "./supabase";

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

async function uploadViaRestApi(
  bucket: string,
  filePath: string,
  body: FormData | Blob | File,
  accessToken: string,
  isFormData: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "x-upsert": "true",
    apikey: supabaseAnonKey,
  };

  if (!isFormData && body instanceof Blob) {
    headers["Content-Type"] = (body as File).type || "application/octet-stream";
  }

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    let errMsg = "Upload failed";
    try {
      const parsed = await response.json();
      errMsg = parsed.message || parsed.error || errMsg;
    } catch {}
    return { ok: false, error: `${errMsg} (${response.status})` };
  }

  return { ok: true, error: null };
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

    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return { publicUrl: null, error: "Not authenticated" };

    if (Platform.OS !== "web") {
      const formData = new FormData();
      formData.append("file", {
        uri: fileUri,
        name: filePath.split("/").pop() || "file",
        type: mime,
      } as any);

      const result = await uploadViaRestApi(bucket, filePath, formData, session.access_token, true);
      if (!result.ok) return { publicUrl: null, error: result.error };
    } else {
      let blob: Blob;
      try {
        const response = await fetch(fileUri);
        blob = await response.blob();
      } catch {
        return { publicUrl: null, error: "Could not read selected file. Please try selecting again." };
      }

      const file = new File([blob], filePath.split("/").pop() || "file", { type: mime });

      const sdkResult = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { contentType: mime, upsert: true });

      if (sdkResult.error) {
        const restResult = await uploadViaRestApi(bucket, filePath, file, session.access_token, false);
        if (!restResult.ok) return { publicUrl: null, error: sdkResult.error.message };
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
  const filePath = bucket === "voice-messages"
    ? `${userId}/${fileName}`
    : `${userId}/${chatId}/${fileName}`;

  return uploadToStorage(bucket, filePath, fileUri);
}
