/**
 * Communities tab — temporarily disabled.
 *
 * The full Communities experience is being reworked; until it ships, the
 * route is hidden from the bottom tabs and the desktop sidebar, and any
 * direct URL access lands on this lightweight placeholder.
 */
import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

export default function CommunitiesUnavailable() {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surface }]}>
        <Ionicons name="people-outline" size={42} color={colors.textMuted} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>Communities are coming soon</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        We're rebuilding this experience. It'll be back shortly.
      </Text>
      <Pressable
        onPress={() => router.replace("/(tabs)/discover" as any)}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.btnText}>Back to Discover</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  btn: {
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
  },
  btnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
