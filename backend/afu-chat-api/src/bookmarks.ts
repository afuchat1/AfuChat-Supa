import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const PREFIX = "/v1/chat/bookmarks";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH_SIZE = 100;

type BookmarkRow = { post_id: string; created_at: string };
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
  relation: string,
  query: Record<string, string>,
): URL {
  const url = new URL(`/rest/v1/${relation}`, base);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}

async function restFetch(
  url: URL,
  method: "GET" | "POST" | "DELETE",
  session: VerifiedSession,
  anonKey: string,
  body?: unknown,
): Promise<Response> {
  const headers = new Headers({
    apikey: anonKey,
    Authorization: `Bearer ${session.token}`,
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (method !== "GET") headers.set("Prefer", "return=representation");

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

async function readRestRows<T>(
  response: Response,
  requestId: string,
): Promise<T[] | RestFailure> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload && typeof payload === "object" &&
        typeof (payload as Record<string, unknown>).code === "string"
      ? (payload as Record<string, string>).code
      : undefined;
    console.error("[afuchat-api] bookmark database request failed", {
      requestId,
      status: response.status,
      code,
    });
    return { response, code };
  }
  if (!Array.isArray(payload)) {
    console.error("[afuchat-api] bookmark database response was invalid", { requestId });
    return { response: new Response(null, { status: 502 }) };
  }
  return payload as T[];
}

function isRestFailure(value: unknown): value is RestFailure {
  return !!value && typeof value === "object" && "response" in value;
}

function parseUuidList(raw: string | null): string[] | null {
  if (!raw) return null;
  const ids = [...new Set(raw.split(",").map((id) => id.trim()))];
  if (ids.length === 0 || ids.length > MAX_BATCH_SIZE || ids.some((id) => !UUID_PATTERN.test(id))) {
    return null;
  }
  return ids;
}

function expectedOwnerMatches(
  request: Request,
  session: VerifiedSession,
): boolean | null {
  const url = new URL(request.url);
  const expected = request.method === "GET" || request.method === "DELETE"
    ? url.searchParams.get("expected_user_id")
    : null;
  if (expected === null) return true;
  if (!UUID_PATTERN.test(expected)) return null;
  return expected === session.user.id;
}

async function readBookmarkRows(
  base: string,
  anonKey: string,
  session: VerifiedSession,
  postIds: string[],
  requestId: string,
): Promise<BookmarkRow[] | RestFailure> {
  if (postIds.length === 0) return [];
  const url = makeRestUrl(base, "post_bookmarks", {
    select: "post_id,created_at",
    user_id: `eq.${session.user.id}`,
    post_id: `in.(${postIds.join(",")})`,
    limit: String(MAX_BATCH_SIZE),
  });
  const response = await restFetch(url, "GET", session, anonKey);
  return readRestRows<BookmarkRow>(response, requestId);
}

async function loadSavedPosts(
  request: Request,
  requestId: string,
  base: string,
  anonKey: string,
  session: VerifiedSession,
): Promise<Response> {
  const savedUrl = makeRestUrl(base, "post_bookmarks", {
    select: "post_id,created_at",
    user_id: `eq.${session.user.id}`,
    order: "created_at.desc",
    limit: "50",
  });
  const savedResponse = await restFetch(savedUrl, "GET", session, anonKey);
  const savedRows = await readRestRows<BookmarkRow>(savedResponse, requestId);
  if (isRestFailure(savedRows)) {
    return errorResponse(request, requestId, "Saved posts could not be loaded.", 502);
  }

  const postIds = savedRows.map((row) => row.post_id).filter((id) => UUID_PATTERN.test(id));
  const uniquePostIds = [...new Set(postIds)];
  if (uniquePostIds.length === 0) {
    return privateJsonResponse(request, requestId, { items: [] }, 200);
  }

  const postUrl = makeRestUrl(base, "posts", {
    select: "id,author_id,content,image_url,created_at",
    id: `in.(${uniquePostIds.join(",")})`,
    limit: String(MAX_BATCH_SIZE),
  });
  const postResponse = await restFetch(postUrl, "GET", session, anonKey);
  const posts = await readRestRows<Record<string, unknown>>(postResponse, requestId);
  if (isRestFailure(posts)) {
    return errorResponse(request, requestId, "Saved posts could not be loaded.", 502);
  }

  const authorIds = [...new Set(
    posts.map((post) => post.author_id).filter(
      (id): id is string => typeof id === "string" && UUID_PATTERN.test(id),
    ),
  )];
  let profiles: Record<string, unknown>[] = [];
  if (authorIds.length > 0) {
    const profileUrl = makeRestUrl(base, "profiles", {
      select: "id,handle,display_name,avatar_url,is_verified",
      id: `in.(${authorIds.join(",")})`,
      limit: String(MAX_BATCH_SIZE),
    });
    const profileResponse = await restFetch(profileUrl, "GET", session, anonKey);
    const profileRows = await readRestRows<Record<string, unknown>>(profileResponse, requestId);
    if (isRestFailure(profileRows)) {
      return errorResponse(request, requestId, "Saved posts could not be loaded.", 502);
    }
    profiles = profileRows;
  }

  const postById = new Map(posts.map((post) => [String(post.id), post]));
  const profileById = new Map(profiles.map((profile) => [String(profile.id), profile]));
  const items = savedRows.map((saved) => {
    const post = postById.get(saved.post_id);
    const author = post && typeof post.author_id === "string"
      ? profileById.get(post.author_id) ?? null
      : null;
    return {
      id: saved.post_id,
      post_id: saved.post_id,
      saved_at: saved.created_at,
      post: post
        ? {
            id: String(post.id),
            content: typeof post.content === "string" ? post.content : "",
            media_url: typeof post.image_url === "string" ? post.image_url : null,
            created_at: typeof post.created_at === "string" ? post.created_at : saved.created_at,
            author: author
              ? {
                  handle: typeof author.handle === "string" ? author.handle : "",
                  display_name: typeof author.display_name === "string" ? author.display_name : "",
                  avatar_url: typeof author.avatar_url === "string" ? author.avatar_url : null,
                  is_verified: author.is_verified === true,
                }
              : null,
          }
        : null,
    };
  });

  return privateJsonResponse(request, requestId, { items }, 200);
}

export async function handleBookmarks(
  request: Request,
  env: Env,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    const response = errorResponse(request, requestId, "Method not allowed", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, POST, DELETE, OPTIONS");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const verification = await verifySharedSession(request, env, requestId);
  if (!verification.session) return verification.response;
  const session = verification.session;

  const expectedOwner = expectedOwnerMatches(request, session);
  if (expectedOwner === null) {
    return errorResponse(request, requestId, "Invalid expected user ID.", 400);
  }
  if (!expectedOwner) {
    return errorResponse(request, requestId, "The active session does not match this action.", 409);
  }

  const supabase = supabaseConfig(env);
  if (!supabase) {
    return errorResponse(request, requestId, "Saved posts are temporarily unavailable.", 503);
  }

  const url = new URL(request.url);
  if (request.method === "GET") {
    const postId = url.searchParams.get("post_id");
    const rawPostIds = url.searchParams.get("post_ids");
    if (postId && rawPostIds) {
      return errorResponse(request, requestId, "Use either post_id or post_ids.", 400);
    }
    if (postId) {
      if (!UUID_PATTERN.test(postId)) {
        return errorResponse(request, requestId, "Invalid post ID.", 400);
      }
      const rows = await readBookmarkRows(
        supabase.url,
        supabase.anonKey,
        session,
        [postId],
        requestId,
      );
      if (isRestFailure(rows)) {
        return errorResponse(request, requestId, "Bookmark status could not be loaded.", 502);
      }
      return privateJsonResponse(
        request,
        requestId,
        { bookmarked: rows.some((row) => row.post_id === postId) },
        200,
      );
    }
    if (rawPostIds !== null) {
      const postIds = parseUuidList(rawPostIds);
      if (!postIds) return errorResponse(request, requestId, "Invalid post IDs.", 400);
      const rows = await readBookmarkRows(
        supabase.url,
        supabase.anonKey,
        session,
        postIds,
        requestId,
      );
      if (isRestFailure(rows)) {
        return errorResponse(request, requestId, "Bookmark status could not be loaded.", 502);
      }
      return privateJsonResponse(
        request,
        requestId,
        { post_ids: rows.map((row) => row.post_id) },
        200,
      );
    }
    return loadSavedPosts(request, requestId, supabase.url, supabase.anonKey, session);
  }

  if (request.method === "POST") {
    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > 2048) {
      return errorResponse(request, requestId, "Invalid bookmark request.", 400);
    }
    let payload: unknown;
    try {
      const text = await request.text();
      if (text.length > 2048) return errorResponse(request, requestId, "Invalid bookmark request.", 400);
      payload = JSON.parse(text);
    } catch {
      return errorResponse(request, requestId, "Invalid bookmark request.", 400);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return errorResponse(request, requestId, "Invalid bookmark request.", 400);
    }
    const body = payload as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["post_id", "expected_user_id"].includes(key))) {
      return errorResponse(request, requestId, "Invalid bookmark request.", 400);
    }
    if (
      typeof body.expected_user_id === "string" &&
      body.expected_user_id.toLowerCase() !== session.user.id.toLowerCase()
    ) {
      return errorResponse(request, requestId, "The active session does not match this action.", 409);
    }
    if (body.expected_user_id !== undefined && typeof body.expected_user_id !== "string") {
      return errorResponse(request, requestId, "Invalid expected user ID.", 400);
    }
    if (typeof body.post_id !== "string" || !UUID_PATTERN.test(body.post_id)) {
      return errorResponse(request, requestId, "Invalid post ID.", 400);
    }

    const existing = await readBookmarkRows(
      supabase.url,
      supabase.anonKey,
      session,
      [body.post_id],
      requestId,
    );
    if (isRestFailure(existing)) {
      return errorResponse(request, requestId, "Bookmark could not be saved.", 502);
    }
    if (existing.some((row) => row.post_id === body.post_id)) {
      return privateJsonResponse(request, requestId, { bookmarked: true }, 200);
    }

    const insertUrl = makeRestUrl(supabase.url, "post_bookmarks", {});
    let insertResponse: Response;
    try {
      insertResponse = await restFetch(
        insertUrl,
        "POST",
        session,
        supabase.anonKey,
        { post_id: body.post_id, user_id: session.user.id },
      );
    } catch {
      return errorResponse(request, requestId, "Bookmark could not be saved.", 502);
    }
    if (insertResponse.ok) {
      return privateJsonResponse(request, requestId, { bookmarked: true }, 200);
    }
    const insertPayload = await insertResponse.json().catch(() => null) as {
      code?: unknown;
    } | null;
    if (insertResponse.status === 409 || insertPayload?.code === "23505") {
      const raced = await readBookmarkRows(
        supabase.url,
        supabase.anonKey,
        session,
        [body.post_id],
        requestId,
      );
      if (!isRestFailure(raced) && raced.some((row) => row.post_id === body.post_id)) {
        return privateJsonResponse(request, requestId, { bookmarked: true }, 200);
      }
    }
    console.error("[afuchat-api] bookmark insert failed", {
      requestId,
      status: insertResponse.status,
      code: typeof insertPayload?.code === "string" ? insertPayload.code : undefined,
    });
    return errorResponse(request, requestId, "Bookmark could not be saved.", 502);
  }

  const postId = url.searchParams.get("post_id");
  if (!postId || !UUID_PATTERN.test(postId)) {
    return errorResponse(request, requestId, "Invalid post ID.", 400);
  }
  const deleteUrl = makeRestUrl(supabase.url, "post_bookmarks", {
    post_id: `eq.${postId}`,
    user_id: `eq.${session.user.id}`,
  });
  try {
    const response = await restFetch(deleteUrl, "DELETE", session, supabase.anonKey);
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      console.error("[afuchat-api] bookmark delete failed", {
        requestId,
        status: response.status,
      });
      return errorResponse(request, requestId, "Bookmark could not be removed.", 502);
    }
    await response.body?.cancel().catch(() => {});
    return privateJsonResponse(request, requestId, { bookmarked: false }, 200);
  } catch {
    return errorResponse(request, requestId, "Bookmark could not be removed.", 502);
  }
}
