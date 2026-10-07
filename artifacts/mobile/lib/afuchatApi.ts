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