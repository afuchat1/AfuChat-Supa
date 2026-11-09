import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";

// ── Currency helpers ─────────────────────────────────────────────────────────

const ACOIN_TO_USD = 0.01;

type FxEntry = { code: string; symbol: string; rate: number };

const FX: Record<string, FxEntry> = {
  UG: { code: "UGX", symbol: "USh", rate: 3700 },
  KE: { code: "KES", symbol: "KSh", rate: 130 },
  TZ: { code: "TZS", symbol: "TSh", rate: 2600 },
  NG: { code: "NGN", symbol: "₦", rate: 1550 },
  GH: { code: "GHS", symbol: "GH₵", rate: 15.5 },
  ZA: { code: "ZAR", symbol: "R", rate: 18.5 },
  GB: { code: "GBP", symbol: "£", rate: 0.79 },
  DE: { code: "EUR", symbol: "€", rate: 0.92 },
  FR: { code: "EUR", symbol: "€", rate: 0.92 },
  IT: { code: "EUR", symbol: "€", rate: 0.92 },
  ES: { code: "EUR", symbol: "€", rate: 0.92 },
  NL: { code: "EUR", symbol: "€", rate: 0.92 },
  IN: { code: "INR", symbol: "₹", rate: 83 },
  BR: { code: "BRL", symbol: "R$", rate: 5.0 },
  CA: { code: "CAD", symbol: "CA$", rate: 1.36 },
  AU: { code: "AUD", symbol: "A$", rate: 1.52 },
  JP: { code: "JPY", symbol: "¥", rate: 154 },
  CN: { code: "CNY", symbol: "¥", rate: 7.2 },
  RW: { code: "RWF", symbol: "Fr", rate: 1330 },
  ET: { code: "ETB", symbol: "Br", rate: 56 },
  SN: { code: "XOF", symbol: "Fr", rate: 600 },
  ZM: { code: "ZMW", symbol: "K", rate: 27 },
  MX: { code: "MXN", symbol: "MX$", rate: 17 },
  PK: { code: "PKR", symbol: "₨", rate: 278 },
  EG: { code: "EGP", symbol: "£", rate: 48 },
};

function fmtUSD(acoin: number): string {
  const usd = acoin * ACOIN_TO_USD;
  return `$${usd % 1 === 0 ? usd.toFixed(0) : usd.toFixed(2)}`;
}

