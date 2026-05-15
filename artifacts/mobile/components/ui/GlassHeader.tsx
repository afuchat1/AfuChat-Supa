import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

export interface GlassHeaderProps {
  title: string;
  onBack?: () => void;
  showBack?: boolean;
  right?: React.ReactNode;
  style?: ViewStyle;
  extraBottom?: number;
  subtitle?: string;
  largeTitle?: boolean;
}

export function GlassHeader({
  title,
  onBack,
  showBack = true,
  right,
  style,
  extraBottom = 0,
  subtitle,
  largeTitle = false,
}: GlassHeaderProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  function handleBack() {
    if (onBack) { onBack(); return; }
    if (router.canGoBack()) router.back();
  }

  // Circular ripple for the back button on Android.
  const backRipple = Platform.OS === "android"
    ? {
        color: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
        borderless: true,
        radius: 22,
      }
    : undefined;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
        style,
      ]}
    >
      <View style={[styles.inner, { paddingBottom: 10 + extraBottom }]}>

        {/* Left — back button */}
        <View style={styles.side}>
          {showBack && (
            // Clip container ensures circular ripple is bounded on Android.
            <View style={styles.backBtnClip}>
              <Pressable
                android_ripple={backRipple}
                style={({ pressed }) => [
                  styles.backBtn,
                  Platform.OS === "ios" && pressed ? { opacity: 0.6 } : null,
                ]}
                onPress={handleBack}
                hitSlop={{ top: 8, left: 8, right: 12, bottom: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons
                  name={Platform.OS === "android" ? "arrow-back" : "chevron-back"}
                  size={26}
                  color={colors.accent}
                />
              </Pressable>
            </View>
          )}
        </View>

        {/* Center — title (+ optional subtitle) */}
        <View style={styles.center}>
          {largeTitle ? (
            <Text style={[styles.largeTitle, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </>
          )}
        </View>

        {/* Right slot — keeps title centered */}
        <View style={[styles.side, styles.sideRight]}>
          {right ?? null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingTop: 6,
  },
  side: {
    width: 52,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  center: {
    flex: 1,
    alignItems: "center",
    gap: 1,
  },
  // Clips the circular ripple on Android to the button boundary.
  backBtnClip: {
    borderRadius: 22,
    overflow: "hidden",
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  largeTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    alignSelf: "flex-start",
  },
});
