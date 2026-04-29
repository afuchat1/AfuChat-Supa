/**
 * Standalone production server for Expo static builds.
 *
 * Smart proxy server that routes two types of traffic:
 * - SEO/public routes (/@handle, /p/*, /og/*, /robots.txt, /sitemap.xml, /) → API server (port 3000)
 * - All other routes → Expo static build (index.html SPA)
 *
 * This ensures Google can crawl server-rendered pages with full metadata instead
 * of the client-side JS app that requires JavaScript execution.
 *
 * Zero external dependencies — uses only Node.js built-ins.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");
const API_PORT = parseInt(process.env.API_PORT || "3000", 10);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

/**
 * Routes that must be handled by the Express API server for proper
 * server-rendered HTML with SEO metadata, JSON-LD, and Open Graph tags.
 * These are the pages that Google will crawl and index.
 */
const SEO_ROUTE = /^(\/@[^/]|\/p\/|\/post\/|\/og\/|\/sitemap\.xml$|\/robots\.txt$|\/.well-known\/)/;
const API_ROUTE = /^\/api\//;

function proxyToApi(req, res) {
  const options = {
    hostname: "127.0.0.1",
    port: API_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${API_PORT}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error(`[proxy] API error for ${req.url}:`, err.message);
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("Service temporarily unavailable");
  });

  if (req.method !== "GET" && req.method !== "HEAD") {
    req.pipe(proxyReq, { end: true });
  } else {
    proxyReq.end();
  }
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(STATIC_ROOT, safePath);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  // Root path, /api/*, and SEO routes → proxy to Express API server.
  // Without proxying /api/* the web client would receive the SPA
  // index.html for backend calls and crash with a JSON parse error.
  if (pathname === "/" || API_ROUTE.test(pathname) || SEO_ROUTE.test(pathname)) {
    return proxyToApi(req, res);
  }

  // Expo platform manifest requests
  if (pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }
  }

  // Try to serve a static file from the Expo build
  const staticFilePath = path.join(STATIC_ROOT, pathname);
  if (
    fs.existsSync(staticFilePath) &&
    !fs.statSync(staticFilePath).isDirectory()
  ) {
    return serveStaticFile(pathname, res);
  }

  // All other routes → Expo SPA (index.html handles client-side routing)
  serveStaticFile("/index.html", res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(
    `[serve] Web server on port ${port} — SEO routes proxied to API on port ${API_PORT}`,
  );
});
