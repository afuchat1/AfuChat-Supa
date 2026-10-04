interface Env {
  AFUCHAT_ASSETS: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  MAX_UPLOAD_BYTES?: string;
}

interface AuthenticatedUser {
  id: string;
  token: string;
}

interface ByteRange {
  start: number;
  end: number;
}

const API_PREFIX = "/afuchat";
const API_STORAGE_PREFIX = "/v1/storage/";
const CONTAINERS_PREFIX = "containers/";
const CDN_PREFIX = "/chat/";
const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
const OBJECT_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

class UploadTooLargeError extends Error {}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

function isTrustedAppOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:" && protocol !== "http:") return false;
    return (
      hostname === "afuchat.com" ||
      hostname.endsWith(".afuchat.com") ||
      hostname === "localhost" ||
      hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

function corsHeaders(request: Request, publicAsset = false): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, HEAD, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Range, If-None-Match, If-Modified-Since",
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified, X-AfuChat-Request-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
  const origin = request.headers.get("Origin");
  if (!origin) return headers;
  if (publicAsset) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else if (isTrustedAppOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  return headers;
}

function decorate(
  response: Response,
  request: Request,
  requestId: string,
  publicAsset = false,
): Response {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(request, publicAsset)) {
    if (key.toLowerCase() === "vary" && headers.has("Vary")) {
      headers.set("Vary", `${headers.get("Vary")}, Origin`);
    } else {
      headers.set(key, value);
    }
  }
  headers.set("X-AfuChat-Request-Id", requestId);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function containerSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function validContainerId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,47}$/.test(value);
}

function safeObjectName(value: string): string | null {
  if (!value || value.length > 1024 || value.startsWith("/") || value.includes("\\")) {
    return null;
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }
  return value;
}

