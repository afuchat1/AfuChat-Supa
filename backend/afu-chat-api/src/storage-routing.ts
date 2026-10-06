const CHAT_STORAGE_PREFIX = "/v1/chat/storage";
const CHAT_PROXY_PREFIX = "/chat";
const CHAT_MEDIA_PREFIX = `${CHAT_PROXY_PREFIX}/v1`;

export function isChatStoragePath(pathname: string): boolean {
  return pathname === CHAT_STORAGE_PREFIX || pathname.startsWith(`${CHAT_STORAGE_PREFIX}/`);
}

export function toChatStoragePath(pathname: string): string | null {
  if (pathname === `${CHAT_STORAGE_PREFIX}/usage`) {
    return `${CHAT_MEDIA_PREFIX}/storage/usage`;
  }
  if (pathname === `${CHAT_STORAGE_PREFIX}/containers`) {
    return `${CHAT_MEDIA_PREFIX}/storage-containers`;
  }
  if (pathname.startsWith(`${CHAT_STORAGE_PREFIX}/containers/`)) {
    const suffix = pathname.slice(`${CHAT_STORAGE_PREFIX}/containers`.length);
    return `${CHAT_MEDIA_PREFIX}/storage-containers${suffix}`;
  }
  if (pathname.startsWith(`${CHAT_STORAGE_PREFIX}/objects/`)) {
    const key = pathname.slice(`${CHAT_STORAGE_PREFIX}/objects`.length);
    return `${CHAT_MEDIA_PREFIX}/storage${key}`;
  }
  return null;
}

export function toChatStorageRequest(request: Request): Request | null {
  const url = new URL(request.url);
  const pathname = toChatStoragePath(url.pathname);
  if (!pathname) return null;
  url.pathname = pathname;
  return new Request(url, request);
}
