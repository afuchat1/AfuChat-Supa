import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import {
  isTelegramMiniApp,
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
  const isTg = isWeb && isTelegramMiniApp();

  const [colorScheme, setColorScheme] = useState<TelegramColorScheme>(() =>
    isTg ? getTelegramColorScheme() : "light"
  );
  const [safeAreaInset, setSafeAreaInset] = useState<TelegramSafeAreaInset>(() =>
    isTg ? getTelegramSafeAreaInset() : ZERO_INSET
  );
  const [contentSafeAreaInset, setContentSafeAreaInset] = useState<TelegramSafeAreaInset>(() =>
    isTg ? getTelegramContentSafeAreaInset() : ZERO_INSET
  );
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    isTg ? getTelegramViewportHeight() : 0
  );

  const telegramUser = isTg ? getTelegramUser() : null;

  useEffect(() => {
    if (!isTg) return;

    telegramReady();
    telegramExpand();

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

  const syncThemeColor = useCallback((bgColor: string) => {
    if (!isTg) return;
    telegramSetHeaderColor(bgColor);
    telegramSetBackgroundColor(bgColor);
  }, [isTg]);

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
