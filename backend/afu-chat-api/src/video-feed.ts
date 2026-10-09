import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";
import { schemaForPostgrestPath } from "./data-schema.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VIDEO_FIELDS =
  "id,author_id,content,video_url,image_url,created_at,audio_name,view_count,video_asset_id";
const PROFILE_FIELDS =
  "id,display_name,handle,avatar_url,is_verified,is_organization_verified";
const MAX_LIMIT = 100;
const MAX_FOLLOWING = 1000;

type SessionContext = {
  requestId: string;
  session: VerifiedSession;
  base: string;
  anonKey: string;
};

type RestResult<T> =
  | { ok: true; data: T; response: Response }
  | { ok: false; response: Response; code?: string };

function errorResponse(
  request: Request,
  requestId: string,
  error: string,
  status: number,
): Response {
  return privateJsonResponse(request, requestId, { error, request_id: requestId }, status);
}

function makeUrl(base: string, relation: string, filters: Record<string, string>): URL {
  const url = new URL(`/rest/v1/${relation}`, base);
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
  return url;
}

function restHeaders(context: SessionContext, schema = "afuchat"): Headers {
  return new Headers({
    apikey: context.anonKey,
    Authorization: `Bearer ${context.session.token}`,
    Accept: "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
  });
}

async function restRows(
  context: SessionContext,
  url: URL,
  _schema = "afuchat",
): Promise<RestResult<Record<string, unknown>[]>> {
  const resolvedSchema = schemaForPostgrestPath(url.pathname);
  if (!resolvedSchema) {
    return {
      ok: false,
      response: new Response(null, { status: 404 }),
      code: "UNAVAILABLE_RESOURCE",
    };
  }
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: restHeaders(context, resolvedSchema),
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
    return { ok: true, data: payload as Record<string, unknown>[], response };
  } catch {
    return { ok: false, response: new Response(null, { status: 502 }) };
  }
}

function logFailure(label: string, context: SessionContext, result: RestResult<unknown>): void {
  if (!result.ok) {
    console.error(`[afuchat-api] ${label} failed`, {
      requestId: context.requestId,
      status: result.response.status,
      code: result.code,
    });
  }
}

async function loadContext(
  request: Request,
  env: Env,
  requestId: string,
): Promise<{ ok: true; context: SessionContext } | { ok: false; response: Response }> {
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
    context: {
      requestId,
      session: verification.session,
      base: config.url,
      anonKey: config.anonKey,
    },
  };
}

function readLimit(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= MAX_LIMIT ? number : null;
}

