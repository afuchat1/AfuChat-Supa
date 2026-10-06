import { handleR2CdnRequest, type R2CdnBucket } from "../../shared/r2-cdn.ts";

interface Env {
  ADS_ASSETS: R2CdnBucket;
}

function json(request: Request, body: unknown, status = 200): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "X-AfuAds-Worker": "afuads-api",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, X-Client-Info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  });
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      if (host === "afuchat.com" || host.endsWith(".afuchat.com") || host.endsWith(".replit.dev") || host.endsWith(".replit.app") || host.endsWith(".vercel.app")) {
        headers.set("Access-Control-Allow-Origin", origin);
      }
    } catch {}
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.hostname.toLowerCase() === "cdn.afuchat.com" && url.pathname.startsWith("/ads/")) {
      return handleR2CdnRequest(request, env.ADS_ASSETS, "ads");
    }
    const path = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json(request, {}).headers });
    if (path === "/healthz" || path === "/v1/ads/healthz") {
      return json(request, { status: "ok", worker: "afuads-api", version: "v1" });
    }
    if (path === "/v1/ads" || path.startsWith("/v1/ads/")) {
      return json(request, {
        error: "AfuAds API endpoint is not implemented yet",
        worker: "afuads-api",
        namespace: "/v1/ads/*",
      }, 501);
    }
    return json(request, { error: "Not found", path }, 404);
  },
};
