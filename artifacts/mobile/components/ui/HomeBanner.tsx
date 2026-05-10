import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";

// ─── Types ────────────────────────────────────────────────────────────────────

type BannerType = "red_envelope" | "promo" | "holiday";

type BannerItem = {
  id: string;
  type: BannerType;
  icon: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  title: string;
  subtitle?: string;
  gradient: readonly [string, string];
  action?: () => void;
};

// ─── Fixed-date global events ─────────────────────────────────────────────────
//   showDayBefore: also shows a "Tomorrow is X" banner the day before.
//   giftCTA: adds a "Send gift" chip that routes to the gifts marketplace.
//   The banner key includes the calendar date, so dismissal resets each day
//   and the banner never reappears once its event day has passed.

type FixedEvent = {
  month: number;
  day: number;
  name: string;
  emoji: string;
  gradient: readonly [string, string];
  showDayBefore?: boolean;
  giftCTA?: boolean;
  subtitle?: string;
};

const FIXED_EVENTS: FixedEvent[] = [
  { month: 1,  day: 1,  name: "New Year's Day",              emoji: "🎆", gradient: ["#FF6B35", "#FF3B30"], showDayBefore: true, subtitle: "Wishing you a wonderful year ahead!" },
  { month: 1,  day: 26, name: "NRM Liberation Day",           emoji: "🇺🇬", gradient: ["#078930", "#078930"], subtitle: "Happy Liberation Day, Uganda!" },
  { month: 2,  day: 14, name: "Valentine's Day",              emoji: "💕", gradient: ["#FF2D55", "#FF6B81"], showDayBefore: true, giftCTA: true, subtitle: "Show your love — send a special gift" },
  { month: 2,  day: 16, name: "Archbishop Luwum Day",         emoji: "✝️", gradient: ["#5856D6", "#7B7BCA"], subtitle: "Honoring a great servant of Uganda" },
  { month: 3,  day: 8,  name: "International Women's Day",    emoji: "💜", gradient: ["#9B59B6", "#C084FC"], giftCTA: true, subtitle: "Celebrate the women in your life" },
  { month: 4,  day: 22, name: "Earth Day",                    emoji: "🌍", gradient: ["#34C759", "#30D158"], subtitle: "Every action for our planet counts" },
  { month: 5,  day: 1,  name: "Labour Day",                   emoji: "⚒️", gradient: ["#FF9500", "#FFCC00"], subtitle: "Happy Labour Day to all workers!" },
  { month: 6,  day: 1,  name: "International Children's Day", emoji: "👶", gradient: ["#FF9500", "#FFCC00"], giftCTA: true, subtitle: "Celebrate the joy of children" },
  { month: 6,  day: 3,  name: "Martyrs' Day",                 emoji: "🕊️", gradient: ["#5856D6", "#7B7BCA"], subtitle: "Honoring the Uganda Martyrs" },
  { month: 6,  day: 9,  name: "National Heroes' Day",         emoji: "⭐", gradient: ["#078930", "#078930"], subtitle: "Celebrating Uganda's national heroes" },
  { month: 7,  day: 4,  name: "Independence Day (US)",        emoji: "🇺🇸", gradient: ["#003087", "#BF0A30"], subtitle: "Happy 4th of July!" },
  { month: 10, day: 9,  name: "Uganda Independence Day",      emoji: "🇺🇬", gradient: ["#078930", "#FCDC04"], showDayBefore: true, subtitle: "Happy Independence Day, Uganda!" },
  { month: 10, day: 31, name: "Halloween",                    emoji: "🎃", gradient: ["#FF6B35", "#2C2C2E"], giftCTA: true, subtitle: "Trick or treat — send spooky gifts!" },
  { month: 11, day: 11, name: "Veterans Day",                 emoji: "🎖️", gradient: ["#003087", "#5856D6"], subtitle: "Honoring those who served" },
  { month: 11, day: 19, name: "International Men's Day",      emoji: "👨", gradient: ["#007AFF", "#0A84FF"], giftCTA: true, subtitle: "Celebrate the men who matter to you" },
  { month: 12, day: 24, name: "Christmas Eve",                emoji: "🎄", gradient: ["#C0392B", "#27AE60"], giftCTA: true, subtitle: "Christmas is tomorrow — send your gifts!" },
  { month: 12, day: 25, name: "Christmas Day",                emoji: "🎁", gradient: ["#C0392B", "#27AE60"], giftCTA: true, subtitle: "Merry Christmas! Spread joy with a gift" },
  { month: 12, day: 26, name: "Boxing Day",                   emoji: "📦", gradient: ["#27AE60", "#2ECC71"], giftCTA: true, subtitle: "Keep the holiday spirit going!" },
  { month: 12, day: 31, name: "New Year's Eve",               emoji: "🥂", gradient: ["#5856D6", "#FF2D55"], subtitle: "See you on the other side — Happy New Year!" },
];

