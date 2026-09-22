/**
 * Media upload helpers — Cloudflare R2 backed via the AfuCloud API.
 *
 * Uploads flow:
 *   Web:
 *     1. Exchange the current AfuChat Supabase session for an AfuCloud API token.
 *     2. POST bytes to AfuCloud's streamed container upload route.
 *     3. Confirm the object so AfuCloud records its R2 metadata.
 *
 *   Native (iOS/Android):
 *     1. Exchange the current AfuChat Supabase session for an AfuCloud API token.
 *     2. POST to AfuCloud for a presigned PUT URL.
 *     3. PUT bytes directly to Cloudflare R2 using the presigned URL.
 *     4. Confirm the object so AfuCloud records its R2 metadata.
 *     5. Falls back to AfuCloud's streamed proxy upload if presigned PUT fails.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { AFUCLOUD_API_URL } from "./env";
import * as FileSystem from "expo-file-system/legacy";
import { FileSystemUploadType } from "expo-file-system/legacy";

const AFUCLOUD_BASE = AFUCLOUD_API_URL.replace(/\/$/, "");
const AFUCLOUD_SESSION_PATH = "/v1/auth/session";

interface AfuCloudSession {
  userId: string;
  accessToken: string;
  expiresAt: number;
}

let afuCloudSession: AfuCloudSession | null = null;
let afuCloudSessionPromise: Promise<{ token: string | null; error: string | null }> | null = null;
const containerIds = new Map<string, string>();
const containerPromises = new Map<string, Promise<{ id: string | null; error: string | null }>>();

function afuCloudUrl(path: string): string {
  return `${AFUCLOUD_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function readJwtExpiry(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return Date.now() + 10 * 60_000;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded));
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : Date.now() + 10 * 60_000;
  } catch {
    return Date.now() + 10 * 60_000;
  }
}

async function afuCloudToken(force = false): Promise<{ token: string | null; error: string | null }> {
  const session = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const supabaseSession = session.data.session;
  if (!supabaseSession) return { token: null, error: "Not authenticated" };

  if (
    !force &&
    afuCloudSession &&
    afuCloudSession.userId === supabaseSession.user.id &&
    afuCloudSession.expiresAt > Date.now() + 30_000
  ) {
    return { token: afuCloudSession.accessToken, error: null };
  }

  if (afuCloudSessionPromise) return afuCloudSessionPromise;
  afuCloudSessionPromise = (async () => {
    try {
      const response = await fetch(afuCloudUrl(AFUCLOUD_SESSION_PATH), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseSession.access_token}`,
          "Content-Type": "application/json",
        },
      });
      const body = await response.json().catch(() => null) as any;
      if (!response.ok || !body?.accessToken) {
        afuCloudSession = null;
        return {
          token: null,
          error: body?.error || `AfuCloud session exchange failed (HTTP ${response.status})`,
        };
      }
      afuCloudSession = {
        userId: supabaseSession.user.id,
        accessToken: body.accessToken,
        expiresAt: readJwtExpiry(body.accessToken),
      };
      return { token: body.accessToken, error: null };
    } catch (error: any) {
      return { token: null, error: `AfuCloud network error: ${error?.message || error}` };
    } finally {
      afuCloudSessionPromise = null;
    }
  })();
  return afuCloudSessionPromise;
}

function clearAfuCloudSession() {
  afuCloudSession = null;
  containerIds.clear();
}

async function afuCloudJson(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<{ response: Response | null; body: any; error: string | null }> {
  const auth = await afuCloudToken();
  if (!auth.token) return { response: null, body: null, error: auth.error };
  let response: Response;
  try {
    response = await fetch(afuCloudUrl(path), {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    return { response: null, body: null, error: error?.message || "AfuCloud request failed" };
  }
  const body = await response.json().catch(() => null);
  if (response.status === 401 && retry) {
    clearAfuCloudSession();
    return afuCloudJson(path, init, false);
  }
  if (response.status >= 500 && response.status <= 599 && retry) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return afuCloudJson(path, init, false);
  }
  if (!response.ok) {
    const requestId = response.headers.get("X-AfuCloud-Request-Id");
    const requestSuffix = requestId ? ` [request ${requestId}]` : "";
    return {
      response,
      body,
      error: body?.error
        ? `${body.error}${requestSuffix}`
        : `AfuCloud request failed (HTTP ${response.status})${requestSuffix}`,
    };
  }
  return { response, body, error: null };
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

  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error("Temporary storage is unavailable. Please try again.");
  }

  const normalizedExt = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const existingInfo = fileUri.startsWith(cacheDirectory)
    ? await FileSystem.getInfoAsync(fileUri).catch(() => ({ exists: false }))
    : null;
  if (existingInfo?.exists) return fileUri;

  const destination = `${cacheDirectory}story_source_${Date.now()}_${Math.random()
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

function containerSlug(bucket: string): string {
  return bucket.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

async function getContainerId(
  bucket: string,
): Promise<{ id: string | null; error: string | null }> {
  const slug = containerSlug(bucket);
  const cached = containerIds.get(slug);
  if (cached) return { id: cached, error: null };
  const pending = containerPromises.get(slug);
  if (pending) return pending;

  const request = (async () => {
    const list = await afuCloudJson("/v1/storage-containers");
    if (list.error) return { id: null, error: list.error };
    const existing = Array.isArray(list.body)
      ? list.body.find((item: any) => item?.slug === slug || item?.name === bucket)
      : null;
    if (existing?.id) {
      containerIds.set(slug, existing.id);
      return { id: existing.id, error: null };
    }

    const created = await afuCloudJson("/v1/storage-containers", {
      method: "POST",
      body: JSON.stringify({ name: bucket }),
    });
    if (created.error && created.response?.status !== 409) {
      return { id: null, error: created.error };
    }
    if (created.body?.id) {
      containerIds.set(slug, created.body.id);
      return { id: created.body.id, error: null };
    }

    // A simultaneous upload on another device may have created the container
    // after the list above. Re-read once after a conflict.
    const reread = await afuCloudJson("/v1/storage-containers");
    const found = Array.isArray(reread.body)
      ? reread.body.find((item: any) => item?.slug === slug || item?.name === bucket)
      : null;
    if (found?.id) {
      containerIds.set(slug, found.id);
      return { id: found.id, error: null };
    }
    return { id: null, error: created.error || "AfuCloud storage container could not be created" };
  })();
  containerPromises.set(slug, request);
  try {
    return await request;
  } finally {
    containerPromises.delete(slug);
  }
}

async function proxyUpload(
  bucket: string,
  filePath: string,
  body: Blob | ArrayBuffer,
  contentType: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const bodySize = body instanceof Blob ? body.size : body instanceof ArrayBuffer ? body.byteLength : 0;
  if (!bodySize) return { publicUrl: null, error: "Selected file is empty or could not be read." };

  const container = await getContainerId(bucket);
  if (!container.id) return { publicUrl: null, error: container.error };
  const auth = await afuCloudToken();
  if (!auth.token) return { publicUrl: null, error: auth.error };

  const qs = new URLSearchParams({ name: filePath }).toString();
  let response: Response | null = null;
  let json: any = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(
        afuCloudUrl(`/v1/storage-containers/${encodeURIComponent(container.id)}/upload?${qs}`),
        {
          method: "POST",
          headers: {
            "Content-Type": contentType,
            Authorization: `Bearer ${auth.token}`,
          },
          body: body as any,
        },
      );
    } catch (e: any) {
      if (attempt === 1) return { publicUrl: null, error: `Upload failed: ${e?.message || e}` };
      await new Promise((resolve) => setTimeout(resolve, 350));
      continue;
    }

    json = await response.json().catch(() => null) as any;
    if (response.ok && json?.key) break;
    if (response.status < 500 || attempt === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  if (!response || !response.ok || !json?.key) {
    if (response?.status === 401) clearAfuCloudSession();
    return {
      publicUrl: null,
      error: response
        ? uploadResponseError(response, json, `Upload failed (HTTP ${response.status})`)
        : "Upload failed",
    };
  }
  return confirmUpload(bucket, filePath, json.key, contentType, json.size || bodySize, json.etag);
}

function publicObjectUrl(body: any, key: string): string {
  // Always return the AfuCloud API route. The worker owns the R2 credentials
  // and redirects to a short-lived object URL server-side.
  void body;
  return afuCloudUrl(`/v1/storage/${encodeURIComponent(key)}`);
}

function uploadResponseError(response: Response, body: any, fallback: string): string {
  const requestId = response.headers.get("X-AfuCloud-Request-Id");
  const requestSuffix = requestId ? ` [request ${requestId}]` : "";
  return `${body?.error || fallback}${requestSuffix}`;
}

async function confirmUpload(
  bucket: string,
  filePath: string,
  key: string,
  contentType: string,
  size: number,
  etag?: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const container = await getContainerId(bucket);
  if (!container.id) return { publicUrl: null, error: container.error };
  const result = await afuCloudJson(
    `/v1/storage-containers/${encodeURIComponent(container.id)}/objects/confirm`,
    {
      method: "POST",
      body: JSON.stringify({
        name: filePath,
        key,
        contentType,
        size: Number.isFinite(size) ? size : 0,
        etag: etag || null,
      }),
    },
  );
  if (result.error) {
    // The R2 write has already completed before confirmation is called. A
    // transient database/schema failure must not turn a successfully uploaded
    // attachment into a failed message. The storage route can still resolve
    // this object by its opaque key; a later storage reconciliation can add
    // the metadata row.
    if (result.response && result.response.status >= 500) {
      console.warn("[Upload] Metadata confirmation failed after R2 write; using object URL:", result.error);
      return { publicUrl: publicObjectUrl(result.body, key), error: null };
    }
    return { publicUrl: null, error: result.error };
  }
  return { publicUrl: publicObjectUrl(result.body, key), error: null };
}

async function proxyStreamUpload(
  bucket: string,
  filePath: string,
  uploadUri: string,
  contentType: string,
  size: number,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const container = await getContainerId(bucket);
  if (!container.id) return { publicUrl: null, error: container.error };
  const auth = await afuCloudToken();
  if (!auth.token) return { publicUrl: null, error: auth.error };
  const qs = new URLSearchParams({ name: filePath }).toString();
  try {
    let response: Awaited<ReturnType<typeof FileSystem.uploadAsync>> | null = null;
    let body: any = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await FileSystem.uploadAsync(
        `${afuCloudUrl(`/v1/storage-containers/${encodeURIComponent(container.id)}/upload`)}?${qs}`,
        uploadUri,
        {
          httpMethod: "POST",
          headers: {
            "Content-Type": contentType,
            Authorization: `Bearer ${auth.token}`,
          },
          uploadType: FileSystemUploadType.BINARY_CONTENT,
        },
      );
      body = response.body ? JSON.parse(response.body) : null;
      if (response.status >= 200 && response.status < 300 && body?.key) break;
      if (response.status < 500 || attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (!response || response.status < 200 || response.status >= 300 || !body?.key) {
      if (response?.status === 401) clearAfuCloudSession();
      const headers = (response as any)?.headers || {};
      const requestId = headers["X-AfuCloud-Request-Id"] || headers["x-afucloud-request-id"];
      const requestSuffix = requestId ? ` [request ${requestId}]` : "";
      return {
        publicUrl: null,
        error: `${body?.error || `Upload failed (HTTP ${response?.status ?? "unknown"})`}${requestSuffix}`,
      };
    }
    return confirmUpload(bucket, filePath, body.key, contentType, body.size || size, body.etag);
  } catch (error: any) {
    return { publicUrl: null, error: error?.message || "Upload failed" };
  }
}

/**
 * Upload a file to Cloudflare R2.
 *
 * Web:            proxied through AfuCloud (avoids R2 CORS).
 * Native file://: FileSystem.uploadAsync streams bytes directly — no ArrayBuffer
 *                 loaded into memory, safe for 100 MB+ videos.
 * Native data:/blob:: fileUriToBlob + proxy (already in-memory, small).
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
    const realBucket = resolveBucket(bucket);

    // ── data: / blob: URIs are already in memory — small files ─────────────
    if (fileUri.startsWith("data:") || fileUri.startsWith("blob:")) {
      let body: Blob | ArrayBuffer;
      try {
        body = await fileUriToBlob(fileUri, mime);
      } catch {
        return { publicUrl: null, error: "Could not read selected file. Please try again." };
      }
      // All bytes go through AfuCloud. Do not expose a presigned R2 URL to
      // clients; the worker remains the only storage boundary.
      return proxyUpload(realBucket, filePath, body, mime);
    }

    // ── Native file:// path — stream via FileSystem.uploadAsync ─────────────
    // This is the critical path for video uploads: avoids loading the entire
    // file into JS memory (which would OOM on 50-100 MB videos).
    //
    // Android quirk: on some devices the camera cache directory may not exist
    // when ExponentFileSystem tries to open the source file, causing
    // "java.io.IOException: Directory for '...' doesn't exist".
    // Fix: copy the file to a known-accessible cacheDirectory temp path first.
    let uploadUri = fileUri;
    let tempPath: string | null = null;
    try {
      // Copy to a stable cacheDirectory path so FileSystem.uploadAsync has a
      // guaranteed-readable source (avoids volatile camera/temp dirs).
      if (FileSystem.cacheDirectory) {
        tempPath = `${FileSystem.cacheDirectory}upload_tmp_${Date.now()}.${ext}`;
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

    const cleanupTemp = () => {
      if (tempPath) {
        FileSystem.deleteAsync(tempPath!, { idempotent: true }).catch(() => {});
      }
    };

    const fileInfo = await FileSystem.getInfoAsync(uploadUri).catch(() => ({ exists: false } as any));
    const fileSize = Number((fileInfo as any).size ?? 0);

    // Stream the bytes through AfuCloud. The worker writes to R2 server-side.
    //    Still streamed via FileSystem.uploadAsync, not loaded into memory.
    const streamed = await proxyStreamUpload(realBucket, filePath, uploadUri, mime, fileSize);
    if (!streamed.error || !fileUri.startsWith("content:")) {
      cleanupTemp();
      return streamed;
    }
    console.warn(`[Upload] Native proxy stream failed, trying readable URI fallback: ${streamed.error}`);

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
    return { publicUrl: null, error: e?.message || "Upload failed" };
  }
}

/**
 * Resolve a stored AfuCloud object to its canonical download route.
 *
 * AfuCloud's storage route mints the short-lived R2 URL server-side. The
 * object key is opaque and the API remains the only service that knows the R2
 * bucket credentials.
 */
