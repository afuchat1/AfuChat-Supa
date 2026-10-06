import {
  isChatStoragePath,
  toChatStorageRequest,
} from "./storage-routing.ts";

type WorkerHandler = {
  fetch(request: Request, env: unknown, ctx: unknown): Response | Promise<Response>;
};

const CHAT_PREFIX = "/v1/chat";
const API_HOST = "api.afuchat.com";

export function createAfuChatWorkerRouter(chatApi: WorkerHandler, legacyApi: WorkerHandler) {
  return {
    fetch(request: Request, env: unknown, ctx: unknown) {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (url.hostname.toLowerCase() !== API_HOST) return notFound();

      if (isChatStoragePath(pathname)) {
        const storageRequest = toChatStorageRequest(request);
        return storageRequest
          ? legacyApi.fetch(storageRequest, env, ctx)
          : notFound();
      }

      if (pathname === CHAT_PREFIX || pathname.startsWith(`${CHAT_PREFIX}/`)) {
        return chatApi.fetch(request, env, ctx);
      }
      return notFound();
    },
  };
}

function notFound(): Response {
  return Response.json(
    { error: "The requested API endpoint was not found." },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
