import {
  isChatStoragePath,
  isLegacyStoragePath,
  toLegacyCompatibilityRequest,
  toLegacyStorageRequest,
} from "./storage-routing.ts";

type WorkerHandler = {
  fetch(request: Request, env: unknown, ctx: unknown): Response | Promise<Response>;
};

const CHAT_PREFIX = "/v1/chat";

export function createAfuChatWorkerRouter(chatApi: WorkerHandler, legacyApi: WorkerHandler) {
  return {
    fetch(request: Request, env: unknown, ctx: unknown) {
      const pathname = new URL(request.url).pathname;

      if (isChatStoragePath(pathname)) {
        const storageRequest = toLegacyStorageRequest(request);
        if (storageRequest) return legacyApi.fetch(storageRequest, env, ctx);
      }
      if (pathname === CHAT_PREFIX || pathname.startsWith(`${CHAT_PREFIX}/`)) {
        return chatApi.fetch(request, env, ctx);
      }
      if (isLegacyStoragePath(pathname)) {
        return legacyApi.fetch(toLegacyCompatibilityRequest(request), env, ctx);
      }
      return legacyApi.fetch(request, env, ctx);
    },
  };
}
