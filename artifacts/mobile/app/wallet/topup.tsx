import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { WebView } from "react-native-webview";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

const PESAPAL_AMOUNTS = [
  { label: "500 Nexa", nexa: 500, price: 5, currency: "USD" },
  { label: "1,500 Nexa", nexa: 1500, price: 12, currency: "USD" },
  { label: "5,000 Nexa", nexa: 5000, price: 35, currency: "USD" },
  { label: "15,000 Nexa", nexa: 15000, price: 90, currency: "USD" },
  { label: "50,000 Nexa", nexa: 50000, price: 250, currency: "USD" },
];

type TopUpStage = "select" | "processing" | "payment" | "success";

export default function TopUpScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [stage, setStage] = useState<TopUpStage>("select");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  async function initiatePayment() {
    const pack = selectedPack !== null ? PESAPAL_AMOUNTS[selectedPack] : null;
    const customNexa = customAmount ? parseInt(customAmount) : 0;

    if (!pack && (!customNexa || customNexa < 100)) {
      showAlert("Select amount", "Please select a package or enter at least 100 Nexa.");
      return;
    }

    const nexaAmount = pack ? pack.nexa : customNexa;
    const priceUsd = pack ? pack.price : Math.ceil(customNexa * 0.007 * 100) / 100;

    setProcessing(true);
    Haptics.selectionAsync();

    try {
      const apiBase = process.env.EXPO_PUBLIC_API_URL || `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";
      const response = await fetch(`${apiBase}/api/payments/pesapal/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          user_id: user?.id,
          email: user?.email,
          nexa_amount: nexaAmount,
          price_usd: priceUsd,
          first_name: profile?.display_name?.split(" ")[0] || "User",
          last_name: profile?.display_name?.split(" ").slice(1).join(" ") || "",
        }),
      });

      const data = await response.json();

      if (data.redirect_url) {
        setPaymentUrl(data.redirect_url);
        setStage("payment");
      } else {
        showAlert("Error", data.error || "Failed to initiate payment. Please try again.");
      }
    } catch (err) {
      showAlert("Error", "Network error. Please check your connection and try again.");
    }

    setProcessing(false);
  }

  function handleWebViewNavigation(url: string) {
    if (url.includes("/payments/pesapal/success") || url.includes("status=completed")) {
      setStage("success");
      refreshProfile();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (url.includes("/payments/pesapal/cancel") || url.includes("status=cancelled")) {
      setStage("select");
      showAlert("Cancelled", "Payment was cancelled.");
    }
  }

  if (stage === "payment" && paymentUrl) {
    if (Platform.OS === "web") {
      return (
        <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setStage("select")}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Complete Payment</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
            <Ionicons name="open-outline" size={48} color={Colors.brand} />
            <Text style={[styles.webPayText, { color: colors.text }]}>Payment page opened</Text>
            <Text style={[styles.webPaySub, { color: colors.textMuted }]}>
              Complete your payment in the new tab. Return here when done.
            </Text>
            <TouchableOpacity
              style={styles.openBtn}
              onPress={() => { window.open(paymentUrl, "_blank"); }}
            >
              <Text style={styles.openBtnText}>Open Payment Page</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStage("select"); refreshProfile(); }}>
              <Text style={[styles.doneLink, { color: Colors.brand }]}>I've completed payment</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setStage("select")}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Complete Payment</Text>
          <View style={{ width: 24 }} />
        </View>
        <WebView
          source={{ uri: paymentUrl }}
          style={{ flex: 1 }}
          onNavigationStateChange={(navState) => handleWebViewNavigation(navState.url)}
          startInLoadingState
          renderLoading={() => <ActivityIndicator color={Colors.brand} style={{ flex: 1 }} />}
        />
      </View>
    );
  }

  if (stage === "success") {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, justifyContent: "center", alignItems: "center", padding: 40 }]}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={80} color="#34C759" />
        </View>
        <Text style={[styles.successTitle, { color: colors.text }]}>Top Up Successful!</Text>
        <Text style={[styles.successSub, { color: colors.textMuted }]}>
          Your Nexa balance has been updated. It may take a moment to reflect.
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
          <Text style={styles.doneBtnText}>Back to Wallet</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Top Up Nexa</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.balanceCard, { backgroundColor: Colors.brand }]}>
          <Ionicons name="flash" size={28} color="rgba(255,255,255,0.9)" />
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceValue}>{profile?.xp || 0} Nexa</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SELECT PACKAGE</Text>

        {PESAPAL_AMOUNTS.map((pack, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.packCard,
              { backgroundColor: colors.surface, borderColor: selectedPack === i ? Colors.brand : "transparent" },
            ]}
            onPress={() => { setSelectedPack(i); setCustomAmount(""); Haptics.selectionAsync(); }}
          >
            <View style={styles.packLeft}>
              <Ionicons name="flash" size={20} color="#FFD60A" />
              <Text style={[styles.packLabel, { color: colors.text }]}>{pack.label}</Text>
            </View>
            <View style={styles.packRight}>
              <Text style={[styles.packPrice, { color: Colors.brand }]}>${pack.price}</Text>
              {selectedPack === i && <Ionicons name="checkmark-circle" size={20} color={Colors.brand} />}
            </View>
          </TouchableOpacity>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 16 }]}>OR ENTER CUSTOM AMOUNT</Text>
        <View style={[styles.customRow, { backgroundColor: colors.surface }]}>
          <TextInput
            style={[styles.customInput, { color: colors.text }]}
            placeholder="Enter Nexa amount (min. 100)"
            placeholderTextColor={colors.textMuted}
            value={customAmount}
            onChangeText={(v) => { setCustomAmount(v); setSelectedPack(null); }}
            keyboardType="numeric"
          />
          {customAmount ? (
            <Text style={[styles.customPrice, { color: Colors.brand }]}>
              ${Math.ceil(parseInt(customAmount || "0") * 0.007 * 100) / 100}
            </Text>
          ) : null}
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.brand} />
          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            Payments are processed securely through Pesapal. Supports M-Pesa, Visa, Mastercard, and more.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.payBtn, (processing || (selectedPack === null && !customAmount)) && { opacity: 0.5 }]}
          onPress={initiatePayment}
          disabled={processing || (selectedPack === null && !customAmount)}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card-outline" size={20} color="#fff" />
              <Text style={styles.payBtnText}>Pay with Pesapal</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  balanceCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  balanceLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  balanceValue: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff" },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginLeft: 4, marginTop: 8 },
  packCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
  },
  packLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  packLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  packRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  packPrice: { fontSize: 18, fontFamily: "Inter_700Bold" },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  customInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 48 },
  customPrice: { fontSize: 16, fontFamily: "Inter_700Bold" },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.brand,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  payBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  successIcon: { marginBottom: 16 },
  successTitle: { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 8 },
  successSub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 24 },
  doneBtn: { backgroundColor: Colors.brand, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  webPayText: { fontSize: 20, fontFamily: "Inter_600SemiBold", marginTop: 16 },
  webPaySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginTop: 8, marginBottom: 24 },
  openBtn: { backgroundColor: Colors.brand, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginBottom: 16 },
  openBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  doneLink: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 12 },
});
