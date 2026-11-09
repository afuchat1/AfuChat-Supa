import { Stack } from "expo-router";

export default function GamesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", gestureEnabled: true, contentStyle: { backgroundColor: "#0a0a0a" } }} />
  );
}
