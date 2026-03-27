import { supabaseUrl, supabaseAnonKey } from "@/lib/supabase";

interface AskAiOptions {
  fast?: boolean;
  maxTokens?: number;
}

export async function askAi(prompt: string, systemPrompt?: string, options?: AskAiOptions): Promise<string> {
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
    body: JSON.stringify({
      messages,
      fast: options?.fast ?? true,
      max_tokens: options?.maxTokens,
    }),
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
    "You are a social media writing assistant. Return ONLY the improved post text. No quotes, no explanations, no prefixes like 'Here's'. Just the improved text.",
    { fast: true, maxTokens: 200 }
  );
}

export async function aiGenerateHashtags(content: string): Promise<string[]> {
  const reply = await askAi(
    `Generate 3-5 relevant hashtags for this post. Return them space-separated, each starting with #. Only the hashtags, nothing else:\n\n${content}`,
    "You are a hashtag generator. Return ONLY hashtags separated by spaces. No explanations.",
    { fast: true, maxTokens: 100 }
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
    "You are a bio writer. Return ONLY the bio text. No quotes, no explanations. Max 150 characters.",
    { fast: true, maxTokens: 100 }
  );
}

export async function aiSummarizeChat(messages: { sender: string; content: string }[]): Promise<string> {
  const transcript = messages
    .slice(-30)
    .map(m => `${m.sender}: ${m.content}`)
    .join("\n");

  return askAi(
    `Summarize this chat in 2-3 concise bullet points:\n\n${transcript}`,
    "Conversation summarizer. Brief bullet points using • character. Key topics only. Be very concise.",
    { fast: true, maxTokens: 250 }
  );
}

export async function aiSuggestReply(messages: { sender: string; content: string; isMe: boolean }[], myName: string): Promise<string[]> {
  const lastMessages = messages.slice(-6);
  const transcript = lastMessages
    .map(m => `${m.isMe ? "Me" : m.sender}: ${m.content}`)
    .join("\n");

  const reply = await askAi(
    `Suggest 3 short replies I could send. 1-2 sentences max each. Separate with |||. Only the 3 replies:\n\n${transcript}`,
    "Reply assistant. Return exactly 3 short replies separated by |||. No numbering, no quotes.",
    { fast: true, maxTokens: 200 }
  );

  return reply.split("|||").map(s => s.trim()).filter(s => s.length > 0).slice(0, 3);
}

export async function aiSummarizeThread(post: string, replies: { author: string; content: string }[]): Promise<string> {
  const thread = [
    `Post: ${post}`,
    ...replies.slice(0, 20).map(r => `${r.author}: ${r.content}`),
  ].join("\n");

  return askAi(
    `Summarize this post and replies in 2-3 bullet points. Main topic and key opinions:\n\n${thread}`,
    "Thread summarizer. Brief bullet points using • character. Focus on main topic and viewpoints.",
    { fast: true, maxTokens: 250 }
  );
}

export async function transcribeAudio(audioUrl: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
    },
    body: JSON.stringify({ audioUrl }),
  });

  if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
  const data = await res.json();
  return data.text || "";
}

export async function aiTranslateMessage(text: string, targetLang: string): Promise<string> {
  return askAi(
    `Translate to ${targetLang}. Return ONLY the translation:\n\n${text}`,
    "Translator. Return ONLY translated text.",
    { fast: true, maxTokens: 200 }
  );
}

export async function aiGenerateCaption(imageDescription?: string): Promise<string> {
  const prompt = imageDescription
    ? `Write a catchy, short social media caption (under 280 characters) for an image of: ${imageDescription}`
    : "Write a catchy, inspirational social media caption (under 280 characters) for a general post";

  return askAi(prompt, "Caption writer. Return ONLY the caption text. No quotes. Max 280 characters.", { fast: true, maxTokens: 150 });
}
