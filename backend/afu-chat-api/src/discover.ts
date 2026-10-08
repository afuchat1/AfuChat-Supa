import {
  privateJsonResponse,
  supabaseConfig,
  verifySharedSession,
  type Env,
  type VerifiedSession,
} from "./shared.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_PERSON_FIELDS =
  "id,display_name,handle,avatar_url,bio,follower_count,following_count,is_verified,is_organization_verified,country,interests,last_seen,current_grade,xp";
const ACCOUNT_PERSON_FIELDS =
  "id,display_name,handle,avatar_url,bio,is_verified,is_organization_verified";

type DiscoverContext = {
  requestId: string;
  session: VerifiedSession | null;
  base: string;
  anonKey: string;
};

type AuthenticatedDiscoverContext = DiscoverContext & { session: VerifiedSession };

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
  context: DiscoverContext,
  url: URL,
  method: "GET" | "POST" | "PATCH",
  body?: unknown,
  schema = "public",
): Promise<RestResult<T>> {
  const headers = new Headers({
    apikey: context.anonKey,
    Accept: "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
  });
  if (context.session) headers.set("Authorization", `Bearer ${context.session.token}`);
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    if (method !== "GET") headers.set("Prefer", "return=representation");
  }
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

function logFailure(label: string, context: DiscoverContext, result: RestResult<unknown>): void {
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
): Promise<{ ok: true; context: AuthenticatedDiscoverContext } | { ok: false; response: Response }> {
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

async function loadPeopleContext(
  request: Request,
  env: Env,
  requestId: string,
): Promise<{ ok: true; context: DiscoverContext } | { ok: false; response: Response }> {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  if (authorization) {
    return loadContext(request, env, requestId);
  }
  const config = supabaseConfig(env);
  if (!config) {
    return {
      ok: false,
      response: errorResponse(request, requestId, "This request is temporarily unavailable.", 503),
    };
  }
  return {
    ok: true,
    context: { requestId, session: null, base: config.url, anonKey: config.anonKey },
  };
}

function sameExpectedUser(
  request: Request,
  context: DiscoverContext,
  requestId: string,
): Response | null {
  const expected = new URL(request.url).searchParams.get("expected_user_id");
  if (expected !== null && !UUID_PATTERN.test(expected)) {
    return errorResponse(request, requestId, "The expected account ID is invalid.", 400);
  }
  if (expected && !context.session) {
    return errorResponse(request, requestId, "A valid bearer token is required.", 401);
  }
  if (expected && expected !== context.session?.user.id) {
    return errorResponse(
      request,
      requestId,
      "The active account changed before this action was sent.",
      409,
    );
  }
  return null;
}

async function readPublicProfiles(
  context: DiscoverContext,
  filters: Record<string, string>,
  label: string,
): Promise<Record<string, unknown>[] | null> {
  const result = await restRequest<Record<string, unknown>[]>(
    context,
    makeUrl(context.base, "profiles", { select: PUBLIC_PERSON_FIELDS, ...filters }),
    "GET",
  );
  if (!result.ok || !Array.isArray(result.data)) {
    logFailure(label, context, result);
    return null;
  }
  return result.data;
}

async function hydrateSharedProfiles(
  context: DiscoverContext,
  candidates: Record<string, unknown>[],
  label: string,
): Promise<Record<string, unknown>[] | null> {
  if (!context.session) return candidates;
  const ids = [...new Set(candidates
    .map((profile) => profile.id)
    .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))];
  if (ids.length === 0) return [];

  const result = await restRequest<Record<string, unknown>[]>(
    context,
    makeUrl(context.base, "profiles", {
      select: ACCOUNT_PERSON_FIELDS,
      id: `in.(${ids.join(",")})`,
    }),
    "GET",
    undefined,
    "accounts",
  );
  if (!result.ok || !Array.isArray(result.data)) {
    logFailure(label, context, result);
    return null;
  }
  const sharedById = new Map(
    result.data
      .filter((profile) => typeof profile.id === "string")
      .map((profile) => [String(profile.id), profile]),
  );
  if (ids.some((id) => !sharedById.has(id))) {
    console.error("[afuchat-api] Discover profile hydration was incomplete", {
      requestId: context.requestId,
      candidateCount: ids.length,
      hydratedCount: sharedById.size,
    });
    return null;
  }
  return candidates
    .filter((candidate) => typeof candidate.id === "string")
    .map((candidate) => ({ ...candidate, ...sharedById.get(String(candidate.id)) }));
}

