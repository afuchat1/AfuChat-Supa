import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const PREFIX = "/v1/chat/messages";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 256 * 1024;
const MESSAGE_FIELDS =
  "id,chat_id,sender_id,encrypted_content,sent_at,reply_to_message_id,attachment_url,attachment_type,attachment_name,attachment_size,audio_url,edited_at";

type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  encrypted_content: string;
  sent_at: string;
  reply_to_message_id: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  audio_url: string | null;
  edited_at: string | null;
};

type RestFailure = { response: Response; code?: string };

function errorResponse(
  request: Request,
  requestId: string,
  error: string,
  status: number,
): Response {
  return privateJsonResponse(request, requestId, { error, request_id: requestId }, status);
}

function makeRestUrl(
  base: string,
  query: Record<string, string>,
): URL {
  const url = new URL("/rest/v1/messages", base);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}

async function restFetch(
  url: URL,
  method: "GET" | "POST",
  session: VerifiedSession,
  anonKey: string,
  body?: unknown,
): Promise<Response> {
  const headers = new Headers({
    apikey: anonKey,
    Authorization: `Bearer ${session.token}`,
    Accept: "application/json",
    "Accept-Profile": "afuchat",
    "Content-Profile": "afuchat",
  });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (method === "POST") headers.set("Prefer", "return=representation");

  try {
    return await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
  } catch {
    return new Response(null, { status: 502 });
  }
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
    console.error("[afuchat-api] message database request failed", {
      requestId,
      status: response.status,
      code,
    });
    return { response, code };
  }
  if (!Array.isArray(payload)) {
    console.error("[afuchat-api] message database response was invalid", { requestId });
    return { response: new Response(null, { status: 502 }) };
  }
  return payload as T[];
}

function isRestFailure(value: unknown): value is RestFailure {
  return !!value && typeof value === "object" && "response" in value;
}

