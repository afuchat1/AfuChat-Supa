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
import { BlurView } from "expo-blur";
import { safeRouter } from "@/lib/navUtils";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/constants/theme";
import { GLASS, glassTokens } from "@/constants/glass";
import { useLanguage } from "@/context/LanguageContext";

export interface GlassHeaderProps {
  title: string;
  onBack?: () => void;
  showBack?: boolean;
  right?: React.ReactNode;
  style?: ViewStyle;
  extraBottom?: number;
  subtitle?: string;
  largeTitle?: boolean;
  sideWidth?: number;
  glassBackButton?: boolean;
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
  sideWidth = 52,
  glassBackButton = false,
}: GlassHeaderProps) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const glass = glassTokens(isDark);

  function handleBack() {
    if (onBack) { onBack(); return; }
    safeRouter.back();
  }

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
        },
        style,
      ]}
    >
      <View style={[styles.inner, { paddingBottom: T.space.sm + 2 + extraBottom }]}>

        {/* Left — back button */}
        <View style={[styles.side, { width: sideWidth }]}>
          {showBack && (
            <View
              style={[
                styles.backBtnClip,
                glassBackButton && styles.glassBackBtnClip,
                glassBackButton && {
                  borderColor: glass.border,
                  ...glass.shadowSoft,
                },
              ]}
            >
              {glassBackButton && (
                <>
                  <BlurView
                    intensity={Platform.OS === "web" ? GLASS.blur.medium : GLASS.blur.heavy}
                    tint={isDark ? "dark" : "light"}
                    style={StyleSheet.absoluteFill}
                  />
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      { backgroundColor: glass.fillSubtle },
                    ]}
                  />
                </>
              )}
              <Pressable
                android_ripple={backRipple}
                style={styles.backBtn}
                onPress={handleBack}
                hitSlop={{ top: 8, left: 8, right: 12, bottom: 8 }}
                accessibilityRole="button"
                 accessibilityLabel={t("Go back")}
              >
                <Ionicons
                   name="arrow-back"
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
              {t(title)}
            </Text>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {t(title)}
              </Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
                  {t(subtitle)}
                </Text>
              ) : null}
            </>
          )}
        </View>

        {/* Right slot — keeps title centered */}
        <View style={[styles.side, styles.sideRight, { width: sideWidth }]}>
          {right ?? null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: T.space.xs,
    paddingTop: T.space.sm - 2,
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
  backBtnClip: {
    borderRadius: T.radius.pill,
    overflow: "hidden",
  },
  glassBackBtnClip: {
    borderWidth: 1,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...T.title,
  },
  subtitle: {
    ...T.label,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0,
    marginTop: 1,
  },
  largeTitle: {
    ...T.h1,
    alignSelf: "flex-start",
  },
});
