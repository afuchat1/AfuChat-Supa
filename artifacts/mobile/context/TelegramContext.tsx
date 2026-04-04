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
  isInTelegramWebView,
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

  /** Called once the SDK is confirmed loaded. Sets all reactive state. */
  const applyTelegramState = useCallback(() => {
    if (appliedRef.current) return;
    if (!isTelegramMiniApp()) return; // not a real Mini App context
    appliedRef.current = true;

    setIsTg(true);
    setTelegramUser(getTelegramUser());
    setColorScheme(getTelegramColorScheme());
    setSafeAreaInset(getTelegramSafeAreaInset());
    setContentSafeAreaInset(getTelegramContentSafeAreaInset());
    setViewportHeight(getTelegramViewportHeight());

    telegramReady();
    telegramExpand();
  }, []);

  useEffect(() => {
    if (!isWeb || typeof window === "undefined" || typeof document === "undefined") return;

    // ── Fast path: SDK already fully initialised (e.g. static build has it in <head>) ──
    if (isTelegramMiniApp()) {
      applyTelegramState();
      return;
    }

    // ── Only proceed with script injection / waiting if we are actually
    //    inside Telegram's WebView.  In a regular browser TelegramWebviewProxy
    //    does not exist, so we skip entirely to avoid false-positive detection. ──
    if (!isInTelegramWebView()) return;

    // Helper: attach to an existing script tag's load event
    const waitForExistingScript = (el: HTMLScriptElement) => {
      if ((el as any).__tgLoaded) {
        applyTelegramState();
      } else {
        el.addEventListener("load", applyTelegramState, { once: true });
      }
    };

    // Check whether a <script> tag for the SDK is already in the document
    const existing = document.querySelector(
      'script[src*="telegram-web-app"]'
    ) as HTMLScriptElement | null;

    if (existing) {
      waitForExistingScript(existing);
      return;
    }

    // Inject the SDK — we know we're in Telegram's WebView, so we definitely need it.
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = false; // keep execution order relative to React bootstrap
    script.onload = () => {
      (script as any).__tgLoaded = true;
      applyTelegramState();
    };
    script.onerror = () => {
      (script as any).__tgLoaded = true;
    };
    document.head.insertBefore(script, document.head.firstChild);
  }, [isWeb, applyTelegramState]);

  // Subscribe to live theme / viewport events once confirmed inside Telegram
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
