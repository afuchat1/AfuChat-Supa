import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
  TextStyle,
  StyleProp,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

/* ─────────────────────────────────────────────────────────────────────────────
 *  useDesktopTheme — derives a real visual hierarchy on top of the existing
 *  app theme (which collapses surface/border/background to the same color).
 *  Everything here is web-only chrome; mobile keeps its native look.
 * ──────────────────────────────────────────────────────────────────────────── */

export type DesktopTheme = ReturnType<typeof useDesktopTheme>;

export function useDesktopTheme() {
  const { colors, accent, isDark } = useTheme();

  return useMemo(() => {
    const text = colors.text as string;
    const muted = colors.textMuted as string;
    const sub = (colors as any).textSecondary as string;

    if (isDark) {
      return {
        accent,
        text,
        textSub: sub,
        textMuted: muted,
        appBg: "#0B0E12",
        sidebarBg: "#0E1217",
        contentBg: "#0B0E12",
        panelBg: "#13181F",
        panelBgRaised: "#171D26",
        panelHeaderBg: "#10151B",
        rowHover: "rgba(255,255,255,0.04)",
        rowActive: accent + "20",
        rowActiveText: accent,
        border: "rgba(255,255,255,0.08)",
        borderStrong: "rgba(255,255,255,0.14)",
        inputBg: "#1A2029",
        inputBorder: "rgba(255,255,255,0.08)",
        inputBorderFocus: accent,
        chipBg: "rgba(255,255,255,0.06)",
        chipBgActive: accent + "1F",
        chipText: muted,
        chipTextActive: accent,
        ghostHover: "rgba(255,255,255,0.06)",
        modalBackdrop: "rgba(2,5,10,0.62)",
        success: "#22C55E",
        danger: "#FF4D4F",
        warning: "#F59E0B",
        gold: "#D4A853",
        scrim: "rgba(0,0,0,0.4)",
        isDark: true,
      } as const;
    }

    return {
      accent,
      text,
      textSub: sub,
      textMuted: muted,
      appBg: "#F5F2EC",
      sidebarBg: "#FAF7F1",
      contentBg: "#F5F2EC",
      panelBg: "#FFFFFF",
      panelBgRaised: "#FFFFFF",
      panelHeaderBg: "#FBF8F3",
      rowHover: "rgba(15,20,30,0.05)",
      rowActive: accent + "16",
      rowActiveText: accent,
      border: "rgba(15,20,30,0.10)",
      borderStrong: "rgba(15,20,30,0.16)",
      inputBg: "#F0EBE3",
      inputBorder: "rgba(15,20,30,0.10)",
      inputBorderFocus: accent,
      chipBg: "rgba(15,20,30,0.06)",
      chipBgActive: accent + "1A",
      chipText: muted,
      chipTextActive: accent,
      ghostHover: "rgba(15,20,30,0.06)",
      modalBackdrop: "rgba(15,20,30,0.42)",
      success: "#16A34A",
      danger: "#FF3B30",
      warning: "#F59E0B",
      gold: "#D4A853",
      scrim: "rgba(0,0,0,0.25)",
      isDark: false,
    } as const;
  }, [colors, accent, isDark]);
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Hover-able pressable — works on web, no-op on mobile
 * ──────────────────────────────────────────────────────────────────────────── */

export function useHover(): [boolean, any] {
  const [hovered, setHovered] = useState(false);
  if (Platform.OS !== "web") return [false, {}];
  return [
    hovered,
    {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
  ];
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Panel — the standard surface for desktop content
 * ──────────────────────────────────────────────────────────────────────────── */

export function DesktopPanel({
  style,
  children,
  raised = false,
  noBorder = false,
  flex,
}: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  raised?: boolean;
  noBorder?: boolean;
  flex?: number;
}) {
  const t = useDesktopTheme();
  return (
    <View
      style={[
        {
          backgroundColor: raised ? t.panelBgRaised : t.panelBg,
          borderRadius: 12,
          borderWidth: noBorder ? 0 : StyleSheet.hairlineWidth,
          borderColor: t.border,
          overflow: "hidden",
          ...(flex !== undefined ? { flex } : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  SectionShell — the wrapper every desktop section renders inside.
 *  Provides outer padding and consistent app background.
 * ──────────────────────────────────────────────────────────────────────────── */

export function DesktopSectionShell({
  children,
  padded = true,
  scroll = false,
  style,
}: {
  children: React.ReactNode;
  padded?: boolean;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useDesktopTheme();
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: t.contentBg,
          padding: padded ? 18 : 0,
          ...(scroll ? ({ overflow: "auto" } as any) : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  PageHeader — title row used at the top of a section panel
 * ──────────────────────────────────────────────────────────────────────────── */

export function DesktopPageHeader({
  title,
  subtitle,
  icon,
  right,
  compact = false,
  border = true,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  right?: React.ReactNode;
  compact?: boolean;
  border?: boolean;
}) {
  const t = useDesktopTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: compact ? 16 : 22,
        paddingVertical: compact ? 12 : 16,
        backgroundColor: t.panelHeaderBg,
        borderBottomWidth: border ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: t.border,
      }}
    >
      {icon && (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: t.accent + "1A",
          }}
        >
          <Ionicons name={icon} size={16} color={t.accent} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: "Inter_700Bold",
            fontSize: compact ? 15 : 17,
            color: t.text,
            letterSpacing: -0.2,
          }}
        >
          {title}
        </Text>
        {subtitle != null && (
          <Text
            numberOfLines={1}
            style={{
              marginTop: 2,
              fontFamily: "Inter_400Regular",
              fontSize: 12.5,
              color: t.textMuted,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {right ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{right}</View> : null}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Toolbar — secondary horizontal bar for filters/segments
 * ──────────────────────────────────────────────────────────────────────────── */

export function DesktopToolbar({
  children,
  border = true,
  style,
}: {
  children: React.ReactNode;
  border?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useDesktopTheme();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: t.panelBg,
          borderBottomWidth: border ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: t.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  SegmentedControl — pill-style tab selector
 * ──────────────────────────────────────────────────────────────────────────── */

export function DesktopSegmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string; icon?: React.ComponentProps<typeof Ionicons>["name"]; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const t = useDesktopTheme();
  const h = size === "sm" ? 28 : 32;
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: t.chipBg,
        padding: 3,
        borderRadius: 9,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            activeOpacity={0.85}
            onPress={() => onChange(opt.value)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 12,
              height: h,
              borderRadius: 7,
              backgroundColor: active ? (t.isDark ? "#222B36" : "#FFFFFF") : "transparent",
              ...(active && Platform.OS === "web"
                ? ({ boxShadow: "0 1px 2px rgba(0,0,0,0.10)" } as any)
                : {}),
            }}
          >
            {opt.icon && <Ionicons name={opt.icon} size={13} color={active ? t.text : t.textMuted} />}
            <Text
              style={{
                fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
                fontSize: 12.5,
                color: active ? t.text : t.textMuted,
              }}
            >
              {opt.label}
            </Text>
            {opt.badge ? (
              <View
                style={{
                  marginLeft: 2,
                  minWidth: 16,
                  height: 16,
                  paddingHorizontal: 4,
                  borderRadius: 8,
                  backgroundColor: active ? t.accent : t.textMuted,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 9.5, fontFamily: "Inter_700Bold" }}>
                  {opt.badge > 99 ? "99+" : opt.badge}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Buttons
 * ──────────────────────────────────────────────────────────────────────────── */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg";

export function DesktopButton({
  label,
  onPress,
  icon,
  iconRight,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  style,
  fullWidth,
}: {
  label?: React.ReactNode;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  iconRight?: React.ComponentProps<typeof Ionicons>["name"];
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}) {
  const t = useDesktopTheme();
  const [hovered, hp] = useHover();

  const h = size === "sm" ? 30 : size === "lg" ? 40 : 34;
  const fz = size === "sm" ? 12.5 : size === "lg" ? 14.5 : 13.5;
  const px = size === "sm" ? 12 : size === "lg" ? 18 : 14;

  let bg = "transparent";
  let fg = t.text;
  let border = "transparent";

  if (variant === "primary") {
    bg = hovered ? shadeColor(t.accent, t.isDark ? 8 : -4) : t.accent;
    fg = "#fff";
  } else if (variant === "secondary") {
    bg = hovered ? t.ghostHover : t.chipBg;
    fg = t.text;
    border = t.border;
  } else if (variant === "ghost") {
    bg = hovered ? t.ghostHover : "transparent";
    fg = t.text;
  } else if (variant === "danger") {
    bg = hovered ? "#E8403F" : t.danger;
    fg = "#fff";
  }

  const isDisabled = !!disabled || !!loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      disabled={isDisabled}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          height: h,
          paddingHorizontal: px,
          borderRadius: 9,
          backgroundColor: bg,
          borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth : 0,
          borderColor: border,
          opacity: isDisabled ? 0.5 : 1,
          ...(fullWidth ? { alignSelf: "stretch" } : {}),
        },
        style,
      ]}
      {...(hp as any)}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === "sm" ? 14 : 15} color={fg} />}
          {label != null && (
            <Text style={{ color: fg, fontFamily: "Inter_600SemiBold", fontSize: fz }}>{label}</Text>
          )}
          {iconRight && <Ionicons name={iconRight} size={size === "sm" ? 14 : 15} color={fg} />}
        </>
      )}
    </TouchableOpacity>
  );
}

export function DesktopIconButton({
  icon,
  onPress,
  size = 32,
  variant = "ghost",
  badge,
  tooltip,
  color,
  style,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress?: () => void;
  size?: number;
  variant?: "ghost" | "filled";
  badge?: number;
  tooltip?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useDesktopTheme();
  const [hovered, hp] = useHover();

  const bg =
    variant === "filled"
      ? hovered
        ? t.chipBg
        : t.chipBg
      : hovered
        ? t.ghostHover
        : "transparent";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        {
          width: size,
          height: size,
          borderRadius: Math.round(size / 3),
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
        },
        style,
      ]}
      {...(hp as any)}
      {...(Platform.OS === "web" && tooltip ? ({ title: tooltip } as any) : {})}
    >
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={color ?? t.text} />
      {!!badge && badge > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            borderRadius: 8,
            backgroundColor: t.danger,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 9.5, fontFamily: "Inter_700Bold" }}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Search input
 * ──────────────────────────────────────────────────────────────────────────── */

export function DesktopSearchInput({
  value,
  onChangeText,
  placeholder = "Search",
  onSubmit,
  autoFocus,
  size = "md",
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  size?: "sm" | "md" | "lg";
  style?: StyleProp<ViewStyle>;
}) {
  const t = useDesktopTheme();
  const [focused, setFocused] = useState(false);
  const h = size === "sm" ? 32 : size === "lg" ? 42 : 36;
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          height: h,
          paddingHorizontal: 12,
          backgroundColor: t.inputBg,
          borderRadius: 9,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: focused ? t.inputBorderFocus : t.inputBorder,
        },
        style,
      ]}
    >
      <Ionicons name="search" size={15} color={t.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
        style={{
          flex: 1,
          color: t.text,
          fontFamily: "Inter_500Medium",
          fontSize: 13.5,
          ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
          paddingVertical: 0,
        }}
      />
      {!!value && (
        <TouchableOpacity onPress={() => onChangeText("")} hitSlop={8}>
          <Ionicons name="close-circle" size={15} color={t.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Empty / loading / divider
 * ──────────────────────────────────────────────────────────────────────────── */

export function DesktopEmptyState({
  icon = "telescope-outline",
  title,
  subtitle,
  action,
}: {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void; icon?: React.ComponentProps<typeof Ionicons>["name"] };
}) {
  const t = useDesktopTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 36 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.accent + "14",
          marginBottom: 16,
        }}
      >
        <Ionicons name={icon} size={28} color={t.accent} />
      </View>
      <Text
        style={{
          fontFamily: "Inter_700Bold",
          fontSize: 17,
          color: t.text,
          textAlign: "center",
          letterSpacing: -0.2,
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            marginTop: 6,
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            color: t.textMuted,
            textAlign: "center",
            maxWidth: 360,
            lineHeight: 19,
          }}
        >
          {subtitle}
        </Text>
      )}
      {action && (
        <View style={{ marginTop: 18 }}>
          <DesktopButton label={action.label} onPress={action.onPress} icon={action.icon} />
        </View>
      )}
    </View>
  );
}

export function DesktopLoadingState({ label }: { label?: string }) {
  const t = useDesktopTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 36 }}>
      <ActivityIndicator color={t.accent} />
      {label && (
        <Text style={{ marginTop: 12, color: t.textMuted, fontFamily: "Inter_500Medium", fontSize: 13 }}>
          {label}
        </Text>
      )}
    </View>
  );
}

