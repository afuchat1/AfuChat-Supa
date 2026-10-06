export interface R2CdnObject {
  body?: ReadableStream<Uint8Array> | null;
  size: number;
  etag?: string;
  httpEtag?: string;
  uploaded?: Date;
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  writeHttpMetadata(headers: Headers): void;
}

export interface R2CdnBucket {
  head(key: string): Promise<R2CdnObject | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2CdnObject | null>;
}

type ByteRange = { start: number; end: number };
type ParsedRange = ByteRange | "invalid" | null;

const CDN_HOST = "cdn.afuchat.com";
const DEFAULT_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

function responseHeaders(product?: string): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, If-None-Match, If-Modified-Since, If-Range",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  if (product) headers.set("X-Afu-Storage-Product", product);
  return headers;
}

function errorResponse(product: string | undefined, message: string, status: number): Response {
  const headers = responseHeaders(product);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  if (status === 405) headers.set("Allow", "GET, HEAD, OPTIONS");
  return new Response(message, { status, headers });
}

function objectEtag(object: R2CdnObject): string | null {
  const value = object.httpEtag || object.etag;
  if (!value) return null;
  return value.startsWith('"') ? value : `"${value.replaceAll('"', "")}"`;
}

function matchesEtagHeader(value: string | null, etag: string | null): boolean {
  if (!value || !etag) return false;
  return value.split(",").some((candidate) => {
    const normalized = candidate.trim();
    return normalized === "*" || normalized === etag || normalized === `W/${etag}`;
  });
}

function parseByteRange(value: string | null, size: number): ParsedRange {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return "invalid";

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid";
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= size
  ) {
    return "invalid";
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

function rangeAllowed(request: Request, etag: string | null, uploaded?: Date): boolean {
  const ifRange = request.headers.get("If-Range");
  if (!ifRange) return true;
  if (etag && ifRange.trim() === etag) return true;
  const date = Date.parse(ifRange);
  return Number.isFinite(date) && Boolean(uploaded) && uploaded!.getTime() <= date;
}

function decodeObjectKey(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const encoded = pathname.slice(prefix.length);
  if (!encoded || encoded.length > 6144) return null;

  try {
    const segments = encoded.split("/").map((segment) => decodeURIComponent(segment));
    if (
      segments.length === 0 ||
      segments.some((segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\/\\\u0000-\u001f\u007f]/.test(segment),
      )
    ) {
      return null;
    }
    const key = segments.join("/");
    return key.length <= 2048 ? key : null;
  } catch {
    return null;
  }
}

function hasImmutableFilename(key: string): boolean {
  const filename = key.slice(key.lastIndexOf("/") + 1);
  const identifier = filename.split(".", 1)[0];
  return (
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(identifier) ||
    /^[0-9a-f]{32}$/i.test(identifier)
  );
}

async function serveObject(
  request: Request,
  bucket: R2CdnBucket,
  key: string,
  product?: string,
): Promise<Response> {
  try {
    const head = await bucket.head(key);
    if (!head) return errorResponse(product, "The requested media object was not found.", 404);

    const etag = objectEtag(head);
    const headers = responseHeaders(product);
    if (etag && matchesEtagHeader(request.headers.get("If-None-Match"), etag)) {
      headers.set("ETag", etag);
      return new Response(null, { status: 304, headers });
    }

    const rangeHeader = request.method === "GET" ? request.headers.get("Range") : null;
    const parsedRange = parseByteRange(rangeHeader, head.size);
    if (parsedRange === "invalid") {
      headers.set("Content-Range", `bytes */${head.size}`);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "no-store");
      return new Response(null, { status: 416, headers });
    }
    const range = parsedRange && rangeAllowed(request, etag, head.uploaded)
      ? parsedRange
      : null;
    const object = request.method === "HEAD"
      ? head
      : await bucket.get(
          key,
          range
            ? { range: { offset: range.start, length: range.end - range.start + 1 } }
            : undefined,
        );
    if (!object) return errorResponse(product, "The requested media object was not found.", 404);

    object.writeHttpMetadata(headers);
    headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
    if (!headers.has("Cache-Control")) {
      headers.set(
        "Cache-Control",
        hasImmutableFilename(key) ? IMMUTABLE_CACHE_CONTROL : DEFAULT_CACHE_CONTROL,
      );
    }
    if (etag) headers.set("ETag", etag);
    if (object.uploaded) headers.set("Last-Modified", object.uploaded.toUTCString());
    headers.set("Accept-Ranges", "bytes");

    if (range) {
      headers.set("Content-Length", String(range.end - range.start + 1));
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${head.size}`);
    } else {
      headers.set("Content-Length", String(head.size));
    }

    return new Response(request.method === "HEAD" ? null : object.body ?? null, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (cause) {
    console.error("CDN object read failed", {
      product: product || "legacy",
      method: request.method,
      error: cause instanceof Error ? cause.message : "unknown error",
    });
    return errorResponse(product, "The media service is temporarily unavailable.", 503);
  }
}

export async function handleR2CdnRequest(
  request: Request,
  bucket: R2CdnBucket,
  product: string,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== CDN_HOST) {
    return errorResponse(product, "The requested media object was not found.", 404);
  }

  const prefix = `/${product}/`;
  const namespaceRoot = url.pathname === `/${product}` || url.pathname === prefix;
  if (!url.pathname.startsWith(prefix) && !namespaceRoot) {
    return errorResponse(product, "The requested media object was not found.", 404);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(product) });
  }
  if (namespaceRoot) {
    return errorResponse(product, "The requested media object was not found.", 404);
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse(product, "Method not allowed", 405);
  }

  const key = decodeObjectKey(url.pathname, prefix);
  if (!key) return errorResponse(product, "The requested media object was not found.", 404);

  return serveObject(request, bucket, key, product);
}

export async function handleR2CdnLegacyRequest(
  request: Request,
  bucket: R2CdnBucket,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== CDN_HOST) {
    return errorResponse(undefined, "The requested media object was not found.", 404);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders() });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse(undefined, "Method not allowed", 405);
  }

  const key = decodeObjectKey(url.pathname, "/");
  if (!key) {
    return errorResponse(undefined, "The requested media object was not found.", 404);
  }
  return serveObject(request, bucket, key);
}
