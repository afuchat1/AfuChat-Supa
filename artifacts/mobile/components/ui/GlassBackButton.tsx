import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useTheme } from "@/hooks/useTheme";
import { floatingNavigationShadow, GLASS, glassTokens } from "@/constants/glass";
import { useLanguage } from "@/context/LanguageContext";

type Props = {
  onPress?: () => void;
  accessibilityLabel?: string;
  label?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  iconSize?: number;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function GlassBackButton({
  onPress,
  accessibilityLabel,
  label,
  icon = "arrow-back",
  iconSize = 22,
  size = 52,
  color,
  style,
}: Props) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const glass = glassTokens(isDark);
  const translatedLabel = label ? t(label) : undefined;
  const translatedAccessibilityLabel = t(accessibilityLabel ?? label ?? "Go back");
  const requestedColor = color?.trim().toLowerCase();
  const iconColor =
    requestedColor === "#fff" || requestedColor === "#ffffff" || requestedColor === "white"
      ? colors.navigationActive
      : color ?? colors.navigationActive;

  return (
    <View
      style={[
        styles.shadow,
        style,
        {
          width: label ? undefined : size,
          minWidth: label ? size : undefined,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.navigationSurface,
          borderColor: colors.navigationBorder,
          zIndex: 120,
          ...floatingNavigationShadow(isDark),
        },
      ]}
    >
      <View style={[styles.clip, { borderRadius: size / 2 }]}>
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.navigationSurface }]}
        />
        {!isDark && (
          <>
            <BlurView
              intensity={GLASS.blur.light}
              tint="light"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: glass.fillStrong }]}
            />
          </>
        )}
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          hitSlop={6}
          disabled={!onPress}
          android_ripple={{
            color: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)",
            borderless: false,
          }}
          accessibilityRole="button"
          accessibilityLabel={translatedAccessibilityLabel}
        >
          <Ionicons name={icon} size={iconSize} color={iconColor} />
          {translatedLabel ? (
            <Text style={[styles.label, { color: iconColor }]}>
              {translatedLabel}
            </Text>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderWidth: 1,
    overflow: "visible",
    flexShrink: 0,
  },
  clip: {
    flex: 1,
    overflow: "hidden",
  },
  button: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  pressed: {
    opacity: 0.65,
  },
  label: {
    fontSize: 12,
    lineHeight: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0,
  },
});
