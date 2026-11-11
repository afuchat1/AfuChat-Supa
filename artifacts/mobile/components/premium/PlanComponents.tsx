import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassBackButton } from "@/components/ui/GlassBackButton";
import type { useTheme } from "@/hooks/useTheme";

/**
 * Presentational building blocks for app/premium.tsx.
 * Nothing in here touches Supabase, auth, wallet or payment logic:
 * every component is driven purely by props.
 */

export type ThemeColors = ReturnType<typeof useTheme>["colors"];
export type IconName = React.ComponentProps<typeof Ionicons>["name"];

// ── Colour helpers (work in light and dark without needing an isDark flag) ───

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function isDarkColor(hex: string): boolean {
  if (!/^#[0-9a-f]{3,8}$/i.test(hex)) return false;
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/** Lightens a brand tint on dark surfaces so deep colours (e.g. Platinum blue) stay legible. */
export function readableTint(tint: string, background: string): string {
  if (!isDarkColor(background)) return tint;
  const [r, g, b] = hexToRgb(tint);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.45);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// ── Floating navigation bar ──────────────────────────────────────────────────

export function FloatingNav({
  top,
  title,
  onBack,
  colors,
}: {
  top: number;
  title: string;
  onBack: () => void;
  colors: ThemeColors;
}) {
  return (
    <View
      style={[
        s.nav,
        { top, backgroundColor: colors.inputBg, borderColor: colors.border, shadowColor: colors.text },
      ]}
    >
      <GlassBackButton onPress={onBack} style={s.backBtn} />
      <Text style={[s.navTitle, { color: colors.text }]}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

// ── Segmented tier selector with sliding indicator ───────────────────────────

export type TierTab = {
  id: string;
  label: string;
  icon: IconName;
  color: string;
  priceLabel: string;
  isCurrent: boolean;
};

const TAB_PAD = 4;

export function TierTabs({
  tabs,
  activeId,
  onSelect,
  colors,
}: {
  tabs: TierTab[];
  activeId: string;
  onSelect: (id: string) => void;
  colors: ThemeColors;
}) {
  const [width, setWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const index = Math.max(0, tabs.findIndex((t) => t.id === activeId));
  const segWidth = width > 0 ? (width - TAB_PAD * 2) / tabs.length : 0;
  const active = tabs[index];

  useEffect(() => {
    if (segWidth <= 0) return;
    if (!placed.current) {
      translateX.setValue(index * segWidth);
      placed.current = true;
      return;
    }
    Animated.spring(translateX, {
      toValue: index * segWidth,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
    }).start();
  }, [index, segWidth, translateX]);

  return (
    <View
      style={[s.tabs, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {segWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            s.tabIndicator,
            {
              width: segWidth,
              backgroundColor: colors.background,
              borderColor: (active?.color ?? colors.accent) + "55",
              transform: [{ translateX }],
            },
          ]}
        />
      )}
      {tabs.map((tab) => {
        const selected = tab.id === activeId;
        return (
          <Pressable
            key={tab.id}
            style={s.tab}
            onPress={() => onSelect(tab.id)}
            android_ripple={{ color: tab.color + "22", borderless: false }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${tab.label} plan, ${tab.priceLabel}${tab.isCurrent ? ", current plan" : ""}`}
            testID={`premium-tier-${tab.id}`}
          >
            <View style={s.tabIconWrap}>
              <Ionicons name={tab.icon} size={20} color={selected ? tab.color : colors.textMuted} />
              {tab.isCurrent && (
                <View
                  style={[s.currentDot, { backgroundColor: tab.color, borderColor: colors.inputBg }]}
                />
              )}
            </View>
            <Text
              numberOfLines={1}
              style={[s.tabLabel, { color: selected ? colors.text : colors.textSecondary }]}
            >
              {tab.label}
            </Text>
            <Text numberOfLines={1} style={[s.tabPrice, { color: selected ? tab.color : colors.textMuted }]}>
              {tab.priceLabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Chips ────────────────────────────────────────────────────────────────────

function Chip({ icon, label, tint, colors }: { icon: IconName; label: string; tint: string; colors: ThemeColors }) {
  return (
    <View style={[s.chip, { backgroundColor: tint + "1A", borderColor: tint + "44" }]}>
      <Ionicons name={icon} size={12} color={tint} />
      <Text style={[s.chipTxt, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ── Hero price card ──────────────────────────────────────────────────────────

export function PriceHero({
  colors,
  tint,
  icon,
  badge,
  tagline,
  acoin,
  usd,
  local,
  duration,
  verified,
  isCurrent,
}: {
  colors: ThemeColors;
  tint: string;
  icon: IconName;
  badge: string;
  tagline: string;
  acoin: number;
  usd: string;
  local: string | null;
  duration: string;
  verified: boolean;
  isCurrent: boolean;
}) {
  return (
    <View style={[s.hero, { backgroundColor: colors.inputBg, borderColor: tint + "40" }]}>
      <View pointerEvents="none" style={[s.orbLarge, { backgroundColor: tint + "14" }]} />
      <View pointerEvents="none" style={[s.orbSmall, { backgroundColor: tint + "10" }]} />

      <View style={s.heroTop}>
        <View style={[s.heroIcon, { backgroundColor: tint + "22" }]}>
          <Ionicons name={icon} size={22} color={tint} />
        </View>
        <View style={s.heroTitleCol}>
          <Text style={[s.heroBadge, { color: colors.text }]}>{badge}</Text>
          <Text numberOfLines={1} style={[s.heroTagline, { color: colors.textSecondary }]}>
            {tagline}
          </Text>
        </View>
        <View style={s.chipCol}>
          {isCurrent && <Chip icon="checkmark-circle" label="Current" tint={tint} colors={colors} />}
          {verified && <Chip icon="shield-checkmark" label="Verified" tint={tint} colors={colors} />}
        </View>
      </View>

      <View style={s.heroPriceRow}>
        <Text style={[s.priceNum, { color: colors.text }]}>{acoin}</Text>
        <Text style={[s.priceUnit, { color: colors.textMuted }]}>AC</Text>
        <View style={[s.durPill, { backgroundColor: tint + "1F" }]}>
          <Text style={[s.durTxt, { color: colors.textSecondary }]}>/ {duration}</Text>
        </View>
      </View>

      <Text style={[s.equiv, { color: colors.textSecondary }]}>
        {usd} USD{local ? `  ·  ≈ ${local}` : ""}
      </Text>
    </View>
  );
}

// ── Feature list ─────────────────────────────────────────────────────────────

export type FeatureSection = { icon: string; title: string; items: string[] };

export function FeatureCard({
  colors,
  tint,
  sections,
}: {
  colors: ThemeColors;
  tint: string;
  sections: FeatureSection[];
}) {
  return (
    <View style={[s.featCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
      {sections.map((sec, si) => (
        <View
          key={sec.title + si}
          style={[s.featSec, si > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
        >
          <View style={s.featHead}>
            <View style={[s.featIcon, { backgroundColor: tint + "20" }]}>
              <Ionicons name={sec.icon as IconName} size={14} color={tint} />
            </View>
            <Text style={[s.featTitle, { color: colors.text }]}>{sec.title}</Text>
            <Text style={[s.featCount, { color: colors.textMuted }]}>{sec.items.length}</Text>
          </View>
          <View style={s.featItems}>
            {sec.items.map((item, ii) => (
              <View key={ii} style={s.featItem}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} style={s.featCheck} />
                <Text style={[s.featItemTxt, { color: colors.textSecondary }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Wallet card ──────────────────────────────────────────────────────────────

export function WalletCard({
  colors,
  balance,
  usd,
  onPress,
}: {
  colors: ThemeColors;
  balance: number;
  usd: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.accent + "22" }}
      style={({ pressed }) => [
        s.wallet,
        { backgroundColor: colors.inputBg, borderColor: colors.border },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`ACoin balance ${balance}. Top up wallet`}
      testID="premium-wallet-card"
    >
      <View style={[s.walletIcon, { backgroundColor: colors.accent + "1F" }]}>
        <Ionicons name="wallet" size={18} color={colors.accent} />
      </View>
      <View style={s.walletMid}>
        <Text style={[s.walletLbl, { color: colors.textMuted }]}>ACoin balance</Text>
        <Text style={[s.walletVal, { color: colors.text }]}>
          {balance} AC <Text style={[s.walletUsd, { color: colors.textMuted }]}>{usd}</Text>
        </Text>
      </View>
      <View style={[s.topUp, { backgroundColor: colors.accent + "1F" }]}>
        <Text style={[s.topUpTxt, { color: colors.accent }]}>Top up</Text>
        <Ionicons name="chevron-forward" size={13} color={colors.accent} />
      </View>
    </Pressable>
  );
}

// ── Active subscription banner ───────────────────────────────────────────────

export function ActiveBanner({
  colors,
  tint,
  label,
  daysLeft,
  cancelling,
  onCancel,
}: {
  colors: ThemeColors;
  tint: string;
  label: string;
  daysLeft: number;
  cancelling: boolean;
  onCancel: () => void;
}) {
  return (
    <View style={[s.banner, { backgroundColor: tint + "14", borderColor: tint + "38" }]}>
      <View style={[s.bannerIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name="shield-checkmark" size={16} color={tint} />
      </View>
      <View style={s.bannerMid}>
        <Text style={[s.bannerTitle, { color: colors.text }]}>{label} is active</Text>
        <Text style={[s.bannerSub, { color: colors.textSecondary }]}>
          {daysLeft} {daysLeft === 1 ? "day" : "days"} left
        </Text>
      </View>
      <TouchableOpacity
        onPress={onCancel}
        disabled={cancelling}
        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        style={[s.bannerCancel, { borderColor: colors.border }, cancelling && { opacity: 0.5 }]}
        accessibilityRole="button"
        accessibilityLabel="Cancel subscription"
        testID="premium-cancel"
      >
        {cancelling ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <Text style={[s.bannerCancelTxt, { color: colors.textSecondary }]}>Cancel</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Cost summary (balance → cost → after) ────────────────────────────────────

export function CostSummary({
  colors,
  balance,
  cost,
  after,
  canAfford,
}: {
  colors: ThemeColors;
  balance: number;
  cost: number;
  after: number;
  canAfford: boolean;
}) {
  return (
    <View style={[s.cost, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
      <View style={s.costCol}>
        <Text style={[s.costLbl, { color: colors.textMuted }]}>Balance</Text>
        <Text style={[s.costVal, { color: colors.text }]}>{balance}</Text>
      </View>
      <Text style={[s.costOp, { color: colors.textMuted }]}>−</Text>
      <View style={s.costCol}>
        <Text style={[s.costLbl, { color: colors.textMuted }]}>Cost</Text>
        <Text style={[s.costVal, { color: colors.warning }]}>{cost}</Text>
      </View>
      <Text style={[s.costOp, { color: colors.textMuted }]}>=</Text>
      <View style={s.costCol}>
        <Text style={[s.costLbl, { color: colors.textMuted }]}>After</Text>
        <Text
          style={[s.costVal, { color: canAfford ? colors.success : colors.error, fontFamily: "Inter_700Bold" }]}
        >
          {after}
        </Text>
      </View>
    </View>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

export function PremiumSkeleton({ colors }: { colors: ThemeColors }) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const block = (h: number, extra?: object) => (
    <Animated.View
      style={[{ height: h, borderRadius: 12, backgroundColor: colors.surface, opacity: pulse }, extra]}
    />
  );

  return (
    <View style={s.skelWrap} accessibilityLabel="Loading plan options" accessibilityRole="progressbar">
      {block(88, { borderRadius: 18 })}
      {block(176, { borderRadius: 22 })}
      {block(260, { borderRadius: 20 })}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  nav: {
    position: "absolute",
    left: 16,
    right: 16,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 18,
    zIndex: 20,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", letterSpacing: -0.3 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  tabs: {
    flexDirection: "row",
    padding: TAB_PAD,
    borderWidth: 1,
    borderRadius: 18,
  },
  tabIndicator: {
    position: "absolute",
    top: TAB_PAD,
    bottom: TAB_PAD,
    left: TAB_PAD,
    borderRadius: 14,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    minHeight: 76,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 14,
    overflow: "hidden",
  },
  tabIconWrap: { position: "relative" },
  currentDot: {
    position: "absolute",
    top: -2,
    right: -6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  tabLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.4, textAlign: "center" },
  tabPrice: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipTxt: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  chipCol: { alignItems: "flex-end", gap: 6 },

  hero: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    gap: 14,
    overflow: "hidden",
  },
  orbLarge: { position: "absolute", width: 190, height: 190, borderRadius: 95, top: -70, right: -50 },
  orbSmall: { position: "absolute", width: 110, height: 110, borderRadius: 55, bottom: -40, left: -30 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  heroTitleCol: { flex: 1, minWidth: 0, gap: 2 },
  heroBadge: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  heroTagline: { fontSize: 13, fontFamily: "Inter_400Regular" },
  heroPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  priceNum: { fontSize: 44, fontFamily: "Inter_700Bold", letterSpacing: -1.8 },
  priceUnit: { fontSize: 20, fontFamily: "Inter_500Medium" },
  durPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginLeft: 4, alignSelf: "center" },
  durTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  equiv: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: -4 },

  featCard: { borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  featSec: { padding: 18 },
  featHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  featIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  featTitle: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.1 },
  featCount: { fontSize: 12, fontFamily: "Inter_500Medium" },
  featItems: { gap: 10 },
  featItem: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  featCheck: { marginTop: 2 },
  featItemTxt: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular" },

  wallet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  walletIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  walletMid: { flex: 1, minWidth: 0, gap: 2 },
  walletLbl: { fontSize: 12, fontFamily: "Inter_500Medium" },
  walletVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  walletUsd: { fontSize: 13, fontFamily: "Inter_400Regular" },
  topUp: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  topUpTxt: { fontSize: 13, fontFamily: "Inter_700Bold" },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  bannerIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  bannerMid: { flex: 1, minWidth: 0, gap: 1 },
  bannerTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  bannerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  bannerCancel: {
    minWidth: 68,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerCancelTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  cost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  costCol: { alignItems: "center", gap: 2, minWidth: 64 },
  costLbl: { fontSize: 11, fontFamily: "Inter_400Regular" },
  costVal: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  costOp: { fontSize: 20, fontFamily: "Inter_300Light" },

  skelWrap: { gap: 12 },
});
