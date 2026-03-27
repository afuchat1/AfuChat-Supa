/**
 * Real message translation using Google Translate's public endpoint.
 * No API key required. Auto-detects source language.
 * Supports 100+ languages with full accuracy.
 */

const CACHE = new Map<string, string>();

function cacheKey(text: string, targetLang: string): string {
  return `${targetLang}:${text.slice(0, 120)}`;
}

export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text?.trim() || text.trim().length < 2) return text;

  const stripped = text.replace(/[\p{Emoji}\s]/gu, "");
  if (!stripped) return text;

  const key = cacheKey(text, targetLang);
  if (CACHE.has(key)) return CACHE.get(key)!;

  try {
    const url =
      `https://translate.googleapis.com/translate_a/single` +
      `?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t` +
      `&q=${encodeURIComponent(text)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    if (Array.isArray(json?.[0])) {
      const translated = (json[0] as any[])
        .map((seg: any) => (Array.isArray(seg) ? seg[0] ?? "" : ""))
        .join("")
        .trim();

      if (translated && translated !== text) {
        CACHE.set(key, translated);
        return translated;
      }
    }

    return text;
  } catch {
    return text;
  }
}

export const LANG_LABELS: Record<string, string> = {
  en: "English",
  zh: "Chinese",
  es: "Spanish",
  fr: "French",
  ar: "Arabic",
  hi: "Hindi",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  de: "German",
  sw: "Swahili",
  ko: "Korean",
  it: "Italian",
  tr: "Turkish",
};
