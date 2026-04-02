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

// ── Groq text chat (Llama) ────────────────────────────────────────────────────
async function chatWithGroq(messages: any[], maxTokens: number, apiKey: string): Promise<string> {
  const models = ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "llama-3.1-8b-instant"];
  let lastError = "";

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`Trying ${model} (attempt ${attempt + 1})`);
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature: 0.7,
          }),
        });
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get("retry-after") || "3", 10);
          const wait = Math.min(retryAfter, 5) * 1000;
          console.log(`Rate limited on ${model}, waiting ${wait}ms...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) {
          lastError = `Groq ${model} ${res.status}: ${await res.text()}`;
          console.error(lastError);
          if (res.status === 401) throw new Error(lastError);
          break;
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        if (!text) { lastError = `${model} returned empty`; break; }
        return text;
      } catch (e: any) {
        lastError = e?.message || String(e);
        if (lastError.includes("401")) throw e;
        console.error(`Model ${model} attempt ${attempt + 1} failed:`, lastError);
      }
    }
  }
  throw new Error(`All models failed. Last: ${lastError}`);
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

    const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_KEY) {
      console.error("GROQ_API_KEY not configured");
      return json({ reply: "AI service is not configured. Please set the GROQ_API_KEY secret in Supabase." });
    }

    const tokenLimit = max_tokens || (fast ? 300 : 3000);

    const totalChars = messages.reduce((sum: number, m: any) => sum + (m.content?.length || 0), 0);
    console.log(`Groq chat: ${messages.length} msgs, ${totalChars} chars, ${tokenLimit} max_tokens`);

    const trimmedMessages = totalChars > 24000
      ? messages.map((m: any, i: number) => {
          if (i === 0 && m.role === "system" && m.content.length > 12000) {
            return { ...m, content: m.content.slice(0, 12000) + "\n[System context trimmed]" };
          }
          return m;
        })
      : messages;

    try {
      const reply = await chatWithGroq(trimmedMessages, tokenLimit, GROQ_KEY);
      console.log("Groq chat succeeded");
      return json({ reply });
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      console.error("Groq chat failed:", errMsg);
      if (errMsg.includes("rate") || errMsg.includes("429")) {
        return json({ reply: "I'm a bit busy right now — too many requests hitting me at once. Give me a few seconds and try again! 🙏" });
      }
      return json({ reply: "Something went wrong on my end. Please try again in a moment." });
    }
  } catch (error: any) {
    console.error("ai-chat function error:", error?.message || error);
    return json({ reply: "Something went wrong on my end. Please try again in a moment." });
  }
});
