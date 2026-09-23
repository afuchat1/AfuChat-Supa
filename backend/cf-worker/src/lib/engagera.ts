import type { Env } from "../types";

export async function callEngagera(
  env: Env,
  body: Record<string, unknown>,
): Promise<{ response: Response; content: string }> {
  const apiKey = env.ENGAGERA_API_KEY?.trim();
  if (!apiKey) throw new Error("ENGAGERA_API_KEY is not configured");

  // Engagera is exposed as an upstream provider API. The Worker owns the
  // credential so no provider key is shipped in the mobile bundle.
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