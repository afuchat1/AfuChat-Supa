import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function NotFoundScreen() {
  const { colors } = useTheme();
  const { isDesktop } = useIsDesktop();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      {!isDesktop && (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/discover")}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </TouchableOpacity>
      )}

      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: colors.surface ?? colors.backgroundSecondary }]}>
          <Ionicons name="compass-outline" size={isDesktop ? 52 : 44} color={colors.accent} />
        </View>

        <Text style={[styles.code, { color: colors.accent }]}>404</Text>

        <Text style={[styles.title, { color: colors.text, fontSize: isDesktop ? 26 : 22 }]}>
          Page not found
        </Text>

        <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: isDesktop ? 16 : 14 }]}>
          {pathname && pathname !== "/"
            ? `"${pathname}" doesn't exist or has been moved.`
            : "The page you're looking for doesn't exist."}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: "#00BCD4" }]}
            onPress={() => router.replace("/(tabs)/discover")}
            activeOpacity={0.85}
          >
            <Ionicons name="home-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Go to Discover</Text>
          </TouchableOpacity>

          {router.canGoBack() && (
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={17} color={colors.accent} />
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Go back</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.suggestions, { borderTopColor: colors.border }]}>
          <Text style={[styles.suggestionsTitle, { color: colors.textMuted }]}>
            Try one of these instead
          </Text>
          <View style={styles.suggestionRow}>
            {[
              { label: "Chats", icon: "chatbubble-outline" as const, path: "/(tabs)" as const },
              { label: "Shorts", icon: "play-circle-outline" as const, path: "/shorts" as const },
              { label: "Moments", icon: "images-outline" as const, path: "/moments" as const },
              { label: "Search", icon: "search-outline" as const, path: "/(tabs)/search" as const },
            ].map((s) => (
              <TouchableOpacity
                key={s.label}
                style={[styles.suggestionChip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                onPress={() => router.push(s.path as any)}
                activeOpacity={0.75}
              >
                <Ionicons name={s.icon} size={16} color={colors.text} />
                <Text style={[styles.suggestionChipText, { color: colors.text }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  code: {
    fontSize: 64,
    fontFamily: "Inter_700Bold",
    letterSpacing: -2,
    lineHeight: 72,
    marginBottom: 4,
  },
  title: {
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 340,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 40,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 14,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  suggestions: {
    width: "100%",
    maxWidth: 400,
    borderTopWidth: 1,
    paddingTop: 24,
    gap: 14,
  },
  suggestionsTitle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  suggestionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
