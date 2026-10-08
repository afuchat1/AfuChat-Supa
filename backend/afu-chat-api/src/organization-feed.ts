import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LIMIT = 10;

type FeedContext = {
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

async function restRequest<T>(
  context: FeedContext,
  url: URL,
  method: "GET",
  schema = "public",
  countExact = false,
): Promise<RestResult<T>> {
  const headers = new Headers({
    apikey: context.anonKey,
    Authorization: `Bearer ${context.session.token}`,
    Accept: "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
  });
  if (countExact) headers.set("Prefer", "count=exact");
  try {
    const response = await fetch(url, { method, headers, redirect: "manual" });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload && typeof payload === "object" &&
          typeof (payload as Record<string, unknown>).code === "string"
        ? String((payload as Record<string, unknown>).code)
        : undefined;
      return { ok: false, response, code };
    }
    return { ok: true, data: payload as T, response };
  } catch {
    return { ok: false, response: new Response(null, { status: 502 }) };
  }
}

function logFailure(label: string, context: FeedContext, result: RestResult<unknown>): void {
  if (!result.ok) {
    console.error(`[afuchat-api] ${label} failed`, {
      requestId: context.requestId,
      status: result.response.status,
      code: result.code,
    });
  }
}

function exactCount(response: Response): number | null {
  const match = response.headers.get("Content-Range")?.match(/\/(\d+)$/);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export async function handleOrganizationPostsFeed(
  request: Request,
  env: Env,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  const verification = await verifySharedSession(request, env, requestId);
  if (!verification.session) return verification.response;
  const config = supabaseConfig(env);
  if (!config) {
    return errorResponse(request, requestId, "This request is temporarily unavailable.", 503);
  }
  const context: FeedContext = {
    requestId,
    session: verification.session,
    base: config.url,
    anonKey: config.anonKey,
  };
  const incoming = new URL(request.url);
  const expectedUserId = incoming.searchParams.get("expected_user_id");
  if (expectedUserId !== null && !UUID_PATTERN.test(expectedUserId)) {
    return errorResponse(request, requestId, "The expected account ID is invalid.", 400);
  }
  if (expectedUserId && expectedUserId !== context.session.user.id) {
    return errorResponse(
      request,
      requestId,
      "The active account changed before this request was sent.",
      409,
    );
  }
  const rawLimit = incoming.searchParams.get("limit");
  const limit = rawLimit === null ? 6 : Number(rawLimit);
  const olderThan = incoming.searchParams.get("older_than");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return errorResponse(request, requestId, "The organization feed limit is invalid.", 400);
  }
  if (olderThan !== null && (
    olderThan.length > 64 || !Number.isFinite(Date.parse(olderThan))
  )) {
    return errorResponse(request, requestId, "The organization feed cursor is invalid.", 400);
  }

  const postFilters: Record<string, string> = {
    select: "id,content,image_url,created_at,author_id,likes,page_id",
    order: "created_at.desc",
    limit: String(limit),
  };
  if (olderThan) postFilters.created_at = `lt.${olderThan}`;
  const postsResult = await restRequest<Record<string, unknown>[]>(
    context,
    makeUrl(context.base, "organization_page_posts", postFilters),
    "GET",
  );
  if (!postsResult.ok || !Array.isArray(postsResult.data)) {
    logFailure("Discover organization feed", context, postsResult);
    return errorResponse(request, requestId, "Organization posts could not be loaded.", 502);
  }
  const posts = postsResult.data;
  const pageIds = [...new Set(posts
    .map((post) => post.page_id)
    .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
  if (posts.length > 0 && pageIds.length === 0) {
    return errorResponse(request, requestId, "Organization pages could not be loaded.", 502);
  }
  const pagesResult = pageIds.length
    ? await restRequest<Record<string, unknown>[]>(
        context,
        makeUrl(context.base, "organization_pages", {
          select: "id,slug,name,org_type,logo_url,is_verified",
          id: `in.(${pageIds.join(",")})`,
        }),
        "GET",
      )
    : { ok: true as const, data: [] as Record<string, unknown>[], response: new Response() };
  if (!pagesResult.ok || !Array.isArray(pagesResult.data)) {
    logFailure("Discover organization page hydration", context, pagesResult);
    return errorResponse(request, requestId, "Organization pages could not be loaded.", 502);
  }
  const pages = new Map(
    pagesResult.data
      .filter((page) => typeof page.id === "string")
      .map((page) => [String(page.id), page]),
  );
  const visiblePosts = posts.filter((post) =>
    typeof post.id === "string" &&
    typeof post.page_id === "string" &&
    pages.has(post.page_id)
  );
  const postIds = visiblePosts
    .map((post) => post.id)
    .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id));
  const likedResult = postIds.length
    ? await restRequest<Record<string, unknown>[]>(
        context,
        makeUrl(context.base, "post_acknowledgments", {
          select: "post_id",
          post_id: `in.(${postIds.join(",")})`,
          user_id: `eq.${context.session.user.id}`,
        }),
        "GET",
      )
    : { ok: true as const, data: [] as Record<string, unknown>[], response: new Response() };
  if (!likedResult.ok || !Array.isArray(likedResult.data)) {
    logFailure("Discover organization like hydration", context, likedResult);
    return errorResponse(request, requestId, "Organization post activity could not be loaded.", 502);
  }
  const likedIds = new Set(likedResult.data
    .map((row) => row.post_id)
    .filter((id): id is string => typeof id === "string"));
  const replyCounts = await Promise.all(postIds.map(async (postId) => {
    const result = await restRequest<Record<string, unknown>[]>(
      context,
      makeUrl(context.base, "post_replies", {
        select: "id",
        post_id: `eq.${postId}`,
      }),
      "GET",
      "public",
      true,
    );
    if (!result.ok || !Array.isArray(result.data)) {
      logFailure("Discover organization reply count", context, result);
      return null;
    }
    return exactCount(result.response);
  }));
  if (replyCounts.some((count) => count === null)) {
    return errorResponse(request, requestId, "Organization post activity could not be loaded.", 502);
  }
  const replyCountById = new Map(postIds.map((id, index) => [id, replyCounts[index] ?? 0]));
  const items = visiblePosts.map((post) => {
    const page = pages.get(String(post.page_id))!;
    const id = String(post.id);
    const authorId = typeof post.author_id === "string" ? post.author_id : String(page.id);
    return {
      id,
      author_id: authorId,
      content: typeof post.content === "string" ? post.content : "",
      image_url: typeof post.image_url === "string" ? post.image_url : null,
      images: typeof post.image_url === "string" ? [post.image_url] : [],
      created_at: post.created_at,
      view_count: 0,
      visibility: "public",
      is_verified: false,
      is_organization_verified: page.is_verified === true,
      profile: {
        display_name: typeof page.name === "string" ? page.name : "Organization",
        handle: typeof page.slug === "string" ? page.slug : "",
        avatar_url: typeof page.logo_url === "string" ? page.logo_url : null,
      },
      organization_pages: {
        id: page.id,
        slug: page.slug,
        name: page.name,
        org_type: page.org_type,
        logo_url: page.logo_url,
        is_verified: page.is_verified === true,
      },
      liked: likedIds.has(id),
      likeCount: Number.isFinite(Number(post.likes)) ? Number(post.likes) : 0,
      replyCount: replyCountById.get(id) ?? 0,
      org_page_id: String(page.id),
      org_page_slug: typeof page.slug === "string" ? page.slug : null,
      org_type: typeof page.org_type === "string" ? page.org_type : null,
    };
  });
  return privateJsonResponse(request, requestId, { items }, 200);
}
