import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";

const afuSymbol = require("@/assets/images/afu-symbol.png");

type Plan = {
  id: string;
  name: string;
  description: string | null;
  acoin_price: number;
  duration_days: number;
  grants_verification: boolean;
  tier: string;
};

const FALLBACK_PRICES: Record<string, number> = {
  silver: 500,
  gold: 1200,
  platinum: 2500,
};

type TierCfg = {
  color: string;
  glow: string;
  gradientColors: [string, string, string];
  emoji: string;
  badge: string;
  usdEquiv: string;
  ugxEquiv: string;
  tagline: string;
  sections: { icon: string; title: string; items: string[] }[];
};

const TIER_CONFIG: Record<string, TierCfg> = {
  silver: {
    color: "#A0AFBF",
    glow: "#A0AFBF33",
    gradientColors: ["#3A4A58", "#2A3640", "#1A222A"],
    emoji: "🥈",
    badge: "SILVER",
    usdEquiv: "≈ $5",
    ugxEquiv: "≈ UGX 18,500",
    tagline: "Essential AI & privacy tools",
    sections: [
      {
        icon: "sparkles",
        title: "AfuAI",
        items: [
          "50 AI messages / day",
          "Message Translation",
          "Voice → Text transcription",
          "Text → Speech playback",
        ],
      },
      {
        icon: "chatbubbles",
        title: "Chat Tools",
        items: [
          "Smart Chat Folders",
          "Temporary Chat (auto-delete)",
          "Auto-Reply & Focus Mode",
          "Message Reminders",
          "Edit History",
          "Advanced Reactions",
        ],
      },
      {
        icon: "people",
        title: "Social",
        items: [
          "3 Groups · 3 Channels",
          "5 Stories per day",
          "Red Envelope sends & claims",
        ],
      },
      {
        icon: "diamond",
        title: "Perks",
        items: [
          "Verified Badge",
          "Ad-free experience",
          "Basic chat themes",
        ],
      },
    ],
  },
  gold: {
    color: "#D4A853",
    glow: "#D4A85333",
    gradientColors: ["#4A3A18", "#382C10", "#261E08"],
    emoji: "🥇",
    badge: "GOLD",
    usdEquiv: "≈ $12",
    ugxEquiv: "≈ UGX 44,400",
    tagline: "Power tools for creators",
    sections: [
      {
        icon: "sparkles",
        title: "Advanced AI",
        items: [
          "200 AI messages / day",
          "AI Chat Summary",
          "Keyword Alerts",
          "Scheduled Focus Mode",
        ],
      },
      {
        icon: "construct",
        title: "Power Tools",
        items: [
          "Chat Export (PDF / TXT / JSON)",
          "Split Screen (Web)",
          "Group Roles System",
          "Content Filter",
        ],
      },
      {
        icon: "people",
        title: "Social",
        items: [
          "10 Groups · 10 Channels",
          "15 Stories per day",
          "Creator Studio — Monetise posts",
          "Prestige Status",
        ],
      },
      {
        icon: "diamond",
        title: "Perks",
        items: [
          "Everything in Silver",
          "Custom chat themes",
          "Priority in Discover",
        ],
      },
    ],
  },
  platinum: {
    color: "#00BCD4",
    glow: "#00BCD433",
    gradientColors: ["#003840", "#002830", "#001820"],
    emoji: "💎",
    badge: "PLATINUM",
    usdEquiv: "≈ $25",
    ugxEquiv: "≈ UGX 92,500",
    tagline: "Unlimited, elite, no limits",
    sections: [
      {
        icon: "sparkles",
        title: "Elite AI",
        items: [
          "Unlimited AI messages",
          "AI Themes & Wallpapers",
          "Smart Notifications (AI)",
        ],
      },
      {
        icon: "trophy",
        title: "Elite Social",
        items: [
          "Unlimited Groups & Channels",
          "Unlimited Stories",
          "Create & Send Red Envelopes",
          "Gift Marketplace",
          "Leaderboard privacy",
          "Cross-Device Sync",
        ],
      },
      {
        icon: "diamond",
        title: "Elite Perks",
        items: [
          "Everything in Gold",
          "Priority Support",
          "Early access to features",
          "Exclusive Platinum badge & ring",
        ],
      },
    ],
  },
};

const TIERS = ["silver", "gold", "platinum"] as const;

