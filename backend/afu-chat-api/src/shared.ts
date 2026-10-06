export interface Env {
  AFUCHAT_SUPABASE_URL?: string;
  AFUCHAT_SUPABASE_ANON_KEY?: string;
  AFUCHAT_DATABASE_SCHEMA?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  PESAPAL_CONSUMER_KEY?: string;
  PESAPAL_CONSUMER_SECRET?: string;
  PESAPAL_IPN_ID?: string;
  PESAPAL_ENV?: string;
  PUBLIC_API_URL?: string;
  AFUAUTH_API?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
}

export interface SharedAuthUser {
  id: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

export interface VerifiedSession {
  user: SharedAuthUser;
  token: string;
}

export type SessionVerification =
  | { session: VerifiedSession; response?: never }
  | { session?: never; response: Response };

const ALLOWED_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type, apikey, X-Client-Info";
const EXPOSED_HEADERS = "Content-Range, X-AfuChat-Request-Id, X-AfuChat-Version";

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const host = new URL(origin).hostname.toLowerCase();
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

export function responseHeaders(request: Request, requestId: string): Headers {
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

export function jsonResponse(
  request: Request,
  requestId: string,
  body: Record<string, unknown>,
  status = 200,
): Response {
  const headers = responseHeaders(request, requestId);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

export function privateJsonResponse(
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

export function supabaseConfig(env: Env): { url: string; anonKey: string } | null {
  const url = (env.AFUCHAT_SUPABASE_URL || env.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const anonKey = (env.AFUCHAT_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "").trim();
  return url && anonKey ? { url, anonKey } : null;
}

export async function verifySharedSession(
  request: Request,
  env: Env,
  requestId: string,
): Promise<SessionVerification> {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return {
      response: privateJsonResponse(
        request,
        requestId,
        { error: "A valid bearer token is required", request_id: requestId },
        401,
      ),
    };
  }
  if (!env.AFUAUTH_API) {
    return {
      response: privateJsonResponse(
        request,
        requestId,
        { error: "Shared authentication service is not configured", request_id: requestId },
        503,
      ),
    };
  }

  const token = authorization.replace(/^Bearer\s+/i, "");
  try {
    const verified = await env.AFUAUTH_API.fetch(
      new Request("https://afuauth-api/v1/auth/session", {
        method: "POST",
        headers: { Authorization: authorization, Accept: "application/json" },
      }),
    );
    const payload = await verified.json().catch(() => null) as {
      user?: Partial<SharedAuthUser>;
      accessToken?: unknown;
    } | null;

    if (verified.status === 401 || verified.status === 403) {
      return {
        response: privateJsonResponse(
          request,
          requestId,
          { error: "Invalid or expired shared session", request_id: requestId },
          401,
        ),
      };
    }
    if (!verified.ok) {
      return {
        response: privateJsonResponse(
          request,
          requestId,
          { error: "Shared authentication service is unavailable", request_id: requestId },
          503,
        ),
      };
    }
    if (
      typeof payload?.user?.id !== "string" ||
      !payload.user.id ||
      payload.accessToken !== token
    ) {
      return {
        response: privateJsonResponse(
          request,
          requestId,
          { error: "Shared authentication service returned an invalid session", request_id: requestId },
          503,
        ),
      };
    }

    return {
      session: {
        user: {
          id: payload.user.id,
          email: typeof payload.user.email === "string" ? payload.user.email : undefined,
          name: typeof payload.user.name === "string" ? payload.user.name : undefined,
          firstName: typeof payload.user.firstName === "string" ? payload.user.firstName : undefined,
          lastName: typeof payload.user.lastName === "string" ? payload.user.lastName : undefined,
        },
        token,
      },
    };
  } catch {
    return {
      response: privateJsonResponse(
        request,
        requestId,
        { error: "Shared authentication service is unavailable", request_id: requestId },
        503,
      ),
    };
  }
}
