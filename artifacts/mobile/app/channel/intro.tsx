import React from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const _SW = Dimensions.get("window").width;
const ILLUS_W = Math.round(_SW * 0.56);
const ILLUS_H = Math.round(ILLUS_W * 1.23);
const PHONE_W = Math.round(_SW * 0.43);
const PHONE_H = Math.round(PHONE_W * 1.47);
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import Colors from "@/constants/colors";
import { useTheme } from "@/hooks/useTheme";

function PhoneIllustration() {
  const { colors } = useTheme();
  return (
    <View style={styles.illustrationWrap}>
      {/* Phone mockup */}
      <View style={styles.phoneMockup}>
        <View style={styles.phoneScreen}>
          {/* Chat header */}
          <View style={styles.phoneChatHeader}>
            <View style={styles.phoneAvatar} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={[styles.phoneLine, { width: "70%" }]} />
              <View style={[styles.phoneLine, { width: "45%", opacity: 0.6 }]} />
            </View>
            <View style={styles.phonePlayBtn}>
              <Ionicons name="play" size={9} color="#fff" />
            </View>
          </View>
          {/* Message bubbles */}
          <View style={styles.phoneBubble} />
          <View style={[styles.phoneBubble, { width: "80%" }]} />
          {/* Duck emoji */}
          <View style={styles.phoneDuckRow}>
            <Text style={styles.phoneDuckEmoji}>🐥</Text>
          </View>
        </View>
      </View>

      {/* Channel badge (top-left overlap) */}
      <View style={styles.channelBadge}>
        <Text style={styles.badgeTitle}>Channel</Text>
        <Text style={styles.badgeSub}>57k members</Text>
      </View>

      {/* Views badge (bottom-right overlap) */}
      <View style={[styles.viewsBadge, { backgroundColor: colors.surface }]}>
        <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
        <Text style={[styles.viewsBadgeText, { color: colors.text }]}>1K</Text>
      </View>
    </View>
  );
}

export default function ChannelIntroScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 12 }]}
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-back" size={24} color={colors.accent} />
      </TouchableOpacity>

      <View style={styles.heroSection}>
        <PhoneIllustration />
      </View>

      <View style={styles.textSection}>
        <Text style={[styles.title, { color: colors.text }]}>What is a Channel?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Channels are a one-to-many tool for broadcasting your messages to unlimited audiences.
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: colors.accent }]}
          onPress={() => router.push("/channel/create" as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.createBtnText}>Create Channel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backBtn: { position: "absolute", left: 16, zIndex: 10 },

  heroSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  illustrationWrap: {
    width: ILLUS_W,
    height: ILLUS_H,
    position: "relative",
    alignItems: "center",
  },

  phoneMockup: {
    width: PHONE_W,
    height: PHONE_H,
    backgroundColor: "#1a2940",
    borderRadius: 24,
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    alignSelf: "flex-end",
  },
  phoneScreen: {
    flex: 1,
    backgroundColor: "#c5daf0",
    margin: 8,
    borderRadius: 10,
    overflow: "hidden",
    padding: 8,
  },
  phoneChatHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#a8c8e8",
    borderRadius: 8,
    padding: 7,
    marginBottom: 8,
    gap: 6,
  },
  phoneAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#7aadd0",
  },
  phoneLine: {
    height: 5,
    backgroundColor: "#d8ecfb",
    borderRadius: 3,
    width: "100%",
  },
  phonePlayBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#5b8fb9",
    alignItems: "center",
    justifyContent: "center",
  },
  phoneBubble: {
    height: 20,
    width: "60%",
    backgroundColor: "#e8f2fb",
    borderRadius: 10,
    marginBottom: 6,
  },
  phoneDuckRow: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 6,
  },
  phoneDuckEmoji: { fontSize: 56 },

  channelBadge: {
    position: "absolute",
    left: 0,
    top: 55,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#4a7fb5",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    gap: 2,
  },
  badgeTitle: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  badgeSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 4,
  },

  viewsBadge: {
    position: "absolute",
    right: 0,
    bottom: 55,
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 3,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  viewsBadgeText: { fontSize: 14, fontFamily: "Inter_700Bold" },

  textSection: {
    paddingHorizontal: 32,
    paddingBottom: 32,
    alignItems: "center",
    gap: 12,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },

  footer: { paddingHorizontal: 24 },
  createBtn: {
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
