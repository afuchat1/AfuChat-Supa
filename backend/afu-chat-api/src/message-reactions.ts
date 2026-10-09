import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH_SIZE = 100;

function errorResponse(
  request: Request,
  requestId: string,
  error: string,
  status: number,
): Response {
  return privateJsonResponse(request, requestId, { error, request_id: requestId }, status);
}

function makeUrl(base: string, filters: Record<string, string>): URL {
  const url = new URL("/rest/v1/message_reactions", base);
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
  return url;
}

function restHeaders(session: VerifiedSession, anonKey: string): Headers {
  return new Headers({
    apikey: anonKey,
    Authorization: `Bearer ${session.token}`,
    Accept: "application/json",
    "Accept-Profile": "afuchat",
    "Content-Profile": "afuchat",
  });
}

function ownerMatches(value: unknown, session: VerifiedSession): boolean | null {
  if (value === undefined) return true;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase() === session.user.id.toLowerCase();
}

function safeDatabaseStatus(response: Response): number {
  return response.status === 401 || response.status === 403 ? 403 : 502;
}

export async function handleMessageReactions(
  request: Request,
  env: Env,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    const response = errorResponse(request, requestId, "Method not allowed", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, POST, DELETE, OPTIONS");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  const verification = await verifySharedSession(request, env, requestId);
  if (!verification.session) return verification.response;
  const session = verification.session;
  const supabase = supabaseConfig(env);
  if (!supabase) {
    return errorResponse(request, requestId, "Message reactions are temporarily unavailable.", 503);
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => key !== "message_ids")) {
      return errorResponse(request, requestId, "Invalid reaction query.", 400);
    }
    const rawIds = url.searchParams.get("message_ids");
    const ids = rawIds ? [...new Set(rawIds.split(",").map((id) => id.trim()))] : [];
    if (!ids.length || ids.length > MAX_BATCH_SIZE || ids.some((id) => !UUID_PATTERN.test(id))) {
      return errorResponse(request, requestId, "Invalid reaction query.", 400);
    }
    try {
      const response = await fetch(makeUrl(supabase.url, {
        select: "message_id,reaction,user_id",
        message_id: `in.(${ids.join(",")})`,
        limit: String(MAX_BATCH_SIZE * 50),
      }), {
        method: "GET",
        headers: restHeaders(session, supabase.anonKey),
        redirect: "manual",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload)) {
        const code = payload && typeof payload === "object" &&
            typeof (payload as Record<string, unknown>).code === "string"
          ? (payload as Record<string, string>).code
          : undefined;
        console.error("[afuchat-api] message reaction query failed", {
          requestId,
          status: response.status,
          code,
        });
        return errorResponse(request, requestId, "Message reactions could not be loaded.", 502);
      }
      return privateJsonResponse(request, requestId, { reactions: payload }, 200);
    } catch {
      console.error("[afuchat-api] message reaction query failed", { requestId });
      return errorResponse(request, requestId, "Message reactions could not be loaded.", 502);
    }
  }

  const url = new URL(request.url);
  let messageId: unknown;
  let reaction: unknown;
  let expectedUserId: unknown;
  if (request.method === "POST") {
    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > 2048) {
      return errorResponse(request, requestId, "Invalid reaction request.", 400);
    }
    let payload: unknown;
    try {
      const text = await request.text();
      if (text.length > 2048) return errorResponse(request, requestId, "Invalid reaction request.", 400);
      payload = JSON.parse(text);
    } catch {
      return errorResponse(request, requestId, "Invalid reaction request.", 400);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return errorResponse(request, requestId, "Invalid reaction request.", 400);
    }
    const body = payload as Record<string, unknown>;
    if (Object.keys(body).some((key) =>
      !["message_id", "reaction", "expected_user_id"].includes(key)
    )) {
      return errorResponse(request, requestId, "Invalid reaction request.", 400);
    }
    messageId = body.message_id;
    reaction = body.reaction;
    expectedUserId = body.expected_user_id;
  } else {
    if ([...url.searchParams.keys()].some((key) =>
      key !== "message_id" && key !== "reaction" && key !== "expected_user_id"
    )) {
      return errorResponse(request, requestId, "Invalid reaction request.", 400);
    }
    messageId = url.searchParams.get("message_id");
    reaction = url.searchParams.get("reaction");
    expectedUserId = url.searchParams.get("expected_user_id") ?? undefined;
  }
  const ownerMatchesSession = ownerMatches(expectedUserId, session);
  if (ownerMatchesSession === null) {
    return errorResponse(request, requestId, "Invalid expected user ID.", 400);
  }
  if (!ownerMatchesSession) {
    return errorResponse(request, requestId, "The active session does not match this action.", 409);
  }
  if (
    typeof messageId !== "string" ||
    !UUID_PATTERN.test(messageId) ||
    typeof reaction !== "string" ||
    reaction.length < 1 ||
    reaction.length > 32
  ) {
    return errorResponse(request, requestId, "Invalid reaction request.", 400);
  }

  const headers = restHeaders(session, supabase.anonKey);
  headers.set("Content-Type", "application/json");
  headers.set("Prefer", "return=minimal");
  try {
    const endpoint = makeUrl(supabase.url, request.method === "POST"
      ? {}
      : {
          message_id: `eq.${messageId}`,
          user_id: `eq.${session.user.id}`,
          reaction: `eq.${reaction}`,
        });
    const response = await fetch(endpoint, {
      method: request.method,
      headers,
      ...(request.method === "POST"
        ? { body: JSON.stringify({ message_id: messageId, user_id: session.user.id, reaction }) }
        : {}),
      redirect: "manual",
    });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const code = payload && typeof payload === "object" &&
          typeof (payload as Record<string, unknown>).code === "string"
        ? (payload as Record<string, string>).code
        : undefined;
      if (request.method === "POST" && code === "23505") {
        return privateJsonResponse(request, requestId, { reacted: true }, 200);
      }
      console.error("[afuchat-api] message reaction mutation failed", {
        requestId,
        status: response.status,
        code,
      });
      return errorResponse(
        request,
        requestId,
        "Message reaction could not be updated.",
        safeDatabaseStatus(response),
      );
    }
    return privateJsonResponse(
      request,
      requestId,
      { reacted: request.method === "POST" },
      200,
    );
  } catch {
    console.error("[afuchat-api] message reaction mutation failed", { requestId });
    return errorResponse(request, requestId, "Message reaction could not be updated.", 502);
  }
}