// ─── Dynamic moveable feasts ──────────────────────────────────────────────────

type DynamicEvent = Omit<FixedEvent, "month" | "day"> & {
  getDate: (year: number) => Date;
};

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const d = new Date(year, month - 1, 1);
  let count = 0;
  while (d.getMonth() === month - 1) {
    if (d.getDay() === weekday) {
      count++;
      if (count === n) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const d = new Date(year, month, 0);
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
  return new Date(d);
}

const DYNAMIC_EVENTS: DynamicEvent[] = [
  {
    name: "Mother's Day",
    emoji: "💐",
    gradient: ["#FF2D55", "#FF9500"],
    showDayBefore: true,
    giftCTA: true,
    subtitle: "Show mom you love her — send a heartfelt gift",
    getDate: (y) => nthWeekday(y, 5, 0, 2),   // 2nd Sunday of May
  },
  {
    name: "Father's Day",
    emoji: "👔",
    gradient: ["#007AFF", "#34C759"],
    showDayBefore: true,
    giftCTA: true,
    subtitle: "Celebrate dad with a special gift today",
    getDate: (y) => nthWeekday(y, 6, 0, 3),   // 3rd Sunday of June
  },
  {
    name: "Thanksgiving",
    emoji: "🦃",
    gradient: ["#FF9500", "#C0392B"],
    showDayBefore: true,
    giftCTA: true,
    subtitle: "Grateful for the people in your life? Show it!",
    getDate: (y) => nthWeekday(y, 11, 4, 4),  // 4th Thursday of November
  },
  {
    name: "Easter Sunday",
    emoji: "🐣",
    gradient: ["#34C759", "#FFCC00"],
    giftCTA: true,
    subtitle: "Happy Easter! Send some joy to your loved ones",
    getDate: (y) => {
      // Anonymous Gregorian algorithm
      const a = y % 19, b = Math.floor(y / 100), c = y % 100;
      const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
      const i2 = Math.floor(c / 4), k = c % 4;
      const l = (32 + 2 * e + 2 * i2 - h - k) % 7;
      const m = Math.floor((a + 11 * h + 22 * l) / 451);
      const month = Math.floor((h + l - 7 * m + 114) / 31);
      const day   = ((h + l - 7 * m + 114) % 31) + 1;
      return new Date(y, month - 1, day);
    },
  },
  {
    name: "Earth Hour",
    emoji: "🌑",
    gradient: ["#1C1C1E", "#636366"],
    subtitle: "Switch off your lights for one hour tonight",
    getDate: (y) => lastWeekdayOfMonth(y, 3, 6), // Last Saturday of March
  },
];

// ─── Resolve which events are active today / tomorrow ────────────────────────

type ResolvedEvent = FixedEvent & { isToday: boolean };

function getActiveEvents(): ResolvedEvent[] {
  const now   = new Date();
  const y     = now.getFullYear();
  const todM  = now.getMonth() + 1;
  const todD  = now.getDate();
  const tom   = new Date(now);
  tom.setDate(tom.getDate() + 1);
  const tomM  = tom.getMonth() + 1;
  const tomD  = tom.getDate();

  const results: ResolvedEvent[] = [];

  const check = (ev: FixedEvent, evM: number, evD: number) => {
    const isToday    = evM === todM && evD === todD;
    const isTomorrow = evM === tomM && evD === tomD;
    if (isToday || (isTomorrow && ev.showDayBefore)) {
      results.push({ ...ev, isToday });
    }
  };

  for (const ev of FIXED_EVENTS) {
    check(ev, ev.month, ev.day);
  }
  for (const ev of DYNAMIC_EVENTS) {
    const date = ev.getDate(y);
    check(
      { ...ev, month: date.getMonth() + 1, day: date.getDate() },
      date.getMonth() + 1,
      date.getDate(),
    );
  }

  return results;
}

// ─── AsyncStorage dismissal helpers ──────────────────────────────────────────
//   Keys include the calendar date, so dismissal is per-day and the banner
//   auto-resets overnight. If the event has passed, getActiveEvents() returns
//   nothing, so the banner never reappears.

const DISMISS_PREFIX = "afu:home_banner:dismissed:";

async function isDismissed(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(`${DISMISS_PREFIX}${key}`)) !== null;
  } catch {
    return false;
  }
}

