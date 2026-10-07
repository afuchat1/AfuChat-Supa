import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const PREFIX = "/v1/chat/posts";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POST_FIELDS =
  "id,author_id,content,image_url,video_url,created_at,view_count,like_count,visibility,language_code,post_type,article_title,article_body,article_cover_url,audio_name,filter,avatar_overlay,overlay_metadata,duet_of_post_id";
const MY_POST_FIELDS =
  "id,content,image_url,post_type,created_at,view_count,visibility";
const PROFILE_FIELDS =
  "id,display_name,handle,avatar_url,bio,is_verified,is_organization_verified";
const MAX_IMAGES = 10;
const MAX_BODY_BYTES = 128 * 1024;

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

function restHeaders(session: VerifiedSession, anonKey: string, schema = "public"): Headers {
  return new Headers({
    apikey: anonKey,
    Authorization: `Bearer ${session.token}`,
    Accept: "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
  });
}

async function restRequest<T>(
  url: URL,
  method: "GET" | "POST" | "DELETE",
  session: VerifiedSession,
  anonKey: string,
  body?: unknown,
  schema = "public",
  prefer?: string,
): Promise<RestResult<T>> {
  const headers = restHeaders(session, anonKey, schema);
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (prefer) headers.set("Prefer", prefer);
  else if (method !== "GET") headers.set("Prefer", "return=representation");
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
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
    return { ok: true, data: payload as T, response };
  } catch {
    return { ok: false, response: new Response(null, { status: 502 }) };
  }
}