function readCursor(value: string | null): string | null | false {
  if (value === null || value === "") return null;
  if (value.length > 64 || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString();
}

export async function handleVideoFeed(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  const loaded = await loadContext(request, env, requestId);
  if (!loaded.ok) return loaded.response;
  const context = loaded.context;
  const params = new URL(request.url).searchParams;
  const tab = params.get("tab");
  const limit = readLimit(params.get("limit"), tab === "following" ? 20 : 60);
  const cursor = readCursor(params.get("older_than"));
  const expectedUserId = params.get("expected_user_id");
  if (
    (tab !== "for_you" && tab !== "following") ||
    limit === null ||
    cursor === false ||
    (expectedUserId !== null &&
      (!UUID_PATTERN.test(expectedUserId) || expectedUserId !== context.session.user.id))
  ) {
    return errorResponse(request, requestId, "The video feed query is invalid for this account.", 400);
  }

  let followingIds: string[] = [];
  if (tab === "following") {
    const follows = await restRows(
      context,
      makeUrl(context.base, "follows", {
        select: "following_id",
        follower_id: `eq.${context.session.user.id}`,
        limit: String(MAX_FOLLOWING),
      }),
    );
    if (!follows.ok || !Array.isArray(follows.data)) {
      logFailure("video feed following IDs", context, follows);
      return errorResponse(request, requestId, "The video feed could not be loaded.", 502);
    }
    followingIds = [...new Set(follows.data
      .map((row) => row.following_id)
      .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
    if (!followingIds.length) {
      return privateJsonResponse(request, requestId, { items: [] }, 200);
    }
  }

  const filters: Record<string, string> = {
    select: VIDEO_FIELDS,
    video_url: "not.is.null",
    order: "created_at.desc",
    limit: String(limit),
  };
  if (tab === "following") filters.author_id = `in.(${followingIds.join(",")})`;
  if (cursor) filters.created_at = `lt.${cursor}`;
  const postsUrl = makeUrl(context.base, "posts", filters);
  postsUrl.searchParams.append("or", "(post_type.eq.video,post_type.is.null)");
  postsUrl.searchParams.append(
    "or",
    tab === "following"
      ? "(visibility.eq.public,visibility.eq.followers,visibility.is.null)"
      : "(visibility.eq.public,visibility.is.null)",
  );
  const posts = await restRows(context, postsUrl);
  if (!posts.ok || !Array.isArray(posts.data)) {
    logFailure("video feed posts", context, posts);
    return errorResponse(request, requestId, "The video feed could not be loaded.", 502);
  }
  const rows = posts.data;
  const postIds = [...new Set(rows
    .map((post) => post.id)
    .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
  const authorIds = [...new Set(rows
    .map((post) => post.author_id)
    .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
  if (postIds.length !== rows.length || authorIds.length !== new Set(rows.map((row) => row.author_id)).size) {
    return errorResponse(request, requestId, "The video feed returned invalid post data.", 502);
  }
  if (!postIds.length) return privateJsonResponse(request, requestId, { items: [] }, 200);

  const postFilter = `in.(${postIds.join(",")})`;
  const [profiles, likes, replies, views, myLikes, follows] = await Promise.all([
    restRows(
      context,
      makeUrl(context.base, "profiles", {
        select: PROFILE_FIELDS,
        id: `in.(${authorIds.join(",")})`,
      }),
      "afuchat",
    ),
    restRows(context, makeUrl(context.base, "post_acknowledgments", {
      select: "post_id",
      post_id: postFilter,
      limit: "10000",
    })),
    restRows(context, makeUrl(context.base, "post_replies", {
      select: "post_id",
      post_id: postFilter,
      limit: "10000",
    })),
    restRows(context, makeUrl(context.base, "post_views", {
      select: "post_id",
      post_id: postFilter,
      limit: "10000",
    })),
    restRows(context, makeUrl(context.base, "post_acknowledgments", {
      select: "post_id",
      post_id: postFilter,
      user_id: `eq.${context.session.user.id}`,
      limit: String(postIds.length),
    })),
    restRows(context, makeUrl(context.base, "follows", {
      select: "following_id",
      follower_id: `eq.${context.session.user.id}`,
      following_id: `in.(${authorIds.join(",")})`,
      limit: String(authorIds.length),
    })),
  ]);
  const results = [profiles, likes, replies, views, myLikes, follows];
  const failed = results.find((result) => !result.ok);
  if (failed && !failed.ok) {
    logFailure("video feed hydration", context, failed);
    return errorResponse(request, requestId, "Video feed details could not be loaded.", 502);
  }
  if (
    !profiles.ok || !likes.ok || !replies.ok || !views.ok || !myLikes.ok || !follows.ok ||
    !Array.isArray(profiles.data) || !Array.isArray(likes.data) ||
    !Array.isArray(replies.data) || !Array.isArray(views.data) ||
    !Array.isArray(myLikes.data) || !Array.isArray(follows.data)
  ) {
    return errorResponse(request, requestId, "Video feed details could not be loaded.", 502);
  }

  const profileById = new Map(profiles.data
    .filter((profile) => typeof profile.id === "string")
    .map((profile) => [String(profile.id), profile]));
  const countByPost = (items: Record<string, unknown>[]) => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (typeof item.post_id === "string") {
        counts.set(item.post_id, (counts.get(item.post_id) ?? 0) + 1);
      }
    }
    return counts;
  };
  const likeCounts = countByPost(likes.data);
  const replyCounts = countByPost(replies.data);
  const viewCounts = countByPost(views.data);
  const likedIds = new Set(myLikes.data.map((item) => item.post_id));
  const followingSet = new Set(follows.data.map((item) => item.following_id));

  return privateJsonResponse(
    request,
    requestId,
    {
      items: rows.map((post) => {
        const id = String(post.id);
        const authorId = String(post.author_id);
        const profile = profileById.get(authorId);
        return {
          id,
          author_id: authorId,
          content: typeof post.content === "string" ? post.content : "",
          video_url: post.video_url,
          image_url: typeof post.image_url === "string" ? post.image_url : null,
          created_at: post.created_at,
          audio_name: typeof post.audio_name === "string" ? post.audio_name : null,
          view_count: viewCounts.get(id) ?? 0,
          liked: likedIds.has(id),
          likeCount: likeCounts.get(id) ?? 0,
          replyCount: replyCounts.get(id) ?? 0,
          isFollowing: followingSet.has(authorId),
          profile: profile
            ? {
                display_name: profile.display_name ?? null,
                handle: profile.handle ?? null,
                avatar_url: profile.avatar_url ?? null,
                is_verified: profile.is_verified === true,
                is_organization_verified: profile.is_organization_verified === true,
              }
            : null,
        };
      }),
    },
    200,
  );
}