async function dismiss(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${DISMISS_PREFIX}${key}`, "1");
  } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeBanner() {
  const { user }  = useAuth();
  const { accent } = useTheme();

  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [idx, setIdx]         = useState(0);
  const [visible, setVisible] = useState(false);
  const visibleRef            = useRef(false);
  const slideAnim             = useRef(new Animated.Value(-72)).current;
  const opacityAnim           = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim,   { toValue: 0,   tension: 120, friction: 14, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1,   duration: 220, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, opacityAnim]);

  const animateOut = useCallback((cb?: () => void) => {
    Animated.parallel([
      Animated.timing(slideAnim,   { toValue: -72, duration: 220, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0,   duration: 180, useNativeDriver: true }),
    ]).start(cb);
  }, [slideAnim, opacityAnim]);

  const load = useCallback(async () => {
    const result: BannerItem[] = [];

    // ── 1. Unclaimed red envelopes ────────────────────────────────────────────
    if (user) {
      try {
        const { data: memberRows } = await supabase
          .from("chat_members")
          .select("chat_id")
          .eq("user_id", user.id);

        const chatIds = (memberRows || []).map((r: any) => r.chat_id);

        if (chatIds.length > 0) {
          const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
          const { data: envelopes } = await supabase
            .from("red_envelopes")
            .select("id, message, total_amount, recipient_count, claimed_count, is_expired, chat_id")
            .in("chat_id", chatIds)
            .eq("is_expired", false)
            .gt("created_at", cutoff)
            .order("created_at", { ascending: false })
            .limit(5);

          if (envelopes && envelopes.length > 0) {
            const claimable = envelopes.filter((e: any) => e.claimed_count < e.recipient_count);
            if (claimable.length > 0) {
              const { data: mine } = await supabase
                .from("red_envelope_claims")
                .select("red_envelope_id")
                .eq("claimer_id", user.id)
                .in("red_envelope_id", claimable.map((e: any) => e.id));

              const claimedSet = new Set((mine || []).map((c: any) => c.red_envelope_id));
              for (const env of claimable) {
                if (claimedSet.has(env.id)) continue;
                const bKey = `red_envelope:${env.id}`;
                if (await isDismissed(bKey)) continue;
                result.push({
                  id: bKey,
                  type: "red_envelope",
                  icon: "gift-outline",
                  emoji: "🧧",
                  title: "Unclaimed Red Envelope",
                  subtitle: env.message || `${env.total_amount.toLocaleString()} ACoin in your group`,
                  gradient: ["#FF3B30", "#FF6B35"] as const,
                  action: () => router.push(`/red-envelope/${env.id}` as any),
                });
              }
            }
          }
        }
      } catch {
        // red_envelopes table may not have chat_id yet — fail silently
      }
    }

    // ── 2. Active promotions from app_banners table ───────────────────────────
    try {
      const now = new Date().toISOString();
      const { data: promos } = await supabase
        .from("app_banners")
        .select("id, title, subtitle, icon, action_route, color")
        .eq("is_active", true)
        .lte("starts_at", now)
        .gte("ends_at", now)
        .order("priority", { ascending: false })
        .limit(3);

      for (const p of promos || []) {
        const bKey = `promo:${p.id}`;
        if (await isDismissed(bKey)) continue;
        const c = p.color || accent;
        result.push({
          id: bKey,
          type: "promo",
          icon: (p.icon as any) || "megaphone-outline",
          title: p.title,
          subtitle: p.subtitle ?? undefined,
          gradient: [c, c + "BB"] as const,
          action: p.action_route ? () => router.push(p.action_route as any) : undefined,
        });
      }
    } catch {}

    // ── 3. Calendar events (public holidays & global observances) ─────────────
    //   getActiveEvents() returns events that are happening today OR tomorrow
    //   (for events with showDayBefore). Once the day passes, they are gone.
    const dateStr     = new Date().toDateString();
    const activeEvents = getActiveEvents();
    for (const ev of activeEvents) {
      const bKey = `holiday:${ev.name}:${dateStr}`;
      if (await isDismissed(bKey)) continue;

      const title = ev.isToday
        ? `Happy ${ev.name}! ${ev.emoji}`
        : `Tomorrow: ${ev.name} ${ev.emoji}`;

      const subtitle = ev.isToday
        ? (ev.giftCTA ? "Send a gift to someone special today" : (ev.subtitle ?? `Wishing you a wonderful ${ev.name}!`))
        : (ev.subtitle ?? "Get ready to celebrate!");

      result.push({
        id: bKey,
        type: "holiday",
        icon: "calendar-outline",
        emoji: ev.emoji,
        title,
        subtitle,
        gradient: ev.gradient,
        action: ev.giftCTA && ev.isToday
          ? () => router.push("/gifts/marketplace" as any)
          : undefined,
      });
    }

    setBanners(result);
    setIdx(0);

    if (result.length > 0) {
      if (!visibleRef.current) {
        visibleRef.current = true;
        setVisible(true);
        animateIn();
      }
    } else if (visibleRef.current) {
      animateOut(() => { visibleRef.current = false; setVisible(false); });
    }
  }, [user, accent, animateIn, animateOut]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDismiss = useCallback(async (bannerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await dismiss(bannerId);
    setBanners((prev) => {
      const next = prev.filter((b) => b.id !== bannerId);
      if (next.length === 0) {
        animateOut(() => { visibleRef.current = false; setVisible(false); });
      } else {
        setIdx((i) => Math.min(i, next.length - 1));
      }
      return next;
    });
  }, [animateOut]);

  if (!visible || banners.length === 0) return null;

  const banner = banners[idx] ?? banners[0];

  return (
    <Animated.View
      style={[st.wrap, { transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}
    >
      <LinearGradient colors={banner.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.gradient}>
        <TouchableOpacity
          style={st.inner}
          onPress={() => {
            if (!banner.action) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            banner.action();
          }}
          activeOpacity={banner.action ? 0.82 : 1}
        >
          {/* Icon / emoji */}
          <View style={st.iconWrap}>
            {banner.emoji
              ? <Text style={st.emoji}>{banner.emoji}</Text>
              : <Ionicons name={banner.icon} size={20} color="#fff" />}
          </View>

          {/* Text */}
          <View style={st.textBlock}>
            <Text style={st.title} numberOfLines={1}>{banner.title}</Text>
            {banner.subtitle
              ? <Text style={st.subtitle} numberOfLines={1}>{banner.subtitle}</Text>
              : null}
          </View>

          {/* Gift CTA chip (only for gift-eligible today banners) */}
          {banner.action ? (
            <View style={st.ctaChip}>
              <Text style={st.ctaText}>Send gift</Text>
              <Ionicons name="gift-outline" size={12} color="#fff" />
            </View>
          ) : null}

          {/* Pagination dots */}
          {banners.length > 1 && (
            <View style={st.dotsRow}>
              {banners.map((_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setIdx(i)}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <View style={[st.dot, i === idx ? st.dotActive : st.dotInactive]} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Dismiss */}
          <TouchableOpacity
            style={st.closeBtn}
            onPress={() => handleDismiss(banner.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={15} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  wrap:     { paddingHorizontal: 12, paddingBottom: 4 },
  gradient: { borderRadius: 14, overflow: "hidden" },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  emoji:     { fontSize: 19, lineHeight: 22 },
  textBlock: { flex: 1, gap: 1 },
  title:     { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: -0.1 },
  subtitle:  { color: "rgba(255,255,255,0.82)", fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  ctaChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
    flexShrink: 0,
  },
  ctaText:     { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  dotsRow:     { flexDirection: "row", alignItems: "center", gap: 4, marginRight: 2 },
  dot:         { width: 5, height: 5, borderRadius: 3 },
  dotActive:   { backgroundColor: "#fff" },
  dotInactive: { backgroundColor: "rgba(255,255,255,0.35)" },
  closeBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
});
