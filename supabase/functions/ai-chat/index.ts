import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AiProvider {
  name: string;
  call: (messages: any[], maxTokens: number) => Promise<string>;
}

function buildProviders(): AiProvider[] {
  const providers: AiProvider[] = [];

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const AIMLAPI_KEY = Deno.env.get("AIMLAPI_KEY");

  if (GEMINI_API_KEY) {
    providers.push({
      name: "Gemini 2.5 Flash",
      call: async (messages, maxTokens) => {
        const systemMsg = messages.find((m: any) => m.role === "system");
        const chatMsgs = messages.filter((m: any) => m.role !== "system");
        const contents = chatMsgs.map((m: any) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
        const body: any = { contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 } };
        if (systemMsg) {
          body.system_instruction = { parts: [{ text: systemMsg.content }] };
        }
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        );
        if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
        if (!text) throw new Error("Gemini returned empty response");
        return text;
      },
    });
  }

  if (LOVABLE_API_KEY) {
    providers.push({
      name: "Lovable AI",
      call: async (messages, maxTokens) => {
        const res = await fetch("https://api.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gemini-2.5-flash", messages, max_tokens: maxTokens, temperature: 0.7 }),
        });
        if (!res.ok) throw new Error(`Lovable ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        if (!text) throw new Error("Lovable returned empty response");
        return text;
      },
    });
  }

  if (DEEPSEEK_API_KEY) {
    providers.push({
      name: "DeepSeek",
      call: async (messages, maxTokens) => {
        const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "deepseek-chat", messages, max_tokens: maxTokens, temperature: 0.7 }),
        });
        if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        if (!text) throw new Error("DeepSeek returned empty response");
        return text;
      },
    });
  }

  if (OPENAI_API_KEY) {
    providers.push({
      name: "GPT-4o Mini",
      call: async (messages, maxTokens) => {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini", messages, max_tokens: maxTokens, temperature: 0.7 }),
        });
        if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        if (!text) throw new Error("OpenAI returned empty response");
        return text;
      },
    });
  }

  if (AIMLAPI_KEY) {
    providers.push({
      name: "AIML API",
      call: async (messages, maxTokens) => {
        const res = await fetch("https://api.aimlapi.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${AIMLAPI_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "mistralai/Mistral-7B-Instruct-v0.2", messages, max_tokens: maxTokens, temperature: 0.7 }),
        });
        if (!res.ok) throw new Error(`AIML ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        if (!text) throw new Error("AIML returned empty response");
        return text;
      },
    });
  }

  return providers;
}

async function transcribeWithLovable(audioUrl: string, apiKey: string): Promise<string> {
  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) throw new Error("Failed to download audio");
  const audioBuffer = await audioResp.arrayBuffer();
  const bytes = new Uint8Array(audioBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const ext = (audioUrl.split("?")[0].split(".").pop() || "m4a").toLowerCase();
  const fmtMap: Record<string, string> = {
    m4a: "mp4", mp3: "mp3", wav: "wav", ogg: "ogg", webm: "webm", aac: "aac",
  };
  const format = fmtMap[ext] || "mp4";
  const res = await fetch("https://api.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [{
        role: "user",
        content: [
          { type: "input_audio", input_audio: { data: base64, format } },
          { type: "text", text: "Transcribe this audio accurately. Return only the spoken words, nothing else." },
        ],
      }],
      max_tokens: 1024,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`Lovable transcription ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Lovable returned empty transcription");
  return text;
}

async function transcribeWithGemini(audioUrl: string, apiKey: string): Promise<string> {
  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) throw new Error("Failed to download audio");
  const audioBuffer = await audioResp.arrayBuffer();
  const bytes = new Uint8Array(audioBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const ext = (audioUrl.split("?")[0].split(".").pop() || "m4a").toLowerCase();
  const mimeMap: Record<string, string> = {
    m4a: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav",
    ogg: "audio/ogg", webm: "audio/webm", aac: "audio/aac",
  };
  const mimeType = mimeMap[ext] || "audio/mp4";
  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: "Transcribe this audio accurately. Return only the spoken words, nothing else." },
      ],
    }],
    generationConfig: { maxOutputTokens: 1024, temperature: 0 },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`Gemini transcription ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
}

async function transcribeWithWhisper(audioUrl: string, apiKey: string): Promise<string> {
  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) throw new Error("Failed to download audio");
  const audioBlob = await audioResp.blob();
  const ext = (audioUrl.split("?")[0].split(".").pop() || "m4a").toLowerCase();
  const form = new FormData();
  form.append("file", audioBlob, `audio.${ext}`);
  form.append("model", "whisper-1");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.text || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Audio transcription route
    if (body.audioUrl) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      const errors: string[] = [];
      if (LOVABLE_API_KEY) {
        try {
          const text = await transcribeWithLovable(body.audioUrl, LOVABLE_API_KEY);
          return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e) {
          errors.push(`Lovable: ${e instanceof Error ? e.message : String(e)}`);
          console.error("Lovable transcription failed:", e);
        }
      }
      if (GEMINI_API_KEY) {
        try {
          const text = await transcribeWithGemini(body.audioUrl, GEMINI_API_KEY);
          return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e) {
          errors.push(`Gemini: ${e instanceof Error ? e.message : String(e)}`);
          console.error("Gemini transcription failed:", e);
        }
      }
      if (OPENAI_API_KEY) {
        try {
          const text = await transcribeWithWhisper(body.audioUrl, OPENAI_API_KEY);
          return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch (e) {
          errors.push(`Whisper: ${e instanceof Error ? e.message : String(e)}`);
          console.error("Whisper transcription failed:", e);
        }
      }
      return new Response(
        JSON.stringify({ error: errors.length ? errors.join("; ") : "No transcription API key configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const providers = buildProviders();

    if (providers.length === 0) {
      return new Response(
        JSON.stringify({ error: "No AI API keys configured. Add at least one of: GEMINI_API_KEY, LOVABLE_API_KEY, DEEPSEEK_API_KEY, OPENAI_API_KEY, AIMLAPI_KEY to Supabase edge function secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, max_tokens, fast } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenLimit = max_tokens || (fast ? 300 : 2048);
    const timeoutMs = fast ? 8000 : 15000;

    for (const provider of providers) {
      try {
        console.log(`Trying provider: ${provider.name} (tokens: ${tokenLimit}, timeout: ${timeoutMs}ms)`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const reply = await Promise.race([
          provider.call(messages, tokenLimit),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener("abort", () => reject(new Error(`Timeout after ${timeoutMs}ms`)));
          }),
        ]);
        clearTimeout(timeout);
        console.log(`Success with: ${provider.name}`);
        return new Response(
          JSON.stringify({ reply, provider: provider.name }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        console.error(`Provider ${provider.name} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return new Response(
      JSON.stringify({ reply: "I'm having trouble connecting to my AI systems right now. Please try again in a moment." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI chat error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to get AI response", detail: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
