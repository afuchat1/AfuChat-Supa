import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gemma2-9b-it",
  "mixtral-8x7b-32768",
];

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

async function chatWithGroq(
  messages: any[],
  maxTokens: number,
  apiKey: string,
): Promise<string> {
  let lastError = "";
  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
      });
      if (res.status === 429) {
        lastError = `${model} rate limited`;
        logger.warn({ model }, "Groq model rate limited, trying next");
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        lastError = `${model} error ${res.status}: ${body.slice(0, 120)}`;
        logger.warn({ model, status: res.status }, "Groq model error, trying next");
        continue;
      }
      const data = await res.json();
      const text: string = data.choices?.[0]?.message?.content ?? "";
      if (text) return text;
      lastError = `${model} returned empty content`;
    } catch (err: any) {
      lastError = `${model} threw: ${err?.message || String(err)}`;
      logger.error({ err, model }, "Groq model threw");
    }
  }
  throw new Error(lastError || "All Groq models failed");
}

async function transcribeWithGroq(audioUrl: string, apiKey: string): Promise<string> {
  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) {
    throw new Error(`Failed to download audio: ${audioResp.status}`);
  }
  const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
  const ext = (audioUrl.split("?")[0].split(".").pop() || "m4a").toLowerCase();

  const form = new FormData();
  form.append("file", new Blob([audioBuffer]), `audio.${ext}`);
  form.append("model", "whisper-large-v3");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form as any,
  });
  if (!res.ok) {
    throw new Error(`Groq transcription ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.text || "";
}

router.post("/ai/chat", async (req: Request, res: Response) => {
  const groqKey = process.env.GROQ_API_KEY || "";
  if (!groqKey) {
    logger.warn("GROQ_API_KEY not configured — AI requests cannot be served");
    res.status(503).json({
      reply:
        "AI service is not configured. Please set the GROQ_API_KEY secret in Replit.",
      error: "GROQ_API_KEY not set",
    });
    return;
  }

  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown";

  if (!checkRateLimit(clientIp)) {
    res.status(429).json({ error: "Too many requests. Please wait a moment." });
    return;
  }

  const { messages, max_tokens, fast, audioUrl } = req.body ?? {};

  if (audioUrl && typeof audioUrl === "string") {
    try {
      const text = await transcribeWithGroq(audioUrl, groqKey);
      res.json({ text });
    } catch (err: any) {
      logger.error({ err }, "Groq transcription failed");
      res.json({ text: "" });
    }
    return;
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const tokenLimit =
    typeof max_tokens === "number" && max_tokens > 0
      ? max_tokens
      : fast
        ? 300
        : 2048;

  try {
    const reply = await chatWithGroq(messages, tokenLimit, groqKey);
    res.json({ reply });
  } catch (err: any) {
    logger.error({ err }, "AI chat error");
    res.status(500).json({
      reply:
        "I'm having trouble connecting to my AI systems right now. Please try again in a moment.",
    });
  }
});

export default router;
