/**
 * Media upload helpers — Cloudflare R2 backed via the Supabase Edge Function.
 *
 * Uploads flow:
 *   Web:
 *     1. POST bytes to Supabase Edge Function /functions/v1/uploads/upload.
 *     2. Edge function streams them to R2 server-side (avoids R2 CORS issues).
 *     3. Write the returned CDN URL into Supabase DB.
 *
 *   Native (iOS/Android):
 *     1. POST to Supabase Edge Function /functions/v1/uploads/sign → presigned PUT URL.
 *     2. PUT bytes directly to Cloudflare R2 using the presigned URL.
 *     3. Write the returned CDN URL into Supabase DB.
 *     4. Falls back to proxy upload via Edge Function if presigned PUT fails.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase, supabaseUrl, supabaseAnonKey } from "./supabase";
import * as FileSystem from "expo-file-system/legacy";
import { FileSystemUploadType } from "expo-file-system/legacy";

function getUploadStagingDirectory(): string | null {
  return FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}afuchat_upload_staging/`
    : null;
}

async function ensureUploadStagingDirectory(directory: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
}

export async function cleanupPreparedMediaForUpload(fileUri: string): Promise<void> {
  const directory = getUploadStagingDirectory();
  if (!directory || !fileUri.startsWith(directory)) return;
  await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
}

function getUploadsBase(): string {
  return `${supabaseUrl}/functions/v1/uploads`;
}

function uploadsUrl(action: string): string {
  return `${getUploadsBase()}/${action}`;
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
  apk: "application/vnd.android.package-archive",
  ipa: "application/octet-stream",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  rar: "application/x-rar-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  exe: "application/x-msdownload",
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
  "application/vnd.android.package-archive": "apk",
  "application/zip": "zip",
  "application/x-7z-compressed": "7z",
  "application/x-rar-compressed": "rar",
  "application/x-tar": "tar",
  "application/gzip": "gz",
  "application/x-msdownload": "exe",
};

const UPLOAD_REUSE_CACHE_PREFIX = "@afuchat:uploaded_media:v1:";
type UploadReuseIdentity = {
  key: string;
  scope: string;
  sourceUri: string;
  size: number | null;
  modificationTime: number | null;
};
type UploadReuseEntry = UploadReuseIdentity & {
  publicUrl: string;
  storageKey: string;
  uploadedAt: number;
};
type UploadResult = { publicUrl: string | null; error: string | null };

const inFlightUploads = new Map<string, Promise<UploadResult>>();
const EXACT_PATH_BUCKETS = new Set(["music", "music-covers", "stories"]);

function getUploadReuseScope(bucket: string): string {
  const canonicalBucket = resolveBucket(bucket);
  // Music paths are authorization-checked by their logical bucket, and story
  // media has its own expiration lifecycle. Other public media references can
  // safely share one object URL across features.
  return EXACT_PATH_BUCKETS.has(canonicalBucket) ? canonicalBucket : "shared-public-media";
}

function hashUploadIdentity(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `${value.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function isAlreadyStoredMediaUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const candidate = new URL(value);
    const configuredR2Base = process.env.EXPO_PUBLIC_R2_PUBLIC_BASE_URL;
    const r2Bases = [configuredR2Base, "https://cdn.afuchat.com"].filter(Boolean) as string[];
    for (const base of r2Bases) {
      try {
        const configured = new URL(base);
        const pathPrefix = configured.pathname.replace(/\/+$/, "");
        if (
          candidate.origin === configured.origin &&
          candidate.pathname.startsWith(`${pathPrefix}/`)
        ) return true;
      } catch {}
    }
    if (candidate.hostname.endsWith(".r2.dev")) return true;
    const supabaseOrigin = new URL(supabaseUrl).origin;
    return candidate.origin === supabaseOrigin &&
      candidate.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

async function getUploadReuseIdentity(
  userId: string,
  bucket: string,
  fileUri: string,
): Promise<UploadReuseIdentity | null> {
  // Only persist short device file references. data:/blob: URIs may contain
  // the whole file, and HTTP URLs are handled separately as stored references.
  if (
    fileUri.length > 4096 ||
    !/^(file|content|ph):\/\//i.test(fileUri)
  ) return null;

  let size: number | null = null;
  let modificationTime: number | null = null;
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      const details = info as any;
      size = typeof details.size === "number" ? details.size : null;
      modificationTime = typeof details.modificationTime === "number"
        ? details.modificationTime
        : null;
    }
  } catch {
    // Some Android content:// providers do not expose metadata. The exact URI
    // still gives a useful same-file key for that provider.
  }

  const sourceIdentity = `${fileUri}\u0000${size ?? ""}\u0000${modificationTime ?? ""}`;
  const scope = getUploadReuseScope(bucket);
  return {
    key: `${UPLOAD_REUSE_CACHE_PREFIX}${userId}:${scope}:${hashUploadIdentity(sourceIdentity)}`,
    scope,
    sourceUri: fileUri,
    size,
    modificationTime,
  };
}

async function readReusableUpload(identity: UploadReuseIdentity): Promise<UploadReuseEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(identity.key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as UploadReuseEntry;
    if (
      entry.sourceUri !== identity.sourceUri ||
      entry.size !== identity.size ||
      entry.modificationTime !== identity.modificationTime ||
      typeof entry.publicUrl !== "string" ||
      !entry.publicUrl
    ) {
      await AsyncStorage.removeItem(identity.key).catch(() => {});
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

async function saveReusableUpload(
  identity: UploadReuseIdentity,
  bucket: string,
  filePath: string,
  publicUrl: string,
): Promise<void> {
  const entry: UploadReuseEntry = {
    ...identity,
    publicUrl,
    storageKey: `${resolveBucket(bucket)}/${filePath.replace(/^\/+/, "")}`,
    uploadedAt: Date.now(),
  };
  await AsyncStorage.setItem(identity.key, JSON.stringify(entry)).catch(() => {});
}

async function invalidateReusableUploads(storageKey: string): Promise<void> {
  try {
    const normalizedKey = storageKey.replace(/^\/+/, "");
    const cacheKeys = (await AsyncStorage.getAllKeys())
      .filter((key) => key.startsWith(UPLOAD_REUSE_CACHE_PREFIX));
    if (!cacheKeys.length) return;
    const entries = await AsyncStorage.multiGet(cacheKeys);
    const staleKeys: string[] = [];
    for (const [key, value] of entries) {
      if (!value) continue;
      try {
        const entry = JSON.parse(value) as UploadReuseEntry;
        if (
          entry.storageKey === normalizedKey ||
          entry.storageKey.endsWith(`/${normalizedKey}`)
        ) staleKeys.push(key);
      } catch {
        staleKeys.push(key);
      }
    }
    if (staleKeys.length) await AsyncStorage.multiRemove(staleKeys);
  } catch {
    // Deletion must still succeed even if the local reuse index is unavailable.
  }
}

function getMime(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
}

/**
 * Move a picker/camera result into this app's cache before the source screen
 * unmounts. Expo Go can return a URI in its temporary host cache; that URI is
 * not reliable after the camera or picker closes.
 */
