/**
 * ChatHomePlaceholder
 *
 * Empty-state shown in the right pane of the desktop chats master-detail
 * layout when the user hasn't opened a specific conversation yet
 * (WhatsApp-desktop-style "select a chat" screen).
 *
 * The 360px chats list panel on the left is provided by `DesktopShell` via
 * `<ChatsListPanel />`; this component fills the remaining space.
 */
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useTheme } from "@/hooks/useTheme";

const afuLogo = require("@/assets/images/afu-symbol.png");

type Action = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

export function ChatHomePlaceholder() {
  const { colors, isDark } = useTheme();

  const actions: Action[] = [
    {
      key: "new-chat",
      icon: "create-outline",
      label: "New chat",
      onPress: () => router.push("/(tabs)/contacts"),
    },
    {
      key: "new-group",
      icon: "people-outline",
      label: "New group",
      onPress: () => router.push("/group/create"),
    },
    {
      key: "ask-ai",
      icon: "sparkles-outline",
      label: "Ask AfuAI",
      onPress: () => router.push("/ai"),
    },
  ];

  const tileBg = isDark ? "#1F1F1F" : "#F5F5F5";
  const tileBorder = isDark ? "#2A2A2A" : "#ECECEC";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <View style={[styles.logoWrap, { backgroundColor: tileBg }]}>
          <Image source={afuLogo} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>AfuChat for desktop</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Select a conversation on the left to start messaging, or pick a
          quick action below.
        </Text>

        <View style={styles.actionsRow}>
          {actions.map((a) => (
            <Pressable
              key={a.key}
              onPress={a.onPress}
              style={({ hovered, pressed }: any) => [
                styles.actionTile,
                {
                  backgroundColor: tileBg,
                  borderColor: tileBorder,
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ translateY: hovered ? -2 : 0 }],
                },
              ]}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: colors.background }]}>
                <Ionicons name={a.icon} size={22} color={colors.accent} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.text }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.encryptedRow}>
          <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
          <Text style={[styles.encryptedText, { color: colors.textMuted }]}>
            Your personal messages are end-to-end encrypted.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  center: {
    alignItems: "center",
    maxWidth: 520,
  },
  logoWrap: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  logo: {
    width: 64,
    height: 64,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 32,
  },
  actionTile: {
    width: 128,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  encryptedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  encryptedText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
