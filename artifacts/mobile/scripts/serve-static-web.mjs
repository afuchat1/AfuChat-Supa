import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "dist");
const port = Number(process.env.PORT || 5000);

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

  const segments = clean.split("/");
  if (segments.length === 1) {
    candidates.push("[handle].html");
  } else {
    const dynamicNames = {
      article: "[id].html",
      app: "[appId].html",
      call: "[id].html",
      channel: "[id].html",
      chat: "[id].html",
      "chat-info": "[id].html",
      company: "[slug].html",
      contact: "[id].html",
      freelance: "[id].html",
      group: "[id].html",
      id: "[afuId].html",
      join: "[code].html",
      match: "[id].html",
      post: "[id].html",
      report: "[userId].html",
      video: "[id].html",
    };
    const dynamicName = dynamicNames[segments[0]];
    if (dynamicName) candidates.push(`${segments[0]}/${dynamicName}`);
  }

  return candidates;
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
    response.writeHead(filePath.endsWith(".html") ? 200 : 200, {
      "Cache-Control": filePath.endsWith(".html") ? "public, max-age=60" : "public, max-age=31536000, immutable",
      "Content-Type": fileType,
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    console.error("[static-web] request failed", error);
    response.writeHead(500);
    response.end("Internal server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`[static-web] serving ${root} on port ${port}`);
});