function exactCount(response: Response): number | null {
  const match = response.headers.get("Content-Range")?.match(/\/(\d+)$/);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function logRestFailure(label: string, requestId: string, result: RestResult<unknown>): void {
  if (result.ok) return;
  console.error(`[afuchat-api] ${label} failed`, {
    requestId,
    status: result.response.status,
    code: result.code,
  });
}

async function readJsonRecord(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get("Content-Length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function validOptionalString(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
): boolean {
  return body[key] === undefined ||
    body[key] === null ||
    (typeof body[key] === "string" && body[key].length <= maxLength);
}

function validOptionalHttpsUrl(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
): boolean {
  const value = body[key];
  if (value === undefined || value === null) return true;
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validCreateBody(body: Record<string, unknown>): boolean {
  if (typeof body.content !== "string" || body.content.length > 40_000) return false;
  if (!validOptionalHttpsUrl(body, "image_url", 4_000)) return false;
  if (!validOptionalHttpsUrl(body, "video_url", 4_000)) return false;
  if (!validOptionalString(body, "visibility", 32)) return false;
  if (!validOptionalString(body, "language_code", 16)) return false;
  if (!validOptionalString(body, "post_type", 32)) return false;
  if (!validOptionalString(body, "article_title", 500)) return false;
  if (!validOptionalString(body, "article_body", 80_000)) return false;
  if (!validOptionalHttpsUrl(body, "article_cover_url", 4_000)) return false;
  if (!validOptionalString(body, "audio_name", 500)) return false;
  if (!validOptionalString(body, "filter", 128)) return false;
  if (!validOptionalString(body, "avatar_overlay", 128)) return false;
  if (!validOptionalString(body, "overlay_metadata", 20_000)) return false;
  if (body.duet_of_post_id !== undefined &&
      body.duet_of_post_id !== null &&
      (typeof body.duet_of_post_id !== "string" || !UUID_PATTERN.test(body.duet_of_post_id))) {
    return false;
  }
  if (body.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.length > MAX_IMAGES ||
        body.images.some((url) => typeof url !== "string" ||
          !validOptionalHttpsUrl({ image_url: url }, "image_url", 4_000))) {
      return false;
    }
  }
  return true;
}

function createPayload(
  body: Record<string, unknown>,
  authorId: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    author_id: authorId,
    content: body.content,
    view_count: 0,
  };
  const allowed = [
    "image_url",
    "video_url",
    "visibility",
    "language_code",
    "post_type",
    "article_title",
    "article_body",
    "article_cover_url",
    "audio_name",
    "filter",
    "avatar_overlay",
    "overlay_metadata",
    "duet_of_post_id",
  ];
  for (const key of allowed) {
    if (body[key] !== undefined) payload[key] = body[key];
  }
  return payload;
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

export async function handleCreatePost(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "POST, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }

  const auth = await loadSession(request, env, requestId);
  if (!auth.ok) return auth.response;
  const body = await readJsonRecord(request);
  if (!body || !validCreateBody(body)) {
    return errorResponse(request, requestId, "The post data is invalid.", 400);
  }

  const inserted = await restRequest<Record<string, unknown>[]>(
    makeUrl(auth.base, "posts", { select: POST_FIELDS }),
    "POST",
    auth.session,
    auth.anonKey,
    createPayload(body, auth.session.user.id),
  );
  if (!inserted.ok) {
    logRestFailure("post insert", requestId, inserted);
    return errorResponse(request, requestId, "The post could not be created.", 502);
  }
  const post = Array.isArray(inserted.data) ? inserted.data[0] : null;
  if (!post || typeof post.id !== "string" || !UUID_PATTERN.test(post.id)) {
    console.error("[afuchat-api] post insert returned an invalid result", { requestId });
    return errorResponse(request, requestId, "The post could not be created.", 502);
  }

  const images = Array.isArray(body.images) ? body.images as string[] : [];
  if (images.length) {
    const insertedImages = await restRequest<unknown>(
      makeUrl(auth.base, "post_images", { select: "post_id,image_url,display_order" }),
      "POST",
      auth.session,
      auth.anonKey,
      images.map((image_url, display_order) => ({
        post_id: post.id,
        image_url,
        display_order,
      })),
    );
    if (!insertedImages.ok) {
      logRestFailure("post image insert", requestId, insertedImages);
      const cleanup = await restRequest<unknown>(
        makeUrl(auth.base, "posts", {
          id: `eq.${post.id}`,
          author_id: `eq.${auth.session.user.id}`,
        }),
        "DELETE",
        auth.session,
        auth.anonKey,
      );
      if (!cleanup.ok) logRestFailure("post insert rollback", requestId, cleanup);
      return errorResponse(request, requestId, "The post images could not be saved.", 502);
    }
  }

  return privateJsonResponse(request, requestId, { post }, 201);
}

export async function handleGetMyPosts(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  const auth = await loadSession(request, env, requestId);
  if (!auth.ok) return auth.response;

  const postsResult = await restRequest<Record<string, unknown>[]>(
    makeUrl(auth.base, "posts", {
      select: MY_POST_FIELDS,
      author_id: `eq.${auth.session.user.id}`,
      order: "created_at.desc",
      limit: "50",
    }),
    "GET",
    auth.session,
    auth.anonKey,
    undefined,
    undefined,
    "count=exact",
  );
  if (!postsResult.ok || !Array.isArray(postsResult.data)) {
    logRestFailure("my posts query", requestId, postsResult);
    return errorResponse(request, requestId, "Your posts could not be loaded.", 502);
  }
  const totalCount = exactCount(postsResult.response);
  if (totalCount === null) {
    console.error("[afuchat-api] my posts query omitted exact count", { requestId });
    return errorResponse(request, requestId, "Your posts could not be loaded.", 502);
  }
  const posts = postsResult.data;
  const postIds = posts.map((post) => post.id).filter(
    (id): id is string => typeof id === "string" && UUID_PATTERN.test(id),
  );
  if (!postIds.length) {
    return privateJsonResponse(request, requestId, { items: [], total_count: totalCount }, 200);
  }

  const batch = `in.(${postIds.join(",")})`;
  const [imagesResult, acknowledgmentsResult, repliesResult] = await Promise.all([
    restRequest<Record<string, unknown>[]>(
      makeUrl(auth.base, "post_images", {
        select: "post_id,image_url,display_order",
        post_id: batch,
        order: "display_order.asc",
      }),
      "GET",
      auth.session,
      auth.anonKey,
    ),
    restRequest<Record<string, unknown>[]>(
      makeUrl(auth.base, "post_acknowledgments", {
        select: "post_id",
        post_id: batch,
      }),
      "GET",
      auth.session,
      auth.anonKey,
    ),
    restRequest<Record<string, unknown>[]>(
      makeUrl(auth.base, "post_replies", {
        select: "post_id",
        post_id: batch,
      }),
      "GET",
      auth.session,
      auth.anonKey,
    ),
  ]);
  if (!imagesResult.ok || !Array.isArray(imagesResult.data) ||
      !acknowledgmentsResult.ok || !Array.isArray(acknowledgmentsResult.data) ||
      !repliesResult.ok || !Array.isArray(repliesResult.data)) {
    logRestFailure("my post details query", requestId,
      !imagesResult.ok ? imagesResult
        : !acknowledgmentsResult.ok ? acknowledgmentsResult
        : !repliesResult.ok ? repliesResult
        : { ok: false, response: new Response(null, { status: 502 }) });
    return errorResponse(request, requestId, "Your post details could not be loaded.", 502);
  }

  const imagesByPost = new Map<string, Record<string, unknown>[]>();
  const likeCounts = new Map<string, number>();
  const replyCounts = new Map<string, number>();
  for (const image of imagesResult.data) {
    if (typeof image.post_id !== "string") continue;
    const rows = imagesByPost.get(image.post_id) ?? [];
    rows.push(image);
    imagesByPost.set(image.post_id, rows);
  }
  for (const row of acknowledgmentsResult.data) {
    if (typeof row.post_id === "string") {
      likeCounts.set(row.post_id, (likeCounts.get(row.post_id) ?? 0) + 1);
    }
  }
  for (const row of repliesResult.data) {
    if (typeof row.post_id === "string") {
      replyCounts.set(row.post_id, (replyCounts.get(row.post_id) ?? 0) + 1);
    }
  }

  const items = posts.map((post) => {
    const id = String(post.id);
    const images = imagesByPost.get(id) ?? [];
    return {
      ...post,
      images: images.map((image) => image.image_url).filter((url) => typeof url === "string"),
      likeCount: likeCounts.get(id) ?? 0,
      replyCount: replyCounts.get(id) ?? 0,
    };
  });
  return privateJsonResponse(request, requestId, { items, total_count: totalCount }, 200);
}

export async function handleGetProfilePosts(
  request: Request,
  env: Env,
  profileId: string,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  if (!UUID_PATTERN.test(profileId)) {
    return errorResponse(request, requestId, "The profile ID is invalid.", 400);
  }
  const auth = await loadSession(request, env, requestId);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") ?? "90");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return errorResponse(request, requestId, "The post limit is invalid.", 400);
  }
  const result = await restRequest<Record<string, unknown>[]>(
    makeUrl(auth.base, "posts", {
      select: POST_FIELDS,
      author_id: `eq.${profileId}`,
      or: "(visibility.eq.public,visibility.eq.followers,visibility.is.null)",
      order: "created_at.desc",
      limit: String(limit),
    }),
    "GET",
    auth.session,
    auth.anonKey,
    undefined,
    undefined,
    "count=exact",
  );
  if (!result.ok || !Array.isArray(result.data)) {
    logRestFailure("profile posts query", requestId, result);
    return errorResponse(request, requestId, "The profile posts could not be loaded.", 502);
  }
  const totalCount = exactCount(result.response);
  if (totalCount === null) {
    console.error("[afuchat-api] profile posts query omitted exact count", { requestId });
    return errorResponse(request, requestId, "The profile posts could not be loaded.", 502);
  }
  return privateJsonResponse(
    request,
    requestId,
    { items: result.data, total_count: totalCount },
    200,
  );
}

export async function handleGetPost(request: Request, env: Env, postId: string): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  if (!UUID_PATTERN.test(postId)) {
    return errorResponse(request, requestId, "The post ID is invalid.", 400);
  }
  const auth = await loadSession(request, env, requestId);
  if (!auth.ok) return auth.response;

  const result = await restRequest<Record<string, unknown>[]>(
    makeUrl(auth.base, "posts", {
      select: POST_FIELDS,
      id: `eq.${postId}`,
      limit: "2",
    }),
    "GET",
    auth.session,
    auth.anonKey,
  );
  if (!result.ok || !Array.isArray(result.data)) {
    logRestFailure("post query", requestId, result);
    return errorResponse(request, requestId, "The post could not be loaded.", 502);
  }
  if (result.data.length === 0) {
    return errorResponse(request, requestId, "The post was not found.", 404);
  }
  if (result.data.length !== 1) {
    return errorResponse(request, requestId, "The post could not be loaded.", 502);
  }
  const post = result.data[0];
  const authorId = typeof post.author_id === "string" ? post.author_id : "";
  if (!UUID_PATTERN.test(authorId)) {
    return errorResponse(request, requestId, "The post could not be loaded.", 502);
  }

  const [imagesResult, profileResult, likedResult] = await Promise.all([
    restRequest<Record<string, unknown>[]>(
      makeUrl(auth.base, "post_images", {
        select: "post_id,image_url,display_order",
        post_id: `eq.${postId}`,
        order: "display_order.asc",
      }),
      "GET",
      auth.session,
      auth.anonKey,
    ),
    restRequest<Record<string, unknown>[]>(
      makeUrl(auth.base, "profiles", {
        select: PROFILE_FIELDS,
        id: `eq.${authorId}`,
        limit: "2",
      }),
      "GET",
      auth.session,
      auth.anonKey,
      undefined,
      "accounts",
    ),
    restRequest<Record<string, unknown>[]>(
      makeUrl(auth.base, "post_acknowledgments", {
        select: "post_id",
        post_id: `eq.${postId}`,
        user_id: `eq.${auth.session.user.id}`,
        limit: "1",
      }),
      "GET",
      auth.session,
      auth.anonKey,
    ),
  ]);
  if (!imagesResult.ok || !Array.isArray(imagesResult.data) ||
      !profileResult.ok || !Array.isArray(profileResult.data) ||
      !likedResult.ok || !Array.isArray(likedResult.data)) {
    logRestFailure("post hydration query", requestId,
      !imagesResult.ok ? imagesResult
        : !profileResult.ok ? profileResult
        : !likedResult.ok ? likedResult
        : { ok: false, response: new Response(null, { status: 502 }) });
    return errorResponse(request, requestId, "The post could not be loaded.", 502);
  }

  return privateJsonResponse(
    request,
    requestId,
    {
      post: {
        ...post,
        profiles: profileResult.data[0] ?? null,
        post_images: imagesResult.data,
        liked: likedResult.data.length > 0,
      },
    },
    200,
  );
}

