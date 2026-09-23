import type { Context } from "hono";
import type { Env } from "../types";

type GatewayContext = Context<{ Bindings: Env }>;

const PUBLIC_SUPABASE_PREFIXES = ["/auth/v1", "/rest/v1", "/realtime/v1"] as const;

function isBodyMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

function upstreamUrl(requestUrl: string, env: Env): URL | null {
  const base = env.AFUCHAT_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;

  const incoming = new URL(requestUrl);
  if (!PUBLIC_SUPABASE_PREFIXES.some((prefix) => incoming.pathname === prefix || incoming.pathname.startsWith(`${prefix}/`))) {
    return null;
  }

  return new URL(`${base}${incoming.pathname}${incoming.search}`);
}

/**
 * Keeps the mobile app's existing Supabase client contract while making
 * AfuCloud the public boundary. Supabase remains private infrastructure:
 * Auth, PostgREST, and Realtime are reached only through this Worker.
 *
 * The caller's bearer token is preserved so the upstream project's RLS and
 * session semantics remain authoritative during the migration.
 */
export async function proxySupabaseRequest(c: GatewayContext): Promise<Response> {
  const target = upstreamUrl(c.req.url, c.env);
  const anonKey = c.env.AFUCHAT_SUPABASE_ANON_KEY?.trim();
  if (!target || !anonKey) {
    return c.json({ error: "AfuCloud Supabase gateway is not configured" }, 503);
  }

  const headers = new Headers(c.req.raw.headers);
  headers.set("apikey", anonKey);
  headers.delete("host");
  headers.delete("content-length");

  const request = new Request(target, {
    method: c.req.method,
    headers,
    body: isBodyMethod(c.req.method) ? c.req.raw.body : undefined,
    redirect: "manual",
  });

  try {
    return await fetch(request);
  } catch (error) {
    console.error("[supabase-gateway] upstream request failed:", error);
    return c.json({ error: "Upstream database service unavailable" }, 502);
  }
}