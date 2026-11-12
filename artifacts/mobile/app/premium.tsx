import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
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
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { getSubscriptionPrice } from "@/lib/creatorEntitlements";
import {
  ActiveBanner,
  CostSummary,
  CtaBackdrop,
  FeatureCard,
  FloatingNav,
  PerkStrip,
  PlanHero,
  PremiumSkeleton,
  TierBackdrop,
  TierTabs,
  TrustLine,
  WalletCard,
  lighten,
  makePalette,
  readableTint,
  shade,
  type IconName,
  type TierTab,
} from "@/components/premium/PlanComponents";

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
  sections: { icon: string; title: string; items: string[] }[];
};

const TIER_CONFIG: Record<string, TierCfg> = {
  free: {
    color: "#10B981",
    emoji: "○",
    badge: "FREE",
    sections: [
      { icon: "sparkles", title: "AfuAI", items: ["10 AI messages per day"] },
      { icon: "people", title: "Social", items: ["Buy usernames and music"] },
      { icon: "diamond", title: "Plan", items: ["No monthly charge"] },
    ],
  },
  silver: {
    color: "#2F6BFF",
    emoji: "✓",
    badge: "STANDARD",
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
    color: "#FF8A1F",
    emoji: "★",
    badge: "PRO",
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
    color: "#9B4DFF",
    emoji: "💎",
    badge: "PLATINUM",
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

/** Presentation-only metadata (hero gradient runs deep at the top to bright at the bottom). */
const TIER_UI: Record<string, { icon: IconName; tagline: string; stops: string[] }> = {
  free: { icon: "leaf", tagline: "Get started", stops: ["#04281F", "#0B7A62", "#5EEAD4"] },
  silver: { icon: "shield-checkmark", tagline: "Everyday essentials", stops: ["#061641", "#1D5BE0", "#7DB8FF"] },
  gold: { icon: "star", tagline: "For power users and creators", stops: ["#331302", "#B8500A", "#FFB347"] },
  platinum: { icon: "diamond", tagline: "The complete AfuChat", stops: ["#220851", "#6D28D9", "#F472B6"] },
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
  const slideAnim = useRef(new Animated.Value(0)).current;
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
    if (tier === activeTier) return;
    slideAnim.setValue(12);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 70, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
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

  // ── Presentation ───────────────────────────────────────────────────────────

  const pal = makePalette(colors);
  const tint = readableTint(tierColor, colors.background);
  const ui = TIER_UI[activeTier] ?? TIER_UI.free;
  const navTop = topInset + 8;
  const heroTop = topInset + 64;
  // Full-page backdrop: deep at the top; light lavender (light theme) or deep (dark theme) below.
  const pageStops = pal.isDark
    ? [ui.stops[0], shade(ui.stops[1], 0.45), shade(ui.stops[0], 0.15)]
    : [ui.stops[0], ui.stops[1], lighten(ui.stops[2], 0.82)];

  if (loading) {
    return (
      <View style={[s.flex, { backgroundColor: colors.background }]}>
        <TierBackdrop stops={pageStops} />
        <FloatingNav top={navTop} title="Premium" onBack={() => router.back()} colors={colors} />
        <ScrollView
          style={s.flex}
          contentContainerStyle={[s.scrollContent, { paddingTop: topInset + 72 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[s.pageContent, isWide && s.pageContentWide]}>
            <PremiumSkeleton pal={pal} />
          </View>
        </ScrollView>
      </View>
    );
  }

  const balance = profile?.acoin ?? 0;
  const afterBalance = balance - acoinPrice;
  const canAfford = balance >= acoinPrice;

  const tabs: TierTab[] = tierOptions.map((tier) => {
    const tc = TIER_CONFIG[tier];
    const plan = plans.find((p) => p.tier === tier);
    const tabPrice = tier === "free"
      ? 0
      : getSubscriptionPrice(tier, plan?.acoin_price) ?? plan?.acoin_price ?? null;
    return {
      id: tier,
      label: tc.badge,
      icon: (TIER_UI[tier] ?? TIER_UI.free).icon,
      color: readableTint(tc.color, colors.background),
      accent: tc.color,
      priceLabel: tier === "free" ? "Free" : tabPrice === null ? "—" : `${tabPrice} AC`,
      isCurrent: tier === "free" ? !isPremium : isPremium && subscription?.plan_tier === tier,
    };
  });

  const perDay = selectedPlan && activeTier !== "free" && selectedPlan.duration_days > 0
    ? (() => {
        const v = acoinPrice / selectedPlan.duration_days;
        return `${v >= 10 ? Math.round(v) : v.toFixed(1)} AC a day`;
      })()
    : null;
  const featureCount = (cfg?.sections ?? []).reduce((n, sec) => n + sec.items.length, 0);
  const ctaBusy = subscribing || cancelling;

  return (
    <View style={[s.flex, { backgroundColor: colors.background }]}>
      <TierBackdrop stops={pageStops} />
      <FloatingNav top={navTop} title="Premium" onBack={() => router.back()} colors={colors} />

      <ScrollView
        style={s.flex}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {plansError ? (
          <View style={[s.pageContent, isWide && s.pageContentWide, { paddingTop: topInset + 72 }]}>
            <View style={[s.errorCard, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
              <View style={[s.errorIcon, { backgroundColor: colors.errorSubtle }]}>
                <Ionicons name="cloud-offline-outline" size={24} color={colors.error} />
              </View>
              <Text style={[s.errorTitle, { color: pal.text }]}>Plans unavailable</Text>
              <Text style={[s.errorSub, { color: pal.textSecondary }]}>
                Check your connection and try again.
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
                <Text style={[s.retryButtonText, { color: colors.bubbleText }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <Animated.View style={[s.heroWrap, { opacity: fadeAnim }]}>
              <PlanHero
                top={heroTop}
                stops={ui.stops}
                icon={ui.icon}
                badge={cfg?.badge ?? ""}
                tagline={ui.tagline}
                acoin={acoinPrice}
                usd={usdPrice}
                local={localPrice}
                duration={
                  selectedPlan
                    ? durationLabel(selectedPlan.duration_days)
                    : activeTier === "free"
                      ? "no charge"
                      : "unavailable"
                }
                perDay={perDay}
                verified={["silver", "gold", "platinum"].includes(activeTier)}
                isCurrent={isCurrentPlan}
              />
            </Animated.View>

            <View style={[s.pageContent, isWide && s.pageContentWide, s.afterHero]}>
              <TierTabs tabs={tabs} activeId={activeTier} onSelect={switchTier} pal={pal} />

              {isPremium && subscription && (
                <ActiveBanner
                  pal={pal}
                  tint={readableTint(
                    TIER_CONFIG[subscription.plan_tier]?.color ?? colors.accent,
                    colors.background
                  )}
                  label={TIER_CONFIG[subscription.plan_tier]?.badge ?? subscription.plan_name}
                  daysLeft={daysLeft}
                  cancelling={cancelling}
                  onCancel={handleCancel}
                />
              )}

              <Animated.View
                style={[s.body, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
              >
                <PerkStrip pal={pal} sections={cfg?.sections ?? []} count={featureCount} />

                <FeatureCard pal={pal} sections={cfg?.sections ?? []} tierKey={activeTier} />

                <WalletCard
                  pal={pal}
                  balance={balance}
                  usd={fmtUSD(balance)}
                  onPress={() => router.push("/app/afupay?section=topup" as any)}
                />
              </Animated.View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Sticky CTA */}
      {!plansError && (
        <View
          style={[
            s.cta,
            { paddingBottom: bottomInset + 14, backgroundColor: pal.bar, borderTopColor: pal.cardBorder },
          ]}
        >
          <View style={[s.ctaInner, isWide && s.pageContentWide]}>
            {activeTier !== "free" && selectedPlan && !isCurrentPlan && (
              <CostSummary
                pal={pal}
                balance={balance}
                cost={acoinPrice}
                after={afterBalance}
                canAfford={canAfford}
              />
            )}

            {isCurrentPlan ? (
              <View style={[s.currentBar, { backgroundColor: tint + "1F", borderColor: tint + "55" }]}>
                <Ionicons name={ui.icon} size={20} color={tint} />
                <Text style={[s.currentBarTxt, { color: pal.text }]}>
                  {`Current plan · ${cfg?.badge}`}
                </Text>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              </View>
            ) : activeTier === "free" && isPremium ? (
              <TouchableOpacity
                style={[s.ctaBtn, ctaBusy && { opacity: 0.55 }]}
                onPress={handleCancel}
                disabled={ctaBusy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Switch to Free plan"
                testID="premium-switch-free-cta"
              >
                <CtaBackdrop color={colors.accent} />
                <Text style={[s.ctaBtnTxt, { color: colors.bubbleText }]}>Switch to Free plan</Text>
              </TouchableOpacity>
            ) : selectedPlan ? (
              <TouchableOpacity
                style={[s.ctaBtn, ctaBusy && { opacity: 0.55 }]}
                onPress={handleSubscribe}
                disabled={ctaBusy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={isSwitching ? `Switch to ${cfg?.badge}` : `Get ${cfg?.badge} for ${usdPrice}`}
                accessibilityState={{ disabled: ctaBusy, busy: subscribing }}
                testID="premium-primary-cta"
              >
                <CtaBackdrop color={colors.accent} />
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
                    <Ionicons name="arrow-forward" size={16} color={colors.bubbleText} />
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={[s.currentBar, { backgroundColor: pal.card, borderColor: pal.cardBorder }]}>
                <Text style={[s.currentBarTxt, { color: pal.textMuted }]}>Unavailable for purchase</Text>
              </View>
            )}

            {!isCurrentPlan && activeTier !== "free" && selectedPlan && (
              <TrustLine pal={pal} text="Paid securely from your ACoin wallet" />
            )}

            {isSwitching && activeTier !== "free" && selectedPlan && (
              <Text style={[s.legal, { color: pal.textMuted }]}>
                {"Current plan ends immediately · no refund"}
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
    paddingBottom: 28,
  },
  heroWrap: { width: "100%" },
  afterHero: { marginTop: -44, zIndex: 5 },
  pageContent: {
    width: "100%",
    maxWidth: 760,
    paddingHorizontal: 16,
    gap: 14,
  },
  pageContentWide: {
    maxWidth: 820,
  },
  body: { gap: 14 },

  errorCard: {
    marginTop: 20,
    borderRadius: 22,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  errorIcon: { width: 56, height: 56, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  errorTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  errorSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryButton: {
    minHeight: 48,
    paddingHorizontal: 22,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  retryButtonText: { fontSize: 14, fontFamily: "Inter_700Bold" },

  cta: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaInner: {
    width: "100%",
    gap: 10,
  },
  currentBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
  },
  currentBarTxt: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1, minWidth: 0, textAlign: "left" },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 56,
    paddingVertical: 15,
    borderRadius: 18,
    overflow: "hidden",
  },
  ctaBtnTxt: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  legal: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
});
