import { Router, type Request, type Response } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "placeholder",
});

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
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

router.post("/ai/chat", async (req: Request, res: Response) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({ error: "Too many requests. Please wait a moment." });
      return;
    }

    const { messages } = req.body as { messages?: { role: string; content: string }[] };
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const validMessages = messages
      .filter((m) => m.role && m.content && typeof m.content === "string")
      .slice(-12) as OpenAI.ChatCompletionMessageParam[];

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: validMessages,
      max_completion_tokens: 1024,
    });

    const reply = response.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response.";
    res.json({ reply });
  } catch (error: any) {
    console.error("AI chat error:", error?.message || error);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

router.post("/ai/image", async (req: Request, res: Response) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({ error: "Too many requests. Please wait a moment." });
      return;
    }

    const { prompt } = req.body as { prompt?: string };
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
    });

    const b64 = (response.data?.[0] as any)?.b64_json;
    if (!b64) {
      res.json({ reply: "Could not generate image. Please try a different prompt.", images: [] });
      return;
    }

    res.json({
      reply: "Here is your generated image!",
      images: [`data:image/png;base64,${b64}`],
    });
  } catch (error: any) {
    console.error("AI image error:", error?.message || error);
    res.status(500).json({ error: "Failed to generate image" });
  }
});

export default router;