export async function getSignedR2ReadUrl(
  bucket: string,
  filePath: string,
  trackId?: string,
): Promise<{ url: string | null; error: string | null }> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return { url: null, error: "Not authenticated" };
    const container = await getContainerId(resolveBucket(bucket));
    if (!container.id) return { url: null, error: container.error };
    const key = `containers/${userId}/${container.id}/${filePath.replace(/^\/+/, "")}`;
    return { url: afuCloudUrl(`/v1/storage/${encodeURIComponent(key)}`), error: null };
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
    const result = await afuCloudJson("/v1/storage-containers");
    if (result.error || !Array.isArray(result.body)) return null;
    const quotaBytes = 5 * 1024 * 1024 * 1024;
    const perBucket: StorageUsage["per_bucket"] = {};
    let usedBytes = 0;
    let usedCount = 0;
    for (const container of result.body) {
      const bytes = Number(container?.storageUsed ?? 0);
      const count = Number(container?.objectCount ?? 0);
      const name = String(container?.slug || container?.name || "uploads");
      perBucket[name] = { bytes, count };
      usedBytes += Number.isFinite(bytes) ? bytes : 0;
      usedCount += Number.isFinite(count) ? count : 0;
    }
    const parsed: StorageUsage = {
      user_id: (await supabase.auth.getSession()).data.session?.user.id || "",
      used_bytes: usedBytes,
      used_count: usedCount,
      quota_bytes: quotaBytes,
      remaining_bytes: Math.max(0, quotaBytes - usedBytes),
      percent_used: Math.min(100, (usedBytes / quotaBytes) * 100),
      per_bucket: perBucket,
    };
    AsyncStorage.setItem(USAGE_CACHE_KEY, JSON.stringify(parsed)).catch(() => {});
    return parsed;
  } catch { return null; }
}

