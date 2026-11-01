import React from "react";
import {
  Platform,
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
import { GLASS, glassTokens } from "@/constants/glass";
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
  iconSize = 23,
  size = 44,
  color,
  style,
}: Props) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const glass = glassTokens(isDark);
  const translatedLabel = label ? t(label) : undefined;
  const translatedAccessibilityLabel = t(accessibilityLabel ?? label ?? "Go back");
  const faceFill =
    color?.toLowerCase() === "#fff" && !isDark
      ? "rgba(16,16,20,0.78)"
      : glass.fillStrong;

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
          borderColor: glass.border,
          ...glass.shadowSoft,
        },
      ]}
    >
      <View style={[styles.clip, { borderRadius: size / 2 }]}>
        <BlurView
          intensity={Platform.OS === "web" ? GLASS.blur.medium : GLASS.blur.heavy}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: faceFill }]}
        />
        <Pressable
          onPress={onPress}
          style={styles.button}
          hitSlop={6}
          disabled={!onPress}
          android_ripple={{
            color: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)",
            borderless: false,
          }}
          accessibilityRole="button"
          accessibilityLabel={translatedAccessibilityLabel}
        >
          <Ionicons name={icon} size={iconSize} color={color ?? colors.accent} />
          {translatedLabel ? (
            <Text style={[styles.label, { color: color ?? colors.accent }]}>
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
  label: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: "Inter_600SemiBold",
  },
});
