import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { APP_ACCENT_KEY, CHAT_THEME_COLORS, useChatPreferences, type ChatTheme } from "./ChatPreferencesContext";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

type AppAccentContextType = {
  appTheme: ChatTheme;
  setAppTheme: (t: ChatTheme) => void;
  accent: string;
};

const AppAccentContext = createContext<AppAccentContextType>({
  appTheme: "Teal",
  setAppTheme: () => {},
  accent: Colors.brand,
});

export function AppAccentProvider({ children }: { children: React.ReactNode }) {
  const [appTheme, setAppThemeState] = useState<ChatTheme>("Teal");
  const { isPremium, loading: authLoading } = useAuth();
  const { prefs, loading: preferencesLoading } = useChatPreferences();

  useEffect(() => {
    if (authLoading) return;
    if (!isPremium) {
      setAppThemeState("Teal");
      return;
    }
    if (preferencesLoading) return;
    const savedTheme = prefs.chat_theme;
    if (savedTheme in CHAT_THEME_COLORS) {
      setAppThemeState(savedTheme);
      AsyncStorage.setItem(APP_ACCENT_KEY, savedTheme).catch(() => {});
    }
  }, [authLoading, isPremium, preferencesLoading, prefs.chat_theme]);

  const setAppTheme = useCallback((t: ChatTheme) => {
    if (authLoading || !isPremium || !(t in CHAT_THEME_COLORS)) return;
    setAppThemeState(t);
    AsyncStorage.setItem(APP_ACCENT_KEY, t).catch(() => {});
  }, [authLoading, isPremium]);

  const accent = CHAT_THEME_COLORS[appTheme]?.accent || Colors.brand;

  return (
    <AppAccentContext.Provider value={{ appTheme, setAppTheme, accent }}>
      {children}
    </AppAccentContext.Provider>
  );
}

export function useAppAccent() {
  return useContext(AppAccentContext);
}
