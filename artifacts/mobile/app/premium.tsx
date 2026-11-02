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
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GlassBackButton } from "@/components/ui/GlassBackButton";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { getSubscriptionPrice } from "@/lib/creatorEntitlements";

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

type TierCfg = {
  color: string;
  emoji: string;
  badge: string;
  tagline: string;
  sections: { icon: string; title: string; items: string[] }[];
};

const TIER_CONFIG: Record<string, TierCfg> = {
  free: {
    color: "#8D96A8",
    emoji: "○",
    badge: "FREE",
    tagline: "Core AfuChat access",
    sections: [
      { icon: "sparkles", title: "AfuAI", items: ["10 AI messages per day"] },
      { icon: "people", title: "Social", items: ["Buy usernames and music"] },
      { icon: "diamond", title: "Plan", items: ["No monthly charge"] },
    ],
  },
  silver: {
    color: "#8E9BB5",
    emoji: "✓",
    badge: "STANDARD",
    tagline: "Verified access for creators",
    sections: [
      {
        icon: "checkmark-circle-outline",
        title: "AfuAI",
        items: [
          "Unlimited AfuAI access",
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
          "Eligibility to sell one username",
          "Eligibility to sell music on AfuMusic",
          "Priority feed access",
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
    emoji: "★",
    badge: "PRO",
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
          "Message translation, voice-to-text and text-to-speech",
          "Chat folders, temporary chat, auto-reply and reminders",
          "Edit history and advanced reactions",
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
          "Red Envelope sends & claims",
          "Creator Studio: Monetise posts",
          "Eligibility to sell one username and music",
          "Prestige Status",
        ],
      },
      {
        icon: "diamond",
        title: "Perks",
        items: [
          "Verified Badge",
          "Ad-free experience",
          "Basic and custom chat themes",
          "Verified creator eligibility",
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
          "Everything in Pro",
          "Priority Support",
          "Early access to features",
          "Exclusive Platinum badge & ring",
        ],
      },
    ],
  },
};

const PAID_TIERS = ["silver", "gold", "platinum"] as const;

