import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

let WebView: any = null;
let WebViewNavigation: any = null;
if (Platform.OS !== "web") {
  const wv = require("react-native-webview");
  WebView = wv.WebView;
}

const ACOIN_PACKAGES = [
  { label: "100 ACoin", amount: 100, priceUsd: 1.0 },
  { label: "500 ACoin", amount: 500, priceUsd: 5.0 },
  { label: "2,000 ACoin", amount: 2000, priceUsd: 20.0 },
  { label: "5,000 ACoin", amount: 5000, priceUsd: 50.0 },
  { label: "20,000 ACoin", amount: 20000, priceUsd: 200.0 },
];

const CALLBACK_PATTERNS = [
  "afuchat.com/wallet/payment-complete",
  "payment-complete",
  "payment_status=COMPLETED",
  "OrderNotificationType=IPNCHANGE",
];

type Screen = "select" | "paying" | "awaiting" | "verifying" | "success" | "failed";

export default function TopUpScreen() {
  const { colors } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>("select");
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [merchantRef, setMerchantRef] = useState<string | null>(null);
  const [creditedAcoin, setCreditedAcoin] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function getSelectedAmount(): number {
    if (selectedPack !== null) return ACOIN_PACKAGES[selectedPack].amount;
    const custom = parseInt(customAmount || "0", 10);
    return isNaN(custom) ? 0 : custom;
  }

  async function initiatePayment() {
    const amount = getSelectedAmount();
    if (amount < 50) {
      showAlert("Select a package", "Please select a package or enter at least 50 ACoin.");
      return;
    }

    setLoading(true);
    Haptics.selectionAsync();

    try {
      let data: any;

      if (Platform.OS === "web") {
        // Web: use SDK invoke — it handles CORS headers correctly
        const { data: invoked, error: fnErr } = await supabase.functions.invoke("pesapal-initiate", {
          body: { acoin_amount: amount, currency: "USD" },
        });
        if (fnErr) throw new Error(fnErr.message || "Failed to start payment. Please try again.");
        data = invoked;
      } else {
        // Native Android/iOS: raw fetch — no CORS, simpler and more reliable
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Session expired. Please sign in again.");
        const res = await fetch(`${supabaseUrl}/functions/v1/pesapal-initiate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": supabaseAnonKey,
          },
          body: JSON.stringify({ acoin_amount: amount, currency: "USD" }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Payment service error (${res.status})`);
      }

      if (!data?.redirect_url) {
        throw new Error(data?.error || "No payment URL returned. Please try again.");
      }

      setCreditedAcoin(amount);
      setPaymentUrl(data.redirect_url);
      setMerchantRef(data.merchant_reference);

      if (Platform.OS === "web") {
        Linking.openURL(data.redirect_url);
        setScreen("awaiting");
        startPolling(data.merchant_reference);
      } else {
        setScreen("paying");
      }
    } catch (err: any) {
      showAlert("Payment Error", err?.message || "Could not start payment. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const startPolling = useCallback((ref: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 36) {
        clearInterval(pollRef.current!);
        return;
      }
      try {
        const { data: order } = await supabase
          .from("pesapal_orders")
          .select("status")
          .eq("merchant_reference", ref)
          .maybeSingle();

        if (order?.status === "completed") {
          clearInterval(pollRef.current!);
          await refreshProfile();
          Haptics.notificationAsync("success");
          setScreen("success");
        } else if (order?.status === "failed" || order?.status === "invalid") {
          clearInterval(pollRef.current!);
          setScreen("failed");
        }
      } catch {}
    }, 5000);
  }, [refreshProfile]);

  const handleWebViewNavigation = useCallback(
    (navState: any) => {
      const url = navState.url || "";
      const isCallback = CALLBACK_PATTERNS.some((p) => url.includes(p));
      if (isCallback && merchantRef) {
        // Pesapal redirects to callback URL for ALL outcomes (success/fail/cancelled).
        // The URL alone doesn't tell us the outcome — show a checking screen and poll the DB.
        setScreen("verifying");
        startPolling(merchantRef);
      }
    },
    [merchantRef, startPolling],
  );

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setScreen("select");
    setPaymentUrl(null);
    setMerchantRef(null);
    setSelectedPack(null);
    setCustomAmount("");
    setCreditedAcoin(0);
  }

  if (screen === "paying" && paymentUrl && Platform.OS !== "web" && WebView) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 8,
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() =>
              showAlert(
                "Cancel Payment",
                "Are you sure you want to cancel this payment?",
                [
                  { text: "Continue Paying", style: "cancel" },
                  { text: "Cancel", style: "destructive", onPress: reset },
                ],
              )
            }
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Secure Payment
          </Text>
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={14} color={Colors.brand} />
            <Text style={[styles.lockText, { color: Colors.brand }]}>
              Pesapal
            </Text>
          </View>
        </View>

        <WebView
          source={{ uri: paymentUrl }}
          onNavigationStateChange={handleWebViewNavigation}
          style={{ flex: 1 }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webviewLoader}>
              <ActivityIndicator size="large" color={Colors.brand} />
              <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                Loading secure payment…
              </Text>
            </View>
          )}
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
        />
      </View>
    );
  }

  if (screen === "awaiting") {
    return (
      <View style={[styles.root, styles.resultScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={Colors.brand} style={{ marginBottom: 24 }} />
        <Text style={[styles.resultTitle, { color: colors.text, fontSize: 22 }]}>
          Waiting for payment…
        </Text>
        <Text style={[styles.resultSub, { color: colors.textMuted }]}>
          Complete your payment in the browser window that just opened. This page will update automatically when your payment is confirmed.
        </Text>
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: Colors.brand, marginTop: 16 }]}
          onPress={() => paymentUrl && Linking.openURL(paymentUrl)}
        >
          <Text style={styles.doneBtnText}>Open Payment Page</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={reset} style={{ marginTop: 16 }}>
          <Text style={[styles.topUpAgain, { color: colors.textMuted }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (screen === "verifying") {
    return (
      <View style={[styles.root, styles.resultScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={Colors.brand} style={{ marginBottom: 24 }} />
        <Text style={[styles.resultTitle, { color: colors.text, fontSize: 22 }]}>
          Checking your payment…
        </Text>
        <Text style={[styles.resultSub, { color: colors.textMuted }]}>
          Please wait while we confirm your payment. This usually takes a few seconds.
        </Text>
      </View>
    );
  }

  if (screen === "success") {
    return (
      <View style={[styles.root, styles.resultScreen, { backgroundColor: colors.background }]}>
        <Ionicons name="checkmark-circle" size={80} color="#34C759" style={{ marginBottom: 20 }} />
        <Text style={[styles.resultTitle, { color: colors.text }]}>
          Payment Successful!
        </Text>
        <Text style={[styles.resultSub, { color: colors.textMuted }]}>
          {creditedAcoin > 0
            ? `${creditedAcoin.toLocaleString()} ACoin will be added to your wallet shortly.`
            : "Your ACoin will be credited shortly."}
        </Text>
        <Text style={[styles.resultNote, { color: colors.textMuted }]}>
          If your balance doesn't update within a few minutes, please contact support.
        </Text>
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: Colors.brand }]}
          onPress={() => router.back()}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={reset} style={{ marginTop: 12 }}>
          <Text style={[styles.topUpAgain, { color: Colors.brand }]}>Top up again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (screen === "failed") {
    return (
      <View style={[styles.root, styles.resultScreen, { backgroundColor: colors.background }]}>
        <Ionicons name="close-circle" size={80} color="#FF3B30" style={{ marginBottom: 20 }} />
        <Text style={[styles.resultTitle, { color: colors.text }]}>Payment Failed</Text>
        <Text style={[styles.resultSub, { color: colors.textMuted }]}>
          Your payment was not completed. No funds were charged.
        </Text>
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: Colors.gold }]}
          onPress={reset}
        >
          <Text style={styles.doneBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={[styles.topUpAgain, { color: colors.textMuted }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Buy ACoin</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={[styles.balanceCard, { backgroundColor: Colors.gold }]}>
          <Ionicons name="diamond" size={28} color="rgba(255,255,255,0.9)" />
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceValue}>
            {(profile?.acoin || 0).toLocaleString()} ACoin
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SELECT PACKAGE</Text>

        {ACOIN_PACKAGES.map((pack, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.packCard,
              {
                backgroundColor: colors.surface,
                borderColor: selectedPack === i ? Colors.gold : "transparent",
              },
            ]}
            onPress={() => {
              setSelectedPack(i);
              setCustomAmount("");
              Haptics.selectionAsync();
            }}
          >
            <View style={styles.packLeft}>
              <Ionicons name="diamond" size={20} color={Colors.gold} />
              <View>
                <Text style={[styles.packLabel, { color: colors.text }]}>{pack.label}</Text>
                <Text style={[styles.packSub, { color: colors.textMuted }]}>
                  ${pack.priceUsd % 1 === 0 ? pack.priceUsd.toFixed(0) : pack.priceUsd.toFixed(2)} USD
                </Text>
              </View>
            </View>
            {selectedPack === i && (
              <Ionicons name="checkmark-circle" size={22} color={Colors.gold} />
            )}
          </TouchableOpacity>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 16 }]}>
          OR ENTER CUSTOM AMOUNT
        </Text>
        <View style={[styles.customRow, { backgroundColor: colors.surface }]}>
          <Ionicons name="diamond" size={18} color={Colors.gold} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.customInput, { color: colors.text }]}
            placeholder="ACoin amount (min. 50)"
            placeholderTextColor={colors.textMuted}
            value={customAmount}
            onChangeText={(v) => {
              setCustomAmount(v.replace(/[^0-9]/g, ""));
              setSelectedPack(null);
            }}
            keyboardType="numeric"
          />
          {customAmount ? (
            <Text style={[styles.customPrice, { color: Colors.gold }]}>
              ${((parseInt(customAmount || "0") || 0) * 0.01).toFixed(2)}
            </Text>
          ) : null}
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.brand} />
          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            Payments are processed securely by Pesapal. Supports M-Pesa, Airtel Money,
            MTN MoMo, Visa, Mastercard and more across Africa.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: Colors.gold, opacity: loading ? 0.7 : 1 }]}
          onPress={initiatePayment}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="card-outline" size={20} color="#fff" />
              <Text style={styles.payBtnText}>Pay with Pesapal</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.rateNote, { color: colors.textMuted }]}>
          1 ACoin = $0.01 USD · Prices shown in USD
        </Text>
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
  lockBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  lockText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  balanceCard: { borderRadius: 16, padding: 20, alignItems: "center", gap: 6 },
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
  packLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  packLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  packSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  customInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 48 },
  customPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
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
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
    minHeight: 54,
  },
  payBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  rateNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  webviewLoader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "transparent",
  },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  resultScreen: { alignItems: "center", justifyContent: "center", padding: 32 },
  resultTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 12,
  },
  resultSub: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 12,
  },
  resultNote: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 32,
  },
  doneBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: "center",
    width: "100%",
  },
  doneBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  topUpAgain: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
