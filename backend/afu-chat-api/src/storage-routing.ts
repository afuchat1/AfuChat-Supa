const CHAT_STORAGE_PREFIX = "/v1/chat/storage";
const LEGACY_PROXY_PREFIX = "/afuchat";
const LEGACY_MEDIA_PREFIX = `${LEGACY_PROXY_PREFIX}/v1`;

export function isChatStoragePath(pathname: string): boolean {
  return pathname === CHAT_STORAGE_PREFIX || pathname.startsWith(`${CHAT_STORAGE_PREFIX}/`);
}

export function toLegacyStoragePath(pathname: string): string | null {
  if (pathname === `${CHAT_STORAGE_PREFIX}/usage`) {
    return `${LEGACY_MEDIA_PREFIX}/storage/usage`;
  }
  if (pathname === `${CHAT_STORAGE_PREFIX}/containers`) {
    return `${LEGACY_MEDIA_PREFIX}/storage-containers`;
  }
  if (pathname.startsWith(`${CHAT_STORAGE_PREFIX}/containers/`)) {
    const suffix = pathname.slice(`${CHAT_STORAGE_PREFIX}/containers`.length);
    return `${LEGACY_MEDIA_PREFIX}/storage-containers${suffix}`;
  }
  if (pathname.startsWith(`${CHAT_STORAGE_PREFIX}/objects/`)) {
    const key = pathname.slice(`${CHAT_STORAGE_PREFIX}/objects`.length);
    return `${LEGACY_MEDIA_PREFIX}/storage${key}`;
  }
  return null;
}

export function toLegacyStorageRequest(request: Request): Request | null {
  const url = new URL(request.url);
  const pathname = toLegacyStoragePath(url.pathname);
  if (!pathname) return null;
  url.pathname = pathname;
  return new Request(url, request);
}

export function isLegacyStoragePath(pathname: string): boolean {
  return (
    pathname === "/v1/storage" ||
    pathname.startsWith("/v1/storage/") ||
    pathname === "/v1/storage-containers" ||
    pathname.startsWith("/v1/storage-containers/")
  );
}

export function toLegacyCompatibilityRequest(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = `${LEGACY_PROXY_PREFIX}${url.pathname}`;
  return new Request(url, request);
}
