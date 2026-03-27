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
import { PremiumSkeleton } from "@/components/ui/Skeleton";

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
  features: string[];
  grants_verification: boolean;
  tier: string;
};

const FREE_FEATURES = [
  { icon: "chatbubble-outline" as const, title: "Unlimited Messaging", desc: "Send messages to anyone" },
  { icon: "people-outline" as const, title: "Group Chats", desc: "Create and join group chats" },
  { icon: "images-outline" as const, title: "Stories", desc: "Share moments with followers" },
  { icon: "sparkles-outline" as const, title: "AfuAi (Basic)", desc: "Basic AI chat assistant" },
  { icon: "newspaper-outline" as const, title: "Feed & Posts", desc: "Share and discover content" },
];

const TIER_COLORS: Record<string, string> = {
  free: "#8E8E93",
  silver: "#C0C0C0",
  gold: "#D4A853",
  platinum: "#00C2CB",
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

  const loadPlans = useCallback(async () => {
    const { data } = await supabase
      .from("subscription_plans")
      .select("id, name, description, acoin_price, duration_days, features, grants_verification, tier")
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
      showAlert("Insufficient ACoin", `You need ${plan.acoin_price} ACoin but only have ${profile.acoin || 0}. Go to Wallet to convert Nexa to ACoin.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Go to Wallet", onPress: () => router.push("/wallet") },
      ]);
      return;
    }

    const isSwitching = isPremium && subscription?.plan_id !== plan.id;
    const title = isSwitching ? "Switch Plan" : "Confirm Subscription";
    const message = isSwitching
      ? `Switch from ${subscription?.plan_name} to ${plan.name} for ${plan.acoin_price} ACoin?\nYour current plan will be cancelled immediately and the new ${plan.duration_days}-day plan starts now.`
      : `Subscribe to ${plan.name} for ${plan.acoin_price} ACoin?\nDuration: ${plan.duration_days} days`;
    const actionLabel = isSwitching ? "Switch Plan" : "Subscribe";

    showAlert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: actionLabel,
        onPress: async () => {
          setSubscribing(true);
          const newBalance = (profile.acoin || 0) - plan.acoin_price;

          const { error: deductError } = await supabase.from("profiles").update({
            acoin: newBalance,
          }).eq("id", profile.id).gte("acoin", plan.acoin_price);

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
          const successTitle = isSwitching ? "Plan Switched!" : "Welcome to Premium!";
          const successMsg = `Your ${plan.name} subscription is now active for ${plan.duration_days} days.`;
          showAlert(successTitle, successMsg, [{ text: "Awesome!", onPress: () => router.back() }]);
          setSubscribing(false);
        },
      },
    ]);
  }

  async function handleCancel() {
    if (!user || !subscription) return;
    showAlert(
      "Cancel Subscription",
      `Are you sure you want to cancel your ${subscription.plan_name} plan?\n\nYou will lose access to premium features immediately. Unused days are non-refundable.`,
      [
        { text: "Keep Subscription", style: "cancel" },
        {
          text: "Cancel Subscription",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            await supabase.from("user_subscriptions").update({ is_active: false }).eq("user_id", user.id);
            await supabase.from("acoin_transactions").insert({
              user_id: user.id,
              amount: 0,
              transaction_type: "subscription_cancelled",
              metadata: { plan_name: subscription.plan_name, plan_tier: subscription.plan_tier },
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await refreshProfile();
            setCancelling(false);
            showAlert("Subscription Cancelled", "Your subscription has been cancelled. You are now on the free plan.", [
              { text: "OK", onPress: () => setSelectedPlanId(plans[0]?.id ?? null) },
            ]);
          },
        },
      ]
    );
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const daysLeft = subscription ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Premium</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <PremiumSkeleton />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.heroSection}>
            <Image source={afuSymbol} style={{ width: 72, height: 72, marginBottom: 16, tintColor: Colors.brand }} resizeMode="contain" />
            <Text style={[styles.heroTitle, { color: colors.text }]}>AfuChat Premium</Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
              Pay with ACoin to unlock premium features
            </Text>
          </View>

          {isPremium && subscription && (
            <View style={[styles.activeCard, { backgroundColor: Colors.brand + "15" }]}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.activeTitle, { color: Colors.brand }]}>
                  {subscription.plan_name} Active
                </Text>
                <Text style={[styles.activeSub, { color: colors.textSecondary }]}>
                  {daysLeft} days remaining · Tier: {subscription.plan_tier}
                </Text>
                <Text style={[styles.activeSub, { color: colors.textMuted }]}>
                  Paid {subscription.acoin_paid} ACoin
                </Text>
                <TouchableOpacity
                  style={styles.cancelLink}
                  onPress={handleCancel}
                  disabled={cancelling}
                >
                  <Ionicons name="close-circle-outline" size={14} color="#FF3B30" />
                  <Text style={styles.cancelLinkText}>
                    {cancelling ? "Cancelling…" : "Cancel subscription"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.featuresSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Free Features</Text>
            {FREE_FEATURES.map((f, i) => (
              <View key={i} style={[styles.featureRow, { backgroundColor: colors.surface }]}>
                <View style={[styles.featureIcon, { backgroundColor: "#8E8E9315" }]}>
                  <Ionicons name={f.icon} size={20} color="#8E8E93" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.featureTitle, { color: colors.text }]}>{f.title}</Text>
                  <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{f.desc}</Text>
                </View>
                <Ionicons name="checkmark" size={18} color="#34C759" />
              </View>
            ))}
          </View>

          {plans.length > 0 && (
            <View style={styles.plansSection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Premium Plans (ACoin)</Text>
              {plans.map((plan) => {
                const tierColor = TIER_COLORS[plan.tier] || Colors.brand;
                const isSelected = selectedPlanId === plan.id;
                const isCurrentPlan = isPremium && subscription?.plan_id === plan.id;
                return (
                  <TouchableOpacity
                    key={plan.id}
                    style={[
                      styles.planCard,
                      { backgroundColor: colors.surface, borderColor: isSelected ? tierColor : colors.border },
                    ]}
                    onPress={() => setSelectedPlanId(plan.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.planRadio, isSelected && { borderColor: tierColor }]}>
                      {isSelected && <View style={[styles.planRadioDot, { backgroundColor: tierColor }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.planLabelRow}>
                        <Text style={[styles.planLabel, { color: colors.text }]}>{plan.name}</Text>
                        {isCurrentPlan && (
                          <View style={[styles.currentTag, { backgroundColor: tierColor }]}>
                            <Text style={styles.currentTagText}>CURRENT</Text>
                          </View>
                        )}
                        {plan.tier === "gold" && !isCurrentPlan && (
                          <View style={[styles.popularTag, { backgroundColor: "#FFD60A" }]}>
                            <Text style={styles.popularTagText}>POPULAR</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.planPrice, { color: colors.textSecondary }]}>
                        {plan.acoin_price} ACoin · {plan.duration_days} days
                      </Text>
                      {plan.description && (
                        <Text style={[styles.planDesc, { color: colors.textMuted }]}>{plan.description}</Text>
                      )}
                      {plan.features && plan.features.length > 0 && (
                        <View style={styles.planFeatures}>
                          {(plan.features as string[]).slice(0, 4).map((feat, i) => (
                            <View key={i} style={styles.planFeatureRow}>
                              <Ionicons name="checkmark-circle" size={14} color={tierColor} />
                              <Text style={[styles.planFeatureText, { color: colors.textSecondary }]}>{feat}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {plan.grants_verification && (
                        <View style={styles.planFeatureRow}>
                          <Ionicons name="shield-checkmark" size={14} color={Colors.gold} />
                          <Text style={[styles.planFeatureText, { color: Colors.gold }]}>Verified Badge</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {selectedPlan && !(isPremium && subscription?.plan_id === selectedPlan.id) && (
            <>
              <View style={[styles.costSummary, { backgroundColor: colors.surface }]}>
                <View style={styles.costRow}>
                  <Text style={[styles.costLabel, { color: colors.textSecondary }]}>Your ACoin Balance</Text>
                  <Text style={[styles.costValue, { color: colors.text }]}>{profile?.acoin || 0}</Text>
                </View>
                <View style={[styles.costDivider, { backgroundColor: colors.border }]} />
                <View style={styles.costRow}>
                  <Text style={[styles.costLabel, { color: colors.textSecondary }]}>Plan Cost</Text>
                  <Text style={[styles.costValue, { color: "#FF9500" }]}>-{selectedPlan.acoin_price}</Text>
                </View>
                <View style={[styles.costDivider, { backgroundColor: colors.border }]} />
                <View style={styles.costRow}>
                  <Text style={[styles.costLabel, { color: colors.text, fontFamily: "Inter_600SemiBold" }]}>Remaining</Text>
                  <Text style={[styles.costValue, { color: (profile?.acoin || 0) >= selectedPlan.acoin_price ? "#34C759" : "#FF3B30", fontFamily: "Inter_700Bold" }]}>
                    {(profile?.acoin || 0) - selectedPlan.acoin_price}
                  </Text>
                </View>
                {isPremium && (
                  <>
                    <View style={[styles.costDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.costRow}>
                      <Text style={[styles.costLabel, { color: colors.textSecondary }]}>Current plan cancelled</Text>
                      <Text style={[styles.costValue, { color: "#FF3B30" }]}>Immediately</Text>
                    </View>
                  </>
                )}
              </View>

              <TouchableOpacity
                style={[styles.subscribeBtn, (subscribing || cancelling) && { opacity: 0.6 }]}
                onPress={handleSubscribe}
                disabled={subscribing || cancelling}
                activeOpacity={0.85}
              >
                <Ionicons name="diamond" size={20} color="#1C1C1E" />
                <Text style={styles.subscribeBtnText}>
                  {subscribing
                    ? "Processing..."
                    : isPremium
                      ? `Switch to ${selectedPlan.name} · ${selectedPlan.acoin_price} ACoin`
                      : `Subscribe for ${selectedPlan.acoin_price} ACoin`}
                </Text>
              </TouchableOpacity>

              <Text style={[styles.legalText, { color: colors.textMuted }]}>
                {isPremium
                  ? `Switching cancels your current plan immediately with no refund. The new ${selectedPlan.duration_days}-day plan activates at once.`
                  : `Subscription lasts ${selectedPlan.duration_days} days. ACoin will be deducted from your wallet immediately. Convert Nexa to ACoin in the Wallet.`}
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { padding: 20, gap: 24, paddingBottom: 60 },
  heroSection: { alignItems: "center", paddingVertical: 20 },
  heroTitle: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 8 },
  heroSub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  activeCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 14 },
  activeTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  activeSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 12 },
  featuresSection: { gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12 },
  featureIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  featureDesc: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  plansSection: { gap: 10 },
  planCard: { padding: 16, borderRadius: 14, borderWidth: 2, flexDirection: "row", gap: 14, alignItems: "flex-start" },
  planRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#CCC", alignItems: "center", justifyContent: "center", marginTop: 2 },
  planRadioDot: { width: 12, height: 12, borderRadius: 6 },
  planLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planLabel: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  planPrice: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  planDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  planFeatures: { marginTop: 8, gap: 4 },
  planFeatureRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  planFeatureText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  popularTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  popularTagText: { color: "#1C1C1E", fontSize: 10, fontFamily: "Inter_700Bold" },
  currentTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  currentTagText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  costSummary: { padding: 16, borderRadius: 14, gap: 8 },
  costRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  costLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  costValue: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  costDivider: { height: StyleSheet.hairlineWidth },
  subscribeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FFD60A", height: 56, borderRadius: 16 },
  subscribeBtnText: { color: "#1C1C1E", fontSize: 18, fontFamily: "Inter_700Bold" },
  legalText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  cancelLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  cancelLinkText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#FF3B30" },
});
