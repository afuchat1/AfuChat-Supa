import {
  privateJsonResponse,
  responseHeaders,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FOLLOW_PROFILE_FIELDS =
  "id,display_name,handle,avatar_url,bio,is_verified,is_organization_verified,is_business_mode";

type RestResult<T> =
  | { ok: true; data: T; response: Response }
  | { ok: false; response: Response; code?: string };

type FollowContext = {
  requestId: string;
  session: VerifiedSession;
  base: string;
  anonKey: string;
};

function errorResponse(
  request: Request,
  requestId: string,
  error: string,
  status: number,
  code?: string,
): Response {
  return privateJsonResponse(
    request,
    requestId,
    { error, request_id: requestId, ...(code ? { code } : {}) },
    status,
  );
}

function makeUrl(base: string, relation: string, filters: Record<string, string>): URL {
  const url = new URL(`/rest/v1/${relation}`, base);
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
  return url;
}

function restHeaders(context: FollowContext, schema = "public"): Headers {
  return new Headers({
    apikey: context.anonKey,
    Authorization: `Bearer ${context.session.token}`,
    Accept: "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
  });
}

async function restRequest<T>(
  context: FollowContext,
  url: URL,
  method: "GET" | "POST" | "DELETE",
  options: {
    body?: unknown;
    schema?: string;
    prefer?: string;
    count?: boolean;
  } = {},
): Promise<RestResult<T>> {
  const headers = restHeaders(context, options.schema);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.prefer || options.count) {
    headers.set(
      "Prefer",
      [options.prefer, options.count ? "count=exact" : ""].filter(Boolean).join(","),
    );
  }
  if (options.count) headers.set("Range", "0-0");
  if (method !== "GET" && !options.prefer) headers.set("Prefer", "return=representation");

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual",
    });
    if (!response.ok) {
      const payload = await response.clone().json().catch(() => null) as {
        code?: unknown;
      } | null;
      return {
        ok: false,
        response,
        code: typeof payload?.code === "string" ? payload.code : undefined,
      };
    }
    const data = method === "DELETE" && response.status === 204
      ? null
      : await response.json().catch(() => null);
    return { ok: true, data: data as T, response };
  } catch {
    return { ok: false, response: new Response(null, { status: 502 }) };
  }
}

function logFailure(label: string, context: FollowContext, result: RestResult<unknown>): void {
  if (result.ok) return;
  console.error(`[afuchat-api] ${label} failed`, {
    requestId: context.requestId,
    status: result.response.status,
    code: result.code,
  });
}

async function loadContext(
  request: Request,
  env: Env,
  requestId: string,
): Promise<{ ok: true; context: FollowContext } | { ok: false; response: Response }> {
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

function parseProfileId(url: URL): string | null {
  const profileId = url.searchParams.get("profile_id");
  return profileId && UUID_PATTERN.test(profileId) ? profileId : null;
}

function parsePage(url: URL): { limit: number; offset: number } | null {
  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");
  const limit = rawLimit === null ? 30 : Number(rawLimit);
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100_000
  ) {
    return null;
  }
  return { limit, offset };
}

