import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

const PLANS = [
  { id: "monthly", label: "Monthly", price: "$4.99/mo", priceValue: 4.99, popular: false },
  { id: "yearly", label: "Yearly", price: "$39.99/yr", priceValue: 39.99, popular: true, savings: "Save 33%" },
];

const FEATURES = [
  { icon: "people-outline" as const, title: "Linked Accounts", desc: "Switch between multiple accounts seamlessly" },
  { icon: "shield-checkmark-outline" as const, title: "Verified Badge", desc: "Get a verified checkmark on your profile" },
  { icon: "color-palette-outline" as const, title: "Custom Themes", desc: "Exclusive themes and customizations" },
  { icon: "cloud-upload-outline" as const, title: "Extended Storage", desc: "10GB media storage for photos and files" },
  { icon: "megaphone-outline" as const, title: "Priority Support", desc: "Faster response times from our team" },
  { icon: "analytics-outline" as const, title: "Advanced Analytics", desc: "Detailed insights on your posts and reach" },
  { icon: "gift-outline" as const, title: "Exclusive Gifts", desc: "Access premium-only gift items" },
  { icon: "ban-outline" as const, title: "No Ads", desc: "Ad-free experience across the app" },
];

export default function PremiumScreen() {
  const { colors } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState("yearly");
  const [loading, setLoading] = useState(false);
  const isPremium = !!profile?.is_premium;

  async function handleSubscribe() {
    if (!profile) return;
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const { error } = await supabase
      .from("profiles")
      .update({ is_premium: true })
      .eq("id", profile.id);

    if (error) {
      Alert.alert("Error", "Could not activate premium. Please try again.");
    } else {
      await refreshProfile();
      Alert.alert("Welcome to Premium!", "Your AfuChat Premium subscription is now active. Enjoy all the exclusive features!", [
        { text: "Awesome!", onPress: () => router.back() },
      ]);
    }
    setLoading(false);
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
        <View style={styles.heroSection}>
          <View style={styles.heroIcon}>
            <Ionicons name="diamond" size={48} color="#FFD60A" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>AfuChat Premium</Text>
          <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
            Unlock the full power of AfuChat
          </Text>
        </View>

        {isPremium && (
          <View style={[styles.activeCard, { backgroundColor: Colors.brand + "15" }]}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.activeTitle, { color: Colors.brand }]}>Premium Active</Text>
              <Text style={[styles.activeSub, { color: colors.textSecondary }]}>You're enjoying all premium features</Text>
            </View>
          </View>
        )}

        <View style={styles.featuresSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>What you get</Text>
          {FEATURES.map((f, i) => (
            <View key={i} style={[styles.featureRow, { backgroundColor: colors.surface }]}>
              <View style={[styles.featureIcon, { backgroundColor: Colors.brand + "15" }]}>
                <Ionicons name={f.icon} size={20} color={Colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>{f.title}</Text>
                <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {!isPremium && (
          <>
            <View style={styles.plansSection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Choose your plan</Text>
              {PLANS.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[
                    styles.planCard,
                    { backgroundColor: colors.surface, borderColor: selectedPlan === plan.id ? Colors.brand : colors.border },
                  ]}
                  onPress={() => setSelectedPlan(plan.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.planRadio, selectedPlan === plan.id && styles.planRadioSelected]}>
                    {selectedPlan === plan.id && <View style={styles.planRadioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.planLabelRow}>
                      <Text style={[styles.planLabel, { color: colors.text }]}>{plan.label}</Text>
                      {plan.popular && (
                        <View style={styles.popularTag}>
                          <Text style={styles.popularTagText}>BEST VALUE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.planPrice, { color: colors.textSecondary }]}>{plan.price}</Text>
                    {plan.savings && <Text style={styles.planSavings}>{plan.savings}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.subscribeBtn, loading && { opacity: 0.6 }]}
              onPress={handleSubscribe}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Ionicons name="diamond" size={20} color="#000" />
              <Text style={styles.subscribeBtnText}>
                {loading ? "Activating..." : "Subscribe Now"}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.legalText, { color: colors.textMuted }]}>
              Cancel anytime. Subscription renews automatically unless cancelled 24 hours before the end of the current period.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { padding: 20, gap: 24 },
  heroSection: { alignItems: "center", paddingVertical: 20 },
  heroIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,214,10,0.1)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  heroTitle: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 8 },
  heroSub: { fontSize: 15, fontFamily: "Inter_400Regular" },
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
  planCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14, borderWidth: 2 },
  planRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#CCC", alignItems: "center", justifyContent: "center" },
  planRadioSelected: { borderColor: Colors.brand },
  planRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.brand },
  planLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planLabel: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  planPrice: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  planSavings: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#34C759", marginTop: 2 },
  popularTag: { backgroundColor: "#FFD60A", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  popularTagText: { color: "#000", fontSize: 10, fontFamily: "Inter_700Bold" },
  subscribeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FFD60A", height: 56, borderRadius: 16 },
  subscribeBtnText: { color: "#000", fontSize: 18, fontFamily: "Inter_700Bold" },
  legalText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