export function DesktopDivider({ vertical = false, style }: { vertical?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useDesktopTheme();
  return (
    <View
      style={[
        vertical
          ? { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: t.border }
          : { height: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: t.border },
        style,
      ]}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Chip / Badge
 * ──────────────────────────────────────────────────────────────────────────── */

export function DesktopChip({
  label,
  active,
  onPress,
  icon,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  color?: string;
}) {
  const t = useDesktopTheme();
  const tint = color ?? t.accent;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      disabled={!onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 28,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: active ? tint + "1F" : t.chipBg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? tint + "55" : "transparent",
      }}
    >
      {icon && <Ionicons name={icon} size={13} color={active ? tint : t.textMuted} />}
      <Text
        style={{
          color: active ? tint : t.textMuted,
          fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function DesktopBadge({
  label,
  tone = "neutral",
  size = "md",
}: {
  label: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "danger" | "warning" | "gold";
  size?: "sm" | "md";
}) {
  const t = useDesktopTheme();
  const map = {
    neutral: { bg: t.chipBg, fg: t.textMuted },
    accent: { bg: t.accent + "1A", fg: t.accent },
    success: { bg: t.success + "1F", fg: t.success },
    danger: { bg: t.danger + "1F", fg: t.danger },
    warning: { bg: t.warning + "1F", fg: t.warning },
    gold: { bg: t.gold + "20", fg: t.gold },
  } as const;
  const c = map[tone];
  return (
    <View
      style={{
        backgroundColor: c.bg,
        paddingHorizontal: size === "sm" ? 6 : 8,
        paddingVertical: size === "sm" ? 2 : 3,
        borderRadius: 6,
      }}
    >
      <Text
        style={{
          color: c.fg,
          fontFamily: "Inter_700Bold",
          fontSize: size === "sm" ? 9.5 : 10.5,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Stat card
 * ──────────────────────────────────────────────────────────────────────────── */

export function DesktopStatCard({
  label,
  value,
  icon,
  trend,
  color,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  trend?: { positive?: boolean; label: string };
  color?: string;
}) {
  const t = useDesktopTheme();
  const tint = color ?? t.accent;
  return (
    <DesktopPanel style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {icon && (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: tint + "1A",
            }}
          >
            <Ionicons name={icon} size={16} color={tint} />
          </View>
        )}
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 12,
            color: t.textMuted,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            flex: 1,
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          marginTop: 10,
          fontFamily: "Inter_700Bold",
          fontSize: 24,
          color: t.text,
          letterSpacing: -0.6,
        }}
      >
        {value}
      </Text>
      {trend && (
        <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons
            name={trend.positive ? "trending-up" : "trending-down"}
            size={13}
            color={trend.positive ? t.success : t.danger}
          />
          <Text
            style={{
              color: trend.positive ? t.success : t.danger,
              fontFamily: "Inter_600SemiBold",
              fontSize: 12,
            }}
          >
            {trend.label}
          </Text>
        </View>
      )}
    </DesktopPanel>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Modal sheet — pro centered modal with optional header & footer
 * ──────────────────────────────────────────────────────────────────────────── */

export type DesktopSheetSize = "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<DesktopSheetSize, { w: number; h: string | number }> = {
  sm: { w: 420, h: "auto" as any },
  md: { w: 560, h: "auto" as any },
  lg: { w: 720, h: "82%" },
  xl: { w: 960, h: "88%" },
};

export function DesktopSheet({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  size = "md",
  headerRight,
  footer,
  children,
  scrollable = true,
  contentStyle,
}: {
  visible: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  size?: DesktopSheetSize;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const t = useDesktopTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const translate = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.spring(scale, { toValue: 1, tension: 180, friction: 18, useNativeDriver: true }),
        Animated.spring(translate, { toValue: 0, tension: 180, friction: 18, useNativeDriver: true }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.96);
      translate.setValue(8);
    }
  }, [visible]);

  // ESC closes on web
  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  const dim = SIZE_MAP[size];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: t.modalBackdrop,
            opacity,
            ...(Platform.OS === "web" ? ({ backdropFilter: "blur(8px)" } as any) : {}),
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }} pointerEvents="box-none">
          <Animated.View
            style={{
              width: "100%",
              maxWidth: dim.w,
              maxHeight: "92%",
              ...(typeof dim.h === "number" ? { height: dim.h } : dim.h !== "auto" ? { height: dim.h } : {}),
              backgroundColor: t.panelBg,
              borderRadius: 16,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: t.borderStrong,
              overflow: "hidden",
              opacity,
              transform: [{ scale }, { translateY: translate }],
              ...(Platform.OS === "web"
                ? ({ boxShadow: "0 30px 80px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.10)" } as any)
                : {}),
            }}
          >
            {(title != null || icon || headerRight != null) && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 18,
                  paddingVertical: 14,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: t.border,
                  backgroundColor: t.panelHeaderBg,
                }}
              >
                {icon && (
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: t.accent + "1A",
                    }}
                  >
                    <Ionicons name={icon} size={16} color={t.accent} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  {title != null && (
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 15,
                        color: t.text,
                        letterSpacing: -0.2,
                      }}
                    >
                      {title}
                    </Text>
                  )}
                  {subtitle != null && (
                    <Text
                      numberOfLines={1}
                      style={{
                        marginTop: 2,
                        fontFamily: "Inter_400Regular",
                        fontSize: 12.5,
                        color: t.textMuted,
                      }}
                    >
                      {subtitle}
                    </Text>
                  )}
                </View>
                {headerRight}
                <DesktopIconButton icon="close" onPress={onClose} size={30} />
              </View>
            )}

            <View
              style={[
                {
                  flexGrow: 1,
                  flexShrink: 1,
                  ...(scrollable && Platform.OS === "web" ? ({ overflow: "auto" } as any) : {}),
                },
                contentStyle,
              ]}
            >
              {children}
            </View>

            {footer && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: t.border,
                  backgroundColor: t.panelHeaderBg,
                }}
              >
                {footer}
              </View>
            )}
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Confirm dialog (small modal helper)
 * ──────────────────────────────────────────────────────────────────────────── */

