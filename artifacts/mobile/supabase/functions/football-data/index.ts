import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const API_KEY = Deno.env.get("API_FOOTBALL_KEY") ?? Deno.env.get("APISPORTS_KEY") ?? "";
const API_BASE = "https://v3.football.api-sports.io";

type Action =
  | "live"
  | "fixtures"
  | "fixture"
  | "events"
  | "statistics"
  | "lineups"
  | "competitions"
  | "searchCompetitions"
  | "standings"
  | "teams"
  | "team"
  | "teamFixtures"
  | "searchTeams"
  | "searchPlayers";

type Params = Record<string, string | number | boolean | undefined>;

const inflight = new Map<string, Promise<{ body: unknown; status: number }>>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function asPositiveInteger(value: unknown, name: string): string {
  const text = String(value ?? "");
  if (!/^\d{1,10}$/.test(text) || Number(text) < 1) {
    throw new Error(`${name} must be a positive number.`);
  }
  return text;
}

function addText(url: URL, params: Params, key: string, maxLength = 100) {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) return;
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw new Error(`${key} is too long.`);
  url.searchParams.set(key, cleaned);
}

function addDate(url: URL, params: Params, key: string) {
  const value = params[key];
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} must use YYYY-MM-DD format.`);
  }
  url.searchParams.set(key, value);
}

function addNumber(url: URL, params: Params, key: string, min: number, max: number) {
  const value = params[key];
  if (value === undefined || value === null || value === "") return;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${key} is invalid.`);
  }
  url.searchParams.set(key, String(number));
}

function buildProviderUrl(action: Action, params: Params): URL {
  let endpoint: string;
  switch (action) {
    case "live":
      endpoint = "fixtures";
      break;
    case "fixtures":
      endpoint = "fixtures";
      break;
    case "fixture":
      endpoint = "fixtures";
      break;
    case "events":
      endpoint = "fixtures/events";
      break;
    case "statistics":
      endpoint = "fixtures/statistics";
      break;
    case "lineups":
      endpoint = "fixtures/lineups";
      break;
    case "competitions":
    case "searchCompetitions":
      endpoint = "leagues";
      break;
    case "standings":
      endpoint = "standings";
      break;
    case "teams":
    case "team":
    case "searchTeams":
      endpoint = "teams";
      break;
    case "teamFixtures":
      endpoint = "fixtures";
      break;
    case "searchPlayers":
      endpoint = "players";
      break;
    default:
      throw new Error("This football request is not supported.");
  }

  const url = new URL(`${API_BASE}/${endpoint}`);
  if (action === "live") {
    url.searchParams.set("live", "all");
  } else if (action === "fixture") {
    url.searchParams.set("id", asPositiveInteger(params.id, "id"));
  } else if (action === "events" || action === "statistics" || action === "lineups") {
    url.searchParams.set("fixture", asPositiveInteger(params.fixture, "fixture"));
  } else if (action === "competitions") {
    if (params.id !== undefined && params.id !== null && params.id !== "") {
      url.searchParams.set("id", asPositiveInteger(params.id, "id"));
    } else {
      url.searchParams.set("current", "true");
    }
  } else if (action === "searchCompetitions" || action === "searchTeams" || action === "searchPlayers") {
    if (typeof params.search !== "string" || !params.search.trim()) {
      throw new Error("Enter a search term.");
    }
    addText(url, params, "search", 80);
  } else if (action === "standings") {
    url.searchParams.set("league", asPositiveInteger(params.league, "league"));
    addNumber(url, params, "season", 1900, 2200);
  } else if (action === "team") {
    url.searchParams.set("id", asPositiveInteger(params.id, "id"));
  } else if (action === "teams") {
    addNumber(url, params, "league", 1, 999999);
    addNumber(url, params, "season", 1900, 2200);
  } else if (action === "teamFixtures") {
    url.searchParams.set("team", asPositiveInteger(params.team, "team"));
    const countKey = params.direction === "next" ? "next" : "last";
    addNumber(url, params, countKey, 1, 20);
  }

  if (action === "fixtures") {
    addDate(url, params, "date");
    addDate(url, params, "from");
    addDate(url, params, "to");
    addText(url, params, "timezone", 64);
    addNumber(url, params, "league", 1, 999999);
    addNumber(url, params, "season", 1900, 2200);
    addNumber(url, params, "team", 1, 999999);
    addText(url, params, "status", 8);
    addNumber(url, params, "last", 1, 20);
    addNumber(url, params, "next", 1, 20);
  }

  return url;
}

