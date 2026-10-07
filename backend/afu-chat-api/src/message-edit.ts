import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 256 * 1024;
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
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
  return url;
}

function restHeaders(session: VerifiedSession, anonKey: string): Headers {
  return new Headers({
    apikey: anonKey,
    Authorization: `Bearer ${session.token}`,
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  });
}

function matchesExpectedOwner(value: unknown, session: VerifiedSession): boolean | null {
  if (value === undefined) return true;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase() === session.user.id.toLowerCase();
}

export async function handleMessageEditHistory(
  request: Request,
  env: Env,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, { status: 405, headers });
  }
  const verification = await verifySharedSession(request, env, requestId);
  if (!verification.session) return verification.response;
  const supabase = supabaseConfig(env);
  if (!supabase) return errorResponse(request, requestId, "Edit history is temporarily unavailable.", 503);

  const url = new URL(request.url);
  const messageId = url.searchParams.get("message_id");
  if (
    [...url.searchParams.keys()].some((key) => key !== "message_id") ||
    !messageId ||
    !UUID_PATTERN.test(messageId)
  ) {
    return errorResponse(request, requestId, "Invalid edit history query.", 400);
  }
  try {
    const target = makeUrl(supabase.url, "message_edit_history", {
      select: "id,previous_content,edited_at",
      message_id: `eq.${messageId}`,
      order: "edited_at.desc",
      limit: "100",
    });
    const response = await fetch(target, {
      method: "GET",
      headers: restHeaders(verification.session, supabase.anonKey),
      redirect: "manual",
    });
    const rows: unknown = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(rows)) {
      const code = rows && typeof rows === "object" &&
          typeof (rows as Record<string, unknown>).code === "string"
        ? (rows as Record<string, string>).code
        : undefined;
      console.error("[afuchat-api] message edit history query failed", {
        requestId,
        status: response.status,
        code,
      });
      return errorResponse(request, requestId, "Edit history could not be loaded.", 502);
    }
    return privateJsonResponse(request, requestId, { history: rows }, 200);
  } catch {
    console.error("[afuchat-api] message edit history query failed", { requestId });
    return errorResponse(request, requestId, "Edit history could not be loaded.", 502);
  }
}

