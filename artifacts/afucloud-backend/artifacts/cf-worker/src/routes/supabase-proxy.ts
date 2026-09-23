import { Hono } from "hono";
import type { Env } from "../types";

/**
 * Supabase-compatible gateway routes.
 *
 * AfuChat and AfuCloud share one Supabase project. The Worker is the public
 * API boundary, but the mobile app still uses supabase-js, whose transport
 * expects the standard /auth/v1, /rest/v1, /storage/v1, /functions/v1, and
 * /realtime/v1 paths. Forwarding those paths here keeps the client contract
 * stable while ensuring requests enter through api.afuchat.com.
 *
 * The caller's Authorization and apikey headers are forwarded. This is
 * intentional: Supabase RLS must continue to evaluate the end-user JWT. The
 * Worker service key is reserved for AfuCloud-owned routes and is never sent
 * to the client.
 */

const supabaseProxy = new Hono<{ Bindings: Env }>();

const FORWARDED_HEADERS = [
  "accept",
  "accept-encoding",
  "accept-language",
  "apikey",
  "authorization",
  "cache-control",
  "content-profile",
  "content-type",
  "cookie",
  "prefer",
  "range",
  "x-client-info",
  "x-provider-api-version",
  "x-supabase-api-version",
  "x-upsert",
  "accept-profile",
  "upgrade",
];

function upstreamUrl(request: Request, supabaseUrl: string): URL {
  const incoming = new URL(request.url);
  const upstream = new URL(supabaseUrl);
  upstream.pathname = incoming.pathname;
  upstream.search = incoming.search;
  return upstream;
}

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function proxyRequest(request: Request, supabaseUrl: string): Promise<Response> {
  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  const response = await fetch(upstreamUrl(request, supabaseUrl), {
    method,
    headers: forwardedHeaders(request),
    body,
    redirect: "manual",
  });

  const headers = new Headers(response.headers);
  headers.set("X-AfuCloud-Proxy", "supabase");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleProxy(c: { req: { raw: Request }; env: Env }): Promise<Response> {
  try {
    return await proxyRequest(c.req.raw, c.env.SUPABASE_URL);
  } catch (error) {
    console.error("[Supabase proxy error]", error);
    return Response.json({ error: "Upstream Supabase request failed" }, { status: 502 });
  }
}

// These routes mirror the paths used by @supabase/supabase-js.
supabaseProxy.all("/auth/v1/*", handleProxy);
supabaseProxy.all("/rest/v1/*", handleProxy);
supabaseProxy.all("/storage/v1/*", handleProxy);
supabaseProxy.all("/functions/v1/*", handleProxy);
supabaseProxy.all("/realtime/v1/*", handleProxy);

export default supabaseProxy;