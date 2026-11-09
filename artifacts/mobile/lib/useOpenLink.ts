import { useCallback } from "react";
import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { showAlert } from "@/lib/alert";

const WEB_SCHEMES = ["http://", "https://"];

export function isWebUrl(url: string) {
  return WEB_SCHEMES.some((s) => url.startsWith(s));
}

// Default tap on a link: open web URLs in Chrome Custom Tabs and send
// non-http links (mailto, tel, sms) to the OS handler.
export function useOpenLink() {
  return useCallback((url: string) => {
    if (!url) return;
    const trimmed = url.trim();

    if (isWebUrl(trimmed)) {
      WebBrowser.openBrowserAsync(trimmed, {
        showTitle: true,
        enableBarCollapsing: true,
      }).catch(() => Linking.openURL(trimmed).catch(() => {}));
    } else {
      Linking.openURL(trimmed).catch(() => {});
    }
  }, []);
}

// Long-press on any link shows native Android link actions.
export function useOpenLinkActions() {
  const openInChrome = useCallback((url: string) => {
    WebBrowser.openBrowserAsync(url, {
      showTitle: true,
      enableBarCollapsing: true,
    }).catch(() => Linking.openURL(url).catch(() => {}));
  }, []);

  const showLinkSheet = useCallback(
    (url: string) => {
      const display = url.length > 52 ? url.slice(0, 52) + "\u2026" : url;
      showAlert("Open Link", display, [
        { text: "Open in Google Chrome", onPress: () => openInChrome(url) },
        { text: "Copy Link",             onPress: () => Clipboard.setStringAsync(url).catch(() => {}) },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [openInChrome],
  );

  return { showLinkSheet, openInChrome };
}