export async function prepareMediaForUpload(
  fileUri: string,
  extension = "bin",
): Promise<string> {
  if (
    fileUri.startsWith("data:") ||
    fileUri.startsWith("blob:") ||
    Platform.OS === "web"
  ) {
    return fileUri;
  }

  const stagingDirectory = getUploadStagingDirectory();
  if (!stagingDirectory) {
    throw new Error("Persistent device storage is unavailable. Please try again.");
  }
  await ensureUploadStagingDirectory(stagingDirectory);

  const normalizedExt = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const existingInfo = fileUri.startsWith(stagingDirectory)
    ? await FileSystem.getInfoAsync(fileUri).catch(() => ({ exists: false }))
    : null;
  if (existingInfo?.exists) return fileUri;

  const destination = `${stagingDirectory}story_source_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}.${normalizedExt}`;
  try {
    await FileSystem.copyAsync({ from: fileUri, to: destination });
    const info = await FileSystem.getInfoAsync(destination);
    if (!info.exists) throw new Error("The selected file could not be copied.");
    return destination;
  } catch (copyError: any) {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
    // Android pickers can return content:// or Expo host-cache URIs that
    // copyAsync cannot access even though FileSystem.uploadAsync can stream
    // them directly through the native provider. Do not reject the media at
    // selection time; return the original URI and let uploadToStorage use its
    // direct-stream/proxy fallbacks.
    console.warn("[Media] Stable copy skipped; using original URI:", copyError?.message || copyError);
    return fileUri;
  }
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
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
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
 * Web:            proxied through Supabase Edge Function (avoids CORS).
 * Native file://: FileSystem.uploadAsync streams bytes directly — no ArrayBuffer
 *                 loaded into memory, safe for 100 MB+ videos.
 * Native data:/blob:: fileUriToBlob + proxy (already in-memory, small).
 */
async function uploadToStorageUncached(
  bucket: string,
  filePath: string,
  fileUri: string,
  contentType?: string,
): Promise<UploadResult> {
  let tempPath: string | null = null;
  const cleanupTemp = () => {
    if (!tempPath) return;
    const path = tempPath;
    tempPath = null;
    FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
  };

  try {
    let resolvedMime = contentType;
    if (!resolvedMime && fileUri.startsWith("data:")) {
      resolvedMime = fileUri.match(/data:([^;]+)/)?.[1] || undefined;
    }
    const ext = fileUri.startsWith("data:")
      ? resolvedMime?.split("/")?.[1]?.replace("jpeg", "jpg") || "bin"
      : fileUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "bin";
    const mime = resolvedMime || getMime(ext);
    const realBucket = resolveBucket(bucket);

    // ── data: / blob: URIs are already in memory — small files ─────────────
    if (fileUri.startsWith("data:") || fileUri.startsWith("blob:")) {
      let body: Blob | ArrayBuffer;
      try {
        body = await fileUriToBlob(fileUri, mime);
      } catch {
        return { publicUrl: null, error: "Could not read selected file. Please try again." };
      }
      const sign = await getSignedUpload(realBucket, filePath, mime);
      if (sign.data) {
        try {
          const putResp = await fetch(sign.data.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": mime },
            body: body as any,
          });
          if (putResp.ok) return { publicUrl: sign.data.publicUrl, error: null };
        } catch {}
      }
      return proxyUpload(realBucket, filePath, body, mime);
    }

    // ── Native file:// path — stream via FileSystem.uploadAsync ─────────────
    // This is the critical path for video uploads: avoids loading the entire
    // file into JS memory (which would OOM on 50-100 MB videos).
    //
    // Android quirk: on some devices the camera temp directory may not exist
    // when ExponentFileSystem tries to open the source file, causing
    // "java.io.IOException: Directory for '...' doesn't exist".
    // Copy user media to app-owned persistent staging before streaming it.
    let uploadUri = fileUri;
    try {
      const stagingDirectory = getUploadStagingDirectory();
      if (stagingDirectory) {
        await ensureUploadStagingDirectory(stagingDirectory);
        tempPath = `${stagingDirectory}upload_tmp_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: fileUri, to: tempPath });
        uploadUri = tempPath;
      }
    } catch (copyErr: any) {
      // Non-fatal: In Expo Go on Android, ImagePicker URIs live inside the host
      // app's private sandbox and FileSystem.copyAsync cannot cross that boundary
      // (throws FileNotFoundException). When that happens, leave uploadUri as the
      // original fileUri and let FileSystem.uploadAsync try to stream it directly
      // via Android's native layer — it uses a different access path that can
      // reach those files. If that also fails the error surfaces below.
      console.warn(`[Upload] Pre-copy skipped (will try direct stream): ${copyErr?.message || copyErr}`);
      if (tempPath) {
        FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
        tempPath = null;
      }
      // uploadUri stays as the original fileUri
    }

    // 1. Try presigned PUT — bytes stream directly from disk to R2.
    const sign = await getSignedUpload(realBucket, filePath, mime);
    if (sign.data) {
      try {
        const putResult = await FileSystem.uploadAsync(sign.data.uploadUrl, uploadUri, {
          httpMethod: "PUT",
          headers: { "Content-Type": mime },
          uploadType: FileSystemUploadType.BINARY_CONTENT,
        });
        if (putResult.status >= 200 && putResult.status < 300) {
          cleanupTemp();
          return { publicUrl: sign.data.publicUrl, error: null };
        }
        console.warn(
          `[Upload] Presigned PUT failed (${putResult.status}), falling back to proxy`,
        );
      } catch (e: any) {
        console.warn(`[Upload] Presigned PUT threw, falling back to proxy: ${e?.message || e}`);
      }
    } else {
      console.warn(`[Upload] Sign failed (${sign.error}), falling back to proxy`);
    }

    // 2. Proxy fallback — POST bytes through the Supabase Edge Function.
    //    Still streamed via FileSystem.uploadAsync, not loaded into memory.
    const token = await getAccessToken();
    if (!token) { cleanupTemp(); return { publicUrl: null, error: "Not authenticated" }; }
    const qs = new URLSearchParams({ bucket: realBucket, path: filePath }).toString();
    try {
      const proxyResult = await FileSystem.uploadAsync(
        `${uploadsUrl("upload")}?${qs}`,
        uploadUri,
        {
          httpMethod: "POST",
          headers: {
            "Content-Type": mime,
            Authorization: `Bearer ${token}`,
            apikey: supabaseAnonKey,
          },
          uploadType: FileSystemUploadType.BINARY_CONTENT,
        },
      );
      cleanupTemp();
      const text = proxyResult.body ?? "";
      if (!text) return { publicUrl: null, error: `Upload failed (HTTP ${proxyResult.status})` };
      if (text.trimStart().startsWith("<")) return { publicUrl: null, error: "Upload service unreachable" };
      let json: any;
      try { json = JSON.parse(text); } catch {
        return { publicUrl: null, error: `Upload failed (HTTP ${proxyResult.status})` };
      }
      if (proxyResult.status < 200 || proxyResult.status >= 300) {
        return { publicUrl: null, error: json?.error || `Upload failed (HTTP ${proxyResult.status})` };
      }
      if (!json?.publicUrl) return { publicUrl: null, error: "Upload service returned no URL" };
      return { publicUrl: json.publicUrl, error: null };
    } catch (e: any) {
      console.warn(`[Upload] Native proxy stream failed, trying readable URI fallback: ${e?.message || e}`);
    }

    // Some Android content/file URIs are readable by fetch even when the
    // legacy FileSystem uploader rejects them. Use the same authenticated
    // proxy with a Blob as a final fallback, especially for Expo Go media.
    try {
      const body = await fileUriToBlob(uploadUri, mime);
      const fallback = await proxyUpload(realBucket, filePath, body, mime);
      cleanupTemp();
      return fallback;
    } catch {
      cleanupTemp();
      return {
        publicUrl: null,
        error: "Could not read the selected photo or video. Please choose it again.",
      };
    }
  } catch (e: any) {
    cleanupTemp();
    return { publicUrl: null, error: e?.message || "Upload failed" };
  }
}

/**
 * Reuse the same stored object when an already-uploaded URL or the exact same
 * local file path is submitted again. This keeps forwards and repeated sends
 * pointed at the original R2 object instead of creating another copy.
 */
export async function uploadToStorage(
  bucket: string,
  filePath: string,
  fileUri: string,
  contentType?: string,
): Promise<UploadResult> {
  const requiresExactPath = EXACT_PATH_BUCKETS.has(resolveBucket(bucket));
  if (!requiresExactPath && isAlreadyStoredMediaUrl(fileUri)) {
    return { publicUrl: fileUri, error: null };
  }

  if (requiresExactPath) {
    return uploadToStorageUncached(bucket, filePath, fileUri, contentType);
  }

  let identity: UploadReuseIdentity | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (userId) identity = await getUploadReuseIdentity(userId, bucket, fileUri);
  } catch {}

  if (!identity) {
    return uploadToStorageUncached(bucket, filePath, fileUri, contentType);
  }

  const inFlightKey = identity.key;
  const pending = inFlightUploads.get(inFlightKey);
  if (pending) return pending;

  const uploadPromise = (async () => {
    const cached = await readReusableUpload(identity);
    if (cached) return { publicUrl: cached.publicUrl, error: null };

    const result = await uploadToStorageUncached(bucket, filePath, fileUri, contentType);
    if (result.publicUrl && !result.error) {
      await saveReusableUpload(identity!, bucket, filePath, result.publicUrl);
    }
    return result;
  })();
  inFlightUploads.set(inFlightKey, uploadPromise);
  try {
    return await uploadPromise;
  } finally {
    if (inFlightUploads.get(inFlightKey) === uploadPromise) {
      inFlightUploads.delete(inFlightKey);
    }
  }
}

/**
 * Get a short-lived private R2 read URL. This is used for paid media such as
 * AfuMusic, where the public CDN URL returned after upload must not grant
 * access by itself.
 */
export async function getSignedR2ReadUrl(
  bucket: string,
  filePath: string,
  trackId?: string,
): Promise<{ url: string | null; error: string | null }> {
  try {
    const token = await getAccessToken();
    if (!token) return { url: null, error: "Not authenticated" };
    const response = await fetch(uploadsUrl("read"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await edgeFnHeaders(token)),
      },
      body: JSON.stringify({ bucket, path: filePath, trackId }),
    });
    const text = await response.text().catch(() => "");
    if (!text || text.trimStart().startsWith("<")) {
      return { url: null, error: "Storage service unreachable" };
    }
    let body: any;
    try { body = JSON.parse(text); } catch {
      return { url: null, error: `Read URL failed (HTTP ${response.status})` };
    }
    if (!response.ok || !body?.url) {
      return { url: null, error: body?.error || `Read URL failed (HTTP ${response.status})` };
    }
    return { url: body.url, error: null };
  } catch (error: any) {
    return { url: null, error: error?.message || "Read URL failed" };
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
  // Multiple chat images upload concurrently. A timestamp alone is not unique
  // when Promise.all starts them in the same millisecond, which caused several
  // images to share one R2 key and appear as duplicates in the grouped message.
  // Keep the original name as the readable base, but always add a random
  // suffix so picker names such as IMG_0001.jpg cannot overwrite each other.
  const uniqueSuffix = Math.random().toString(36).slice(2, 10);
  const readableName = originalName?.split("/").pop()?.split("\\").pop()?.replace(/\.[^.]+$/, "") || `${Date.now()}`;
  const fileName = `${readableName}_${Date.now()}_${uniqueSuffix}.${ext}`;
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
    invalidateReusableUploads(key).catch(() => {});
    return { ok: true, error: null };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Delete failed" };
  }
}
