const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Returns the Supabase edge function base URL.
 * All AI logic is handled by Supabase edge functions — NOT the Express backend.
 */
function getEdgeFnBase(): string {
  return `${supabaseUrl}/functions/v1`;
}

/** Common auth headers for Supabase edge function calls (anon key — works for verify_jwt:false functions). */
function edgeHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${supabaseAnonKey}`,
    "apikey": supabaseAnonKey,
  };
}

/**
 * Auth headers that include the signed-in user's JWT.
 * Required for edge functions with verify_jwt:true (e.g. generate-ai-image, chat-with-afuai).
 */
export function edgeHeadersWithAuth(userAccessToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${userAccessToken}`,
    "apikey": supabaseAnonKey,
  };
}

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

  const res = await fetch(`${getEdgeFnBase()}/afu-ai-reply`, {
    method: "POST",
    headers: edgeHeaders(),
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
  // Route to afu-ai-reply (verify_jwt:false, handles {audioUrl} natively via Groq).
  // Falls back to the dedicated transcribe-audio function if the primary fails.
  const primary = await fetch(`${getEdgeFnBase()}/afu-ai-reply`, {
    method: "POST",
    headers: edgeHeaders(),
    body: JSON.stringify({ audioUrl }),
  });

  if (primary.ok) {
    const data = await primary.json();
    if (data.text !== undefined) return data.text || "";
  }

  // Fallback: dedicated transcribe-audio function (requires user JWT via supabase client)
  const fallback = await fetch(`${getEdgeFnBase()}/transcribe-audio`, {
    method: "POST",
    headers: edgeHeaders(),
    body: JSON.stringify({ audioUrl }),
  });
  if (!fallback.ok) throw new Error(`Transcription failed: ${fallback.status}`);
  const data = await fallback.json();
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

export interface OrgAiContext {
  name: string;
  orgType?: string;
  industry?: string;
  location?: string;
  foundedYear?: string;
  registrationNumber?: string;
  website?: string;
  tagline?: string;
}

function buildOrgContext(ctx: OrgAiContext): string {
  return [
    `Organization name: ${ctx.name}`,
    ctx.orgType ? `Type: ${ctx.orgType}` : null,
    ctx.industry ? `Industry: ${ctx.industry}` : null,
    ctx.location ? `Location: ${ctx.location}` : null,
    ctx.foundedYear ? `Founded: ${ctx.foundedYear}` : null,
    ctx.registrationNumber ? `Government registration number: ${ctx.registrationNumber} (officially registered)` : null,
    ctx.website ? `Website: ${ctx.website}` : null,
    ctx.tagline ? `Tagline: ${ctx.tagline}` : null,
  ].filter(Boolean).join("\n");
}

export async function aiGenerateOrgUpdate(
  ctx: OrgAiContext,
  topic: string,
  tone: "professional" | "exciting" | "informative" = "professional"
): Promise<string> {
  const context = buildOrgContext(ctx);
  const toneGuide =
    tone === "exciting"
      ? "Use an enthusiastic, celebratory tone with relevant emoji. Highlight wins and momentum."
      : tone === "informative"
      ? "Use a clear, factual tone. Prioritise key details and value to the reader. Bullet points where helpful."
      : "Use a professional, authoritative tone suitable for a company page post.";
  return askAi(
    `Write a company page update (150–400 words) about the following topic: "${topic}"\n\n${toneGuide}\n\nOrganization:\n${context}`,
    "You are a professional B2B content writer. Return ONLY the post text — no headings, no markdown other than occasional line breaks. Do not fabricate statistics or details not provided.",
    { fast: false, maxTokens: 600 }
  );
}

export async function aiEnhanceOrgPost(content: string, ctx?: OrgAiContext): Promise<string> {
  const orgInfo = ctx ? `\n\nOrganization context:\n${buildOrgContext(ctx)}` : "";
  return askAi(
    `Improve this company page update. Make it more engaging, clear, and professional. Keep the same core message and approximate length.${orgInfo}\n\nOriginal:\n${content}`,
    "You are a professional B2B content editor. Return ONLY the improved post text. No explanations, no markdown headers. Preserve line breaks.",
    { fast: false, maxTokens: 600 }
  );
}

export async function aiGenerateOrgTagline(ctx: OrgAiContext): Promise<string> {
  const context = buildOrgContext(ctx);
  return askAi(
    `Write a concise, compelling tagline (max 120 characters) for this organization based ONLY on the facts provided. Do not invent details not listed.\n\n${context}`,
    "You are a professional brand copywriter. Return ONLY the tagline text — no quotes, no explanation, no prefix. Max 120 characters. Be specific to the organization, professional, and memorable.",
    { fast: false, maxTokens: 80 }
  );
}

export async function aiGenerateOrgDescription(ctx: OrgAiContext): Promise<string> {
  const context = buildOrgContext(ctx);
  return askAi(
    `Write a professional About / Description section (150–400 words) for this organization's public company page. Base it ONLY on the facts provided — do not invent services, products, revenue figures, team sizes, clients, awards, or any other detail not listed. If information is limited, write general but accurate statements that apply to an organization of this type and industry. Use clear, engaging prose suitable for a LinkedIn-style company page.\n\n${context}`,
    "You are a professional business copywriter. Return ONLY the description text — no headings, no markdown, no bullet points, no explanation. Write in flowing paragraphs. Be accurate and do not fabricate any details not explicitly provided.",
    { fast: false, maxTokens: 600 }
  );
}

export interface JobAiContext {
  orgName: string;
  orgType?: string;
  industry?: string;
  location?: string;
  website?: string;
  description?: string;
  tagline?: string;
}

export async function aiGenerateJobDescription(
  jobTitle: string,
  jobType: string,
  location: string,
  ctx: JobAiContext
): Promise<string> {
  const orgContext = [
    `Company: ${ctx.orgName}`,
    ctx.orgType ? `Type: ${ctx.orgType}` : null,
    ctx.industry ? `Industry: ${ctx.industry}` : null,
    ctx.location ? `Headquarters: ${ctx.location}` : null,
    ctx.website ? `Website: ${ctx.website}` : null,
    ctx.tagline ? `Tagline: ${ctx.tagline}` : null,
    ctx.description ? `About the company: ${ctx.description}` : null,
  ].filter(Boolean).join("\n");

  return askAi(
    `Write a compelling, accurate job description for the following position.\n\nPosition: ${jobTitle}\nType: ${jobType}${location ? `\nLocation: ${location}` : ""}\n\nCompany context:\n${orgContext}\n\nStructure the description with: a short role overview (2–3 sentences), key responsibilities (5–7 bullet points using •), required qualifications (4–6 bullet points), and a short closing statement about culture/growth. Tailor responsibilities and requirements to what this type of company in this industry would actually need. Be specific and realistic.`,
    "You are an expert HR copywriter and talent acquisition specialist. Return ONLY the job description text — no headings like 'Job Description', no markdown formatting, no extra explanation. Use • for bullet points. Write in clear, engaging, professional English. Do not fabricate salary, benefits, or company-specific details not provided.",
    { fast: false, maxTokens: 700 }
  );
}

export async function aiResearchCompanyAndGenerateAbout(ctx: JobAiContext): Promise<string> {
  const orgContext = [
    `Company name: ${ctx.orgName}`,
    ctx.orgType ? `Organization type: ${ctx.orgType}` : null,
    ctx.industry ? `Industry: ${ctx.industry}` : null,
    ctx.location ? `Location: ${ctx.location}` : null,
    ctx.website ? `Website: ${ctx.website}` : null,
    ctx.tagline ? `Tagline: ${ctx.tagline}` : null,
  ].filter(Boolean).join("\n");

  return askAi(
    `Based on your knowledge, write a professional "About Us" section for this organization's company page. Use what you know about companies in this industry and of this type to write an accurate, specific, and engaging about section (120–250 words). If you have specific knowledge about this company from your training data, use it — otherwise, write accurate general statements that fit the industry and org type.\n\n${orgContext}`,
    "You are a professional brand copywriter with deep knowledge of industries and organizations worldwide. Return ONLY the About text — no headings, no markdown, no explanation. Write in flowing paragraphs. Be specific to the industry, professional, and engaging. Do not fabricate statistics or client names.",
    { fast: false, maxTokens: 400 }
  );
}

/** Builds the Supabase edge function base URL — exported for screens that call edge fns directly. */
export { getEdgeFnBase, edgeHeaders };