function localLine(acoin: number, country?: string | null): string | null {
  if (!country) return null;
  const fx = FX[country.toUpperCase()];
  if (!fx) return null;
  const local = acoin * ACOIN_TO_USD * fx.rate;
  let s: string;
  if (local >= 1_000_000) s = `${(local / 1_000_000).toFixed(1)}M`;
  else if (local >= 10_000) s = `${Math.round(local / 1000)}K`;
  else if (local >= 1_000) s = local.toLocaleString(undefined, { maximumFractionDigits: 0 });
  else s = local.toLocaleString(undefined, { maximumFractionDigits: fx.rate < 5 ? 2 : 0 });
  return `${fx.symbol} ${s}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

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
  emoji: string;
  badge: string;
  tagline: string;
  sections: { icon: string; title: string; items: string[] }[];
};

const TIER_CONFIG: Record<string, TierCfg> = {
  silver: {
    color: "#8E9BB5",
    emoji: "🥈",
    badge: "SILVER",
    tagline: "Essential AI & privacy tools",
    sections: [
      {
        icon: "checkmark-circle-outline",
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
        items: ["Verified Badge", "Ad-free experience", "Basic chat themes"],
      },
    ],
  },
  gold: {
    color: "#C8923A",
    emoji: "🥇",
    badge: "GOLD",
    tagline: "Power tools for creators",
    sections: [
      {
        icon: "checkmark-circle-outline",
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
  "Creator Studio: Monetise posts",
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
    color: "#1018D8",
    emoji: "💎",
    badge: "PLATINUM",
    tagline: "Unlimited, elite, no limits",
    sections: [
      {
        icon: "checkmark-circle-outline",
        title: "Elite AI",
        items: [
          "Unlimited AI messages",
          "AI Themes & Wallpapers",
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
  if (days >= 365) return `${Math.round(days / 365)} yr`;
  if (days >= 30) return `${Math.round(days / 30)} mo`;
  return `${days}d`;
}

// ── Screen ───────────────────────────────────────────────────────────────────

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
      // Prices are authoritative in the database. Never patch or write them
      // from the client: doing so lets a stale client change billing data.
      const loadedPlans = data as Plan[];
      setPlans(loadedPlans);
      const ct = subscription?.plan_tier;
      setActiveTier(ct && TIER_CONFIG[ct] ? ct : "gold");
    }
    setLoading(false);
  }, [subscription]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  function switchTier(tier: string) {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 70, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
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
  const acoinPrice = selectedPlan?.acoin_price ?? 0;
  const usdPrice = fmtUSD(acoinPrice);
  const localPrice = localLine(acoinPrice, profile?.country);

  async function handleSubscribe() {
    if (!profile || !user || !selectedPlan) return;
    if ((profile.acoin || 0) < selectedPlan.acoin_price) {
      showAlert("Insufficient ACoin", `You need ${selectedPlan.acoin_price} AC but have ${profile.acoin || 0}. Top up your wallet.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Top Up", onPress: () => router.push("/app/afupay?section=topup" as any) },
      ]);
      return;
    }
    showAlert(
      isSwitching ? "Switch Plan" : "Confirm Subscription",
      isSwitching
        ? `Switch to ${selectedPlan.name} for ${acoinPrice} AC?\nCurrent plan cancels immediately.`
        : `Subscribe to ${selectedPlan.name} for ${acoinPrice} AC (${usdPrice}) for ${durationLabel(selectedPlan.duration_days)}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isSwitching ? "Switch" : "Subscribe",
          onPress: async () => {
            setSubscribing(true);
            const { error: deductErr } = await supabase
              .rpc("deduct_acoin", { p_user_id: profile.id, p_amount: selectedPlan.acoin_price })
              .maybeSingle();
            if (deductErr) {
              showAlert("Error", "Could not deduct ACoin. Check your balance.");
              setSubscribing(false);
              return;
            }
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + selectedPlan.duration_days);
            const { error: subErr } = await supabase.from("user_subscriptions").upsert({
              user_id: profile.id,
              plan_id: selectedPlan.id,
              started_at: new Date().toISOString(),
              expires_at: expiresAt.toISOString(),
              is_active: true,
              acoin_paid: selectedPlan.acoin_price,
            }, { onConflict: "user_id" });
            if (subErr) {
              await supabase.rpc("credit_acoin", { p_user_id: profile.id, p_amount: selectedPlan.acoin_price }).then(null, () => {});
              showAlert("Error", "Could not activate subscription. ACoin refunded.");
              setSubscribing(false);
              return;
            }
            await supabase.from("acoin_transactions").insert({
              user_id: profile.id,
              amount: -selectedPlan.acoin_price,
              transaction_type: isSwitching ? "subscription_switch" : "subscription",
              metadata: { plan_name: selectedPlan.name, plan_tier: selectedPlan.tier, duration_days: selectedPlan.duration_days },
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await refreshProfile();
            showAlert(
              isSwitching ? "Plan Switched!" : "Welcome to Premium! 🎉",
              `${selectedPlan.name} is active for ${durationLabel(selectedPlan.duration_days)}.`,
              [{ text: "Awesome!", onPress: () => router.back() }]
            );
            setSubscribing(false);
          },
        },
      ]
    );
  }

  async function handleCancel() {
    if (!user || !subscription) return;
    showAlert(
      "Cancel Subscription",
      `Cancel ${subscription.plan_name}?\n\nAccess ends immediately. No refund.`,
      [
        { text: "Keep Plan", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            const { error } = await supabase.rpc("cancel_my_subscription");
            if (error) { showAlert("Error", error.message); setCancelling(false); return; }
            await supabase.from("acoin_transactions").insert({
              user_id: user.id,
              amount: 0,
              transaction_type: "subscription_cancelled",
              metadata: { plan_name: subscription.plan_name, plan_tier: subscription.plan_tier },
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await refreshProfile();
            setCancelling(false);
            showAlert("Cancelled", "You are now on the free plan.", [
              { text: "OK", onPress: () => setActiveTier("gold") },
            ]);
          },
        },
      ]
    );
  }

  const sep = isDark ? "#232323" : "#EBEBEB";
  const cardBg = isDark ? "#161616" : "#FAFAFA";

  if (loading) {
    return (
      <View style={[s.flex, { backgroundColor: colors.background }]}>
        <View style={[s.nav, { paddingTop: insets.top + 8, borderBottomColor: sep }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.accent} />
          </TouchableOpacity>
          <Text style={[s.navTitle, { color: colors.text }]}>Premium</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.loadingWrap}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[s.loadingText, { color: colors.textMuted }]}>Loading plans…</Text>
        </View>
      </View>
    );
  }

  const afterBalance = (profile?.acoin ?? 0) - acoinPrice;
  const canAfford = (profile?.acoin ?? 0) >= acoinPrice;

  return (
    <View style={[s.flex, { backgroundColor: colors.background }]}>
      {/* Nav */}
      <View style={[s.nav, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: sep }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: colors.text }]}>Premium</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 220 }} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={[s.hero, { borderBottomColor: sep }]}>
          <View style={[s.tierPill, { backgroundColor: tierColor + "18", borderColor: tierColor + "44" }]}>
            <Text style={s.tierPillEmoji}>{cfg?.emoji}</Text>
            <Text style={[s.tierPillText, { color: tierColor }]}>{cfg?.badge}</Text>
          </View>
          <Text style={[s.heroTitle, { color: colors.text }]}>AfuChat Premium</Text>
          <Text style={[s.heroSub, { color: colors.textMuted }]}>{cfg?.tagline}</Text>

          {isPremium && subscription && (
            <View style={[s.activeBar, { backgroundColor: tierColor + "12", borderColor: tierColor + "33" }]}>
              <Ionicons name="shield-checkmark" size={13} color={tierColor} />
              <Text style={[s.activeBarTxt, { color: tierColor }]}>
                {TIER_CONFIG[subscription.plan_tier]?.badge ?? subscription.plan_name} · {daysLeft}d left
              </Text>
              <TouchableOpacity onPress={handleCancel} disabled={cancelling} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Text style={[s.cancelTxt, { color: isDark ? "#666" : "#bbb" }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Tier tabs */}
        <View style={[s.tabs, { borderBottomColor: sep }]}>
          {TIERS.map((tier) => {
            const tc = TIER_CONFIG[tier];
            const active = activeTier === tier;
            const isCurrent = isPremium && subscription?.plan_tier === tier;
            return (
              <Pressable
                key={tier}
                style={[s.tab, active && { borderBottomColor: tc.color, borderBottomWidth: 2 }]}
                onPress={() => switchTier(tier)}
              >
                <Text style={s.tabEmoji}>{tc.emoji}</Text>
                <Text style={[s.tabLabel, { color: active ? tc.color : (isDark ? "#555" : "#bbb") }]}>
                  {tc.badge}
                </Text>
                {isCurrent && <View style={[s.currentDot, { backgroundColor: tc.color }]} />}
              </Pressable>
            );
          })}
        </View>

        <Animated.View style={[s.body, { opacity: fadeAnim }]}>

          {/* Price card */}
          <View style={[s.card, { backgroundColor: cardBg, borderColor: sep }]}>
            <View style={s.priceTopRow}>
              <View style={s.priceLeft}>
                {/* Big ACoin number */}
                <View style={s.priceMainRow}>
                  <Text style={[s.priceNum, { color: colors.text }]}>{acoinPrice}</Text>
                  <Text style={[s.priceUnit, { color: colors.textMuted }]}>AC</Text>
                  <View style={[s.durPill, { backgroundColor: tierColor + "18" }]}>
                    <Text style={[s.durTxt, { color: tierColor }]}>
                      / {selectedPlan ? durationLabel(selectedPlan.duration_days) : "30 mo"}
                    </Text>
                  </View>
                </View>
                {/* USD + local currency */}
                <View style={s.equivRow}>
                  <Text style={[s.usdTxt, { color: isDark ? "#AAA" : "#555" }]}>{usdPrice} USD</Text>
                  {localPrice ? (
                    <Text style={[s.localTxt, { color: isDark ? "#666" : "#aaa" }]}> · ≈ {localPrice}</Text>
                  ) : null}
                </View>
                <Text style={[s.rateNote, { color: isDark ? "#444" : "#ccc" }]}>1 AC = $0.01</Text>
              </View>
              {selectedPlan?.grants_verification && (
                <View style={[s.verBadge, { backgroundColor: tierColor + "15", borderColor: tierColor + "40" }]}>
                  <Ionicons name="shield-checkmark" size={13} color={tierColor} />
                  <Text style={[s.verTxt, { color: tierColor }]}>Verified</Text>
                </View>
              )}
            </View>
          </View>

          {/* Features */}
          <View style={[s.card, s.featCard, { backgroundColor: cardBg, borderColor: sep }]}>
            {cfg?.sections.map((sec, si) => (
              <View
                key={si}
                style={[
                  s.featSec,
                  si > 0 && {  borderTopColor: isDark ? "#222" : "#E8E8E8" },
                ]}
              >
                <View style={s.featSecHead}>
                  <View style={[s.featIco, { backgroundColor: tierColor + "18" }]}>
                    <Ionicons name={sec.icon as any} size={12} color={tierColor} />
                  </View>
                  <Text style={[s.featSecTitle, { color: tierColor }]}>{sec.title}</Text>
                </View>
                <View style={s.featItems}>
                  {sec.items.map((item, ii) => (
                    <View key={ii} style={s.featItem}>
                      <Ionicons name="checkmark-circle" size={15} color={tierColor + "CC"} />
                      <Text style={[s.featItemTxt, { color: isDark ? "#C0C0C0" : "#333" }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* Wallet link */}
          <TouchableOpacity
            style={[s.walletRow, { borderColor: sep }]}
            onPress={() => router.push("/app/afupay?section=topup" as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="wallet" size={15} color={colors.accent} />
            <Text style={[s.walletTxt, { color: colors.textMuted }]}>
              Balance:{" "}
              <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold" }}>
                {profile?.acoin ?? 0} AC
              </Text>
              {"  "}
              <Text style={{ color: isDark ? "#666" : "#aaa", fontFamily: "Inter_400Regular" }}>
                {fmtUSD(profile?.acoin ?? 0)}
              </Text>
            </Text>
            <Ionicons name="chevron-forward" size={13} color={isDark ? "#555" : "#ccc"} />
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[s.cta, { paddingBottom: insets.bottom + 14, backgroundColor: colors.background, borderTopColor: sep }]}>
        {selectedPlan && !isCurrentPlan && (
          <View style={[s.costRow, { borderColor: sep }]}>
            <View style={s.costCol}>
              <Text style={[s.costLbl, { color: colors.textMuted }]}>Balance</Text>
              <Text style={[s.costVal, { color: colors.text }]}>{profile?.acoin ?? 0}</Text>
            </View>
            <Text style={[s.costOp, { color: isDark ? "#3A3A3A" : "#ddd" }]}>to</Text>
            <View style={s.costCol}>
              <Text style={[s.costLbl, { color: colors.textMuted }]}>Cost</Text>
              <Text style={[s.costVal, { color: "#FF9500" }]}>{acoinPrice}</Text>
            </View>
            <Text style={[s.costOp, { color: isDark ? "#3A3A3A" : "#ddd" }]}>=</Text>
            <View style={s.costCol}>
              <Text style={[s.costLbl, { color: colors.textMuted }]}>After</Text>
              <Text style={[s.costVal, { color: canAfford ? "#34C759" : "#FF3B30", fontFamily: "Inter_700Bold" }]}>
                {afterBalance}
              </Text>
            </View>
          </View>
        )}

        {isCurrentPlan ? (
          <View style={[s.currentBar, { backgroundColor: tierColor + "14", borderColor: tierColor + "33" }]}>
            <Text style={s.currentBarEmoji}>{cfg?.emoji}</Text>
            <Text style={[s.currentBarTxt, { color: tierColor }]}>
              {subscription?.plan_name} · {daysLeft} days remaining
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.ctaBtn, { backgroundColor: tierColor }, (subscribing || cancelling) && { opacity: 0.55 }]}
            onPress={handleSubscribe}
            disabled={subscribing || cancelling || !selectedPlan}
            activeOpacity={0.85}
          >
            {subscribing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="diamond" size={16} color="#fff" />
                <Text style={s.ctaBtnTxt}>
                  {isSwitching
                    ? `Switch to ${cfg?.badge} · ${acoinPrice} AC`
                    : `Get ${cfg?.badge} · ${usdPrice}`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {selectedPlan && !isCurrentPlan && (
          <Text style={[s.legal, { color: isDark ? "#444" : "#bbb" }]}>
            {isSwitching
              ? "Switching cancels your current plan immediately. No refund."
              : `${acoinPrice} AC deducted instantly · access for ${durationLabel(selectedPlan.duration_days)}`}
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },

  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 10,
    
    zIndex: 10,
  },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", letterSpacing: -0.3 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  hero: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 4,
    
  },
  tierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 12,
  },
  tierPillEmoji: { fontSize: 16 },
  tierPillText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.4 },
  heroTitle: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.6 },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" },

  activeBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "stretch",
  },
  activeBarTxt: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  cancelTxt: { fontSize: 12, fontFamily: "Inter_400Regular" },

  tabs: {
    flexDirection: "row",
    
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabEmoji: { fontSize: 20 },
  tabLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.9 },
  currentDot: { width: 5, height: 5, borderRadius: 3 },

  body: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },

  card: {
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 18,
  },
  priceTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  priceLeft: { flex: 1, gap: 5 },
  priceMainRow: { flexDirection: "row", alignItems: "baseline", gap: 5, flexWrap: "wrap" },
  priceNum: { fontSize: 40, fontFamily: "Inter_700Bold", letterSpacing: -1.5 },
  priceUnit: { fontSize: 20, fontFamily: "Inter_400Regular", marginBottom: 2 },
  durPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 4,
    alignSelf: "center",
  },
  durTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  equivRow: { flexDirection: "row", alignItems: "center" },
  usdTxt: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  localTxt: { fontSize: 14, fontFamily: "Inter_400Regular" },
  rateNote: { fontSize: 11, fontFamily: "Inter_400Regular" },
  verBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    marginLeft: 12,
  },
  verTxt: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  featCard: { padding: 0, overflow: "hidden" },
  featSec: { padding: 16 },
  featSecHead: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 12 },
  featIco: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  featSecTitle: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },
  featItems: { gap: 9, paddingLeft: 2 },
  featItem: { flexDirection: "row", alignItems: "center", gap: 9 },
  featItemTxt: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 20 },

  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 0.5,
  },
  walletTxt: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },

  cta: {
    
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  costRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderRadius: 10,
  },
  costCol: { alignItems: "center", gap: 2, minWidth: 60 },
  costLbl: { fontSize: 11, fontFamily: "Inter_400Regular" },
  costVal: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  costOp: { fontSize: 20, fontFamily: "Inter_300Light" },
  currentBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
  },
  currentBarEmoji: { fontSize: 22 },
  currentBarTxt: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 13,
  },
  ctaBtnTxt: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  legal: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
});
