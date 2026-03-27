import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── GROQ voice transcription ─────────────────────────────────────────────────
async function transcribeWithGroq(audioUrl: string, apiKey: string): Promise<string> {
  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) throw new Error(`Failed to download audio: ${audioResp.status}`);
  const audioBlob = await audioResp.blob();
  const ext = (audioUrl.split("?")[0].split(".").pop() || "m4a").toLowerCase();
  const form = new FormData();
  form.append("file", audioBlob, `audio.${ext}`);
  form.append("model", "whisper-large-v3");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.text || "";
}

// ── AIML text chat ────────────────────────────────────────────────────────────
async function chatWithAIML(messages: any[], maxTokens: number, apiKey: string): Promise<string> {
  const res = await fetch("https://api.aimlapi.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`AIML ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("AIML returned empty response");
  return text;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // ── Audio transcription ───────────────────────────────────────
    if (body.audioUrl) {
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

    // ── Text chat ─────────────────────────────────────────────────
    const { messages, max_tokens, fast } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    const AIMLAPI_KEY = Deno.env.get("AIMLAPI_KEY");
    if (!AIMLAPI_KEY) {
      console.error("AIMLAPI_KEY not configured");
      return json({ reply: "AI service is not configured. Please set the AIMLAPI_KEY secret in Supabase." });
    }

    const tokenLimit = max_tokens || (fast ? 300 : 2048);

    try {
      console.log(`AIML chat: ${messages.length} messages, ${tokenLimit} tokens`);
      const reply = await chatWithAIML(messages, tokenLimit, AIMLAPI_KEY);
      console.log("AIML chat succeeded");
      return json({ reply });
    } catch (e) {
      console.error("AIML chat failed:", e);
      return json({ reply: "I'm having trouble connecting to my AI systems right now. Please try again in a moment." });
    }
  } catch (error) {
    console.error("ai-chat function error:", error);
    return json({ reply: "I'm having trouble connecting to my AI systems right now. Please try again in a moment." });
  }
});