async function digestKey(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `afufootball:v1:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function defaultTtlSeconds(action: Action, providerDailyLimit: number): number {
  if (action === "live") return providerDailyLimit > 1_000 ? 120 : 1_800;
  if (action === "events" || action === "statistics" || action === "lineups" || action === "fixture") return 900;
  if (action === "standings" || action === "teamFixtures" || action === "fixtures") return 1_800;
  return 21_600;
}

function hasProviderError(errors: unknown): boolean {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  return typeof errors === "object" && Object.keys(errors as object).length > 0;
}

async function executeRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ ok: false, message: "POST is required." }, 405);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return json({ ok: false, code: "SERVER_NOT_CONFIGURED", message: "Football data is not configured yet." }, 503);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ ok: false, code: "AUTH_REQUIRED", message: "Sign in to use Football." }, 401);
  }

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) {
    return json({ ok: false, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again." }, 401);
  }

  let body: { action?: unknown; params?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "A valid JSON request is required." }, 400);
  }

  const action = body.action as Action;
  const allowedActions: Action[] = [
    "live", "fixtures", "fixture", "events", "statistics", "lineups",
    "competitions", "searchCompetitions", "standings", "teams", "team",
    "teamFixtures", "searchTeams", "searchPlayers",
  ];
  if (!allowedActions.includes(action)) {
    return json({ ok: false, message: "This football request is not supported." }, 400);
  }
  if (!body.params || typeof body.params !== "object" || Array.isArray(body.params)) {
    return json({ ok: false, message: "Request parameters must be an object." }, 400);
  }
  const params = body.params as Params;

  let providerUrl: URL;
  try {
    providerUrl = buildProviderUrl(action, params);
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : "Invalid request." }, 400);
  }

  const canonical = JSON.stringify({
    action,
    params: Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b))),
  });
  const cacheKey = await digestKey(canonical);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: cached } = await admin
    .from("football_api_cache")
    .select("payload, fetched_at, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  const now = Date.now();
  const cachedIsFresh = cached && new Date(cached.expires_at).getTime() > now;
  if (cachedIsFresh) {
    return json({
      ok: true,
      response: cached.payload?.response ?? [],
      results: cached.payload?.results ?? 0,
      cachedAt: cached.fetched_at,
      stale: false,
      source: "shared-cache",
    });
  }

  if (!API_KEY) {
    if (cached) {
      return json({
        ok: true,
        response: cached.payload?.response ?? [],
        results: cached.payload?.results ?? 0,
        cachedAt: cached.fetched_at,
        stale: true,
        source: "shared-cache",
        warning: "Showing saved football data while the provider key is being configured.",
      });
    }
    return json({
      ok: false,
      code: "FOOTBALL_PROVIDER_NOT_CONFIGURED",
      message: "Football data is not connected yet.",
    }, 503);
  }

  const pending = inflight.get(cacheKey);
  if (pending) {
    const result = await pending;
    return json(result.body, result.status);
  }

  const work = (async () => {
    try {
      const providerResponse = await fetch(providerUrl, {
        method: "GET",
        headers: { "x-apisports-key": API_KEY },
        signal: AbortSignal.timeout(12_000),
      });
      const payload = await providerResponse.json();
      if (!providerResponse.ok || hasProviderError(payload?.errors)) {
        const providerMessage = typeof payload?.message === "string"
          ? payload.message
          : "The football data provider could not complete this request.";
        if (cached) {
          return { body: {
            ok: true,
            response: cached.payload?.response ?? [],
            results: cached.payload?.results ?? 0,
            cachedAt: cached.fetched_at,
            stale: true,
            source: "shared-cache",
            warning: providerMessage,
          }, status: 200 };
        }
        const status = providerResponse.status === 429 ? 429 : 502;
        return { body: {
          ok: false,
          code: providerResponse.status === 429 ? "PROVIDER_LIMIT" : "PROVIDER_ERROR",
          message: providerResponse.status === 429
            ? "Football data is temporarily rate-limited. Please try again later."
            : "Football data is temporarily unavailable.",
        }, status };
      }

      const fetchedAt = new Date().toISOString();
      const dailyLimit = Number(providerResponse.headers.get("x-ratelimit-requests-limit") ?? 0);
      const ttlSeconds = defaultTtlSeconds(action, dailyLimit);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      const { error: cacheError } = await admin.from("football_api_cache").upsert({
        cache_key: cacheKey,
        payload,
        fetched_at: fetchedAt,
        expires_at: expiresAt,
      }, { onConflict: "cache_key" });

      return { body: {
        ok: true,
        response: Array.isArray(payload?.response) ? payload.response : [],
        results: Number(payload?.results ?? payload?.response?.length ?? 0),
        cachedAt: fetchedAt,
        stale: false,
        source: "provider",
        ...(cacheError ? { warning: "Football loaded, but the shared cache could not be updated." } : {}),
      }, status: 200 };
    } catch {
      if (cached) {
        return { body: {
          ok: true,
          response: cached.payload?.response ?? [],
          results: cached.payload?.results ?? 0,
          cachedAt: cached.fetched_at,
          stale: true,
          source: "shared-cache",
          warning: "The provider could not be reached. Showing the most recently saved data.",
        }, status: 200 };
      }
      return { body: {
        ok: false,
        code: "PROVIDER_UNAVAILABLE",
        message: "Football data is temporarily unavailable. Check your connection and try again.",
      }, status: 502 };
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, work);
  const result = await work;
  return json(result.body, result.status);
}

Deno.serve(async (request) => {
  try {
    return await executeRequest(request);
  } catch {
    return json({ ok: false, message: "Football data could not be loaded." }, 500);
  }
});
