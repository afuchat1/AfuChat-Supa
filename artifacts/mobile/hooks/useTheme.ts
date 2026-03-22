import { useColorScheme } from "react-native";
import Colors from "@/constants/colors";

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  return { colors, isDark };
}
