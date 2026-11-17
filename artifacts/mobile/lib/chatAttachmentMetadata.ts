export type ChatAttachmentMetadata = {
  attachment_name?: string | null;
  attachment_mime_type?: string | null;
  attachment_size?: number | null;
};

const MIME_EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
  "application/x-7z-compressed": "7z",
  "application/x-rar-compressed": "rar",
  "application/json": "json",
  "text/plain": "txt",
  "text/csv": "csv",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function sanitizeName(name: string): string {
  return name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[:*?"<>|]/g, "_")
    .trim()
    .replace(/^\.+$/, "");
}

function nameFromUrl(url?: string | null): string {
  if (!url) return "";
  try {
    const parsed = new URL(url, "https://afuchat.invalid");
    const rawName = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    const decoded = decodePathSegment(rawName);
    // New uploads include a timestamp and random suffix before the extension.
    return decoded.replace(/_\d{10,}_[a-z0-9]{4,}(?=\.[^.]+$)/i, "");
  } catch {
    return "";
  }
}

export function getChatAttachmentName(
  name?: string | null,
  url?: string | null,
): string {
  const candidate = sanitizeName(name?.trim() || nameFromUrl(url));
  return candidate || "Shared file";
}

export function getChatAttachmentExtension(
  name?: string | null,
  mimeType?: string | null,
): string {
  const filename = getChatAttachmentName(name);
  const suffix = filename.split(".").pop()?.toLowerCase() ?? "";
  if (filename.includes(".") && /^[a-z0-9]{1,12}$/.test(suffix)) return suffix;
  const normalizedMime = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_EXTENSION[normalizedMime] ?? "";
}

export function getChatAttachmentTypeLabel(
  name?: string | null,
  mimeType?: string | null,
): string {
  const extension = getChatAttachmentExtension(name, mimeType);
  if (extension) return extension.toUpperCase();
  const normalizedMime = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalizedMime.startsWith("image/")) return "IMAGE";
  if (normalizedMime.startsWith("audio/")) return "AUDIO";
  if (normalizedMime.startsWith("video/")) return "VIDEO";
  return "FILE";
}

export function normalizeChatAttachmentMimeType(
  mimeType?: string | null,
  fileName?: string | null,
): string {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (normalized && normalized !== "application/octet-stream") return normalized;
  const extension = getChatAttachmentExtension(fileName, normalized);
  const inferred = Object.entries(MIME_EXTENSION).find(([, ext]) => ext === extension)?.[0];
  return inferred ?? normalized ?? "application/octet-stream";
}

export function normalizeChatAttachmentSize(size?: number | null): number | null {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return null;
  return Math.floor(size);
}
