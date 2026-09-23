import type { Env } from "../types";

type Query = string | URLSearchParams | undefined;

function databaseUrl(env: Env, path: string, query?: Query): string {
  const base = `${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${path}`;
  if (!query) return base;
  const suffix = typeof query === "string" ? query : query.toString();
  return suffix ? `${base}?${suffix.replace(/^\?/, "")}` : base;
}

function headers(env: Env, schema = "public"): Headers {
  const result = new Headers({
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
  });
  return result;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string; hint?: string };
      detail = [parsed.message ?? parsed.error, parsed.hint].filter(Boolean).join(": ") || text;
    } catch {
      // Keep the upstream response text in the server log.
    }
    throw new Error(`Supabase REST ${response.status}: ${detail.slice(0, 500)}`);
  }
  if (!text) return null;
  return JSON.parse(text);
}

export function createPublicDbClient(env: Env) {
  async function request(
    path: string,
    query?: Query,
    method = "GET",
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<unknown> {
    const requestHeaders = headers(env);
    for (const [key, value] of Object.entries(extraHeaders ?? {})) requestHeaders.set(key, value);
    const response = await fetch(databaseUrl(env, path, query), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseResponse(response);
  }

  return {
    select<T = any>(table: string, query = "") {
      return request(table, query) as Promise<T[]>;
    },
    insert<T = any>(table: string, body: unknown, options: { returning?: boolean } = {}) {
      return request(
        table,
        undefined,
        "POST",
        body,
        options.returning === false ? {} : { Prefer: "return=representation" },
      ) as Promise<T[]>;
    },
    upsert<T = any>(table: string, body: unknown, onConflict: string) {
      return request(
        table,
        `on_conflict=${encodeURIComponent(onConflict)}`,
        "POST",
        body,
        { Prefer: "resolution=merge-duplicates,return=representation" },
      ) as Promise<T[]>;
    },
    update<T = any>(table: string, query: string, body: unknown) {
      return request(table, query, "PATCH", body, { Prefer: "return=representation" }) as Promise<T[]>;
    },
    remove<T = any>(table: string, query: string) {
      return request(table, query, "DELETE", undefined, { Prefer: "return=representation" }) as Promise<T[]>;
    },
    rpc<T = any>(name: string, body: Record<string, unknown>) {
      return request(`rpc/${name}`, undefined, "POST", body) as Promise<T>;
    },
  };
}

export function firstRow<T>(rows: T[] | null | undefined): T | null {
  return rows?.[0] ?? null;
}