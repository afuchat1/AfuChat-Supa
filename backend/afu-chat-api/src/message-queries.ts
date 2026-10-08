import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_FIELDS =
  "id,chat_id,sender_id,encrypted_content,sent_at,reply_to_message_id,attachment_url,attachment_type,attachment_name,attachment_size,audio_url,edited_at";

function errorResponse(
  request: Request,
  requestId: string,
  error: string,
  status: number,
): Response {
  return privateJsonResponse(request, requestId, { error, request_id: requestId }, status);
}

function makeUrl(
  base: string,
  relation: string,
  filters: Record<string, string>,
): URL {
  const url = new URL(`/rest/v1/${relation}`, base);
  for (const [key, value] of Object.entries(filters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function restHeaders(
  session: VerifiedSession,
  anonKey: string,
): Headers {
  return new Headers({
    apikey: anonKey,
    Authorization: `Bearer ${session.token}`,
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  });
}

type MessageReadResult =
  | { ok: true; data: Record<string, unknown>[] }
  | { ok: false; status: number; code?: string };

async function readMessageSchemaRows(
  requestId: string,
  base: string,
  anonKey: string,
  session: VerifiedSession,
  filters: Record<string, string>,
): Promise<MessageReadResult> {
  try {
    const response = await fetch(makeUrl(base, "messages", filters), {
      method: "GET",
      headers: restHeaders(session, anonKey),
      redirect: "manual",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload && typeof payload === "object" &&
          typeof (payload as Record<string, unknown>).code === "string"
        ? (payload as Record<string, string>).code
        : undefined;
      console.error("[afuchat-api] message query failed", {
        requestId,
        status: response.status,
        code,
      });
      return { ok: false, status: response.status, code };
    }
    if (!Array.isArray(payload)) {
      return { ok: false, status: 502 };
    }
    return { ok: true, data: payload as Record<string, unknown>[] };
  } catch {
    console.error("[afuchat-api] message query failed", { requestId });
    return { ok: false, status: 502 };
  }
}

async function readCanonicalMessages(
  requestId: string,
  base: string,
  anonKey: string,
  session: VerifiedSession,
  filters: Record<string, string>,
  limit: number,
  sender: "me" | "others" | null,
): Promise<MessageReadResult> {
  const chunkSize = Math.min(1_000, limit);
  const byId = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < 20_000; offset += chunkSize) {
    const pageFilters = {
      ...filters,
      order: "sent_at.desc,id.desc",
      limit: String(chunkSize),
      offset: String(offset),
    };
    const canonical = await readMessageSchemaRows(
      requestId,
      base,
      anonKey,
      session,
      pageFilters,
    );
    if (!canonical.ok) return canonical;
    for (const row of canonical.data) {
      if (!row || typeof row.id !== "string" || !UUID_PATTERN.test(row.id)) {
        return { ok: false, status: 502, code: "MESSAGE_ROWS_INVALID" };
      }
      byId.set(row.id, row);
    }

    const rows = [...byId.values()].sort((a, b) => {
      const sentAtA = typeof a.sent_at === "string" ? Date.parse(a.sent_at) : 0;
      const sentAtB = typeof b.sent_at === "string" ? Date.parse(b.sent_at) : 0;
      if (sentAtA !== sentAtB) return sentAtB - sentAtA;
      return String(a.id).localeCompare(String(b.id));
    });
    const timeFiltered = rows.filter((row) => {
      if (!filters.sent_at) return true;
      const [operator, rawCursor] = filters.sent_at.split(".", 2);
      const sentAt = typeof row.sent_at === "string" ? Date.parse(row.sent_at) : NaN;
      const cursor = Date.parse(rawCursor ?? "");
      if (!Number.isFinite(sentAt) || !Number.isFinite(cursor)) return false;
      return operator === "lt" ? sentAt < cursor : sentAt > cursor;
    });
    const matching = sender
      ? timeFiltered.filter((row) => sender === "me"
        ? row.sender_id === session.user.id
        : row.sender_id !== session.user.id)
      : timeFiltered;

    if (
      filters.id ||
      !sender ||
      matching.length >= limit ||
      canonical.data.length < chunkSize
    ) {
      return { ok: true, data: matching.slice(0, limit) };
    }
  }
  return { ok: false, status: 502, code: "MESSAGE_SCAN_LIMIT" };
}

function validCursor(value: string | null): value is string {
  if (value === null) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

export async function handleMessageQueries(
  request: Request,
  env: Env,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed", 405);
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
  const session = verification.session;
  const supabase = supabaseConfig(env);
  if (!supabase) {
    return errorResponse(request, requestId, "Messages are temporarily unavailable.", 503);
  }

  const url = new URL(request.url);
  const allowed = new Set(["chat_id", "message_id", "limit", "before", "after", "sender"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) {
    return errorResponse(request, requestId, "Invalid message query.", 400);
  }
  const chatId = url.searchParams.get("chat_id");
  const messageId = url.searchParams.get("message_id");
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");
  const sender = url.searchParams.get("sender");
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 100 : Number(rawLimit);
  if (
    !chatId ||
    !UUID_PATTERN.test(chatId) ||
    (messageId !== null && !UUID_PATTERN.test(messageId)) ||
    (before !== null && !validCursor(before)) ||
    (after !== null && !validCursor(after)) ||
    (before !== null && after !== null) ||
    (sender !== null && sender !== "me" && sender !== "others") ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (messageId !== null && (before !== null || after !== null))
  ) {
    return errorResponse(request, requestId, "Invalid message query.", 400);
  }

  const filters: Record<string, string> = {
    select: MESSAGE_FIELDS,
    chat_id: `eq.${chatId}`,
  };
  if (messageId) filters.id = `eq.${messageId}`;
  if (before) filters.sent_at = `lt.${before}`;
  if (after) filters.sent_at = `gt.${after}`;
  const result = await readCanonicalMessages(
    requestId,
    supabase.url,
    supabase.anonKey,
    session,
    filters,
    messageId ? 1 : limit,
    sender,
  );
  if (!result.ok) {
    return errorResponse(request, requestId, "Messages could not be loaded.", 502);
  }
  return privateJsonResponse(request, requestId, { messages: result.data }, 200);
}

export async function handleMessageCount(
  request: Request,
  env: Env,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed", 405);
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
  const session = verification.session;
  const supabase = supabaseConfig(env);
  if (!supabase) {
    return errorResponse(request, requestId, "Message count is temporarily unavailable.", 503);
  }

  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) =>
    key !== "chat_id" && key !== "sender" && key !== "expected_user_id"
  )) {
    return errorResponse(request, requestId, "Invalid message count query.", 400);
  }
  const chatId = url.searchParams.get("chat_id");
  const sender = url.searchParams.get("sender") ?? "me";
  const expectedUserId = url.searchParams.get("expected_user_id");
  if (
    expectedUserId !== null &&
    (!UUID_PATTERN.test(expectedUserId) ||
      expectedUserId.toLowerCase() !== session.user.id.toLowerCase())
  ) {
    return errorResponse(request, requestId, "The active session does not match this action.", 409);
  }
  if (
    (chatId !== null && !UUID_PATTERN.test(chatId)) ||
    (sender !== "me" && sender !== "others") ||
    (sender === "others" && !chatId)
  ) {
    return errorResponse(request, requestId, "Invalid message count query.", 400);
  }

  const filters: Record<string, string> = {
    select: "id,chat_id,sender_id,encrypted_content,sent_at",
  };
  if (chatId) filters.chat_id = `eq.${chatId}`;
  const result = await readCanonicalMessages(
    requestId,
    supabase.url,
    supabase.anonKey,
    session,
    filters,
    100_000,
    sender,
  );
  if (!result.ok) {
    return errorResponse(request, requestId, "Message count could not be loaded.", 502);
  }
  return privateJsonResponse(request, requestId, { count: result.data.length }, 200);
}
