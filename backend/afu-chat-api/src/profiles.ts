import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTACT_PROFILE_FIELDS = [
  "id",
  "display_name",
  "handle",
  "avatar_url",
  "banner_url",
  "bio",
  "is_verified",
  "is_organization_verified",
  "is_business_mode",
  "is_private",
  "country",
  "website_url",
  "xp",
  "current_grade",
  "acoin",
  "last_seen",
  "show_online_status",
  "created_at",
].join(",");

type ContactProfileContext = {
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
  return privateJsonResponse(
    request,
    requestId,
    { error, request_id: requestId },
    status,
  );
}

function makeUrl(
  base: string,
  relation: string,
  filters: Record<string, string>,
): URL {
  const url = new URL(`/rest/v1/${relation}`, base);
  for (const [key, value] of Object.entries(filters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function readRows<T>(
  context: ContactProfileContext,
  url: URL,
  schema = "afuchat",
): Promise<RestResult<T>> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: context.anonKey,
        Authorization: `Bearer ${context.session.token}`,
        Accept: "application/json",
        "Accept-Profile": schema,
      },
      redirect: "manual",
    });
    if (!response.ok) {
      const diagnostic = await response.clone().json().catch(() => null) as {
        code?: unknown;
      } | null;
      return {
        ok: false,
        response,
        code: typeof diagnostic?.code === "string" ? diagnostic.code : undefined,
      };
    }
    return {
      ok: true,
      data: await response.json().catch(() => null) as T,
      response,
    };
  } catch {
    return { ok: false, response: new Response(null, { status: 502 }) };
  }
}

function logFailure(
  label: string,
  context: ContactProfileContext,
  result: RestResult<unknown>,
): void {
  if (result.ok) return;
  console.error(`[afuchat-api] ${label} failed`, {
    requestId: context.requestId,
    status: result.response.status,
    code: result.code,
  });
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nonNegativeNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function profileResponse(
  source: Record<string, unknown>,
  allowPrivateDetails: boolean,
): Record<string, unknown> {
  const isPrivate = source.is_private === true;
  const showOnlineStatus = allowPrivateDetails && source.show_online_status === true;

  return {
    id: source.id,
    display_name: typeof source.display_name === "string" ? source.display_name : "",
    handle: typeof source.handle === "string" ? source.handle : "",
    avatar_url: nullableString(source.avatar_url),
    banner_url: allowPrivateDetails ? nullableString(source.banner_url) : null,
    bio: allowPrivateDetails ? nullableString(source.bio) : null,
    is_verified: allowPrivateDetails && source.is_verified === true,
    is_organization_verified: allowPrivateDetails && source.is_organization_verified === true,
    is_business_mode: allowPrivateDetails && source.is_business_mode === true,
    is_private: isPrivate,
    country: allowPrivateDetails ? nullableString(source.country) : null,
    website_url: allowPrivateDetails ? nullableString(source.website_url) : null,
    xp: allowPrivateDetails ? nonNegativeNumber(source.xp) : 0,
    current_grade: allowPrivateDetails ? nullableString(source.current_grade) : null,
    acoin: allowPrivateDetails ? nonNegativeNumber(source.acoin) : 0,
    last_seen: showOnlineStatus ? nullableString(source.last_seen) : null,
    show_online_status: showOnlineStatus,
    created_at: allowPrivateDetails ? nullableString(source.created_at) : null,
  };
}

export async function handleGetContactProfile(
  request: Request,
  env: Env,
  profileId: string,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  if (!UUID_PATTERN.test(profileId)) {
    return errorResponse(request, requestId, "The profile ID is invalid.", 400);
  }

  const verification = await verifySharedSession(request, env, requestId);
  if (!verification.session) return verification.response;
  const config = supabaseConfig(env);
  if (!config) {
    return errorResponse(request, requestId, "Profile service is temporarily unavailable.", 503);
  }

  const context: ContactProfileContext = {
    requestId,
    session: verification.session,
    base: config.url,
    anonKey: config.anonKey,
  };

  const profileResult = await readRows<Record<string, unknown>[]>(
    context,
    makeUrl(context.base, "profiles", {
      select: CONTACT_PROFILE_FIELDS,
      id: `eq.${profileId}`,
      limit: "2",
    }),
    "afuchat",
  );
  if (!profileResult.ok || !Array.isArray(profileResult.data)) {
    logFailure("contact profile lookup", context, profileResult);
    return errorResponse(request, requestId, "Profile could not be loaded.", 502);
  }
  if (profileResult.data.length === 0) {
    return errorResponse(request, requestId, "Profile was not found.", 404);
  }
  const source = profileResult.data[0];
  if (
    profileResult.data.length !== 1 ||
    !source ||
    typeof source !== "object" ||
    source.id !== profileId
  ) {
    console.error("[afuchat-api] contact profile lookup returned an invalid result", {
      requestId,
      count: profileResult.data.length,
    });
    return errorResponse(request, requestId, "Profile could not be loaded.", 502);
  }

  if (profileId !== context.session.user.id) {
    const blockResult = await readRows<Record<string, unknown>[]>(
      context,
      makeUrl(context.base, "blocked_users", {
        select: "blocker_id,blocked_id",
        or: `(and(blocker_id.eq.${context.session.user.id},blocked_id.eq.${profileId}),and(blocker_id.eq.${profileId},blocked_id.eq.${context.session.user.id}))`,
        limit: "1",
      }),
    );
    if (!blockResult.ok || !Array.isArray(blockResult.data)) {
      logFailure("contact profile block check", context, blockResult);
      return errorResponse(request, requestId, "Profile could not be loaded.", 502);
    }
    if (blockResult.data.length > 0) {
      return errorResponse(request, requestId, "Profile was not found.", 404);
    }
  }

  const isPrivate = source.is_private === true;
  const isSelf = profileId === context.session.user.id;
  let followsProfile = false;
  if (isPrivate && !isSelf) {
    const followResult = await readRows<Record<string, unknown>[]>(
      context,
      makeUrl(context.base, "follows", {
        select: "id",
        follower_id: `eq.${context.session.user.id}`,
        following_id: `eq.${profileId}`,
        limit: "1",
      }),
    );
    if (!followResult.ok || !Array.isArray(followResult.data)) {
      logFailure("contact profile privacy check", context, followResult);
      return errorResponse(request, requestId, "Profile could not be loaded.", 502);
    }
    followsProfile = followResult.data.length > 0;
  }

  const allowPrivateDetails = !isPrivate || isSelf || followsProfile;
  return privateJsonResponse(
    request,
    requestId,
    { profile: profileResponse(source, allowPrivateDetails) },
    200,
  );
}