async function stableMessageId(
  clientId: string,
  userId: string,
  chatId: string,
): Promise<string> {
  if (UUID_PATTERN.test(clientId)) return clientId.toLowerCase();

  // Older offline queues use local IDs such as "msg_<timestamp>" and
  // "pending-<timestamp>". Hash those stable local keys into a UUID so retries
  // remain idempotent without adding a database column or retaining payloads.
  const input = new TextEncoder().encode(`${userId}\u0000${chatId}\u0000${clientId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // UUID version 8: application-defined SHA-256 key
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sameMessage(
  existing: MessageRow,
  expected: Record<string, unknown>,
  chatId: string,
  senderId: string,
  messageId: string,
): boolean {
  return existing.id === messageId &&
    existing.chat_id === chatId &&
    existing.sender_id === senderId &&
    existing.encrypted_content === expected.encrypted_content &&
    (existing.reply_to_message_id ?? null) === (expected.reply_to_message_id ?? null) &&
    (existing.attachment_url ?? null) === (expected.attachment_url ?? null) &&
    (existing.attachment_type ?? null) === (expected.attachment_type ?? null) &&
    (existing.attachment_name ?? null) === (expected.attachment_name ?? null) &&
    (existing.attachment_size ?? null) === (expected.attachment_size ?? null) &&
    (existing.audio_url ?? null) === (expected.audio_url ?? null);
}

async function findById(
  base: string,
  anonKey: string,
  session: VerifiedSession,
  messageId: string,
  requestId: string,
): Promise<MessageRow[] | RestFailure> {
  const url = makeRestUrl(base, {
    select: MESSAGE_FIELDS,
    id: `eq.${messageId}`,
    limit: "1",
  });
  return readRows<MessageRow>(
    await restFetch(url, "GET", session, anonKey),
    requestId,
  );
}

function upstreamErrorStatus(failure: RestFailure): number {
  if (failure.code === "42501") return 403;
  if (failure.code === "23503" || failure.code === "23505") return 409;
  if (failure.response.status === 401 || failure.response.status === 403) return 403;
  if (failure.response.status >= 500) return 502;
  return 400;
}

function expectedOwnerMatches(
  expected: unknown,
  session: VerifiedSession,
): boolean | null {
  if (expected === undefined) return true;
  if (typeof expected !== "string" || !UUID_PATTERN.test(expected)) return null;
  return expected.toLowerCase() === session.user.id.toLowerCase();
}

function isOptionalText(
  value: unknown,
  maxLength: number,
): value is string | null | undefined {
  return value === undefined || value === null ||
    (typeof value === "string" && value.length <= maxLength);
}

export async function handleMessages(
  request: Request,
  env: Env,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST") {
    const response = errorResponse(request, requestId, "Method not allowed", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "POST, OPTIONS");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const verification = await verifySharedSession(request, env, requestId);
  if (!verification.session) return verification.response;
  const session = verification.session;

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse(request, requestId, "Invalid message request.", 400);
  }
  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return errorResponse(request, requestId, "Invalid message request.", 400);
    }
    payload = JSON.parse(text);
  } catch {
    return errorResponse(request, requestId, "Invalid message request.", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse(request, requestId, "Invalid message request.", 400);
  }

  const body = payload as Record<string, unknown>;
  const allowedKeys = new Set([
    "chat_id",
    "client_message_id",
    "encrypted_content",
    "reply_to_message_id",
    "attachment_url",
    "attachment_type",
    "attachment_name",
    "attachment_size",
    "audio_url",
    "expected_user_id",
  ]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return errorResponse(request, requestId, "Invalid message request.", 400);
  }
  const expectedOwner = expectedOwnerMatches(body.expected_user_id, session);
  if (expectedOwner === null) {
    return errorResponse(request, requestId, "Invalid expected user ID.", 400);
  }
  if (!expectedOwner) {
    return errorResponse(request, requestId, "The active session does not match this action.", 409);
  }

  if (
    typeof body.chat_id !== "string" ||
    !UUID_PATTERN.test(body.chat_id) ||
    typeof body.client_message_id !== "string" ||
    !body.client_message_id.length ||
    body.client_message_id.length > 128 ||
    typeof body.encrypted_content !== "string" ||
    body.encrypted_content.length > 200_000 ||
    !isOptionalText(body.attachment_url, 16_384) ||
    !isOptionalText(body.attachment_type, 64) ||
    !isOptionalText(body.attachment_name, 255) ||
    !isOptionalText(body.audio_url, 16_384) ||
    (body.reply_to_message_id !== undefined &&
      body.reply_to_message_id !== null &&
      (typeof body.reply_to_message_id !== "string" || !UUID_PATTERN.test(body.reply_to_message_id))) ||
    (body.attachment_size !== undefined &&
      body.attachment_size !== null &&
      (!Number.isSafeInteger(body.attachment_size) || Number(body.attachment_size) < 0))
  ) {
    return errorResponse(request, requestId, "Invalid message request.", 400);
  }

  const supabase = supabaseConfig(env);
  if (!supabase) {
    return errorResponse(request, requestId, "Chat messages are temporarily unavailable.", 503);
  }

  let messageId: string;
  try {
    messageId = await stableMessageId(
      body.client_message_id,
      session.user.id,
      body.chat_id,
    );
  } catch {
    return errorResponse(request, requestId, "Chat messages are temporarily unavailable.", 503);
  }

  const existing = await findById(
    supabase.url,
    supabase.anonKey,
    session,
    messageId,
    requestId,
  );
  if (isRestFailure(existing)) {
    return errorResponse(request, requestId, "Message could not be sent.", 502);
  }
  if (existing.length > 0) {
    if (sameMessage(existing[0], body, body.chat_id, session.user.id, messageId)) {
      return privateJsonResponse(request, requestId, { message: existing[0] }, 200);
    }
    return errorResponse(request, requestId, "This message ID was already used.", 409);
  }

  const insert: Record<string, unknown> = {
    id: messageId,
    chat_id: body.chat_id,
    sender_id: session.user.id,
    encrypted_content: body.encrypted_content,
  };
  for (const field of [
    "reply_to_message_id",
    "attachment_url",
    "attachment_type",
    "attachment_name",
    "attachment_size",
    "audio_url",
  ]) {
    if (body[field] !== undefined) insert[field] = body[field];
  }

  const insertUrl = makeRestUrl(supabase.url, { select: MESSAGE_FIELDS });
  const insertResponse = await restFetch(
    insertUrl,
    "POST",
    session,
    supabase.anonKey,
    insert,
  );
  const inserted = await readRows<MessageRow>(insertResponse, requestId);
  if (!isRestFailure(inserted) && inserted.length === 1) {
    return privateJsonResponse(request, requestId, { message: inserted[0] }, 201);
  }

  const failure = isRestFailure(inserted)
    ? inserted
    : { response: new Response(null, { status: 502 }) };
  if (failure.code === "23505" || failure.response.status === 409) {
    const raced = await findById(
      supabase.url,
      supabase.anonKey,
      session,
      messageId,
      requestId,
    );
    if (!isRestFailure(raced) && raced.length > 0) {
      if (sameMessage(raced[0], body, body.chat_id, session.user.id, messageId)) {
        return privateJsonResponse(request, requestId, { message: raced[0] }, 200);
      }
      return errorResponse(request, requestId, "This message ID was already used.", 409);
    }
  }

  console.error("[afuchat-api] message insert failed", {
    requestId,
    status: failure.response.status,
    code: failure.code,
  });
  return errorResponse(
    request,
    requestId,
    "Message could not be sent.",
    upstreamErrorStatus(failure),
  );
}
