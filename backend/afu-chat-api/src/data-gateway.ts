import {
  privateJsonResponse,
  responseHeaders,
  supabaseConfig,
  verifySharedSession,
  type Env,
} from "./shared.ts";
import { schemaForRelation, schemaForRpc } from "./data-schema.ts";
import {
  applyProfileJoinPlans,
  collectRowsAtPath,
  rewriteCrossSchemaProfileSelect,
  type ProfileJoinPlan,
} from "./profile-join-bridge.ts";

const PREFIX = "/v1/chat/data";
const AFUCHAT_SCHEMA = "afuchat";
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PATCH", "DELETE"]);
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const REQUEST_HEADERS = [
  "Accept",
  "Accept-Language",
  "Content-Type",
  "If-Match",
  "If-Modified-Since",
  "If-None-Match",
  "Prefer",
  "Range",
  "Range-Unit",
  "X-Client-Info",
];

const RESPONSE_HEADERS = [
  "Cache-Control",
  "Content-Location",
  "Content-Range",
  "Content-Type",
  "ETag",
  "Last-Modified",
  "Location",
  "Preference-Applied",
  "Vary",
];

function errorResponse(
  request: Request,
  requestId: string,
  error: string,
  status: number,
): Response {
  return privateJsonResponse(request, requestId, { error, request_id: requestId }, status);
}

function routeTarget(pathname: string): { kind: "relation" | "function"; name: string } | null {
  const match = pathname.match(/^\/v1\/chat\/data\/(rpc\/)?([a-z][a-z0-9_]*)$/);
  if (!match) return null;
  return { kind: match[1] ? "function" : "relation", name: match[2] };
}

function requestedSchema(request: Request): string | null {
  const acceptSchema = request.headers.get("Accept-Profile")?.trim().toLowerCase() || "";
  const contentSchema = request.headers.get("Content-Profile")?.trim().toLowerCase() || "";
  if (acceptSchema && contentSchema && acceptSchema !== contentSchema) return null;
  return acceptSchema || contentSchema || "";
}

function fixedSchema(target: { kind: "relation" | "function"; name: string }): string | null {
  return target.kind === "function"
    ? schemaForRpc(target.name)
    : schemaForRelation(target.name);
}

function bearerToken(request: Request, anonKey: string): string | null {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  if (!authorization) return anonKey;
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function profileSelectFields(plans: ProfileJoinPlan[]): string {
  const fields = new Set<string>();
  for (const plan of plans) {
    if (plan.outputKeys === null || plan.fields.split(",").some((field) => field.trim() === "*")) {
      return "*";
    }
    for (const field of plan.fields.split(",")) {
      const value = field.trim();
      if (value) fields.add(value);
    }
  }
  return [...fields].join(",");
}

async function fetchAccountProfiles(
  config: { url: string; anonKey: string },
  token: string,
  requestId: string,
  plans: ProfileJoinPlan[],
  payload: unknown,
): Promise<Map<string, Record<string, unknown>> | null> {
  const ids = new Set<string>();
  for (const plan of plans) {
    for (const row of collectRowsAtPath(payload, plan.parentPath)) {
      const value = row[plan.foreignKeyColumn];
      if (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)) ids.add(value);
    }
  }
  const profiles = new Map<string, Record<string, unknown>>();
  if (ids.size === 0) return profiles;

  const selectedFields = profileSelectFields(plans);
  const select = selectedFields === "*"
    ? "*"
    : ["id", ...selectedFields.split(",").map((field) => field.trim()).filter(Boolean)]
        .filter((field, index, all) => all.indexOf(field) === index)
        .join(",");
  const values = [...ids];
  for (let offset = 0; offset < values.length; offset += 100) {
    const url = new URL("/rest/v1/profiles", config.url);
    url.searchParams.set("select", select);
    url.searchParams.set("id", `in.(${values.slice(offset, offset + 100).join(",")})`);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Accept-Profile": "accounts",
          "Content-Profile": "accounts",
        },
        redirect: "manual",
      });
      if (!response.ok) {
        console.error("[afuchat-api] related profile lookup failed", {
          requestId,
          status: response.status,
        });
        return null;
      }
      const rows: unknown = await response.json().catch(() => null);
      if (!Array.isArray(rows)) return null;
      for (const row of rows) {
        if (
          row !== null &&
          typeof row === "object" &&
          !Array.isArray(row) &&
          typeof (row as Record<string, unknown>).id === "string"
        ) {
          profiles.set(
            String((row as Record<string, unknown>).id),
            row as Record<string, unknown>,
          );
        }
      }
    } catch {
      console.error("[afuchat-api] related profile lookup failed", { requestId });
      return null;
    }
  }
  return profiles;
}

