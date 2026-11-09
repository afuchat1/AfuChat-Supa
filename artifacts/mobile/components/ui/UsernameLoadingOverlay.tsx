import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { subscribeUsernameLoading, type UsernameLoadingState } from "@/lib/usernameResolver";

const NATIVE_DRIVER = Platform.OS !== "web";

export function UsernameLoadingOverlay() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState<UsernameLoadingState | null>(null);
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => subscribeUsernameLoading(setLoading), []);

  useEffect(() => {
    if (!loading) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [loading, pulse]);

  if (!loading) return null;

  return (
    <View pointerEvents="none" style={styles.host}>
      <Animated.View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pulse }]}>
        <View style={[styles.icon, { backgroundColor: colors.accent + "18" }]}>
          <Ionicons name="at" size={16} color={colors.accent} />
        </View>
        <View style={styles.copy}>
          <View style={[styles.skeletonLine, { backgroundColor: colors.textMuted + "35", width: 126 }]} />
          <Text style={[styles.handle, { color: colors.textMuted }]}>@{loading.handle}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 104,
    alignItems: "center",
    zIndex: 9998,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 190,
    maxWidth: 300,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    ...Platform.select({
      web: { boxShadow: "0 5px 12px rgba(0,0,0,0.16)" } as any,
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.16,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
        elevation: 5,
      },
    }),
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    gap: 5,
  },
  skeletonLine: {
    height: 7,
    borderRadius: 4,
  },
  handle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});