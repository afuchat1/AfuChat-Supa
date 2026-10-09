import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    "Accept-Profile": "afuchat",
    "Content-Profile": "afuchat",
  });
}

async function readPayload(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get("Content-Length") || "0");
  if (declaredLength > maxBytes) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function ownerMatches(value: unknown, session: VerifiedSession): boolean | null {
  if (value === undefined) return true;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase() === session.user.id.toLowerCase();
}

function safeStatus(response: Response): number {
  return response.status === 401 || response.status === 403 ? 403 : 502;
}

export async function handleMessageDelete(
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
  if (!supabase) return errorResponse(request, requestId, "Message deletion is temporarily unavailable.", 503);
  let body: Record<string, unknown> | null;
  try {
    body = await readPayload(request, 4096);
  } catch {
    body = null;
  }
  if (
    !body ||
    Object.keys(body).some((key) => key !== "message_id" && key !== "expected_user_id") ||
    typeof body.message_id !== "string" ||
    !UUID_PATTERN.test(body.message_id)
  ) {
    return errorResponse(request, requestId, "Invalid message delete request.", 400);
  }
  const expectedOwner = ownerMatches(body.expected_user_id, session);
  if (expectedOwner === null) return errorResponse(request, requestId, "Invalid expected user ID.", 400);
  if (!expectedOwner) {
    return errorResponse(request, requestId, "The active session does not match this action.", 409);
  }

  const headers = restHeaders(session, supabase.anonKey);
  headers.set("Prefer", "return=representation");
  try {
    const response = await fetch(makeUrl(supabase.url, "messages", {
      id: `eq.${body.message_id}`,
      sender_id: `eq.${session.user.id}`,
      select: "id",
    }), {
      method: "DELETE",
      headers,
      redirect: "manual",
    });
    const rows: unknown = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(rows)) {
      const code = rows && typeof rows === "object" &&
          typeof (rows as Record<string, unknown>).code === "string"
        ? (rows as Record<string, string>).code
        : undefined;
      console.error("[afuchat-api] message delete failed", {
        requestId,
        status: response.status,
        code,
      });
      return errorResponse(request, requestId, "Message could not be deleted.", safeStatus(response));
    }
    if (rows.length !== 1) {
      return errorResponse(request, requestId, "Message was not found or cannot be deleted.", 404);
    }
    return privateJsonResponse(request, requestId, { deleted: true }, 200);
  } catch {
    console.error("[afuchat-api] message delete failed", { requestId });
    return errorResponse(request, requestId, "Message could not be deleted.", 502);
  }
}

export async function handleMessageReport(
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
  if (!supabase) return errorResponse(request, requestId, "Message reporting is temporarily unavailable.", 503);
  let body: Record<string, unknown> | null;
  try {
    body = await readPayload(request, 8192);
  } catch {
    body = null;
  }
  const allowedReasons = new Set(["Spam", "Harassment", "Hate speech", "Inappropriate content"]);
  if (
    !body ||
    Object.keys(body).some((key) =>
      !["message_id", "reason", "message_content", "expected_user_id"].includes(key)
    ) ||
    typeof body.message_id !== "string" ||
    !UUID_PATTERN.test(body.message_id) ||
    typeof body.reason !== "string" ||
    !allowedReasons.has(body.reason) ||
    typeof body.message_content !== "string" ||
    body.message_content.length > 500
  ) {
    return errorResponse(request, requestId, "Invalid message report.", 400);
  }
  const expectedOwner = ownerMatches(body.expected_user_id, session);
  if (expectedOwner === null) return errorResponse(request, requestId, "Invalid expected user ID.", 400);
  if (!expectedOwner) {
    return errorResponse(request, requestId, "The active session does not match this action.", 409);
  }
  const headers = restHeaders(session, supabase.anonKey);
  headers.set("Content-Type", "application/json");
  headers.set("Prefer", "return=minimal");
  try {
    const response = await fetch(makeUrl(supabase.url, "message_reports", {}), {
      method: "POST",
      headers,
      body: JSON.stringify({
        reporter_id: session.user.id,
        message_id: body.message_id,
        reason: body.reason,
        message_content: body.message_content,
      }),
      redirect: "manual",
    });
    if (!response.ok) {
      const diagnostic: unknown = await response.json().catch(() => null);
      const code = diagnostic && typeof diagnostic === "object" &&
          typeof (diagnostic as Record<string, unknown>).code === "string"
        ? (diagnostic as Record<string, string>).code
        : undefined;
      console.error("[afuchat-api] message report insert failed", {
        requestId,
        status: response.status,
        code,
      });
      return errorResponse(request, requestId, "Message report could not be submitted.", safeStatus(response));
    }
    return privateJsonResponse(request, requestId, { submitted: true }, 200);
  } catch {
    console.error("[afuchat-api] message report insert failed", { requestId });
    return errorResponse(request, requestId, "Message report could not be submitted.", 502);
  }
}

