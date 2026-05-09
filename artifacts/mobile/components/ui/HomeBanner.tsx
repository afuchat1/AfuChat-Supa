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

// ─── Uganda public holidays ───────────────────────────────────────────────────

const HOLIDAYS: { month: number; day: number; name: string; emoji: string }[] = [
  { month: 1,  day: 1,  name: "New Year's Day",            emoji: "🎆" },
  { month: 1,  day: 26, name: "NRM Liberation Day",         emoji: "🇺🇬" },
  { month: 2,  day: 16, name: "Archbishop Luwum Day",       emoji: "✝️" },
  { month: 3,  day: 8,  name: "International Women's Day",  emoji: "💜" },
  { month: 5,  day: 1,  name: "Labour Day",                 emoji: "⚒️" },
  { month: 6,  day: 3,  name: "Martyrs' Day",               emoji: "🕊️" },
  { month: 6,  day: 9,  name: "National Heroes' Day",       emoji: "⭐" },
  { month: 10, day: 9,  name: "Independence Day",           emoji: "🇺🇬" },
  { month: 12, day: 25, name: "Christmas Day",              emoji: "🎄" },
  { month: 12, day: 26, name: "Boxing Day",                 emoji: "🎁" },
];

function getTodayHoliday(): { name: string; emoji: string; isToday: boolean } | null {
  const now = new Date();
  const today = { month: now.getMonth() + 1, day: now.getDate() };
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tom = { month: tomorrow.getMonth() + 1, day: tomorrow.getDate() };

  for (const h of HOLIDAYS) {
    if (h.month === today.month && h.day === today.day) {
      return { name: h.name, emoji: h.emoji, isToday: true };
    }
    if (h.month === tom.month && h.day === tom.day) {
      return { name: h.name, emoji: h.emoji, isToday: false };
    }
  }
  return null;
}

// ─── Dismissal helpers ────────────────────────────────────────────────────────

const DISMISS_PREFIX = "afu:home_banner:dismissed:";

async function isDismissed(key: string): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(`${DISMISS_PREFIX}${key}`);
    return val !== null;
  } catch {
    return false;
  }
}

async function dismiss(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${DISMISS_PREFIX}${key}`, "1");
  } catch {}
}

// ─── Banner component ─────────────────────────────────────────────────────────

export function HomeBanner() {
  const { user } = useAuth();
  const { accent } = useTheme();

  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);

  const slideAnim = useRef(new Animated.Value(-72)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Auto-cycle through banners every 5 s
  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 120, friction: 14, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, opacityAnim]);

  const animateOut = useCallback((cb?: () => void) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -72, duration: 220, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(cb);
  }, [slideAnim, opacityAnim]);

  const load = useCallback(async () => {
    const result: BannerItem[] = [];

    // ── 1. Unclaimed red envelopes in user's group chats ──────────────────────
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
            const claimable = envelopes.filter(
              (e: any) => e.claimed_count < e.recipient_count,
            );

            if (claimable.length > 0) {
              const { data: mine } = await supabase
                .from("red_envelope_claims")
                .select("red_envelope_id")
                .eq("claimer_id", user.id)
                .in("red_envelope_id", claimable.map((e: any) => e.id));

              const claimedSet = new Set(
                (mine || []).map((c: any) => c.red_envelope_id),
              );

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
                  subtitle:
                    env.message ||
                    `${env.total_amount.toLocaleString()} ACoin in your group`,
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
          action: p.action_route
            ? () => router.push(p.action_route as any)
            : undefined,
        });
      }
    } catch {
      // app_banners might not exist — fail silently
    }

    // ── 3. Public holiday ─────────────────────────────────────────────────────
    const holiday = getTodayHoliday();
    if (holiday) {
      const bKey = `holiday:${holiday.name}:${new Date().toDateString()}`;
      if (!(await isDismissed(bKey))) {
        result.push({
          id: bKey,
          type: "holiday",
          icon: "calendar-outline",
          emoji: holiday.emoji,
          title: holiday.isToday
            ? `Happy ${holiday.name}! ${holiday.emoji}`
            : `Tomorrow: ${holiday.name}`,
          subtitle: holiday.isToday
            ? "Wishing you a wonderful day from AfuChat"
            : "Get ready to celebrate!",
          gradient: ["#D4A853", "#FF9500"] as const,
        });
      }
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
      animateOut(() => {
        visibleRef.current = false;
        setVisible(false);
      });
    }
  }, [user, accent, animateIn, animateOut]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDismiss = useCallback(async (bannerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await dismiss(bannerId);
    setBanners((prev) => {
      const next = prev.filter((b) => b.id !== bannerId);
      if (next.length === 0) {
        animateOut(() => {
          visibleRef.current = false;
          setVisible(false);
        });
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
      style={[
        styles.wrap,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      <LinearGradient
        colors={banner.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <TouchableOpacity
          style={styles.inner}
          onPress={() => {
            if (!banner.action) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            banner.action();
          }}
          activeOpacity={banner.action ? 0.82 : 1}
        >
          {/* Leading icon / emoji */}
          <View style={styles.iconWrap}>
            {banner.emoji ? (
              <Text style={styles.emoji}>{banner.emoji}</Text>
            ) : (
              <Ionicons name={banner.icon} size={20} color="#fff" />
            )}
          </View>

          {/* Text block */}
          <View style={styles.textBlock}>
            <Text style={styles.title} numberOfLines={1}>
              {banner.title}
            </Text>
            {banner.subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {banner.subtitle}
              </Text>
            ) : null}
          </View>

          {/* Chevron tap hint (only when tappable) */}
          {banner.action ? (
            <Ionicons
              name="chevron-forward"
              size={16}
              color="rgba(255,255,255,0.7)"
              style={{ marginRight: 4 }}
            />
          ) : null}

          {/* Pagination dots */}
          {banners.length > 1 && (
            <View style={styles.dotsRow}>
              {banners.map((_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setIdx(i)}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <View
                    style={[
                      styles.dot,
                      i === idx ? styles.dotActive : styles.dotInactive,
                    ]}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Dismiss button */}
          <TouchableOpacity
            style={styles.closeBtn}
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

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  gradient: {
    borderRadius: 14,
    overflow: "hidden",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  emoji: {
    fontSize: 19,
    lineHeight: 22,
  },
  textBlock: {
    flex: 1,
    gap: 1,
  },
  title: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.1,
  },
  subtitle: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: "#fff",
  },
  dotInactive: {
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
