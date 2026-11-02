import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

const WEB_URL_PATTERN = /^https?:\/\//i;

export function isWebUrl(url: string): boolean {
  return WEB_URL_PATTERN.test(url.trim());
}

/**
 * Opens web links in the native in-app browser. Non-web schemes such as
 * mailto:, tel:, and app deep links continue to use their OS handlers.
 */
export async function openExternalLink(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  if (isWebUrl(trimmed)) {
    try {
      await WebBrowser.openBrowserAsync(trimmed, {
        showTitle: true,
        enableBarCollapsing: true,
      });
      return;
    } catch {
      // If the in-app browser cannot open, let the OS handle the URL.
    }
  }

  await Linking.openURL(trimmed);
}
