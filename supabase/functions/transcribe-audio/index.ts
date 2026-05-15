/**
 * AfuChat audio transcription edge function.
 *
 * Uses Groq Whisper-large-v3 as primary (GROQ_API_KEY) with OpenAI Whisper-1
 * as fallback (OPENAI_API_KEY). Rewritten from the original std@0.168.0 import
 * which caused BOOT_ERROR on current Supabase Edge Runtime.
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

async function transcribeWithGroq(
  audioBlob: Blob,
  ext: string,
  apiKey: string,
): Promise<string> {
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

async function transcribeWithOpenAI(
  audioBlob: Blob,
  ext: string,
  apiKey: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", audioBlob, `audio.${ext}`);
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.text || "";
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

  const { audioUrl } = body ?? {};
  if (!audioUrl || typeof audioUrl !== "string") {
    return json({ error: "audioUrl is required" }, 400);
  }

  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) {
    return json({ error: `Failed to download audio: ${audioResp.status}` }, 502);
  }
  const audioBlob = await audioResp.blob();
  const ext = (audioUrl.split("?")[0].split(".").pop() || "m4a").toLowerCase();

  const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
  const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");

  if (GROQ_KEY) {
    try {
      const text = await transcribeWithGroq(audioBlob, ext, GROQ_KEY);
      console.log("Groq transcription succeeded");
      return json({ text });
    } catch (e) {
      console.error("Groq transcription failed, trying OpenAI:", e);
    }
  }

  if (OPENAI_KEY) {
    try {
      const text = await transcribeWithOpenAI(audioBlob, ext, OPENAI_KEY);
      console.log("OpenAI transcription succeeded");
      return json({ text });
    } catch (e) {
      console.error("OpenAI transcription failed:", e);
      return json({ error: "Transcription failed", text: "" }, 500);
    }
  }

  console.error("No transcription API key configured (GROQ_API_KEY or OPENAI_API_KEY)");
  return json({ error: "No transcription API key configured" }, 503);
});
