import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  constants as zlibConstants,
  createBrotliCompress,
  createGzip,
} from "node:zlib";
import { decoratePublicHtml } from "./public-crawler.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "dist");
const port = Number(process.env.PORT || 5000);

async function collectHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectHtmlFiles(filePath)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(filePath);
  }
  return files;
}

function routePatternForFile(filePath) {
  let route = relative(root, filePath).replaceAll("\\", "/").replace(/\.html$/, "");
  const parts = route.split("/");
  if (parts.at(-1) === "index") parts.pop();
  const visibleParts = parts.filter((part) => !/^\([^/]+\)$/.test(part));
  return `/${visibleParts.join("/")}`.replace(/\/$/, "") || "/";
}

function isDynamicRoutePattern(route) {
  return route.split("/").some((part) => /^\[.+\]$/.test(part));
}

function matchesRoutePattern(pattern, pathname) {
  const expected = pattern.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  let expectedIndex = 0;
  let actualIndex = 0;
  while (expectedIndex < expected.length) {
    const part = expected[expectedIndex];
    if (/^\[\[\.\.\..+\]\]$/.test(part)) return true;
    if (/^\[\.\.\..+\]$/.test(part)) return actualIndex < actual.length;
    if (actualIndex >= actual.length) return false;
    if (!/^\[[^/]+\]$/.test(part) && part !== actual[actualIndex]) return false;
    expectedIndex += 1;
    actualIndex += 1;
  }
  return actualIndex === actual.length;
}

const dynamicRouteFiles = (await collectHtmlFiles(root).catch(() => []))
  .map((filePath) => ({
    filePath,
    route: routePatternForFile(filePath),
  }))
  .filter(({ route }) => isDynamicRoutePattern(route));

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function acceptsEncoding(header, encoding) {
  const entries = String(header || "")
    .toLowerCase()
    .split(",")
    .map((part) => part.trim().split(";").map((value) => value.trim()));
  const entry = entries.find(([name]) => name === encoding)
    ?? entries.find(([name]) => name === "*");
  if (!entry) return false;

  const quality = entry
    .slice(1)
    .map((parameter) => parameter.split("="))
    .find(([name]) => name === "q")?.[1];
  return quality === undefined || Number(quality) > 0;
}

function compressibleContentType(contentType) {
  const mimeType = contentType.split(";")[0].trim().toLowerCase();
  return mimeType.startsWith("text/")
    || mimeType === "application/javascript"
    || mimeType === "application/json"
    || mimeType === "application/wasm"
    || mimeType === "image/svg+xml";
}

function sendContent(request, response, {
  cacheControl,
  contentType,
  body,
}) {
  const canCompress = compressibleContentType(contentType);
  const acceptEncoding = request.headers["accept-encoding"];
  const encoding = canCompress && acceptsEncoding(acceptEncoding, "br")
    ? "br"
    : canCompress && acceptsEncoding(acceptEncoding, "gzip")
      ? "gzip"
      : null;
  const headers = {
    "Cache-Control": cacheControl,
    "Content-Type": contentType,
    ...(canCompress ? { Vary: "Accept-Encoding" } : {}),
    ...(encoding ? { "Content-Encoding": encoding } : {}),
  };

  response.writeHead(200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const source = typeof body === "string" ? Readable.from([body]) : body;
  if (encoding === "br") {
    source
      .pipe(createBrotliCompress({
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
      }))
      .pipe(response);
  } else if (encoding === "gzip") {
    source.pipe(createGzip({ level: 5 })).pipe(response);
  } else {
    source.pipe(response);
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function safePath(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0] || "/");
  const normalized = normalize(pathname).replaceAll("\\", "/");
  if (!normalized.startsWith("/") || normalized.includes("/../") || normalized === "/..") return null;
  return normalized;
}

function routeCandidates(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  if (!clean) return ["index.html"];

  const candidates = [
    `${clean}.html`,
    `${clean}/index.html`,
  ];
  const dynamicMatches = dynamicRouteFiles
    .filter(({ route }) => matchesRoutePattern(route, pathname))
    .sort((a, b) => {
      const staticParts = (route) => route.split("/").filter(Boolean).filter((part) => !/^\[.+\]$/.test(part)).length;
      return staticParts(b.route) - staticParts(a.route);
    })
    .map(({ filePath }) => relative(root, filePath));

  return [...new Set([...candidates, ...dynamicMatches])];
}

async function resolveFile(pathname) {
  const direct = join(root, pathname === "/" ? "index.html" : pathname.slice(1));
  if (await exists(direct) && (await stat(direct)).isFile()) return direct;

  for (const candidate of routeCandidates(pathname)) {
    const filePath = join(root, candidate);
    if (await exists(filePath) && (await stat(filePath)).isFile()) return filePath;
  }

  const notFound = join(root, "+not-found.html");
  return (await exists(notFound)) ? notFound : null;
}

createServer(async (request, response) => {
  try {
    const pathname = safePath(request.url || "/");
    if (!pathname) {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }

    const filePath = await resolveFile(pathname);
    if (!filePath) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const fileType = contentTypes[extname(filePath)] || "application/octet-stream";
    if (filePath.endsWith(".html")) {
      const html = await readFile(filePath, "utf8");
      const enhancedHtml = await decoratePublicHtml(pathname, html);
      sendContent(request, response, {
        cacheControl: "public, max-age=60",
        contentType: "text/html; charset=utf-8",
        body: enhancedHtml,
      });
      return;
    }

    sendContent(request, response, {
      cacheControl: "public, max-age=31536000, immutable",
      contentType: fileType,
      body: createReadStream(filePath),
    });
  } catch (error) {
    console.error("[static-web] request failed", error);
    response.writeHead(500);
    response.end("Internal server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`[static-web] serving ${root} on port ${port}`);
});