export async function handleMessageEdit(
  request: Request,
  env: Env,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST") {
    const response = errorResponse(request, requestId, "Method not allowed", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "POST, OPTIONS");
    return new Response(response.body, { status: 405, headers });
  }
  const verification = await verifySharedSession(request, env, requestId);
  if (!verification.session) return verification.response;
  const session = verification.session;
  const supabase = supabaseConfig(env);
  if (!supabase) return errorResponse(request, requestId, "Message editing is temporarily unavailable.", 503);

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse(request, requestId, "Invalid message edit request.", 400);
  }
  let payload: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return errorResponse(request, requestId, "Invalid message edit request.", 400);
    }
    payload = JSON.parse(text);
  } catch {
    return errorResponse(request, requestId, "Invalid message edit request.", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse(request, requestId, "Invalid message edit request.", 400);
  }
  const body = payload as Record<string, unknown>;
  if (Object.keys(body).some((key) =>
    !["message_id", "encrypted_content", "expected_user_id"].includes(key)
  )) {
    return errorResponse(request, requestId, "Invalid message edit request.", 400);
  }
  const ownerMatches = matchesExpectedOwner(body.expected_user_id, session);
  if (ownerMatches === null) return errorResponse(request, requestId, "Invalid expected user ID.", 400);
  if (!ownerMatches) {
    return errorResponse(request, requestId, "The active session does not match this action.", 409);
  }
  if (
    typeof body.message_id !== "string" ||
    !UUID_PATTERN.test(body.message_id) ||
    typeof body.encrypted_content !== "string" ||
    body.encrypted_content.length < 1 ||
    body.encrypted_content.length > 200_000
  ) {
    return errorResponse(request, requestId, "Invalid message edit request.", 400);
  }

  const headers = restHeaders(session, supabase.anonKey);
  try {
    const originalResponse = await fetch(makeUrl(supabase.url, "messages", {
      select: "id,sender_id,encrypted_content,sent_at",
      id: `eq.${body.message_id}`,
      sender_id: `eq.${session.user.id}`,
      limit: "2",
    }), {
      method: "GET",
      headers,
      redirect: "manual",
    });
    const originalRows: unknown = await originalResponse.json().catch(() => null);
    if (!originalResponse.ok || !Array.isArray(originalRows)) {
      console.error("[afuchat-api] message edit lookup failed", {
        requestId,
        status: originalResponse.status,
      });
      return errorResponse(request, requestId, "Message could not be edited.", 502);
    }
    if (originalRows.length === 0) {
      return errorResponse(request, requestId, "Message was not found or cannot be edited.", 404);
    }
    if (originalRows.length !== 1) {
      return errorResponse(request, requestId, "Message could not be edited.", 502);
    }
    const original = originalRows[0] as Record<string, unknown>;
    if (
      original.id !== body.message_id ||
      original.sender_id !== session.user.id ||
      typeof original.encrypted_content !== "string" ||
      typeof original.sent_at !== "string"
    ) {
      return errorResponse(request, requestId, "Message could not be edited.", 502);
    }
    const sentAt = Date.parse(original.sent_at);
    if (!Number.isFinite(sentAt)) {
      return errorResponse(request, requestId, "Message could not be edited.", 502);
    }
    if (Date.now() - sentAt > 15 * 60 * 1000) {
      return errorResponse(
        request,
        requestId,
        "Messages can only be edited within 15 minutes of sending.",
        409,
      );
    }
    if (original.encrypted_content === body.encrypted_content) {
      return privateJsonResponse(request, requestId, { message: original, history_saved: true }, 200);
    }

    const editedAt = new Date().toISOString();
    const updateHeaders = new Headers(headers);
    updateHeaders.set("Content-Type", "application/json");
    updateHeaders.set("Prefer", "return=representation");
    const updateResponse = await fetch(makeUrl(supabase.url, "messages", {
      id: `eq.${body.message_id}`,
      sender_id: `eq.${session.user.id}`,
      encrypted_content: `eq.${original.encrypted_content}`,
      select: MESSAGE_FIELDS,
    }), {
      method: "PATCH",
      headers: updateHeaders,
      body: JSON.stringify({ encrypted_content: body.encrypted_content, edited_at: editedAt }),
      redirect: "manual",
    });
    const updatedRows: unknown = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok || !Array.isArray(updatedRows)) {
      const code = updatedRows && typeof updatedRows === "object" &&
          typeof (updatedRows as Record<string, unknown>).code === "string"
        ? (updatedRows as Record<string, string>).code
        : undefined;
      console.error("[afuchat-api] message edit update failed", {
        requestId,
        status: updateResponse.status,
        code,
      });
      return errorResponse(request, requestId, "Message could not be edited.", 502);
    }
    if (updatedRows.length !== 1) {
      return errorResponse(request, requestId, "Message changed before this edit could be saved.", 409);
    }

    const historyHeaders = new Headers(headers);
    historyHeaders.set("Content-Type", "application/json");
    historyHeaders.set("Prefer", "return=minimal");
    let historySaved = false;
    try {
      const historyResponse = await fetch(makeUrl(supabase.url, "message_edit_history", {}), {
        method: "POST",
        headers: historyHeaders,
        body: JSON.stringify({
          message_id: body.message_id,
          edited_by: session.user.id,
          previous_content: original.encrypted_content,
          edited_at: editedAt,
        }),
        redirect: "manual",
      });
      historySaved = historyResponse.ok;
      if (!historySaved) {
        console.error("[afuchat-api] message edit history insert failed", {
          requestId,
          status: historyResponse.status,
        });
      }
    } catch {
      console.error("[afuchat-api] message edit history insert failed", { requestId });
    }
    return privateJsonResponse(
      request,
      requestId,
      { message: updatedRows[0] as Record<string, unknown>, history_saved: historySaved },
      200,
    );
  } catch {
    console.error("[afuchat-api] message edit failed", { requestId });
    return errorResponse(request, requestId, "Message could not be edited.", 502);
  }
}
