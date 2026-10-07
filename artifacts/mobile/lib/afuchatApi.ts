import { AFUCHAT_API_URL } from "./env";
import { supabase } from "./supabase";

export interface AfuChatApiError {
  message: string;
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