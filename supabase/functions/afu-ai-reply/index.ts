/**
 * AfuChat AI chat edge function.
 *
 * Acts as a thin proxy to Groq for both text chat and audio transcription.
 * Originally imported `https://deno.land/std@0.168.0/http/server.ts`, which
 * the current Supabase Edge Runtime can no longer load — that produced a
 * BOOT_ERROR and the AI stopped responding. The rewrite below uses
 * `Deno.serve` only (no third-party imports) so it boots cleanly.
 *
 * IMPORTANT: the public API contract is unchanged — same request shape,
 * same response shape — so the existing API server route and mobile
 * client work without any modification.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── GROQ voice transcription ─────────────────────────────────────────────────
async function transcribeWithGroq(
  audioUrl: string,
  apiKey: string,
): Promise<string> {
  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) {
    throw new Error(`Failed to download audio: ${audioResp.status}`);
  }
  const audioBlob = await audioResp.blob();
  const ext =
    (audioUrl.split("?")[0].split(".").pop() || "m4a").toLowerCase();
  const form = new FormData();
  form.append("file", audioBlob, `audio.${ext}`);
  form.append("model", "whisper-large-v3");
  const res = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
  );
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.text || "";
}

// ── Groq text chat with model fallback ───────────────────────────────────────
// Falls through the model list whenever a model is rate-limited or errors,
// so a single overloaded model doesn't take down the whole feature.
async function chatWithGroq(
  messages: any[],
  maxTokens: number,
  apiKey: string,
): Promise<string> {
  const models = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
    "mixtral-8x7b-32768",
  ];
  let lastError = "";
  for (const model of models) {
    try {
      const res = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature: 0.3,
          }),
        },
      );
      if (res.status === 429) {
        lastError = `${model} rate limited`;
        console.log(`${model} rate limited, trying next...`);
        continue;
      }
      if (!res.ok) {
        lastError = `${model} error: ${res.status}`;
        console.error(lastError);
        continue;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? "";
      if (text) return text;
      lastError = `${model} returned empty content`;
    } catch (err) {
      lastError = `${model} threw: ${
        err instanceof Error ? err.message : String(err)
      }`;
      console.error(lastError);
    }
  }
  throw new Error(lastError || "All models failed");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // ── Audio transcription branch ─────────────────────────────────
  if (body?.audioUrl) {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      console.error("GROQ_API_KEY not configured");
      return json({ text: "" });
    }
    try {
      const text = await transcribeWithGroq(body.audioUrl, GROQ_API_KEY);
      return json({ text });
    } catch (e) {
      console.error("Groq transcription failed:", e);
      return json({ text: "" });
    }
  }

  // ── Text chat branch ──────────────────────────────────────────
  const { messages, max_tokens, fast } = body ?? {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return json({ error: "messages array is required" }, 400);
  }

  const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_KEY) {
    console.error("GROQ_API_KEY not configured");
    return json({
      reply:
        "AI service is not configured. Please set the GROQ_API_KEY secret in Supabase.",
    });
  }

  const tokenLimit =
    typeof max_tokens === "number" && max_tokens > 0
      ? max_tokens
      : fast
        ? 300
        : 2048;

  try {
    console.log(`Groq chat: ${messages.length} messages, ${tokenLimit} tokens`);
    const reply = await chatWithGroq(messages, tokenLimit, GROQ_KEY);
    console.log("Groq chat succeeded");
    return json({ reply });
  } catch (e: any) {
    console.error("Groq chat failed:", e?.message || e);
    return json({
      reply:
        "I'm having trouble connecting to my AI systems right now. Please try again in a moment.",
    });
  }
});
