import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
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
import * as Haptics from "expo-haptics";
import { WebView } from "react-native-webview";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

const ACOIN_PACKAGES = [
  { label: "100 ACoin", amount: 100, priceUsd: 1 },
  { label: "500 ACoin", amount: 500, priceUsd: 5 },
  { label: "2,000 ACoin", amount: 2000, priceUsd: 20 },
  { label: "5,000 ACoin", amount: 5000, priceUsd: 50 },
  { label: "20,000 ACoin", amount: 20000, priceUsd: 200 },
];

const COUNTRY_CURRENCY: Record<string, { code: string; symbol: string }> = {
  "Uganda": { code: "UGX", symbol: "USh" },
  "Kenya": { code: "KES", symbol: "KSh" },
  "Tanzania": { code: "TZS", symbol: "TSh" },
  "Nigeria": { code: "NGN", symbol: "₦" },
  "South Africa": { code: "ZAR", symbol: "R" },
  "Ghana": { code: "GHS", symbol: "GH₵" },
  "Rwanda": { code: "RWF", symbol: "FRw" },
  "Ethiopia": { code: "ETB", symbol: "Br" },
  "Cameroon": { code: "XAF", symbol: "FCFA" },
  "Senegal": { code: "XOF", symbol: "CFA" },
  "Egypt": { code: "EGP", symbol: "E£" },
  "Morocco": { code: "MAD", symbol: "MAD" },
  "Zambia": { code: "ZMW", symbol: "ZK" },
  "Malawi": { code: "MWK", symbol: "MK" },
  "United States": { code: "USD", symbol: "$" },
  "United Kingdom": { code: "GBP", symbol: "£" },
  "India": { code: "INR", symbol: "₹" },
  "Pakistan": { code: "PKR", symbol: "Rs" },
  "Germany": { code: "EUR", symbol: "€" },
  "France": { code: "EUR", symbol: "€" },
  "Japan": { code: "JPY", symbol: "¥" },
  "China": { code: "CNY", symbol: "¥" },
  "Brazil": { code: "BRL", symbol: "R$" },
  "Mexico": { code: "MXN", symbol: "MX$" },
  "Philippines": { code: "PHP", symbol: "₱" },
  "Indonesia": { code: "IDR", symbol: "Rp" },
  "Saudi Arabia": { code: "SAR", symbol: "SAR" },
  "United Arab Emirates": { code: "AED", symbol: "AED" },
  "Turkey": { code: "TRY", symbol: "₺" },
  "Australia": { code: "AUD", symbol: "A$" },
  "Canada": { code: "CAD", symbol: "C$" },
  "Malaysia": { code: "MYR", symbol: "RM" },
  "Thailand": { code: "THB", symbol: "฿" },
  "South Korea": { code: "KRW", symbol: "₩" },
  "Singapore": { code: "SGD", symbol: "S$" },
  "Sweden": { code: "SEK", symbol: "kr" },
  "Switzerland": { code: "CHF", symbol: "CHF" },
  "Poland": { code: "PLN", symbol: "zł" },
  "Colombia": { code: "COP", symbol: "COL$" },
  "Argentina": { code: "ARS", symbol: "AR$" },
  "Somalia": { code: "SOS", symbol: "Sh" },
  "Sudan": { code: "SDG", symbol: "SDG" },
  "Democratic Republic of the Congo": { code: "CDF", symbol: "FC" },
  "Mozambique": { code: "MZN", symbol: "MT" },
  "Zimbabwe": { code: "ZWL", symbol: "Z$" },
  "Botswana": { code: "BWP", symbol: "P" },
  "Namibia": { code: "NAD", symbol: "N$" },
  "Angola": { code: "AOA", symbol: "Kz" },
  "Burundi": { code: "BIF", symbol: "FBu" },
  "Madagascar": { code: "MGA", symbol: "Ar" },
  "Sierra Leone": { code: "SLL", symbol: "Le" },
  "Ivory Coast": { code: "XOF", symbol: "CFA" },
};

type TopUpStage = "select" | "processing" | "payment" | "success";

function getUserCurrency(country: string | null | undefined): { code: string; symbol: string } {
  if (!country) return { code: "USD", symbol: "$" };
  return COUNTRY_CURRENCY[country] || { code: "USD", symbol: "$" };
}

function formatLocalPrice(usdPrice: number, rate: number, symbol: string, code: string): string {
  if (code === "USD") return `$${usdPrice.toFixed(2)}`;
  const local = Math.ceil(usdPrice * rate);
  return `${symbol}${local.toLocaleString()}`;
}

