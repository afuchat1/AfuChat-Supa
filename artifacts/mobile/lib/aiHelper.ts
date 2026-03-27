import { supabaseUrl, supabaseAnonKey } from "@/lib/supabase";

export async function askAi(prompt: string, systemPrompt?: string): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
    },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    throw new Error(`AI request failed: ${res.status}`);
  }

  const data = await res.json();
  return data.reply || "Sorry, I couldn't generate a response.";
}

export async function aiEnhancePost(content: string): Promise<string> {
  return askAi(
    `Improve this social media post. Keep it under 280 characters. Make it more engaging but keep the same meaning and tone. Only return the improved text, nothing else:\n\n${content}`,
    "You are a social media writing assistant. Return ONLY the improved post text. No quotes, no explanations, no prefixes like 'Here's'. Just the improved text."
  );
}

export async function aiGenerateHashtags(content: string): Promise<string[]> {
  const reply = await askAi(
    `Generate 3-5 relevant hashtags for this post. Return them space-separated, each starting with #. Only the hashtags, nothing else:\n\n${content}`,
    "You are a hashtag generator. Return ONLY hashtags separated by spaces. No explanations."
  );
  return reply.match(/#\w+/g) || [];
}

export async function aiGenerateBio(name: string, interests?: string[], country?: string): Promise<string> {
  const context = [
    `Name: ${name}`,
    interests?.length ? `Interests: ${interests.join(", ")}` : null,
    country ? `Country: ${country}` : null,
  ].filter(Boolean).join("\n");

  return askAi(
    `Write a short, catchy bio for a social media profile (max 150 characters). Be creative and friendly.\n\n${context}`,
    "You are a bio writer. Return ONLY the bio text. No quotes, no explanations. Max 150 characters."
  );
}

export async function aiSummarizeChat(messages: { sender: string; content: string }[]): Promise<string> {
  const transcript = messages
    .slice(-50)
    .map(m => `${m.sender}: ${m.content}`)
    .join("\n");

  return askAi(
    `Summarize this chat conversation in 2-3 bullet points. Be concise:\n\n${transcript}`,
    "You are a conversation summarizer. Provide a brief, clear summary with bullet points (use • character). Focus on key topics and decisions."
  );
}

export async function aiSuggestReply(messages: { sender: string; content: string; isMe: boolean }[], myName: string): Promise<string[]> {
  const lastMessages = messages.slice(-6);
  const transcript = lastMessages
    .map(m => `${m.isMe ? "Me" : m.sender}: ${m.content}`)
    .join("\n");

  const reply = await askAi(
    `Based on this chat, suggest 3 short replies I (${myName}) could send next. Each reply should be 1-2 sentences max. Separate each reply with |||. Only return the 3 replies separated by |||, nothing else:\n\n${transcript}`,
    "You are a chat reply assistant. Return exactly 3 short reply suggestions separated by |||. No numbering, no quotes, no explanations."
  );

  return reply.split("|||").map(s => s.trim()).filter(s => s.length > 0).slice(0, 3);
}

export async function aiSummarizeThread(post: string, replies: { author: string; content: string }[]): Promise<string> {
  const thread = [
    `Original post: ${post}`,
    ...replies.slice(0, 30).map(r => `${r.author}: ${r.content}`),
  ].join("\n");

  return askAi(
    `Summarize this post and its replies in 2-3 bullet points. What's the main discussion about? What are the key opinions?\n\n${thread}`,
    "You are a thread summarizer. Provide a brief, clear summary with bullet points (use • character). Focus on the main topic and different viewpoints."
  );
}

export async function aiTranslateMessage(text: string, targetLang: string): Promise<string> {
  return askAi(
    `Translate the following text to ${targetLang}. Return ONLY the translation:\n\n${text}`,
    "You are a translator. Return ONLY the translated text. No explanations, no notes."
  );
}

export async function aiGenerateCaption(imageDescription?: string): Promise<string> {
  const prompt = imageDescription
    ? `Write a catchy, short social media caption (under 280 characters) for an image of: ${imageDescription}`
    : "Write a catchy, inspirational social media caption (under 280 characters) for a general post";

  return askAi(prompt, "You are a caption writer. Return ONLY the caption text. No quotes, no hashtags unless they fit naturally. Max 280 characters.");
}
