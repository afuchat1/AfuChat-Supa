/**
 * AfuChat Wallet — Buy ACoin
 *
 * Hosted checkout flow (Pesapal):
 *  1. User picks a package (or enters custom amount)
 *  2. App calls /api/payments/initiate → Pesapal returns redirect_url
 *  3. redirect_url opens full-screen in-app WebView (Pesapal's hosted checkout)
 *  4. User completes payment on Pesapal's page (card, mobile money, etc.)
 *  5. App polls pesapal_orders until status = completed | failed
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

const { width: SW } = Dimensions.get("window");
const CALLBACK_URL = "https://afuchat.com/wallet/payment-complete";

let WebView: any = null;
if (Platform.OS !== "web") {
  try { WebView = require("react-native-webview").WebView; } catch {}
}

// ─── Packages ─────────────────────────────────────────────────────────────────

const ACOIN_PACKAGES = [
  { amount: 100,   priceUsd: 1.0,   label: "Starter"  },
  { amount: 500,   priceUsd: 5.0,   label: "Basic"    },
  { amount: 2000,  priceUsd: 20.0,  label: "Popular", popular: true },
  { amount: 5000,  priceUsd: 50.0,  label: "Value"    },
  { amount: 20000, priceUsd: 200.0, label: "Pro"      },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  const apiUrl = (process.env.EXPO_PUBLIC_API_URL || "").trim();
  if (apiUrl) return apiUrl.replace(/\/+$/, "");
  const domain = (process.env.EXPO_PUBLIC_DOMAIN || "").trim();
  return domain ? `https://${domain}` : "";
}

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || "";
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ScreenHeader({
  title, onBack, insets, colors,
}: { title: string; onBack?: () => void; insets: any; colors: any }) {
  return (
    <View style={[sh.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {onBack
        ? <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        : <View style={{ width: 28 }} />}
      <Text style={[sh.headerTitle, { color: colors.text }]}>{title}</Text>
      <View style={{ width: 28 }} />
    </View>
  );
}

// ─── Screen 1: Package Selection ─────────────────────────────────────────────

function SelectScreen({
  insets, colors, profile,
  selectedPack, setSelectedPack,
  customAmount, setCustomAmount,
  loading, onCheckout,
}: any) {
  const acoinAmount = selectedPack !== null
    ? ACOIN_PACKAGES[selectedPack].amount
    : (parseInt(customAmount || "0") || 0);
  const priceUsd = (acoinAmount * 0.01).toFixed(2);
  const canPay = acoinAmount >= 50;

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <ScreenHeader title="Buy ACoin" onBack={() => router.back()} insets={insets} colors={colors} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance pill */}
        <View style={[s.balancePill, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "25" }]}>
          <Ionicons name="diamond" size={15} color={Colors.brand} />
          <Text style={[s.balancePillText, { color: Colors.brand }]}>
            Current balance: {(profile?.acoin || 0).toLocaleString()} ACoin
          </Text>
        </View>

        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>CHOOSE A PACKAGE</Text>

        {/* Package grid */}
        <View style={s.packGrid}>
          {ACOIN_PACKAGES.map((pkg, i) => {
            const sel = selectedPack === i;
            return (
              <TouchableOpacity
                key={i}
                style={[
                  s.packCard,
                  { backgroundColor: colors.surface, borderColor: sel ? Colors.brand : colors.border },
                  sel && s.packCardSelected,
                ]}
                onPress={() => { setSelectedPack(i); setCustomAmount(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.75}
              >
                {pkg.popular && (
                  <View style={s.popularBadge}>
                    <Text style={s.popularText}>POPULAR</Text>
                  </View>
                )}
                <View style={[s.packIconWrap, { backgroundColor: sel ? Colors.brand : colors.inputBg }]}>
                  <Ionicons name="diamond" size={22} color={sel ? "#fff" : Colors.brand} />
                </View>
                <Text style={[s.packAmount, { color: colors.text }]}>{pkg.amount.toLocaleString()}</Text>
                <Text style={[s.packACoin, { color: colors.textMuted }]}>ACoin</Text>
                <View style={[s.packPricePill, { backgroundColor: sel ? Colors.brand : colors.border + "40" }]}>
                  <Text style={[s.packPrice, { color: sel ? "#fff" : colors.textMuted }]}>
                    ${pkg.priceUsd.toFixed(2)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom amount */}
        <Text style={[s.sectionLabel, { color: colors.textMuted, marginTop: 8 }]}>OR ENTER CUSTOM AMOUNT</Text>
        <View style={[
          s.customRow,
          { backgroundColor: colors.surface, borderColor: selectedPack === null && customAmount ? Colors.brand : colors.border },
        ]}>
          <Ionicons name="diamond" size={18} color={Colors.brand} />
          <TextInput
            style={[s.customInput, { color: colors.text }]}
            placeholder="Min. 50 ACoin"
            placeholderTextColor={colors.textMuted}
            value={customAmount}
            onChangeText={(v) => { setCustomAmount(v.replace(/\D/g, "")); setSelectedPack(null); }}
            keyboardType="number-pad"
          />
          {customAmount
            ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>${((parseInt(customAmount) || 0) * 0.01).toFixed(2)}</Text>
            : null}
        </View>

        {/* Secure badge */}
        <View style={[s.secureBadge, { backgroundColor: "#34C75910", borderColor: "#34C75930" }]}>
          <Ionicons name="shield-checkmark" size={15} color="#34C759" />
          <Text style={{ color: "#34C759", fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 17 }}>
            Secure checkout powered by Pesapal. Pay with card, mobile money, and more.
          </Text>
        </View>

        {/* Checkout button */}
        {canPay && (
          <TouchableOpacity
            style={[s.checkoutBtn, { backgroundColor: Colors.brand, opacity: loading ? 0.75 : 1 }]}
            onPress={onCheckout}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={17} color="#fff" />
                <Text style={s.checkoutBtnText}>
                  Checkout · {acoinAmount.toLocaleString()} ACoin  (${priceUsd})
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Payment method icons */}
        <View style={s.methodIcons}>
          {[
            { label: "Visa",   bg: "#1A1F71", text: "#fff",    content: "VISA" },
            { label: "MC",     bg: "#fff",    text: "#000",    content: "MC"   },
            { label: "MTN",    bg: "#FFCB00", text: "#000",    content: "MTN"  },
            { label: "Airtel", bg: "#E40000", text: "#fff",    content: "ARTR" },
            { label: "M-Pesa", bg: "#00A94F", text: "#fff",    content: "MPSA" },
          ].map((m) => (
            <View key={m.label} style={[s.methodIcon, { backgroundColor: m.bg }]}>
              <Text style={[s.methodIconText, { color: m.text }]}>{m.content}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Screen 2: Hosted Checkout WebView ───────────────────────────────────────

function CheckoutWebView({
  insets, colors, url, title,
  onSuccess, onCancel, onError,
}: {
  insets: any; colors: any; url: string; title: string;
  onSuccess: () => void; onCancel: () => void; onError: (msg: string) => void;
}) {
  const [webLoading, setWebLoading] = useState(true);

  function handleNavChange(navUrl: string) {
    if (navUrl.startsWith(CALLBACK_URL)) {
      const params = new URLSearchParams(navUrl.split("?")[1] || "");
      const status = params.get("OrderTrackingId") ? "success" : (params.get("status") || "");
      if (status === "Failed" || status === "Invalid") onError("Payment was not completed.");
      else onSuccess();
    }
  }

  // Web fallback: open in new tab
  if (Platform.OS === "web" || !WebView) {
    return (
      <View style={[s.root, s.centered, { backgroundColor: colors.backgroundSecondary }]}>
        <ScreenHeader title={title} onBack={onCancel} insets={insets} colors={colors} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={[s.webCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="globe-outline" size={48} color={Colors.brand} style={{ marginBottom: 16 }} />
            <Text style={[s.webCardTitle, { color: colors.text }]}>Open Checkout</Text>
            <Text style={[s.webCardSub, { color: colors.textMuted }]}>
              Complete your payment on the secure Pesapal checkout page.
            </Text>
            <TouchableOpacity
              style={[s.checkoutBtn, { backgroundColor: Colors.brand, marginTop: 20 }]}
              onPress={() => { if (typeof window !== "undefined") window.open(url, "_blank"); }}
            >
              <Ionicons name="open-outline" size={18} color="#fff" />
              <Text style={s.checkoutBtnText}>Open Checkout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 16 }} onPress={onSuccess}>
              <Text style={{ color: Colors.brand, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                I've completed payment
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 10 }} onPress={onCancel}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[sh.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => showAlert(
            "Cancel Payment",
            "Are you sure you want to cancel? No funds have been charged.",
            [{ text: "Stay", style: "cancel" }, { text: "Cancel Payment", style: "destructive", onPress: onCancel }]
          )}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="lock-closed" size={13} color="#34C759" />
            <Text style={[sh.headerTitle, { color: colors.text, fontSize: 15 }]}>{title}</Text>
          </View>
          <Text style={{ color: "#34C759", fontSize: 11, fontFamily: "Inter_400Regular" }}>pesapal.com · Secure Payment</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* WebView */}
      <WebView
        style={{ flex: 1 }}
        source={{ uri: url }}
        onNavigationStateChange={(nav: any) => handleNavChange(nav.url || "")}
        onShouldStartLoadWithRequest={(req: any) => {
          handleNavChange(req.url || "");
          return true;
        }}
        onLoad={() => setWebLoading(false)}
        onError={() => onError("Could not load the payment page. Please try again.")}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        startInLoadingState={false}
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      />

      {/* Loading overlay */}
      {webLoading && (
        <View style={[s.webLoader, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={Colors.brand} />
          <Text style={[s.webLoaderText, { color: colors.textMuted }]}>Loading secure checkout…</Text>
        </View>
      )}

      {/* Bottom safe area */}
      <View style={{ height: insets.bottom, backgroundColor: colors.surface }} />
    </View>
  );
}

// ─── Screen 3: Confirming (polling IPN) ──────────────────────────────────────

function ConfirmingScreen({ insets, colors, onManualCheck, checking }: any) {
  return (
    <View style={[s.root, s.centered, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[s.resultCard, { backgroundColor: colors.surface }]}>
        <View style={[s.resultIcon, { backgroundColor: Colors.brand + "15" }]}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
        <Text style={[s.resultTitle, { color: colors.text }]}>Confirming Payment</Text>
        <Text style={[s.resultSub, { color: colors.textMuted }]}>
          Waiting for confirmation from Pesapal. This usually takes a few seconds.
        </Text>
        <TouchableOpacity
          style={[s.checkoutBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 0 }]}
          onPress={onManualCheck}
          disabled={checking}
        >
          {checking
            ? <ActivityIndicator color={Colors.brand} size="small" />
            : <><Ionicons name="refresh" size={16} color={Colors.brand} /><Text style={[s.checkoutBtnText, { color: Colors.brand }]}>Check Status</Text></>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen 4: Success ────────────────────────────────────────────────────────

function SuccessScreen({ insets, colors, acoinAmount, onDone }: any) {
  return (
    <View style={[s.root, s.centered, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[s.resultCard, { backgroundColor: colors.surface }]}>
        <View style={[s.resultIcon, { backgroundColor: "#34C75920" }]}>
          <Ionicons name="checkmark-circle" size={52} color="#34C759" />
        </View>
        <Text style={[s.resultTitle, { color: colors.text }]}>Payment Successful!</Text>
        <Text style={[s.resultSub, { color: colors.textMuted }]}>Your account has been credited.</Text>

        <View style={[s.creditedRow, { backgroundColor: Colors.brand + "12" }]}>
          <Ionicons name="diamond" size={22} color={Colors.brand} />
          <Text style={[s.creditedText, { color: Colors.brand }]}>+{acoinAmount.toLocaleString()} ACoin</Text>
        </View>

        <TouchableOpacity
          style={[s.checkoutBtn, { backgroundColor: Colors.brand }]}
          onPress={onDone}
        >
          <Text style={s.checkoutBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen 5: Failed ─────────────────────────────────────────────────────────

function FailedScreen({ colors, failureMsg, onRetry, onCancel }: any) {
  return (
    <View style={[s.root, s.centered, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[s.resultCard, { backgroundColor: colors.surface }]}>
        <View style={[s.resultIcon, { backgroundColor: "#FF3B3018" }]}>
          <Ionicons name="close-circle" size={52} color="#FF3B30" />
        </View>
        <Text style={[s.resultTitle, { color: colors.text }]}>Payment Failed</Text>
        <Text style={[s.resultSub, { color: colors.textMuted }]}>
          {failureMsg || "Your payment could not be completed. No funds were charged."}
        </Text>
        <TouchableOpacity style={[s.checkoutBtn, { backgroundColor: Colors.brand }]} onPress={onRetry}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={s.checkoutBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 12 }} onPress={onCancel}>
          <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type Screen = "select" | "checkout" | "confirming" | "success" | "failed";

export default function TopupScreen() {
  const { colors } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [screen, setScreen]                 = useState<Screen>("select");
  const [selectedPack, setSelectedPack]     = useState<number | null>(null);
  const [customAmount, setCustomAmount]     = useState("");
  const [redirectUrl, setRedirectUrl]       = useState<string | null>(null);
  const [merchantRef, setMerchantRef]       = useState<string | null>(null);
  const [creditedAcoin, setCreditedAcoin]   = useState(0);
  const [loading, setLoading]               = useState(false);
  const [checking, setChecking]             = useState(false);
  const [failureMsg, setFailureMsg]         = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function getAmount(): number {
    if (selectedPack !== null) return ACOIN_PACKAGES[selectedPack].amount;
    return parseInt(customAmount || "0") || 0;
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setRedirectUrl(null);
    setMerchantRef(null);
    setCreditedAcoin(0);
    setFailureMsg("");
    setLoading(false);
    setChecking(false);
  }

  async function checkStatus(ref: string): Promise<"completed" | "failed" | "pending"> {
    const { data } = await supabase
      .from("pesapal_orders")
      .select("status")
      .eq("merchant_reference", ref)
      .maybeSingle();
    return (data?.status as any) || "pending";
  }

  function startPolling(ref: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 60) { // 5 minutes
        clearInterval(pollRef.current!);
        setFailureMsg("Confirmation is taking longer than expected. If money was deducted, it will be credited within a few minutes. Contact support if needed.");
        setScreen("failed");
        return;
      }
      try {
        const status = await checkStatus(ref);
        if (status === "completed") {
          clearInterval(pollRef.current!);
          await refreshProfile();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setScreen("success");
        } else if (status === "failed") {
          clearInterval(pollRef.current!);
          setFailureMsg("Your payment could not be completed. No funds were charged.");
          setScreen("failed");
        }
      } catch {}
    }, 5000);
  }

  async function handleManualCheck() {
    if (!merchantRef || checking) return;
    setChecking(true);
    try {
      const status = await checkStatus(merchantRef);
      if (status === "completed") {
        if (pollRef.current) clearInterval(pollRef.current);
        await refreshProfile();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setScreen("success");
      } else if (status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
        setFailureMsg("Your payment could not be completed. No funds were charged.");
        setScreen("failed");
      } else {
        showAlert("Still Pending", "We haven't received confirmation yet. Please wait a moment and try again.");
      }
    } catch {}
    setChecking(false);
  }

  async function startCheckout() {
    const amount = getAmount();
    if (amount < 50) { showAlert("Select Package", "Please select at least 50 ACoin."); return; }

    setLoading(true);
    Haptics.selectionAsync();

    try {
      const token = await getAuthToken();
      // No payment_method → Pesapal returns a hosted checkout redirect_url
      // where the user picks their own method (card, mobile money, etc.)
      const res = await fetch(`${getApiBase()}/api/payments/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          acoin_amount: amount,
          currency: "USD",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Payment error (${res.status})`);
      if (!data.redirect_url) throw new Error("No checkout URL returned. Please try again.");

      setCreditedAcoin(amount);
      setMerchantRef(data.merchant_reference);
      setRedirectUrl(data.redirect_url);
      setScreen("checkout");
    } catch (err: any) {
      showAlert("Payment Error", err?.message || "Could not start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleCheckoutSuccess() {
    setRedirectUrl(null);
    setScreen("confirming");
    if (merchantRef) startPolling(merchantRef);
  }

  function handleCheckoutCancel() {
    if (pollRef.current) clearInterval(pollRef.current);
    showAlert("Cancelled", "Payment cancelled. No funds were charged.");
    reset();
    setScreen("select");
  }

  function handleCheckoutError(msg: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    showAlert("Error", msg || "An error occurred. Please try again.");
    reset();
    setScreen("select");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (screen === "select") {
    return (
      <SelectScreen
        insets={insets} colors={colors} profile={profile}
        selectedPack={selectedPack} setSelectedPack={setSelectedPack}
        customAmount={customAmount} setCustomAmount={setCustomAmount}
        loading={loading} onCheckout={startCheckout}
      />
    );
  }

  if (screen === "checkout" && redirectUrl) {
    return (
      <CheckoutWebView
        insets={insets} colors={colors}
        url={redirectUrl}
        title="Secure Checkout"
        onSuccess={handleCheckoutSuccess}
        onCancel={handleCheckoutCancel}
        onError={handleCheckoutError}
      />
    );
  }

  if (screen === "confirming" || (screen === "checkout" && !redirectUrl)) {
    return (
      <ConfirmingScreen
        insets={insets} colors={colors}
        onManualCheck={handleManualCheck}
        checking={checking}
      />
    );
  }

  if (screen === "success") {
    return (
      <SuccessScreen
        insets={insets} colors={colors}
        acoinAmount={creditedAcoin}
        onDone={() => { reset(); refreshProfile(); router.back(); }}
      />
    );
  }

  if (screen === "failed") {
    return (
      <FailedScreen
        colors={colors}
        failureMsg={failureMsg}
        onRetry={() => { reset(); setScreen("select"); }}
        onCancel={() => { reset(); router.back(); }}
      />
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sh = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Balance pill
  balancePill: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, borderRadius: 12, borderWidth: 1, marginBottom: 24 },
  balancePillText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // Section label
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 12 },

  // Package grid
  packGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 28 },
  packCard: {
    width: (SW - 50) / 2, borderRadius: 18, padding: 18,
    alignItems: "center", position: "relative", borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  packCardSelected: { shadowOpacity: 0.12, elevation: 4 },
  popularBadge: { position: "absolute", top: 10, right: 10, backgroundColor: Colors.brand, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  popularText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  packIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  packAmount: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  packACoin: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2, marginBottom: 10 },
  packPricePill: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  packPrice: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Custom amount
  customRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 16, borderWidth: 1.5, marginBottom: 20 },
  customInput: { flex: 1, fontSize: 17, fontFamily: "Inter_500Medium" },

  // Secure badge
  secureBadge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 20 },

  // Checkout button
  checkoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 16, width: "100%" },
  checkoutBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  // Payment method icons
  methodIcons: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 16 },
  methodIcon: { borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5, alignItems: "center", justifyContent: "center" },
  methodIconText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },

  // WebView web fallback
  webCard: { borderRadius: 24, padding: 28, alignItems: "center", width: SW - 64 },
  webCardTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 8 },
  webCardSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  webLoader: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  webLoaderText: { marginTop: 12, fontSize: 14, fontFamily: "Inter_400Regular" },

  // Result screens
  resultCard: { width: SW - 48, borderRadius: 24, padding: 28, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 4 },
  resultIcon: { width: 84, height: 84, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  resultTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 8 },
  resultSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  creditedRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginBottom: 24 },
  creditedText: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
});
