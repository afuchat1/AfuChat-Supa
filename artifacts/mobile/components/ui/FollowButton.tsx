import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

export type FollowState = "follow" | "follow_back" | "following" | "friends";

export function getFollowState(iAmFollowing: boolean, theyFollowMe: boolean): FollowState {
  if (iAmFollowing && theyFollowMe) return "friends";
  if (!iAmFollowing && theyFollowMe) return "follow_back";
  if (iAmFollowing) return "following";
  return "follow";
}

interface FollowButtonProps {
  iAmFollowing: boolean;
  theyFollowMe: boolean;
  onToggle: () => void;
  loading?: boolean;
  size?: "sm" | "md";
  style?: ViewStyle;
  disabled?: boolean;
}

export function FollowButton({
  iAmFollowing,
  theyFollowMe,
  onToggle,
  loading = false,
  size = "md",
  style,
  disabled,
}: FollowButtonProps) {
  const { colors } = useTheme();
  const state = getFollowState(iAmFollowing, theyFollowMe);
  const sm = size === "sm";

  type Cfg = {
    label: string;
    icon: string;
    bg: string;
    textColor: string;
    borderColor?: string;
    borderWidth?: number;
    rippleColor: string;
  };

  const configs: Record<FollowState, Cfg> = {
    follow: {
      label: "Follow",
      icon: "person-add-outline",
      bg: colors.accent,
      textColor: "#fff",
      rippleColor: "rgba(255,255,255,0.25)",
    },
    follow_back: {
      label: "Follow Back",
      icon: "person-add",
      bg: "#FF9500",
      textColor: "#fff",
      rippleColor: "rgba(255,255,255,0.25)",
    },
    following: {
      label: "Following",
      icon: "checkmark",
      bg: "transparent",
      textColor: colors.accent,
      borderColor: colors.accent,
      borderWidth: 1.5,
      rippleColor: colors.accent + "22",
    },
    friends: {
      label: "Friends",
      icon: "heart",
      bg: "transparent",
      textColor: "#34C759",
      borderColor: "#34C759",
      borderWidth: 1.5,
      rippleColor: "rgba(52,199,89,0.15)",
    },
  };

  const cfg = configs[state];

  // overflow:"hidden" on the button style clips the Android ripple to
  // the pill shape. The borderRadius is already set on btn.
  const ripple = Platform.OS === "android"
    ? { color: cfg.rippleColor, borderless: false }
    : undefined;

  return (
    <Pressable
      android_ripple={ripple}
      style={({ pressed }) => [
        styles.btn,
        sm ? styles.btnSm : styles.btnMd,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.borderColor,
          borderWidth: cfg.borderWidth ?? 0,
          overflow: "hidden",
        },
        Platform.OS === "ios" && pressed ? { opacity: 0.72 } : null,
        style,
      ]}
      onPress={onToggle}
      disabled={loading || disabled}
      accessibilityRole="button"
      accessibilityLabel={cfg.label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={cfg.textColor} />
      ) : (
        <>
          <Ionicons name={cfg.icon as any} size={sm ? 12 : 14} color={cfg.textColor} />
          <Text
            style={[
              styles.label,
              sm ? styles.labelSm : styles.labelMd,
              { color: cfg.textColor },
            ]}
          >
            {cfg.label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 20,
  },
  btnMd: { paddingHorizontal: 16, paddingVertical: 7 },
  btnSm: { paddingHorizontal: 10, paddingVertical: 5 },
  label: { fontWeight: "600" },
  labelMd: { fontSize: 13 },
  labelSm: { fontSize: 11 },
});
