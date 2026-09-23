import { AFUCLOUD_API_URL } from "./env";

const AFUCLOUD_BASE = AFUCLOUD_API_URL.replace(/\/$/, "");

function afuCloudStorageUrl(key: string): string {
  return `${AFUCLOUD_BASE}/v1/storage/${encodeURIComponent(key)}`;
}

/**
 * Keep app-owned media behind the AfuCloud API. Legacy R2/CDN URLs are
 * converted to the worker's canonical storage route; unrelated external
 * media such as GIFs remains untouched.
 */
export function toAfuCloudMediaUrl(value: string | null | undefined): string | null | undefined {
  if (!value || value.startsWith("file:") || value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }

  if (value.startsWith(`${AFUCLOUD_BASE}/`)) return value;
  if (value.startsWith("/v1/storage/")) return `${AFUCLOUD_BASE}${value}`;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const isAfuCloudStorage =
      host.endsWith(".r2.dev") ||
      host.endsWith(".r2.cloudflarestorage.com") ||
      host === "r2.cloudflarestorage.com";
    if (!isAfuCloudStorage) return value;

    const key = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    return key ? afuCloudStorageUrl(key) : value;
  } catch {
    return value;
  }
}