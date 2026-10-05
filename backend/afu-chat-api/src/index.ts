interface Env {
  AFUCHAT_SUPABASE_URL?: string;
  AFUCHAT_SUPABASE_ANON_KEY?: string;
  AFUCHAT_DATABASE_SCHEMA?: string;
  AFUAUTH_API?: {
    fetch(request: Request): Promise<Response>;
  };
}

const PREFIX = "/v1/chat";
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

function privateJsonResponse(
  request: Request,
  requestId: string,
  body: Record<string, unknown>,
  status: number,
): Response {
  const response = jsonResponse(request, requestId, body, status);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Origin, Authorization");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleChatConversations(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = responseHeaders(request, requestId);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Origin, Authorization");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "GET") {
    const response = privateJsonResponse(
      request,
      requestId,
      { error: "Method not allowed", request_id: requestId },
      405,
    );
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Allow", "GET, OPTIONS");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return privateJsonResponse(
      request,
      requestId,
      { error: "A valid bearer token is required", request_id: requestId },
      401,
    );
  }
  const schema = env.AFUCHAT_DATABASE_SCHEMA?.trim() || "public";
  if (!/^[a-z][a-z0-9_]*$/i.test(schema)) {
    return privateJsonResponse(
      request,
      requestId,
      { error: "Chat data service is not configured", request_id: requestId },
      503,
    );
  }

  const incoming = new URL(request.url);
  const excludedIds = incoming.searchParams
    .getAll("unread_excluded_ids")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (excludedIds.length > 100 || excludedIds.some((id) => !uuidPattern.test(id))) {
    return privateJsonResponse(
      request,
      requestId,
      { error: "unread_excluded_ids must contain at most 100 UUIDs", request_id: requestId },
      400,
    );
  }

  if (!env.AFUAUTH_API) {
    return privateJsonResponse(
      request,
      requestId,
      { error: "Shared authentication service is not configured", request_id: requestId },
      503,
    );
  }

  try {
    const verified = await env.AFUAUTH_API.fetch(new Request(
      "https://afuauth.internal/v1/auth/session",
      {
        method: "POST",
        headers: { Authorization: authorization, Accept: "application/json" },
      },
    ));
    const payload = await verified.json().catch(() => null) as
      | { user?: { id?: unknown } }
      | null;
    if (verified.status === 401 || verified.status === 403) {
      return privateJsonResponse(
        request,
        requestId,
        { error: "Invalid or expired Supabase session", request_id: requestId },
        401,
      );
    }
    if (!verified.ok) {
      return privateJsonResponse(
        request,
        requestId,
        { error: "Shared authentication service is unavailable", request_id: requestId },
        503,
      );
    }
    if (typeof payload?.user?.id !== "string" || !payload.user.id) {
      return privateJsonResponse(
        request,
        requestId,
        { error: "Invalid or expired Supabase session", request_id: requestId },
        401,
      );
    }
  } catch {
    return privateJsonResponse(
      request,
      requestId,
      { error: "Shared authentication service is unavailable", request_id: requestId },
      503,
    );
  }

  const supabaseUrl = env.AFUCHAT_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anonKey = env.AFUCHAT_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) {
    return privateJsonResponse(
      request,
      requestId,
      { error: "Chat data service is not configured", request_id: requestId },
      503,
    );
  }

  const target = new URL(supabaseUrl);
  target.pathname = "/rest/v1/rpc/get_chat_list";
  target.search = "";
  const upstreamHeaders = new Headers({
    apikey: anonKey,
    Authorization: authorization,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
  });

  try {
    const upstream = await fetch(new Request(target, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify({ p_unread_excluded_ids: excludedIds }),
      redirect: "manual",
    }));
    const outgoingHeaders = new Headers(upstream.headers);
    responseHeaders(request, requestId).forEach((value, key) => {
      outgoingHeaders.set(key, value);
    });
    outgoingHeaders.set("Cache-Control", "private, no-store");
    outgoingHeaders.set("Vary", "Origin, Authorization");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outgoingHeaders,
    });
  } catch {
    return privateJsonResponse(
      request,
      requestId,
      { error: "Chat data service is unavailable", request_id: requestId },
      502,
    );
  }
}

async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const incoming = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(request, requestId),
    });
  }

  if (incoming.pathname === "/healthz" || incoming.pathname === `${PREFIX}/healthz`) {
    return jsonResponse(
      request,
      requestId,
      { product: "afuchat", worker: "afuchat-api", status: "ok", version: "v1" },
      200,
    );
  }

  if (
    incoming.pathname === `${PREFIX}/conversations` &&
    request.method !== "OPTIONS"
  ) {
    return handleChatConversations(request, env);
  }

  if (incoming.pathname === PREFIX || incoming.pathname.startsWith(`${PREFIX}/`)) {
    return jsonResponse(
      request,
      requestId,
      { error: "This AfuChat endpoint is not implemented yet", worker: "afuchat-api", request_id: requestId },
      501,
    );
  }
  return jsonResponse(request, requestId, { error: "Not found", path: incoming.pathname }, 404);
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === `${PREFIX}/conversations`) {
    return handleChatConversations(request, env);
  }
  return handleApiRequest(request, env);
}

export default {
  fetch: handleRequest,
};