import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CHAT_THEME_COLORS, type ChatTheme } from "./ChatPreferencesContext";
import Colors from "@/constants/colors";

const STORAGE_KEY = "app_color_theme";

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

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v && v in CHAT_THEME_COLORS) setAppThemeState(v as ChatTheme);
    });
  }, []);

  const setAppTheme = useCallback((t: ChatTheme) => {
    setAppThemeState(t);
    AsyncStorage.setItem(STORAGE_KEY, t);
  }, []);

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
