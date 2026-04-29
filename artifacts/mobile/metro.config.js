const { getDefaultConfig } = require("expo/metro-config");
const http = require("http");

const config = getDefaultConfig(__dirname);

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
      if (req.url && req.url.startsWith("/api/")) {
        return proxyApi(req, res);
      }
      return wrapped(req, res, next);
    };
  },
};

module.exports = config;
