import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/constants/theme";
import * as Haptics from "@/lib/haptics";

// ─── GlassMenuSection ─────────────────────────────────────────────────────────
interface GlassMenuSectionProps {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function GlassMenuSection({ title, children, style }: GlassMenuSectionProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionWrap, style]}>
      {title ? (
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{title}</Text>
      ) : null}
      <View style={[styles.sectionCard, { backgroundColor: colors.backgroundSecondary }]}>
        {children}
      </View>
    </View>
  );
}

// ─── GlassMenuSeparator ───────────────────────────────────────────────────────
// Invisible spacer — kept for backward compat but renders nothing in flat UI
export function GlassMenuSeparator({ indent = 54 }: { indent?: number }) {
  return null;
}

// ─── GlassMenuItem ────────────────────────────────────────────────────────────
export interface GlassMenuItemProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg?: string | [string, string];
  label: string;
  value?: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  onPress?: () => void;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  noChevron?: boolean;
  rightElement?: React.ReactNode;
}

export const GlassMenuItem = React.memo(function GlassMenuItem({
  icon,
  label,
  value,
  subtitle,
  badge,
  badgeColor,
  onPress,
  danger = false,
  disabled = false,
  loading = false,
  noChevron = false,
  rightElement,
}: GlassMenuItemProps) {
  const { colors, isDark } = useTheme();

  // Ripple uses colors.error (not hardcoded #FF3B30) for danger rows
  const ripple = Platform.OS === "android"
    ? {
        color: danger
          ? colors.errorSubtle
          : isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.06)",
        borderless: false,
      }
    : undefined;

  return (
    <Pressable
      android_ripple={ripple}
      style={({ pressed }) => [
        styles.row,
        disabled && { opacity: T.states.disabled },
        pressed && Platform.OS === "ios" && { opacity: T.states.pressed },
      ]}
      onPress={() => {
        if (disabled || loading) return;
        Haptics.selectionAsync();
        onPress?.();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
    >
      <View
        style={[
          styles.iconWrap,
          // danger bg uses colors.errorSubtle (token) not a hardcoded rgba
          { backgroundColor: danger ? colors.errorSubtle : colors.backgroundSecondary },
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          // danger icon uses colors.error (token) not hardcoded #FF3B30
          color={danger ? colors.error : colors.icon}
        />
      </View>

      <View style={styles.labelWrap}>
        <Text
          style={[styles.label, { color: danger ? colors.error : colors.text }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {rightElement ?? (
        <View style={styles.right}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <>
              {badge ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: badgeColor ? badgeColor + "22" : colors.accent + "22" },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: badgeColor ?? colors.accent }]}>
                    {badge}
                  </Text>
                </View>
              ) : null}
              {value ? (
                <Text style={[styles.value, { color: colors.textMuted }]} numberOfLines={1}>
                  {value}
                </Text>
              ) : null}
              {!noChevron && !danger && (
                <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
              )}
            </>
          )}
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  sectionWrap: { gap: 0 },
  sectionLabel: {
    ...T.label,
    marginLeft: T.space.xl,
    marginBottom: T.space.sm - 2,
    marginTop: T.space.xxl - 2,
  },
  sectionCard: { overflow: "hidden" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: T.space.lg - 2,
    paddingVertical: T.space.md + 1,
    gap: T.space.md + 1,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: T.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  labelWrap: { flex: 1, gap: 1 },
  label: {
    ...T.body,
    fontSize: 16,
  },
  subtitle: {
    ...T.caption,
    fontSize: 12,
  },
  right: { flexDirection: "row", alignItems: "center", gap: T.space.sm - 2 },
  badge: {
    paddingHorizontal: T.space.sm,
    paddingVertical: T.space.xs - 2,
    borderRadius: T.radius.xs,
  },
  badgeText: {
    ...T.micro,
    fontFamily: "Inter_700Bold",
  },
  value: {
    ...T.caption,
    fontSize: 14,
  },
});
