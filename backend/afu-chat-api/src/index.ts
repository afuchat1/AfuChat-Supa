interface Env {
  AFUCHAT_SUPABASE_URL?: string;
  AFUCHAT_SUPABASE_ANON_KEY?: string;
  AFUCHAT_DATABASE_SCHEMA?: string;
}

const PREFIX = "/afuchat";
const SUPABASE_PREFIXES = ["/auth/v1", "/rest/v1", "/realtime/v1"] as const;
const ALLOWED_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type, apikey, X-Client-Info";
const EXPOSED_HEADERS = "Content-Range, X-AfuChat-Request-Id, X-AfuChat-Version";

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;

  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (
      host === "afuchat.com" ||
      host.endsWith(".afuchat.com") ||
      host.endsWith(".vercel.app") ||
      host.endsWith(".replit.dev") ||
      host.endsWith(".replit.app")
    ) {
      return origin;
    }
  } catch {
    // Invalid Origin values are never reflected.
  }

  return null;
}

function responseHeaders(request: Request, requestId: string): Headers {
  const headers = new Headers({
    "X-AfuChat-Request-Id": requestId,
    "X-AfuChat-Version": "v1",
    Vary: "Origin",
  });
  const origin = allowedOrigin(request.headers.get("Origin"));
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    headers.set("Access-Control-Expose-Headers", EXPOSED_HEADERS);
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

function jsonResponse(
  request: Request,
  requestId: string,
  body: Record<string, unknown>,
  status: number,
): Response {
  const headers = responseHeaders(request, requestId);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function isSupabasePath(path: string): boolean {
  return SUPABASE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function hasBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

function stripProductPrefix(path: string): string | null {
  if (path === PREFIX) return "/";
  if (!path.startsWith(`${PREFIX}/`)) return null;
  return path.slice(PREFIX.length);
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const incoming = new URL(request.url);
  const productPath = stripProductPrefix(incoming.pathname);
  if (productPath === null) {
    return jsonResponse(request, requestId, { error: "Not found" }, 404);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(request, requestId),
    });
  }

  if (productPath === "/" || productPath === "/healthz") {
    return jsonResponse(
      request,
      requestId,
      { product: "afuchat", worker: "afu-chat-api", status: "ok", version: "v1" },
      200,
    );
  }

  if (!isSupabasePath(productPath)) {
    return jsonResponse(
      request,
      requestId,
      {
        error: "Endpoint is not migrated to afu-chat-api",
        product: "afuchat",
        request_id: requestId,
      },
      501,
    );
  }

  const supabaseUrl = env.AFUCHAT_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anonKey = env.AFUCHAT_SUPABASE_ANON_KEY?.trim();
  const schema = env.AFUCHAT_DATABASE_SCHEMA?.trim();
  if (!supabaseUrl || !anonKey || (productPath.startsWith("/rest/v1") && !schema)) {
    return jsonResponse(
      request,
      requestId,
      { error: "AfuChat Supabase gateway is not fully configured", request_id: requestId },
      503,
    );
  }

  const target = new URL(`${supabaseUrl}${productPath}${incoming.search}`);
  const headers = new Headers(request.headers);
  headers.set("apikey", anonKey);
  headers.delete("host");
  headers.delete("content-length");
  if (productPath === "/rest/v1" || productPath.startsWith("/rest/v1/")) {
    headers.set("Accept-Profile", schema!);
    if (request.method !== "GET" && request.method !== "HEAD") {
      headers.set("Content-Profile", schema!);
    }
  }

  try {
    const upstream = await fetch(
      new Request(target, {
        method: request.method,
        headers,
        body: hasBody(request.method) ? request.body : undefined,
        redirect: "manual",
      }),
    );
    const outgoingHeaders = new Headers(upstream.headers);
    responseHeaders(request, requestId).forEach((value, key) => {
      outgoingHeaders.set(key, value);
    });
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outgoingHeaders,
    });
  } catch {
    return jsonResponse(
      request,
      requestId,
      { error: "Upstream database service unavailable", request_id: requestId },
      502,
    );
  }
}

export default {
  fetch: handleRequest,
};