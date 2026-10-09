import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POST_FIELDS =
  "id,author_id,content,image_url,created_at,view_count,like_count,visibility,language_code,post_type,article_title,article_body,video_url,video_asset_id";
const PROFILE_FIELDS =
  "id,display_name,handle,avatar_url,bio,is_verified,is_organization_verified,country,interests,hide_posts_non_followers";
const MAX_FOLLOWING_IDS = 1000;
const MAX_FEED_PAGE_SIZE = 60;
const MAX_OFFSET = 10_000;

type FilterValue = string | string[];
type RestResult<T> = { ok: true; data: T } | { ok: false; response: Response; code?: string };

function errorResponse(
  request: Request,
  requestId: string,
  error: string,
  status: number,
): Response {
  return privateJsonResponse(request, requestId, { error, request_id: requestId }, status);
}

function makeUrl(base: string, relation: string, filters: Record<string, FilterValue>): URL {
  const url = new URL(`/rest/v1/${relation}`, base);
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function restHeaders(session: VerifiedSession, anonKey: string, schema = "afuchat"): Headers {
  return new Headers({
    apikey: anonKey,
    Authorization: `Bearer ${session.token}`,
    Accept: "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
  });
}

async function restRows(
  url: URL,
  session: VerifiedSession,
  anonKey: string,
  schema = "afuchat",
): Promise<RestResult<Record<string, unknown>[]>> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: restHeaders(session, anonKey, schema),
      redirect: "manual",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload && typeof payload === "object" &&
          typeof (payload as Record<string, unknown>).code === "string"
        ? String((payload as Record<string, unknown>).code)
        : undefined;
      return { ok: false, response, code };
    }
    if (!Array.isArray(payload)) {
      return { ok: false, response: new Response(null, { status: 502 }) };
    }
    return { ok: true, data: payload as Record<string, unknown>[] };
  } catch {
    return { ok: false, response: new Response(null, { status: 502 }) };
  }
}

function logFailure(label: string, requestId: string, result: RestResult<unknown>): void {
  if (!result.ok) {
    console.error(`[afuchat-api] ${label} failed`, {
      requestId,
      status: result.response.status,
      code: result.code,
    });
  }
}

async function loadSession(
  request: Request,
  env: Env,
  requestId: string,
): Promise<
  | { ok: true; session: VerifiedSession; base: string; anonKey: string }
  | { ok: false; response: Response }
> {
  const verification = await verifySharedSession(request, env, requestId);
  if (!verification.session) return { ok: false, response: verification.response };
  const config = supabaseConfig(env);
  if (!config) {
    return {
      ok: false,
      response: errorResponse(request, requestId, "This request is temporarily unavailable.", 503),
    };
  }
  return {
    ok: true,
    session: verification.session,
    base: config.url,
    anonKey: config.anonKey,
  };
}

