import React from "react";
import { useLocalSearchParams } from "expo-router";
import KampalaHustleGame from "./lifesim";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";

export default function PlayRouter() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  // Both old "lifesim" route and new "kampala" route go to the same game
  if (id === "kampala" || id === "lifesim") return <KampalaHustleGame />;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <GlassHeader title="Game Not Found" showBack />
      <View style={s.center}>
        <Text style={{ fontSize: 48 }}>🎮</Text>
        <Text style={[s.title, { color: colors.text }]}>Coming Soon</Text>
        <Text style={[s.sub, { color: colors.textMuted }]}>"{id}" isn't available yet</Text>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Text style={[s.backBtnText, { color: colors.text }]}>Back to Games</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  backBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  backBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