export async function handleStarredMessage(
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
  if (!supabase) return errorResponse(request, requestId, "Saved messages are temporarily unavailable.", 503);
  let body: Record<string, unknown> | null;
  try {
    body = await readPayload(request, 4096);
  } catch {
    body = null;
  }
  if (
    !body ||
    Object.keys(body).some((key) => key !== "message_id" && key !== "expected_user_id") ||
    typeof body.message_id !== "string" ||
    !UUID_PATTERN.test(body.message_id)
  ) {
    return errorResponse(request, requestId, "Invalid saved message request.", 400);
  }
  const expectedOwner = ownerMatches(body.expected_user_id, session);
  if (expectedOwner === null) return errorResponse(request, requestId, "Invalid expected user ID.", 400);
  if (!expectedOwner) {
    return errorResponse(request, requestId, "The active session does not match this action.", 409);
  }

  const authHeaders = restHeaders(session, supabase.anonKey);
  try {
    const messageResponse = await fetch(makeUrl(supabase.url, "messages", {
      select: "id,chat_id,sender_id,encrypted_content,attachment_url,attachment_type",
      id: `eq.${body.message_id}`,
      limit: "2",
    }), {
      method: "GET",
      headers: authHeaders,
      redirect: "manual",
    });
    const messageRows: unknown = await messageResponse.json().catch(() => null);
    if (!messageResponse.ok || !Array.isArray(messageRows)) {
      console.error("[afuchat-api] saved message lookup failed", {
        requestId,
        status: messageResponse.status,
      });
      return errorResponse(request, requestId, "Message could not be saved.", 502);
    }
    if (messageRows.length !== 1) {
      return errorResponse(request, requestId, "Message was not found.", 404);
    }
    const message = messageRows[0] as Record<string, unknown>;
    if (
      message.id !== body.message_id ||
      typeof message.chat_id !== "string" ||
      typeof message.sender_id !== "string" ||
      typeof message.encrypted_content !== "string"
    ) {
      return errorResponse(request, requestId, "Message could not be saved.", 502);
    }
    let senderName = "Unknown";
    let senderAvatar: string | null = null;
    const profileUrl = makeUrl(supabase.url, "profiles", {
      select: "id,display_name,avatar_url",
      id: `eq.${message.sender_id}`,
      limit: "2",
    });
    const profileHeaders = new Headers(authHeaders);
    profileHeaders.set("Accept-Profile", "afuchat");
    const profileResponse = await fetch(profileUrl, {
      method: "GET",
      headers: profileHeaders,
      redirect: "manual",
    });
    const profileRows: unknown = await profileResponse.json().catch(() => null);
    if (!profileResponse.ok || !Array.isArray(profileRows)) {
      console.error("[afuchat-api] saved message author lookup failed", {
        requestId,
        status: profileResponse.status,
      });
      return errorResponse(request, requestId, "Message could not be saved.", 502);
    }
    if (profileRows.length > 1) {
      return errorResponse(request, requestId, "Message author could not be resolved.", 502);
    }
    if (profileRows.length === 1) {
      const profile = profileRows[0] as Record<string, unknown>;
      if (profile.id !== message.sender_id) {
        return errorResponse(request, requestId, "Message author could not be resolved.", 502);
      }
      if (typeof profile.display_name === "string") senderName = profile.display_name;
      if (typeof profile.avatar_url === "string") senderAvatar = profile.avatar_url;
    }

    const content = message.encrypted_content;
    const specialContent = !content ||
      ["📷 Photo", "🎥 Video", "GIF"].includes(content) ||
      content.startsWith("🎁 ") ||
      content.startsWith("🧧");
    const savedContent = specialContent
      ? message.attachment_type === "audio" ? "🎤 Voice message" : content
      : content;
    const writeHeaders = new Headers(authHeaders);
    writeHeaders.set("Content-Type", "application/json");
    writeHeaders.set("Prefer", "resolution=merge-duplicates,return=minimal");
    const savedResponse = await fetch(makeUrl(supabase.url, "starred_messages", {
      on_conflict: "user_id,message_id",
    }), {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({
        user_id: session.user.id,
        message_id: message.id,
        chat_id: message.chat_id,
        content: savedContent,
        sender_id: message.sender_id,
        sender_name: senderName,
        sender_avatar: senderAvatar,
        attachment_url: typeof message.attachment_url === "string" ? message.attachment_url : null,
        attachment_type: typeof message.attachment_type === "string" ? message.attachment_type : null,
      }),
      redirect: "manual",
    });
    if (!savedResponse.ok) {
      const diagnostic: unknown = await savedResponse.json().catch(() => null);
      const code = diagnostic && typeof diagnostic === "object" &&
          typeof (diagnostic as Record<string, unknown>).code === "string"
        ? (diagnostic as Record<string, string>).code
        : undefined;
      console.error("[afuchat-api] saved message upsert failed", {
        requestId,
        status: savedResponse.status,
        code,
      });
      return errorResponse(request, requestId, "Message could not be saved.", safeStatus(savedResponse));
    }
    return privateJsonResponse(request, requestId, { saved: true }, 200);
  } catch {
    console.error("[afuchat-api] saved message operation failed", { requestId });
    return errorResponse(request, requestId, "Message could not be saved.", 502);
  }
}

