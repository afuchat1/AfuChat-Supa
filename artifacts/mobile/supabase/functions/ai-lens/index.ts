// ai-lens — Engagera-powered image identification edge function.
// Accepts a base64 image, calls the Engagera /chat endpoint with vision,
// and returns a structured LensResult JSON object.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ENGAGERA_API_KEY = Deno.env.get("ENGAGERA_API_KEY") ?? "";
const ENGAGERA_BASE = "https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { imageBase64, mimeType = "image/jpeg", query } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "imageBase64 is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (!ENGAGERA_API_KEY) {
      console.error("[ai-lens] ENGAGERA_API_KEY secret is not set");
      return new Response(
        JSON.stringify({ error: "Vision service is not configured." }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const dataUrl = `data:${mimeType};base64,${imageBase64}`;
    const hasQuery = Boolean(query?.trim());

    const systemPrompt = `You are an expert AI vision identification system powered by Engagera.
Analyze the provided image carefully and respond with ONLY a valid JSON object — no markdown, no explanation, no wrapping code blocks.

The JSON must have exactly these fields:
- "title": string — concise name of what you see (max 60 chars)
- "description": string — 2-3 sentence description of the image
- "facts": string[] — 3-5 interesting, accurate facts (each max 120 chars)
- "category": string — exactly one of: food, plant, animal, place, product, person, artwork, text, object, other
- "searchQuery": string — optimal Google search query to learn more about this (max 80 chars)
- "confidence": string — exactly one of: high, medium, low
- "answer": string — ${hasQuery ? `direct answer to the user's question: "${query?.trim()}"` : "empty string (no question was asked)"}

Be accurate and specific. If confidence is low, say so. Never hallucinate details.`;

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: "image_url", image_url: { url: dataUrl } },
      {
        type: "text",
        text: hasQuery
          ? `Identify what is in this image and answer this question: "${query?.trim()}"`
          : "Identify and describe what is in this image.",
      },
    ];

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ];

    const engRes = await fetch(`${ENGAGERA_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-engagera-api-key": ENGAGERA_API_KEY,
      },
      body: JSON.stringify({ messages, model: "engagera-pro", stream: false }),
    });

    if (!engRes.ok) {
      const errText = await engRes.text().catch(() => "");
      console.error("[ai-lens] Engagera responded with", engRes.status, errText);
      return new Response(
        JSON.stringify({ error: "All vision providers failed. Please try again." }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const engData = await engRes.json();
    const rawContent: string = engData.message?.content ?? engData.content ?? "";

    // Strip markdown code fences if the model wrapped the JSON
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(cleaned);
    } catch {
      // Fallback: wrap the raw text in a minimal result
      result = {
        title: "Analysis Result",
        description: rawContent.slice(0, 300) || "Image analyzed.",
        facts: [],
        category: "other",
        searchQuery: "image identification",
        confidence: "low",
        answer: hasQuery ? rawContent : "",
      };
    }

    // Normalise and guard all fields
    result.title = String(result.title || "Unknown").slice(0, 60);
    result.description = String(result.description || "No description available.");
    result.facts = Array.isArray(result.facts) ? result.facts.slice(0, 5) : [];
    result.category = String(result.category || "other");
    result.searchQuery = String(result.searchQuery || result.title).slice(0, 80);
    result.confidence = ["high", "medium", "low"].includes(String(result.confidence))
      ? result.confidence
      : "medium";
    result.answer = String(result.answer ?? "");

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ai-lens] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "All vision providers failed. Please try again." }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
