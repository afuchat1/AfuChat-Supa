export interface R2ObjectLike {
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  range?: { offset: number; length: number };
  body?: ReadableStream<Uint8Array> | null;
  writeHttpMetadata(headers: Headers): void;
}

export interface AfuChatAssetsBucket {
  head(key: string): Promise<R2ObjectLike | null>;
  get(
    key: string,
    options?: {
      range?: { offset: number; length: number };
      onlyIf?: { etagMatches?: string };
    },
  ): Promise<R2ObjectLike | null>;
}

const ASSET_PREFIX = "/chat/";
const EXPOSED_HEADERS =
  "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified";

interface ByteRange {
  offset: number;
  length: number;
}

function assetHeaders(
  object: R2ObjectLike,
  requestId: string,
  range?: ByteRange,
): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("X-AfuChat-Request-Id", requestId);
  headers.set("X-AfuChat-Version", "v1");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", EXPOSED_HEADERS);
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", object.httpEtag || `"${object.etag}"`);
  headers.set("Last-Modified", object.uploaded.toUTCString());
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/octet-stream");
  }
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  }

  if (range) {
    const end = range.offset + range.length - 1;
    headers.set("Content-Length", String(range.length));
    headers.set("Content-Range", `bytes ${range.offset}-${end}/${object.size}`);
  } else {
    headers.set("Content-Length", String(object.size));
    headers.delete("Content-Range");
  }
  return headers;
}

function response(
  body: BodyInit | null,
  status: number,
  requestId: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("X-AfuChat-Request-Id", requestId);
  headers.set("X-AfuChat-Version", "v1");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", EXPOSED_HEADERS);
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  return new Response(body, { status, headers });
}

function keyFromPath(pathname: string): string | null {
  if (!pathname.startsWith(ASSET_PREFIX)) return null;

  let key: string;
  try {
    key = decodeURIComponent(pathname.slice(ASSET_PREFIX.length));
  } catch {
    return null;
  }

  if (
    !key ||
    key.startsWith("/") ||
    key.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(key) ||
    key.split("/").some((segment) => segment === "." || segment === "..") ||
    new TextEncoder().encode(key).byteLength > 1024
  ) {
    return null;
  }
  return key;
}

function entityTagMatches(header: string, etag: string, weak: boolean): boolean {
  const normalizedEtag = weak ? etag.replace(/^W\//, "") : etag;
  return header.split(",").some((value) => {
    const candidate = value.trim();
    if (candidate === "*") return true;
    if (!weak && candidate.startsWith("W/")) return false;
    return (weak ? candidate.replace(/^W\//, "") : candidate) === normalizedEtag;
  });
}

function conditionalStatus(request: Request, object: R2ObjectLike): 304 | 412 | null {
  const etag = object.httpEtag || `"${object.etag}"`;
  const modifiedAtSecond = Math.floor(object.uploaded.getTime() / 1000) * 1000;
  const ifMatch = request.headers.get("If-Match");
  if (ifMatch && !entityTagMatches(ifMatch, etag, false)) return 412;

  const ifUnmodifiedSince = request.headers.get("If-Unmodified-Since");
  if (!ifMatch && ifUnmodifiedSince) {
    const date = Date.parse(ifUnmodifiedSince);
    if (Number.isFinite(date) && modifiedAtSecond > date) return 412;
  }

  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch && entityTagMatches(ifNoneMatch, etag, true)) return 304;

  const ifModifiedSince = request.headers.get("If-Modified-Since");
  if (!ifNoneMatch && ifModifiedSince) {
    const date = Date.parse(ifModifiedSince);
    if (Number.isFinite(date) && modifiedAtSecond <= date) return 304;
  }
  return null;
}

function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (!header?.startsWith("bytes=") || header.includes(",")) return null;
  const value = header.slice("bytes=".length).trim();
  const match = /^(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || size === 0) {
      return "unsatisfiable";
    }
    const length = Math.min(suffixLength, size);
    return { offset: size - length, length };
  }

  const offset = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(requestedEnd) ||
    offset < 0 ||
    requestedEnd < offset ||
    offset >= size
  ) {
    return "unsatisfiable";
  }
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1 };
}

function ifRangeMatches(request: Request, object: R2ObjectLike): boolean {
  const ifRange = request.headers.get("If-Range");
  if (!ifRange) return true;
  const etag = object.httpEtag || `"${object.etag}"`;
  if (ifRange.startsWith('"') || ifRange.startsWith("W/")) {
    return !ifRange.startsWith("W/") && ifRange === etag;
  }
  const date = Date.parse(ifRange);
  return Number.isFinite(date) && object.uploaded.getTime() <= date;
}

function invalidRangeResponse(requestId: string, size: number): Response {
  const headers = new Headers({
    "Content-Range": `bytes */${size}`,
    "Content-Length": "0",
    "Cache-Control": "no-store",
  });
  return response(null, 416, requestId, headers);
}

function errorResponse(
  requestId: string,
  status: number,
  message: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return response(message, status, requestId, headers);
}

export async function handleCdnAssetRequest(
  request: Request,
  bucket: AfuChatAssetsBucket | undefined,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const key = keyFromPath(url.pathname);
  if (!key) return errorResponse(requestId, 400, "Invalid asset path");

  if (request.method === "OPTIONS") {
    return response(null, 204, requestId, {
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match, If-Modified-Since",
      "Access-Control-Max-Age": "86400",
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse(requestId, 405, "Method not allowed", { Allow: "GET, HEAD, OPTIONS" });
  }
  if (!bucket) return errorResponse(requestId, 503, "The requested media is temporarily unavailable.");

  const rangeHeader = request.headers.get("Range");
  const hasConditions = [
    "If-Match",
    "If-Unmodified-Since",
    "If-None-Match",
    "If-Modified-Since",
  ].some((header) => request.headers.has(header));

  try {
    let metadata: R2ObjectLike | null = null;
    if (request.method === "HEAD" || rangeHeader || hasConditions) {
      metadata = await bucket.head(key);
      if (!metadata) return errorResponse(requestId, 404, "Asset not found");

      const status = conditionalStatus(request, metadata);
      if (status) {
        const headers = assetHeaders(metadata, requestId);
        headers.delete("Content-Length");
        return response(null, status, requestId, headers);
      }
    }

    let range: ByteRange | null = null;
    if (rangeHeader && metadata && ifRangeMatches(request, metadata)) {
      const parsed = parseRange(rangeHeader, metadata.size);
      if (parsed === "unsatisfiable") {
        return invalidRangeResponse(requestId, metadata.size);
      }
      range = parsed;
    }

    if (request.method === "HEAD") {
      const headers = assetHeaders(metadata!, requestId, range ?? undefined);
      return response(null, range ? 206 : 200, requestId, headers);
    }

    const object = await bucket.get(
      key,
      metadata
        ? {
            ...(range ? { range } : {}),
            onlyIf: { etagMatches: metadata.etag },
          }
        : undefined,
    );
    if (!object) return errorResponse(requestId, 404, "Asset not found");
    if (object.body === undefined) {
      return errorResponse(requestId, 412, "Asset changed during request");
    }

    const responseRange = object.range ?? range ?? undefined;
    const headers = assetHeaders(object, requestId, responseRange);
    return response(object.body, responseRange ? 206 : 200, requestId, headers);
  } catch (cause) {
    console.error("[afuchat-api] CDN object read failed", {
      requestId,
      error: cause instanceof Error ? cause.message : "unknown error",
    });
    return errorResponse(requestId, 502, "The requested media is temporarily unavailable.");
  }
}