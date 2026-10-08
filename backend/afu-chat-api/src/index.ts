import { handleAccountExport } from "./account-export.ts";
import { handleBookmarks } from "./bookmarks.ts";
import { handleFollows } from "./follows.ts";
import { handleDiscoverFeed, handleRecordPostViews } from "./feed.ts";
import {
  handleDiscoverLocation,
  handleDiscoverNearby,
  handleDiscoverPeople,
  handleDiscoverPresence,
} from "./discover.ts";
import { handleOrganizationPostsFeed } from "./organization-feed.ts";
import { handleVideoFeed } from "./video-feed.ts";
import { handleMessages } from "./messages.ts";
import { handleMessageCount, handleMessageQueries } from "./message-queries.ts";
import { handleChatMembers } from "./chat-members.ts";
import { handleMessageReactions } from "./message-reactions.ts";
import { handleMessageStatus } from "./message-status.ts";
import {
  handleMessageClear,
  handleMessageDelete,
  handleMessageReport,
  handleStarredMessage,
} from "./message-actions.ts";
import { handleMessageEdit, handleMessageEditHistory } from "./message-edit.ts";
import { handlePayments } from "./payments.ts";
import { handleDataGateway } from "./data-gateway.ts";
import { handleGetContactProfile } from "./profiles.ts";
import {
  handleCreatePost,
  handleDeletePost,
  handleGetMyPosts,
  handleGetProfilePosts,
  handleGetPost,
  handleGetPostMetrics,
  handlePostSubroute,
  handleSearchPosts,
  handleTrendingHashtags,
  isPostUuid,
} from "./posts.ts";
import {
  supabaseConfig,
  verifySharedSession,
  type Env,
} from "./shared.ts";

const PREFIX = "/v1/chat";
const CURRENT_PROFILE_SCHEMA = "accounts";
const ALLOWED_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS =
  "Accept-Profile, Authorization, Content-Profile, Content-Type, If-Match, If-Modified-Since, If-None-Match, apikey, Prefer, Range, Range-Unit, X-Client-Info";
