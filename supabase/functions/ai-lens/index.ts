/**
 * AfuChat AI Lens edge function.
 *
 * Accepts a base64 image and optional query, runs it through a vision AI model,
 * and returns structured object identification + facts.
 *
 * Provider chain: Groq Llama-4-Scout → Gemini 1.5 Flash → GPT-4o-mini
 * verify_jwt: false — works with the anon key from the mobile client.
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

const SYSTEM_PROMPT = `You are AfuChat AI Lens — a visual intelligence assistant built into the AfuChat social app.
When shown an image, analyze it and respond with ONLY valid JSON (no markdown fences, no explanation):
{
  "title": "short name of the main subject (max 40 chars)",
  "description": "1-2 sentence description of what you see",
  "facts": ["fact 1", "fact 2", "fact 3"],
  "category": "object|place|food|plant|animal|text|product|person|artwork|other",
  "searchQuery": "optimal web search query to learn more",
  "confidence": "high|medium|low"
}
If a user question is provided, add an "answer" field with a direct, helpful response.
Always return valid JSON — never return plain text or markdown.`;

interface LensResult {
  title: string;
  description: string;
  facts: string[];
  category: string;
  searchQuery: string;
  confidence: string;
  answer?: string;
}

function parseResult(raw: string): LensResult {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function analyzeWithGroq(
  imageBase64: string,
  mimeType: string,
  query: string,
  apiKey: string,
): Promise<LensResult> {
  const userContent: any[] = [
    { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
    { type: "text", text: query },
  ];
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: 512,
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  return parseResult(raw);
}

async function analyzeWithGemini(
  imageBase64: string,
  mimeType: string,
  query: string,
  apiKey: string,
): Promise<LensResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: `${SYSTEM_PROMPT}\n\n${query}` },
          ],
        }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseResult(raw);
}

async function analyzeWithOpenAI(
  imageBase64: string,
  mimeType: string,
  query: string,
  apiKey: string,
): Promise<LensResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "low" } },
          { type: "text", text: `${SYSTEM_PROMPT}\n\n${query}` },
        ],
      }],
      max_tokens: 512,
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  return parseResult(raw);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const { imageBase64, mimeType = "image/jpeg", query = "What is this? Identify it." } = body ?? {};
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return json({ error: "imageBase64 is required" }, 400);
  }
  if (imageBase64.length < 100) {
    return json({ error: "imageBase64 appears too short" }, 400);
  }

  const GROQ_KEY   = Deno.env.get("GROQ_API_KEY");
  const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
  const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");

  const providers: Array<() => Promise<LensResult>> = [];
  if (GROQ_KEY)   providers.push(() => analyzeWithGroq(imageBase64, mimeType, query, GROQ_KEY));
  if (GEMINI_KEY) providers.push(() => analyzeWithGemini(imageBase64, mimeType, query, GEMINI_KEY));
  if (OPENAI_KEY) providers.push(() => analyzeWithOpenAI(imageBase64, mimeType, query, OPENAI_KEY));

  if (providers.length === 0) {
    return json({ error: "No vision AI keys configured (GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY)" }, 503);
  }

  for (const provider of providers) {
    try {
      const result = await provider();
      return json(result);
    } catch (e) {
      console.error("Provider failed:", e instanceof Error ? e.message : e);
    }
  }

  return json({ error: "All vision providers failed. Please try again." }, 500);
});
