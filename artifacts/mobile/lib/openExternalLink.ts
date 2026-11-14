import { Linking } from "react-native";
import { router } from "expo-router";

const WEB_URL_PATTERN = /^https?:\/\//i;

export function isWebUrl(url: string): boolean {
  return WEB_URL_PATTERN.test(url.trim());
}

/**
 * Opens ordinary web links in AfuChat's browser. Non-web schemes such as
 * mailto:, tel:, and app deep links continue to use their OS handlers.
 */
export async function openExternalLink(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  if (isWebUrl(trimmed)) {
    router.push({ pathname: "/browser" as any, params: { url: trimmed } });
    return;
  }

  await Linking.openURL(trimmed);
}
