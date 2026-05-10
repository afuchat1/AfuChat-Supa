import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from "react-native";
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
  };

  const configs: Record<FollowState, Cfg> = {
    follow: {
      label: "Follow",
      icon: "person-add-outline",
      bg: colors.accent,
      textColor: "#fff",
    },
    follow_back: {
      label: "Follow Back",
      icon: "person-add",
      bg: "#FF9500",
      textColor: "#fff",
    },
    following: {
      label: "Following",
      icon: "checkmark",
      bg: "transparent",
      textColor: colors.accent,
      borderColor: colors.accent,
      borderWidth: 1.5,
    },
    friends: {
      label: "Friends",
      icon: "heart",
      bg: "transparent",
      textColor: "#34C759",
      borderColor: "#34C759",
      borderWidth: 1.5,
    },
  };

  const cfg = configs[state];

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        sm ? styles.btnSm : styles.btnMd,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.borderColor,
          borderWidth: cfg.borderWidth ?? 0,
        },
        style,
      ]}
      onPress={onToggle}
      activeOpacity={0.75}
      disabled={loading || disabled}
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
    </TouchableOpacity>
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
