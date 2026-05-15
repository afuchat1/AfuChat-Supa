/**
 * AfuChat AI chat edge function.
 *
 * Handles text chat and audio transcription.
 * Provider chain: Groq (6 models) → Gemini (3 models)
 * so a single provider outage never silences the chat.
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

// ── Groq voice transcription ─────────────────────────────────────────────────
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

// ── Groq text chat with per-model fallback ───────────────────────────────────
async function chatWithGroq(
  messages: any[],
  maxTokens: number,
  apiKey: string,
): Promise<string> {
  const models = [
    "llama-3.3-70b-versatile",
    "llama-3.3-70b-specdec",
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "gemma2-9b-it",
    "llama-guard-3-8b",
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
            temperature: 0.7,
          }),
        },
      );
      if (res.status === 429 || res.status === 503) {
        lastError = `${model} unavailable (${res.status})`;
        console.log(`${model} unavailable, trying next...`);
        continue;
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastError = `${model} error ${res.status}: ${errText}`;
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
  throw new Error(lastError || "All Groq models failed");
}

// ── Gemini fallback ──────────────────────────────────────────────────────────
async function chatWithGemini(
  messages: any[],
  maxTokens: number,
  apiKey: string,
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");

  const contents = chatMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const reqBody: any = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  };
  if (systemMsg) {
    reqBody.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"];
  let lastError = "";
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        },
      );
      if (!res.ok) {
        lastError = `Gemini ${model} ${res.status}`;
        console.error(lastError);
        continue;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (text) return text;
      lastError = `Gemini ${model} empty response`;
    } catch (err) {
      lastError = `Gemini ${model} threw: ${err instanceof Error ? err.message : String(err)}`;
      console.error(lastError);
    }
  }
  throw new Error(lastError || "All Gemini models failed");
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

  const tokenLimit =
    typeof max_tokens === "number" && max_tokens > 0
      ? max_tokens
      : fast
        ? 300
        : 2048;

  const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
  const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");

  if (!GROQ_KEY && !GEMINI_KEY) {
    console.error("AfuAI: No API keys configured. Set GROQ_API_KEY in Supabase Edge Function secrets.");
    return json({
      reply: "AfuAI isn't fully set up yet. Please ask the admin to configure the AI service keys.",
    });
  }

  // Try Groq first
  if (GROQ_KEY) {
    try {
      console.log(`Groq chat: ${messages.length} messages, ${tokenLimit} tokens`);
      const reply = await chatWithGroq(messages, tokenLimit, GROQ_KEY);
      console.log("Groq chat succeeded");
      return json({ reply });
    } catch (e: any) {
      console.error("All Groq models failed, trying Gemini:", e?.message || e);
    }
  } else {
    console.warn("GROQ_API_KEY not set — skipping Groq");
  }

  // Gemini fallback
  if (GEMINI_KEY) {
    try {
      console.log("Gemini fallback chat...");
      const reply = await chatWithGemini(messages, tokenLimit, GEMINI_KEY);
      console.log("Gemini fallback succeeded");
      return json({ reply });
    } catch (e: any) {
      console.error("Gemini fallback also failed:", e?.message || e);
    }
  } else {
    console.warn("GEMINI_API_KEY not set — no fallback available");
  }

  return json({
    reply: "I'm having a bit of trouble right now. Please try again in a moment!",
  });
});
