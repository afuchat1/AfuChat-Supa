import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { safeRouter } from "@/lib/navUtils";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/constants/theme";
import { useLanguage } from "@/context/LanguageContext";
import { GlassBackButton } from "@/components/ui/GlassBackButton";

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
}: GlassHeaderProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  function handleBack() {
    if (onBack) { onBack(); return; }
    safeRouter.back();
  }

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
      <View style={[styles.inner, { paddingBottom: T.space.sm + 2 + extraBottom }]}>

        {/* Left — back button */}
        <View style={[styles.side, { width: sideWidth }]}>
          {showBack && (
            <GlassBackButton
              onPress={handleBack}
              accessibilityLabel="Go back"
              style={styles.floatingBack}
            />
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
    borderBottomWidth: T.border.hairline,
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
  floatingBack: { marginLeft: 2 },
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
