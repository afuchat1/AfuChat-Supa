import { useCallback } from "react";
import * as Clipboard from "expo-clipboard";
import { showAlert } from "@/lib/alert";
import { openExternalLink } from "@/lib/openExternalLink";

export { isWebUrl } from "@/lib/openExternalLink";

// Default tap: route AfuChat links internally and open other links with the OS.
export function useOpenLink() {
  return useCallback((url: string) => {
    if (!url) return;
    void openExternalLink(url).catch(() => {});
  }, []);
}

// Long-press on any link shows native Android link actions.
export function useOpenLinkActions() {
  const openInBrowser = useCallback((url: string) => {
    void openExternalLink(url).catch(() => {});
  }, []);

  const showLinkSheet = useCallback(
    (url: string) => {
      const display = url.length > 52 ? url.slice(0, 52) + "\u2026" : url;
      showAlert("Open Link", display, [
        { text: "Open externally", onPress: () => openInBrowser(url) },
        { text: "Copy Link",             onPress: () => Clipboard.setStringAsync(url).catch(() => {}) },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [openInBrowser],
  );

  return { showLinkSheet, openInBrowser };
}