export async function handleDataGateway(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const target = routeTarget(new URL(request.url).pathname);
  if (!target) {
    return errorResponse(request, requestId, "The requested data route was not found.", 404);
  }
  if (!ALLOWED_METHODS.has(request.method)) {
    const response = errorResponse(request, requestId, "Method not allowed.", 405);
    const headers = new Headers(response.headers);
    headers.set("Allow", [...ALLOWED_METHODS, "OPTIONS"].join(", "));
    return new Response(response.body, { status: response.status, headers });
  }

  const requested = requestedSchema(request);
  if (requested === null) {
    return errorResponse(request, requestId, "Conflicting data schema headers.", 400);
  }
  const schema = fixedSchema(target);
  if (!schema) {
    return errorResponse(request, requestId, "The requested data resource is not available.", 404);
  }
  if (requested && requested !== schema && requested !== AFUCHAT_SCHEMA) {
    return errorResponse(request, requestId, "The requested data schema is not supported.", 400);
  }

  const config = supabaseConfig(env);
  if (!config) {
    return errorResponse(request, requestId, "The data service is unavailable.", 503);
  }
  if (request.headers.get("apikey") !== config.anonKey) {
    return errorResponse(request, requestId, "A valid API key is required.", 401);
  }

  const token = bearerToken(request, config.anonKey);
  if (!token) {
    return errorResponse(request, requestId, "A valid bearer token is required.", 401);
  }
  if (token !== config.anonKey) {
    const verification = await verifySharedSession(
      new Request("https://afuauth-api/v1/auth/session", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
      requestId,
    );
    if (verification.response) return verification.response;
  }

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return errorResponse(request, requestId, "The request body is too large.", 413);
    }
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return errorResponse(request, requestId, "The request body is too large.", 413);
    }
  }

  const upstreamUrl = new URL(config.url);
  const operation = target.kind === "function" ? `rpc/${target.name}` : target.name;
  upstreamUrl.pathname = `/rest/v1/${operation}`;
  upstreamUrl.search = new URL(request.url).search;
  let profileJoinPlans: ProfileJoinPlan[] = [];
  if (request.method === "GET" && target.kind === "relation") {
    const selector = upstreamUrl.searchParams.get("select");
    if (selector) {
      const rewritten = rewriteCrossSchemaProfileSelect(schema, selector);
      if (rewritten?.unsupported) {
        return errorResponse(request, requestId, "The requested data selection is not supported.", 400);
      }
      if (rewritten?.plans.length) {
        profileJoinPlans = rewritten.plans;
        upstreamUrl.searchParams.set("select", rewritten.selector);
      }
    }
  }

  const upstreamHeaders = new Headers({
    apikey: config.anonKey,
    Authorization: `Bearer ${token}`,
    "Accept-Profile": schema,
    "Content-Profile": schema,
  });
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) upstreamHeaders.set(name, value);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      ...(body ? { body } : {}),
      redirect: "manual",
    });
    if (!upstream.ok) {
      const status = upstream.status >= 500 ? 502 : upstream.status;
      return errorResponse(
        request,
        requestId,
        "The data request could not be completed.",
        status,
      );
    }
    if (profileJoinPlans.length > 0) {
      const payload: unknown = await upstream.json().catch(() => null);
      if (payload === null || typeof payload !== "object") {
        return errorResponse(request, requestId, "The data request could not be completed.", 502);
      }
      const profiles = await fetchAccountProfiles(
        config,
        token,
        requestId,
        profileJoinPlans,
        payload,
      );
      if (!profiles) {
        return errorResponse(request, requestId, "The data request could not be completed.", 502);
      }
      applyProfileJoinPlans(payload, profileJoinPlans, profiles);
      const headers = responseHeaders(request, requestId);
      for (const name of RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      headers.delete("ETag");
      headers.delete("Content-Location");
      headers.set("Cache-Control", "private, no-store");
      headers.set("Vary", "Origin, Authorization");
      headers.set("X-AfuChat-Request-Id", requestId);
      headers.set("X-AfuChat-Version", "v1");
      return new Response(JSON.stringify(payload), {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    }
    const headers = responseHeaders(request, requestId);
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    headers.set("Cache-Control", "private, no-store");
    headers.set("Vary", "Origin, Authorization");
    headers.set("X-AfuChat-Request-Id", requestId);
    headers.set("X-AfuChat-Version", "v1");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (error) {
    console.error("[afuchat-api] database request failed", {
      requestId,
      operation: target.kind,
      status: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(request, requestId, "The data request could not be completed.", 502);
  }
}

