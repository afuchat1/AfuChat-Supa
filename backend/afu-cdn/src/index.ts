import {
  handleR2CdnLegacyRequest,
  handleR2CdnRequest,
  type R2CdnBucket,
} from "../../shared/r2-cdn.ts";

interface Env {
  CHAT_ASSETS: R2CdnBucket;
  CLOUD_ASSETS: R2CdnBucket;
  MAIL_ASSETS: R2CdnBucket;
  AI_ASSETS: R2CdnBucket;
  ADS_ASSETS: R2CdnBucket;
  LEGACY_MEDIA: R2CdnBucket;
}

const CDN_HOST = "cdn.afuchat.com";
const PRODUCT_BUCKET_NAMES = {
  chat: "CHAT_ASSETS",
  cloud: "CLOUD_ASSETS",
  mail: "MAIL_ASSETS",
  ai: "AI_ASSETS",
  ads: "ADS_ASSETS",
} as const;

type Product = keyof typeof PRODUCT_BUCKET_NAMES;

type Namespace =
  | { kind: "product"; product: Product; canonical: boolean }
  | { kind: "legacy" }
  | { kind: "invalid" };

function isProduct(value: string): value is Product {
  return Object.prototype.hasOwnProperty.call(PRODUCT_BUCKET_NAMES, value);
}

function resolveNamespace(pathname: string): Namespace {
  const encodedFirstSegment = pathname.startsWith("/")
    ? pathname.slice(1).split("/", 1)[0] ?? ""
    : "";
  if (!encodedFirstSegment) return { kind: "legacy" };

  let firstSegment: string;
  try {
    firstSegment = decodeURIComponent(encodedFirstSegment);
  } catch {
    return { kind: "invalid" };
  }

  if (!isProduct(firstSegment)) return { kind: "legacy" };
  return {
    kind: "product",
    product: firstSegment,
    canonical: encodedFirstSegment === firstSegment,
  };
}

function bucketFor(env: Env, product: Product): R2CdnBucket {
  switch (product) {
    case "chat":
      return env.CHAT_ASSETS;
    case "cloud":
      return env.CLOUD_ASSETS;
    case "mail":
      return env.MAIL_ASSETS;
    case "ai":
      return env.AI_ASSETS;
    case "ads":
      return env.ADS_ASSETS;
  }
}

function genericNotFound(): Response {
  return new Response("The requested media object was not found.", {
    status: 404,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, If-None-Match, If-Modified-Since, If-Range",
      "Access-Control-Expose-Headers": "X-AfuCdn-Request-Id",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}

async function dispatch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== CDN_HOST) return genericNotFound();

  const namespace = resolveNamespace(url.pathname);
  if (namespace.kind === "invalid") return genericNotFound();
  if (namespace.kind === "product") {
    if (!namespace.canonical) return genericNotFound();
    return handleR2CdnRequest(request, bucketFor(env, namespace.product), namespace.product);
  }

  // Unprefixed paths remain compatible with legacy objects in afuchat-media.
  // Unknown future namespaces continue to resolve as legacy keys until added
  // to PRODUCT_BUCKET_NAMES.
  return handleR2CdnLegacyRequest(request, env.LEGACY_MEDIA);
}

function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-AfuCdn-Request-Id", requestId);
  const exposedHeaders = headers.get("Access-Control-Expose-Headers");
  if (exposedHeaders && !exposedHeaders.toLowerCase().includes("x-afucdn-request-id")) {
    headers.set("Access-Control-Expose-Headers", `${exposedHeaders}, X-AfuCdn-Request-Id`);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      return withRequestId(await dispatch(request, env), requestId);
    } catch (cause) {
      const url = new URL(request.url);
      console.error("CDN request failed", {
        requestId,
        method: request.method,
        path: url.pathname,
        error: cause instanceof Error ? cause.message : "unknown error",
      });
      return withRequestId(
        new Response("The media service is temporarily unavailable.", {
          status: 503,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, If-None-Match, If-Modified-Since, If-Range",
            "Access-Control-Expose-Headers": "X-AfuCdn-Request-Id",
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            "Cross-Origin-Resource-Policy": "cross-origin",
          },
        }),
        requestId,
      );
    }
  },
};
