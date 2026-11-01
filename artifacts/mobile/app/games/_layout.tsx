import { Stack } from "expo-router";
import { useTheme } from "@/hooks/useTheme";

export default function GamesLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true, contentStyle: { backgroundColor: colors.background } }} />
  );
}
