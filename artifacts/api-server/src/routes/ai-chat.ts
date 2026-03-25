import { Router, type Request, type Response } from "express";

const router = Router();

const SYSTEM_PROMPT = `You are AfuAi, the intelligent AI assistant built into the AfuChat social platform. You can help users with:
- General questions and conversations
- Writing messages, posts, and stories
- Translation between languages
- Summarizing content
- Creative writing and brainstorming
- Advice and recommendations

Keep your responses concise and conversational. Use a warm, friendly tone. You can use emojis occasionally to be expressive. Always identify yourself as AfuAi when asked.`;

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60000;

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
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      res.status(503).json({ error: "AI service is not configured." });
      return;
    }

    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({ error: "Too many requests. Please wait a moment." });
      return;
    }

    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages.slice(-10).map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          })),
        ],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      res.status(500).json({ error: "Failed to get AI response" });
      return;
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";

    res.json({ reply });
  } catch (error: any) {
    console.error("AI chat error:", error?.message || error);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

export default router;