async function countRows(
  context: FollowContext,
  filter: Record<string, string>,
): Promise<number | null> {
  const url = makeUrl(context.base, "follows", { select: "id", ...filter });
  const result = await restRequest<unknown[]>(context, url, "GET", { count: true });
  if (!result.ok) {
    logFailure("follow count", context, result);
    return null;
  }
  const match = result.response.headers.get("Content-Range")?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function getRelationshipIds(
  context: FollowContext,
  profileId: string,
  direction: "followers" | "following",
  page: { limit: number; offset: number },
): Promise<RestResult<Record<string, unknown>[]>> {
  const filters: Record<string, string> = {
    select: "follower_id,following_id,created_at",
    [direction === "followers" ? "following_id" : "follower_id"]: `eq.${profileId}`,
    order: "created_at.desc",
    limit: String(page.limit),
    offset: String(page.offset),
  };
  return restRequest<Record<string, unknown>[]>(
    context,
    makeUrl(context.base, "follows", filters),
    "GET",
  );
}

async function hydrateProfiles(
  context: FollowContext,
  ids: string[],
): Promise<Map<string, Record<string, unknown>> | null> {
  if (ids.length === 0) return new Map();
  const result = await restRequest<Record<string, unknown>[]>(
    context,
    makeUrl(context.base, "profiles", {
      select: FOLLOW_PROFILE_FIELDS,
      id: `in.(${ids.join(",")})`,
    }),
    "GET",
    { schema: "accounts" },
  );
  if (!result.ok || !Array.isArray(result.data)) {
    logFailure("follow profile lookup", context, result);
    return null;
  }
  const profiles = new Map<string, Record<string, unknown>>();
  for (const profile of result.data) {
    if (typeof profile?.id === "string") profiles.set(profile.id, profile);
  }
  return profiles;
}

async function canListProfileFollowData(
  request: Request,
  context: FollowContext,
  profileId: string,
  direction: "followers" | "following",
): Promise<{ ok: true; hidden: boolean } | { ok: false; response: Response }> {
  const profileResult = await restRequest<Record<string, unknown>[]>(
    context,
    makeUrl(context.base, "profiles", {
      select: "id,hide_followers_list,hide_following_list",
      id: `eq.${profileId}`,
      limit: "2",
    }),
    "GET",
    { schema: "accounts" },
  );
  if (!profileResult.ok || !Array.isArray(profileResult.data)) {
    logFailure("follow list privacy lookup", context, profileResult);
    return {
      ok: false,
      response: errorResponse(request, context.requestId, "Follow data could not be loaded.", 502),
    };
  }
  const profile = profileResult.data[0];
  if (!profile || profile.id !== profileId) {
    return {
      ok: false,
      response: errorResponse(request, context.requestId, "The profile was not found.", 404),
    };
  }
  const field = direction === "followers" ? "hide_followers_list" : "hide_following_list";
  return {
    ok: true,
    hidden: profileId !== context.session.user.id && profile[field] === true,
  };
}

async function handleFollowList(
  request: Request,
  context: FollowContext,
  idsOnly: boolean,
): Promise<Response> {
  const url = new URL(request.url);
  const profileId = parseProfileId(url);
  const direction = url.searchParams.get("direction");
  const page = parsePage(url);
  if (!profileId || (direction !== "followers" && direction !== "following") || !page) {
    return errorResponse(
      request,
      context.requestId,
      "profile_id, direction, limit, or offset is invalid.",
      400,
    );
  }

  const access = await canListProfileFollowData(request, context, profileId, direction);
  if (!access.ok) return access.response;
  if (access.hidden) {
    return privateJsonResponse(
      request,
      context.requestId,
      { items: [], hidden: true, next_offset: null },
      200,
    );
  }

  const result = await getRelationshipIds(context, profileId, direction, page);
  if (!result.ok || !Array.isArray(result.data)) {
    logFailure("follow list", context, result);
    return errorResponse(request, context.requestId, "Follow data could not be loaded.", 502);
  }
  const rows = result.data.filter((row) =>
    typeof row.follower_id === "string" &&
    typeof row.following_id === "string" &&
    typeof row.created_at === "string"
  );
  const profileIds = rows.map((row) =>
    direction === "followers" ? String(row.follower_id) : String(row.following_id)
  );

  if (idsOnly) {
    return privateJsonResponse(
      request,
      context.requestId,
      {
        items: profileIds,
        hidden: false,
        next_offset: rows.length === page.limit ? page.offset + rows.length : null,
      },
      200,
    );
  }

  const profiles = await hydrateProfiles(context, [...new Set(profileIds)]);
  if (!profiles) {
    return errorResponse(request, context.requestId, "Follow profiles could not be loaded.", 502);
  }
  const items = rows.flatMap((row) => {
    const id = direction === "followers"
      ? String(row.follower_id)
      : String(row.following_id);
    const profile = profiles.get(id);
    return profile ? [{ ...row, profile }] : [];
  });
  return privateJsonResponse(
    request,
    context.requestId,
    {
      items,
      hidden: false,
      next_offset: rows.length === page.limit ? page.offset + rows.length : null,
    },
    200,
  );
}

async function handleFollowSummary(
  request: Request,
  context: FollowContext,
): Promise<Response> {
  const profileId = parseProfileId(new URL(request.url));
  if (!profileId) {
    return errorResponse(request, context.requestId, "profile_id is invalid.", 400);
  }
  const [followersCount, followingCount, followsYou, youFollow] = await Promise.all([
    countRows(context, { following_id: `eq.${profileId}` }),
    countRows(context, { follower_id: `eq.${profileId}` }),
    restRequest<Record<string, unknown>[]>(
      context,
      makeUrl(context.base, "follows", {
        select: "id",
        follower_id: `eq.${profileId}`,
        following_id: `eq.${context.session.user.id}`,
        limit: "1",
      }),
      "GET",
    ),
    restRequest<Record<string, unknown>[]>(
      context,
      makeUrl(context.base, "follows", {
        select: "id",
        follower_id: `eq.${context.session.user.id}`,
        following_id: `eq.${profileId}`,
        limit: "1",
      }),
      "GET",
    ),
  ]);
  if (
    followersCount === null ||
    followingCount === null ||
    !followsYou.ok ||
    !youFollow.ok ||
    !Array.isArray(followsYou.data) ||
    !Array.isArray(youFollow.data)
  ) {
    if (!followsYou.ok) logFailure("follow summary status", context, followsYou);
    if (!youFollow.ok) logFailure("follow summary status", context, youFollow);
    return errorResponse(request, context.requestId, "Follow summary could not be loaded.", 502);
  }
  return privateJsonResponse(
    request,
    context.requestId,
    {
      followers_count: followersCount,
      following_count: followingCount,
      follows_you: followsYou.data.length > 0,
      is_following: youFollow.data.length > 0,
    },
    200,
  );
}

async function handleFollowStatus(
  request: Request,
  context: FollowContext,
): Promise<Response> {
  const url = new URL(request.url);
  const userIds = [...new Set(
    url.searchParams.getAll("user_ids").flatMap((value) => value.split(",")).map((id) => id.trim()),
  )];
  if (
    userIds.length > 100 ||
    userIds.some((id) => !UUID_PATTERN.test(id))
  ) {
    return errorResponse(request, context.requestId, "user_ids must contain at most 100 UUIDs.", 400);
  }
  if (userIds.length === 0) {
    return privateJsonResponse(request, context.requestId, { items: [] }, 200);
  }
  const list = `in.(${userIds.join(",")})`;
  const [following, followers] = await Promise.all([
    restRequest<Record<string, unknown>[]>(
      context,
      makeUrl(context.base, "follows", {
        select: "following_id",
        follower_id: `eq.${context.session.user.id}`,
        following_id: list,
      }),
      "GET",
    ),
    restRequest<Record<string, unknown>[]>(
      context,
      makeUrl(context.base, "follows", {
        select: "follower_id",
        follower_id: list,
        following_id: `eq.${context.session.user.id}`,
      }),
      "GET",
    ),
  ]);
  if (
    !following.ok ||
    !followers.ok ||
    !Array.isArray(following.data) ||
    !Array.isArray(followers.data)
  ) {
    if (!following.ok) logFailure("follow status", context, following);
    if (!followers.ok) logFailure("follow status", context, followers);
    return errorResponse(request, context.requestId, "Follow status could not be loaded.", 502);
  }
  const followingIds = new Set(following.data.map((row) => row.following_id));
  const followerIds = new Set(followers.data.map((row) => row.follower_id));
  return privateJsonResponse(
    request,
    context.requestId,
    {
      items: userIds.map((userId) => ({
        user_id: userId,
        is_following: followingIds.has(userId),
        follows_you: followerIds.has(userId),
      })),
    },
    200,
  );
}

async function handleFollowMutation(
  request: Request,
  context: FollowContext,
  following: boolean,
): Promise<Response> {
  let targetId: string | null = null;
  let expectedUserId: unknown;
  if (request.method === "POST") {
    const payload: unknown = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return errorResponse(request, context.requestId, "The follow request is invalid.", 400);
    }
    const body = payload as Record<string, unknown>;
    targetId = typeof body.target_user_id === "string" ? body.target_user_id : null;
    expectedUserId = body.expected_user_id;
  } else {
    const url = new URL(request.url);
    targetId = url.searchParams.get("target_user_id");
    expectedUserId = url.searchParams.get("expected_user_id") ?? undefined;
  }
  if (
    !targetId ||
    !UUID_PATTERN.test(targetId) ||
    targetId === context.session.user.id ||
    (expectedUserId !== undefined &&
      (typeof expectedUserId !== "string" || expectedUserId !== context.session.user.id))
  ) {
    return errorResponse(
      request,
      context.requestId,
      "The follow request is invalid for this account.",
      409,
      "ACCOUNT_MISMATCH",
    );
  }

  const url = makeUrl(context.base, "follows", {
    select: "follower_id,following_id",
    ...(following ? { on_conflict: "follower_id,following_id" } : {
      follower_id: `eq.${context.session.user.id}`,
      following_id: `eq.${targetId}`,
    }),
  });
  const result = following
    ? await restRequest<Record<string, unknown>[]>(
        context,
        url,
        "POST",
        {
          body: {
            follower_id: context.session.user.id,
            following_id: targetId,
          },
          prefer: "resolution=merge-duplicates,return=representation",
        },
      )
    : await restRequest<unknown>(context, url, "DELETE");
  if (!result.ok) {
    logFailure(following ? "follow mutation" : "unfollow mutation", context, result);
    return errorResponse(request, context.requestId, "Follow status could not be updated.", 502);
  }
  return privateJsonResponse(
    request,
    context.requestId,
    { is_following: following, target_user_id: targetId },
    200,
  );
}

export async function handleFollows(
  request: Request,
  env: Env,
  action: "list" | "ids" | "summary" | "status" | "mutate",
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const expectedMethod = action === "list" || action === "ids" || action === "summary" ||
      action === "status"
    ? "GET"
    : undefined;
  if (
    (expectedMethod && request.method !== expectedMethod) ||
    (action === "mutate" && request.method !== "POST" && request.method !== "DELETE")
  ) {
    return errorResponse(request, requestId, "Method not allowed.", 405);
  }
  const loaded = await loadContext(request, env, requestId);
  if (!loaded.ok) return loaded.response;
  const context = loaded.context;
  if (action === "list") return handleFollowList(request, context, false);
  if (action === "ids") return handleFollowList(request, context, true);
  if (action === "summary") return handleFollowSummary(request, context);
  if (action === "status") return handleFollowStatus(request, context);
  return handleFollowMutation(request, context, request.method === "POST");
}
