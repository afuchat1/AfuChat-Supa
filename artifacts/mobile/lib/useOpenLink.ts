import { useCallback } from "react";
import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { showAlert } from "@/lib/alert";
import { openExternalLink } from "@/lib/openExternalLink";

export { isWebUrl } from "@/lib/openExternalLink";

// Default tap: open web URLs in the in-app browser and send non-web schemes
// (mailto, tel, sms, and app deep links) to their OS handlers.
export function useOpenLink() {
  return useCallback((url: string) => {
    if (!url) return;
    void openExternalLink(url).catch(() => {});
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
