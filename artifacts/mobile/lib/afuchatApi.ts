import { AFUCHAT_API_URL } from "./env";
import { supabase } from "./supabase";

export interface AfuChatApiError {
  message: string;
  code?: string;
  requestId?: string;
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
  return fetch(`${AFUCHAT_API_URL}/v1/chat${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });
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
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : `Chat request failed (HTTP ${response.status})`;
      return { data: null, error: { message } };
    }
    if (!Array.isArray(payload)) {
      return { data: null, error: { message: "Chat service returned an invalid response" } };
    }
    return { data: payload, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Chat service is unavailable",
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
  error: AfuChatApiError | null;
}> {
  const result = await postEndpointRequest<{ items?: unknown }>(
    "/posts/mine",
    { method: "GET" },
    "Your posts could not be loaded",
  );
  if (result.error) return { data: null, error: result.error };
  if (!Array.isArray(result.data?.items) ||
      !result.data.items.every((item) =>
        !!item && typeof item === "object" &&
        typeof (item as Record<string, unknown>).id === "string"
      )) {
    return {
      data: null,
      error: { message: "Post service returned an invalid response.", code: "INVALID_RESPONSE" },
    };
  }
  return { data: result.data.items as Record<string, unknown>[], error: null };
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
): Promise<{ error: AfuChatApiError | null }> {
  const result = await postEndpointRequest<{ liked?: unknown }>(
    path,
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
): Promise<{ error: AfuChatApiError | null }> {
  return setPostLike(
    `/posts/${encodeURIComponent(postId)}/like`,
    liked,
    liked ? "Post could not be liked" : "Post like could not be removed",
  );
}

export function setAfuChatReplyLike(
  postId: string,
  replyId: string,
  liked: boolean,
): Promise<{ error: AfuChatApiError | null }> {
  return setPostLike(
    `/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}/like`,
    liked,
    liked ? "Reply could not be liked" : "Reply like could not be removed",
  );
}