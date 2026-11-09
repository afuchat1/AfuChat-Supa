/**
 * profile-not-found.tsx
 * Shown when a visited user profile does not exist.
 * Exported two ways:
 *  • default export  → standalone route (reads handle from route params)
 *  • ProfileNotFoundView → inline component (accepts handle as prop)
 */

import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

// ─── Shared view (used inline too) ────────────────────────────────────────────

export function ProfileNotFoundView({
  handle,
  onBack,
}: {
  handle?: string;
  onBack?: () => void;
}) {
  const { colors } = useTheme();

  function goBack() {
    if (onBack) { onBack(); return; }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/discover" as any);
    }
  }

  return (
    <View style={[styles.body, { backgroundColor: colors.background }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
        <Ionicons name="person-remove" size={46} color={colors.textMuted} />
      </View>

      <Text style={[styles.title, { color: colors.text }]}>
        This account doesn't exist
      </Text>

      <Text style={[styles.sub, { color: colors.textMuted }]}>
        {handle
          ? `@${handle} may have changed their username, or the account may have been deleted.`
          : "The user may have changed their username, or the account may have been deleted."}
      </Text>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: colors.accent }]}
        onPress={() => router.push("/user-discovery" as any)}
        activeOpacity={0.85}
      >
        <Ionicons name="search" size={16} color="#fff" />
        <Text style={styles.btnText}>Find People</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btnOutline, { borderColor: colors.border }]}
        onPress={goBack}
        activeOpacity={0.85}
      >
        <Text style={[styles.btnOutlineText, { color: colors.text }]}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Standalone page ───────────────────────────────────────────────────────────

export default function ProfileNotFoundScreen() {
  const { handle } = useLocalSearchParams<{ handle?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)/discover" as any);
            }
          }}
          hitSlop={{ top: 8, left: 8, right: 12, bottom: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.accent} />
        </TouchableOpacity>
      </View>
      <ProfileNotFoundView handle={handle} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
    paddingBottom: 80,
  },
  iconWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.4,
  },
  sub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 6,
    alignSelf: "stretch",
  },
  btnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  btnOutline: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "stretch",
  },
  btnOutlineText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
