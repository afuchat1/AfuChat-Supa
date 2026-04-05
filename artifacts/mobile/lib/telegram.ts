import { Platform } from "react-native";

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  is_premium?: boolean;
};

export type TelegramSafeAreaInset = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type TelegramColorScheme = "light" | "dark";

function getWebApp(): any {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined") return null;
  return (window as any).Telegram?.WebApp ?? null;
}

/**
 * Returns true when the page is running inside an actual Telegram Mini App.
 *
 * Detection strategy (most → least reliable):
 *  1. tg.platform — the SDK sets this to the Telegram client name (e.g. "android",
 *     "ios", "tdesktop"). In a regular browser it is "unknown".
 *  2. tg.initData — non-empty string only when opened via a bot button/link.
 *  3. URL hash — Telegram passes #tgWebAppData=... before the SDK loads.
 *
 * The SDK object (window.Telegram.WebApp) must exist for this to return true,
 * so callers can immediately use getTelegramUser() etc.
 */
export function isTelegramMiniApp(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;

  const tg = getWebApp();
  if (!tg || typeof tg.version === "undefined") return false;

  // Primary: platform is set to a real client name inside Telegram
  if (tg.platform && tg.platform !== "unknown") return true;

  // Fallback: initData is non-empty only in real Mini App contexts
  if (tg.initData) return true;

  return false;
}

/**
 * Returns true if the page appears to have been opened as a Telegram Mini App,
 * even before the SDK has loaded.  Uses the URL hash that Telegram injects.
 */
export function looksLikeTelegramWebApp(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  // TelegramWebviewProxy: older Telegram WebView bridge (Android / desktop)
  if ((window as any).TelegramWebviewProxy) return true;
  // iOS bridge
  if ((window as any).webkit?.messageHandlers?.TelegramWebviewProxy) return true;
  // Modern Telegram passes data via URL hash
  try {
    if (window.location.hash.includes("tgWebAppData")) return true;
  } catch (_) {}
  return false;
}

export function getTelegramInitData(): string {
  return getWebApp()?.initData ?? "";
}

export function getTelegramUser(): TelegramUser | null {
  return getWebApp()?.initDataUnsafe?.user ?? null;
}

export function getTelegramColorScheme(): TelegramColorScheme {
  return getWebApp()?.colorScheme ?? "light";
}

export function getTelegramSafeAreaInset(): TelegramSafeAreaInset {
  const tg = getWebApp();
  if (!tg) return { top: 0, bottom: 0, left: 0, right: 0 };
  const inset = tg.safeAreaInset ?? {};
  return {
    top: inset.top ?? 0,
    bottom: inset.bottom ?? 0,
    left: inset.left ?? 0,
    right: inset.right ?? 0,
  };
}

export function getTelegramContentSafeAreaInset(): TelegramSafeAreaInset {
  const tg = getWebApp();
  if (!tg) return { top: 0, bottom: 0, left: 0, right: 0 };
  const inset = tg.contentSafeAreaInset ?? {};
  return {
    top: inset.top ?? 0,
    bottom: inset.bottom ?? 0,
    left: inset.left ?? 0,
    right: inset.right ?? 0,
  };
}

export function getTelegramViewportHeight(): number {
  return getWebApp()?.viewportHeight ?? (typeof window !== "undefined" ? window.innerHeight : 0);
}

export function telegramReady(): void {
  getWebApp()?.ready();
}

export function telegramExpand(): void {
  getWebApp()?.expand();
}

export function telegramClose(): void {
  getWebApp()?.close();
}

export function telegramShowBackButton(): void {
  getWebApp()?.BackButton?.show();
}

export function telegramHideBackButton(): void {
  getWebApp()?.BackButton?.hide();
}

export function telegramOnBackButton(cb: () => void): () => void {
  const tg = getWebApp();
  if (!tg?.BackButton) return () => {};
  tg.BackButton.onClick(cb);
  return () => tg.BackButton.offClick(cb);
}

export function telegramIsBackButtonVisible(): boolean {
  return getWebApp()?.BackButton?.isVisible ?? false;
}

export function telegramSetHeaderColor(color: string): void {
  try { getWebApp()?.setHeaderColor(color); } catch (_) {}
}

export function telegramSetBackgroundColor(color: string): void {
  try { getWebApp()?.setBackgroundColor(color); } catch (_) {}
}

export function telegramEnableClosingConfirmation(): void {
  try { getWebApp()?.enableClosingConfirmation(); } catch (_) {}
}

export function telegramHapticFeedback(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light"): void {
  try { getWebApp()?.HapticFeedback?.impactOccurred(style); } catch (_) {}
}

export function telegramOnViewportChange(cb: (isExpanded: boolean) => void): () => void {
  const tg = getWebApp();
  if (!tg) return () => {};
  const handler = () => cb(tg.isExpanded);
  tg.onEvent("viewportChanged", handler);
  return () => tg.offEvent("viewportChanged", handler);
}

export function telegramOnThemeChange(cb: () => void): () => void {
  const tg = getWebApp();
  if (!tg) return () => {};
  tg.onEvent("themeChanged", cb);
  return () => tg.offEvent("themeChanged", cb);
}