const EXPOSED_HEADERS =
  "Content-Location, Content-Range, Preference-Applied, X-AfuChat-Request-Id, X-AfuChat-Version";

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

  // AfuAuth owns the shared account profile; this read must not target the
  // AfuChat compatibility view, which can be absent for valid shared users.
  const schema = CURRENT_PROFILE_SCHEMA;
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
  if (request.method !== "GET" && request.method !== "POST") {
    const response = privateJsonResponse(
      request,
      requestId,
      { error: "Method not allowed", request_id: requestId },
      405,
    );
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Allow", "GET, POST, OPTIONS");
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
  // Production PostgREST exposes public, not afuchat. Public compatibility
  // views/RPCs are the supported API surface and now resolve only to afuchat.
  const schema = env.AFUCHAT_DATABASE_SCHEMA?.trim() || "public";
  if (schema !== "public") {
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

  if (request.method === "POST") {
    const payload = await readJsonRecord(request);
    const otherUserId = payload?.other_user_id;
    if (typeof otherUserId !== "string" || !uuidPattern.test(otherUserId)) {
      return privateJsonResponse(
        request,
        requestId,
        { error: "other_user_id must be a valid UUID", request_id: requestId },
        400,
      );
    }

    const target = new URL(supabase.url);
    target.pathname = "/rest/v1/rpc/get_or_create_direct_chat";
    target.search = "";
    try {
      const upstream = await fetch(new Request(target, {
        method: "POST",
        headers: new Headers({
          apikey: supabase.anonKey,
          Authorization: authorization,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Accept-Profile": schema,
          "Content-Profile": schema,
        }),
        body: JSON.stringify({ other_user_id: otherUserId }),
        redirect: "manual",
      }));
      if (!upstream.ok) {
        console.error("[afuchat-api] direct conversation request failed", {
          requestId,
          status: upstream.status,
        });
        return privateJsonResponse(
          request,
          requestId,
          { error: "Conversation could not be created.", request_id: requestId },
          upstream.status >= 500 ? 502 : upstream.status,
        );
      }

      const chatId: unknown = await upstream.json().catch(() => null);
      if (typeof chatId !== "string" || !uuidPattern.test(chatId)) {
        return privateJsonResponse(
          request,
          requestId,
          { error: "Chat service returned an invalid response.", request_id: requestId },
          502,
        );
      }
      return privateJsonResponse(request, requestId, { chat_id: chatId }, 200);
    } catch {
      console.error("[afuchat-api] direct conversation request failed", { requestId });
      return privateJsonResponse(
        request,
        requestId,
        { error: "Conversation could not be created.", request_id: requestId },
        502,
      );
    }
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

const MAX_EDGE_FUNCTION_BODY_BYTES = 32 * 1024;
const OPTIONAL_PUSH_FIELDS = [
  "senderAvatarUrl",
  "body",
  "chatId",
  "messageId",
  "attachmentUrl",
  "attachmentType",
  "title",
  "callId",
  "categoryId",
  "channelId",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalText(value: unknown, maxLength: number): boolean {
  return value === undefined || value === null ||
    (typeof value === "string" && value.length <= maxLength);
}

async function readJsonRecord(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_EDGE_FUNCTION_BODY_BYTES) {
    return null;
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_EDGE_FUNCTION_BODY_BYTES) return null;
  try {
    const payload: unknown = JSON.parse(text);
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function validPushRegistration(payload: Record<string, unknown>): boolean {
  return typeof payload.token === "string" &&
    payload.token.length >= 20 &&
    payload.token.length <= 8192 &&
    !/^(Expo|Exponent)PushToken\[/i.test(payload.token) &&
    (payload.platform === "android" || payload.platform === "ios") &&
    payload.provider === "fcm" &&
    (payload.appVersion === undefined ||
      (typeof payload.appVersion === "string" && payload.appVersion.length <= 80));
}

function validPushSend(payload: Record<string, unknown>, userId: string): boolean {
  const recipients = payload.recipientUserIds;
  if (
    !Array.isArray(recipients) ||
    recipients.length === 0 ||
    recipients.length > 100 ||
    recipients.some((id) => typeof id !== "string" || id.length === 0 || id.length > 128) ||
    new Set(recipients).size !== recipients.length ||
    recipients.includes(userId) ||
    (payload.senderId !== undefined && payload.senderId !== userId) ||
    typeof payload.senderName !== "string" ||
    payload.senderName.length > 120 ||
    typeof payload.body !== "string" ||
    payload.body.length > 4096 ||
    !isOptionalText(payload.senderAvatarUrl, 2048) ||
    !isOptionalText(payload.chatId, 128) ||
    !isOptionalText(payload.messageId, 128) ||
    !isOptionalText(payload.attachmentUrl, 2048) ||
    !isOptionalText(payload.attachmentType, 80) ||
    !isOptionalText(payload.title, 160) ||
    !isOptionalText(payload.callId, 128) ||
    !isOptionalText(payload.categoryId, 80) ||
    !isOptionalText(payload.channelId, 80)
  ) {
    return false;
  }

  const hasMessageTarget =
    typeof payload.chatId === "string" &&
    payload.chatId.length > 0 &&
    typeof payload.messageId === "string" &&
    payload.messageId.length > 0;
  const hasCallTarget = typeof payload.callId === "string" && payload.callId.length > 0;
  if (!hasMessageTarget && !hasCallTarget) return false;

  if (payload.data !== undefined) {
    if (!isRecord(payload.data) || Object.keys(payload.data).length > 32) return false;
    if (
      Object.entries(payload.data).some(
        ([key, value]) => !key || key.length > 80 || typeof value !== "string" || value.length > 2048,
      )
    ) {
      return false;
    }
    if (
      payload.data.callerId !== undefined &&
      payload.data.callerId !== userId
    ) {
      return false;
    }
    if (
      typeof payload.data.chatId === "string" &&
      typeof payload.chatId === "string" &&
      payload.data.chatId !== payload.chatId
    ) {
      return false;
    }
    if (
      typeof payload.data.messageId === "string" &&
      typeof payload.messageId === "string" &&
      payload.data.messageId !== payload.messageId
    ) {
      return false;
    }
  }
  return true;
}

async function handleSupabaseFunctionProxy(
  request: Request,
  env: Env,
  functionName: "support-ai-reply" | "register-push-token" | "send-push-notification",
  errorMessage: string,
  validate: (payload: Record<string, unknown>, userId: string) => boolean,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST") {
    const response = privateJsonResponse(
      request,
      requestId,
      { error: "Method not allowed", request_id: requestId },
      405,
    );
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

  const payload = await readJsonRecord(request);
  if (!payload || !validate(payload, verification.session.user.id)) {
    return privateJsonResponse(
      request,
      requestId,
      { error: "The request is invalid.", request_id: requestId },
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

  const forwardedPayload: Record<string, unknown> = {};
  if (functionName === "support-ai-reply") {
    forwardedPayload.ticket_id = payload.ticket_id;
  } else if (functionName === "register-push-token") {
    for (const key of ["token", "platform", "provider", "appVersion"]) {
      if (payload[key] !== undefined) forwardedPayload[key] = payload[key];
    }
  } else {
    for (const key of OPTIONAL_PUSH_FIELDS) {
      if (payload[key] !== undefined) forwardedPayload[key] = payload[key];
    }
    forwardedPayload.recipientUserIds = payload.recipientUserIds;
    // Never forward a caller-supplied identity as the authority.
    forwardedPayload.senderId = verification.session.user.id;
    if (payload.data !== undefined) forwardedPayload.data = payload.data;
  }

  const target = new URL(`/functions/v1/${functionName}`, `${supabase.url}/`);
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        apikey: supabase.anonKey,
        Authorization: `Bearer ${verification.session.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(forwardedPayload),
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    const text = await upstream.text();
    let result: unknown = null;
    try {
      result = text ? JSON.parse(text) : null;
    } catch {
      // Successful functions may have an empty response; only status and an
      // explicit JSON error determine whether the operation failed.
    }
    const resultRecord = isRecord(result) ? result : null;
    const applicationFailed =
      resultRecord?.ok === false ||
      resultRecord?.success === false ||
      (typeof resultRecord?.error === "string" && resultRecord.error.length > 0);
    if (!upstream.ok || applicationFailed) {
      console.error("[afuchat-api] Supabase function request failed", {
        requestId,
        functionName,
        status: upstream.status,
      });
      const safeStatus =
        upstream.ok ||
        upstream.status === 404 ||
        upstream.status >= 500 ||
        ![400, 401, 403, 409, 422, 429].includes(upstream.status)
          ? 502
          : upstream.status;
      return privateJsonResponse(
        request,
        requestId,
        { error: errorMessage, request_id: requestId },
        safeStatus,
      );
    }

    return privateJsonResponse(request, requestId, { ok: true }, 200);
  } catch {
    console.error("[afuchat-api] Supabase function request failed", {
      requestId,
      functionName,
    });
    return privateJsonResponse(
      request,
      requestId,
      { error: errorMessage, request_id: requestId },
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

  if (incoming.pathname.startsWith(`${PREFIX}/data/`)) {
    return handleDataGateway(request, env);
  }

  const contactProfileMatch = incoming.pathname.match(/^\/v1\/chat\/profiles\/([^/]+)$/);
  if (contactProfileMatch) {
    return handleGetContactProfile(request, env, contactProfileMatch[1]);
  }

  if (incoming.pathname === `${PREFIX}/bookmarks`) {
    return handleBookmarks(request, env);
  }

  if (incoming.pathname === `${PREFIX}/follows`) {
    return handleFollows(request, env, "mutate");
  }
  if (incoming.pathname === `${PREFIX}/follows/ids`) {
    return handleFollows(request, env, "ids");
  }
  if (incoming.pathname === `${PREFIX}/follows/summary`) {
    return handleFollows(request, env, "summary");
  }
  if (incoming.pathname === `${PREFIX}/follows/status`) {
    return handleFollows(request, env, "status");
  }
  if (incoming.pathname === `${PREFIX}/follows/list`) {
    return handleFollows(request, env, "list");
  }

  if (incoming.pathname === `${PREFIX}/feed/for-you`) {
    return handleDiscoverFeed(request, env, "for-you");
  }
  if (incoming.pathname === `${PREFIX}/feed/following`) {
    return handleDiscoverFeed(request, env, "following");
  }
  if (incoming.pathname === `${PREFIX}/feed/views`) {
    return handleRecordPostViews(request, env);
  }
  if (incoming.pathname === `${PREFIX}/feed/videos`) {
    return handleVideoFeed(request, env);
  }
  if (incoming.pathname === `${PREFIX}/feed/organization-posts`) {
    return handleOrganizationPostsFeed(request, env);
  }
  if (incoming.pathname === `${PREFIX}/discover/people`) {
    return handleDiscoverPeople(request, env);
  }
  if (incoming.pathname === `${PREFIX}/discover/nearby`) {
    return handleDiscoverNearby(request, env);
  }
  if (incoming.pathname === `${PREFIX}/discover/location`) {
    return handleDiscoverLocation(request, env);
  }
  if (incoming.pathname === `${PREFIX}/discover/presence`) {
    return handleDiscoverPresence(request, env);
  }

  if (incoming.pathname === `${PREFIX}/posts/mine`) {
    return handleGetMyPosts(request, env);
  }

  if (incoming.pathname === `${PREFIX}/posts/search`) {
    return handleSearchPosts(request, env);
  }
  if (incoming.pathname === `${PREFIX}/posts/trending/hashtags`) {
    return handleTrendingHashtags(request, env);
  }

  const profilePostsMatch = incoming.pathname.match(/^\/v1\/chat\/posts\/profile\/([^/]+)$/);
  if (profilePostsMatch) {
    return handleGetProfilePosts(request, env, profilePostsMatch[1]);
  }

  if (incoming.pathname === `${PREFIX}/posts`) {
    return handleCreatePost(request, env);
  }

  if (incoming.pathname.startsWith(`${PREFIX}/posts/`)) {
    const parts = incoming.pathname.slice(`${PREFIX}/posts/`.length).split("/");
    const postId = parts[0];
    if (!isPostUuid(postId)) {
      return privateJsonResponse(
        request,
        requestId,
        { error: "The post ID is invalid.", request_id: requestId },
        400,
      );
    }
    if (parts.length === 2 && parts[1] === "like") {
      return handlePostSubroute(
        request,
        env,
        postId,
        "like",
        undefined,
        incoming.searchParams.get("organization_post") === "true",
      );
    }
    if (parts.length === 2 && parts[1] === "metrics") {
      return handleGetPostMetrics(request, env, postId);
    }
    if (parts.length === 2 && parts[1] === "replies") {
      return handlePostSubroute(request, env, postId, "replies");
    }
    if (parts.length === 4 && parts[1] === "replies" && parts[3] === "like") {
      if (!isPostUuid(parts[2])) {
        return privateJsonResponse(
          request,
          requestId,
          { error: "The reply ID is invalid.", request_id: requestId },
          400,
        );
      }
      return handlePostSubroute(request, env, postId, "reply-like", parts[2]);
    }
    if (parts.length !== 1) {
      return privateJsonResponse(
        request,
        requestId,
        { error: "The requested post route was not found.", request_id: requestId },
        404,
      );
    }
    if (request.method === "GET") return handleGetPost(request, env, postId);
    if (request.method === "DELETE") return handleDeletePost(request, env, postId);
    const response = privateJsonResponse(
      request,
      requestId,
      { error: "Method not allowed.", request_id: requestId },
      405,
    );
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, DELETE, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }

  if (incoming.pathname === `${PREFIX}/messages`) {
    return request.method === "GET"
      ? handleMessageQueries(request, env)
      : handleMessages(request, env);
  }

  if (incoming.pathname === `${PREFIX}/messages/count`) {
    return handleMessageCount(request, env);
  }

  if (incoming.pathname === `${PREFIX}/messages/status`) {
    return handleMessageStatus(request, env);
  }

  if (incoming.pathname === `${PREFIX}/messages/reactions`) {
    return handleMessageReactions(request, env);
  }

  if (incoming.pathname === `${PREFIX}/messages/edit`) {
    return handleMessageEdit(request, env);
  }

  if (incoming.pathname === `${PREFIX}/messages/edit-history`) {
    return handleMessageEditHistory(request, env);
  }

  if (incoming.pathname === `${PREFIX}/messages/delete`) {
    return handleMessageDelete(request, env);
  }

  if (incoming.pathname === `${PREFIX}/messages/clear`) {
    return handleMessageClear(request, env);
  }

  if (incoming.pathname === `${PREFIX}/messages/report`) {
    return handleMessageReport(request, env);
  }

  if (incoming.pathname === `${PREFIX}/messages/starred`) {
    return handleStarredMessage(request, env);
  }

  if (incoming.pathname === `${PREFIX}/support/ai-reply`) {
    return handleSupabaseFunctionProxy(
      request,
      env,
      "support-ai-reply",
      "Support reply could not be generated.",
      (payload) => typeof payload.ticket_id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.ticket_id),
    );
  }

  if (incoming.pathname === `${PREFIX}/push/register`) {
    return handleSupabaseFunctionProxy(
      request,
      env,
      "register-push-token",
      "Push registration could not be completed.",
      (payload) => validPushRegistration(payload),
    );
  }

  if (incoming.pathname === `${PREFIX}/push/send`) {
    return handleSupabaseFunctionProxy(
      request,
      env,
      "send-push-notification",
      "Push notifications could not be sent.",
      (payload, userId) => validPushSend(payload, userId),
    );
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

  if (
    incoming.pathname === `${PREFIX}/members` &&
    request.method !== "OPTIONS"
  ) {
    return handleChatMembers(request, env);
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
  if (url.pathname === `${PREFIX}/members`) {
    return handleChatMembers(request, env);
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