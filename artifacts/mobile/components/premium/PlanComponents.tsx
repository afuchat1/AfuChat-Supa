import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassBackButton } from "@/components/ui/GlassBackButton";
import type { useTheme } from "@/hooks/useTheme";

/**
 * Presentational building blocks for app/premium.tsx.
 * Nothing in here touches Supabase, auth, wallet or payment logic:
 * every component is driven purely by props. No extra dependencies are
 * needed: gradients are composed from plain Views.
 */

export type ThemeColors = ReturnType<typeof useTheme>["colors"];
export type IconName = React.ComponentProps<typeof Ionicons>["name"];

// ── Colour helpers ───────────────────────────────────────────────────────────

const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: number[]): string {
  return `#${[r, g, b]
    .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function isDarkColor(hex: string): boolean {
  if (!/^#[0-9a-f]{3,8}$/i.test(hex)) return false;
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/** Mixes a colour towards white. */
export function lighten(color: string, amount = 0.25): string {
  if (!isHex(color)) return color;
  const [r, g, b] = hexToRgb(color);
  return rgbToHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
}

/** Darkens a colour so white text on top always has strong contrast. */
export function shade(color: string, amount = 0.3): string {
  if (!isHex(color)) return color;
  const [r, g, b] = hexToRgb(color);
  return rgbToHex([r * (1 - amount), g * (1 - amount), b * (1 - amount)]);
}

/** Lightens a brand tint on dark surfaces so deep colours (e.g. Platinum blue) stay legible. */
export function readableTint(tint: string, background: string): string {
  if (!isHex(tint) || !isDarkColor(background)) return tint;
  return lighten(tint, 0.45);
}

function sampleStops(stops: string[], t: number): string {
  if (stops.length === 1) return stops[0];
  const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}

function relLum(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Darkens a colour until white text/icons on it reach the given contrast ratio. */
export function onWhite(color: string, min = 4.5): string {
  if (!isHex(color)) return color;
  let c = color;
  for (let i = 0; i < 16 && 1.05 / (relLum(c) + 0.05) < min; i++) c = shade(c, 0.07);
  return c;
}

/** Opaque mix of two hex colours (t = 0 → a, t = 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  if (!isHex(a) || !isHex(b)) return b;
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

const DARK_CARD = "#17133F";

/** A tone of the colour that is readable as text/icon on a themed card. */
export function toneOnPal(accent: string, isDark: boolean): string {
  if (!isHex(accent)) return accent;
  if (!isDark) return onWhite(accent, 4.5);
  let c = accent;
  const base = relLum(DARK_CARD) + 0.05;
  for (let i = 0; i < 8 && (relLum(c) + 0.05) / base < 4.5; i++) c = lighten(c, 0.14);
  return c;
}

// ── Palette for the cards that sit on the full-page gradient ─────────────────

export type Pal = {
  isDark: boolean;
  card: string;
  cardBorder: string;
  divider: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  link: string;
  onAccent: string;
  success: string;
  warning: string;
  error: string;
  bar: string;
};

export function makePalette(colors: ThemeColors): Pal {
  const isDark = isDarkColor(colors.background);
  const base = {
    isDark,
    accent: colors.accent,
    onAccent: colors.bubbleText,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
  };
  return isDark
    ? {
        ...base,
        card: "rgba(255,255,255,0.09)",
        cardBorder: "rgba(255,255,255,0.16)",
        divider: "rgba(255,255,255,0.10)",
        text: "#FFFFFF",
        textSecondary: "rgba(255,255,255,0.80)",
        textMuted: "rgba(255,255,255,0.55)",
        link: lighten(colors.accent, 0.4),
        bar: "rgba(10,8,36,0.90)",
      }
    : {
        ...base,
        card: "#FFFFFF",
        cardBorder: "rgba(90,70,200,0.14)",
        divider: "rgba(90,70,200,0.10)",
        text: "#14183A",
        textSecondary: "#4B5278",
        textMuted: "#7A81A6",
        link: colors.accent,
        bar: "rgba(255,255,255,0.95)",
      };
}

// ── Gradient (pure Views, no native module) ──────────────────────────────────

export function Gradient({
  stops,
  direction = "vertical",
  steps = 48,
  style,
  children,
}: {
  stops: string[];
  direction?: "vertical" | "horizontal";
  steps?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const valid = stops.length > 0 && stops.every(isHex);
  const key = stops.join("|");
  const strips = useMemo(
    () => (valid ? Array.from({ length: steps }, (_, i) => sampleStops(stops, i / (steps - 1))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, steps, valid]
  );

  if (!valid) {
    return (
      <View style={[style, { backgroundColor: stops[stops.length - 1] ?? "transparent", overflow: "hidden" }]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[style, { overflow: "hidden" }]}>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { flexDirection: direction === "vertical" ? "column" : "row" }]}
      >
        {strips.map((c, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>
      {children}
    </View>
  );
}

// ── Full-page backdrop that cross-fades when the tier changes ────────────────

export function TierBackdrop({ stops }: { stops: string[] }) {
  const key = stops.join("|");
  const [layers, setLayers] = useState({ prev: stops, cur: stops });
  const fade = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setLayers((l) => ({ prev: l.cur, cur: stops }));
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Gradient stops={layers.prev} steps={56} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <Gradient stops={layers.cur} steps={56} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

// ── Icon mapping (every feature gets its own icon) ───────────────────────────

const SECTION_ICONS: Record<string, IconName> = {
  AfuAI: "sparkles",
  "Advanced AI": "flash",
  "Elite AI": "rocket",
  "Chat Tools": "chatbubbles",
  "Power Tools": "construct",
  Social: "people",
  "Elite Social": "trophy",
  Perks: "gift",
  "Elite Perks": "ribbon",
  Plan: "pricetags",
};

export function sectionIcon(title: string, fallback: string): IconName {
  return SECTION_ICONS[title] ?? (fallback as IconName);
}

const FEATURE_ICONS: [RegExp, IconName][] = [
  [/ad-free|\bads\b/i, "eye-off"],
  [/verified creator/i, "ribbon"],
  [/platinum badge|everything in/i, "diamond"],
  [/verified|badge/i, "shield-checkmark"],
  [/translat/i, "language"],
  [/voice|transcri/i, "mic"],
  [/speech|playback/i, "volume-high"],
  [/folder/i, "folder"],
  [/temporary/i, "timer"],
  [/auto-reply|focus/i, "moon"],
  [/remind/i, "alarm"],
  [/edit history/i, "time"],
  [/reaction/i, "happy"],
  [/envelope/i, "gift"],
  [/username/i, "at"],
  [/music/i, "musical-notes"],
  [/feed|discover/i, "compass"],
  [/stories/i, "images"],
  [/groups|channels/i, "people-circle"],
  [/theme|wallpaper/i, "color-palette"],
  [/summary/i, "document-text"],
  [/keyword/i, "notifications"],
  [/export/i, "download"],
  [/split screen/i, "albums"],
  [/roles/i, "key"],
  [/content filter/i, "funnel"],
  [/creator studio|monetis/i, "cash"],
  [/prestige/i, "medal"],
  [/leaderboard/i, "podium"],
  [/sync/i, "sync"],
  [/marketplace/i, "storefront"],
  [/support/i, "headset"],
  [/early access/i, "rocket"],
  [/afuai|\bai\b/i, "sparkles"],
  [/unlimited/i, "infinite"],
  [/monthly|charge/i, "pricetag"],
  [/\bbuy\b/i, "cart"],
];

export function iconForFeature(text: string): IconName {
  for (const [re, icon] of FEATURE_ICONS) if (re.test(text)) return icon;
  return "checkmark-circle";
}

// Row icon colours: all ≥ 4:1 on near-white; lightened automatically in dark theme.
const VIVID = ["#6D3AF0", "#0B7BDB", "#D9570A", "#0C8F63", "#C71F6E", "#B07A00", "#0A7F96", "#D32F2F"];

// One bold identity colour per feature section (cycled).
const SECTION_COLORS = ["#7C3AED", "#EA580C", "#059669", "#DB2777", "#0284C7"];

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

// ── Animated number (count-up) ───────────────────────────────────────────────

function AnimatedNumber({ value, style }: { value: number; style: StyleProp<any> }) {
  const anim = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(Math.round(v)));
    Animated.timing(anim, {
      toValue: value,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [value, anim]);

  return <Text style={style}>{shown}</Text>;
}

// ── Hero (sits directly on the page backdrop) ────────────────────────────────

function HeroChip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={s.heroChip}>
      <Ionicons name={icon} size={12} color="#FFFFFF" />
      <Text style={s.heroChipTxt}>{label}</Text>
    </View>
  );
}

const SPARKLES: { left: `${number}%`; top: number; size: number; icon: IconName }[] = [
  { left: "7%", top: 6, size: 14, icon: "sparkles" },
  { left: "88%", top: 24, size: 18, icon: "sparkles" },
  { left: "16%", top: 128, size: 11, icon: "star" },
  { left: "81%", top: 150, size: 13, icon: "star" },
  { left: "50%", top: 0, size: 10, icon: "sparkles" },
];

export function PlanHero({
  top,
  stops,
  icon,
  badge,
  tagline,
  acoin,
  usd,
  local,
  duration,
  perDay,
  verified,
  isCurrent,
}: {
  /** Space reserved at the top for the floating navigation bar. */
  top: number;
  /** The tier's 3-stop palette (deep → bright). */
  stops: string[];
  icon: IconName;
  badge: string;
  tagline: string;
  acoin: number;
  usd: string;
  local: string | null;
  duration: string;
  perDay: string | null;
  verified: boolean;
  isCurrent: boolean;
}) {
  const twinkle = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = [
      Animated.loop(
        Animated.timing(twinkle, { toValue: 1, duration: 2800, easing: Easing.linear, useNativeDriver: true })
      ),
      Animated.loop(
        Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true })
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(drift, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(drift, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [twinkle, pulse, drift]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });
  const orbA = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  const orbB = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const bright = stops[2] ?? stops[stops.length - 1];
  const mid = stops[1] ?? bright;

  return (
    <View style={s.heroRoot}>
      {/* soft glow behind the emblem + drifting orbs */}
      <View
        pointerEvents="none"
        style={[s.glow, { top: top - 50, backgroundColor: isHex(bright) ? bright + "38" : "rgba(255,255,255,0.12)" }]}
      />
      <Animated.View pointerEvents="none" style={[s.orb, s.orbA, { transform: [{ translateY: orbA }] }]} />
      <Animated.View pointerEvents="none" style={[s.orb, s.orbB, { transform: [{ translateY: orbB }] }]} />

      {SPARKLES.map((sp, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: sp.left,
            top: top + sp.top,
            opacity: twinkle.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: i % 2 ? [0.15, 0.9, 0.15] : [0.9, 0.15, 0.9],
            }),
          }}
        >
          <Ionicons name={sp.icon} size={sp.size} color="#FFFFFF" />
        </Animated.View>
      ))}

      <View style={[s.heroInner, { paddingTop: top + 6 }]}>
        <View style={s.emblemWrap}>
          <Animated.View
            pointerEvents="none"
            style={[s.emblemRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
          />
          <Gradient stops={[mid, shade(mid, 0.38)]} style={s.emblem}>
            <Ionicons name={icon} size={42} color="#FFFFFF" />
          </Gradient>
        </View>

        <Text style={s.overline}>AFUCHAT PREMIUM</Text>
        <Text style={s.heroBadge}>{badge}</Text>
        <Text style={s.heroTagline}>{tagline}</Text>

        {(isCurrent || verified) && (
          <View style={s.heroChipRow}>
            {isCurrent && <HeroChip icon="checkmark-circle" label="Current plan" />}
            {verified && <HeroChip icon="shield-checkmark" label="Verified badge" />}
          </View>
        )}

        <View style={s.heroPriceRow}>
          <AnimatedNumber value={acoin} style={s.heroPrice} />
          <View style={s.heroPriceSide}>
            <Text style={s.heroUnit}>AC</Text>
            <View style={s.heroDur}>
              <Text style={s.heroDurTxt}>/ {duration}</Text>
            </View>
          </View>
        </View>
        <Text style={s.heroEquiv}>
          {usd} USD{local ? `  ·  ≈ ${local}` : ""}
        </Text>
        {perDay ? (
          <View style={s.perDay}>
            <Ionicons name="flash" size={12} color="#FFD76A" />
            <Text style={s.perDayTxt}>Just {perDay}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── Tier selector: one vivid card per plan ───────────────────────────────────

export type TierTab = {
  id: string;
  label: string;
  icon: IconName;
  /** Legible tint for the current theme. */
  color: string;
  /** The tier's signature colour. */
  accent: string;
  priceLabel: string;
  isCurrent: boolean;
};

function TierCard({
  tab,
  selected,
  onPress,
  pal,
}: {
  tab: TierTab;
  selected: boolean;
  onPress: () => void;
  pal: Pal;
}) {
  const scale = useRef(new Animated.Value(selected ? 1.05 : 1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: selected ? 1.05 : 1,
      useNativeDriver: true,
      damping: 14,
      stiffness: 230,
      mass: 0.8,
    }).start();
  }, [selected, scale]);

  const fillTop = onWhite(tab.accent, 4.6);
  const fillBottom = shade(fillTop, 0.3);
  const medalTop = onWhite(tab.accent, 3.4);
  const medalBottom = shade(medalTop, 0.28);
  const tone = toneOnPal(tab.accent, pal.isDark);
  const restBg = pal.isDark ? mixHex(DARK_CARD, tab.accent, 0.3) : mixHex("#FFFFFF", tab.accent, 0.12);

  return (
    <Animated.View
      style={[
        s.tierWrap,
        {
          backgroundColor: selected ? fillBottom : restBg,
          borderColor: selected ? "rgba(255,255,255,0.6)" : tab.accent + "77",
          shadowColor: tab.accent,
          shadowOpacity: selected ? 0.5 : 0.14,
          shadowRadius: selected ? 16 : 8,
          shadowOffset: { width: 0, height: selected ? 8 : 3 },
          elevation: selected ? 12 : 3,
          zIndex: selected ? 2 : 1,
          transform: [{ scale }],
        },
      ]}
    >
      <Pressable
        style={s.tierCard}
        onPress={onPress}
        android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: false }}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={`${tab.label} plan, ${tab.priceLabel}${tab.isCurrent ? ", current plan" : ""}`}
        testID={`premium-tier-${tab.id}`}
      >
        {selected ? (
          <>
            <Gradient stops={[fillTop, fillBottom]} style={StyleSheet.absoluteFill} />
            <View pointerEvents="none" style={s.cardOrb} />
            <View pointerEvents="none" style={s.cardOrb2} />
          </>
        ) : (
          <Gradient
            stops={[lighten(tab.accent, 0.1), tab.accent]}
            direction="horizontal"
            style={s.cardStrip}
          />
        )}

        <View style={s.medalWrap}>
          {selected ? (
            <View style={s.medalSelected}>
              <Ionicons name={tab.icon} size={24} color="#FFFFFF" />
            </View>
          ) : (
            <Gradient stops={[medalTop, medalBottom]} style={s.medal}>
              <Ionicons name={tab.icon} size={22} color="#FFFFFF" />
            </Gradient>
          )}
          {tab.isCurrent && (
            <View
              style={[
                s.currentDot,
                { backgroundColor: pal.success, borderColor: selected ? fillTop : pal.isDark ? DARK_CARD : "#FFFFFF" },
              ]}
            />
          )}
        </View>

        <Text numberOfLines={1} style={[s.tierLabel, { color: selected ? "#FFFFFF" : pal.text }]}>
          {tab.label}
        </Text>

        <View
          style={[
            s.pricePill,
            { backgroundColor: selected ? "rgba(255,255,255,0.22)" : tab.accent + (pal.isDark ? "33" : "24") },
          ]}
        >
          <Text numberOfLines={1} style={[s.pricePillTxt, { color: selected ? "#FFFFFF" : tone }]}>
            {tab.priceLabel}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function TierTabs({
  tabs,
  activeId,
  onSelect,
  pal,
}: {
  tabs: TierTab[];
  activeId: string;
  onSelect: (id: string) => void;
  pal: Pal;
}) {
  return (
    <View style={s.tierRow} accessibilityRole="tablist">
      {tabs.map((tab) => (
        <TierCard key={tab.id} tab={tab} selected={tab.id === activeId} onPress={() => onSelect(tab.id)} pal={pal} />
      ))}
    </View>
  );
}

// ── Perk strip: one colourful tile per feature section ───────────────────────

export type FeatureSection = { icon: string; title: string; items: string[] };

export function PerkStrip({
  pal,
  sections,
  count,
}: {
  pal: Pal;
  sections: FeatureSection[];
  count: number;
}) {
  return (
    <View style={[s.card, cardShadow(pal), { backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
      <View style={s.stripHead}>
        <View style={s.stripTitleRow}>
          <Ionicons name="sparkles" size={18} color="#F5B301" />
          <Text style={[s.stripTitle, { color: pal.text }]}>What's included</Text>
        </View>
        <View style={[s.stripPill, { backgroundColor: pal.link + "22" }]}>
          <Text style={[s.stripPillTxt, { color: pal.link }]}>{count} features</Text>
        </View>
      </View>
      <View style={s.tiles}>
        {sections.map((sec, i) => {
          const c = SECTION_COLORS[i % SECTION_COLORS.length];
          const top = onWhite(c, 3.4);
          const bg = pal.isDark ? mixHex(DARK_CARD, c, 0.28) : mixHex("#FFFFFF", c, 0.12);
          return (
            <View key={sec.title + i} style={[s.tile, { backgroundColor: bg, borderColor: c + "66" }]}>
              <Gradient stops={[top, shade(top, 0.28)]} style={s.tileIcon}>
                <Ionicons name={sectionIcon(sec.title, sec.icon)} size={20} color="#FFFFFF" />
              </Gradient>
              <Text numberOfLines={2} style={[s.tileTitle, { color: pal.text }]}>
                {sec.title}
              </Text>
              <Text style={[s.tileCount, { color: toneOnPal(c, pal.isDark) }]}>{sec.items.length} perks</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Feature cards ────────────────────────────────────────────────────────────

function cardShadow(pal: Pal): ViewStyle {
  return pal.isDark
    ? {}
    : {
        shadowColor: "#2B1B80",
        shadowOpacity: 0.14,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 5,
      };
}

function FeatureBlock({
  index,
  section,
  pal,
}: {
  index: number;
  section: FeatureSection;
  pal: Pal;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  const sc = SECTION_COLORS[index % SECTION_COLORS.length];
  const bandTop = onWhite(sc, 4.6);
  const bandBottom = shade(bandTop, 0.32);
  const cardBg = pal.isDark ? mixHex(DARK_CARD, sc, 0.26) : mixHex("#FFFFFF", sc, 0.10);
  const checkBg = onWhite(sc, 3.4);

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 380,
      delay: 90 + index * 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  return (
    <Animated.View
      style={[
        s.featCardC,
        {
          backgroundColor: cardBg,
          borderColor: sc + "77",
          shadowColor: sc,
          shadowOpacity: pal.isDark ? 0.35 : 0.22,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      <Gradient stops={[bandTop, bandBottom]} direction="horizontal" style={s.featBand}>
        <View pointerEvents="none" style={s.bandOrb} />
        <View pointerEvents="none" style={s.bandOrb2} />
        <View style={s.bandIcon}>
          <Ionicons name={sectionIcon(section.title, section.icon)} size={20} color="#FFFFFF" />
        </View>
        <Text style={s.bandTitle}>{section.title}</Text>
        <View style={s.bandCount}>
          <Text style={s.bandCountTxt}>{section.items.length}</Text>
        </View>
      </Gradient>

      <View style={s.rowsWrap}>
        {section.items.map((item, ii) => {
          const v = VIVID[(index * 3 + ii) % VIVID.length];
          const chipTop = onWhite(v, 3.4);
          const rowBg = pal.isDark ? mixHex(DARK_CARD, v, 0.2) : mixHex("#FFFFFF", v, 0.07);
          return (
            <View
              key={ii}
              style={[s.featRowC, { backgroundColor: rowBg, borderColor: v + (pal.isDark ? "55" : "33") }]}
            >
              <Gradient stops={[chipTop, shade(chipTop, 0.26)]} style={s.rowChip}>
                <Ionicons name={iconForFeature(item)} size={17} color="#FFFFFF" />
              </Gradient>
              <Text style={[s.featRowTxt, { color: pal.text }]}>{item}</Text>
              <View style={[s.rowCheck, { backgroundColor: checkBg }]}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

export function FeatureCard({
  pal,
  sections,
  tierKey,
}: {
  pal: Pal;
  sections: FeatureSection[];
  /** Changes when the tier changes so the entrance animation replays. */
  tierKey: string;
}) {
  return (
    <View style={s.featStack}>
      {sections.map((sec, si) => (
        <FeatureBlock key={`${tierKey}-${sec.title}-${si}`} index={si} section={sec} pal={pal} />
      ))}
    </View>
  );
}

// ── Wallet card ──────────────────────────────────────────────────────────────

export function WalletCard({
  pal,
  balance,
  usd,
  onPress,
}: {
  pal: Pal;
  balance: number;
  usd: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "rgba(255,255,255,0.2)" }}
      style={({ pressed }) => [pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel={`ACoin balance ${balance}. Top up wallet`}
      testID="premium-wallet-card"
    >
      <Gradient
        stops={[shade(pal.accent, 0.45), pal.accent, lighten(pal.accent, 0.2)]}
        direction="horizontal"
        style={s.wallet}
      >
        <View pointerEvents="none" style={s.walletOrb} />
        <View pointerEvents="none" style={s.walletOrb2} />
        <View style={s.walletIcon}>
          <Ionicons name="wallet" size={22} color="#FFFFFF" />
        </View>
        <View style={s.walletMid}>
          <Text style={s.walletLbl}>ACoin balance</Text>
          <Text style={s.walletVal}>
            {balance} AC <Text style={s.walletUsd}>{usd}</Text>
          </Text>
        </View>
        <View style={s.topUp}>
          <Ionicons name="add-circle" size={16} color={pal.accent} />
          <Text style={[s.topUpTxt, { color: pal.accent }]}>Top up</Text>
        </View>
      </Gradient>
    </Pressable>
  );
}

// ── Active subscription banner ───────────────────────────────────────────────

export function ActiveBanner({
  pal,
  tint,
  label,
  daysLeft,
  cancelling,
  onCancel,
}: {
  pal: Pal;
  tint: string;
  label: string;
  daysLeft: number;
  cancelling: boolean;
  onCancel: () => void;
}) {
  return (
    <View
      style={[
        s.banner,
        cardShadow(pal),
        { backgroundColor: pal.card, borderColor: tint + "66" },
      ]}
    >
      <View style={[s.bannerIcon, { backgroundColor: tint + "26" }]}>
        <Ionicons name="shield-checkmark" size={18} color={tint} />
      </View>
      <View style={s.bannerMid}>
        <Text style={[s.bannerTitle, { color: pal.text }]}>{label} is active</Text>
        <Text style={[s.bannerSub, { color: pal.textSecondary }]}>
          {daysLeft} {daysLeft === 1 ? "day" : "days"} left
        </Text>
      </View>
      <TouchableOpacity
        onPress={onCancel}
        disabled={cancelling}
        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        style={[s.bannerCancel, { borderColor: pal.cardBorder }, cancelling && { opacity: 0.5 }]}
        accessibilityRole="button"
        accessibilityLabel="Cancel subscription"
        testID="premium-cancel"
      >
        {cancelling ? (
          <ActivityIndicator size="small" color={pal.textSecondary} />
        ) : (
          <Text style={[s.bannerCancelTxt, { color: pal.textSecondary }]}>Cancel</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Cost summary (balance → cost → after) ────────────────────────────────────

export function CostSummary({
  pal,
  balance,
  cost,
  after,
  canAfford,
}: {
  pal: Pal;
  balance: number;
  cost: number;
  after: number;
  canAfford: boolean;
}) {
  return (
    <View style={[s.cost, { backgroundColor: pal.isDark ? "rgba(255,255,255,0.07)" : "#F4F2FF", borderColor: pal.cardBorder }]}>
      <View style={s.costCol}>
        <Ionicons name="wallet-outline" size={14} color={pal.textMuted} />
        <Text style={[s.costLbl, { color: pal.textMuted }]}>Balance</Text>
        <Text style={[s.costVal, { color: pal.text }]}>{balance}</Text>
      </View>
      <Text style={[s.costOp, { color: pal.textMuted }]}>−</Text>
      <View style={s.costCol}>
        <Ionicons name="pricetag-outline" size={14} color={pal.textMuted} />
        <Text style={[s.costLbl, { color: pal.textMuted }]}>Cost</Text>
        <Text style={[s.costVal, { color: pal.warning }]}>{cost}</Text>
      </View>
      <Text style={[s.costOp, { color: pal.textMuted }]}>=</Text>
      <View style={s.costCol}>
        <Ionicons
          name={canAfford ? "checkmark-circle-outline" : "alert-circle-outline"}
          size={14}
          color={canAfford ? pal.success : pal.error}
        />
        <Text style={[s.costLbl, { color: pal.textMuted }]}>After</Text>
        <Text style={[s.costVal, { color: canAfford ? pal.success : pal.error, fontFamily: "Inter_700Bold" }]}>
          {after}
        </Text>
      </View>
    </View>
  );
}

// ── CTA backdrop: gradient + periodic shine sweep ────────────────────────────

/** Render as the FIRST child of the CTA button. The button needs overflow: "hidden". */
export function CtaBackdrop({ color }: { color: string }) {
  const sweep = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);

  useEffect(() => {
    if (!w) return;
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(2400),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [w, sweep]);

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
    >
      <Gradient
        stops={[shade(color, 0.4), color, lighten(color, 0.25)]}
        direction="horizontal"
        style={StyleSheet.absoluteFill}
      />
      {w > 0 && (
        <Animated.View
          style={[
            s.shine,
            {
              transform: [
                { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-90, w + 90] }) },
                { rotate: "20deg" },
              ],
            },
          ]}
        />
      )}
    </View>
  );
}

// ── Trust line under the CTA ─────────────────────────────────────────────────

export function TrustLine({ pal, text }: { pal: Pal; text: string }) {
  return (
    <View style={s.trust}>
      <Ionicons name="lock-closed" size={13} color={pal.textMuted} />
      <Text style={[s.trustTxt, { color: pal.textMuted }]}>{text}</Text>
    </View>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

export function PremiumSkeleton({ pal }: { pal: Pal }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const block = (h: number, extra?: object) => (
    <Animated.View
      style={[
        { height: h, borderRadius: 22, backgroundColor: pal.card, borderWidth: 1, borderColor: pal.cardBorder, opacity: pulse },
        extra,
      ]}
    />
  );

  return (
    <View style={s.skelWrap} accessibilityLabel="Loading plan options" accessibilityRole="progressbar">
      {block(180, { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.2)" })}
      {block(84)}
      {block(150)}
      {block(220)}
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
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", letterSpacing: -0.3 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  // hero
  heroRoot: { width: "100%", paddingBottom: 56 },
  heroInner: {
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  glow: {
    position: "absolute",
    alignSelf: "center",
    width: 230,
    height: 230,
    borderRadius: 115,
  },
  orb: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  orbA: { width: 240, height: 240, top: -80, right: -80 },
  orbB: { width: 170, height: 170, bottom: 0, left: -70, backgroundColor: "rgba(255,255,255,0.06)" },

  emblemWrap: { width: 96, height: 96, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emblemRing: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  emblem: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
  },
  overline: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 3,
    color: "rgba(255,255,255,0.75)",
    marginBottom: 4,
  },
  heroBadge: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: 4,
    color: "#FFFFFF",
    textAlign: "center",
  },
  heroTagline: {
    fontSize: 14.5,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.86)",
    marginTop: 4,
    textAlign: "center",
  },
  heroChipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 14 },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  heroChipTxt: { fontSize: 11.5, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },

  heroPriceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  heroPrice: { fontSize: 62, lineHeight: 68, fontFamily: "Inter_700Bold", letterSpacing: -2.5, color: "#FFFFFF" },
  heroPriceSide: { gap: 6, alignItems: "flex-start" },
  heroUnit: { fontSize: 22, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.92)" },
  heroDur: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  heroDurTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  heroEquiv: { fontSize: 14.5, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.88)", marginTop: 2 },
  perDay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  perDayTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },

  // tier cards
  tierRow: { flexDirection: "row", alignItems: "stretch", gap: 10, paddingTop: 6, paddingBottom: 4 },
  tierWrap: { flex: 1, borderRadius: 22, borderWidth: 1.5 },
  tierCard: {
    flex: 1,
    minHeight: 118,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  cardStrip: { position: "absolute", top: 0, left: 0, right: 0, height: 5 },
  cardOrb: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    top: -30,
    right: -26,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  cardOrb2: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    bottom: -20,
    left: -14,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  medalWrap: { position: "relative" },
  medal: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  medalSelected: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.24)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
  },
  currentDot: {
    position: "absolute",
    top: -3,
    right: -5,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
  },
  tierLabel: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5, textAlign: "center" },
  pricePill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, maxWidth: "94%" },
  pricePillTxt: { fontSize: 11.5, fontFamily: "Inter_700Bold", textAlign: "center" },

  // generic card
  card: { borderRadius: 24, borderWidth: 1, overflow: "hidden" },

  // perk strip
  stripHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 6,
  },
  stripTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stripTitle: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  stripPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  stripPillTxt: { fontSize: 12, fontFamily: "Inter_700Bold" },
  tiles: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 14 },
  tile: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 18,
    borderWidth: 1,
  },
  tileIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  tileTitle: { fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "center", minHeight: 30 },
  tileCount: { fontSize: 11, fontFamily: "Inter_700Bold", marginTop: -4 },

  // feature cards
  featStack: { gap: 16 },
  featCardC: { borderRadius: 26, borderWidth: 1.5, overflow: "hidden" },
  featBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bandOrb: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    top: -50,
    right: -20,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  bandOrb2: {
    position: "absolute",
    width: 70,
    height: 70,
    borderRadius: 35,
    bottom: -35,
    left: 90,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  bandIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  bandTitle: { flex: 1, minWidth: 0, fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.2, color: "#FFFFFF" },
  bandCount: {
    minWidth: 30,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  bandCountTxt: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  rowsWrap: { padding: 12, gap: 8 },
  featRowC: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  rowChip: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featRowTxt: { flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 20, fontFamily: "Inter_600SemiBold" },
  rowCheck: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  // wallet
  wallet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 24,
  },
  walletOrb: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -70,
    right: -30,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  walletOrb2: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    bottom: -40,
    left: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  walletIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  walletMid: { flex: 1, minWidth: 0, gap: 2 },
  walletLbl: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.85)" },
  walletVal: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#FFFFFF", letterSpacing: -0.5 },
  walletUsd: { fontSize: 13, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.8)" },
  topUp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  topUpTxt: { fontSize: 13, fontFamily: "Inter_700Bold" },

  // banner
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  bannerIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  bannerMid: { flex: 1, minWidth: 0, gap: 1 },
  bannerTitle: { fontSize: 14.5, fontFamily: "Inter_700Bold" },
  bannerSub: { fontSize: 12, fontFamily: "Inter_500Medium" },
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

  // cost
  cost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  costCol: { alignItems: "center", gap: 2, minWidth: 64 },
  costLbl: { fontSize: 11, fontFamily: "Inter_400Regular" },
  costVal: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  costOp: { fontSize: 20, fontFamily: "Inter_300Light" },

  // cta
  shine: {
    position: "absolute",
    top: -20,
    bottom: -20,
    width: 46,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  trust: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  trustTxt: { fontSize: 12, fontFamily: "Inter_500Medium" },

  skelWrap: { gap: 14 },
});