async function searchPeople(
  context: DiscoverContext,
  query: string,
  limit: number,
  verifiedOnly: boolean,
  mentionsOnly: boolean,
): Promise<Record<string, unknown>[] | null> {
  const normalized = query.trim().replace(/^@+/, "").trim();
  const limitFilter = String(limit);
  const sharedFilters: Record<string, string> = {
    or: "(hide_from_search.is.null,hide_from_search.eq.false)",
    order: "xp.desc",
    limit: limitFilter,
  };
  if (verifiedOnly) sharedFilters.is_verified = "eq.true";

  if (mentionsOnly) {
    const filters: Record<string, string> = {
      ...sharedFilters,
      select: PUBLIC_PERSON_FIELDS,
      handle: normalized
        ? `ilike.${normalized.replace(/[%_\\]/g, "\\$&")}%`
        : "not.is.null",
      order: "follower_count.desc",
    };
    const candidates = await readPublicProfiles(context, filters, "Discover mention search");
    return candidates ? hydrateSharedProfiles(context, candidates, "Discover mention hydration") : null;
  }
  if (!normalized) return [];

  const escaped = normalized.replace(/[%_\\]/g, "\\$&");
  const fields = ["handle", "display_name", "bio"] as const;
  const responses = await Promise.all(fields.map((field) =>
    readPublicProfiles(context, {
      ...sharedFilters,
      [field]: `ilike.%${escaped}%`,
    }, "Discover people search")
  ));
  if (responses.some((items) => items === null)) return null;
  const unique = new Map<string, Record<string, unknown>>();
  for (const items of responses) {
    for (const profile of items ?? []) {
      if (typeof profile.id === "string") unique.set(profile.id, profile);
    }
  }
  const candidates = [...unique.values()]
    .sort((a, b) => Number(b.xp ?? 0) - Number(a.xp ?? 0))
    .slice(0, limit);
  return hydrateSharedProfiles(context, candidates, "Discover people search hydration");
}

async function readFollowingIds(
  context: DiscoverContext,
): Promise<Set<string> | null> {
  if (!context.session) return new Set();
  const result = await restRequest<Record<string, unknown>[]>(
    context,
    makeUrl(context.base, "follows", {
      select: "following_id",
      follower_id: `eq.${context.session.user.id}`,
      limit: "5000",
    }),
    "GET",
  );
  if (!result.ok || !Array.isArray(result.data)) {
    logFailure("Discover recommendations follow filter", context, result);
    return null;
  }
  return new Set(result.data
    .map((row) => row.following_id)
    .filter((id): id is string => typeof id === "string"));
}

function validSearchLimit(raw: string | null, fallback: number): number | null {
  if (raw === null) return fallback;
  const limit = Number(raw);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= 100 ? limit : null;
}

