import { Platform, useWindowDimensions } from "react-native";

const DESKTOP_BREAKPOINT = 1024;

/**
 * On web we let the URL override the responsive breakpoint so we can preview
 * both experiences from the same bundle in narrow iframes (canvas, mockups,
 * docs). The override is sticky for the session via sessionStorage so it
 * survives client-side navigations.
 *
 *   ?view=desktop  → force desktop layout
 *   ?view=mobile   → force mobile layout
 *   (no param)     → fall back to window width vs DESKTOP_BREAKPOINT
 */
function readViewOverride(): "desktop" | "mobile" | null {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("view");
    if (param === "desktop" || param === "mobile") {
      window.sessionStorage?.setItem("afuchat:view", param);
      return param;
    }
    const stored = window.sessionStorage?.getItem("afuchat:view");
    if (stored === "desktop" || stored === "mobile") return stored;
  } catch {
    // sessionStorage / URL access can throw in sandboxed iframes; ignore.
  }
  return null;
}

export function useIsDesktop() {
  const { width, height } = useWindowDimensions();
  const override = readViewOverride();
  let isDesktop: boolean;
  if (override === "desktop") {
    isDesktop = Platform.OS === "web";
  } else if (override === "mobile") {
    isDesktop = false;
  } else {
    isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
  }
  return { isDesktop, width, height };
}