function durationLabel(days: number) {
  if (days >= 365) return `${Math.round(days / 365)} year`;
  if (days >= 30) return `${Math.round(days / 30)} month`;
  return `${days} days`;
}

export default function PremiumScreen() {
  const { colors, isDark } = useTheme();
  const { profile, subscription, isPremium, refreshProfile, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeTier, setActiveTier] = useState<string>("gold");
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const loadPlans = useCallback(async () => {
    const { data } = await supabase
      .from("subscription_plans")
      .select("id, name, description, acoin_price, duration_days, grants_verification, tier")
      .eq("is_active", true)
      .order("acoin_price", { ascending: true });
    if (data) {
      const patched = (data as Plan[]).map((p) => ({
        ...p,
        acoin_price: FALLBACK_PRICES[p.tier] ?? p.acoin_price,
      }));
      for (const p of patched) {
        const orig = data.find((d) => d.id === p.id);
        if (orig && orig.acoin_price !== p.acoin_price) {
          supabase.from("subscription_plans").update({ acoin_price: p.acoin_price }).eq("id", p.id).then(() => {});
        }
      }
      setPlans(patched);
      const currentTier = subscription?.plan_tier;
      setActiveTier(currentTier && TIER_CONFIG[currentTier] ? currentTier : "gold");
    }
    setLoading(false);
  }, [subscription]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  function switchTier(tier: string) {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setActiveTier(tier);
    Haptics.selectionAsync?.();
  }

  const selectedPlan = plans.find((p) => p.tier === activeTier);
  const cfg = TIER_CONFIG[activeTier];
  const tierColor = cfg?.color ?? colors.accent;
  const isCurrentPlan = isPremium && subscription?.plan_tier === activeTier;
  const isSwitching = isPremium && !isCurrentPlan && !!selectedPlan;
  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / 86400000))
    : 0;

  async function handleSubscribe() {
    if (!profile || !user || !selectedPlan) return;
    if ((profile.acoin || 0) < selectedPlan.acoin_price) {
      showAlert("Insufficient ACoin", `You need ${selectedPlan.acoin_price} ACoin but only have ${profile.acoin || 0}. Go to Wallet to top up.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Top Up", onPress: () => router.push("/wallet") },
      ]);
      return;
    }
    const title = isSwitching ? "Switch Plan" : "Confirm Subscription";
    const message = isSwitching
      ? `Switch to ${selectedPlan.name} for ${selectedPlan.acoin_price} ACoin?\nYour current plan cancels immediately and the new ${selectedPlan.duration_days}-day plan starts now.`
      : `Subscribe to ${selectedPlan.name} for ${selectedPlan.acoin_price} ACoin for ${durationLabel(selectedPlan.duration_days)}.`;

    showAlert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: isSwitching ? "Switch" : "Subscribe",
        onPress: async () => {
          setSubscribing(true);
          const { error: deductError } = await supabase
            .from("profiles")
            .update({ acoin: (profile.acoin || 0) - selectedPlan.acoin_price })
            .eq("id", profile.id)
            .gte("acoin", selectedPlan.acoin_price);
          if (deductError) {
            showAlert("Error", "Could not deduct ACoin. Please try again.");
            setSubscribing(false);
            return;
          }
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + selectedPlan.duration_days);
          const { error: subError } = await supabase.from("user_subscriptions").upsert({
            user_id: profile.id,
            plan_id: selectedPlan.id,
            started_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            is_active: true,
            acoin_paid: selectedPlan.acoin_price,
          }, { onConflict: "user_id" });
          if (subError) {
            await supabase.from("profiles").update({ acoin: profile.acoin || 0 }).eq("id", profile.id);
            showAlert("Error", "Could not activate subscription. Your ACoin has been refunded.");
            setSubscribing(false);
            return;
          }
          await supabase.from("acoin_transactions").insert({
            user_id: profile.id,
            amount: -selectedPlan.acoin_price,
            transaction_type: isSwitching ? "subscription_switch" : "subscription",
            metadata: { plan_name: selectedPlan.name, plan_tier: selectedPlan.tier, duration_days: selectedPlan.duration_days, previous_plan: subscription?.plan_name },
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await refreshProfile();
          showAlert(
            isSwitching ? "Plan Switched!" : "Welcome to Premium! 🎉",
            `Your ${selectedPlan.name} subscription is now active for ${durationLabel(selectedPlan.duration_days)}.`,
            [{ text: "Awesome!", onPress: () => router.back() }]
          );
          setSubscribing(false);
        },
      },
    ]);
  }

  async function handleCancel() {
    if (!user || !subscription) return;
    showAlert(
      "Cancel Subscription",
      `Cancel your ${subscription.plan_name} plan?\n\nYou lose access immediately. Unused days are non-refundable.`,
      [
        { text: "Keep Plan", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            const { error } = await supabase.rpc("cancel_my_subscription");
            if (error) {
              showAlert("Error", error.message);
              setCancelling(false);
              return;
            }
            await supabase.from("acoin_transactions").insert({
              user_id: user.id,
              amount: 0,
              transaction_type: "subscription_cancelled",
              metadata: { plan_name: subscription.plan_name, plan_tier: subscription.plan_tier },
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await refreshProfile();
            setCancelling(false);
            showAlert("Subscription Cancelled", "You are now on the free plan.", [
              { text: "OK", onPress: () => setActiveTier("gold") },
            ]);
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={[s.flex, { backgroundColor: "#0F1318" }]}>
        <View style={[s.navBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.navTitle}>Premium</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.loadingCenter}>
          <ActivityIndicator color="#D4A853" size="large" />
          <Text style={s.loadingText}>Loading plans…</Text>
        </View>
      </View>
    );
  }

  const afterBalance = (profile?.acoin ?? 0) - (selectedPlan?.acoin_price ?? 0);
  const canAfford = (profile?.acoin ?? 0) >= (selectedPlan?.acoin_price ?? 0);

  return (
    <View style={s.flex}>
      {/* ── Scrollable content ── */}
      <ScrollView
        style={s.flex}
        contentContainerStyle={{ paddingBottom: 180 }}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* ── Hero gradient ── */}
        <LinearGradient
          colors={cfg?.gradientColors ?? ["#1a1a2e", "#16213e", "#0f3460"]}
          style={[s.hero, { paddingTop: insets.top + 56 }]}
        >
          {/* glow orb */}
          <View style={[s.glowOrb, { backgroundColor: tierColor + "22" }]} />

          <View style={[s.heroBadge, { backgroundColor: tierColor + "22", borderColor: tierColor + "44" }]}>
            <Image source={afuSymbol} style={{ width: 32, height: 32, tintColor: tierColor }} resizeMode="contain" />
          </View>
          <Text style={s.heroTitle}>AfuChat Premium</Text>
          <Text style={[s.heroSub, { color: tierColor + "CC" }]}>{cfg?.tagline ?? "Unlock everything"}</Text>

          {/* Active plan chip */}
          {isPremium && subscription && (
            <View style={[s.activeChip, { backgroundColor: tierColor + "22", borderColor: tierColor + "55" }]}>
              <Text style={s.activeChipEmoji}>{TIER_CONFIG[subscription.plan_tier]?.emoji ?? "⭐"}</Text>
              <Text style={[s.activeChipLabel, { color: tierColor }]}>
                {subscription.plan_name} · {daysLeft}d left
              </Text>
              <TouchableOpacity onPress={handleCancel} disabled={cancelling} style={s.activeChipCancel}>
                <Ionicons name="close-circle" size={16} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          )}
        </LinearGradient>

        {/* ── Tier switcher ── */}
        <View style={[s.switcherWrap, { backgroundColor: isDark ? "#111" : "#f5f5f5" }]}>
          <View style={[s.switcher, { backgroundColor: isDark ? "#1E1E1E" : "#E8E8E8" }]}>
            {TIERS.map((tier) => {
              const tc = TIER_CONFIG[tier];
              const active = activeTier === tier;
              const isCurrent = isPremium && subscription?.plan_tier === tier;
              return (
                <Pressable
                  key={tier}
                  style={[
                    s.switcherItem,
                    active && [s.switcherItemActive, { backgroundColor: tc.color + "22", borderColor: tc.color }],
                  ]}
                  onPress={() => switchTier(tier)}
                >
                  <Text style={s.switcherEmoji}>{tc.emoji}</Text>
                  <Text style={[s.switcherLabel, { color: active ? tc.color : isDark ? "#888" : "#666" }]}>
                    {tc.badge}
                  </Text>
                  {isCurrent && <View style={[s.currentDot, { backgroundColor: tc.color }]} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Feature card ── */}
        <Animated.View style={{ opacity: fadeAnim, paddingHorizontal: 16, marginTop: 4 }}>
          {/* Price row */}
          <View style={[s.priceRow, { backgroundColor: isDark ? "#1A1A1A" : "#F8F8F8", borderColor: tierColor + "44" }]}>
            <View style={s.priceLeft}>
              <Text style={[s.priceAmount, { color: tierColor }]}>
                {selectedPlan?.acoin_price ?? FALLBACK_PRICES[activeTier]} ACoin
              </Text>
              <Text style={[s.priceDuration, { color: isDark ? "#777" : "#999" }]}>
                {"/ "}{selectedPlan ? durationLabel(selectedPlan.duration_days) : "30 days"}
              </Text>
            </View>
            <View style={s.priceRight}>
              <Text style={[s.priceEquiv, { color: isDark ? "#666" : "#aaa" }]}>{cfg?.usdEquiv}</Text>
              <Text style={[s.priceEquiv, { color: isDark ? "#555" : "#bbb" }]}>{cfg?.ugxEquiv}</Text>
            </View>
            {selectedPlan?.grants_verification && (
              <View style={[s.verifiedChip, { backgroundColor: tierColor + "18", borderColor: tierColor + "44" }]}>
                <Ionicons name="shield-checkmark" size={12} color={tierColor} />
                <Text style={[s.verifiedChipText, { color: tierColor }]}>Verified</Text>
              </View>
            )}
          </View>

          {/* Feature sections */}
          <View style={[s.featCard, { backgroundColor: isDark ? "#141414" : "#FAFAFA", borderColor: isDark ? "#2A2A2A" : "#EBEBEB" }]}>
            {cfg?.sections.map((section, si) => (
              <View key={si} style={[s.featSection, si > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isDark ? "#222" : "#E8E8E8", paddingTop: 14, marginTop: 4 }]}>
                <View style={s.featSectionHeader}>
                  <View style={[s.featSectionIcon, { backgroundColor: tierColor + "18" }]}>
                    <Ionicons name={section.icon as any} size={13} color={tierColor} />
                  </View>
                  <Text style={[s.featSectionTitle, { color: tierColor }]}>{section.title}</Text>
                </View>
                <View style={s.featItems}>
                  {section.items.map((item, ii) => (
                    <View key={ii} style={s.featItem}>
                      <View style={[s.checkDot, { backgroundColor: tierColor + "25" }]}>
                        <Ionicons name="checkmark" size={10} color={tierColor} />
                      </View>
                      <Text style={[s.featItemText, { color: isDark ? "#CCC" : "#333" }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* Wallet link */}
          <TouchableOpacity
            style={[s.walletRow, { backgroundColor: isDark ? "#1A1A1A" : "#F5F5F5", borderColor: isDark ? "#2A2A2A" : "#E5E5E5" }]}
            onPress={() => router.push("/wallet")}
            activeOpacity={0.7}
          >
            <Ionicons name="wallet-outline" size={16} color={colors.accent} />
            <Text style={[s.walletRowText, { color: isDark ? "#AAA" : "#555" }]}>
              Your balance: <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold" }}>{profile?.acoin ?? 0} ACoin</Text>
            </Text>
            <Ionicons name="chevron-forward" size={14} color={isDark ? "#555" : "#bbb"} />
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* ── Fixed navbar ── */}
      <View style={[s.navBar, { paddingTop: insets.top + 8, backgroundColor: "transparent", position: "absolute", top: 0, left: 0, right: 0 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.navTitle}>Premium</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* ── Sticky bottom CTA ── */}
      <View style={[s.ctaWrap, {
        paddingBottom: insets.bottom + 12,
        backgroundColor: isDark ? "#0D0D0D" : "#fff",
        borderTopColor: isDark ? "#222" : "#E5E5E5",
      }]}>
        {/* Cost breakdown (only when not on current plan) */}
        {selectedPlan && !isCurrentPlan && (
          <View style={[s.costRow, { borderColor: isDark ? "#222" : "#EEE" }]}>
            <View style={s.costItem}>
              <Text style={[s.costLabel, { color: isDark ? "#666" : "#999" }]}>Balance</Text>
              <Text style={[s.costVal, { color: isDark ? "#CCC" : "#333" }]}>{profile?.acoin ?? 0}</Text>
            </View>
            <Ionicons name="remove" size={14} color={isDark ? "#444" : "#ccc"} />
            <View style={s.costItem}>
              <Text style={[s.costLabel, { color: isDark ? "#666" : "#999" }]}>Cost</Text>
              <Text style={[s.costVal, { color: "#FF9500" }]}>{selectedPlan.acoin_price}</Text>
            </View>
            <Ionicons name="remove" size={14} color={isDark ? "#444" : "#ccc"} />
            <View style={s.costItem}>
              <Text style={[s.costLabel, { color: isDark ? "#666" : "#999" }]}>After</Text>
              <Text style={[s.costVal, { color: canAfford ? "#34C759" : "#FF3B30", fontFamily: "Inter_700Bold" }]}>
                {afterBalance}
              </Text>
            </View>
          </View>
        )}

        {isCurrentPlan ? (
          <View style={[s.currentPlanBar, { backgroundColor: tierColor + "18", borderColor: tierColor + "44" }]}>
            <Text style={s.currentPlanEmoji}>{cfg?.emoji}</Text>
            <Text style={[s.currentPlanText, { color: tierColor }]}>
              You're on {subscription?.plan_name} · {daysLeft} days remaining
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.cta, { backgroundColor: tierColor }, (subscribing || cancelling) && { opacity: 0.55 }]}
            onPress={handleSubscribe}
            disabled={subscribing || cancelling || !selectedPlan}
            activeOpacity={0.85}
          >
            {subscribing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="diamond" size={18} color="#fff" />
                <Text style={s.ctaText}>
                  {isSwitching
                    ? `Switch to ${cfg?.badge} · ${selectedPlan?.acoin_price} ACoin`
                    : `Get ${cfg?.badge} · ${selectedPlan?.acoin_price ?? FALLBACK_PRICES[activeTier]} ACoin`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {selectedPlan && !isCurrentPlan && (
          <Text style={[s.legal, { color: isDark ? "#444" : "#bbb" }]}>
            {isSwitching
              ? `Switching cancels your current plan immediately. No refund.`
              : `Access for ${durationLabel(selectedPlan.duration_days)}. ACoin deducted instantly.`}
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },

  /* Nav */
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
    zIndex: 10,
  },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: "#fff" },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Hero */
  hero: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 36,
    gap: 10,
    overflow: "hidden",
  },
  glowOrb: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -60,
    alignSelf: "center",
  },
  heroBadge: {
    width: 68,
    height: 68,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5 },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },

  /* Active chip */
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 6,
  },
  activeChipEmoji: { fontSize: 16 },
  activeChipLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  activeChipCancel: { padding: 2 },

  /* Tier switcher */
  switcherWrap: { paddingVertical: 14, paddingHorizontal: 16 },
  switcher: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  switcherItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
    gap: 3,
  },
  switcherItemActive: {},
  switcherEmoji: { fontSize: 20 },
  switcherLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.6 },
  currentDot: { width: 5, height: 5, borderRadius: 3, marginTop: 1 },

  /* Price row */
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    gap: 8,
  },
  priceLeft: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 6 },
  priceAmount: { fontSize: 22, fontFamily: "Inter_700Bold" },
  priceDuration: { fontSize: 13, fontFamily: "Inter_400Regular" },
  priceRight: { alignItems: "flex-end" },
  priceEquiv: { fontSize: 11, fontFamily: "Inter_400Regular" },
  verifiedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verifiedChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  /* Feature card */
  featCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 10,
    gap: 0,
  },
  featSection: { gap: 10 },
  featSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  featSectionIcon: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  featSectionTitle: { fontSize: 12, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  featItems: { gap: 8, paddingLeft: 4 },
  featItem: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", marginTop: 1 },
  featItemText: { fontSize: 13.5, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 20 },

  /* Wallet row */
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
  },
  walletRowText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },

  /* Bottom CTA */
  ctaWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 10,
    borderTopWidth: 1,
  },
  costRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    backgroundColor: "transparent",
  },
  costItem: { alignItems: "center", gap: 2 },
  costLabel: { fontSize: 10, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.5 },
  costVal: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  currentPlanBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  currentPlanEmoji: { fontSize: 20 },
  currentPlanText: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    borderRadius: 18,
  },
  ctaText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  legal: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },

  /* Loading */
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#555" },
});
