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

export function isTelegramMiniApp(): boolean {
  const tg = getWebApp();
  if (!tg) return false;
  return typeof tg.version !== "undefined";
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
