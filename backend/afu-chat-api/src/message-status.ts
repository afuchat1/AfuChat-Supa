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
type RestFailure = { response: Response; code?: string };

function errorResponse(
  request: Request,
  requestId: string,
  error: string,
  status: number,
): Response {
  return privateJsonResponse(request, requestId, { error, request_id: requestId }, status);
}

function makeUrl(base: string, relation: string, filters: Record<string, string>): URL {
  const url = new URL(`/rest/v1/${relation}`, base);
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

function parseIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH_SIZE) return null;
  const ids = [...new Set(value)];
  if (ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) return null;
  return ids as string[];
}

function expectedOwnerMatches(value: unknown, session: VerifiedSession): boolean | null {
  if (value === undefined) return true;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase() === session.user.id.toLowerCase();
}

async function readRows<T>(
  response: Response,
  requestId: string,
): Promise<T[] | RestFailure> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload && typeof payload === "object" &&
        typeof (payload as Record<string, unknown>).code === "string"
      ? (payload as Record<string, string>).code
      : undefined;
    console.error("[afuchat-api] message status request failed", {
      requestId,
      status: response.status,
      code,
    });
    return { response, code };
  }
  if (!Array.isArray(payload)) return { response: new Response(null, { status: 502 }) };
  return payload as T[];
}

function isFailure(value: unknown): value is RestFailure {
  return !!value && typeof value === "object" && "response" in value;
}

export async function handleMessageStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET" && request.method !== "POST") {
    const response = errorResponse(request, requestId, "Method not allowed", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, POST, OPTIONS");
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
    return errorResponse(request, requestId, "Message status is temporarily unavailable.", 503);
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => key !== "message_ids")) {
      return errorResponse(request, requestId, "Invalid message status query.", 400);
    }
    const rawIds = url.searchParams.get("message_ids");
    const ids = rawIds
      ? [...new Set(rawIds.split(",").map((id) => id.trim()))]
      : [];
    if (ids.length === 0 || ids.length > MAX_BATCH_SIZE || ids.some((id) => !UUID_PATTERN.test(id))) {
      return errorResponse(request, requestId, "Invalid message status query.", 400);
    }
    try {
      const response = await fetch(makeUrl(supabase.url, "message_status", {
        select: "message_id,user_id,read_at,delivered_at",
        message_id: `in.(${ids.join(",")})`,
        limit: String(MAX_BATCH_SIZE * 20),
      }), {
        method: "GET",
        headers: restHeaders(session, supabase.anonKey),
        redirect: "manual",
      });
      const rows = await readRows<Record<string, unknown>>(response, requestId);
      if (isFailure(rows)) {
        return errorResponse(request, requestId, "Message status could not be loaded.", 502);
      }
      return privateJsonResponse(request, requestId, { statuses: rows }, 200);
    } catch {
      console.error("[afuchat-api] message status query failed", { requestId });
      return errorResponse(request, requestId, "Message status could not be loaded.", 502);
    }
  }

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > 16_384) {
    return errorResponse(request, requestId, "Invalid message status request.", 400);
  }
  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > 16_384) {
      return errorResponse(request, requestId, "Invalid message status request.", 400);
    }
    payload = JSON.parse(text);
  } catch {
    return errorResponse(request, requestId, "Invalid message status request.", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse(request, requestId, "Invalid message status request.", 400);
  }
  const body = payload as Record<string, unknown>;
  if (Object.keys(body).some((key) =>
    !["message_ids", "chat_id", "read_receipts", "expected_user_id"].includes(key)
  )) {
    return errorResponse(request, requestId, "Invalid message status request.", 400);
  }
  const expectedOwner = expectedOwnerMatches(body.expected_user_id, session);
  if (expectedOwner === null) {
    return errorResponse(request, requestId, "Invalid expected user ID.", 400);
  }
  if (!expectedOwner) {
    return errorResponse(request, requestId, "The active session does not match this action.", 409);
  }
  if (body.read_receipts !== undefined && typeof body.read_receipts !== "boolean") {
    return errorResponse(request, requestId, "Invalid message status request.", 400);
  }
  const chatId = body.chat_id;
  if (chatId !== undefined && (typeof chatId !== "string" || !UUID_PATTERN.test(chatId))) {
    return errorResponse(request, requestId, "Invalid message status request.", 400);
  }
  let ids = body.message_ids === undefined ? null : parseIds(body.message_ids);
  if (body.message_ids !== undefined && !ids) {
    return errorResponse(request, requestId, "Invalid message status request.", 400);
  }
  if (ids && chatId !== undefined) {
    return errorResponse(request, requestId, "Use message IDs or a chat ID, not both.", 400);
  }
  if (!ids && chatId === undefined) {
    return errorResponse(request, requestId, "A chat ID or message IDs are required.", 400);
  }

  if (chatId !== undefined) {
    try {
      const messagesResponse = await fetch(makeUrl(supabase.url, "messages", {
        select: "id",
        chat_id: `eq.${chatId}`,
        sender_id: `neq.${session.user.id}`,
        order: "sent_at.desc",
        limit: "200",
      }), {
        method: "GET",
        headers: restHeaders(session, supabase.anonKey),
        redirect: "manual",
      });
      const messages = await readRows<{ id: string }>(messagesResponse, requestId);
      if (isFailure(messages)) {
        return errorResponse(request, requestId, "Message status could not be updated.", 502);
      }
      ids = messages
        .map((message) => message.id)
        .filter((id) => typeof id === "string" && UUID_PATTERN.test(id));
    } catch {
      console.error("[afuchat-api] message status target lookup failed", { requestId });
      return errorResponse(request, requestId, "Message status could not be updated.", 502);
    }
  }

  if (!ids || ids.length === 0) {
    return privateJsonResponse(request, requestId, { ok: true, updated: 0 }, 200);
  }
  const now = new Date().toISOString();
  const rows = ids.map((messageId) => ({
    message_id: messageId,
    user_id: session.user.id,
    delivered_at: now,
    ...(body.read_receipts !== false ? { read_at: now } : {}),
  }));
  const headers = restHeaders(session, supabase.anonKey);
  headers.set("Content-Type", "application/json");
  headers.set("Prefer", "resolution=merge-duplicates,return=minimal");
  try {
    const response = await fetch(makeUrl(supabase.url, "message_status", {
      on_conflict: "message_id,user_id",
    }), {
      method: "POST",
      headers,
      body: JSON.stringify(rows),
      redirect: "manual",
    });
    if (!response.ok) {
      const raw = await response.json().catch(() => null) as Record<string, unknown> | null;
      console.error("[afuchat-api] message status update failed", {
        requestId,
        status: response.status,
        code: typeof raw?.code === "string" ? raw.code : undefined,
      });
      return errorResponse(
        request,
        requestId,
        "Message status could not be updated.",
        response.status === 401 || response.status === 403 ? 403 : 502,
      );
    }
    return privateJsonResponse(request, requestId, { ok: true, updated: ids.length }, 200);
  } catch {
    console.error("[afuchat-api] message status update failed", { requestId });
    return errorResponse(request, requestId, "Message status could not be updated.", 502);
  }
}
