const API_HOST = "api.afuchat.com";
const ROOT_ROUTE = new Map([["/", "AFUAUTH_API"]]);
const INTERNAL_FIELDS = new Set([
  "binding",
  "bindings",
  "bucket",
  "cloudflare",
  "database",
  "host",
  "hostname",
  "provider",
  "r2",
  "server",
  "service",
  "services",
  "stack",
  "stacktrace",
  "upstream",
  "worker",
]);

function isInternalField(key) {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");
  return INTERNAL_FIELDS.has(normalized) ||
    normalized.startsWith("cf") ||
    normalized.includes("binding") ||
    normalized.includes("bucket") ||
    normalized.includes("cloudflare") ||
    normalized.includes("database") ||
    normalized.includes("hostname") ||
    normalized.includes("provider") ||
    normalized.includes("r2") ||
    normalized.includes("service") ||
    normalized.includes("stack") ||
    normalized.includes("upstream") ||
    normalized.includes("worker");
}

function stripInternalFields(value) {
  if (Array.isArray(value)) return value.map(stripInternalFields);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isInternalField(key))
      .map(([key, nested]) => [key, stripInternalFields(nested)]),
  );
}

async function sanitizeRootResponse(response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== "object") return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  for (const key of [...headers.keys()]) {
    if (isInternalField(key)) headers.delete(key);
  }
  return new Response(JSON.stringify(stripInternalFields(payload)), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function resolveService(pathname) {
  return ROOT_ROUTE.get(pathname) ?? null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const json = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });

    if (url.hostname.toLowerCase() !== API_HOST) {
      return json(404, { error: "The requested API endpoint was not found." });
    }

    const serviceName = resolveService(url.pathname);
    if (!serviceName) {
      return json(404, { error: "The requested API endpoint was not found." });
    }

    const service = env[serviceName];
    if (!service || typeof service.fetch !== "function") {
      console.error("API gateway service binding is unavailable", {
        service: serviceName,
        path: url.pathname,
      });
      return json(503, { error: "The requested API service is temporarily unavailable." });
    }

    try {
      const response = await service.fetch(request);
      if (response.ok) return sanitizeRootResponse(response);

      console.error("API gateway service returned an error", {
        service: serviceName,
        path: url.pathname,
        status: response.status,
      });
      const status = response.status === 404 ? 404 : response.status;
      return json(status, {
        error: status === 404
          ? "The requested API endpoint was not found."
          : "The requested API service could not complete this request.",
      });
    } catch (cause) {
      console.error("API gateway service request failed", {
        service: serviceName,
        path: url.pathname,
        error: cause instanceof Error ? cause.message : "unknown error",
      });
      return json(502, { error: "The requested API service is temporarily unavailable." });
    }
  },
};
