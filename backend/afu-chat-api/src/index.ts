import { handleAccountExport } from "./account-export.ts";
import { handlePayments } from "./payments.ts";
import {
  supabaseConfig,
  verifySharedSession,
  type Env,
} from "./shared.ts";

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

const CURRENT_PROFILE_FIELDS = [
  "id",
  "handle",
  "display_name",
  "avatar_url",
  "banner_url",
  "bio",
  "phone_number",
  "xp",
  "acoin",
  "current_grade",
  "is_verified",
  "is_private",
  "show_online_status",
  "country",
  "website_url",
  "language",
  "tipping_enabled",
  "is_admin",
  "is_support_staff",
  "is_organization_verified",
  "is_business_mode",
  "gender",
  "date_of_birth",
  "region",
  "interests",
  "onboarding_completed",
  "scheduled_deletion_at",
  "created_at",
  "platinum_until",
].join(",");

async function handleCurrentUser(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = privateJsonResponse(
      request,
      requestId,
      { error: "Method not allowed", request_id: requestId },
      405,
    );
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const verification = await verifySharedSession(request, env, requestId);
  if (!verification.session) return verification.response;

  const schema = env.AFUCHAT_DATABASE_SCHEMA?.trim() || "public";
  const supabase = supabaseConfig(env);
  if (!supabase || !/^[a-z][a-z0-9_]*$/i.test(schema)) {
    return privateJsonResponse(
      request,
      requestId,
      { error: "User profile could not be loaded.", request_id: requestId },
      503,
    );
  }

  const target = new URL(supabase.url);
  target.pathname = "/rest/v1/profiles";
  target.search = new URLSearchParams({
    select: CURRENT_PROFILE_FIELDS,
    id: `eq.${verification.session.user.id}`,
    limit: "2",
  }).toString();

  try {
    const upstream = await fetch(new Request(target, {
      method: "GET",
      headers: {
        apikey: supabase.anonKey,
        Authorization: `Bearer ${verification.session.token}`,
        Accept: "application/json",
        "Accept-Profile": schema,
      },
      redirect: "manual",
    }));
    if (!upstream.ok) {
      const diagnostic = await upstream.clone().json().catch(() => null) as {
        code?: unknown;
      } | null;
      console.error("[afuchat-api] current profile lookup failed", {
        requestId,
        status: upstream.status,
        code: typeof diagnostic?.code === "string" ? diagnostic.code : undefined,
      });
      return privateJsonResponse(
        request,
        requestId,
        { error: "User profile could not be loaded.", request_id: requestId },
        502,
      );
    }

    const rows: unknown = await upstream.json();
    if (!Array.isArray(rows)) {
      console.error("[afuchat-api] current profile lookup returned an invalid response", {
        requestId,
      });
      return privateJsonResponse(
        request,
        requestId,
        { error: "User profile could not be loaded.", request_id: requestId },
        502,
      );
    }
    if (rows.length === 0) {
      return privateJsonResponse(
        request,
        requestId,
        { error: "User profile was not found.", request_id: requestId },
        404,
      );
    }
    const profile = rows[0] as Record<string, unknown> | null;
    if (
      rows.length !== 1 ||
      !profile ||
      typeof profile !== "object" ||
      profile.id !== verification.session.user.id
    ) {
      console.error("[afuchat-api] current profile lookup did not return one matching profile", {
        requestId,
        count: rows.length,
      });
      return privateJsonResponse(
        request,
        requestId,
        { error: "User profile could not be loaded.", request_id: requestId },
        502,
      );
    }

    return privateJsonResponse(request, requestId, profile, 200);
  } catch {
    console.error("[afuchat-api] current profile lookup failed", { requestId });
    return privateJsonResponse(
      request,
      requestId,
      { error: "User profile could not be loaded.", request_id: requestId },
      502,
    );
  }
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
      { error: "This request is temporarily unavailable.", request_id: requestId },
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

  const supabase = supabaseConfig(env);
  if (!supabase) {
    return privateJsonResponse(
      request,
      requestId,
      { error: "This request is temporarily unavailable.", request_id: requestId },
      503,
    );
  }

  const authApi = env.AFUAUTH_API;
  if (!authApi) {
    return privateJsonResponse(
      request,
      requestId,
      { error: "The request could not be verified.", request_id: requestId },
      503,
    );
  }

  try {
    const verified = await authApi.fetch(new Request("https://afuauth-api/v1/auth/session", {
      method: "POST",
      headers: { Authorization: authorization, Accept: "application/json" },
    }));
    const payload = await verified.json().catch(() => null) as {
      user?: { id?: unknown };
      accessToken?: unknown;
    } | null;
    if (verified.status === 401 || verified.status === 403) {
      return privateJsonResponse(
        request,
        requestId,
      { error: "Invalid or expired session.", request_id: requestId },
        401,
      );
    }
    if (!verified.ok) {
      console.error("[afuchat-api] shared session verification returned an error", {
        requestId,
        status: verified.status,
      });
      return privateJsonResponse(
        request,
        requestId,
        { error: "The request could not be verified.", request_id: requestId },
        503,
      );
    }
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (
      typeof payload?.user?.id !== "string" ||
      !payload.user.id ||
      payload.accessToken !== token
    ) {
      return privateJsonResponse(
        request,
        requestId,
        { error: "The request could not be verified.", request_id: requestId },
        503,
      );
    }
  } catch {
    console.error("[afuchat-api] shared session verification failed", { requestId });
    return privateJsonResponse(
      request,
      requestId,
      { error: "The request could not be verified.", request_id: requestId },
      503,
    );
  }

  const target = new URL(supabase.url);
  target.pathname = "/rest/v1/rpc/get_chat_list";
  target.search = "";
  const upstreamHeaders = new Headers({
    apikey: supabase.anonKey,
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
    if (!upstream.ok) {
      console.error("[afuchat-api] chat data request failed", {
        requestId,
        status: upstream.status,
      });
      return privateJsonResponse(
        request,
        requestId,
        { error: "Chat data could not be loaded.", request_id: requestId },
        upstream.status >= 500 ? 502 : upstream.status,
      );
    }

    const outgoingHeaders = responseHeaders(request, requestId);
    const contentType = upstream.headers.get("Content-Type");
    const contentRange = upstream.headers.get("Content-Range");
    if (contentType) outgoingHeaders.set("Content-Type", contentType);
    if (contentRange) outgoingHeaders.set("Content-Range", contentRange);
    outgoingHeaders.set("Cache-Control", "private, no-store");
    outgoingHeaders.set("Vary", "Origin, Authorization");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outgoingHeaders,
    });
  } catch {
    console.error("[afuchat-api] chat data request failed", { requestId });
    return privateJsonResponse(
      request,
      requestId,
      { error: "Chat data could not be loaded.", request_id: requestId },
      502,
    );
  }
}

