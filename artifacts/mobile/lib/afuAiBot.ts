import { supabase } from "@/lib/supabase";
import { askAi } from "@/lib/aiHelper";
import { buildNavigationContext, ACTION_ROUTES_GUIDE } from "@/lib/platformKnowledge";

export const AFUAI_BOT_ID = "c7ec234e-1ae8-499c-8318-6a592c5f81bb";

export async function ensureAfuAiChat(userId: string, displayName?: string): Promise<void> {
  try {
    const { data: chatId, error } = await supabase.rpc("get_or_create_direct_chat", {
      other_user_id: AFUAI_BOT_ID,
    });

    if (error || !chatId) return;

    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId);

    if ((count ?? 0) > 0) return;

    const name = displayName || "there";
    let greeting: string;
    try {
      greeting = await askAi(
        `Write a warm welcome message (3-4 sentences) from AfuAI to a brand-new AfuChat user named "${name}". Do ALL of the following in a natural, conversational way: 1) Introduce yourself as AfuAI, their personal AI assistant. 2) Tell them you're always here — they can ask you anything: questions, writing, advice, translations, or just a chat. 3) Encourage them to also explore AfuChat — discover posts on the feed, find and follow interesting people, and join conversations. Be warm, human, and encouraging. No bullet points, no markdown.`,
        "You are AfuAI, a friendly AI assistant built into AfuChat — Uganda's social super app. Write only the welcome message, nothing else.",
        { fast: true, maxTokens: 200 }
      );
    } catch {
      greeting = `Welcome to AfuChat, ${name}! 🎉 I'm AfuAI — your personal AI assistant, always here whenever you need me. Ask me anything: questions, writing help, translations, advice, or just a good conversation. And don't forget to explore the app — discover posts on your feed, find interesting people to follow, and join the conversation! 🚀`;
    }

    await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: AFUAI_BOT_ID,
      encrypted_content: greeting,
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
    `You are AfuAI, a friendly and capable AI assistant built into AfuChat — a social super app from Uganda. ${name}Help with anything: questions, writing, analysis, coding, creative tasks, advice, translations, and more. Respond in the same language the user writes in. Keep replies conversational and appropriately concise for a chat context. Never mention being built by another company — you are AfuAI.

PLATFORM KNOWLEDGE — use this when the user asks how to do something or where to find something in the app:
${platformContext}

${ACTION_ROUTES_GUIDE}

SEARCH CAPABILITY — trigger a pre-filled search when the user asks to find someone or something:
  Use [ACTION:Search for X:/search?q=X] (replace spaces with +)
  Example: [ACTION:Search for amkaweesi:/search?q=amkaweesi]

PROFILE LOOKUP — link to any user's profile directly:
  Use [ACTION:View @handle:/@handle]
  Founder: [ACTION:View @amkaweesi:/@amkaweesi]
  Any bought username also routes to its current owner's profile the same way.

When the user asks how to navigate somewhere or how to use a feature, give clear step-by-step guidance and use [ACTION:...] tags so they can tap directly to the right screen.
When the user mentions a @handle or asks about a specific person, always add a profile button and a search button.`,
    { fast: false, maxTokens: 800 }
  );
}
