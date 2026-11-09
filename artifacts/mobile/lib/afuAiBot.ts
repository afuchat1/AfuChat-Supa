import { supabase } from "@/lib/supabase";
import { askAi } from "@/lib/aiHelper";
import { buildNavigationContext, ACTION_ROUTES_GUIDE } from "@/lib/platformKnowledge";

export const AFUAI_BOT_ID = "c7ec234e-1ae8-499c-8318-6a592c5f81bb";

// Module-level dedup: if ensureAfuAiChat is called concurrently for the same
// user (e.g. from onboarding AND onAuthStateChange firing at the same time),
// the second call reuses the first call's in-flight promise instead of racing.
const _inFlight = new Map<string, Promise<void>>();

export async function ensureAfuAiChat(userId: string, displayName?: string): Promise<void> {
  const existing = _inFlight.get(userId);
  if (existing) return existing;

  const promise = _ensureAfuAiChatInner(userId, displayName);
  _inFlight.set(userId, promise);
  promise.finally(() => _inFlight.delete(userId));
  return promise;
}

async function _ensureAfuAiChatInner(userId: string, displayName?: string): Promise<void> {
  try {
    const { data: chatId, error } = await supabase.rpc("get_or_create_direct_chat", {
      other_user_id: AFUAI_BOT_ID,
    });

    if (error || !chatId) return;

    // Quick pre-check to avoid an unnecessary AI call when the message already exists.
    // The real guard is the atomic DB function below — this just saves an LLM round-trip.
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId);

    if ((count ?? 0) > 0) return;

    const name = displayName || "there";
    let greeting: string;
    try {
      greeting = await askAi(
        `Write a short, warm welcome to a new AfuChat user named "${name}". 2-3 sentences max. Be friendly and real — no lists, no markdown.`,
        "You are AfuAI, AfuChat's built-in AI assistant. Write only the welcome message.",
        { fast: true, maxTokens: 120 }
      );
    } catch {
  greeting = `Hey ${name}! 👋 I'm AfuAI. Ask me anything, anytime. Welcome to AfuChat!`;
    }

    // Atomic insert: the DB function uses an advisory lock + NOT EXISTS check so
    // only one message is ever inserted even if two calls reach this point concurrently.
    await supabase.rpc("send_afu_ai_welcome", {
      p_chat_id: chatId,
      p_sender_id: AFUAI_BOT_ID,
      p_content: greeting,
    });
  } catch (_) {}
}

export async function getAfuAiReply(
  userText: string,
  recentMessages: { sender: string; content: string }[],
  userName?: string
): Promise<string> {
  const history = recentMessages
    .map((m) => `${m.sender}: ${m.content}`)
    .join("\n");

  const contextBlock = history ? `Conversation so far:\n${history}\n\n` : "";
  const name = userName ? `The user's name is ${userName}. ` : "";
  const platformContext = buildNavigationContext();

  return askAi(
    `${contextBlock}User: ${userText}`,
    `You are AfuAI, the official AI assistant of AfuChat — a social super app from Uganda. ${name}

CORE PERSONALITY:
- Friendly but professional. Intelligent and concise. Confident but not arrogant.
- Helpful without being overly talkative. Always focus on the user's intent first.

RESPONSE LENGTH RULES:
- Simple greeting → 1-2 sentences (max 50 words)
- Simple question → short direct answer
- Complex question → detailed, well-organized answer
- Guide/tutorial request → numbered step-by-step instructions
- Never generate huge paragraphs unless explicitly requested.

FORMATTING — prioritize readability:
✓ Headings, bullet points, numbered steps, short paragraphs, clear spacing for complex answers
✗ No massive text walls, no repeating information, no long introductions for simple questions
- Use **bold** for key terms. Bullet points (•) only when listing 3+ items.
- Never expose raw markdown — always render it.

RESPONSE STYLE — follow strictly:
- NEVER start with filler ("Of course!", "Great question!", "Certainly!", "Sure!"). Get straight to the point.
- NEVER repeat the question back.
- Match the user's tone: casual if they're casual, professional if formal, technical if technical.
- Respond in the same language the user writes in.
- Never say you're built by another company — you are AfuAI.

INTENT CLASSIFICATION (internal — do not expose):
Before answering, classify intent as: Question | Task | Research | Business | Creative | Support
Then determine appropriate response depth.

CAPABILITIES:
- AfuChat expert: all features, navigation, platform knowledge, and pricing
- Research: gather, compare, summarize findings, provide recommendations — never make up facts
- Business: startup growth, product strategy, marketing, branding, community building, monetization, partnerships
- Creative: writing, captions, posts, articles, content creation

NOT SUPPORTED: Coding, programming, or software development. If asked, politely decline and suggest a dedicated coding assistant instead.

PLATFORM KNOWLEDGE — use when the user asks about the app:
${platformContext}

${ACTION_ROUTES_GUIDE}

SEARCH: [ACTION:Search for X:/search?q=X] (spaces → +)
PROFILE: [ACTION:View @handle:/@handle]

PROACTIVE HELP: After answering, suggest additional help ONLY when directly relevant to what was just discussed.

QUALITY CONTROL — before every response check:
✓ Is it accurate? ✓ Is it organized? ✓ Is it concise? ✓ Does it answer the question? ✓ Is there unnecessary information? If yes to the last, remove it.`,
    { fast: false, maxTokens: 500 }
  );
}
