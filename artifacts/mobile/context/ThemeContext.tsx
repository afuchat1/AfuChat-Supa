import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Appearance, type ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "system" | "light" | "dark";
export const THEME_MODE_KEY = "afuchat_theme_mode";

type ThemeContextType = {
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  themeMode: "system",
  isDark: Appearance.getColorScheme() === "dark",
  setThemeMode: () => {},
});

export function ThemeProvider({
  children,
  forcedMode,
}: {
  children: React.ReactNode;
  forcedMode?: ThemeMode;
}) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme() ?? "light");

  useEffect(() => {
    if (forcedMode) return;

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? "light");
    });
    return () => subscription.remove();
  }, [forcedMode]);

  useEffect(() => {
    if (forcedMode) return;
    AsyncStorage.getItem(THEME_MODE_KEY).then((saved) => {
      if (saved === "system" || saved === "light" || saved === "dark") {
        setThemeModeState(saved);
      }
    }).catch(() => {});
  }, [forcedMode]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    if (forcedMode) return;
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_MODE_KEY, mode).catch(() => {});
  }, [forcedMode]);

  // System is the default: an unknown scheme follows the safer light palette
  // instead of making the app appear dark on devices without a reported scheme.
  const effectiveMode = forcedMode ?? themeMode;
  const isDark = effectiveMode === "system" ? systemScheme === "dark" : effectiveMode === "dark";

  return (
    <ThemeContext.Provider value={{ themeMode: effectiveMode, isDark, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemeContext = () => useContext(ThemeContext);