export function DesktopConfirm({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <DesktopSheet
      visible={visible}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <DesktopButton label={cancelLabel} variant="ghost" onPress={onCancel} />
          <DesktopButton
            label={confirmLabel}
            variant={destructive ? "danger" : "primary"}
            onPress={onConfirm}
          />
        </>
      }
    >
      {message ? (
        <Text style={{ padding: 18, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 }}>
          {message}
        </Text>
      ) : null}
    </DesktopSheet>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Small util — color shade for hover states
 * ──────────────────────────────────────────────────────────────────────────── */

function shadeColor(hex: string, percent: number): string {
  const m = hex.replace("#", "");
  const num = parseInt(m, 16);
  let r = (num >> 16) + Math.round((255 * percent) / 100);
  let g = ((num >> 8) & 0xff) + Math.round((255 * percent) / 100);
  let b = (num & 0xff) + Math.round((255 * percent) / 100);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Inline text styles helpers
 * ──────────────────────────────────────────────────────────────────────────── */

export function dText(t: DesktopTheme, kind: "h1" | "h2" | "h3" | "body" | "muted" | "label" = "body"): TextStyle {
  switch (kind) {
    case "h1":
      return { fontFamily: "Inter_700Bold", fontSize: 22, color: t.text, letterSpacing: -0.4 };
    case "h2":
      return { fontFamily: "Inter_700Bold", fontSize: 17, color: t.text, letterSpacing: -0.2 };
    case "h3":
      return { fontFamily: "Inter_600SemiBold", fontSize: 14, color: t.text };
    case "muted":
      return { fontFamily: "Inter_400Regular", fontSize: 13, color: t.textMuted };
    case "label":
      return {
        fontFamily: "Inter_600SemiBold",
        fontSize: 11,
        color: t.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
      };
    default:
      return { fontFamily: "Inter_400Regular", fontSize: 13.5, color: t.text };
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  Hook to know if we're rendering inside the desktop shell
 * ──────────────────────────────────────────────────────────────────────────── */

export function useIsDesktopShell() {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= 960;
}
