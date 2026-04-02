import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import Colors from "@/constants/colors";
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

const TIER_CONFIG: Record<string, {
  color: string;
  gradientFrom: string;
  icon: string;
  badge: string;
  categories: { title: string; icon: string; items: string[] }[];
}> = {
  silver: {
    color: "#8E9BAD",
    gradientFrom: "#8E9BAD22",
    icon: "🥈",
    badge: "SILVER",
    categories: [
      {
        title: "AI Features",
        icon: "sparkles",
        items: [
          "Message Translation — instant AI translation",
          "Voice to Text — transcribe voice notes",
          "Smart Notifications — AI importance filter",
        ],
      },
      {
        title: "Chat Tools",
        icon: "chatbubbles",
        items: [
          "Smart Chat Folders",
          "Temporary Chat Mode (auto-delete)",
          "Auto-Reply Mode",
          "Focus Mode",
          "Activity Status Control",
          "Auto Media Organisation",
          "Advanced Emoji Reactions",
          "Content Filter",
          "Message Reminders",
          "Message Edit History",
          "Chat → Post",
        ],
      },
      {
        title: "Premium Perks",
        icon: "diamond",
        items: [
          "Verified Badge",
          "Ad-free experience",
          "Basic chat themes",
          "Pin 1 gift on profile",
          "1 red envelope claim per day",
        ],
      },
    ],
  },
  gold: {
    color: "#D4A853",
    gradientFrom: "#D4A85322",
    icon: "🥇",
    badge: "GOLD",
    categories: [
      {
        title: "All Silver Features",
        icon: "checkmark-circle",
        items: ["Everything in Silver, plus:"],
      },
      {
        title: "Advanced AI",
        icon: "sparkles",
        items: [
          "Chat Summary — AI conversation summaries",
          "AI Post Analysis",
          "Scheduled Focus Mode",
          "Link → Mini App (Beta)",
        ],
      },
      {
        title: "Power Chat Tools",
        icon: "construct",
        items: [
          "Keyword Alerts",
          "Chat Export (PDF / TXT / JSON)",
          "Cross-Device Sync",
          "Split Screen Mode (Web)",
          "Screen Share in Chat (Web)",
          "Group Roles System",
          "Create Stories & Groups",
        ],
      },
      {
        title: "Premium Perks",
        icon: "diamond",
        items: [
          "Custom chat themes",
          "Pin 2 gifts on profile",
          "5 red envelope claims per day",
        ],
      },
    ],
  },
  platinum: {
    color: "#00BCD4",
    gradientFrom: "#00BCD422",
    icon: "💎",
    badge: "PLATINUM",
    categories: [
      {
        title: "All Gold Features",
        icon: "checkmark-circle",
        items: ["Everything in Gold, plus:"],
      },
      {
        title: "Elite Perks",
        icon: "trophy",
        items: [
          "AfuAI Chat Assistant (enhanced)",
          "AI Chat Themes & Wallpapers",
          "Create Channels",
          "Create Red Envelopes",
          "Gift Marketplace access",
          "Unlimited red envelope claims",
          "Leaderboard privacy",
          "Priority support",
        ],
      },
    ],
  },
};

