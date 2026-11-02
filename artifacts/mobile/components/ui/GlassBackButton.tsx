import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/context/LanguageContext";
import { FloatingGlassSurface } from "@/components/ui/FloatingNavSurface";

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
  iconSize = 18,
  size = 40,
  color,
  style,
}: Props) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const translatedLabel = label ? t(label) : undefined;
  const translatedAccessibilityLabel = t(accessibilityLabel ?? label ?? "Go back");
  const requestedColor = color?.trim().toLowerCase();
  const iconColor =
    requestedColor === "#fff" || requestedColor === "#ffffff" || requestedColor === "white"
      ? colors.navigationActive
      : color ?? colors.navigationActive;
  const sizeStyle = label
    ? { minWidth: size, height: size, borderRadius: size / 2 }
    : { width: size, height: size, borderRadius: size / 2 };

  return (
    <FloatingGlassSurface
      fill
      style={[style, sizeStyle, styles.surface]}
      contentStyle={styles.surfaceContent}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.button, translatedLabel && styles.labeledButton, pressed && styles.pressed]}
        hitSlop={8}
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
    </FloatingGlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: { zIndex: 120, flexShrink: 0 },
  surfaceContent: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  labeledButton: {
    gap: 6,
    paddingHorizontal: 10,
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