export async function handlePostSubroute(
  request: Request,
  env: Env,
  postId: string,
  action: "like" | "replies" | "reply-like",
  replyId?: string,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (!UUID_PATTERN.test(postId) || (replyId !== undefined && !UUID_PATTERN.test(replyId))) {
    return errorResponse(request, requestId, "The post or reply ID is invalid.", 400);
  }
  const allowedMethods = action === "replies" ? ["GET", "POST"] : ["POST", "DELETE"];
  if (!allowedMethods.includes(request.method)) {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", `${allowedMethods.join(", ")}, OPTIONS`);
    return new Response(response.body, { status: response.status, headers });
  }
  const auth = await loadSession(request, env, requestId);
  if (!auth.ok) return auth.response;

  if (action === "like" || action === "reply-like") {
    const expectedUserId = new URL(request.url).searchParams.get("expected_user_id");
    if (expectedUserId !== null && !UUID_PATTERN.test(expectedUserId)) {
      return errorResponse(request, requestId, "The expected account ID is invalid.", 400);
    }
    if (expectedUserId && expectedUserId !== auth.session.user.id) {
      return errorResponse(request, requestId, "The active account changed before this action was sent.", 409);
    }
  }

  if (action === "like") {
    if (request.method === "POST") {
      const result = await restRequest<Record<string, unknown>[]>(
        makeUrl(auth.base, "post_acknowledgments", {
          on_conflict: "post_id,user_id",
          select: "post_id,user_id",
        }),
        "POST",
        auth.session,
        auth.anonKey,
        { post_id: postId, user_id: auth.session.user.id },
        "public",
        "resolution=merge-duplicates,return=representation",
      );
      if (!result.ok) {
        logRestFailure("post like", requestId, result);
        return errorResponse(request, requestId, "The post could not be liked.", 502);
      }
      return privateJsonResponse(request, requestId, { liked: true }, 200);
    }
    const result = await restRequest<unknown>(
      makeUrl(auth.base, "post_acknowledgments", {
        post_id: `eq.${postId}`,
        user_id: `eq.${auth.session.user.id}`,
        select: "post_id",
      }),
      "DELETE",
      auth.session,
      auth.anonKey,
    );
    if (!result.ok) {
      logRestFailure("post unlike", requestId, result);
      return errorResponse(request, requestId, "The post like could not be removed.", 502);
    }
    return privateJsonResponse(request, requestId, { liked: false }, 200);
  }

  if (action === "reply-like") {
    if (!replyId) return errorResponse(request, requestId, "The reply ID is invalid.", 400);
    const replyResult = await restRequest<Record<string, unknown>[]>(
      makeUrl(auth.base, "post_replies", {
        select: "id",
        id: `eq.${replyId}`,
        post_id: `eq.${postId}`,
        limit: "1",
      }),
      "GET",
      auth.session,
      auth.anonKey,
    );
    if (!replyResult.ok || !Array.isArray(replyResult.data)) {
      logRestFailure("reply-like ownership check", requestId, replyResult);
      return errorResponse(request, requestId, "The reply could not be loaded.", 502);
    }
    if (!replyResult.data.length) {
      return errorResponse(request, requestId, "The reply was not found.", 404);
    }
    if (request.method === "POST") {
      const result = await restRequest<unknown>(
        makeUrl(auth.base, "post_reply_likes", {
          on_conflict: "reply_id,user_id",
          select: "reply_id,user_id",
        }),
        "POST",
        auth.session,
        auth.anonKey,
        { reply_id: replyId, user_id: auth.session.user.id },
        "public",
        "resolution=merge-duplicates,return=representation",
      );
      if (!result.ok) {
        logRestFailure("reply like", requestId, result);
        return errorResponse(request, requestId, "The reply could not be liked.", 502);
      }
      return privateJsonResponse(request, requestId, { liked: true }, 200);
    }
    const result = await restRequest<unknown>(
      makeUrl(auth.base, "post_reply_likes", {
        reply_id: `eq.${replyId}`,
        user_id: `eq.${auth.session.user.id}`,
        select: "reply_id",
      }),
      "DELETE",
      auth.session,
      auth.anonKey,
    );
    if (!result.ok) {
      logRestFailure("reply unlike", requestId, result);
      return errorResponse(request, requestId, "The reply like could not be removed.", 502);
    }
    return privateJsonResponse(request, requestId, { liked: false }, 200);
  }

  if (request.method === "POST") {
    const body = await readJsonRecord(request);
    if (!body) return errorResponse(request, requestId, "The reply data is invalid.", 400);
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const imageUrl = typeof body.image_url === "string" ? body.image_url : null;
    const voiceUrl = typeof body.voice_url === "string" ? body.voice_url : null;
    const voiceDuration = body.voice_duration;
    const parentReplyId = body.parent_reply_id;
    if (content.length > 500 ||
        !validOptionalString(body, "image_url", 4_000) ||
        !validOptionalString(body, "voice_url", 4_000) ||
        !validOptionalHttpsUrl(body, "image_url", 4_000) ||
        !validOptionalHttpsUrl(body, "voice_url", 4_000) ||
        (!content && !imageUrl && !voiceUrl) ||
        (voiceDuration !== undefined &&
          (typeof voiceDuration !== "number" || !Number.isFinite(voiceDuration) ||
            voiceDuration < 0 || voiceDuration > 3_600)) ||
        (parentReplyId !== undefined && parentReplyId !== null &&
          (typeof parentReplyId !== "string" || !UUID_PATTERN.test(parentReplyId)))) {
      return errorResponse(request, requestId, "The reply data is invalid.", 400);
    }
    if (typeof parentReplyId === "string") {
      const parent = await restRequest<Record<string, unknown>[]>(
        makeUrl(auth.base, "post_replies", {
          select: "id",
          id: `eq.${parentReplyId}`,
          post_id: `eq.${postId}`,
          limit: "1",
        }),
        "GET",
        auth.session,
        auth.anonKey,
      );
      if (!parent.ok || !Array.isArray(parent.data)) {
        logRestFailure("reply parent check", requestId, parent);
        return errorResponse(request, requestId, "The reply thread could not be loaded.", 502);
      }
      if (!parent.data.length) {
        return errorResponse(request, requestId, "The parent reply was not found.", 404);
      }
    }
    const payload: Record<string, unknown> = {
      post_id: postId,
      author_id: auth.session.user.id,
      content,
    };
    if (imageUrl) payload.image_url = imageUrl;
    if (voiceUrl) payload.voice_url = voiceUrl;
    if (voiceDuration !== undefined) payload.voice_duration = voiceDuration;
    if (typeof parentReplyId === "string") payload.parent_reply_id = parentReplyId;

    const inserted = await restRequest<Record<string, unknown>[]>(
      makeUrl(auth.base, "post_replies", {
        select: "id,author_id,content,created_at,parent_reply_id,voice_url,voice_duration,image_url",
      }),
      "POST",
      auth.session,
      auth.anonKey,
      payload,
    );
    if (!inserted.ok || !Array.isArray(inserted.data) || !inserted.data[0]) {
      logRestFailure("reply insert", requestId, inserted);
      return errorResponse(request, requestId, "The reply could not be posted.", 502);
    }
    return privateJsonResponse(request, requestId, { reply: inserted.data[0] }, 201);
  }

  const repliesResult = await restRequest<Record<string, unknown>[]>(
    makeUrl(auth.base, "post_replies", {
      select: "id,author_id,content,created_at,parent_reply_id,voice_url,voice_duration,image_url",
      post_id: `eq.${postId}`,
      order: "created_at.asc",
      limit: "100",
    }),
    "GET",
    auth.session,
    auth.anonKey,
  );
  if (!repliesResult.ok || !Array.isArray(repliesResult.data)) {
    logRestFailure("replies query", requestId, repliesResult);
    return errorResponse(request, requestId, "Replies could not be loaded.", 502);
  }
  const replies = repliesResult.data;
  const replyIds = replies.map((reply) => reply.id).filter(
    (id): id is string => typeof id === "string" && UUID_PATTERN.test(id),
  );
  if (replyIds.length !== replies.length) {
    return errorResponse(request, requestId, "Replies could not be loaded.", 502);
  }
  if (!replyIds.length) return privateJsonResponse(request, requestId, { items: [] }, 200);
  const authorIds = Array.from(new Set(
    replies.map((reply) => reply.author_id).filter(
      (id): id is string => typeof id === "string" && UUID_PATTERN.test(id),
    ),
  ));
  const [profilesResult, likesResult, myLikesResult] = await Promise.all([
    restRequest<Record<string, unknown>[]>(
      makeUrl(auth.base, "profiles", {
        select: PROFILE_FIELDS,
        id: `in.(${authorIds.join(",")})`,
      }),
      "GET",
      auth.session,
      auth.anonKey,
      undefined,
      "accounts",
    ),
    restRequest<Record<string, unknown>[]>(
      makeUrl(auth.base, "post_reply_likes", {
        select: "reply_id",
        reply_id: `in.(${replyIds.join(",")})`,
      }),
      "GET",
      auth.session,
      auth.anonKey,
    ),
    restRequest<Record<string, unknown>[]>(
      makeUrl(auth.base, "post_reply_likes", {
        select: "reply_id",
        reply_id: `in.(${replyIds.join(",")})`,
        user_id: `eq.${auth.session.user.id}`,
      }),
      "GET",
      auth.session,
      auth.anonKey,
    ),
  ]);
  if (!profilesResult.ok || !Array.isArray(profilesResult.data) ||
      !likesResult.ok || !Array.isArray(likesResult.data) ||
      !myLikesResult.ok || !Array.isArray(myLikesResult.data)) {
    logRestFailure("reply hydration query", requestId,
      !profilesResult.ok ? profilesResult
        : !likesResult.ok ? likesResult
        : !myLikesResult.ok ? myLikesResult
        : { ok: false, response: new Response(null, { status: 502 }) });
    return errorResponse(request, requestId, "Replies could not be loaded.", 502);
  }
  const profileById = new Map<string, Record<string, unknown>>();
  const likeCounts = new Map<string, number>();
  const myLikeIds = new Set(myLikesResult.data.map((row) => row.reply_id));
  for (const profile of profilesResult.data) {
    if (typeof profile.id === "string") profileById.set(profile.id, profile);
  }
  for (const row of likesResult.data) {
    if (typeof row.reply_id === "string") {
      likeCounts.set(row.reply_id, (likeCounts.get(row.reply_id) ?? 0) + 1);
    }
  }
  return privateJsonResponse(
    request,
    requestId,
    {
      items: replies.map((reply) => {
        const profile = typeof reply.author_id === "string"
          ? profileById.get(reply.author_id)
          : undefined;
        return {
          ...reply,
          like_count: typeof reply.id === "string" ? likeCounts.get(reply.id) ?? 0 : 0,
          liked: typeof reply.id === "string" && myLikeIds.has(reply.id),
          profile: profile
            ? {
                display_name: profile.display_name ?? null,
                handle: profile.handle ?? null,
                avatar_url: profile.avatar_url ?? null,
              }
            : null,
        };
      }),
    },
    200,
  );
}

export async function handleDeletePost(
  request: Request,
  env: Env,
  postId: string,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "DELETE") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "DELETE, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  if (!UUID_PATTERN.test(postId)) {
    return errorResponse(request, requestId, "The post ID is invalid.", 400);
  }
  const auth = await loadSession(request, env, requestId);
  if (!auth.ok) return auth.response;

  const result = await restRequest<Record<string, unknown>[]>(
    makeUrl(auth.base, "posts", {
      select: "id",
      id: `eq.${postId}`,
      author_id: `eq.${auth.session.user.id}`,
    }),
    "DELETE",
    auth.session,
    auth.anonKey,
  );
  if (!result.ok || !Array.isArray(result.data)) {
    logRestFailure("post delete", requestId, result);
    return errorResponse(request, requestId, "The post could not be deleted.", 502);
  }
  if (result.data.length === 0) {
    return errorResponse(request, requestId, "The post was not found or cannot be deleted.", 404);
  }
  return privateJsonResponse(request, requestId, { ok: true, id: postId }, 200);
}

export function isPostUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
