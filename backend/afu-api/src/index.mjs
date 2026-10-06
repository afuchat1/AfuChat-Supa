const API_HOST = "api.afuchat.com";
const ROOT_ROUTE = new Map([["/", "AFUAUTH_API"]]);

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