export async function handleDiscoverPeople(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  const incoming = new URL(request.url);
  const mode = incoming.searchParams.get("mode");
  if (
    mode !== "suggested" &&
    mode !== "active" &&
    mode !== "directory" &&
    mode !== "search" &&
    mode !== "trending" &&
    mode !== "mentions"
  ) {
    return errorResponse(request, requestId, "The people discovery mode is invalid.", 400);
  }
  const loaded = await loadPeopleContext(request, env, requestId);
  if (!loaded.ok) return loaded.response;
  const { context } = loaded;
  if (!context.session && (mode === "active" || mode === "directory")) {
    return errorResponse(request, requestId, "A valid bearer token is required.", 401);
  }
  const expectedError = sameExpectedUser(request, context, requestId);
  if (expectedError) return expectedError;

  const rawQuery = incoming.searchParams.get("query") ?? "";
  const verifiedOnly = incoming.searchParams.get("verified_only") === "true";
  if (rawQuery.length > 120) {
    return errorResponse(request, requestId, "The people search query is too long.", 400);
  }

  let items: Record<string, unknown>[] | null = null;
  if (mode === "suggested") {
    const [candidates, following] = await Promise.all([
      readPublicProfiles(context, {
        select: PUBLIC_PERSON_FIELDS,
        not: "(avatar_url.is.null,bio.is.null,display_name.is.null)",
        order: "follower_count.desc",
        limit: "60",
      }, "Discover suggested people"),
      readFollowingIds(context),
    ]);
    if (candidates && following) {
      const currentUserId = context.session?.user.id;
      const filtered = candidates
        .filter((profile) =>
          typeof profile.id === "string" &&
          profile.id !== currentUserId &&
          !following.has(profile.id)
        );
      items = await hydrateSharedProfiles(
        context,
        filtered,
        "Discover suggested people hydration",
      );
    }
  } else if (mode === "active") {
    const candidates = await readPublicProfiles(context, {
      select: PUBLIC_PERSON_FIELDS,
      id: `neq.${context.session!.user.id}`,
      onboarding_completed: "eq.true",
      is_banned: "eq.false",
      account_deleted: "eq.false",
      handle: "not.is.null",
      display_name: "not.is.null",
      avatar_url: "not.is.null",
      bio: "not.is.null",
      order: "last_seen.desc.nullslast",
      limit: "100",
    }, "Discover active people");
    if (candidates) {
      items = await hydrateSharedProfiles(context, candidates, "Discover active people hydration");
    }
  } else if (mode === "directory") {
    const interest = incoming.searchParams.get("interest");
    if (interest !== null && (
      interest.length > 50 || !/^[\p{L}\p{N} -]+$/u.test(interest)
    )) {
      return errorResponse(request, requestId, "The selected interest is invalid.", 400);
    }
    const filters: Record<string, string> = {
      select: PUBLIC_PERSON_FIELDS,
      id: `neq.${context.session!.user.id}`,
      onboarding_completed: "eq.true",
      is_banned: "eq.false",
      account_deleted: "eq.false",
      avatar_url: "not.is.null",
      bio: "not.is.null",
      display_name: "not.is.null",
      order: "follower_count.desc",
      limit: "60",
    };
    if (interest) filters.interests = `cs.{${interest.toLowerCase()}}`;
    const candidates = await readPublicProfiles(context, filters, "Discover people directory");
    if (candidates) {
      items = await hydrateSharedProfiles(context, candidates, "Discover directory hydration");
    }
  } else if (mode === "trending") {
    const candidates = await readPublicProfiles(context, {
      select: PUBLIC_PERSON_FIELDS,
      is_verified: "eq.true",
      or: "(hide_from_search.is.null,hide_from_search.eq.false)",
      order: "xp.desc",
      limit: "12",
    }, "Discover trending people");
    if (candidates) {
      items = await hydrateSharedProfiles(context, candidates, "Discover trending hydration");
    }
  } else if (mode === "search") {
    const limit = validSearchLimit(incoming.searchParams.get("limit"), 25);
    if (limit === null) {
      return errorResponse(request, requestId, "The people search limit is invalid.", 400);
    }
    items = await searchPeople(context, rawQuery, limit, verifiedOnly, false);
  } else if (mode === "mentions") {
    items = await searchPeople(context, rawQuery, 8, false, true);
  } else {
    return errorResponse(request, requestId, "The people discovery mode is invalid.", 400);
  }
  if (items === null) {
    return errorResponse(request, requestId, "People could not be loaded.", 502);
  }
  return privateJsonResponse(request, requestId, { items }, 200);
}

