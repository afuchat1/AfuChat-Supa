import { AFUCHAT_API_URL } from "./env";
import { supabase } from "./supabase";
import { isOnline } from "./offlineStore";

export interface AfuChatApiError {
  message: string;
  code?: string;
  requestId?: string;
}

const LIVE_DATA_ENDPOINTS = new Set([
  "/me",
  "/conversations",
  "/members",
  "/messages",
  "/follows/list",
  "/follows/ids",
  "/follows/summary",
  "/follows/status",
]);

function getLiveDataEndpoint(path: string): string {
  return path.split("?")[0];
}

function getLiveDataItemCount(payload: unknown): number | null {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items.length;
  if (Array.isArray(record.messages)) return record.messages.length;
  if (Array.isArray(record.members)) return record.members.length;
  return null;
}

function logLiveDataResponse(
  path: string,
  response: Response,
  payload: unknown,
  identityMatches?: boolean,
  method = "GET",
): void {
  const endpoint = getLiveDataEndpoint(path);
  if (!__DEV__ || !LIVE_DATA_ENDPOINTS.has(endpoint)) return;

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const record = payload && typeof payload === "object"
        ? payload as Record<string, unknown>
        : null;
      const requestId =
        (typeof record?.request_id === "string" ? record.request_id : null) ??
        response.headers.get("X-AfuChat-Request-Id");
      const errorMessage = !response.ok && typeof record?.error === "string"
        ? record.error.slice(0, 120)
        : undefined;
      const details = {
        endpoint: `/v1/chat${endpoint}`,
        method,
        status: response.status,
        requestId,
        clientUserId: session?.user.id ?? null,
        sessionPresent: !!session?.access_token,
        deviceOnline: isOnline(),
        apiReachable: true,
        sessionAccepted: response.status < 400
          ? true
          : response.status === 401
            ? false
            : null,
        itemCount: getLiveDataItemCount(payload),
        ...(identityMatches === undefined ? {} : { profileIdentityMatches: identityMatches }),
        ...(typeof record?.code === "string"
          ? { errorCode: record.code }
          : !response.ok
            ? { errorCode: String(response.status) }
            : {}),
        ...(errorMessage ? { errorMessage } : {}),
      };
      (response.ok ? console.info : console.warn)("[AfuChat live data]", details);
    } catch {
      // Diagnostics must never interfere with the request or the chat UI.
    }
  })();
}

function logLiveDataNetworkFailure(path: string, error: unknown, method = "GET"): void {
  const endpoint = getLiveDataEndpoint(path);
  if (!__DEV__ || !LIVE_DATA_ENDPOINTS.has(endpoint)) return;

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      console.warn("[AfuChat live data]", {
        endpoint: `/v1/chat${endpoint}`,
        method,
        status: null,
        requestId: null,
        clientUserId: data.session?.user.id ?? null,
        sessionPresent: !!data.session?.access_token,
        deviceOnline: isOnline(),
        apiReachable: false,
        sessionAccepted: null,
        errorCode: error instanceof Error ? error.name : "NETWORK_ERROR",
      });
    } catch {
      // Diagnostics must never interfere with the request or the chat UI.
    }
  })();
}

export async function getAfuChatAccessToken(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const now = Math.floor(Date.now() / 1000);
    if (session?.access_token && (!session.expires_at || session.expires_at > now + 60)) {
      return session.access_token;
    }

    // Refresh only near expiry. Refreshing on every API call rotates the
    // refresh token repeatedly and can disrupt concurrent chat/API requests.
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session?.access_token) return refreshed.session.access_token;
    if (session?.access_token && (!session.expires_at || session.expires_at > now)) {
      return session.access_token;
    }
    return "";
  } catch {
    return "";
  }
}

