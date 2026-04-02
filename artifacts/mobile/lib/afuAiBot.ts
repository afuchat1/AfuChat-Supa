import { supabase } from "@/lib/supabase";
import { askAi } from "@/lib/aiHelper";

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
        `Write a warm, brief welcome message (2-3 sentences) from AfuAI to a new AfuChat user named "${name}". Introduce yourself as AfuAI, their personal AI assistant inside AfuChat. Tell them they can ask you anything — questions, writing, translations, advice, or just chat. Be friendly and human, no bullet points, no markdown.`,
        "You are AfuAI, a helpful AI assistant built into AfuChat — Uganda's social super app. Write only the greeting message, nothing else.",
        { fast: true, maxTokens: 150 }
      );
    } catch {
      greeting = `Hey ${name}! 👋 I'm AfuAI — your personal AI assistant right here in AfuChat. Feel free to ask me anything: questions, writing help, translations, advice, or just a good chat. I'm always here for you!`;
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

  return askAi(
    `${contextBlock}User: ${userText}`,
    `You are AfuAI, a friendly and capable AI assistant built into AfuChat — a social super app from Uganda. ${name}Help with anything: questions, writing, analysis, coding, creative tasks, advice, translations, and more. Respond in the same language the user writes in. Keep replies conversational and appropriately concise for a chat context. Never mention being built by another company — you are AfuAI.`,
    { fast: false, maxTokens: 600 }
  );
}
