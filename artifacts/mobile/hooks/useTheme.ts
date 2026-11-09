import Colors from "@/constants/colors";
import { useThemeContext } from "@/context/ThemeContext";
import { useAppAccent } from "@/context/AppAccentContext";

export function useTheme() {
  const { isDark, themeMode, setThemeMode, setForceDark } = useThemeContext();
  const { accent } = useAppAccent();
  const baseColors = isDark ? Colors.dark : Colors.light;

  const colors = {
    ...baseColors,
    accent,
    tint: accent,
    tabIconSelected: accent,
    online: accent,
    unread: accent,
    bubble: accent,
  };
  return { colors, isDark, themeMode, setThemeMode, setForceDark, accent };
}
