const { getDefaultConfig } = require("expo/metro-config");
const http = require("http");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude the mockup-sandbox vite build artefacts from Metro's file watcher.
// Without this, Metro crashes with ENOENT when Vite rotates its deps_temp_*
// directories during a hot-reload cycle.
config.resolver = {
  ...(config.resolver || {}),
  blockList: /artifacts[\\/]mockup-sandbox[\\/].*/,
};

/**
 * EXPO_NO_LAZY=1 is set in the workflow env so Metro never uses multipart/mixed
 * streaming responses. This prevents the "Error while reading multipart response"
 * crash that Expo Go on Android shows when the bundle download is interrupted by
 * the Replit tunnel proxy.
 *
 * Additional hardening here:
 *  - Increased socket timeout to handle proxy latency
 *  - Fewer transformer workers to avoid OOM pressure during first bundle
 */

// Limit worker threads — large projects + Replit's 2 GB RAM limit = OOM risk
config.maxWorkers = 2;

// Transformer: use fewer inline requires to reduce bundle complexity
config.transformer = {
  ...(config.transformer || {}),
  minifierConfig: {
    ...(config.transformer?.minifierConfig || {}),
  },
};

/**
 * Dev-only proxy: forward all `/api/*` requests to the local API server
 * (Express, port 3000 by default). Without this, fetch("/api/...") on the
 * web bundle would hit Metro itself, which returns the SPA index.html and
 * causes "Failed to execute 'json' on 'Response': Unexpected token '<'"
 * errors in the client.
 */
const API_TARGET_PORT = parseInt(process.env.API_PORT || "3000", 10);
const API_TARGET_HOST = process.env.API_HOST || "127.0.0.1";

function proxyApi(req, res) {
  const options = {
    hostname: API_TARGET_HOST,
    port: API_TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${API_TARGET_HOST}:${API_TARGET_PORT}` },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", (err) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: `API server unreachable on ${API_TARGET_HOST}:${API_TARGET_PORT}: ${err.message}`,
      }),
    );
  });
  if (req.method !== "GET" && req.method !== "HEAD") {
    req.pipe(proxyReq, { end: true });
  } else {
    proxyReq.end();
  }
}

const originalEnhance = config.server?.enhanceMiddleware;
config.server = {
  ...(config.server || {}),
  enhanceMiddleware: (middleware, server) => {
    const wrapped = originalEnhance
      ? originalEnhance(middleware, server)
      : middleware;
    return (req, res, next) => {
      // Extend socket timeout for all requests — Replit proxy adds latency and
      // the default 30 s timeout kills large bundle transfers on slow connections.
      req.socket?.setTimeout?.(120_000);
      res.setTimeout?.(120_000);

      if (req.url && req.url.startsWith("/api/")) {
        return proxyApi(req, res);
      }
      return wrapped(req, res, next);
    };
  },
};

module.exports = config;