function durationLabel(days: number) {
  if (days >= 365) return `${Math.round(days / 365)} yr`;
  if (days >= 30) return `${Math.round(days / 30)} mo`;
  return `${days}d`;
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function PremiumScreen() {
  const { colors } = useTheme();
  const { profile, subscription, isPremium, refreshProfile, user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 720;
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeTier, setActiveTier] = useState<string>("free");
  const [loading, setLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const subscribeLockRef = useRef(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setPlansError(false);
    try {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, description, acoin_price, duration_days, grants_verification, tier")
        .eq("is_active", true)
        .order("acoin_price", { ascending: true });
      if (error) throw error;
      if (data) {
        const loadedPlans = data as Plan[];
        setPlans(loadedPlans);
        const ct = subscription?.plan_tier;
        setActiveTier(ct && TIER_CONFIG[ct] ? ct : "free");
      }
    } catch (error) {
      console.warn("[Premium] Could not load subscription plans:", error);
      setPlansError(true);
    } finally {
      setLoading(false);
    }
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
  const isCurrentPlan = activeTier === "free"
    ? !isPremium
    : isPremium && subscription?.plan_tier === activeTier;
  const isSwitching = isPremium && !isCurrentPlan && !!selectedPlan;
  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / 86400000))
    : 0;
  const acoinPrice = activeTier === "free"
    ? 0
    : getSubscriptionPrice(activeTier, selectedPlan?.acoin_price) ?? selectedPlan?.acoin_price ?? 0;
  const usdPrice = activeTier === "free" ? "$0" : fmtUSD(acoinPrice);
  const localPrice = activeTier === "free" ? null : localLine(acoinPrice, profile?.country);
  const tierOptions = subscription?.plan_tier === "platinum"
    ? ["free", ...PAID_TIERS]
    : ["free", "silver", "gold"];

  async function handleSubscribe() {
    if (subscribeLockRef.current || subscribing) return;
    if (activeTier === "free") {
      if (isPremium) void handleCancel();
      return;
    }
    if (!profile || !user || !selectedPlan) {
      showAlert("Plan unavailable", "This plan is not available right now. Try again later.");
      return;
    }
    const price = getSubscriptionPrice(activeTier, selectedPlan.acoin_price);
    if (price === null) {
      showAlert("Plan unavailable", "This plan has no valid price configured.");
      return;
    }
    if ((profile.acoin || 0) < price) {
      showAlert("Insufficient ACoin", `You need ${price} AC but have ${profile.acoin || 0}. Top up your wallet.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Top Up", onPress: () => router.push("/app/afupay?section=topup" as any) },
      ]);
      return;
    }
    subscribeLockRef.current = true;
    showAlert(
      isSwitching ? "Switch Plan" : "Confirm Subscription",
      isSwitching
        ? `Switch to ${cfg?.badge ?? selectedPlan.name} for ${price} AC?\nCurrent plan cancels immediately.`
        : `Subscribe to ${cfg?.badge ?? selectedPlan.name} for ${price} AC (${fmtUSD(price)}) for ${durationLabel(selectedPlan.duration_days)}.`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            subscribeLockRef.current = false;
            setSubscribing(false);
          },
        },
        {
          text: isSwitching ? "Switch" : "Subscribe",
          onPress: async () => {
            setSubscribing(true);
            let deducted = false;
            try {
              const { data: deduction, error: deductErr } = await supabase
                .rpc("deduct_acoin", { p_user_id: profile.id, p_amount: price })
                .maybeSingle();
              if (deductErr || (deduction as any)?.success !== true) {
                showAlert("Subscription not completed", (deduction as any)?.message || "Could not deduct ACoin. Check your balance and try again.");
                return;
              }
              deducted = true;
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + selectedPlan.duration_days);
              const { error: subErr } = await supabase.from("user_subscriptions").upsert({
                user_id: profile.id,
                plan_id: selectedPlan.id,
                started_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
                is_active: true,
                acoin_paid: price,
              }, { onConflict: "user_id" });
              if (subErr) {
                let refundError: unknown = null;
                try {
                  const result = await supabase.rpc("credit_acoin", { p_user_id: profile.id, p_amount: price });
                  refundError = result.error;
                } catch (error) {
                  refundError = error;
                }
                deducted = false;
                showAlert(
                  refundError ? "Subscription failed — refund not confirmed" : "Subscription not activated",
                  refundError
                    ? "The plan was not activated, and the wallet refund could not be confirmed. Check AfuPay before retrying."
                    : "The plan could not be activated. ACoin was refunded."
                );
                return;
              }
              deducted = false;
              const { error: ledgerError } = await supabase.from("acoin_transactions").insert({
                user_id: profile.id,
                amount: -price,
                transaction_type: isSwitching ? "subscription_switch" : "subscription",
                metadata: { plan_name: cfg?.badge ?? selectedPlan.name, plan_tier: selectedPlan.tier, duration_days: selectedPlan.duration_days },
              });
              let profileRefreshed = true;
              try {
                await refreshProfile();
              } catch {
                profileRefreshed = false;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showAlert(
                isSwitching ? "Plan switched" : `${cfg?.badge ?? selectedPlan.name} is active`,
                ledgerError || !profileRefreshed
                  ? `Your plan is active, but ${ledgerError ? "AfuPay could not record this transaction yet" : "your account balance or subscription status did not refresh"}.`
                  : `${cfg?.badge ?? selectedPlan.name} is active for ${durationLabel(selectedPlan.duration_days)}.`,
                [{ text: "Done", onPress: () => router.back() }]
              );
            } catch (error) {
              let refundFailed = false;
              if (deducted) {
                try {
                  const result = await supabase.rpc("credit_acoin", { p_user_id: profile.id, p_amount: price });
                  refundFailed = !!result.error;
                } catch {
                  refundFailed = true;
                }
              }
              showAlert(
                refundFailed ? "Subscription failed — refund not confirmed" : "Subscription not completed",
                refundFailed
                  ? "The subscription could not be completed, and the wallet refund could not be confirmed. Check AfuPay before retrying."
                  : error instanceof Error ? error.message : "The transaction could not be completed."
              );
            } finally {
              subscribeLockRef.current = false;
              setSubscribing(false);
            }
          },
        },
      ]
    );
    setSubscribing(true);
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
              { text: "OK", onPress: () => setActiveTier("free") },
            ]);
          },
        },
      ]
    );
  }

  const sep = colors.border;
  const cardBg = colors.inputBg;

  if (loading) {
    return (
      <View style={[s.flex, { backgroundColor: colors.background }]}>
        <View style={[s.nav, { paddingTop: topInset + 8, backgroundColor: colors.background, borderBottomColor: sep }]}>
          <GlassBackButton onPress={() => router.back()} style={s.backBtn} />
          <Text style={[s.navTitle, { color: colors.text }]}>Premium</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView
          style={s.flex}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[s.pageContent, isWide && s.pageContentWide]}>
            <View style={[s.loadingHero, { backgroundColor: cardBg, borderColor: sep }]}>
              <View style={[s.loadingMark, { backgroundColor: colors.accent + "18" }]}>
                <Ionicons name="diamond" size={24} color={colors.accent} />
              </View>
              <Text style={[s.heroTitle, { color: colors.text }]}>AfuChat Premium</Text>
              <Text style={[s.heroSub, { color: colors.textSecondary }]}>
                {"More tools and creator perks for the way you use AfuChat."}
              </Text>
            </View>
            <View style={[s.loadingCard, { backgroundColor: cardBg, borderColor: sep }]}>
              <View style={s.loadingHeader}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={[s.loadingText, { color: colors.text }]}>Loading plan options</Text>
              </View>
              <View style={[s.loadingLine, { backgroundColor: colors.surface }]} />
              <View style={[s.loadingLineShort, { backgroundColor: colors.surface }]} />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  const afterBalance = (profile?.acoin ?? 0) - acoinPrice;
  const canAfford = (profile?.acoin ?? 0) >= acoinPrice;

  return (
    <View style={[s.flex, { backgroundColor: colors.background }]}>
      {/* Nav */}
      <View style={[s.nav, { paddingTop: topInset + 8, backgroundColor: colors.background, borderBottomColor: sep }]}>
        <GlassBackButton onPress={() => router.back()} style={s.backBtn} />
        <Text style={[s.navTitle, { color: colors.text }]}>Premium</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.flex}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.pageContent, isWide && s.pageContentWide]}>
          {plansError ? (
            <View style={[s.errorCard, { backgroundColor: cardBg, borderColor: sep }]}>
              <View style={[s.errorIcon, { backgroundColor: colors.errorSubtle }]}>
                <Ionicons name="cloud-offline-outline" size={22} color={colors.error} />
              </View>
              <Text style={[s.errorTitle, { color: colors.text }]}>Plans didn’t load</Text>
              <Text style={[s.errorBody, { color: colors.textSecondary }]}>
                {"Check your connection and try again. Your account and wallet haven’t been changed."}
              </Text>
              <TouchableOpacity
                style={[s.retryButton, { backgroundColor: colors.accent }]}
                onPress={loadPlans}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Retry loading plans"
                testID="premium-retry-plans"
              >
                <Ionicons name="refresh" size={16} color={colors.bubbleText} />
                <Text style={s.retryButtonText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>

        {/* Hero */}
        <View style={[s.hero, { backgroundColor: cardBg, borderColor: sep }]}>
          <View style={s.heroHeading}>
            <View style={[s.tierPill, { backgroundColor: tierColor + "18", borderColor: tierColor + "44" }]}>
              <Text style={s.tierPillEmoji}>{cfg?.emoji}</Text>
              <Text style={[s.tierPillText, { color: colors.textSecondary }]}>{cfg?.badge}</Text>
            </View>
            <Text style={[s.heroTitle, { color: colors.text }]}>AfuChat Premium</Text>
            <Text style={[s.heroSub, { color: colors.textSecondary }]}>{cfg?.tagline}</Text>
          </View>
          {isPremium && subscription && (
            <View style={[s.activeBar, { backgroundColor: tierColor + "12", borderColor: tierColor + "33" }]}>
              <Ionicons name="shield-checkmark" size={14} color={tierColor} />
              <Text style={[s.activeBarTxt, { color: colors.text }]}>
                {TIER_CONFIG[subscription.plan_tier]?.badge ?? subscription.plan_name} · {daysLeft} days remaining
              </Text>
              <TouchableOpacity
                onPress={handleCancel}
                disabled={cancelling}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Cancel subscription"
              >
                <Text style={[s.cancelTxt, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Tier tabs */}
        <View style={[s.tabs, { backgroundColor: cardBg, borderColor: sep }]}>
          {tierOptions.map((tier) => {
            const tc = TIER_CONFIG[tier];
            const active = activeTier === tier;
            const isCurrent = tier === "free"
              ? !isPremium
              : isPremium && subscription?.plan_tier === tier;
            return (
              <Pressable
                key={tier}
                style={[
                  s.tab,
                  active && { backgroundColor: tc.color + "18", borderColor: tc.color + "44" },
                ]}
                onPress={() => switchTier(tier)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${tc.badge} plan${isCurrent ? ", current plan" : ""}`}
                testID={`premium-tier-${tier}`}
              >
                <Text style={s.tabEmoji}>{tc.emoji}</Text>
                <Text style={[s.tabLabel, { color: active ? colors.text : colors.textSecondary }]}>
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
                    <Text style={[s.durTxt, { color: colors.textSecondary }]}>
                      / {selectedPlan ? durationLabel(selectedPlan.duration_days) : activeTier === "free" ? "no charge" : "unavailable"}
                    </Text>
                  </View>
                </View>
                {/* USD + local currency */}
                <View style={s.equivRow}>
                <Text style={[s.usdTxt, { color: colors.textSecondary }]}>{usdPrice} USD</Text>
                  {localPrice ? (
                    <Text style={[s.localTxt, { color: colors.textSecondary }]}> · ≈ {localPrice}</Text>
                  ) : null}
                </View>
                <Text style={[s.rateNote, { color: colors.textMuted }]}>1 AC = $0.01</Text>
              </View>
              {["silver", "gold", "platinum"].includes(activeTier) && (
                <View style={[s.verBadge, { backgroundColor: tierColor + "15", borderColor: tierColor + "40" }]}>
                  <Ionicons name="shield-checkmark" size={13} color={tierColor} />
                  <Text style={[s.verTxt, { color: colors.textSecondary }]}>Verified</Text>
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
                  si > 0 && { borderTopColor: colors.border },
                ]}
              >
                <View style={s.featSecHead}>
                  <View style={[s.featIco, { backgroundColor: tierColor + "18" }]}>
                    <Ionicons name={sec.icon as any} size={12} color={tierColor} />
                  </View>
                  <Text style={[s.featSecTitle, { color: colors.text }]}>{sec.title}</Text>
                </View>
                <View style={s.featItems}>
                  {sec.items.map((item, ii) => (
                    <View key={ii} style={s.featItem}>
                      <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                      <Text style={[s.featItemTxt, { color: colors.textSecondary }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* Wallet link */}
          <TouchableOpacity
            style={[s.walletRow, { backgroundColor: cardBg, borderColor: sep }]}
            onPress={() => router.push("/app/afupay?section=topup" as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="wallet" size={15} color={colors.accent} />
            <Text style={[s.walletTxt, { color: colors.textSecondary }]}>
              {"Balance: "}
              <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold" }}>
                {profile?.acoin ?? 0} AC
              </Text>
              {"  "}
              <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular" }}>
                {fmtUSD(profile?.acoin ?? 0)}
              </Text>
            </Text>
            <Ionicons name="chevron-forward" size={13} color={colors.iconMuted} />
          </TouchableOpacity>

        </Animated.View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      {!plansError && (
      <View style={[s.cta, { paddingBottom: bottomInset + 14, backgroundColor: colors.background, borderTopColor: sep }]}>
        <View style={[s.ctaInner, isWide && s.pageContentWide]}>
        {activeTier !== "free" && selectedPlan && !isCurrentPlan && (
          <View style={[s.costRow, { borderColor: sep }]}>
            <View style={s.costCol}>
              <Text style={[s.costLbl, { color: colors.textMuted }]}>Balance</Text>
              <Text style={[s.costVal, { color: colors.text }]}>{profile?.acoin ?? 0}</Text>
            </View>
              <Text style={[s.costOp, { color: colors.textMuted }]}>to</Text>
            <View style={s.costCol}>
              <Text style={[s.costLbl, { color: colors.textMuted }]}>Cost</Text>
              <Text style={[s.costVal, { color: colors.warning }]}>{acoinPrice}</Text>
            </View>
              <Text style={[s.costOp, { color: colors.textMuted }]}>=</Text>
            <View style={s.costCol}>
              <Text style={[s.costLbl, { color: colors.textMuted }]}>After</Text>
              <Text style={[s.costVal, { color: canAfford ? colors.success : colors.error, fontFamily: "Inter_700Bold" }]}>
                {afterBalance}
              </Text>
            </View>
          </View>
        )}

        {isCurrentPlan ? (
          <View style={[s.currentBar, { backgroundColor: tierColor + "14", borderColor: tierColor + "33" }]}>
            <Text style={s.currentBarEmoji}>{cfg?.emoji}</Text>
            <Text style={[s.currentBarTxt, { color: colors.text }]}>
              {activeTier === "free" ? "You are on the Free plan" : `${cfg?.badge} · ${daysLeft} days remaining`}
            </Text>
          </View>
        ) : activeTier === "free" && isPremium ? (
          <TouchableOpacity
            style={[s.ctaBtn, { backgroundColor: colors.accent }, (subscribing || cancelling) && { opacity: 0.55 }]}
            onPress={handleCancel}
            disabled={subscribing || cancelling}
            activeOpacity={0.85}
            accessibilityRole="button"
            testID="premium-switch-free-cta"
          >
            <Text style={[s.ctaBtnTxt, { color: colors.bubbleText }]}>Switch to Free plan</Text>
          </TouchableOpacity>
        ) : selectedPlan ? (
          <TouchableOpacity
            style={[s.ctaBtn, { backgroundColor: colors.accent }, (subscribing || cancelling) && { opacity: 0.55 }]}
            onPress={handleSubscribe}
            disabled={subscribing || cancelling}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isSwitching ? `Switch to ${cfg?.badge}` : `Get ${cfg?.badge} for ${usdPrice}`}
            testID="premium-primary-cta"
          >
            {subscribing ? (
              <ActivityIndicator color={colors.bubbleText} size="small" />
            ) : (
              <>
                <Ionicons name="diamond" size={16} color={colors.bubbleText} />
                <Text style={[s.ctaBtnTxt, { color: colors.bubbleText }]}>
                  {isSwitching
                    ? `Switch to ${cfg?.badge} · ${acoinPrice} AC`
                    : `Get ${cfg?.badge} · ${usdPrice}`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[s.currentBar, { backgroundColor: cardBg, borderColor: sep }]}>
            <Text style={[s.currentBarTxt, { color: colors.textMuted }]}>This plan is not available for purchase right now.</Text>
          </View>
        )}

        {activeTier !== "free" && selectedPlan && !isCurrentPlan && (
          <Text style={[s.legal, { color: colors.textMuted }]}>
            {isSwitching
              ? "Switching cancels your current plan immediately. No refund."
              : `${acoinPrice} AC deducted instantly · access for ${durationLabel(selectedPlan.duration_days)}`}
          </Text>
        )}
      </View>
      </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },

  scrollContent: {
    alignItems: "center",
    paddingBottom: 20,
  },
  pageContent: {
    width: "100%",
    maxWidth: 760,
    paddingHorizontal: 16,
    gap: 12,
  },
  pageContentWide: {
    maxWidth: 820,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", letterSpacing: -0.3 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  loadingHero: {
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 30,
    alignItems: "center",
    gap: 10,
  },
  loadingMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  loadingCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  loadingHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingLine: { height: 12, width: "100%", borderRadius: 6, opacity: 0.65 },
  loadingLineShort: { height: 12, width: "62%", borderRadius: 6, opacity: 0.65 },
  errorCard: {
    marginTop: 20,
    borderRadius: 22,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  errorIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  errorTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  errorBody: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 420 },
  retryButton: { minHeight: 46, paddingHorizontal: 18, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  retryButtonText: { fontSize: 14, fontFamily: "Inter_700Bold" },

  hero: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 24,
    gap: 14,
    marginTop: 16,
  },
  heroHeading: { alignItems: "center", gap: 4 },
  heroSub: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center", maxWidth: 420 },
  heroTitle: { fontSize: 26, lineHeight: 32, fontFamily: "Inter_700Bold", letterSpacing: -0.6, textAlign: "center" },
  activeBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "stretch",
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
  activeBarTxt: { flex: 1, minWidth: 0, fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "left" },
  cancelTxt: { fontSize: 12, fontFamily: "Inter_400Regular" },

  tabs: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 72,
    paddingHorizontal: 2,
    paddingVertical: 9,
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabEmoji: { fontSize: 20 },
  tabLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5, textAlign: "center" },
  currentDot: { width: 5, height: 5, borderRadius: 3 },

  body: { paddingTop: 0, gap: 12 },

  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  priceTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  priceLeft: { flex: 1, minWidth: 0, gap: 5 },
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
  featSec: { padding: 18 },
  featSecHead: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 12 },
  featIco: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  featSecTitle: { flex: 1, minWidth: 0, fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.2, textAlign: "left" },
  featItems: { gap: 9, paddingLeft: 2 },
  featItem: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  featItemTxt: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1, minWidth: 0, lineHeight: 20, textAlign: "left" },

  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  walletTxt: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "left" },

  cta: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  ctaInner: {
    width: "100%",
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
  currentBarTxt: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1, minWidth: 0, textAlign: "left" },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 13,
  },
  ctaBtnTxt: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  legal: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
});
