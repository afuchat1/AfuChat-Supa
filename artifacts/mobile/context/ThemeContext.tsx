import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Appearance, type ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "system" | "light" | "dark";
export const THEME_MODE_KEY = "afuchat_theme_mode";

type ThemeContextType = {
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setForceDark: (v: boolean) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  themeMode: "system",
  isDark: Appearance.getColorScheme() === "dark",
  setThemeMode: () => {},
  setForceDark: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme() ?? "light");
  const [forceDark, setForceDarkState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_MODE_KEY).then((saved) => {
      if (saved === "system" || saved === "light" || saved === "dark") {
        setThemeModeState(saved);
      }
    }).catch(() => {});

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_MODE_KEY, mode).catch(() => {});
  }, []);

  const setForceDark = useCallback((v: boolean) => {
    setForceDarkState(v);
  }, []);

  // System is the default: an unknown scheme follows the safer light palette
  // instead of making the app appear dark on devices without a reported scheme.
  const isDark = forceDark || (themeMode === "system" ? systemScheme === "dark" : themeMode === "dark");

  return (
    <ThemeContext.Provider value={{ themeMode, isDark, setThemeMode, setForceDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemeContext = () => useContext(ThemeContext);