export async function afuChatApiFetch(
  path: string,
  init: RequestInit = {},
  requireAuth = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  if (requireAuth) {
    const token = await getAfuChatAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  try {
    return await fetch(`${AFUCHAT_API_URL}/v1/chat${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      headers,
    });
  } catch (error) {
    logLiveDataNetworkFailure(path, error, init.method ?? "GET");
    throw error;
  }
}

export async function getAfuChatConversations(
  unreadExcludedIds: string[] = [],
): Promise<{ data: unknown[] | null; error: AfuChatApiError | null }> {
  const query = new URLSearchParams();
  if (unreadExcludedIds.length) {
    query.set("unread_excluded_ids", unreadExcludedIds.join(","));
  }
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : "";

  try {
    const response = await afuChatApiFetch(
      `/conversations${suffix}`,
      { method: "GET" },
    );
    const payload: unknown = await response.json().catch(() => null);
    logLiveDataResponse("/conversations", response, payload);
    if (!response.ok) {
      const record = payload && typeof payload === "object"
        ? payload as Record<string, unknown>
        : null;
      const message =
        typeof record?.error === "string"
          ? record.error
          : `Chat request failed (HTTP ${response.status})`;
      return {
        data: null,
        error: {
          message,
          code: typeof record?.code === "string" ? record.code : String(response.status),
          requestId: typeof record?.request_id === "string"
            ? record.request_id
            : response.headers.get("X-AfuChat-Request-Id") ?? undefined,
        },
      };
    }
    if (!Array.isArray(payload)) {
      return {
        data: null,
        error: {
          message: "Chat service returned an invalid response",
          code: "INVALID_RESPONSE",
          requestId: response.headers.get("X-AfuChat-Request-Id") ?? undefined,
        },
      };
    }
    return { data: payload, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export type AfuChatMember = {
  id: string;
  chat_id: string;
  user_id: string;
  is_admin: boolean;
  joined_at: string | null;
};

function isAfuChatMember(value: unknown): value is AfuChatMember {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" &&
    typeof row.chat_id === "string" &&
    typeof row.user_id === "string" &&
    typeof row.is_admin === "boolean" &&
    (row.joined_at === null || typeof row.joined_at === "string");
}

export async function getAfuChatChatMembers(input:
  | { chatId: string }
  | { chatIds: string[] }
  | { mine: true }
): Promise<{ data: AfuChatMember[] | null; error: AfuChatApiError | null }> {
  const query = new URLSearchParams();
  if ("chatId" in input) query.set("chat_id", input.chatId);
  else if ("chatIds" in input) query.set("chat_ids", input.chatIds.join(","));
  else query.set("mine", "true");
  const path = `/members?${query.toString()}`;

  try {
    const response = await afuChatApiFetch(path, { method: "GET" });
    const payload: unknown = await response.json().catch(() => null);
    logLiveDataResponse(path, response, payload);
    const record = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : null;
    if (!response.ok) {
      return {
        data: null,
        error: {
          message: typeof record?.error === "string"
            ? record.error
            : `Chat request failed (HTTP ${response.status})`,
          code: typeof record?.code === "string" ? record.code : String(response.status),
          requestId: typeof record?.request_id === "string"
            ? record.request_id
            : response.headers.get("X-AfuChat-Request-Id") ?? undefined,
        },
      };
    }
    if (!Array.isArray(record?.members) || !record.members.every(isAfuChatMember)) {
      return {
        data: null,
        error: {
          message: "Chat service returned an invalid membership response.",
          code: "INVALID_RESPONSE",
          requestId: response.headers.get("X-AfuChat-Request-Id") ?? undefined,
        },
      };
    }
    return { data: record.members, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function getAfuChatCurrentProfile<T extends { id: string }>(
  expectedUserId: string,
): Promise<{ data: T | null; error: AfuChatApiError | null }> {
  try {
    const token = await getAfuChatAccessToken();
    if (!token) {
      return {
        data: null,
        error: { message: "No authenticated session is available.", code: "NO_SESSION" },
      };
    }

    const response = await fetch(`${AFUCHAT_API_URL}/v1/chat/me`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const payload: unknown = await response.json().catch(() => null);
    const responseRecord = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : null;
    logLiveDataResponse("/me", response, payload, responseRecord?.id === expectedUserId);
    const record = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : null;

    if (!response.ok) {
      return {
        data: null,
        error: {
          message: typeof record?.error === "string"
            ? record.error
            : `Profile request failed (HTTP ${response.status})`,
          code: String(response.status),
          requestId: typeof record?.request_id === "string" ? record.request_id : undefined,
        },
      };
    }

    if (!record || typeof record.id !== "string" || record.id !== expectedUserId) {
      return {
        data: null,
        error: { message: "Profile service returned an invalid user profile.", code: "INVALID_RESPONSE" },
      };
    }

    return { data: record as T, error: null };
  } catch (error) {
    logLiveDataNetworkFailure("/me", error);
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Profile service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export type AfuChatContactProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  is_business_mode: boolean;
  is_private: boolean;
  country: string | null;
  website_url: string | null;
  xp: number;
  current_grade: string | null;
  acoin: number;
  last_seen: string | null;
  show_online_status: boolean;
  created_at: string | null;
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isAfuChatContactProfile(value: unknown): value is AfuChatContactProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" &&
    typeof row.display_name === "string" &&
    typeof row.handle === "string" &&
    isNullableString(row.avatar_url) &&
    isNullableString(row.banner_url) &&
    isNullableString(row.bio) &&
    typeof row.is_verified === "boolean" &&
    typeof row.is_organization_verified === "boolean" &&
    typeof row.is_business_mode === "boolean" &&
    typeof row.is_private === "boolean" &&
    isNullableString(row.country) &&
    isNullableString(row.website_url) &&
    typeof row.xp === "number" && Number.isFinite(row.xp) &&
    isNullableString(row.current_grade) &&
    typeof row.acoin === "number" && Number.isFinite(row.acoin) &&
    isNullableString(row.last_seen) &&
    typeof row.show_online_status === "boolean" &&
    isNullableString(row.created_at);
}

export async function getAfuChatContactProfile(
  profileId: string,
): Promise<{ data: AfuChatContactProfile | null; error: AfuChatApiError | null }> {
  try {
    const { response, data: payload } = await afuChatApiJson<{
      profile?: unknown;
      error?: unknown;
      request_id?: unknown;
    }>(`/profiles/${encodeURIComponent(profileId)}`);
    if (!response.ok) {
      return {
        data: null,
        error: {
          message: typeof payload?.error === "string"
            ? payload.error
            : `Profile request failed (HTTP ${response.status})`,
          code: String(response.status),
          requestId: typeof payload?.request_id === "string"
            ? payload.request_id
            : response.headers.get("X-AfuChat-Request-Id") ?? undefined,
        },
      };
    }
    if (!isAfuChatContactProfile(payload?.profile) || payload.profile.id !== profileId) {
      return {
        data: null,
        error: {
          message: "Profile service returned an invalid profile response.",
          code: "INVALID_RESPONSE",
        },
      };
    }
    return { data: payload.profile, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Profile service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function afuChatApiJson<T>(
  path: string,
  body?: unknown,
  requireAuth = true,
): Promise<{ response: Response; data: T | null }> {
  const response = await afuChatApiFetch(path, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  }, requireAuth);
  const data = await response.json().catch(() => null) as T | null;
  logLiveDataResponse(path, response, data, undefined, body === undefined ? "GET" : "POST");
  return { response, data };
}

export type AfuChatCreateMessageInput = {
  chat_id: string;
  client_message_id: string;
  encrypted_content: string;
  reply_to_message_id?: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  audio_url?: string | null;
  expected_user_id?: string;
};

export function createAfuChatClientMessageId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export async function postAfuChatMessage(
  body: AfuChatCreateMessageInput,
): Promise<{ data: AfuChatMessage | null; error: AfuChatApiError | null }> {
  try {
    const { response, data: payload } = await afuChatApiJson<{
      message?: unknown;
      error?: unknown;
      request_id?: unknown;
    }>("/messages", body);
    if (!response.ok) {
      const record = payload as Record<string, unknown> | null;
      return {
        data: null,
        error: {
          message: typeof record?.error === "string"
            ? record.error
            : `Message could not be sent (HTTP ${response.status})`,
          code: String(response.status),
          requestId: typeof record?.request_id === "string"
            ? record.request_id
            : response.headers.get("X-AfuChat-Request-Id") ?? undefined,
        },
      };
    }
    if (!isAfuChatMessage(payload?.message)) {
      return {
        data: null,
        error: { message: "Chat service returned an invalid message.", code: "INVALID_RESPONSE" },
      };
    }
    return { data: payload.message, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export type AfuChatMessageQuery = {
  chatId: string;
  limit?: number;
  before?: string;
  after?: string;
  messageId?: string;
  sender?: "me" | "others";
};

export type AfuChatMessage = {
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

function isOptionalMessageText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isAfuChatMessage(value: unknown): value is AfuChatMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" &&
    typeof row.chat_id === "string" &&
    typeof row.sender_id === "string" &&
    typeof row.encrypted_content === "string" &&
    typeof row.sent_at === "string" &&
    isOptionalMessageText(row.reply_to_message_id) &&
    isOptionalMessageText(row.attachment_url) &&
    isOptionalMessageText(row.attachment_type) &&
    isOptionalMessageText(row.attachment_name) &&
    (row.attachment_size === null ||
      (Number.isSafeInteger(row.attachment_size) && Number(row.attachment_size) >= 0)) &&
    isOptionalMessageText(row.audio_url) &&
    isOptionalMessageText(row.edited_at);
}

export async function getAfuChatMessages(
  query: AfuChatMessageQuery,
): Promise<{ data: AfuChatMessage[] | null; error: AfuChatApiError | null }> {
  try {
    const params = new URLSearchParams({ chat_id: query.chatId });
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.before) params.set("before", query.before);
    if (query.after) params.set("after", query.after);
    if (query.messageId) params.set("message_id", query.messageId);
    if (query.sender) params.set("sender", query.sender);
    const response = await afuChatApiFetch(`/messages?${params.toString()}`, { method: "GET" });
    const payload: unknown = await response.json().catch(() => null);
    logLiveDataResponse("/messages", response, payload);
    if (!response.ok) {
      const record = payload && typeof payload === "object"
        ? payload as Record<string, unknown>
        : null;
      return {
        data: null,
        error: {
          message: typeof record?.error === "string"
            ? record.error
            : `Messages could not be loaded (HTTP ${response.status})`,
          code: String(response.status),
          requestId: typeof record?.request_id === "string"
            ? record.request_id
            : response.headers.get("X-AfuChat-Request-Id") ?? undefined,
        },
      };
    }
    const rows = payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).messages
      : null;
    if (!Array.isArray(rows) || !rows.every(isAfuChatMessage)) {
      return {
        data: null,
        error: { message: "Chat service returned an invalid message response.", code: "INVALID_RESPONSE" },
      };
    }
    return { data: rows, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function getAfuChatMessageCount(query: {
  chatId?: string;
  sender?: "me" | "others";
  expectedUserId?: string;
} = {}): Promise<{ data: number | null; error: AfuChatApiError | null }> {
  try {
    const params = new URLSearchParams();
    if (query.chatId) params.set("chat_id", query.chatId);
    if (query.sender) params.set("sender", query.sender);
    if (query.expectedUserId) params.set("expected_user_id", query.expectedUserId);
    const queryString = params.toString();
    const suffix = queryString ? `?${queryString}` : "";
    const { response, data } = await afuChatApiJson<{ count?: unknown }>(
      `/messages/count${suffix}`,
    );
    if (!response.ok) {
      const record = data && typeof data === "object"
        ? data as Record<string, unknown>
        : null;
      return {
        data: null,
        error: {
          message: typeof record?.error === "string"
            ? record.error
            : `Message count could not be loaded (HTTP ${response.status})`,
          code: String(response.status),
          requestId: typeof record?.request_id === "string"
            ? record.request_id
            : response.headers.get("X-AfuChat-Request-Id") ?? undefined,
        },
      };
    }
    if (!Number.isSafeInteger(data?.count) || Number(data?.count) < 0) {
      return {
        data: null,
        error: { message: "Chat service returned an invalid message count.", code: "INVALID_RESPONSE" },
      };
    }
    return { data: Number(data?.count), error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export type AfuChatMessageStatus = {
  message_id: string;
  user_id: string;
  read_at: string | null;
  delivered_at: string | null;
};

async function messageActionError(
  response: Response,
  payload: unknown,
  fallback: string,
): Promise<AfuChatApiError> {
  const record = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : null;
  return {
    message: typeof record?.error === "string"
      ? record.error
      : `${fallback} (HTTP ${response.status})`,
    code: String(response.status),
    requestId: typeof record?.request_id === "string"
      ? record.request_id
      : response.headers.get("X-AfuChat-Request-Id") ?? undefined,
  };
}

export async function getAfuChatMessageStatuses(messageIds: string[]): Promise<{
  data: AfuChatMessageStatus[] | null;
  error: AfuChatApiError | null;
}> {
  if (messageIds.length === 0) return { data: [], error: null };
  const uniqueIds = [...new Set(messageIds)];
  if (uniqueIds.length > 100) {
    const combined: AfuChatMessageStatus[] = [];
    for (let index = 0; index < uniqueIds.length; index += 100) {
      const batch = await getAfuChatMessageStatuses(uniqueIds.slice(index, index + 100));
      if (batch.error || !batch.data) return batch;
      combined.push(...batch.data);
    }
    return { data: combined, error: null };
  }
  try {
    const query = new URLSearchParams({ message_ids: uniqueIds.join(",") });
    const { response, data } = await afuChatApiJson<{ statuses?: unknown }>(
      `/messages/status?${query.toString()}`,
    );
    if (!response.ok) {
      return {
        data: null,
        error: await messageActionError(response, data, "Message status could not be loaded"),
      };
    }
    if (!Array.isArray(data?.statuses)) {
      return {
        data: null,
        error: { message: "Chat service returned an invalid status response.", code: "INVALID_RESPONSE" },
      };
    }
    return { data: data.statuses as AfuChatMessageStatus[], error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function setAfuChatMessageStatus(input: {
  messageIds?: string[];
  chatId?: string;
  readReceipts?: boolean;
  expectedUserId?: string;
}): Promise<{ error: AfuChatApiError | null }> {
  const messageIds = input.messageIds ? [...new Set(input.messageIds)] : undefined;
  if (messageIds && messageIds.length > 100) {
    for (let index = 0; index < messageIds.length; index += 100) {
      const result = await setAfuChatMessageStatus({
        messageIds: messageIds.slice(index, index + 100),
        readReceipts: input.readReceipts,
        expectedUserId: input.expectedUserId,
      });
      if (result.error) return result;
    }
    return { error: null };
  }
  try {
    const { response, data } = await afuChatApiJson<{ ok?: unknown }>(
      "/messages/status",
      {
        ...(messageIds ? { message_ids: messageIds } : {}),
        ...(input.chatId ? { chat_id: input.chatId } : {}),
        ...(input.readReceipts === undefined ? {} : { read_receipts: input.readReceipts }),
        ...(input.expectedUserId ? { expected_user_id: input.expectedUserId } : {}),
      },
    );
    if (!response.ok) {
      return {
        error: await messageActionError(response, data, "Message status could not be updated"),
      };
    }
    if (data?.ok !== true) {
      return {
        error: { message: "Chat service returned an invalid status response.", code: "INVALID_RESPONSE" },
      };
    }
    return { error: null };
  } catch (error) {
    return {
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export type AfuChatMessageReaction = {
  message_id: string;
  reaction: string;
  user_id: string;
};

export async function getAfuChatMessageReactions(messageIds: string[]): Promise<{
  data: AfuChatMessageReaction[] | null;
  error: AfuChatApiError | null;
}> {
  if (messageIds.length === 0) return { data: [], error: null };
  const uniqueIds = [...new Set(messageIds)];
  if (uniqueIds.length > 100) {
    const combined: AfuChatMessageReaction[] = [];
    for (let index = 0; index < uniqueIds.length; index += 100) {
      const batch = await getAfuChatMessageReactions(uniqueIds.slice(index, index + 100));
      if (batch.error || !batch.data) return batch;
      combined.push(...batch.data);
    }
    return { data: combined, error: null };
  }
  try {
    const query = new URLSearchParams({ message_ids: uniqueIds.join(",") });
    const { response, data } = await afuChatApiJson<{ reactions?: unknown }>(
      `/messages/reactions?${query.toString()}`,
    );
    if (!response.ok) {
      return {
        data: null,
        error: await messageActionError(response, data, "Message reactions could not be loaded"),
      };
    }
    if (!Array.isArray(data?.reactions)) {
      return {
        data: null,
        error: { message: "Chat service returned an invalid reaction response.", code: "INVALID_RESPONSE" },
      };
    }
    return { data: data.reactions as AfuChatMessageReaction[], error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function setAfuChatMessageReaction(input: {
  messageId: string;
  reaction: string;
  active: boolean;
  expectedUserId?: string;
}): Promise<{ error: AfuChatApiError | null }> {
  try {
    const expected = input.expectedUserId
      ? `&expected_user_id=${encodeURIComponent(input.expectedUserId)}`
      : "";
    const response = input.active
      ? await afuChatApiFetch("/messages/reactions", {
          method: "POST",
          body: JSON.stringify({
            message_id: input.messageId,
            reaction: input.reaction,
            ...(input.expectedUserId ? { expected_user_id: input.expectedUserId } : {}),
          }),
        })
      : await afuChatApiFetch(
          `/messages/reactions?message_id=${encodeURIComponent(input.messageId)}&reaction=${encodeURIComponent(input.reaction)}${expected}`,
          { method: "DELETE" },
        );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        error: await messageActionError(response, payload, "Message reaction could not be updated"),
      };
    }
    const record = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : null;
    if (record?.reacted !== input.active) {
      return {
        error: { message: "Chat service returned an invalid reaction response.", code: "INVALID_RESPONSE" },
      };
    }
    return { error: null };
  } catch (error) {
    return {
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export type AfuChatMessageEditHistory = {
  id: string;
  previous_content: string;
  edited_at: string;
};

export async function getAfuChatMessageEditHistory(messageId: string): Promise<{
  data: AfuChatMessageEditHistory[] | null;
  error: AfuChatApiError | null;
}> {
  try {
    const query = new URLSearchParams({ message_id: messageId });
    const { response, data } = await afuChatApiJson<{ history?: unknown }>(
      `/messages/edit-history?${query.toString()}`,
    );
    if (!response.ok) {
      return {
        data: null,
        error: await messageActionError(response, data, "Edit history could not be loaded"),
      };
    }
    if (!Array.isArray(data?.history) || !data.history.every((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const row = item as Record<string, unknown>;
      return typeof row.id === "string" &&
        typeof row.previous_content === "string" &&
        typeof row.edited_at === "string";
    })) {
      return {
        data: null,
        error: { message: "Chat service returned invalid edit history.", code: "INVALID_RESPONSE" },
      };
    }
    return { data: data.history as AfuChatMessageEditHistory[], error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function editAfuChatMessage(input: {
  messageId: string;
  encryptedContent: string;
  expectedUserId?: string;
}): Promise<{
  data: { message: AfuChatMessage; historySaved: boolean } | null;
  error: AfuChatApiError | null;
}> {
  try {
    const { response, data } = await afuChatApiJson<{
      message?: unknown;
      history_saved?: unknown;
    }>("/messages/edit", {
      message_id: input.messageId,
      encrypted_content: input.encryptedContent,
      ...(input.expectedUserId ? { expected_user_id: input.expectedUserId } : {}),
    });
    if (!response.ok) {
      return {
        data: null,
        error: await messageActionError(response, data, "Message could not be edited"),
      };
    }
    if (!isAfuChatMessage(data?.message) || typeof data.history_saved !== "boolean") {
      return {
        data: null,
        error: { message: "Chat service returned an invalid edit response.", code: "INVALID_RESPONSE" },
      };
    }
    return {
      data: { message: data.message, historySaved: data.history_saved },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

async function postMessageAction(
  path: string,
  body: Record<string, unknown>,
  responseKey: "deleted" | "submitted" | "saved",
  fallback: string,
): Promise<{ error: AfuChatApiError | null }> {
  try {
    const { response, data } = await afuChatApiJson<Record<string, unknown>>(path, body);
    if (!response.ok) {
      return { error: await messageActionError(response, data, fallback) };
    }
    if (data?.[responseKey] !== true) {
      return {
        error: { message: "Chat service returned an invalid response.", code: "INVALID_RESPONSE" },
      };
    }
    return { error: null };
  } catch (error) {
    return {
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export function deleteAfuChatMessage(
  messageId: string,
  expectedUserId?: string,
): Promise<{ error: AfuChatApiError | null }> {
  return postMessageAction(
    "/messages/delete",
    {
      message_id: messageId,
      ...(expectedUserId ? { expected_user_id: expectedUserId } : {}),
    },
    "deleted",
    "Message could not be deleted",
  );
}

export function reportAfuChatMessage(input: {
  messageId: string;
  reason: string;
  messageContent: string;
  expectedUserId?: string;
}): Promise<{ error: AfuChatApiError | null }> {
  return postMessageAction(
    "/messages/report",
    {
      message_id: input.messageId,
      reason: input.reason,
      message_content: input.messageContent.slice(0, 500),
      ...(input.expectedUserId ? { expected_user_id: input.expectedUserId } : {}),
    },
    "submitted",
    "Message report could not be submitted",
  );
}

export function starAfuChatMessage(
  messageId: string,
  expectedUserId?: string,
): Promise<{ error: AfuChatApiError | null }> {
  return postMessageAction(
    "/messages/starred",
    {
      message_id: messageId,
      ...(expectedUserId ? { expected_user_id: expectedUserId } : {}),
    },
    "saved",
    "Message could not be saved",
  );
}

export async function clearAfuChatHistory(input: {
  archive: boolean;
  expectedUserId?: string;
}): Promise<{ error: AfuChatApiError | null }> {
  try {
    const { response, data } = await afuChatApiJson<{
      ok?: unknown;
      archive?: unknown;
    }>("/messages/clear", {
      archive: input.archive,
      ...(input.expectedUserId ? { expected_user_id: input.expectedUserId } : {}),
    });
    if (!response.ok) {
      return {
        error: await messageActionError(response, data, "Chat history could not be cleared"),
      };
    }
    if (data?.ok !== true || data.archive !== input.archive) {
      return {
        error: { message: "Chat service returned an invalid clear-history response.", code: "INVALID_RESPONSE" },
      };
    }
    return { error: null };
  } catch (error) {
    return {
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export type AfuChatSavedPost = {
  id: string;
  post_id: string;
  saved_at: string;
  post: {
    id: string;
    content: string;
    media_url: string | null;
    created_at: string;
    author: {
      handle: string;
      display_name: string;
      avatar_url: string | null;
      is_verified: boolean;
    } | null;
  } | null;
};

function bookmarkApiError(
  response: Response,
  payload: unknown,
  fallback: string,
): AfuChatApiError {
  const record = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : null;
  return {
    message: typeof record?.error === "string"
      ? record.error
      : `${fallback} (HTTP ${response.status})`,
    code: String(response.status),
    requestId: typeof record?.request_id === "string"
      ? record.request_id
      : response.headers.get("X-AfuChat-Request-Id") ?? undefined,
  };
}

export async function getAfuChatSavedPosts(): Promise<{
  data: AfuChatSavedPost[] | null;
  error: AfuChatApiError | null;
}> {
  try {
    const { response, data } = await afuChatApiJson<{ items?: unknown }>("/bookmarks");
    if (!response.ok) {
      return {
        data: null,
        error: bookmarkApiError(response, data, "Saved posts could not be loaded"),
      };
    }
    if (!Array.isArray(data?.items)) {
      return {
        data: null,
        error: { message: "Saved posts service returned an invalid response.", code: "INVALID_RESPONSE" },
      };
    }
    return { data: data.items as AfuChatSavedPost[], error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Saved posts service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function getAfuChatBookmarkStatus(postId: string): Promise<{
  data: boolean | null;
  error: AfuChatApiError | null;
}> {
  try {
    const { response, data } = await afuChatApiJson<{ bookmarked?: unknown }>(
      `/bookmarks?post_id=${encodeURIComponent(postId)}`,
    );
    if (!response.ok) {
      return {
        data: null,
        error: bookmarkApiError(response, data, "Bookmark status could not be loaded"),
      };
    }
    if (typeof data?.bookmarked !== "boolean") {
      return {
        data: null,
        error: { message: "Bookmark service returned an invalid response.", code: "INVALID_RESPONSE" },
      };
    }
    return { data: data.bookmarked, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Bookmark service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function getAfuChatBookmarkedPostIds(postIds: string[]): Promise<{
  data: { post_id: string }[] | null;
  error: AfuChatApiError | null;
}> {
  if (postIds.length === 0) return { data: [], error: null };
  try {
    const query = new URLSearchParams({ post_ids: postIds.join(",") });
    const { response, data } = await afuChatApiJson<{ post_ids?: unknown }>(
      `/bookmarks?${query.toString()}`,
    );
    if (!response.ok) {
      return {
        data: null,
        error: bookmarkApiError(response, data, "Bookmark status could not be loaded"),
      };
    }
    if (!Array.isArray(data?.post_ids) || !data.post_ids.every((id) => typeof id === "string")) {
      return {
        data: null,
        error: { message: "Bookmark service returned an invalid response.", code: "INVALID_RESPONSE" },
      };
    }
    return { data: data.post_ids.map((post_id) => ({ post_id })), error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Bookmark service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function setAfuChatBookmark(
  postId: string,
  bookmarked: boolean,
  expectedUserId?: string,
): Promise<{ error: AfuChatApiError | null }> {
  try {
    const expected = expectedUserId
      ? `&expected_user_id=${encodeURIComponent(expectedUserId)}`
      : "";
    const response = bookmarked
      ? await afuChatApiFetch("/bookmarks", {
          method: "POST",
          body: JSON.stringify({
            post_id: postId,
            ...(expectedUserId ? { expected_user_id: expectedUserId } : {}),
          }),
        })
      : await afuChatApiFetch(
          `/bookmarks?post_id=${encodeURIComponent(postId)}${expected}`,
          { method: "DELETE" },
        );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        error: bookmarkApiError(
          response,
          payload,
          bookmarked ? "Bookmark could not be saved" : "Bookmark could not be removed",
        ),
      };
    }
    const record = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : null;
    if (record?.bookmarked !== bookmarked) {
      return {
        error: { message: "Bookmark service returned an invalid response.", code: "INVALID_RESPONSE" },
      };
    }
    return { error: null };
  } catch (error) {
    return {
      error: {
        message: error instanceof Error ? error.message : "Bookmark service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export type AfuChatPostCreateInput = {
  content: string;
  image_url?: string | null;
  video_url?: string | null;
  visibility?: string | null;
  language_code?: string | null;
  post_type?: string | null;
  article_title?: string | null;
  article_body?: string | null;
  article_cover_url?: string | null;
  audio_name?: string | null;
  filter?: string | null;
  avatar_overlay?: string | null;
  overlay_metadata?: string | null;
  duet_of_post_id?: string | null;
  images?: string[];
};

export type AfuChatPostRecord = Record<string, unknown> & { id: string };

function postApiError(
  response: Response,
  payload: unknown,
  fallback: string,
): AfuChatApiError {
  const record = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : null;
  return {
    message: typeof record?.error === "string"
      ? record.error
      : `${fallback} (HTTP ${response.status})`,
    code: String(response.status),
    requestId: typeof record?.request_id === "string"
      ? record.request_id
      : response.headers.get("X-AfuChat-Request-Id") ?? undefined,
  };
}

async function postEndpointRequest<T>(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<{ data: T | null; error: AfuChatApiError | null }> {
  try {
    const response = await afuChatApiFetch(path, init);
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return { data: null, error: postApiError(response, payload, fallback) };
    }
    return { data: payload as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "AfuChat service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function getAfuChatPost(postId: string): Promise<{
  data: AfuChatPostRecord | null;
  error: AfuChatApiError | null;
}> {
  const result = await postEndpointRequest<{ post?: unknown }>(
    `/posts/${encodeURIComponent(postId)}`,
    { method: "GET" },
    "Post could not be loaded",
  );
  if (result.error) return { data: null, error: result.error };
  if (!result.data?.post || typeof result.data.post !== "object" ||
      typeof (result.data.post as Record<string, unknown>).id !== "string") {
    return {
      data: null,
      error: { message: "Post service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { data: result.data.post as AfuChatPostRecord, error: null };
}

export async function getAfuChatMyPosts(): Promise<{
  data: Record<string, unknown>[] | null;
  totalCount: number | null;
  error: AfuChatApiError | null;
}> {
  const result = await postEndpointRequest<{ items?: unknown; total_count?: unknown }>(
    "/posts/mine",
    { method: "GET" },
    "Your posts could not be loaded",
  );
  if (result.error) return { data: null, totalCount: null, error: result.error };
  if (!Array.isArray(result.data?.items) ||
      !Number.isSafeInteger(result.data.total_count) ||
      Number(result.data.total_count) < 0 ||
      !result.data.items.every((item) =>
        !!item && typeof item === "object" &&
        typeof (item as Record<string, unknown>).id === "string"
      )) {
    return {
      data: null,
      totalCount: null,
      error: { message: "Post service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return {
    data: result.data.items as Record<string, unknown>[],
    totalCount: Number(result.data.total_count),
    error: null,
  };
}

export async function getAfuChatProfilePosts(
  profileId: string,
  limit = 90,
): Promise<{
  data: AfuChatPostRecord[] | null;
  totalCount: number | null;
  error: AfuChatApiError | null;
}> {
  const params = new URLSearchParams({ limit: String(limit) });
  const result = await postEndpointRequest<{
    items?: unknown;
    total_count?: unknown;
  }>(
    `/posts/profile/${encodeURIComponent(profileId)}?${params.toString()}`,
    { method: "GET" },
    "The profile posts could not be loaded",
  );
  if (result.error) return { data: null, totalCount: null, error: result.error };
  if (
    !Array.isArray(result.data?.items) ||
    !Number.isSafeInteger(result.data.total_count) ||
    Number(result.data.total_count) < 0 ||
    !result.data.items.every((item) =>
      !!item && typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string"
    )
  ) {
    return {
      data: null,
      totalCount: null,
      error: { message: "Post service returned an invalid profile response.", code: "INVALID_RESPONSE" },
    };
  }
  return {
    data: result.data.items as AfuChatPostRecord[],
    totalCount: Number(result.data.total_count),
    error: null,
  };
}

export async function searchAfuChatPosts(input: {
  kind: "posts" | "videos";
  query?: string;
  sort?: "recent" | "popular";
  since?: string | null;
  limit?: number;
}): Promise<{
  data: AfuChatPostRecord[] | null;
  error: AfuChatApiError | null;
}> {
  const params = new URLSearchParams({
    kind: input.kind,
    sort: input.sort ?? "popular",
    limit: String(input.limit ?? 30),
  });
  if (input.query?.trim()) params.set("query", input.query.trim());
  if (input.since) params.set("since", input.since);
  const result = await postEndpointRequest<{ items?: unknown }>(
    `/posts/search?${params.toString()}`,
    { method: "GET" },
    "Posts could not be searched",
  );
  if (result.error) return { data: null, error: result.error };
  if (!Array.isArray(result.data?.items) ||
      !result.data.items.every((item) =>
        !!item && typeof item === "object" &&
        typeof (item as Record<string, unknown>).id === "string"
      )) {
    return {
      data: null,
      error: { message: "Post search returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { data: result.data.items as AfuChatPostRecord[], error: null };
}

export async function getAfuChatVideoFeed(input: {
  tab: "for_you" | "following";
  limit: number;
  olderThan?: string | null;
  expectedUserId?: string;
}): Promise<{
  data: Record<string, unknown>[] | null;
  error: AfuChatApiError | null;
}> {
  const params = new URLSearchParams({
    tab: input.tab,
    limit: String(input.limit),
  });
  if (input.olderThan) params.set("older_than", input.olderThan);
  if (input.expectedUserId) params.set("expected_user_id", input.expectedUserId);
  const result = await postEndpointRequest<{ items?: unknown }>(
    `/feed/videos?${params.toString()}`,
    { method: "GET" },
    "Video feed could not be loaded",
  );
  if (result.error) return { data: null, error: result.error };
  if (
    !Array.isArray(result.data?.items) ||
    !result.data.items.every((item) =>
      !!item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string" &&
      typeof (item as Record<string, unknown>).author_id === "string" &&
      typeof (item as Record<string, unknown>).created_at === "string"
    )
  ) {
    return {
      data: null,
      error: { message: "Video feed returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { data: result.data.items as Record<string, unknown>[], error: null };
}

export async function getAfuChatPostMetrics(postId: string): Promise<{
  data: { like_count: number; reply_count: number; view_count: number } | null;
  error: AfuChatApiError | null;
}> {
  const result = await postEndpointRequest<Record<string, unknown>>(
    `/posts/${encodeURIComponent(postId)}/metrics`,
    { method: "GET" },
    "Post activity could not be loaded",
  );
  if (result.error) return { data: null, error: result.error };
  const metrics = result.data;
  if (
    !metrics ||
    !Number.isSafeInteger(metrics.like_count) ||
    !Number.isSafeInteger(metrics.reply_count) ||
    !Number.isSafeInteger(metrics.view_count) ||
    Number(metrics.like_count) < 0 ||
    Number(metrics.reply_count) < 0 ||
    Number(metrics.view_count) < 0
  ) {
    return {
      data: null,
      error: { message: "Post activity returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return {
    data: {
      like_count: Number(metrics.like_count),
      reply_count: Number(metrics.reply_count),
      view_count: Number(metrics.view_count),
    },
    error: null,
  };
}

export async function getAfuChatTrendingHashtags(): Promise<{
  data: { tag: string; count: number }[] | null;
  error: AfuChatApiError | null;
}> {
  const result = await postEndpointRequest<{ items?: unknown }>(
    "/posts/trending/hashtags",
    { method: "GET" },
    "Trending hashtags could not be loaded",
  );
  if (result.error) return { data: null, error: result.error };
  if (!Array.isArray(result.data?.items) ||
      !result.data.items.every((item) =>
        !!item && typeof item === "object" &&
        typeof (item as Record<string, unknown>).tag === "string" &&
        Number.isSafeInteger((item as Record<string, unknown>).count)
      )) {
    return {
      data: null,
      error: { message: "Trending hashtag service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { data: result.data.items as { tag: string; count: number }[], error: null };
}

export type AfuChatDiscoverPerson = Record<string, unknown> & { id: string };

export async function getAfuChatDiscoverPeople(input: {
  mode: "suggested" | "active" | "directory" | "search" | "trending" | "mentions";
  expectedUserId?: string;
  query?: string;
  interest?: string;
  limit?: number;
  verifiedOnly?: boolean;
}): Promise<{
  data: AfuChatDiscoverPerson[] | null;
  error: AfuChatApiError | null;
}> {
  const params = new URLSearchParams({ mode: input.mode });
  if (input.expectedUserId) params.set("expected_user_id", input.expectedUserId);
  if (input.query !== undefined) params.set("query", input.query);
  if (input.interest && input.interest !== "All") {
    params.set("interest", input.interest.toLowerCase());
  }
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.verifiedOnly) params.set("verified_only", "true");
  const result = await postEndpointRequest<{ items?: unknown }>(
    `/discover/people?${params.toString()}`,
    { method: "GET" },
    "People could not be loaded",
  );
  if (result.error) return { data: null, error: result.error };
  if (
    !Array.isArray(result.data?.items) ||
    !result.data.items.every((item) =>
      !!item && typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string"
    )
  ) {
    return {
      data: null,
      error: { message: "People service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { data: result.data.items as AfuChatDiscoverPerson[], error: null };
}

export async function getAfuChatNearbyPeople(input: {
  latitude: number;
  longitude: number;
  radiusKm: number;
  expectedUserId: string;
}): Promise<{
  data: AfuChatDiscoverPerson[] | null;
  error: AfuChatApiError | null;
}> {
  const params = new URLSearchParams({
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    radius_km: String(input.radiusKm),
    expected_user_id: input.expectedUserId,
  });
  const result = await postEndpointRequest<{ items?: unknown }>(
    `/discover/nearby?${params.toString()}`,
    { method: "GET" },
    "Nearby people could not be loaded",
  );
  if (result.error) return { data: null, error: result.error };
  if (
    !Array.isArray(result.data?.items) ||
    !result.data.items.every((item) =>
      !!item && typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string"
    )
  ) {
    return {
      data: null,
      error: { message: "Nearby people returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { data: result.data.items as AfuChatDiscoverPerson[], error: null };
}

export async function saveAfuChatDiscoverLocation(input: {
  latitude: number;
  longitude: number;
  expectedUserId: string;
}): Promise<{
  updated: boolean | null;
  locationUpdatedAt: string | null;
  error: AfuChatApiError | null;
}> {
  const result = await postEndpointRequest<Record<string, unknown>>(
    "/discover/location",
    {
      method: "POST",
      body: JSON.stringify({
        latitude: input.latitude,
        longitude: input.longitude,
        expected_user_id: input.expectedUserId,
      }),
    },
    "The location could not be saved",
  );
  if (result.error) return { updated: null, locationUpdatedAt: null, error: result.error };
  if (typeof result.data?.updated !== "boolean") {
    return {
      updated: null,
      locationUpdatedAt: null,
      error: { message: "The location service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return {
    updated: result.data.updated,
    locationUpdatedAt: typeof result.data.location_updated_at === "string"
      ? result.data.location_updated_at
      : null,
    error: null,
  };
}

export async function setAfuChatDiscoverPresence(
  expectedUserId: string,
): Promise<{ error: AfuChatApiError | null }> {
  const result = await postEndpointRequest<{ updated?: unknown }>(
    "/discover/presence",
    {
      method: "POST",
      body: JSON.stringify({ expected_user_id: expectedUserId }),
    },
    "Presence could not be updated",
  );
  if (result.error) return { error: result.error };
  if (result.data?.updated !== true) {
    return {
      error: { message: "Presence service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { error: null };
}

export async function getAfuChatOrganizationPosts(input: {
  limit?: number;
  olderThan?: string | null;
  expectedUserId: string;
}): Promise<{
  data: AfuChatPostRecord[] | null;
  error: AfuChatApiError | null;
}> {
  const params = new URLSearchParams({
    limit: String(input.limit ?? 6),
    expected_user_id: input.expectedUserId,
  });
  if (input.olderThan) params.set("older_than", input.olderThan);
  const result = await postEndpointRequest<{ items?: unknown }>(
    `/feed/organization-posts?${params.toString()}`,
    { method: "GET" },
    "Organization posts could not be loaded",
  );
  if (result.error) return { data: null, error: result.error };
  if (
    !Array.isArray(result.data?.items) ||
    !result.data.items.every((item) =>
      !!item && typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string" &&
      typeof (item as Record<string, unknown>).author_id === "string" &&
      typeof (item as Record<string, unknown>).created_at === "string"
    )
  ) {
    return {
      data: null,
      error: {
        message: "Organization post service returned an invalid response.",
        code: "INVALID_RESPONSE",
      },
    };
  }
  return { data: result.data.items as AfuChatPostRecord[], error: null };
}

export async function createAfuChatPost(input: AfuChatPostCreateInput): Promise<{
  data: AfuChatPostRecord | null;
  error: AfuChatApiError | null;
}> {
  const result = await postEndpointRequest<{ post?: unknown }>(
    "/posts",
    { method: "POST", body: JSON.stringify(input) },
    "Post could not be created",
  );
  if (result.error) return { data: null, error: result.error };
  if (!result.data?.post || typeof result.data.post !== "object" ||
      typeof (result.data.post as Record<string, unknown>).id !== "string") {
    return {
      data: null,
      error: { message: "Post service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { data: result.data.post as AfuChatPostRecord, error: null };
}

export async function deleteAfuChatPost(postId: string): Promise<{
  error: AfuChatApiError | null;
}> {
  const result = await postEndpointRequest<{ ok?: unknown }>(
    `/posts/${encodeURIComponent(postId)}`,
    { method: "DELETE" },
    "Post could not be deleted",
  );
  if (result.error) return { error: result.error };
  if (result.data?.ok !== true) {
    return {
      error: { message: "Post service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { error: null };
}

export type AfuChatPostReplyCreateInput = {
  content: string;
  parent_reply_id?: string | null;
  voice_url?: string | null;
  voice_duration?: number | null;
  image_url?: string | null;
};

export type AfuChatPostReplyRecord = Record<string, unknown> & { id: string };

export async function getAfuChatPostReplies(postId: string): Promise<{
  data: AfuChatPostReplyRecord[] | null;
  error: AfuChatApiError | null;
}> {
  const result = await postEndpointRequest<{ items?: unknown }>(
    `/posts/${encodeURIComponent(postId)}/replies`,
    { method: "GET" },
    "Replies could not be loaded",
  );
  if (result.error) return { data: null, error: result.error };
  if (!Array.isArray(result.data?.items) ||
      !result.data.items.every((item) =>
        !!item && typeof item === "object" &&
        typeof (item as Record<string, unknown>).id === "string"
      )) {
    return {
      data: null,
      error: { message: "Replies service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { data: result.data.items as AfuChatPostReplyRecord[], error: null };
}

export async function createAfuChatPostReply(
  postId: string,
  input: AfuChatPostReplyCreateInput,
): Promise<{ data: AfuChatPostReplyRecord | null; error: AfuChatApiError | null }> {
  const result = await postEndpointRequest<{ reply?: unknown }>(
    `/posts/${encodeURIComponent(postId)}/replies`,
    { method: "POST", body: JSON.stringify(input) },
    "Reply could not be posted",
  );
  if (result.error) return { data: null, error: result.error };
  if (!result.data?.reply || typeof result.data.reply !== "object" ||
      typeof (result.data.reply as Record<string, unknown>).id !== "string") {
    return {
      data: null,
      error: { message: "Replies service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { data: result.data.reply as AfuChatPostReplyRecord, error: null };
}

async function setPostLike(
  path: string,
  liked: boolean,
  fallback: string,
  expectedUserId?: string,
  organizationPost = false,
): Promise<{ error: AfuChatApiError | null }> {
  const params = new URLSearchParams();
  if (expectedUserId) params.set("expected_user_id", expectedUserId);
  if (organizationPost) params.set("organization_post", "true");
  const query = params.toString();
  const requestPath = query ? `${path}?${query}` : path;
  const result = await postEndpointRequest<{ liked?: unknown }>(
    requestPath,
    { method: liked ? "POST" : "DELETE" },
    fallback,
  );
  if (result.error) return { error: result.error };
  if (result.data?.liked !== liked) {
    return {
      error: { message: "Like service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { error: null };
}

export function setAfuChatPostLike(
  postId: string,
  liked: boolean,
  expectedUserId?: string,
  organizationPost = false,
): Promise<{ error: AfuChatApiError | null }> {
  return setPostLike(
    `/posts/${encodeURIComponent(postId)}/like`,
    liked,
    liked ? "Post could not be liked" : "Post like could not be removed",
    expectedUserId,
    organizationPost,
  );
}

export function setAfuChatReplyLike(
  postId: string,
  replyId: string,
  liked: boolean,
  expectedUserId?: string,
): Promise<{ error: AfuChatApiError | null }> {
  return setPostLike(
    `/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}/like`,
    liked,
    liked ? "Reply could not be liked" : "Reply like could not be removed",
    expectedUserId,
  );
}

export type AfuChatForYouFeedQuery = {
  olderThan?: string | null;
  newerThan?: string | null;
  recentLimit?: number;
  excludeSelf?: boolean;
  recentSince?: string;
  midBefore?: string;
  midSince?: string;
  throwbackBefore?: string;
  midOffset?: number;
  throwbackOffset?: number;
  midExhausted?: boolean;
  throwbackExhausted?: boolean;
};

export async function getAfuChatForYouFeed(query: AfuChatForYouFeedQuery): Promise<{
  recent: AfuChatPostRecord[] | null;
  mid: AfuChatPostRecord[] | null;
  throwback: AfuChatPostRecord[] | null;
  error: AfuChatApiError | null;
}> {
  const params = new URLSearchParams();
  if (query.olderThan) params.set("older_than", query.olderThan);
  if (query.newerThan) params.set("newer_than", query.newerThan);
  if (query.recentLimit !== undefined) params.set("recent_limit", String(query.recentLimit));
  if (query.excludeSelf) params.set("exclude_self", "true");
  if (query.recentSince) params.set("recent_since", query.recentSince);
  if (query.midBefore) params.set("mid_before", query.midBefore);
  if (query.midSince) params.set("mid_since", query.midSince);
  if (query.throwbackBefore) params.set("throwback_before", query.throwbackBefore);
  if (query.midOffset !== undefined) params.set("mid_offset", String(query.midOffset));
  if (query.throwbackOffset !== undefined) params.set("throwback_offset", String(query.throwbackOffset));
  if (query.midExhausted !== undefined) params.set("mid_exhausted", String(query.midExhausted));
  if (query.throwbackExhausted !== undefined) {
    params.set("throwback_exhausted", String(query.throwbackExhausted));
  }
  const result = await postEndpointRequest<{
    recent?: unknown;
    mid?: unknown;
    throwback?: unknown;
  }>(`/feed/for-you?${params.toString()}`, { method: "GET" }, "Feed could not be loaded");
  if (result.error) return { recent: null, mid: null, throwback: null, error: result.error };
  const validItems = (value: unknown): value is AfuChatPostRecord[] =>
    Array.isArray(value) && value.every((item) =>
      !!item && typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string"
    );
  if (
    !validItems(result.data?.recent) ||
    !validItems(result.data?.mid) ||
    !validItems(result.data?.throwback)
  ) {
    return {
      recent: null,
      mid: null,
      throwback: null,
      error: { message: "Feed service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return {
    recent: result.data.recent,
    mid: result.data.mid,
    throwback: result.data.throwback,
    error: null,
  };
}

export async function getAfuChatFollowingFeed(query: {
  olderThan?: string | null;
  newerThan?: string | null;
  limit?: number;
}): Promise<{
  items: AfuChatPostRecord[] | null;
  followingIds: string[] | null;
  error: AfuChatApiError | null;
}> {
  const params = new URLSearchParams();
  if (query.olderThan) params.set("older_than", query.olderThan);
  if (query.newerThan) params.set("newer_than", query.newerThan);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const result = await postEndpointRequest<{
    items?: unknown;
    following_ids?: unknown;
  }>(`/feed/following?${params.toString()}`, { method: "GET" }, "Following feed could not be loaded");
  if (result.error) return { items: null, followingIds: null, error: result.error };
  if (!result.data) {
    return {
      items: null,
      followingIds: null,
      error: { message: "Feed service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  const validItems = Array.isArray(result.data?.items) && result.data.items.every((item) =>
    !!item && typeof item === "object" &&
    typeof (item as Record<string, unknown>).id === "string"
  );
  const validIds = Array.isArray(result.data?.following_ids) &&
    result.data.following_ids.every((id) => typeof id === "string");
  if (!validItems || !validIds) {
    return {
      items: null,
      followingIds: null,
      error: { message: "Feed service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return {
    items: result.data.items as AfuChatPostRecord[],
    followingIds: result.data.following_ids as string[],
    error: null,
  };
}

export async function recordAfuChatPostViews(
  postIds: string[],
  expectedUserId: string,
): Promise<{ error: AfuChatApiError | null }> {
  const ids = [...new Set(postIds)];
  if (ids.length > 100 || ids.some((id) => typeof id !== "string")) {
    return { error: { message: "The post view batch is invalid.", code: "INVALID_INPUT" } };
  }
  const result = await postEndpointRequest<{ recorded?: unknown }>(
    "/feed/views",
    {
      method: "POST",
      body: JSON.stringify({ post_ids: ids, expected_user_id: expectedUserId }),
    },
    "Post views could not be recorded",
  );
  if (result.error) return { error: result.error };
  if (result.data?.recorded !== true) {
    return {
      error: { message: "Feed service returned an invalid view response.", code: "INVALID_RESPONSE" },
    };
  }
  return { error: null };
}

export type AfuChatFollowProfile = {
  id: string;
  display_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  is_verified?: boolean | null;
  is_organization_verified?: boolean | null;
  is_business_mode?: boolean | null;
};

export type AfuChatFollowRecord = {
  follower_id: string;
  following_id: string;
  created_at: string;
  profile: AfuChatFollowProfile;
};

export type AfuChatFollowDirection = "followers" | "following";

export type AfuChatFollowSummary = {
  followers_count: number;
  following_count: number;
  follows_you: boolean;
  is_following: boolean;
};

type FollowEndpointError = {
  message?: unknown;
  error?: unknown;
  code?: unknown;
  request_id?: unknown;
};

function isFollowProfile(value: unknown): value is AfuChatFollowProfile {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).id === "string";
}

async function followEndpointError(
  response: Response,
  payload: FollowEndpointError | null,
  fallback: string,
): Promise<AfuChatApiError> {
  return {
    message: typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.error === "string"
      ? payload.error
      : `${fallback} (HTTP ${response.status})`,
    code: typeof payload?.code === "string" ? payload.code : String(response.status),
    requestId: typeof payload?.request_id === "string"
      ? payload.request_id
      : response.headers.get("X-AfuChat-Request-Id") ?? undefined,
  };
}

export async function getAfuChatFollowRecords(
  profileId: string,
  direction: AfuChatFollowDirection,
  limit = 30,
  offset = 0,
): Promise<{
  items: AfuChatFollowRecord[] | null;
  hidden: boolean;
  nextOffset: number | null;
  error: AfuChatApiError | null;
}> {
  try {
    const params = new URLSearchParams({
      profile_id: profileId,
      direction,
      limit: String(limit),
      offset: String(offset),
    });
    const { response, data } = await afuChatApiJson<{
      items?: unknown;
      hidden?: unknown;
      next_offset?: unknown;
      error?: unknown;
      code?: unknown;
      request_id?: unknown;
    }>(`/follows/list?${params.toString()}`);
    if (!response.ok) {
      return {
        items: null,
        hidden: false,
        nextOffset: null,
        error: await followEndpointError(response, data, "Follow list could not be loaded"),
      };
    }
    if (
      !Array.isArray(data?.items) ||
      typeof data.hidden !== "boolean" ||
      !data.items.every((item) =>
        !!item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).follower_id === "string" &&
        typeof (item as Record<string, unknown>).following_id === "string" &&
        typeof (item as Record<string, unknown>).created_at === "string" &&
        isFollowProfile((item as Record<string, unknown>).profile)
      ) ||
      (data.next_offset !== null && !Number.isSafeInteger(data.next_offset))
    ) {
      return {
        items: null,
        hidden: false,
        nextOffset: null,
        error: {
          message: "Follow service returned an invalid list response.",
          code: "INVALID_RESPONSE",
        },
      };
    }
    return {
      items: data.items as AfuChatFollowRecord[],
      hidden: data.hidden,
      nextOffset: typeof data.next_offset === "number" ? data.next_offset : null,
      error: null,
    };
  } catch (error) {
    return {
      items: null,
      hidden: false,
      nextOffset: null,
      error: {
        message: error instanceof Error ? error.message : "Follow service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function getAfuChatFollowIds(
  profileId: string,
  direction: AfuChatFollowDirection,
  maxItems = 1000,
): Promise<{ ids: string[] | null; hidden: boolean; error: AfuChatApiError | null }> {
  if (!Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > 5000) {
    return {
      ids: null,
      hidden: false,
      error: { message: "The follow-list limit is invalid.", code: "INVALID_INPUT" },
    };
  }
  const ids: string[] = [];
  let offset = 0;
  let hidden = false;
  try {
    while (ids.length < maxItems) {
      const limit = Math.min(100, maxItems - ids.length);
      const params = new URLSearchParams({
        profile_id: profileId,
        direction,
        limit: String(limit),
        offset: String(offset),
      });
      const { response, data } = await afuChatApiJson<{
        items?: unknown;
        hidden?: unknown;
        next_offset?: unknown;
        error?: unknown;
        code?: unknown;
        request_id?: unknown;
      }>(`/follows/ids?${params.toString()}`);
      if (!response.ok) {
        return {
          ids: null,
          hidden: false,
          error: await followEndpointError(response, data, "Follow IDs could not be loaded"),
        };
      }
      if (
        !Array.isArray(data?.items) ||
        !data.items.every((id) => typeof id === "string") ||
        typeof data.hidden !== "boolean" ||
        (data.next_offset !== null && !Number.isSafeInteger(data.next_offset))
      ) {
        return {
          ids: null,
          hidden: false,
          error: {
            message: "Follow service returned an invalid ID response.",
            code: "INVALID_RESPONSE",
          },
        };
      }
      hidden = data.hidden;
      ids.push(...data.items as string[]);
      if (hidden || data.next_offset === null || data.items.length === 0) break;
      offset = Number(data.next_offset);
    }
    return { ids, hidden, error: null };
  } catch (error) {
    return {
      ids: null,
      hidden: false,
      error: {
        message: error instanceof Error ? error.message : "Follow service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function getAfuChatFollowSummary(
  profileId: string,
): Promise<{ data: AfuChatFollowSummary | null; error: AfuChatApiError | null }> {
  try {
    const params = new URLSearchParams({ profile_id: profileId });
    const { response, data } = await afuChatApiJson<
      AfuChatFollowSummary & { error?: unknown; code?: unknown; request_id?: unknown }
    >(`/follows/summary?${params.toString()}`);
    if (!response.ok) {
      return {
        data: null,
        error: await followEndpointError(response, data, "Follow summary could not be loaded"),
      };
    }
    if (
      !Number.isSafeInteger(data?.followers_count) ||
      Number(data?.followers_count) < 0 ||
      !Number.isSafeInteger(data?.following_count) ||
      Number(data?.following_count) < 0 ||
      typeof data?.follows_you !== "boolean" ||
      typeof data?.is_following !== "boolean"
    ) {
      return {
        data: null,
        error: {
          message: "Follow service returned an invalid summary response.",
          code: "INVALID_RESPONSE",
        },
      };
    }
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Follow service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}

export async function getAfuChatFollowStatuses(userIds: string[]): Promise<{
  data: Map<string, { isFollowing: boolean; followsYou: boolean }> | null;
  error: AfuChatApiError | null;
}> {
  const ids = [...new Set(userIds)];
  if (ids.length > 500) {
    const combined = new Map<string, { isFollowing: boolean; followsYou: boolean }>();
    for (let index = 0; index < ids.length; index += 100) {
      const result = await getAfuChatFollowStatuses(ids.slice(index, index + 100));
      if (result.error || !result.data) return result;
      for (const [id, status] of result.data) combined.set(id, status);
    }
    return { data: combined, error: null };
  }
  const combined = new Map<string, { isFollowing: boolean; followsYou: boolean }>();
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    if (!batch.length) continue;
    try {
      const params = new URLSearchParams({ user_ids: batch.join(",") });
      const { response, data } = await afuChatApiJson<{
        items?: unknown;
        error?: unknown;
        code?: unknown;
        request_id?: unknown;
      }>(`/follows/status?${params.toString()}`);
      if (!response.ok) {
        return {
          data: null,
          error: await followEndpointError(response, data, "Follow status could not be loaded"),
        };
      }
      if (
        !Array.isArray(data?.items) ||
        !data.items.every((item) =>
          !!item &&
          typeof item === "object" &&
          typeof (item as Record<string, unknown>).user_id === "string" &&
          typeof (item as Record<string, unknown>).is_following === "boolean" &&
          typeof (item as Record<string, unknown>).follows_you === "boolean"
        )
      ) {
        return {
          data: null,
          error: {
            message: "Follow service returned an invalid status response.",
            code: "INVALID_RESPONSE",
          },
        };
      }
      for (const item of data.items as Array<{
        user_id: string;
        is_following: boolean;
        follows_you: boolean;
      }>) {
        combined.set(item.user_id, {
          isFollowing: item.is_following,
          followsYou: item.follows_you,
        });
      }
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Follow service is unavailable.",
          code: "NETWORK_ERROR",
        },
      };
    }
  }
  return { data: combined, error: null };
}

export async function setAfuChatFollow(
  targetUserId: string,
  following: boolean,
  expectedUserId?: string,
): Promise<{ error: AfuChatApiError | null }> {
  try {
    const { response, data } = following
      ? await afuChatApiJson<{
          is_following?: unknown;
          target_user_id?: unknown;
          error?: unknown;
          code?: unknown;
          request_id?: unknown;
        }>("/follows", {
          target_user_id: targetUserId,
          ...(expectedUserId ? { expected_user_id: expectedUserId } : {}),
        })
      : await (async () => {
          const params = new URLSearchParams({ target_user_id: targetUserId });
          if (expectedUserId) params.set("expected_user_id", expectedUserId);
          const response = await afuChatApiFetch(`/follows?${params.toString()}`, {
            method: "DELETE",
          });
          return {
            response,
            data: await response.json().catch(() => null) as {
              is_following?: unknown;
              target_user_id?: unknown;
              error?: unknown;
              code?: unknown;
              request_id?: unknown;
            } | null,
          };
        })();
    if (!response.ok) {
      return {
        error: await followEndpointError(response, data, "Follow status could not be updated"),
      };
    }
    if (data?.is_following !== following || data.target_user_id !== targetUserId) {
      return {
        error: {
          message: "Follow service returned an invalid mutation response.",
          code: "INVALID_RESPONSE",
        },
      };
    }
    return { error: null };
  } catch (error) {
    return {
      error: {
        message: error instanceof Error ? error.message : "Follow service is unavailable.",
        code: "NETWORK_ERROR",
      },
    };
  }
}