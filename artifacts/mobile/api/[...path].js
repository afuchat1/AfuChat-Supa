/**
 * Vercel serverless function — proxies all /api/* requests to the
 * deployed Express API server (which handles R2 upload signing, proxy
 * uploads, usage stats, video encoding jobs, etc.).
 *
 * Required env var in Vercel project settings:
 *   API_SERVER_URL = https://your-api-server.example.com
 *   (the URL of your deployed artifacts/api-server — no trailing slash)
 *
 * How it works:
 *   Vercel static site has no backend, so /api/* calls from the web app
 *   would return 404. This function intercepts those calls and forwards
 *   them verbatim to the real API server, including auth headers and body.
 */

const https = require("https");
const http = require("http");

module.exports = async (req, res) => {
  const apiServerUrl = (process.env.API_SERVER_URL || "").trim().replace(/\/+$/, "");

  if (!apiServerUrl) {
    res.status(503).json({
      error:
        "API server not configured. Set API_SERVER_URL in your Vercel project environment variables " +
        "(e.g. https://your-api-server.railway.app).",
    });
    return;
  }

  const targetUrl = `${apiServerUrl}${req.url}`;

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    res.status(400).json({ error: "Invalid target URL" });
    return;
  }

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

  await new Promise((resolve) => {
    const proxyReq = transport.request(options, (proxyRes) => {
      if (!res.headersSent) {
        res.status(proxyRes.statusCode || 502);
        Object.entries(proxyRes.headers).forEach(([key, value]) => {
          const lower = key.toLowerCase();
          if (lower !== "transfer-encoding" && lower !== "connection") {
            try { res.setHeader(key, value); } catch { /* skip invalid headers */ }
          }
        });
      }
      proxyRes.pipe(res, { end: true });
      proxyRes.on("end", resolve);
      proxyRes.on("error", resolve);
    });

    proxyReq.on("error", (err) => {
      console.error(`[api-proxy] Error proxying ${req.url}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: `API server unreachable: ${err.message}` });
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