async function handleStatus(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const supabase = supabaseConfig(env);
  const startedAt = Date.now();
  let supabaseCheck: Record<string, unknown>;

  if (!supabase) {
    supabaseCheck = {
      ok: false,
      latency_ms: 0,
      message: "Supabase is not configured",
    };
  } else {
    try {
      const response = await fetch(
        `${supabase.url}/rest/v1/profiles?select=id&limit=1`,
        {
          headers: {
            apikey: supabase.anonKey,
            Accept: "application/json",
          },
        },
      );
      supabaseCheck = {
        ok: response.ok,
        latency_ms: Date.now() - startedAt,
        ...(response.ok ? {} : { message: `HTTP ${response.status}` }),
      };
    } catch {
      supabaseCheck = {
        ok: false,
        latency_ms: Date.now() - startedAt,
        message: "Supabase is unavailable",
      };
    }
  }

  const ok = supabaseCheck.ok === true;
  if (!ok) {
    console.error("[afuchat-api] status check reports degraded service", {
      requestId,
      status: supabaseCheck.message,
    });
  }
  return jsonResponse(
    request,
    requestId,
    {
      ok,
      timestamp: new Date().toISOString(),
    },
    200,
  );
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
      { product: "afuchat", status: "ok", version: "v1" },
      200,
    );
  }

  if (incoming.pathname === `${PREFIX}/status`) {
    if (request.method === "GET" || request.method === "POST") {
      return handleStatus(request, env);
    }
    const response = privateJsonResponse(
      request,
      requestId,
      { error: "Method not allowed", request_id: requestId },
      405,
    );
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, POST, OPTIONS");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  if (incoming.pathname === `${PREFIX}/me`) {
    return handleCurrentUser(request, env);
  }

  if (incoming.pathname === `${PREFIX}/account/export`) {
    return handleAccountExport(request, env);
  }

  if (
    incoming.pathname === `${PREFIX}/payments` ||
    incoming.pathname.startsWith(`${PREFIX}/payments/`)
  ) {
    return handlePayments(request, env);
  }

  if (
    incoming.pathname === `${PREFIX}/videos` ||
    incoming.pathname.startsWith(`${PREFIX}/videos/`)
  ) {
    return privateJsonResponse(
      request,
      requestId,
      {
        error: "Video processing is temporarily unavailable.",
        request_id: requestId,
      },
      501,
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
      { error: "The requested API endpoint is not available.", request_id: requestId },
      501,
    );
  }
  return jsonResponse(
    request,
    requestId,
    { error: "The requested API endpoint was not found." },
    404,
  );
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === `${PREFIX}/conversations`) {
    return handleChatConversations(request, env);
  }
  return handleApiRequest(request, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (cause) {
      const requestId = crypto.randomUUID();
      console.error("[afuchat-api] request failed", {
        requestId,
        path: new URL(request.url).pathname,
        error: cause instanceof Error ? cause.message : "unknown error",
      });
      return jsonResponse(
        request,
        requestId,
        { error: "The request could not be completed.", request_id: requestId },
        500,
      );
    }
  },
};