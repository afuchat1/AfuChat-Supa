import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import {
  isTelegramMiniApp,
  looksLikeTelegramWebApp,
  getTelegramUser,
  getTelegramColorScheme,
  getTelegramSafeAreaInset,
  getTelegramContentSafeAreaInset,
  getTelegramViewportHeight,
  telegramReady,
  telegramExpand,
  telegramSetHeaderColor,
  telegramSetBackgroundColor,
  telegramOnThemeChange,
  telegramOnViewportChange,
  type TelegramUser,
  type TelegramSafeAreaInset,
  type TelegramColorScheme,
} from "@/lib/telegram";

type TelegramContextType = {
  isTelegram: boolean;
  telegramUser: TelegramUser | null;
  colorScheme: TelegramColorScheme;
  safeAreaInset: TelegramSafeAreaInset;
  contentSafeAreaInset: TelegramSafeAreaInset;
  viewportHeight: number;
  syncThemeColor: (bgColor: string) => void;
};

const ZERO_INSET: TelegramSafeAreaInset = { top: 0, bottom: 0, left: 0, right: 0 };

const TelegramContext = createContext<TelegramContextType>({
  isTelegram: false,
  telegramUser: null,
  colorScheme: "light",
  safeAreaInset: ZERO_INSET,
  contentSafeAreaInset: ZERO_INSET,
  viewportHeight: 0,
  syncThemeColor: () => {},
});

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const isWeb = Platform.OS === "web";

  const [isTg, setIsTg] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [colorScheme, setColorScheme] = useState<TelegramColorScheme>("light");
  const [safeAreaInset, setSafeAreaInset] = useState<TelegramSafeAreaInset>(ZERO_INSET);
  const [contentSafeAreaInset, setContentSafeAreaInset] = useState<TelegramSafeAreaInset>(ZERO_INSET);
  const [viewportHeight, setViewportHeight] = useState(0);
  const appliedRef = useRef(false);

  /**
   * Called once the SDK is confirmed loaded and we have verified we are
   * inside an actual Telegram Mini App.  Populates all reactive state.
   */
  const applyTelegramState = useCallback(() => {
    if (appliedRef.current) return;
    if (!isTelegramMiniApp()) return;
    appliedRef.current = true;

    setIsTg(true);
    setTelegramUser(getTelegramUser());
    setColorScheme(getTelegramColorScheme());
    setSafeAreaInset(getTelegramSafeAreaInset());
    setContentSafeAreaInset(getTelegramContentSafeAreaInset());
    setViewportHeight(getTelegramViewportHeight());

    try { telegramReady(); } catch (_) {}
    try { telegramExpand(); } catch (_) {}
  }, []);

  useEffect(() => {
    if (!isWeb || typeof window === "undefined" || typeof document === "undefined") return;

    // ── Fast path: SDK already loaded and we are inside Telegram ──
    if (isTelegramMiniApp()) {
      applyTelegramState();
      return;
    }

    // ── Determine whether we should bother loading the SDK at all.
    //    We load it eagerly if there are any signals we might be in Telegram,
    //    but always load it if the URL contains Telegram hash params. ──
    const shouldLoad = looksLikeTelegramWebApp();

    const onSdkLoad = () => {
      applyTelegramState();
    };

    // Check for existing script tag (e.g. injected by +html.tsx in a static build)
    const existing = document.querySelector(
      'script[src*="telegram-web-app"]'
    ) as HTMLScriptElement | null;

    if (existing) {
      if ((existing as any).__tgLoaded) {
        onSdkLoad();
      } else {
        existing.addEventListener("load", onSdkLoad, { once: true });
      }
      return;
    }

    // Only inject the script when there's a good reason to think we're in Telegram.
    // This avoids a ~50 KB network request for regular browser visitors.
    if (!shouldLoad) return;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = false; // preserve load order relative to existing scripts
    script.onload = () => {
      (script as any).__tgLoaded = true;
      onSdkLoad();
    };
    script.onerror = () => {
      (script as any).__tgLoaded = true;
    };
    document.head.insertBefore(script, document.head.firstChild);
  }, [isWeb, applyTelegramState]);

  // Subscribe to live theme / viewport events once confirmed in Telegram
  useEffect(() => {
    if (!isTg) return;

    const offTheme = telegramOnThemeChange(() => {
      setColorScheme(getTelegramColorScheme());
      setSafeAreaInset(getTelegramSafeAreaInset());
      setContentSafeAreaInset(getTelegramContentSafeAreaInset());
    });

    const offViewport = telegramOnViewportChange(() => {
      setViewportHeight(getTelegramViewportHeight());
      setSafeAreaInset(getTelegramSafeAreaInset());
      setContentSafeAreaInset(getTelegramContentSafeAreaInset());
    });

    return () => {
      offTheme();
      offViewport();
    };
  }, [isTg]);

  const syncThemeColor = useCallback(
    (bgColor: string) => {
      if (!isTg) return;
      telegramSetHeaderColor(bgColor);
      telegramSetBackgroundColor(bgColor);
    },
    [isTg]
  );

  return (
    <TelegramContext.Provider
      value={{
        isTelegram: isTg,
        telegramUser,
        colorScheme,
        safeAreaInset,
        contentSafeAreaInset,
        viewportHeight,
        syncThemeColor,
      }}
    >
      {children}
    </TelegramContext.Provider>
  );
}

export const useTelegram = () => useContext(TelegramContext);
