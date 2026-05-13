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
  const { colors } = useTheme();

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
      <View style={[styles.iconWrap, { backgroundColor: danger ? "#FF3B3015" : colors.backgroundSecondary }]}>
        <Ionicons
          name={icon}
          size={18}
          color={danger ? "#FF3B30" : colors.icon}
        />
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
  iconWrap: {
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
