import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useTheme";
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
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

// ─── GlassMenuSeparator ───────────────────────────────────────────────────────
export function GlassMenuSeparator({ indent = 54 }: { indent?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: indent }}
      pointerEvents="none"
    />
  );
}

// ─── GlassMenuItem ────────────────────────────────────────────────────────────
export interface GlassMenuItemProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string | [string, string];
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
  iconBg,
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

  const iconBgColors: [string, string] = Array.isArray(iconBg)
    ? iconBg
    : [iconBg, adjustLightness(iconBg, isDark ? -0.1 : 0.12)];

  return (
    <TouchableOpacity
      style={[styles.row, disabled && { opacity: 0.45 }]}
      onPress={() => {
        if (disabled || loading) return;
        Haptics.selectionAsync();
        onPress?.();
      }}
      activeOpacity={0.65}
      disabled={disabled || loading}
    >
      <View style={styles.iconWrap}>
        <LinearGradient
          colors={iconBgColors}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.iconBg}
        >
          <Ionicons name={icon} size={18} color="#fff" />
        </LinearGradient>
      </View>

      <View style={styles.labelWrap}>
        <Text
          style={[styles.label, { color: danger ? "#FF3B30" : colors.text }]}
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
                <View style={[styles.badge, { backgroundColor: badgeColor ?? colors.accent + "22" }]}>
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
    </TouchableOpacity>
  );
});

function adjustLightness(hex: string, delta: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + Math.round(delta * 80)));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + Math.round(delta * 80)));
  const b = Math.min(255, Math.max(0, (n & 0xff) + Math.round(delta * 80)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  sectionWrap: { gap: 8 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginLeft: 4,
  },
  sectionCard: { borderRadius: 16, overflow: "hidden" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 13,
  },
  iconWrap: {},
  iconBg: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  labelWrap: { flex: 1, gap: 1 },
  label: { fontSize: 16, fontFamily: "Inter_400Regular" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  right: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  value: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
