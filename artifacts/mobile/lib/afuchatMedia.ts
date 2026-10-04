import { AFUCHAT_MEDIA_CDN_URL } from "./env";

const CDN_BASE = AFUCHAT_MEDIA_CDN_URL.replace(/\/+$/, "");
const CDN_ROOT = (() => {
  try {
    return new URL(CDN_BASE).origin;
  } catch {
    return CDN_BASE;
  }
})();
const API_HOST = "api.afuchat.com";
const R2_HOST_SUFFIXES = [".r2.dev", ".r2.cloudflarestorage.com"];
const CONTAINERS_KEY_PREFIX = "containers/";

function canonicalMediaUrl(key: string, suffix = ""): string | null {
  const normalized = key.replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  // New container objects live in the isolated /chat Worker bucket. Legacy
  // object keys remain in the original bucket served by the CDN root domain.
  const base = normalized.startsWith(CONTAINERS_KEY_PREFIX) ? CDN_BASE : CDN_ROOT;
  return `${base}/${normalized.split("/").map(encodeURIComponent).join("/")}${suffix}`;
}

function keyFromCdnPath(pathname: string): string | null {
  const prefix = "/chat/";
  if (!pathname.startsWith(prefix)) return null;
  try {
    return pathname
      .slice(prefix.length)
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
  } catch {
    return null;
  }
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

  if (value.startsWith("/chat/")) {
    const parsed = new URL(value, `${CDN_ROOT}/`);
    const key = keyFromCdnPath(parsed.pathname);
    return key
      ? canonicalMediaUrl(key, `${parsed.search}${parsed.hash}`) || value
      : value;
  }
  if (value.startsWith("/afuchat/v1/storage/") || value.startsWith("/v1/storage/")) {
    const key = keyFromStoragePath(value);
    return key ? canonicalMediaUrl(key) : value;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (host === "cdn.afuchat.com" && parsed.pathname.startsWith("/chat/")) {
      const key = keyFromCdnPath(parsed.pathname);
      return key
        ? canonicalMediaUrl(key, `${parsed.search}${parsed.hash}`) || value
        : value;
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