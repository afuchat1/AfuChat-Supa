export const AFUCHAT_BRAND_NAME = "AfuChat";

const AFUCHAT_BRAND_PATTERN = /\bAfuChat\b/gi;

export function normalizeAfuChatBrandName(text: string): string {
  return text.replace(AFUCHAT_BRAND_PATTERN, AFUCHAT_BRAND_NAME);
}

export function protectAfuChatBrand(text: string): {
  text: string;
  restore: (translated: string) => string | null;
} {
  const tokens: string[] = [];
  let nextToken = 0;
  const protectedText = text.replace(AFUCHAT_BRAND_PATTERN, () => {
    let token: string;
    do {
      token = `ZXQLOCKEDNAME${nextToken++}QXZ`;
    } while (text.includes(token) || tokens.includes(token));
    tokens.push(token);
    return token;
  });

  return {
    text: protectedText,
    restore(translated) {
      let restored = translated;
      for (const token of tokens) {
        if (!restored.toUpperCase().includes(token)) return null;
        restored = restored.replace(new RegExp(token, "gi"), AFUCHAT_BRAND_NAME);
      }
      return normalizeAfuChatBrandName(restored);
    },
  };
}