export async function handleMessageClear(
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
  if (!supabase) return errorResponse(request, requestId, "Chat history is temporarily unavailable.", 503);
  let body: Record<string, unknown> | null;
  try {
    body = await readPayload(request, 4096);
  } catch {
    body = null;
  }
  if (
    !body ||
    Object.keys(body).some((key) => key !== "archive" && key !== "expected_user_id") ||
    typeof body.archive !== "boolean"
  ) {
    return errorResponse(request, requestId, "Invalid chat history request.", 400);
  }
  const expectedOwner = ownerMatches(body.expected_user_id, session);
  if (expectedOwner === null) return errorResponse(request, requestId, "Invalid expected user ID.", 400);
  if (!expectedOwner) {
    return errorResponse(request, requestId, "The active session does not match this action.", 409);
  }

  const headers = restHeaders(session, supabase.anonKey);
  const chatIds: string[] = [];
  const pageSize = 1000;
  const maxMemberships = 10_000;
  try {
    for (let offset = 0; ; offset += pageSize) {
      const response = await fetch(makeUrl(supabase.url, "chat_members", {
        select: "chat_id",
        user_id: `eq.${session.user.id}`,
        order: "chat_id.asc",
        limit: String(pageSize),
        offset: String(offset),
      }), {
        method: "GET",
        headers,
        redirect: "manual",
      });
      const rows: unknown = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(rows)) {
        console.error("[afuchat-api] chat history membership query failed", {
          requestId,
          status: response.status,
        });
        return errorResponse(request, requestId, "Chat history could not be cleared.", 502);
      }
      for (const row of rows) {
        const chatId = row && typeof row === "object"
          ? (row as Record<string, unknown>).chat_id
          : null;
        if (typeof chatId !== "string" || !UUID_PATTERN.test(chatId)) {
          return errorResponse(request, requestId, "Chat history could not be cleared.", 502);
        }
        chatIds.push(chatId);
      }
      if (chatIds.length > maxMemberships) {
        return errorResponse(
          request,
          requestId,
          "This account has too many conversations for one clear-history request.",
          413,
        );
      }
      if (rows.length < pageSize) break;
    }

    let completedBatches = 0;
    const batchSize = 100;
    for (let index = 0; index < chatIds.length; index += batchSize) {
      const batch = chatIds.slice(index, index + batchSize);
      const writeHeaders = new Headers(headers);
      if (body.archive) {
        writeHeaders.set("Content-Type", "application/json");
        writeHeaders.set("Prefer", "return=minimal");
      }
      const response = await fetch(makeUrl(supabase.url, "messages", {
        chat_id: `in.(${batch.join(",")})`,
        sender_id: `eq.${session.user.id}`,
      }), {
        method: body.archive ? "PATCH" : "DELETE",
        headers: writeHeaders,
        ...(body.archive ? { body: JSON.stringify({ is_archived: true }) } : {}),
        redirect: "manual",
      });
      if (!response.ok) {
        const diagnostic: unknown = await response.json().catch(() => null);
        const code = diagnostic && typeof diagnostic === "object" &&
            typeof (diagnostic as Record<string, unknown>).code === "string"
          ? (diagnostic as Record<string, string>).code
          : undefined;
        console.error("[afuchat-api] chat history batch operation failed", {
          requestId,
          status: response.status,
          code,
          completedBatches,
        });
        return privateJsonResponse(request, requestId, {
          error: completedBatches > 0
            ? "Some messages were updated, but clearing chat history did not finish. Retry the action."
            : "Chat history could not be cleared.",
          request_id: requestId,
          partial: completedBatches > 0,
        }, safeStatus(response));
      }
      completedBatches += 1;
    }
    return privateJsonResponse(request, requestId, {
      ok: true,
      archive: body.archive,
      chats: chatIds.length,
    }, 200);
  } catch {
    console.error("[afuchat-api] chat history clear failed", { requestId });
    return errorResponse(request, requestId, "Chat history could not be cleared.", 502);
  }
}