async function readJsonRecord(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get("Content-Length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > 4096) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 4096) return null;
    const payload: unknown = JSON.parse(text);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function handleDiscoverLocation(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "POST, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  const loaded = await loadContext(request, env, requestId);
  if (!loaded.ok) return loaded.response;
  const { context } = loaded;
  const payload = await readJsonRecord(request);
  if (
    !payload ||
    payload.expected_user_id !== context.session.user.id ||
    !UUID_PATTERN.test(String(payload.expected_user_id)) ||
    typeof payload.latitude !== "number" ||
    !Number.isFinite(payload.latitude) ||
    payload.latitude < -90 ||
    payload.latitude > 90 ||
    typeof payload.longitude !== "number" ||
    !Number.isFinite(payload.longitude) ||
    payload.longitude < -180 ||
    payload.longitude > 180
  ) {
    return errorResponse(request, requestId, "The location update is invalid.", 400);
  }

  const profileUrl = makeUrl(context.base, "profiles", {
    select: "id,location_sharing_enabled",
    id: `eq.${context.session.user.id}`,
    limit: "2",
  });
  const profile = await restRequest<Record<string, unknown>[]>(
    context,
    profileUrl,
    "GET",
    undefined,
    "accounts",
  );
  if (!profile.ok || !Array.isArray(profile.data)) {
    logFailure("Discover location preference", context, profile);
    return errorResponse(request, requestId, "Location sharing settings could not be checked.", 502);
  }
  if (profile.data.length !== 1 || profile.data[0]?.id !== context.session.user.id) {
    return errorResponse(request, requestId, "The account profile was not found.", 404);
  }
  if (profile.data[0].location_sharing_enabled === false) {
    return privateJsonResponse(request, requestId, { updated: false }, 200);
  }

  const now = new Date().toISOString();
  const update = await restRequest<Record<string, unknown>[]>(
    context,
    makeUrl(context.base, "profiles", {
      id: `eq.${context.session.user.id}`,
      select: "id",
    }),
    "PATCH",
    {
      latitude: payload.latitude,
      longitude: payload.longitude,
      location_updated_at: now,
    },
    "accounts",
  );
  if (!update.ok || !Array.isArray(update.data) || update.data.length !== 1) {
    logFailure("Discover location update", context, update);
    return errorResponse(request, requestId, "The location could not be saved.", 502);
  }
  return privateJsonResponse(
    request,
    requestId,
    { updated: true, location_updated_at: now },
    200,
  );
}

export async function handleDiscoverNearby(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "GET, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  const loaded = await loadContext(request, env, requestId);
  if (!loaded.ok) return loaded.response;
  const { context } = loaded;
  const expectedError = sameExpectedUser(request, context, requestId);
  if (expectedError) return expectedError;
  const incoming = new URL(request.url);
  const latitude = Number(incoming.searchParams.get("latitude"));
  const longitude = Number(incoming.searchParams.get("longitude"));
  const radiusKm = Number(incoming.searchParams.get("radius_km"));
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 500
  ) {
    return errorResponse(request, requestId, "The nearby search coordinates are invalid.", 400);
  }
  const result = await restRequest<Record<string, unknown>[]>(
    context,
    makeUrl(context.base, "rpc/nearby_users", {}),
    "POST",
    {
      user_lat: latitude,
      user_lng: longitude,
      radius_km: radiusKm,
      exclude_id: context.session.user.id,
    },
  );
  if (!result.ok || !Array.isArray(result.data)) {
    logFailure("Discover nearby users", context, result);
    return errorResponse(request, requestId, "Nearby people could not be loaded.", 502);
  }
  return privateJsonResponse(request, requestId, { items: result.data }, 200);
}

export async function handleDiscoverPresence(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST") {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", "POST, OPTIONS");
    return new Response(response.body, { status: response.status, headers });
  }
  const loaded = await loadContext(request, env, requestId);
  if (!loaded.ok) return loaded.response;
  const { context } = loaded;
  const payload = await readJsonRecord(request);
  if (
    !payload ||
    payload.expected_user_id !== context.session.user.id ||
    !UUID_PATTERN.test(String(payload.expected_user_id))
  ) {
    return errorResponse(request, requestId, "The presence update is invalid.", 400);
  }
  const result = await restRequest<unknown>(
    context,
    makeUrl(context.base, "rpc/update_last_seen", {}),
    "POST",
    {},
  );
  if (!result.ok) {
    logFailure("Discover presence heartbeat", context, result);
    return errorResponse(request, requestId, "Presence could not be updated.", 502);
  }
  return privateJsonResponse(request, requestId, { updated: true }, 200);
}