function readDate(value: string | null, name: string): string | null | false {
  if (value === null || value === "") return null;
  if (value.length > 64 || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString();
}

function readInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function inFilter(ids: string[]): string {
  return `in.(${ids.join(",")})`;
}

async function hydratePosts(
  request: Request,
  requestId: string,
  session: VerifiedSession,
  base: string,
  anonKey: string,
  streams: Record<string, Record<string, unknown>[]>,
  followingMode: boolean,
): Promise<{ data: Record<string, unknown>[] | null; response: Response | null }> {
  const allPosts = Object.values(streams).flat();
  const postIds = [...new Set(allPosts
    .map((post) => post.id)
    .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
  const authorIds = [...new Set(allPosts
    .map((post) => post.author_id)
    .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
  if (!postIds.length) return { data: [], response: null };

  const postFilter = inFilter(postIds);
  const authorFilter = inFilter(authorIds);
  const ownId = session.user.id;
  const videoAssetIds = [...new Set(allPosts
    .map((post) => post.video_asset_id)
    .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
  const [profiles, images, assets, likes, replies, follows, authorPosts] = await Promise.all([
    restRows(
      makeUrl(base, "profiles", { select: PROFILE_FIELDS, id: authorFilter }),
      session,
      anonKey,
      "accounts",
    ),
    restRows(
      makeUrl(base, "post_images", {
        select: "post_id,image_url,display_order",
        post_id: postFilter,
        order: "display_order.asc",
      }),
      session,
      anonKey,
    ),
    videoAssetIds.length
      ? restRows(
          makeUrl(base, "video_assets", {
            select: "id,duration_seconds",
            id: inFilter(videoAssetIds),
          }),
          session,
          anonKey,
        )
      : Promise.resolve({ ok: true as const, data: [] as Record<string, unknown>[] }),
    restRows(
      makeUrl(base, "post_acknowledgments", {
        select: "post_id",
        post_id: postFilter,
        user_id: `eq.${ownId}`,
        limit: String(postIds.length),
      }),
      session,
      anonKey,
    ),
    restRows(
      makeUrl(base, "post_replies", {
        select: "post_id",
        post_id: postFilter,
        limit: String(Math.min(1000, postIds.length * 3)),
      }),
      session,
      anonKey,
    ),
    restRows(
      makeUrl(base, "follows", {
        select: "following_id",
        follower_id: `eq.${ownId}`,
        following_id: authorFilter,
      }),
      session,
      anonKey,
    ),
    followingMode
      ? Promise.resolve({ ok: true as const, data: [] as Record<string, unknown>[] })
      : restRows(
          makeUrl(base, "posts", {
            select: "id,author_id",
            author_id: authorFilter,
            limit: "500",
          }),
          session,
          anonKey,
        ),
  ]);

  const initialResults = [profiles, images, assets, likes, replies, follows, authorPosts];
  const failed = initialResults.find((result) => !result.ok);
  if (failed && !failed.ok) {
    logFailure("feed hydration query", requestId, failed);
    return {
      data: null,
      response: errorResponse(request, requestId, "The feed could not be loaded.", 502),
    };
  }
  if (
    !profiles.ok || !images.ok || !assets.ok || !likes.ok ||
    !replies.ok || !follows.ok || !authorPosts.ok
  ) {
    return {
      data: null,
      response: errorResponse(request, requestId, "The feed could not be loaded.", 502),
    };
  }

  const authorPostIds = [...new Set(authorPosts.data
    .map((post) => post.id)
    .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
  let authorLikes: Record<string, unknown>[] = [];
  let authorReplies: Record<string, unknown>[] = [];
  if (!followingMode && authorPostIds.length) {
    const [authorLikesResult, authorRepliesResult] = await Promise.all([
      restRows(
        makeUrl(base, "post_acknowledgments", {
          select: "post_id",
          user_id: `eq.${ownId}`,
          post_id: inFilter(authorPostIds),
          limit: "100",
        }),
        session,
        anonKey,
      ),
      restRows(
        makeUrl(base, "post_replies", {
          select: "post_id",
          author_id: `eq.${ownId}`,
          post_id: inFilter(authorPostIds),
          limit: "100",
        }),
        session,
        anonKey,
      ),
    ]);
    if (!authorLikesResult.ok || !authorRepliesResult.ok) {
      const failedResult = !authorLikesResult.ok ? authorLikesResult : authorRepliesResult;
      logFailure("feed author interaction query", requestId, failedResult);
      return {
        data: null,
        response: errorResponse(request, requestId, "The feed could not be loaded.", 502),
      };
    }
    authorLikes = authorLikesResult.data;
    authorReplies = authorRepliesResult.data;
  }

  const profileById = new Map(profiles.data
    .filter((profile) => typeof profile.id === "string")
    .map((profile) => [String(profile.id), profile]));
  const imagesByPost = new Map<string, Record<string, unknown>[]>();
  for (const image of images.data) {
    if (typeof image.post_id !== "string") continue;
    const current = imagesByPost.get(image.post_id) ?? [];
    current.push(image);
    imagesByPost.set(image.post_id, current);
  }
  const assetById = new Map(assets.data
    .filter((asset) => typeof asset.id === "string")
    .map((asset) => [String(asset.id), asset]));
  const likedIds = new Set(likes.data
    .map((like) => like.post_id)
    .filter((id): id is string => typeof id === "string"));
  const followingIds = new Set(follows.data
    .map((follow) => follow.following_id)
    .filter((id): id is string => typeof id === "string"));
  const replyCounts = new Map<string, number>();
  for (const reply of replies.data) {
    if (typeof reply.post_id === "string") {
      replyCounts.set(reply.post_id, (replyCounts.get(reply.post_id) ?? 0) + 1);
    }
  }
  const authorByPostId = new Map(authorPosts.data
    .filter((post) => typeof post.id === "string" && typeof post.author_id === "string")
    .map((post) => [String(post.id), String(post.author_id)]));
  const authorInteractionCounts = new Map<string, number>();
  for (const like of authorLikes) {
    const authorId = typeof like.post_id === "string" ? authorByPostId.get(like.post_id) : undefined;
    if (authorId) authorInteractionCounts.set(authorId, (authorInteractionCounts.get(authorId) ?? 0) + 1);
  }
  for (const reply of authorReplies) {
    const authorId = typeof reply.post_id === "string" ? authorByPostId.get(reply.post_id) : undefined;
    if (authorId) authorInteractionCounts.set(authorId, (authorInteractionCounts.get(authorId) ?? 0) + 2);
  }

  const hydratedStreams: Record<string, Record<string, unknown>[]> = {};
  for (const [streamName, posts] of Object.entries(streams)) {
    hydratedStreams[streamName] = posts.map((post) => {
      const postId = String(post.id);
      const authorId = String(post.author_id);
      const videoAssetId = typeof post.video_asset_id === "string" ? post.video_asset_id : "";
      const author = profileById.get(authorId) ?? null;
      return {
        ...post,
        profiles: author,
        post_images: imagesByPost.get(postId) ?? [],
        video_assets: videoAssetId ? assetById.get(videoAssetId) ?? null : null,
        liked: likedIds.has(postId),
        replyCount: replyCounts.get(postId) ?? 0,
        isFollowing: followingMode || followingIds.has(authorId),
        authorInteractionCount: authorInteractionCounts.get(authorId) ?? 0,
      };
    });
  }
  return { data: Object.values(hydratedStreams).flat(), response: null };
}

export async function handleDiscoverFeed(
  request: Request,
  env: Env,
  mode: "for-you" | "following",
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  const auth = await loadSession(request, env, requestId);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const olderThan = readDate(params.get("older_than"), "older_than");
  const newerThan = readDate(params.get("newer_than"), "newer_than");
  if (olderThan === false || newerThan === false) {
    return errorResponse(request, requestId, "The feed cursor is invalid.", 400);
  }

  let streams: Record<string, Record<string, unknown>[]>;
  let followingIds: string[] = [];
  if (mode === "following") {
    const limit = readInteger(params.get("limit"), 30, 1, MAX_FEED_PAGE_SIZE);
    if (limit === null) return errorResponse(request, requestId, "The feed limit is invalid.", 400);
    const followResult = await restRows(
      makeUrl(auth.base, "follows", {
        select: "following_id",
        follower_id: `eq.${auth.session.user.id}`,
        limit: String(MAX_FOLLOWING_IDS),
      }),
      auth.session,
      auth.anonKey,
    );
    if (!followResult.ok) {
      logFailure("following feed IDs query", requestId, followResult);
      return errorResponse(request, requestId, "The feed could not be loaded.", 502);
    }
    followingIds = [...new Set(followResult.data
      .map((row) => row.following_id)
      .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
    if (!followingIds.length) {
      return privateJsonResponse(request, requestId, { items: [], following_ids: [] }, 200);
    }
    const filters: Record<string, FilterValue> = {
      select: POST_FIELDS,
      author_id: inFilter(followingIds),
      visibility: "in.(public,followers)",
      order: "created_at.desc",
      limit: String(limit),
    };
    if (olderThan) filters.created_at = `lt.${olderThan}`;
    else if (newerThan) filters.created_at = `gt.${newerThan}`;
    const postsResult = await restRows(makeUrl(auth.base, "posts", filters), auth.session, auth.anonKey);
    if (!postsResult.ok) {
      logFailure("following feed posts query", requestId, postsResult);
      return errorResponse(request, requestId, "The feed could not be loaded.", 502);
    }
    streams = { items: postsResult.data };
  } else {
    const recentSince = readDate(params.get("recent_since"), "recent_since");
    const midBefore = readDate(params.get("mid_before"), "mid_before");
    const midSince = readDate(params.get("mid_since"), "mid_since");
    const throwbackBefore = readDate(params.get("throwback_before"), "throwback_before");
    const midOffset = readInteger(params.get("mid_offset"), 0, 0, MAX_OFFSET);
    const throwbackOffset = readInteger(params.get("throwback_offset"), 0, 0, MAX_OFFSET);
    const recentLimit = readInteger(params.get("recent_limit"), 12, 1, 30);
    const midExhausted = params.get("mid_exhausted") === "true";
    const throwbackExhausted = params.get("throwback_exhausted") === "true";
    if (
      recentSince === false || midBefore === false || midSince === false ||
      throwbackBefore === false || midOffset === null || throwbackOffset === null ||
      recentLimit === null
    ) {
      return errorResponse(request, requestId, "The feed query is invalid.", 400);
    }
    const now = Date.now();
    const fourDaysAgo = recentSince ?? new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = midSince ?? new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const filters: Record<string, FilterValue> = {
      select: POST_FIELDS,
      visibility: "eq.public",
      order: "created_at.desc",
      limit: String(recentLimit),
    };
    if (olderThan) filters.created_at = `lt.${olderThan}`;
    else if (newerThan) filters.created_at = `gt.${newerThan}`;
    else filters.created_at = `gte.${fourDaysAgo}`;
    if (params.get("exclude_self") === "true") {
      filters.author_id = `neq.${auth.session.user.id}`;
    }
    const recentPromise = restRows(makeUrl(auth.base, "posts", filters), auth.session, auth.anonKey);

    const shouldLoadOlderStreams = !olderThan;
    const midPromise = !shouldLoadOlderStreams || midExhausted
      ? Promise.resolve({ ok: true as const, data: [] as Record<string, unknown>[] })
      : restRows(
          makeUrl(auth.base, "posts", {
            select: POST_FIELDS,
            visibility: "eq.public",
            created_at: [`lt.${midBefore ?? fourDaysAgo}`, `gte.${thirtyDaysAgo}`],
            order: "view_count.desc",
            offset: String(midOffset),
            limit: "10",
          }),
          auth.session,
          auth.anonKey,
        );
    const throwbackPromise = !shouldLoadOlderStreams || throwbackExhausted
      ? Promise.resolve({ ok: true as const, data: [] as Record<string, unknown>[] })
      : restRows(
          makeUrl(auth.base, "posts", {
            select: POST_FIELDS,
            visibility: "eq.public",
            created_at: `lt.${throwbackBefore ?? thirtyDaysAgo}`,
            order: "view_count.desc",
            offset: String(throwbackOffset),
            limit: "8",
          }),
          auth.session,
          auth.anonKey,
        );
    const [recent, mid, throwback] = await Promise.all([recentPromise, midPromise, throwbackPromise]);
    const failed = [recent, mid, throwback].find((result) => !result.ok);
    if (failed && !failed.ok) {
      logFailure("for-you feed query", requestId, failed);
      return errorResponse(request, requestId, "The feed could not be loaded.", 502);
    }
    if (!recent.ok || !mid.ok || !throwback.ok) {
      return errorResponse(request, requestId, "The feed could not be loaded.", 502);
    }
    streams = { recent: recent.data, mid: mid.data, throwback: throwback.data };
  }

  const hydrated = await hydratePosts(
    request,
    requestId,
    auth.session,
    auth.base,
    auth.anonKey,
    streams,
    mode === "following",
  );
  if (hydrated.response) return hydrated.response;
  const itemsById = new Map((hydrated.data ?? []).map((item) => [String(item.id), item]));
  if (mode === "following") {
    return privateJsonResponse(
      request,
      requestId,
      {
        items: streams.items.map((post) => itemsById.get(String(post.id))).filter(Boolean),
        following_ids: followingIds,
      },
      200,
    );
  }
  return privateJsonResponse(
    request,
    requestId,
    {
      recent: streams.recent.map((post) => itemsById.get(String(post.id))).filter(Boolean),
      mid: streams.mid.map((post) => itemsById.get(String(post.id))).filter(Boolean),
      throwback: streams.throwback.map((post) => itemsById.get(String(post.id))).filter(Boolean),
    },
    200,
  );
}

export async function handleRecordPostViews(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "POST, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  const auth = await loadSession(request, env, requestId);
  if (!auth.ok) return auth.response;
  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return errorResponse(request, requestId, "The view batch is invalid.", 400);
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 16_384) {
      return errorResponse(request, requestId, "The view batch is invalid.", 400);
    }
    body = JSON.parse(text);
  } catch {
    return errorResponse(request, requestId, "The view batch is invalid.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(request, requestId, "The view batch is invalid.", 400);
  }
  const record = body as Record<string, unknown>;
  const expectedUserId = record.expected_user_id;
  if (expectedUserId !== undefined &&
      (typeof expectedUserId !== "string" || !UUID_PATTERN.test(expectedUserId))) {
    return errorResponse(request, requestId, "The expected account ID is invalid.", 400);
  }
  if (typeof expectedUserId === "string" && expectedUserId !== auth.session.user.id) {
    return errorResponse(request, requestId, "The active account changed before this action was sent.", 409);
  }
  if (!Array.isArray(record.post_ids) || record.post_ids.length > 100 ||
      record.post_ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    return errorResponse(request, requestId, "The view batch is invalid.", 400);
  }
  const postIds = [...new Set(record.post_ids as string[])];
  if (!postIds.length) return privateJsonResponse(request, requestId, { recorded: true, count: 0 }, 200);

  const url = makeUrl(auth.base, "post_views", { select: "post_id" });
  const headers = restHeaders(auth.session, auth.anonKey);
  headers.set("Content-Type", "application/json");
  headers.set("Prefer", "return=minimal");
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(postIds.map((postId) => ({
        post_id: postId,
        viewer_id: auth.session.user.id,
      }))),
      redirect: "manual",
    });
    if (!response.ok) {
      console.error("[afuchat-api] post view insert failed", {
        requestId,
        status: response.status,
      });
      return errorResponse(request, requestId, "Post views could not be recorded.", 502);
    }
    return privateJsonResponse(request, requestId, { recorded: true, count: postIds.length }, 200);
  } catch {
    return errorResponse(request, requestId, "Post views could not be recorded.", 502);
  }
}
