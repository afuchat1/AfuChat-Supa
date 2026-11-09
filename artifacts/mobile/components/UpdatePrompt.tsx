import React, { useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useUpdateChecker } from "@/hooks/useUpdateChecker";

export default function UpdatePrompt() {
  const info = useUpdateChecker();
  const { colors, isDark } = useTheme();
  const [dismissed, setDismissed] = useState(false);

  if (!info || dismissed) return null;

  const updateInfo = info;
  const visible = updateInfo.hasUpdate && !dismissed;
  const storeUrl = updateInfo.androidUrl;

  function openStore() {
    Linking.openURL(storeUrl).catch(() => {});
    if (!updateInfo.isMandatory) setDismissed(true);
  }

  function dismiss() {
    if (!updateInfo.isMandatory) setDismissed(true);
  }

  const bg = isDark ? "#1a1a2e" : "#fff";
  const accent = colors.accent;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={s.backdrop}>
        <View style={[s.card, { backgroundColor: bg }]}>

          {/* Icon */}
          <View style={[s.iconWrap, { backgroundColor: accent + "18" }]}>
            <Ionicons name="rocket" size={36} color={accent} />
          </View>

          {/* Title */}
          <Text style={[s.title, { color: colors.text }]}>
            {info.isMandatory ? "Update Required" : "Update Available"}
          </Text>

          {/* Body */}
          <Text style={[s.body, { color: colors.textMuted ?? "#888" }]}>
            {info.isMandatory
              ? `AfuChat ${info.latestVersion} is required to continue. Please update the app to keep using AfuChat.`
              : `AfuChat ${info.latestVersion} is available with new features and improvements. Update now for the best experience.`}
          </Text>

          {/* Buttons */}
          <Pressable
            onPress={openStore}
            style={({ pressed }) => [s.primaryBtn, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
          >
            <Ionicons name="download" size={18} color="#fff" />
            <Text style={s.primaryTxt}>Update Now</Text>
          </Pressable>

          {!info.isMandatory && (
            <Pressable onPress={dismiss} style={s.skipBtn}>
              <Text style={[s.skipTxt, { color: colors.textMuted ?? "#888" }]}>
                Maybe later
              </Text>
            </Pressable>
          )}

          {/* Version label */}
          <Text style={[s.versionNote, { color: colors.textMuted ?? "#aaa" }]}>
            v{info.latestVersion} available
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  card: {
    width: "100%", maxWidth: 380,
    borderRadius: 24, padding: 28,
    alignItems: "center",
    ...Platform.select({
      web: { boxShadow: "0 8px 20px rgba(0,0,0,0.25)" } as any,
      default: { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
    }),
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 20, fontFamily: "Inter_700Bold",
    textAlign: "center", marginBottom: 10,
  },
  body: {
    fontSize: 14, fontFamily: "Inter_400Regular",
    textAlign: "center", lineHeight: 22, marginBottom: 24,
  },
  primaryBtn: {
    width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 15, borderRadius: 14, marginBottom: 10,
  },
  primaryTxt: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  skipBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  skipTxt: { fontSize: 14, fontFamily: "Inter_400Regular" },
  versionNote: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 8 },
});
