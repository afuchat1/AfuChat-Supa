/**
 * User-content translation using Google Translate's public endpoint.
 *
 * This module is only for runtime content authored by users, such as chat
 * messages and posts. UI/page copy belongs in the bundled local i18n module.
 */

const CACHE = new Map<string, string>();
const IN_FLIGHT = new Map<string, Promise<string>>();
const SOURCE_LANGUAGE_CACHE = new Map<string, string | null>();

function cacheKey(text: string, targetLang: string): string {
  return `${targetLang}:${text.slice(0, 120)}`;
}

export async function translateUserContent(text: string, targetLang: string): Promise<string> {
  if (!text?.trim() || text.trim().length < 2) return text;

  const stripped = text.replace(/[\p{Emoji}\s]/gu, "");
  if (!stripped) return text;

  const key = cacheKey(text, targetLang);
  if (CACHE.has(key)) return CACHE.get(key)!;
  const existing = IN_FLIGHT.get(key);
  if (existing) return existing;

  const request = (async () => {
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
  })();

  IN_FLIGHT.set(key, request);
  try {
    return await request;
  } finally {
    IN_FLIGHT.delete(key);
  }
}

/**
 * Detect the source language without translating the message for display.
 * Google returns the detected language in the third response slot when the
 * source language is set to auto.
 */
export async function detectMessageLanguage(text: string): Promise<string | null> {
  const trimmed = text?.trim() ?? "";
  const stripped = trimmed.replace(/[\p{Emoji}\s]/gu, "");
  if (!stripped || trimmed.length < 2) return null;

  const key = trimmed.slice(0, 240);
  if (SOURCE_LANGUAGE_CACHE.has(key)) return SOURCE_LANGUAGE_CACHE.get(key) ?? null;

  try {
    const url =
      `https://translate.googleapis.com/translate_a/single` +
      `?client=gtx&sl=auto&tl=en&dt=t` +
      `&q=${encodeURIComponent(trimmed)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const detected = typeof json?.[2] === "string" ? json[2].split("-")[0] : null;
    SOURCE_LANGUAGE_CACHE.set(key, detected);
    return detected;
  } catch {
    return null;
  }
}

