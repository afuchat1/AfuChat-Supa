/**
 * Real message translation using the MyMemory free API.
 * No API key required. Supports 50+ languages. Free up to 5000 chars/day.
 * Language codes: "en", "zh", "es", "fr", "ar", "hi", "pt", "ru", "ja", "de", etc.
 */

const BASE_URL = "https://api.mymemory.translated.net/get";
const CACHE = new Map<string, string>();

function cacheKey(text: string, targetLang: string): string {
  return `${targetLang}:${text.slice(0, 80)}`;
}

export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text?.trim() || text.trim().length < 2) return text;

  // Skip translation for emoji-only or special messages
  const stripped = text.replace(/[\p{Emoji}]/gu, "").trim();
  if (!stripped) return text;

  const key = cacheKey(text, targetLang);
  if (CACHE.has(key)) return CACHE.get(key)!;

  try {
    // Detect source language auto, translate to target
    const langpair = `auto|${targetLang}`;
    const url = `${BASE_URL}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}&de=afuchat@app.com`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    if (json.responseStatus === 200 && json.responseData?.translatedText) {
      const translated = json.responseData.translatedText as string;
      CACHE.set(key, translated);
      return translated;
    }

    // Fallback: try first match
    if (json.matches?.[0]?.translation) {
      const translated = json.matches[0].translation as string;
      CACHE.set(key, translated);
      return translated;
    }

    return text;
  } catch {
    return text;
  }
}

export const LANG_LABELS: Record<string, string> = {
  en: "English", zh: "Chinese", es: "Spanish", fr: "French",
  ar: "Arabic", hi: "Hindi", pt: "Portuguese", ru: "Russian",
  ja: "Japanese", de: "German",
};
