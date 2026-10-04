import { AFUCHAT_MEDIA_CDN_URL } from "./env";

const CDN_BASE = AFUCHAT_MEDIA_CDN_URL.replace(/\/+$/, "");
const API_HOST = "api.afuchat.com";
const R2_HOST_SUFFIXES = [".r2.dev", ".r2.cloudflarestorage.com"];

function canonicalMediaUrl(key: string): string | null {
  const normalized = key.replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  return `${CDN_BASE}/${normalized.split("/").map(encodeURIComponent).join("/")}`;
}

function keyFromStoragePath(pathname: string): string | null {
  const prefixes = ["/afuchat/v1/storage/", "/v1/storage/"];
  const prefix = prefixes.find((candidate) => pathname.startsWith(candidate));
  if (!prefix) return null;
  try {
    return decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

/**
 * Route app-owned media only through the AfuChat CDN and bucket.
 * Unrelated external media (for example GIF provider URLs) stays unchanged.
 */
export function toAfuChatMediaUrl(
  value: string | null | undefined,
): string | null | undefined {
  if (
    !value ||
    value.startsWith("file:") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }

  if (value.startsWith("/chat/")) return `${CDN_BASE}${value.slice("/chat".length)}`;
  if (value.startsWith("/afuchat/v1/storage/") || value.startsWith("/v1/storage/")) {
    const key = keyFromStoragePath(value);
    return key ? canonicalMediaUrl(key) : value;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (host === "cdn.afuchat.com" && parsed.pathname.startsWith("/chat/")) {
      return value;
    }

    if (host === API_HOST) {
      const key = keyFromStoragePath(parsed.pathname);
      if (key) return canonicalMediaUrl(key) || value;
    }

    if (R2_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)) || host === "r2.cloudflarestorage.com") {
      const key = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
      return canonicalMediaUrl(key) || value;
    }
  } catch {
    return value;
  }
  return value;
}