export default function TopUpScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [stage, setStage] = useState<TopUpStage>("select");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [rateLoading, setRateLoading] = useState(true);

  const userCurrency = getUserCurrency(profile?.country);
  const isLocalCurrency = userCurrency.code !== "USD";

  useEffect(() => {
    async function fetchRate() {
      if (userCurrency.code === "USD") {
        setExchangeRate(1);
        setRateLoading(false);
        return;
      }
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        const data = await res.json();
        if (data.result === "success" && data.rates?.[userCurrency.code]) {
          setExchangeRate(data.rates[userCurrency.code]);
        }
      } catch {}
      setRateLoading(false);
    }
    fetchRate();
  }, [userCurrency.code]);

  function displayPrice(usdPrice: number): string {
    return formatLocalPrice(usdPrice, exchangeRate, userCurrency.symbol, userCurrency.code);
  }

  async function initiatePayment() {
    const pack = selectedPack !== null ? ACOIN_PACKAGES[selectedPack] : null;
    const customVal = customAmount ? parseInt(customAmount) : 0;

    if (!pack && (!customVal || customVal < 50)) {
      showAlert("Select amount", "Please select a package or enter at least 50 ACoin.");
      return;
    }

    const acoinAmount = pack ? pack.amount : customVal;

    setProcessing(true);
    Haptics.selectionAsync();

    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";
      const response = await fetch(`${supabaseUrl}/functions/v1/pesapal-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "create-order",
          userId: user?.id,
          acoinAmount: acoinAmount,
        }),
      });

      const data = await response.json();

      if (data.redirectUrl) {
        setPaymentUrl(data.redirectUrl);
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
    if (url.includes("payment=success") || url.includes("status=completed")) {
      setStage("success");
      refreshProfile();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (url.includes("payment=cancelled") || url.includes("status=cancelled")) {
      setStage("select");
      showAlert("Cancelled", "Payment was cancelled.");
    }
  }

  if (stage === "payment" && paymentUrl) {
    if (Platform.OS === "web") {
      return (
        <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setStage("select"); refreshProfile(); }}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Complete Payment</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ flex: 1 }}>
            <iframe
              src={paymentUrl}
              style={{ width: "100%", height: "100%", border: "none" } as any}
              allow="payment"
            />
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
          renderLoading={() => <ActivityIndicator color={Colors.gold} style={{ flex: 1 }} />}
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
          Your ACoin balance has been updated. It may take a moment to reflect.
        </Text>
        <TouchableOpacity style={[styles.doneBtn, { backgroundColor: Colors.gold }]} onPress={() => router.back()}>
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Buy ACoin</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.balanceCard, { backgroundColor: Colors.gold }]}>
          <Ionicons name="diamond" size={28} color="rgba(255,255,255,0.9)" />
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceValue}>{profile?.acoin || 0} ACoin</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SELECT PACKAGE</Text>

        {ACOIN_PACKAGES.map((pack, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.packCard,
              { backgroundColor: colors.surface, borderColor: selectedPack === i ? Colors.gold : "transparent" },
            ]}
            onPress={() => { setSelectedPack(i); setCustomAmount(""); Haptics.selectionAsync(); }}
          >
            <View style={styles.packLeft}>
              <Ionicons name="diamond" size={20} color={Colors.gold} />
              <Text style={[styles.packLabel, { color: colors.text }]}>{pack.label}</Text>
            </View>
            <View style={styles.packRight}>
              {rateLoading ? (
                <ActivityIndicator size="small" color={Colors.gold} />
              ) : (
                <Text style={[styles.packPrice, { color: Colors.gold }]}>{displayPrice(pack.priceUsd)}</Text>
              )}
              {selectedPack === i && <Ionicons name="checkmark-circle" size={20} color={Colors.gold} />}
            </View>
          </TouchableOpacity>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 16 }]}>OR ENTER CUSTOM AMOUNT</Text>
        <View style={[styles.customRow, { backgroundColor: colors.surface }]}>
          <TextInput
            style={[styles.customInput, { color: colors.text }]}
            placeholder="Enter ACoin amount (min. 50)"
            placeholderTextColor={colors.textMuted}
            value={customAmount}
            onChangeText={(v) => { setCustomAmount(v.replace(/[^0-9]/g, "")); setSelectedPack(null); }}
            keyboardType="numeric"
          />
          {customAmount && !rateLoading ? (
            <Text style={[styles.customPrice, { color: Colors.gold }]}>
              {displayPrice((parseInt(customAmount || "0") || 0) * 0.01)}
            </Text>
          ) : null}
        </View>

        {isLocalCurrency && !rateLoading && (
          <View style={[styles.rateNote, { backgroundColor: colors.surface }]}>
            <Ionicons name="swap-horizontal" size={14} color={colors.textMuted} />
            <Text style={[styles.rateNoteText, { color: colors.textMuted }]}>
              1 USD ≈ {exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 0 })} {userCurrency.code}
            </Text>
          </View>
        )}

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.gold} />
          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            Payments are processed securely through Pesapal. Supports M-Pesa, Visa, Mastercard, and more.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: Colors.gold }, (processing || rateLoading || (selectedPack === null && !customAmount)) && { opacity: 0.5 }]}
          onPress={initiatePayment}
          disabled={processing || rateLoading || (selectedPack === null && !customAmount)}
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
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  customInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 48 },
  customPrice: { fontSize: 16, fontFamily: "Inter_700Bold" },
  rateNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rateNoteText: { fontSize: 12, fontFamily: "Inter_400Regular" },
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
  },
  payBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  successIcon: { marginBottom: 16 },
  successTitle: { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 8 },
  successSub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 24 },
  doneBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
