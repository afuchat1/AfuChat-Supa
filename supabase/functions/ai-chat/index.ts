import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function chatWithGroq(messages: any[], maxTokens: number, apiKey: string): Promise<string> {
  const models = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
    "mixtral-8x7b-32768",
  ];

  for (const model of models) {
    try {
      console.log(`Trying model: ${model}`);
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
        console.log(`Rate limited on ${model}, trying next model...`);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error(`${model} error ${res.status}: ${errText}`);
        continue;
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) {
        console.log(`${model} returned empty, trying next...`);
        continue;
      }

      console.log(`Success with ${model}`);
      return text;
    } catch (e: any) {
      console.error(`${model} failed:`, e?.message || e);
      continue;
    }
  }

  throw new Error("All models exhausted");
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

    const { messages, max_tokens, fast } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_KEY) {
      console.error("GROQ_API_KEY not configured");
      return json({ reply: "AI service is not configured. Please set the GROQ_API_KEY secret in Supabase." });
    }

    const tokenLimit = max_tokens || (fast ? 300 : 2048);

    try {
      console.log(`Groq chat: ${messages.length} messages, ${tokenLimit} tokens`);
      const reply = await chatWithGroq(messages, tokenLimit, GROQ_KEY);
      console.log("Groq chat succeeded");
      return json({ reply });
    } catch (e: any) {
      console.error("Groq chat failed:", e?.message || e);
      return json({ reply: "I'm having trouble connecting to my AI systems right now. Please try again in a moment." });
    }
  } catch (error: any) {
    console.error("ai-chat function error:", error?.message || error);
    return json({ reply: "I'm having trouble connecting to my AI systems right now. Please try again in a moment." });
  }
});
