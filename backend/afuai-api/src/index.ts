interface Env {
  ENGAGERA_API_KEY?: string;
  AFUAUTH_API?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
}

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type, apikey, X-Client-Info";

function cors(request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "X-AfuAI-Worker": "afuai-api",
  });
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      if (host === "afuchat.com" || host.endsWith(".afuchat.com") || host.endsWith(".replit.dev") || host.endsWith(".replit.app") || host.endsWith(".vercel.app")) {
        headers.set("Access-Control-Allow-Origin", origin);
      }
    } catch {
      // Do not reflect invalid origins.
    }
  }
  return headers;
}

function json(request: Request, body: unknown, status = 200): Response {
  const headers = cors(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers });
}

async function callEngagera(env: Env, body: Record<string, unknown>) {
  const apiKey = env.ENGAGERA_API_KEY?.trim();
  if (!apiKey) throw new Error("ENGAGERA_API_KEY is not configured");
  const response = await fetch("https://api.engagera.ai/v1/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-engagera-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null) as any;
  return {
    response,
    content: String(data?.message?.content ?? data?.content ?? ""),
  };
}

async function readJson(request: Request): Promise<Record<string, any>> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

async function verifySharedSession(request: Request, env: Env): Promise<Response | null> {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return json(request, { error: "A valid bearer token is required", worker: "afuai-api" }, 401);
  }
  if (!env.AFUAUTH_API) {
    return json(request, { error: "Shared authentication service is not configured", worker: "afuai-api" }, 503);
  }

  const token = authorization.replace(/^Bearer\s+/i, "");
  try {
    const verified = await env.AFUAUTH_API.fetch(new Request("https://afuauth-api/v1/auth/session", {
      method: "POST",
      headers: { Authorization: authorization, Accept: "application/json" },
    }));
    const payload = await verified.json().catch(() => null) as {
      user?: { id?: unknown };
      accessToken?: unknown;
    } | null;

    if (verified.status === 401 || verified.status === 403) {
      return json(request, { error: "Invalid or expired shared session", worker: "afuai-api" }, 401);
    }
    if (!verified.ok) {
      return json(request, { error: "Shared authentication service is unavailable", worker: "afuai-api" }, 503);
    }
    if (typeof payload?.user?.id !== "string" || !payload.user.id || payload.accessToken !== token) {
      return json(request, { error: "Shared authentication service returned an invalid session", worker: "afuai-api" }, 503);
    }
    return null;
  } catch {
    return json(request, { error: "Shared authentication service is unavailable", worker: "afuai-api" }, 503);
  }
}

async function handleAiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  if (url.pathname === "/healthz" || url.pathname === "/v1/ai/healthz") {
    const configured = Boolean(env.ENGAGERA_API_KEY?.trim());
    return json(request, {
      status: configured ? "ok" : "degraded",
      worker: "afuai-api",
      version: "v1",
      configuration: { engagera: configured },
    }, configured ? 200 : 503);
  }
  if (!url.pathname.startsWith("/v1/ai/")) {
    return json(request, { error: "Not found", path: url.pathname }, 404);
  }
  if (url.pathname !== "/v1/ai/healthz") {
    const authFailure = await verifySharedSession(request, env);
    if (authFailure) return authFailure;
  }
  if (request.method !== "POST") {
    return json(request, { error: "Method not allowed", worker: "afuai-api" }, 405);
  }

  const body = await readJson(request);
  try {
    if (url.pathname === "/v1/ai/chat" || url.pathname === "/v1/ai/reply") {
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return json(request, { error: "messages array is required" }, 400);
      }
      const isReply = url.pathname.endsWith("/reply");
      if (isReply && body.audioUrl && !Array.isArray(body.messages)) {
        return json(request, { error: "Audio transcription is not configured on the Worker" }, 501);
      }
      const result = await callEngagera(env, {
        messages: body.messages,
        model: isReply ? "engagera-2.1" : (typeof body.model === "string" ? body.model : "engagera-pro"),
        stream: false,
        ...(typeof body.max_tokens === "number"
          ? { max_tokens: body.max_tokens }
          : isReply ? { max_tokens: body.fast ? 300 : 2048 } : {}),
      });
      if (!result.response.ok || (isReply && !result.content)) {
        if (isReply) {
          return json(request, { reply: "I'm having trouble connecting to AfuAI right now. Please try again in a moment." });
        }
        return json(request, { error: "AI service unavailable" }, 502);
      }
      return isReply
        ? json(request, { reply: result.content })
        : json(request, { message: { role: "assistant", content: result.content }, content: result.content });
    }

    if (url.pathname === "/v1/ai/transcribe") {
      return json(request, { error: "Audio transcription is not configured on the Worker" }, 501);
    }

    if (url.pathname === "/v1/ai/lens") {
      const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
      if (!imageBase64) return json(request, { error: "imageBase64 is required" }, 400);
      const mimeType = typeof body.mimeType === "string" && body.mimeType.startsWith("image/") ? body.mimeType : "image/jpeg";
      const query = typeof body.query === "string" ? body.query.trim() : "";
      const systemPrompt = `You are an expert AI vision identification system powered by AfuChat.
Respond with ONLY valid JSON with exactly these fields:
title (string, max 60 chars), description (string, 2-3 sentences), facts (string[] with 3-5 facts),
category (one of food, plant, animal, place, product, person, artwork, text, object, other),
searchQuery (string, max 80 chars), confidence (high, medium, low), answer (string).
${query ? `Answer the user's question: "${query}"` : "Use an empty answer because no question was asked."}`;
      const result = await callEngagera(env, {
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              { type: "text", text: query ? `Identify the image and answer: "${query}"` : "Identify and describe this image." },
            ],
          },
        ],
        model: "engagera-pro",
        stream: false,
      });
      if (!result.response.ok) return json(request, { error: "Vision service unavailable" }, 502);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(result.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim());
      } catch {
        parsed = {
          title: "Analysis Result",
          description: result.content.slice(0, 300) || "Image analyzed.",
          facts: [],
          category: "other",
          searchQuery: "image identification",
          confidence: "low",
          answer: query ? result.content : "",
        };
      }
      return json(request, {
        title: String(parsed.title || "Unknown").slice(0, 60),
        description: String(parsed.description || "No description available."),
        facts: Array.isArray(parsed.facts) ? parsed.facts.slice(0, 5).map(String) : [],
        category: String(parsed.category || "other"),
        searchQuery: String(parsed.searchQuery || parsed.title || "image identification").slice(0, 80),
        confidence: ["high", "medium", "low"].includes(String(parsed.confidence)) ? parsed.confidence : "medium",
        answer: String(parsed.answer ?? ""),
      });
    }

    return json(request, { error: "AfuAI endpoint is not implemented yet", worker: "afuai-api" }, 501);
  } catch (error) {
    console.error("[afuai-api]", error);
    if (url.pathname === "/v1/ai/reply") {
      return json(request, { reply: "AI service is not configured. Please try again later." }, 503);
    }
    return json(request, { error: "AfuAI service is not configured" }, 503);
  }
}

export default { fetch: handleAiRequest };
