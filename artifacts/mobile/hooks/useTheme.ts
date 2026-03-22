import Colors from "@/constants/colors";
import { useThemeContext } from "@/context/ThemeContext";

export function useTheme() {
  const { isDark, themeMode, setThemeMode } = useThemeContext();
  const colors = isDark ? Colors.dark : Colors.light;
  return { colors, isDark, themeMode, setThemeMode };
}