export async function listUserFiles(
  bucket: string,
  token?: string,
): Promise<{ items: StoredFile[]; nextToken: string | null } | null> {
  try {
    const realBucket = resolveBucket(bucket);
    const container = await getContainerId(realBucket);
    if (!container.id) return null;
    const result = await afuCloudJson(
      `/v1/storage-containers/${encodeURIComponent(container.id)}/objects`,
    );
    if (result.error || !Array.isArray(result.body?.objects)) return null;
    return {
      items: result.body.objects.map((object: any) => ({
        key: `${realBucket}/${object.key}`,
        size: Number(object.size ?? 0),
        last_modified: object.updatedAt || object.createdAt || null,
        url: object.url ? publicObjectUrl(object, object.key) : null,
      })),
      nextToken: null,
    };
  } catch { return null; }
}

export async function deleteUserFile(key: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    const separator = key.indexOf("/");
    if (separator <= 0 || separator === key.length - 1) {
      return { ok: false, error: "Invalid storage key" };
    }
    const bucket = resolveBucket(key.slice(0, separator));
    const objectKey = key.slice(separator + 1);
    const container = await getContainerId(bucket);
    if (!container.id) return { ok: false, error: container.error };
    const result = await afuCloudJson(
      `/v1/storage-containers/${encodeURIComponent(container.id)}/objects/by-key`,
      {
      method: "DELETE",
        body: JSON.stringify({ key: objectKey }),
      },
    );
    if (result.error) return { ok: false, error: result.error };
    AsyncStorage.removeItem(USAGE_CACHE_KEY).catch(() => {});
    return { ok: true, error: null };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Delete failed" };
  }
}
