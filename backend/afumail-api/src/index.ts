function json(request: Request, body: unknown, status = 200): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "X-AfuMail-Worker": "afumail-api",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, X-Client-Info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  });
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      if (host === "afuchat.com" || host.endsWith(".afuchat.com") || host.endsWith(".replit.dev") || host.endsWith(".replit.app") || host.endsWith(".vercel.app")) {
        headers.set("Access-Control-Allow-Origin", origin);
      }
    } catch {}
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json(request, {}).headers });
    if (path === "/healthz" || path === "/v1/mail/healthz") {
      return json(request, { status: "ok", worker: "afumail-api", version: "v1" });
    }
    if (path === "/v1/mail" || path.startsWith("/v1/mail/")) {
      return json(request, {
        error: "AfuMail API endpoint is not implemented yet",
        worker: "afumail-api",
        namespace: "/v1/mail/*",
      }, 501);
    }
    return json(request, { error: "Not found", path }, 404);
  },
};
