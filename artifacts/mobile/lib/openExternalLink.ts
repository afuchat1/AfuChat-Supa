import { Linking } from "react-native";
import { safeRouter } from "@/lib/navUtils";
import { handleIncomingUrl, isAfuChatDeepLink } from "@/lib/deepLinkHandler";

const WEB_URL_PATTERN = /^https?:\/\//i;
const BLOCKED_SCHEMES = new Set(["javascript", "data", "file", "content", "blob", "vbscript"]);

export function isWebUrl(url: string): boolean {
  return WEB_URL_PATTERN.test(url.trim());
}

/** Route recognized AfuChat links internally; open all other links with the OS. */
export async function openExternalLink(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  if (isAfuChatDeepLink(trimmed)) {
    const action = await handleIncomingUrl(trimmed);
    if (action?.type === "join_group") {
      safeRouter.navigate({ pathname: "/join/[code]" as any, params: { code: action.code } });
      return;
    }
    if (action?.type === "navigate") {
      safeRouter.navigate(
        action.params
          ? { pathname: action.path as any, params: action.params }
          : (action.path as any),
      );
      return;
    }
    if (!isWebUrl(trimmed)) {
      throw new Error("This AfuChat link is not supported.");
    }
  }

  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (!scheme || BLOCKED_SCHEMES.has(scheme)) {
    throw new Error("This link type cannot be opened safely.");
  }
  await Linking.openURL(trimmed);
}