function containerPrefix(userId: string, containerId: string): string {
  return `${CONTAINERS_PREFIX}${userId}/${containerId}/`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function encodeKeyPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function cdnUrl(key: string): string {
  return `https://cdn.afuchat.com${CDN_PREFIX}${encodeKeyPath(key)}`;
}

function decodeKeyPath(encoded: string): string | null {
  try {
    const key = encoded
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
    if (!key.startsWith(CONTAINERS_PREFIX) || key.length > 2048) return null;
    const segments = key.split("/");
    if (
      segments.length < 4 ||
      !isUuid(segments[1]) ||
      !validContainerId(segments[2]) ||
      segments.slice(3).some((segment) => !segment || segment === "." || segment === "..")
    ) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

async function authenticate(
  request: Request,
  env: Env,
): Promise<{ user: AuthenticatedUser | null; response?: Response }> {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { user: null, response: error("Authentication required", 401) };
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return { user: null, response: error("Authentication is not configured", 503) };
  }

  try {
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${match[1]}`,
      },
    });
    if (response.status === 401 || response.status === 403) {
      return { user: null, response: error("Session is invalid or expired", 401) };
    }
    if (!response.ok) {
      return { user: null, response: error("Could not verify the session", 502) };
    }
    const data = (await response.json()) as { id?: unknown };
    if (typeof data.id !== "string" || !isUuid(data.id)) {
      return { user: null, response: error("Session returned an invalid user", 401) };
    }
    return { user: { id: data.id, token: match[1] } };
  } catch {
    return { user: null, response: error("Session verification is unavailable", 502) };
  }
}

async function readJson(request: Request, maxBytes = 64 * 1024): Promise<any | null> {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxBytes) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function storageUsage(userId: string, env: Env): Promise<Response> {
  const rootPrefix = `${CONTAINERS_PREFIX}${userId}/`;
  const perBucket: Record<string, { bytes: number; count: number }> = {};
  let usedBytes = 0;
  let usedCount = 0;
  let cursor: string | undefined;
  do {
    const page = await env.AFUCHAT_ASSETS.list({ prefix: rootPrefix, limit: 1000, cursor });
    for (const object of page.objects) {
      const bucket = object.key.slice(rootPrefix.length).split("/")[0];
      if (!validContainerId(bucket)) continue;
      const bucketUsage = (perBucket[bucket] ||= { bytes: 0, count: 0 });
      bucketUsage.bytes += object.size;
      bucketUsage.count += 1;
      usedBytes += object.size;
      usedCount += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json({
    user_id: userId,
    used_bytes: usedBytes,
    used_count: usedCount,
    quota_bytes: STORAGE_QUOTA_BYTES,
    remaining_bytes: Math.max(0, STORAGE_QUOTA_BYTES - usedBytes),
    percent_used: Math.min(100, (usedBytes / STORAGE_QUOTA_BYTES) * 100),
    per_bucket: perBucket,
  });
}

async function listContainers(userId: string, env: Env): Promise<Response> {
  const result = await env.AFUCHAT_ASSETS.list({
    prefix: `${CONTAINERS_PREFIX}${userId}/`,
    delimiter: "/",
    limit: 1000,
  });
  const containers = result.delimitedPrefixes
    .map((prefix) => prefix.split("/")[2] || "")
    .filter((id) => validContainerId(id))
    .map((id) => ({ id, name: id, slug: id }));
  return json(containers);
}

function parseByteRange(value: string | null, size: number): ByteRange | null | "invalid" {
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return "invalid";

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid";
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return "invalid";
  }
  return { start, end: Math.min(end, size - 1) };
}

async function serveObject(request: Request, key: string, env: Env): Promise<Response> {
  const head = await env.AFUCHAT_ASSETS.head(key);
  if (!head) return error("Object not found", 404);

  const etag = `"${head.httpEtag.replaceAll('"', "")}"`;
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const range = parseByteRange(request.headers.get("Range"), head.size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${head.size}`, "Accept-Ranges": "bytes" },
    });
  }

  const object = await env.AFUCHAT_ASSETS.get(
    key,
    range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : undefined,
  );
  if (!object) return error("Object not found", 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Cache-Control", OBJECT_CACHE_CONTROL);
  headers.set("ETag", etag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(range ? range.end - range.start + 1 : head.size));
  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${head.size}`);
  }
  return new Response(request.method === "HEAD" ? null : object.body, {
    status: range ? 206 : 200,
    headers,
  });
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  if (path === "/healthz" && request.method === "GET") {
    return json({ status: "ok", service: "afuchat-media-worker" });
  }

  if (path === "/v1/auth/session" && request.method === "POST") {
    const auth = await authenticate(request, env);
    if (!auth.user) return auth.response || error("Authentication required", 401);
    return json({ userId: auth.user.id, accessToken: auth.user.token });
  }

  const usageMatch = path === "/v1/storage/usage" && request.method === "GET";
  const containersPath = path === "/v1/storage-containers";
  const containerIdMatch = path.match(/^\/v1\/storage-containers\/([^/]+)(?:\/(.*))?$/);
  if (!usageMatch && !containersPath && !containerIdMatch) {
    if (path.startsWith(API_STORAGE_PREFIX) && ["GET", "HEAD"].includes(request.method)) {
      const key = decodeKeyPath(path.slice(API_STORAGE_PREFIX.length));
      return key ? serveObject(request, key, env) : error("Invalid storage key", 400);
    }
    return error("Route not found", 404);
  }

  const auth = await authenticate(request, env);
  if (!auth.user) return auth.response || error("Authentication required", 401);
  const userId = auth.user.id;

  if (usageMatch) return storageUsage(userId, env);
  if (containersPath && request.method === "GET") return listContainers(userId, env);
  if (containersPath && request.method === "POST") {
    const body = await readJson(request);
    if (typeof body?.name !== "string") return error("A container name is required", 400);
    const id = containerSlug(body.name);
    if (!validContainerId(id)) return error("Invalid container name", 400);
    return json({ id, name: body.name, slug: id });
  }
  if (!containerIdMatch) return error("Route not found", 404);

  let containerId: string;
  try {
    containerId = decodeURIComponent(containerIdMatch[1]);
  } catch {
    return error("Invalid container", 400);
  }
  if (!validContainerId(containerId)) return error("Invalid container", 400);
  const action = containerIdMatch[2] || "";
  const prefix = containerPrefix(userId, containerId);

  if (action === "upload" && request.method === "POST") {
    const name = safeObjectName(new URL(request.url).searchParams.get("name") || "");
    if (!name) return error("Invalid object name", 400);
    if (!request.body) return error("Upload body is empty", 400);
    const contentLengthHeader = request.headers.get("Content-Length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
    const maxBytes = Math.max(
      1,
      Number(env.MAX_UPLOAD_BYTES) || DEFAULT_MAX_UPLOAD_BYTES,
    );
    if (contentLength !== undefined && (!Number.isFinite(contentLength) || contentLength > maxBytes)) {
      return error("File exceeds the upload limit", 413);
    }

    let bytesReceived = 0;
    const limitedBody = request.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytesReceived += chunk.byteLength;
          if (bytesReceived > maxBytes) throw new UploadTooLargeError();
          controller.enqueue(chunk);
        },
      }),
    );
    const key = `${prefix}${name}`;
    try {
      const stored = await env.AFUCHAT_ASSETS.put(key, limitedBody, {
        httpMetadata: {
          contentType: request.headers.get("Content-Type") || "application/octet-stream",
          cacheControl: OBJECT_CACHE_CONTROL,
        },
        customMetadata: { ownerId: userId, containerId },
      });
      return json({ key, size: stored.size, etag: stored.etag });
    } catch (cause) {
      if (cause instanceof UploadTooLargeError) {
        return error("File exceeds the upload limit", 413);
      }
      return error("Upload failed", 502);
    }
  }

  if (action === "objects" && request.method === "GET") {
    const cursor = new URL(request.url).searchParams.get("cursor") || undefined;
    if (cursor && cursor.length > 4096) return error("Invalid pagination cursor", 400);
    const page = await env.AFUCHAT_ASSETS.list({ prefix, limit: 1000, cursor });
    return json({
      objects: page.objects.map((object) => ({
        key: object.key,
        size: object.size,
        updatedAt: object.uploaded.toISOString(),
        url: cdnUrl(object.key),
      })),
      nextToken: page.truncated ? page.cursor : null,
    });
  }

  if (action === "objects/confirm" && request.method === "POST") {
    const body = await readJson(request);
    const name = typeof body?.name === "string" ? safeObjectName(body.name) : null;
    if (!name || typeof body?.key !== "string") return error("Invalid upload confirmation", 400);
    const expectedKey = `${prefix}${name}`;
    if (body.key !== expectedKey) return error("Object is outside this container", 403);
    const object = await env.AFUCHAT_ASSETS.head(expectedKey);
    if (!object) return error("Uploaded object was not found", 404);
    if (Number.isFinite(Number(body.size)) && Number(body.size) > 0 && Number(body.size) !== object.size) {
      return error("Uploaded object size does not match", 409);
    }
    return json({
      key: object.key,
      size: object.size,
      etag: object.etag,
      url: cdnUrl(object.key),
    });
  }

  if (action === "objects/by-key" && request.method === "DELETE") {
    const body = await readJson(request);
    if (typeof body?.key !== "string" || !body.key.startsWith(prefix)) {
      return error("Object is outside this container", 403);
    }
    const parsedKey = decodeKeyPath(encodeKeyPath(body.key));
    if (!parsedKey || parsedKey !== body.key) return error("Invalid storage key", 400);
    await env.AFUCHAT_ASSETS.delete(parsedKey);
    return json({ ok: true });
  }

  return error("Route not found", 404);
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const apiRequest = url.pathname.startsWith(`${API_PREFIX}/`);
  const publicAsset = url.pathname.startsWith(CDN_PREFIX);

  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin");
    if (apiRequest && origin && !isTrustedAppOrigin(origin)) {
      return error("Origin is not allowed", 403);
    }
    return new Response(null, { status: 204 });
  }

  if (apiRequest) {
    const origin = request.headers.get("Origin");
    if (origin && !isTrustedAppOrigin(origin)) return error("Origin is not allowed", 403);
    return handleApi(request, env, url.pathname.slice(API_PREFIX.length));
  }

  if (publicAsset && ["GET", "HEAD"].includes(request.method)) {
    const key = decodeKeyPath(url.pathname.slice(CDN_PREFIX.length));
    return key ? serveObject(request, key, env) : error("Invalid storage key", 400);
  }

  if (url.pathname === "/healthz" && request.method === "GET") {
    return json({ status: "ok", service: "afuchat-media-worker" });
  }
  return error("Route not found", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const publicAsset = new URL(request.url).pathname.startsWith(CDN_PREFIX);
    try {
      const response = await handleRequest(request, env);
      return decorate(response, request, requestId, publicAsset);
    } catch (cause) {
      console.error("AfuChat media request failed", {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        error: cause instanceof Error ? cause.message : "unknown",
      });
      return decorate(error("Internal server error", 500), request, requestId, publicAsset);
    }
  },
};