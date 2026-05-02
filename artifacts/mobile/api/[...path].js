/**
 * Vercel serverless function — proxies all /api/* requests to the
 * deployed API server (Express). This is needed because Vercel hosts the
 * Expo web build as a static site with no backend, so /api/* calls would
 * otherwise return 404.
 *
 * Required env var in Vercel project settings:
 *   API_SERVER_URL = https://your-api-server.example.com
 *   (no trailing slash — e.g. the Railway/Render/Fly URL for api-server)
 */

const https = require("https");
const http = require("http");

module.exports = async (req, res) => {
  const apiServerUrl = process.env.API_SERVER_URL;

  if (!apiServerUrl) {
    res.status(503).json({
      error:
        "API server not configured. Set the API_SERVER_URL environment variable in your Vercel project settings.",
    });
    return;
  }

  const base = apiServerUrl.replace(/\/+$/, "");
  const targetUrl = `${base}${req.url}`;

  const parsed = new URL(targetUrl);
  const isHttps = parsed.protocol === "https:";
  const transport = isHttps ? https : http;

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: parsed.hostname,
    },
  };

  await new Promise((resolve, reject) => {
    const proxyReq = transport.request(options, (proxyRes) => {
      res.status(proxyRes.statusCode);
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (
          key.toLowerCase() !== "transfer-encoding" &&
          key.toLowerCase() !== "connection"
        ) {
          res.setHeader(key, value);
        }
      });
      proxyRes.pipe(res, { end: true });
      proxyRes.on("end", resolve);
    });

    proxyReq.on("error", (err) => {
      console.error(`[api-proxy] Error proxying ${req.url}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: `API server unreachable: ${err.message}`,
        });
      }
      resolve();
    });

    if (req.method !== "GET" && req.method !== "HEAD") {
      req.pipe(proxyReq, { end: true });
    } else {
      proxyReq.end();
    }
  });
};