export default function PremiumScreen() {
  const { colors } = useTheme();
  const { profile, subscription, isPremium, refreshProfile, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expandedTier, setExpandedTier] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    const { data } = await supabase
      .from("subscription_plans")
      .select("id, name, description, acoin_price, duration_days, grants_verification, tier")
      .eq("is_active", true)
      .order("acoin_price", { ascending: true });
    if (data) {
      setPlans(data as Plan[]);
      if (data.length > 0 && !selectedPlanId) {
        const currentPlanInList = subscription ? data.find((p) => p.id === subscription.plan_id) : null;
        const defaultPlan = currentPlanInList ?? (data.length > 1 ? data[Math.floor(data.length / 2)] : data[0]);
        setSelectedPlanId(defaultPlan.id);
      }
    }
    setLoading(false);
  }, [subscription]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  async function handleSubscribe() {
    if (!profile || !user || !selectedPlanId) return;
    const plan = plans.find((p) => p.id === selectedPlanId);
    if (!plan) return;

    if ((profile.acoin || 0) < plan.acoin_price) {
      showAlert("Insufficient ACoin", `You need ${plan.acoin_price} ACoin but only have ${profile.acoin || 0}. Go to Wallet to top up.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Go to Wallet", onPress: () => router.push("/wallet") },
      ]);
      return;
    }

    const isSwitching = isPremium && subscription?.plan_id !== plan.id;
    const title = isSwitching ? "Switch Plan" : "Confirm Subscription";
    const message = isSwitching
      ? `Switch from ${subscription?.plan_name} to ${plan.name} for ${plan.acoin_price} ACoin?\nYour current plan cancels immediately and the new ${plan.duration_days}-day plan starts now.`
      : `Subscribe to ${plan.name} for ${plan.acoin_price} ACoin?\nDuration: ${plan.duration_days} days`;
    const actionLabel = isSwitching ? "Switch Plan" : "Subscribe";

    showAlert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: actionLabel,
        onPress: async () => {
          setSubscribing(true);
          const { error: deductError } = await supabase
            .from("profiles")
            .update({ acoin: (profile.acoin || 0) - plan.acoin_price })
            .eq("id", profile.id)
            .gte("acoin", plan.acoin_price);

          if (deductError) {
            showAlert("Error", "Could not deduct ACoin. Please try again.");
            setSubscribing(false);
            return;
          }

          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + plan.duration_days);

          const { error: subError } = await supabase.from("user_subscriptions").upsert({
            user_id: profile.id,
            plan_id: plan.id,
            started_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            is_active: true,
            acoin_paid: plan.acoin_price,
          }, { onConflict: "user_id" });

          if (subError) {
            await supabase.from("profiles").update({ acoin: profile.acoin || 0 }).eq("id", profile.id);
            showAlert("Error", "Could not activate subscription. Your ACoin has been refunded.");
            setSubscribing(false);
            return;
          }

          await supabase.from("acoin_transactions").insert({
            user_id: profile.id,
            amount: -plan.acoin_price,
            transaction_type: isSwitching ? "subscription_switch" : "subscription",
            metadata: { plan_name: plan.name, plan_tier: plan.tier, duration_days: plan.duration_days, previous_plan: subscription?.plan_name },
          });

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await refreshProfile();
          showAlert(
            isSwitching ? "Plan Switched!" : "Welcome to Premium!",
            `Your ${plan.name} subscription is now active for ${plan.duration_days} days.`,
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
      `Cancel your ${subscription.plan_name} plan?\n\nYou lose access to premium features immediately. Unused days are non-refundable.`,
      [
        { text: "Keep Plan", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            // Call the SECURITY DEFINER RPC — bypasses RLS entirely.
            // Requires running the cancel_my_subscription() SQL in Supabase dashboard.
            const { error } = await supabase.rpc("cancel_my_subscription");

            if (error) {
              showAlert("Cancel Error", `Code: ${error.code}\n${error.message}`);
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
              { text: "OK", onPress: () => setSelectedPlanId(plans[0]?.id ?? null) },
            ]);
          },
        },
      ]
    );
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const daysLeft = subscription ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / 86400000)) : 0;
  const isViewingCurrentPlan = isPremium && selectedPlan && subscription?.plan_id === selectedPlan.id;
  const isSwitching = isPremium && selectedPlan && subscription?.plan_id !== selectedPlan.id;

  function durationLabel(days: number) {
    if (days >= 365) return `${Math.round(days / 365)} year`;
    if (days >= 30) return `${Math.round(days / 30)} months`;
    return `${days} days`;
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Premium</Text>
          <View style={{ width: 24 }} />
        </View>
        <ActivityIndicator color={colors.accent} style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Premium</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroBadge, { backgroundColor: colors.accent + "18" }]}>
            <Image source={afuSymbol} style={{ width: 36, height: 36, tintColor: colors.accent }} resizeMode="contain" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>AfuChat Premium</Text>
          <Text style={[styles.heroSub, { color: colors.textMuted }]}>
            Unlock AI-powered features, exclusive perks, and more
          </Text>
        </View>

        {/* Active subscription card */}
        {isPremium && subscription && (
          <View style={[styles.activeCard, { backgroundColor: colors.surface, borderColor: TIER_CONFIG[subscription.plan_tier]?.color ?? colors.accent }]}>
            <View style={[styles.activeCardTop, { backgroundColor: (TIER_CONFIG[subscription.plan_tier]?.color ?? colors.accent) + "18" }]}>
              <Text style={styles.activePlanEmoji}>{TIER_CONFIG[subscription.plan_tier]?.icon ?? "💎"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.activePlanName, { color: TIER_CONFIG[subscription.plan_tier]?.color ?? colors.accent }]}>
                  {subscription.plan_name}
                </Text>
                <Text style={[styles.activePlanSub, { color: colors.textSecondary }]}>
                  Active plan
                </Text>
              </View>
              <View style={[styles.daysChip, { backgroundColor: (TIER_CONFIG[subscription.plan_tier]?.color ?? colors.accent) + "22" }]}>
                <Text style={[styles.daysChipText, { color: TIER_CONFIG[subscription.plan_tier]?.color ?? colors.accent }]}>
                  {daysLeft}d left
                </Text>
              </View>
            </View>
            <View style={styles.activeCardBottom}>
              <Text style={[styles.activeCardMeta, { color: colors.textMuted }]}>
                Expires {new Date(subscription.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {"  ·  "}{subscription.acoin_paid} ACoin paid
              </Text>
              <TouchableOpacity onPress={handleCancel} disabled={cancelling} style={styles.cancelBtn}>
                <Ionicons name="close-circle-outline" size={13} color="#FF3B30" />
                <Text style={styles.cancelBtnText}>{cancelling ? "Cancelling…" : "Cancel plan"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Plan cards */}
        <Text style={[styles.sectionLabel, { color: colors.text }]}>Choose a Plan</Text>
        {plans.map((plan) => {
          const cfg = TIER_CONFIG[plan.tier];
          const tierColor = cfg?.color ?? colors.accent;
          const isSelected = selectedPlanId === plan.id;
          const isCurrentPlan = isPremium && subscription?.plan_id === plan.id;
          const isExpanded = expandedTier === plan.tier;

          return (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                { backgroundColor: colors.surface, borderColor: isSelected ? tierColor : colors.border },
              ]}
            >
              {/* Plan header row */}
              <TouchableOpacity
                style={styles.planHeader}
                onPress={() => {
                  setSelectedPlanId(plan.id);
                  setExpandedTier(isExpanded ? null : plan.tier);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.planRadio, { borderColor: isSelected ? tierColor : colors.border }]}>
                  {isSelected && <View style={[styles.planRadioDot, { backgroundColor: tierColor }]} />}
                </View>
                <Text style={styles.planEmoji}>{cfg?.icon ?? "⭐"}</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.planLabelRow}>
                    <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
                    {isCurrentPlan && (
                      <View style={[styles.badge, { backgroundColor: tierColor }]}>
                        <Text style={styles.badgeText}>CURRENT</Text>
                      </View>
                    )}
                    {plan.tier === "gold" && !isCurrentPlan && (
                      <View style={[styles.badge, { backgroundColor: "#FFD60A" }]}>
                        <Text style={[styles.badgeText, { color: "#1C1C1E" }]}>POPULAR</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.planPrice, { color: tierColor }]}>
                    {plan.acoin_price} ACoin
                    <Text style={[styles.planDuration, { color: colors.textMuted }]}>
                      {"  /"} {durationLabel(plan.duration_days)}
                    </Text>
                  </Text>
                </View>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={colors.textMuted}
                />
              </TouchableOpacity>

              {/* Feature list (expanded) */}
              {isExpanded && cfg && (
                <View style={[styles.featureList, { borderTopColor: colors.border }]}>
                  {cfg.categories.map((cat, ci) => (
                    <View key={ci} style={styles.featureCategory}>
                      <View style={styles.featureCatHeader}>
                        <Ionicons name={cat.icon as any} size={13} color={tierColor} />
                        <Text style={[styles.featureCatTitle, { color: tierColor }]}>{cat.title}</Text>
                      </View>
                      {cat.items.map((item, ii) => (
                        <View key={ii} style={styles.featureRow}>
                          <Ionicons name="checkmark" size={13} color={tierColor} style={{ marginTop: 1 }} />
                          <Text style={[styles.featureText, { color: colors.textSecondary }]}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                  {plan.grants_verification && (
                    <View style={styles.verifiedRow}>
                      <Ionicons name="shield-checkmark" size={14} color={tierColor} />
                      <Text style={[styles.verifiedText, { color: tierColor }]}>Includes Verified Badge</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Tap to expand hint */}
              {!isExpanded && (
                <TouchableOpacity
                  style={[styles.expandHint, { borderTopColor: colors.border }]}
                  onPress={() => { setSelectedPlanId(plan.id); setExpandedTier(plan.tier); }}
                >
                  <Text style={[styles.expandHintText, { color: tierColor }]}>View all features</Text>
                  <Ionicons name="chevron-down" size={12} color={tierColor} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Cost summary + action button — only when a different plan is selected */}
        {selectedPlan && !isViewingCurrentPlan && (
          <View style={styles.actionArea}>
            <View style={[styles.costCard, { backgroundColor: colors.surface }]}>
              <View style={styles.costRow}>
                <Text style={[styles.costLabel, { color: colors.textSecondary }]}>Your ACoin balance</Text>
                <Text style={[styles.costValue, { color: colors.text }]}>{profile?.acoin ?? 0}</Text>
              </View>
              <View style={[styles.costDivider, { backgroundColor: colors.border }]} />
              <View style={styles.costRow}>
                <Text style={[styles.costLabel, { color: colors.textSecondary }]}>Plan cost</Text>
                <Text style={[styles.costValue, { color: "#FF9500" }]}>−{selectedPlan.acoin_price}</Text>
              </View>
              <View style={[styles.costDivider, { backgroundColor: colors.border }]} />
              <View style={styles.costRow}>
                <Text style={[styles.costLabel, { color: colors.text, fontFamily: "Inter_600SemiBold" }]}>Balance after</Text>
                <Text style={[styles.costValue, {
                  color: (profile?.acoin ?? 0) >= selectedPlan.acoin_price ? "#34C759" : "#FF3B30",
                  fontFamily: "Inter_700Bold",
                }]}>
                  {(profile?.acoin ?? 0) - selectedPlan.acoin_price}
                </Text>
              </View>
              {isSwitching && (
                <>
                  <View style={[styles.costDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.costRow}>
                    <Text style={[styles.costLabel, { color: colors.textMuted }]}>Current plan</Text>
                    <Text style={[styles.costValue, { color: "#FF3B30", fontSize: 13 }]}>Cancelled immediately</Text>
                  </View>
                </>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.subscribeBtn,
                { backgroundColor: TIER_CONFIG[selectedPlan.tier]?.color ?? colors.accent },
                (subscribing || cancelling) && { opacity: 0.6 },
              ]}
              onPress={handleSubscribe}
              disabled={subscribing || cancelling}
              activeOpacity={0.85}
            >
              <Ionicons name="diamond" size={18} color="#fff" />
              <Text style={styles.subscribeBtnText}>
                {subscribing
                  ? "Processing…"
                  : isSwitching
                    ? `Switch to ${selectedPlan.name} · ${selectedPlan.acoin_price} ACoin`
                    : `Subscribe · ${selectedPlan.acoin_price} ACoin`}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.legal, { color: colors.textMuted }]}>
              {isSwitching
                ? `Switching cancels your current plan with no refund. The new ${durationLabel(selectedPlan.duration_days)} plan starts immediately.`
                : `Access lasts ${durationLabel(selectedPlan.duration_days)}. ACoin deducted immediately. Top up in Wallet.`}
            </Text>
          </View>
        )}

        {/* Wallet shortcut */}
        <TouchableOpacity style={[styles.walletRow, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push("/wallet")}>
          <Ionicons name="wallet-outline" size={18} color={colors.accent} />
          <Text style={[styles.walletText, { color: colors.text }]}>Manage ACoin in Wallet</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { padding: 16, gap: 16, paddingBottom: 60 },

  /* Hero */
  hero: { alignItems: "center", paddingVertical: 20, gap: 10 },
  heroBadge: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, paddingHorizontal: 24 },

  /* Active card */
  activeCard: { borderRadius: 16, borderWidth: 1.5, overflow: "hidden" },
  activeCardTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  activePlanEmoji: { fontSize: 28 },
  activePlanName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  activePlanSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  daysChip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  daysChipText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  activeCardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  activeCardMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cancelBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  cancelBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#FF3B30" },

  /* Plan cards */
  sectionLabel: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 4 },
  planCard: { borderRadius: 16, borderWidth: 1.5, overflow: "hidden" },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  planRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  planRadioDot: { width: 10, height: 10, borderRadius: 5 },
  planEmoji: { fontSize: 22 },
  planLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  planName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  planPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
  planDuration: { fontSize: 13, fontFamily: "Inter_400Regular" },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  /* Feature list */
  featureList: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 14 },
  featureCategory: { gap: 6 },
  featureCatHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  featureCatTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingLeft: 4 },
  featureText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, paddingLeft: 4 },
  verifiedText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  expandHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  expandHintText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  /* Cost summary + action */
  actionArea: { gap: 12 },
  costCard: { borderRadius: 14, padding: 16, gap: 10 },
  costRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  costLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  costValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  costDivider: { height: StyleSheet.hairlineWidth },
  subscribeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 16 },
  subscribeBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  legal: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },

  /* Wallet row */
  walletRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  walletText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
});
