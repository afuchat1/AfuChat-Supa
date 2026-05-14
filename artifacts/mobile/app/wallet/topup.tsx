/**
 * AfuChat Wallet — Buy ACoin (Rebuilt)
 *
 * Hosted checkout flow (Pesapal):
 *  1. User picks a package (or enters custom amount)
 *  2. App calls Supabase Edge Function /functions/v1/pesapal-initiate → Pesapal returns redirect_url
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
import { LinearGradient } from "expo-linear-gradient";
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

// ─── Packages ──────────────────────────────────────────────────────────────────

const ACOIN_PACKAGES = [
  { amount: 100,   priceUsd: 1.0,   label: "Starter",  icon: "flash-outline"   },
  { amount: 500,   priceUsd: 5.0,   label: "Basic",    icon: "flash"           },
  { amount: 2000,  priceUsd: 20.0,  label: "Popular",  icon: "diamond",        popular: true },
  { amount: 5000,  priceUsd: 50.0,  label: "Value",    icon: "diamond-outline" },
  { amount: 20000, priceUsd: 200.0, label: "Pro",      icon: "star"            },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getEdgeFnBase(): string {
  return (process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "") + "/functions/v1";
}

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || "";
}

// ─── Screen 1: Package Selection ──────────────────────────────────────────────

function SelectScreen({ insets, colors, profile, selectedPack, setSelectedPack, customAmount, setCustomAmount, loading, onCheckout }: any) {
  const acoinAmount = selectedPack !== null
    ? ACOIN_PACKAGES[selectedPack].amount
    : (parseInt(customAmount || "0") || 0);
  const priceUsd = (acoinAmount * 0.01).toFixed(2);
  const canPay = acoinAmount >= 50;

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
      <LinearGradient colors={["#0C2A2E", "#061518"]} style={[s.gradHeader, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.gradHeaderTitle}>Buy ACoin</Text>
          <Text style={s.gradHeaderSub}>Secure · Fast · Global</Text>
        </View>
        <View style={[s.balancePill, { borderColor: Colors.brand + "50" }]}>
          <Ionicons name="diamond" size={13} color={Colors.brand} />
          <Text style={[s.balancePillText, { color: Colors.brand }]}>{(profile?.acoin || 0).toLocaleString()}</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>CHOOSE A PACKAGE</Text>

        {/* Package grid */}
        <View style={s.packGrid}>
          {ACOIN_PACKAGES.map((pkg, i) => {
            const sel = selectedPack === i;
            return (
              <TouchableOpacity
                key={i}
                style={[s.packCard, { backgroundColor: colors.surface, borderColor: sel ? Colors.brand : colors.border }, sel && s.packCardSel]}
                onPress={() => { setSelectedPack(i); setCustomAmount(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.75}
              >
                {pkg.popular && (
                  <LinearGradient colors={[Colors.brand, Colors.brandDark]} style={s.popularBadge}>
                    <Text style={s.popularText}>POPULAR</Text>
                  </LinearGradient>
                )}
                <View style={[s.packIconWrap, { backgroundColor: sel ? Colors.brand : Colors.brand + "15" }]}>
                  <Ionicons name={pkg.icon as any} size={24} color={sel ? "#fff" : Colors.brand} />
                </View>
                <Text style={[s.packLabel, { color: colors.textMuted }]}>{pkg.label}</Text>
                <Text style={[s.packAmount, { color: sel ? Colors.brand : colors.text }]}>{pkg.amount.toLocaleString()}</Text>
                <Text style={[s.packUnit, { color: colors.textMuted }]}>ACoin</Text>
                <View style={[s.packPrice, { backgroundColor: sel ? Colors.brand + "18" : colors.backgroundSecondary }]}>
                  <Text style={[s.packPriceText, { color: sel ? Colors.brand : colors.textSecondary }]}>
                    ${pkg.priceUsd.toFixed(2)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom amount */}
        <Text style={[s.sectionLabel, { color: colors.textMuted, marginTop: 4 }]}>OR ENTER CUSTOM AMOUNT</Text>
        <View style={[
          s.customRow,
          { backgroundColor: colors.surface, borderColor: (selectedPack === null && customAmount) ? Colors.brand : colors.border },
        ]}>
          <View style={[s.customIconWrap, { backgroundColor: Colors.brand + "15" }]}>
            <Ionicons name="diamond" size={18} color={Colors.brand} />
          </View>
          <TextInput
            style={[s.customInput, { color: colors.text }]}
            placeholder="Enter amount (min. 50)"
            placeholderTextColor={colors.textMuted}
            value={customAmount}
            onChangeText={(v) => { setCustomAmount(v.replace(/\D/g, "")); setSelectedPack(null); }}
            keyboardType="number-pad"
          />
          {customAmount ? (
            <Text style={{ color: Colors.brand, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
              ${((parseInt(customAmount) || 0) * 0.01).toFixed(2)}
            </Text>
          ) : null}
        </View>

        {/* Security badge */}
        <View style={[s.secureBadge, { backgroundColor: "#34C75910", borderColor: "#34C75930" }]}>
          <Ionicons name="shield-checkmark" size={16} color="#34C759" />
          <Text style={[s.secureText, { color: "#34C759" }]}>
            Secured by Pesapal — pay with card, mobile money, and more.
          </Text>
        </View>

        {/* Checkout button */}
        {canPay && (
          <TouchableOpacity
            style={[s.checkoutBtn, { backgroundColor: Colors.brand, opacity: loading ? 0.75 : 1 }]}
            onPress={onCheckout} disabled={loading} activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={16} color="#fff" />
                <Text style={s.checkoutBtnText}>Pay · {acoinAmount.toLocaleString()} ACoin  (${priceUsd})</Text>
                <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.7)" />
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Payment method pills */}
        <Text style={[s.sectionLabel, { color: colors.textMuted, marginTop: 24, textAlign: "center" }]}>ACCEPTED PAYMENT METHODS</Text>
        <View style={s.methodRow}>
          {[
            { label: "VISA",  bg: "#1A1F71", text: "#fff"    },
            { label: "MC",    bg: "#EB001B", text: "#fff"    },
            { label: "MTN",   bg: "#FFCB00", text: "#000"    },
            { label: "ARTEL", bg: "#E40000", text: "#fff"    },
            { label: "MPESA", bg: "#00A94F", text: "#fff"    },
          ].map((m) => (
            <View key={m.label} style={[s.methodPill, { backgroundColor: m.bg }]}>
              <Text style={[s.methodText, { color: m.text }]}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Screen 2: Hosted Checkout WebView ────────────────────────────────────────

function CheckoutWebView({ insets, colors, url, title, onSuccess, onCancel, onError }: {
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

  if (Platform.OS === "web" || !WebView) {
    return (
      <View style={[s.root, s.centered, { backgroundColor: colors.backgroundSecondary }]}>
        <LinearGradient colors={["#0C2A2E", "#061518"]} style={[s.gradHeader, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={onCancel} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={[s.gradHeaderTitle, { flex: 1 }]}>{title}</Text>
        </LinearGradient>
        <View style={[s.resultCard, { backgroundColor: colors.surface, margin: 24 }]}>
          <View style={[s.resultIcon, { backgroundColor: Colors.brand + "18" }]}>
            <Ionicons name="globe-outline" size={44} color={Colors.brand} />
          </View>
          <Text style={[s.resultTitle, { color: colors.text }]}>Open Checkout</Text>
          <Text style={[s.resultSub, { color: colors.textMuted }]}>
            Complete your payment on the secure Pesapal page.
          </Text>
          <TouchableOpacity style={[s.checkoutBtn, { backgroundColor: Colors.brand, marginTop: 20 }]}
            onPress={() => { if (typeof window !== "undefined") window.open(url, "_blank"); }}>
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={s.checkoutBtnText}>Open Checkout</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 14 }} onPress={onSuccess}>
            <Text style={{ color: Colors.brand, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>I've completed payment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 10 }} onPress={onCancel}>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={["#0C2A2E", "#061518"]} style={[s.webHeader, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => showAlert("Cancel Payment", "Are you sure? No funds have been charged.",
            [{ text: "Stay", style: "cancel" }, { text: "Cancel Payment", style: "destructive", onPress: onCancel }])}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Ionicons name="lock-closed" size={12} color="#34C759" />
            <Text style={s.webHeaderTitle}>{title}</Text>
          </View>
          <Text style={s.webHeaderSub}>pesapal.com · Secure</Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>
      <WebView
        style={{ flex: 1 }}
        source={{ uri: url }}
        onNavigationStateChange={(nav: any) => handleNavChange(nav.url || "")}
        onShouldStartLoadWithRequest={(req: any) => { handleNavChange(req.url || ""); return true; }}
        onLoad={() => setWebLoading(false)}
        onError={() => onError("Could not load the payment page. Please try again.")}
        javaScriptEnabled domStorageEnabled thirdPartyCookiesEnabled allowsInlineMediaPlayback
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      />
      {webLoading && (
        <View style={[s.webLoader, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={Colors.brand} />
          <Text style={[s.webLoaderText, { color: colors.textMuted }]}>Loading secure checkout…</Text>
        </View>
      )}
      <View style={{ height: insets.bottom, backgroundColor: colors.surface }} />
    </View>
  );
}

// ─── Screen 3: Confirming ─────────────────────────────────────────────────────

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
          style={[s.checkoutBtn, { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: Colors.brand, marginTop: 0 }]}
          onPress={onManualCheck} disabled={checking}
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
        <LinearGradient colors={["#0C2A2E", "#061518"]} style={s.successGradIcon}>
          <Ionicons name="checkmark-circle" size={52} color="#34C759" />
        </LinearGradient>
        <Text style={[s.resultTitle, { color: colors.text }]}>Payment Successful!</Text>
        <Text style={[s.resultSub, { color: colors.textMuted }]}>Your account has been credited immediately.</Text>
        <View style={[s.creditedRow, { backgroundColor: Colors.brand + "12", borderColor: Colors.brand + "25" }]}>
          <Ionicons name="diamond" size={24} color={Colors.brand} />
          <Text style={[s.creditedText, { color: Colors.brand }]}>+{acoinAmount.toLocaleString()} ACoin</Text>
        </View>
        <TouchableOpacity style={[s.checkoutBtn, { backgroundColor: Colors.brand }]} onPress={onDone} activeOpacity={0.85}>
          <Ionicons name="checkmark" size={18} color="#fff" />
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
        <TouchableOpacity style={[s.checkoutBtn, { backgroundColor: Colors.brand }]} onPress={onRetry} activeOpacity={0.85}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={s.checkoutBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 14 }} onPress={onCancel}>
          <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

type Screen = "select" | "checkout" | "confirming" | "success" | "failed";

export default function TopupScreen() {
  const { colors } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [screen, setScreen]               = useState<Screen>("select");
  const [selectedPack, setSelectedPack]   = useState<number | null>(null);
  const [customAmount, setCustomAmount]   = useState("");
  const [redirectUrl, setRedirectUrl]     = useState<string | null>(null);
  const [merchantRef, setMerchantRef]     = useState<string | null>(null);
  const [creditedAcoin, setCreditedAcoin] = useState(0);
  const [loading, setLoading]             = useState(false);
  const [checking, setChecking]           = useState(false);
  const [failureMsg, setFailureMsg]       = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function getAmount(): number {
    if (selectedPack !== null) return ACOIN_PACKAGES[selectedPack].amount;
    return parseInt(customAmount || "0") || 0;
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setRedirectUrl(null); setMerchantRef(null); setCreditedAcoin(0);
    setFailureMsg(""); setLoading(false); setChecking(false);
  }

  async function checkStatus(ref: string): Promise<"completed" | "failed" | "pending"> {
    const { data } = await supabase.from("pesapal_orders").select("status").eq("merchant_reference", ref).maybeSingle();
    return (data?.status as any) || "pending";
  }

  function startPolling(ref: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 60) {
        clearInterval(pollRef.current!);
        setFailureMsg("Confirmation is taking longer than expected. If money was deducted, it will be credited within a few minutes. Contact support if needed.");
        setScreen("failed"); return;
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
      const res = await fetch(`${getEdgeFnBase()}/pesapal-initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acoin_amount: amount, currency: "USD" }),
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

  function handleCheckoutSuccess() { setRedirectUrl(null); setScreen("confirming"); if (merchantRef) startPolling(merchantRef); }
  function handleCheckoutCancel() { if (pollRef.current) clearInterval(pollRef.current); showAlert("Cancelled", "Payment cancelled. No funds were charged."); reset(); setScreen("select"); }
  function handleCheckoutError(msg: string) { if (pollRef.current) clearInterval(pollRef.current); showAlert("Error", msg || "An error occurred."); reset(); setScreen("select"); }

  if (screen === "select") return <SelectScreen insets={insets} colors={colors} profile={profile} selectedPack={selectedPack} setSelectedPack={setSelectedPack} customAmount={customAmount} setCustomAmount={setCustomAmount} loading={loading} onCheckout={startCheckout} />;
  if (screen === "checkout" && redirectUrl) return <CheckoutWebView insets={insets} colors={colors} url={redirectUrl} title="Secure Checkout" onSuccess={handleCheckoutSuccess} onCancel={handleCheckoutCancel} onError={handleCheckoutError} />;
  if (screen === "confirming" || (screen === "checkout" && !redirectUrl)) return <ConfirmingScreen insets={insets} colors={colors} onManualCheck={handleManualCheck} checking={checking} />;
  if (screen === "success") return <SuccessScreen insets={insets} colors={colors} acoinAmount={creditedAcoin} onDone={() => { reset(); refreshProfile(); router.back(); }} />;
  if (screen === "failed") return <FailedScreen colors={colors} failureMsg={failureMsg} onRetry={() => { reset(); setScreen("select"); }} onCancel={() => { reset(); router.back(); }} />;
  return null;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  gradHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 18, gap: 12 },
  gradHeaderTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  gradHeaderSub: { fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "Inter_400Regular", marginTop: 2 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },

  balancePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,188,212,0.12)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  balancePillText: { fontSize: 13, fontFamily: "Inter_700Bold" },

  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 12 },

  packGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 28 },
  packCard: {
    width: (SW - 50) / 2, borderRadius: 18, padding: 16,
    alignItems: "center", position: "relative", borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  packCardSel: { shadowOpacity: 0.12, elevation: 5 },
  popularBadge: { position: "absolute", top: 10, right: 10, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  popularText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  packIconWrap: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  packLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, marginBottom: 4 },
  packAmount: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  packUnit: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 10 },
  packPrice: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
  packPriceText: { fontSize: 13, fontFamily: "Inter_700Bold" },

  customRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, borderWidth: 1.5, marginBottom: 20 },
  customIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  customInput: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium" },

  secureBadge: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 20 },
  secureText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  checkoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 16, width: "100%" },
  checkoutBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  methodRow: { flexDirection: "row", justifyContent: "center", gap: 8 },
  methodPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", justifyContent: "center" },
  methodText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },

  webHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  webHeaderTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  webHeaderSub: { fontSize: 11, color: "#34C759", fontFamily: "Inter_400Regular" },
  webLoader: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  webLoaderText: { marginTop: 12, fontSize: 14, fontFamily: "Inter_400Regular" },

  resultCard: { width: SW - 48, borderRadius: 24, padding: 28, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 4 },
  resultIcon: { width: 88, height: 88, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  resultTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 8 },
  resultSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 24 },

  successGradIcon: { width: 88, height: 88, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  creditedRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1 },
  creditedText: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
});
