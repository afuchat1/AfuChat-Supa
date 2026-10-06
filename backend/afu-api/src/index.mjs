const API_HOST = "api.afuchat.com";

const EXACT_ROUTES = new Map([
  ["/", "AFUAUTH_API"],
  ["/v1/auth-resolve-identifier", "AFUAUTH_API"],
]);

const PREFIX_ROUTES = [
  { prefix: "/v1/auth", service: "AFUAUTH_API" },
  { prefix: "/v1/chat", service: "AFUCHAT_API" },
  { prefix: "/chat", service: "AFUCHAT_API" },
  { prefix: "/v1/storage", service: "AFUCHAT_API", rawPrefix: true },
  { prefix: "/v1/cloud", service: "AFUCLOUD_API" },
  { prefix: "/afucloud", service: "AFUCLOUD_API" },
  { prefix: "/v1/ai", service: "AFUAI_API" },
  { prefix: "/v1/ads", service: "AFUADS_API" },
  { prefix: "/v1/mail", service: "AFUMAIL_API" },
];

export function resolveService(pathname) {
  const exact = EXACT_ROUTES.get(pathname);
  if (exact) return exact;

  for (const route of PREFIX_ROUTES) {
    const matches = route.rawPrefix
      ? pathname.startsWith(route.prefix)
      : pathname === route.prefix || pathname.startsWith(`${route.prefix}/`);
    if (matches) return route.service;
  }

  return null;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.toLowerCase() !== API_HOST) {
      return json(404, { error: "Unknown API hostname", worker: "afu-api" });
    }

    const serviceName = resolveService(url.pathname);
    if (!serviceName) {
      return json(404, {
        error: "No API namespace is registered for this path",
        path: url.pathname,
        worker: "afu-api",
      });
    }

    const service = env[serviceName];
    if (!service || typeof service.fetch !== "function") {
      return json(503, {
        error: "The API namespace is not available",
        service: serviceName,
        worker: "afu-api",
      });
    }

    try {
      return await service.fetch(request);
    } catch {
      return json(502, {
        error: "The API namespace could not be reached",
        service: serviceName,
        worker: "afu-api",
      });
    }
  },
};
