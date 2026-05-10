import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const paddingTop = insets.top + (largeTitle ? 6 : 8);
  const paddingBottom = 12 + extraBottom;

  function handleBack() {
    if (onBack) { onBack(); return; }
    if (router.canGoBack()) router.back();
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, borderBottomColor: colors.border },
        style,
      ]}
    >
      <View
        style={[
          styles.inner,
          { paddingTop, paddingBottom },
          largeTitle && styles.innerLarge,
        ]}
      >
        <View style={styles.side}>
          {showBack && (
            <TouchableOpacity
              onPress={handleBack}
              style={styles.backBtn}
              hitSlop={{ top: 10, left: 10, right: 14, bottom: 10 }}
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-back" size={26} color={colors.accent} />
            </TouchableOpacity>
          )}
        </View>

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

        <View style={[styles.side, styles.sideRight]}>
          {right ?? <View style={styles.backBtn} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inner: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
  },
  innerLarge: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
  },
  side: {
    width: 50,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  center: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 2,
  },
  backBtn: {
    width: 40,
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
