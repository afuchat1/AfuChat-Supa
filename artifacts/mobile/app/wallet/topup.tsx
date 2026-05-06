/**
 * AfuChat Wallet — Buy ACoin
 *
 * Payment methods: MTN Mobile Money, Airtel Money, Card, Google Pay
 * All payments via Pesapal edge function — no hosted checkout visible to user.
 *
 * STK push fix: the Pesapal redirect_url is loaded in a full-size off-screen
 * WebView (positioned above the visible area) so JavaScript executes properly
 * and the USSD/STK push fires on the user's phone.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
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

let WebView: any = null;
if (Platform.OS !== "web") {
  try { WebView = require("react-native-webview").WebView; } catch {}
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACOIN_PACKAGES = [
  { amount: 100,   priceUsd: 1.0,   popular: false },
  { amount: 500,   priceUsd: 5.0,   popular: false },
  { amount: 2000,  priceUsd: 20.0,  popular: true  },
  { amount: 5000,  priceUsd: 50.0,  popular: false },
  { amount: 20000, priceUsd: 200.0, popular: false },
];

const PESAPAL_CALLBACK_URL = "https://afuchat.com/wallet/payment-complete";

// ─── Country config ───────────────────────────────────────────────────────────

type MmoCountry = { name: string; dialCode: string; flag: string; mtn: boolean; airtel: boolean };

const MMO_COUNTRIES: Record<string, MmoCountry> = {
  UG: { name: "Uganda",   dialCode: "+256", flag: "🇺🇬", mtn: true,  airtel: true  },
  RW: { name: "Rwanda",   dialCode: "+250", flag: "🇷🇼", mtn: true,  airtel: false },
  GH: { name: "Ghana",    dialCode: "+233", flag: "🇬🇭", mtn: true,  airtel: false },
  TZ: { name: "Tanzania", dialCode: "+255", flag: "🇹🇿", mtn: false, airtel: true  },
  KE: { name: "Kenya",    dialCode: "+254", flag: "🇰🇪", mtn: false, airtel: true  },
};

const TZ_TO_COUNTRY: Record<string, string> = {
  "Africa/Kampala": "UG", "Africa/Kigali": "RW", "Africa/Accra": "GH",
  "Africa/Dar_es_Salaam": "TZ", "Africa/Nairobi": "KE",
};

function detectUserCountry(): string | null {
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions();
    const parts = (opts.locale || "").split(/[-_]/);
    const region = parts[parts.length - 1]?.toUpperCase() || "";
    if (region && MMO_COUNTRIES[region]) return region;
    return TZ_TO_COUNTRY[opts.timeZone || ""] || null;
  } catch { return null; }
}

// ─── Card detection ───────────────────────────────────────────────────────────

type CardNetwork = "visa" | "mastercard" | "amex" | "discover" | "unknown";

function detectCard(n: string): CardNetwork {
  const s = n.replace(/\s/g, "");
  if (/^4/.test(s)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(s)) return "mastercard";
  if (/^3[47]/.test(s)) return "amex";
  if (/^(6011|65|64[4-9])/.test(s)) return "discover";
  return "unknown";
}

function fmtCard(v: string): string {
  const digits = v.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function fmtExpiry(v: string): string {
  const digits = v.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits;
}

// ─── Brand Logos ──────────────────────────────────────────────────────────────

/** MTN Mobile Money — official brand: yellow #FFCB00, black text */
function MtnLogo({ size = 48 }: { size?: number }) {
  const h = Math.round(size * 0.52);
  const radius = Math.round(size * 0.14);
  return (
    <View style={{ width: size, height: h, backgroundColor: "#FFCB00", borderRadius: radius, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <View style={{ alignItems: "center" }}>
        {/* Three arches representing the MTN logo mark */}
        <View style={{ flexDirection: "row", gap: Math.round(h * 0.06), marginBottom: Math.round(h * 0.03) }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{
              width: Math.round(h * 0.22),
              height: Math.round(h * 0.22),
              borderRadius: Math.round(h * 0.11),
              backgroundColor: "#000",
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            }} />
          ))}
        </View>
        <Text style={{ color: "#000", fontFamily: "Inter_700Bold", fontSize: Math.round(h * 0.36), letterSpacing: -0.5, lineHeight: Math.round(h * 0.42) }}>
          mtn
        </Text>
      </View>
    </View>
  );
}

/** Airtel Money — official brand: red #E40000, white text with curved underline */
function AirtelLogo({ size = 48 }: { size?: number }) {
  const h = Math.round(size * 0.52);
  const radius = Math.round(size * 0.14);
  const fontSize = Math.round(h * 0.34);
  return (
    <View style={{ width: size, height: h, backgroundColor: "#E40000", borderRadius: radius, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <View style={{ alignItems: "center" }}>
        <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize, letterSpacing: -0.3, lineHeight: Math.round(h * 0.42) }}>
          airtel
        </Text>
        {/* Curved underline wave */}
        <View style={{ width: Math.round(size * 0.55), height: Math.round(h * 0.08), borderRadius: 20, backgroundColor: "rgba(255,255,255,0.55)", marginTop: 2 }} />
      </View>
    </View>
  );
}

/** Visa logo */
function VisaLogo({ size = 40 }: { size?: number }) {
  const h = Math.round(size * 0.6);
  return (
    <View style={{ width: size, height: h, backgroundColor: "#1A1F71", borderRadius: 6, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: Math.round(h * 0.48), fontStyle: "italic" }}>VISA</Text>
    </View>
  );
}

/** Mastercard logo */
function MastercardLogo({ size = 40 }: { size?: number }) {
  const r = Math.round(size * 0.28);
  const overlap = Math.round(r * 0.55);
  return (
    <View style={{ width: size, height: r * 2, alignItems: "center", justifyContent: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: r * 2, height: r * 2, borderRadius: r, backgroundColor: "#EB001B" }} />
        <View style={{ width: r * 2, height: r * 2, borderRadius: r, backgroundColor: "#F79E1B", marginLeft: -overlap, opacity: 0.9 }} />
      </View>
    </View>
  );
}

/** Card network badge */
function CardBadge({ network }: { network: CardNetwork }) {
  if (network === "visa") return <VisaLogo size={44} />;
  if (network === "mastercard") return <MastercardLogo size={44} />;
  if (network === "amex") return (
    <View style={{ width: 44, height: 28, backgroundColor: "#016FD0", borderRadius: 6, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 8, textAlign: "center", lineHeight: 9 }}>AMERICAN{"\n"}EXPRESS</Text>
    </View>
  );
  return null;
}

// ─── Helper: API base ─────────────────────────────────────────────────────────

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN || process.env.EXPO_PUBLIC_REPLIT_DEV_DOMAIN || "";
  if (domain) return `https://${domain}`;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
}

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || "";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentMethod = "mtn" | "airtel" | "card" | "google_pay";
type Screen = "select" | "method" | "mobile_form" | "card_form" | "google_pay" | "mmo_webview" | "processing" | "success" | "failed";

// ─── Screen: Package Selection ────────────────────────────────────────────────

function SelectScreen({
  insets, colors, selectedPack, setSelectedPack, customAmount, setCustomAmount,
  onContinue, profile,
}: any) {
  const amount = selectedPack !== null ? ACOIN_PACKAGES[selectedPack].amount : parseInt(customAmount || "0") || 0;
  const usd = (amount * 0.01).toFixed(2);

  return (
    <View style={[ss.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
      <View style={[ss.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[ss.headerTitle, { color: colors.text }]}>Buy ACoin</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        {/* Balance chip */}
        <View style={[ss.balanceChip, { backgroundColor: Colors.brand + "12", borderColor: Colors.brand + "30" }]}>
          <Ionicons name="diamond" size={16} color={Colors.brand} />
          <Text style={[ss.balanceChipText, { color: Colors.brand }]}>
            Balance: {(profile?.acoin || 0).toLocaleString()} ACoin
          </Text>
        </View>

        <Text style={[ss.sectionTitle, { color: colors.text }]}>Choose a Package</Text>

        {/* Package grid */}
        <View style={ss.packGrid}>
          {ACOIN_PACKAGES.map((pkg, i) => {
            const sel = selectedPack === i;
            return (
              <TouchableOpacity
                key={i}
                style={[
                  ss.packCard,
                  { backgroundColor: colors.surface, borderColor: sel ? Colors.brand : colors.border },
                  sel && { borderWidth: 2, backgroundColor: Colors.brand + "08" },
                ]}
                onPress={() => { setSelectedPack(i); setCustomAmount(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.75}
              >
                {pkg.popular && (
                  <View style={ss.popularBadge}>
                    <Text style={ss.popularText}>POPULAR</Text>
                  </View>
                )}
                <Ionicons name="diamond" size={26} color={sel ? Colors.brand : "#8E8E93"} style={{ marginBottom: 8 }} />
                <Text style={[ss.packAmount, { color: colors.text }]}>{pkg.amount.toLocaleString()}</Text>
                <Text style={[ss.packLabel, { color: colors.textMuted }]}>ACoin</Text>
                <View style={[ss.packPrice, { backgroundColor: sel ? Colors.brand : colors.inputBg }]}>
                  <Text style={[ss.packPriceText, { color: sel ? "#fff" : colors.textMuted }]}>${pkg.priceUsd.toFixed(2)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom amount */}
        <Text style={[ss.sectionTitle, { color: colors.text, marginTop: 8 }]}>Or enter a custom amount</Text>
        <View style={[ss.customRow, { backgroundColor: colors.surface, borderColor: selectedPack === null && customAmount ? Colors.brand : colors.border }]}>
          <Ionicons name="diamond" size={18} color={Colors.brand} />
          <TextInput
            style={[ss.customInput, { color: colors.text }]}
            placeholder="Min. 50 ACoin"
            placeholderTextColor={colors.textMuted}
            value={customAmount}
            onChangeText={(v) => { setCustomAmount(v.replace(/\D/g, "")); setSelectedPack(null); }}
            keyboardType="number-pad"
          />
          {customAmount ? (
            <Text style={[ss.customUsd, { color: colors.textMuted }]}>= ${((parseInt(customAmount) || 0) * 0.01).toFixed(2)}</Text>
          ) : null}
        </View>

        {/* Continue */}
        {amount >= 50 && (
          <TouchableOpacity
            style={[ss.continueBtn, { backgroundColor: Colors.brand }]}
            onPress={onContinue}
            activeOpacity={0.85}
          >
            <Text style={ss.continueBtnText}>Continue · {amount.toLocaleString()} ACoin (${usd})</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Screen: Payment Method Selection ────────────────────────────────────────

function MethodScreen({ insets, colors, acoinAmount, onBack, onSelect }: any) {
  const usd = (acoinAmount * 0.01).toFixed(2);

  return (
    <View style={[ss.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[ss.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[ss.headerTitle, { color: colors.text }]}>Payment Method</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <View style={[ss.amountSummary, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "25" }]}>
          <Ionicons name="diamond" size={18} color={Colors.brand} />
          <Text style={[ss.amountSummaryText, { color: Colors.brand }]}>
            {acoinAmount.toLocaleString()} ACoin · ${usd}
          </Text>
        </View>

        <Text style={[ss.sectionTitle, { color: colors.text }]}>Mobile Money</Text>
        <View style={[ss.methodGroup, { backgroundColor: colors.surface }]}>
          <MethodRow
            logo={<MtnLogo size={56} />}
            title="MTN Mobile Money"
            subtitle="Uganda · Rwanda · Ghana"
            onPress={() => onSelect("mtn")}
            colors={colors}
          />
          <View style={[ss.methodDivider, { backgroundColor: colors.border }]} />
          <MethodRow
            logo={<AirtelLogo size={56} />}
            title="Airtel Money"
            subtitle="Uganda · Tanzania · Kenya"
            onPress={() => onSelect("airtel")}
            colors={colors}
          />
        </View>

        <Text style={[ss.sectionTitle, { color: colors.text }]}>Card</Text>
        <View style={[ss.methodGroup, { backgroundColor: colors.surface }]}>
          <MethodRow
            logo={
              <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                <VisaLogo size={38} />
                <MastercardLogo size={38} />
              </View>
            }
            title="Debit / Credit Card"
            subtitle="Visa, Mastercard, Amex"
            onPress={() => onSelect("card")}
            colors={colors}
          />
        </View>

        <Text style={[ss.sectionTitle, { color: colors.text }]}>Digital Wallet</Text>
        <View style={[ss.methodGroup, { backgroundColor: colors.surface }]}>
          <MethodRow
            logo={
              <View style={[ss.gpayBox]}>
                <Text style={ss.gpayText}>G Pay</Text>
              </View>
            }
            title="Google Pay"
            subtitle="Pay with your Google account"
            onPress={() => onSelect("google_pay")}
            colors={colors}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function MethodRow({ logo, title, subtitle, onPress, colors }: any) {
  return (
    <TouchableOpacity style={ss.methodRow} onPress={onPress} activeOpacity={0.7}>
      <View style={ss.methodLogoWrap}>{logo}</View>
      <View style={{ flex: 1 }}>
        <Text style={[ss.methodTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[ss.methodSub, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Screen: Mobile Money Form ────────────────────────────────────────────────

function MobileFormScreen({
  insets, colors, method, acoinAmount, userCountry, loading, onBack, onSubmit,
}: any) {
  const [number, setNumber] = useState("");
  const isMtn = method === "mtn";
  const accent = isMtn ? "#FFCB00" : "#E40000";
  const textOnAccent = isMtn ? "#000" : "#fff";

  function handleSubmit() {
    const digits = number.trim().replace(/\D/g, "");
    if (digits.length < 7) { showAlert("Invalid Number", "Enter your mobile money number without the country code."); return; }
    const subscriber = digits.startsWith("0") ? digits.slice(1) : digits;
    onSubmit(`${userCountry?.dialCode ?? "+256"}${subscriber}`);
  }

  return (
    <View style={[ss.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[ss.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[ss.headerTitle, { color: colors.text }]}>{isMtn ? "MTN Mobile Money" : "Airtel Money"}</Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
          {/* Brand card */}
          <View style={[ss.brandCard, { backgroundColor: accent }]}>
            {isMtn ? <MtnLogo size={72} /> : <AirtelLogo size={72} />}
            <View style={{ flex: 1 }}>
              <Text style={[ss.brandName, { color: textOnAccent }]}>{isMtn ? "MTN Mobile Money" : "Airtel Money"}</Text>
              <Text style={[ss.brandRegion, { color: isMtn ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.72)" }]}>
                {isMtn ? "Uganda · Rwanda · Ghana" : "Uganda · Tanzania · Kenya"}
              </Text>
            </View>
          </View>

          {/* Amount summary */}
          <View style={[ss.amountSummary, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "25", marginBottom: 24 }]}>
            <Ionicons name="diamond" size={16} color={Colors.brand} />
            <Text style={[ss.amountSummaryText, { color: Colors.brand }]}>
              {acoinAmount.toLocaleString()} ACoin · ${(acoinAmount * 0.01).toFixed(2)} USD
            </Text>
          </View>

          {/* Country + number */}
          <Text style={[ss.fieldLabel, { color: colors.textMuted }]}>MOBILE MONEY NUMBER</Text>
          <View style={[ss.phoneRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[ss.dialPrefix, { borderRightColor: colors.border }]}>
              <Text style={ss.dialFlag}>{userCountry?.flag ?? "🌍"}</Text>
              <Text style={[ss.dialCode, { color: colors.text }]}>{userCountry?.dialCode ?? "+256"}</Text>
            </View>
            <TextInput
              style={[ss.phoneInput, { color: colors.text }]}
              placeholder="7XX XXX XXX"
              placeholderTextColor={colors.textMuted}
              value={number}
              onChangeText={(v) => setNumber(v.replace(/[^\d\s]/g, ""))}
              keyboardType="phone-pad"
              autoFocus
              maxLength={13}
            />
          </View>
          <Text style={[ss.fieldHint, { color: colors.textMuted }]}>
            Enter your number without the country code. You'll receive a PIN prompt on your phone.
          </Text>

          <TouchableOpacity
            style={[ss.payBtn, { backgroundColor: accent, opacity: loading ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={textOnAccent} />
              : <>
                  <Text style={[ss.payBtnText, { color: textOnAccent }]}>Confirm Payment</Text>
                  <Ionicons name="lock-closed" size={16} color={textOnAccent} />
                </>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Screen: Card Form ────────────────────────────────────────────────────────

function CardFormScreen({ insets, colors, acoinAmount, loading, onBack, onSubmit }: any) {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");
  const network = detectCard(number);

  function handleSubmit() {
    const digits = number.replace(/\s/g, "");
    if (digits.length < 13) { showAlert("Invalid Card", "Enter a valid card number."); return; }
    const parts = expiry.split("/");
    if (parts.length !== 2 || parts[0].length !== 2 || parts[1].length !== 2) { showAlert("Invalid Expiry", "Use MM/YY format."); return; }
    if (cvv.length < 3) { showAlert("Invalid CVV", "Enter a valid CVV."); return; }
    onSubmit({ number: digits, expiry_month: parts[0], expiry_year: "20" + parts[1], cvv, name_on_card: name });
  }

  return (
    <View style={[ss.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[ss.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[ss.headerTitle, { color: colors.text }]}>Card Payment</Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
          {/* Mini card preview */}
          <View style={[ss.cardPreview, { backgroundColor: Colors.brand }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Ionicons name="diamond" size={22} color="rgba(255,255,255,0.8)" />
              <CardBadge network={network} />
            </View>
            <Text style={ss.cardPreviewNumber}>
              {number ? number.padEnd(19, " •").slice(0, 19) : "•••• •••• •••• ••••"}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={ss.cardPreviewName}>{name || "CARDHOLDER NAME"}</Text>
              <Text style={ss.cardPreviewExpiry}>{expiry || "MM/YY"}</Text>
            </View>
          </View>

          <View style={[ss.amountSummary, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "25", marginBottom: 20 }]}>
            <Ionicons name="diamond" size={16} color={Colors.brand} />
            <Text style={[ss.amountSummaryText, { color: Colors.brand }]}>
              {acoinAmount.toLocaleString()} ACoin · ${(acoinAmount * 0.01).toFixed(2)} USD
            </Text>
          </View>

          {[
            { label: "CARD NUMBER", value: number, setter: (v: string) => setNumber(fmtCard(v)), placeholder: "1234 5678 9012 3456", keyboard: "number-pad" as const, maxLen: 19 },
            { label: "CARDHOLDER NAME", value: name, setter: setName, placeholder: "As printed on card", keyboard: "default" as const, maxLen: 40 },
          ].map(({ label, value, setter, placeholder, keyboard, maxLen }) => (
            <View key={label}>
              <Text style={[ss.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
              <View style={[ss.cardField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  style={[ss.cardInput, { color: colors.text }]}
                  value={value}
                  onChangeText={setter}
                  placeholder={placeholder}
                  placeholderTextColor={colors.textMuted}
                  keyboardType={keyboard}
                  maxLength={maxLen}
                  autoCapitalize={keyboard === "default" ? "characters" : "none"}
                />
              </View>
            </View>
          ))}

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[ss.fieldLabel, { color: colors.textMuted }]}>EXPIRY</Text>
              <View style={[ss.cardField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  style={[ss.cardInput, { color: colors.text }]}
                  value={expiry}
                  onChangeText={(v) => setExpiry(fmtExpiry(v))}
                  placeholder="MM/YY"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ss.fieldLabel, { color: colors.textMuted }]}>CVV</Text>
              <View style={[ss.cardField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  style={[ss.cardInput, { color: colors.text }]}
                  value={cvv}
                  onChangeText={(v) => setCvv(v.replace(/\D/g, "").slice(0, 4))}
                  placeholder="•••"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                />
              </View>
            </View>
          </View>

          <View style={[ss.secureRow, { backgroundColor: "#34C75910", borderColor: "#34C75930" }]}>
            <Ionicons name="lock-closed" size={14} color="#34C759" />
            <Text style={[ss.secureText, { color: "#34C759" }]}>Your card details are encrypted and never stored</Text>
          </View>

          <TouchableOpacity
            style={[ss.payBtn, { backgroundColor: Colors.brand, opacity: loading ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Text style={[ss.payBtnText, { color: "#fff" }]}>Pay ${(acoinAmount * 0.01).toFixed(2)}</Text>
                  <Ionicons name="lock-closed" size={16} color="#fff" />
                </>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Screen: Processing ───────────────────────────────────────────────────────

function ProcessingScreen({
  insets, colors, processingMethod, merchantRef, redirectUrl, manualChecking,
  onManualCheck, onCancel, onWebViewLoad, onWebViewError,
}: any) {
  const isMmo = processingMethod === "mtn" || processingMethod === "airtel";
  const isMtn = processingMethod === "mtn";

  const hint = isMtn
    ? "Check your phone for an MTN Mobile Money PIN prompt and enter your PIN."
    : processingMethod === "airtel"
    ? "Check your phone for an Airtel Money PIN prompt and enter your PIN."
    : processingMethod === "google_pay"
    ? "Waiting for Google Pay confirmation…"
    : "Verifying your card payment…";

  return (
    <View style={[ss.root, ss.centeredScreen, { backgroundColor: colors.backgroundSecondary }]}>
      {/* ── Hidden off-screen WebView — triggers Pesapal STK push ──────────────
          Positioned above the viewport with real dimensions so JS executes.
          The user only sees the card below it. */}
      {isMmo && redirectUrl && Platform.OS !== "web" && WebView && (
        <WebView
          source={{ uri: redirectUrl }}
          style={{
            position: "absolute",
            top: -1200,
            left: 0,
            width: SW,
            height: 1000,
          }}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          onLoad={() => {
            // Give Pesapal 4 s to fire the STK push, then unmount the WebView
            setTimeout(onWebViewLoad, 4000);
          }}
          onError={onWebViewError}
          onHttpError={onWebViewError}
        />
      )}

      <View style={[ss.processingCard, { backgroundColor: colors.surface }]}>
        {/* Brand icon */}
        <View style={{ marginBottom: 20 }}>
          {isMmo
            ? (isMtn ? <MtnLogo size={68} /> : <AirtelLogo size={68} />)
            : processingMethod === "card"
            ? <View style={[ss.processingIconWrap, { backgroundColor: Colors.brand + "15" }]}><Ionicons name="card" size={32} color={Colors.brand} /></View>
            : <View style={[ss.processingIconWrap, { backgroundColor: "#4285F415" }]}><Text style={{ fontSize: 28 }}>G</Text></View>}
        </View>

        <ActivityIndicator size="large" color={isMtn ? "#FFCB00" : processingMethod === "airtel" ? "#E40000" : Colors.brand} style={{ marginBottom: 16 }} />
        <Text style={[ss.processingTitle, { color: colors.text }]}>Processing Payment</Text>
        <Text style={[ss.processingSub, { color: colors.textMuted }]}>{hint}</Text>

        {merchantRef && (
          <View style={[ss.refBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[ss.refLabel, { color: colors.textMuted }]}>Reference</Text>
            <Text style={[ss.refValue, { color: colors.text }]} numberOfLines={1} selectable>
              {merchantRef.slice(-20)}
            </Text>
          </View>
        )}

        {isMmo && (
          <TouchableOpacity
            style={[ss.checkBtn, { backgroundColor: isMtn ? "#FFCB00" : "#E40000", opacity: manualChecking ? 0.7 : 1 }]}
            onPress={onManualCheck}
            disabled={manualChecking}
          >
            {manualChecking
              ? <ActivityIndicator color={isMtn ? "#000" : "#fff"} size="small" />
              : <Text style={[ss.checkBtnText, { color: isMtn ? "#000" : "#fff" }]}>I've completed the payment</Text>}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={{ marginTop: 14 }} onPress={onCancel}>
          <Text style={[ss.cancelLink, { color: colors.textMuted }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen: Success ──────────────────────────────────────────────────────────

function SuccessScreen({ insets, colors, creditedAcoin, onDone }: any) {
  return (
    <View style={[ss.root, ss.centeredScreen, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[ss.resultCard, { backgroundColor: colors.surface }]}>
        <View style={[ss.resultIconWrap, { backgroundColor: "#34C75918" }]}>
          <Ionicons name="checkmark-circle" size={52} color="#34C759" />
        </View>
        <Text style={[ss.resultTitle, { color: colors.text }]}>Payment Successful!</Text>
        <Text style={[ss.resultSub, { color: colors.textMuted }]}>
          Your wallet has been credited
        </Text>
        <View style={[ss.creditedRow, { backgroundColor: Colors.brand + "10" }]}>
          <Ionicons name="diamond" size={20} color={Colors.brand} />
          <Text style={[ss.creditedText, { color: Colors.brand }]}>
            +{creditedAcoin.toLocaleString()} ACoin
          </Text>
        </View>
        <TouchableOpacity
          style={[ss.doneBtn, { backgroundColor: Colors.brand }]}
          onPress={onDone}
          activeOpacity={0.85}
        >
          <Text style={ss.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen: Failed ───────────────────────────────────────────────────────────

function FailedScreen({ insets, colors, failureMsg, onRetry, onCancel }: any) {
  return (
    <View style={[ss.root, ss.centeredScreen, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[ss.resultCard, { backgroundColor: colors.surface }]}>
        <View style={[ss.resultIconWrap, { backgroundColor: "#FF3B3018" }]}>
          <Ionicons name="close-circle" size={52} color="#FF3B30" />
        </View>
        <Text style={[ss.resultTitle, { color: colors.text }]}>Payment Failed</Text>
        <Text style={[ss.resultSub, { color: colors.textMuted }]}>
          {failureMsg || "Your payment could not be completed. No funds were charged."}
        </Text>
        <TouchableOpacity
          style={[ss.doneBtn, { backgroundColor: Colors.brand }]}
          onPress={onRetry}
          activeOpacity={0.85}
        >
          <Text style={ss.doneBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 12 }} onPress={onCancel}>
          <Text style={[ss.cancelLink, { color: colors.textMuted }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function TopupScreen() {
  const { colors } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>("select");
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [activeMethod, setActiveMethod] = useState<PaymentMethod | null>(null);
  const [merchantRef, setMerchantRef] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [creditedAcoin, setCreditedAcoin] = useState(0);
  const [loading, setLoading] = useState(false);
  const [manualChecking, setManualChecking] = useState(false);
  const [failureMsg, setFailureMsg] = useState("");
  const [userCountry, setUserCountry] = useState<MmoCountry | null | undefined>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const code = detectUserCountry();
    setUserCountry(code ? (MMO_COUNTRIES[code] ?? null) : null);
  }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function getAmount(): number {
    if (selectedPack !== null) return ACOIN_PACKAGES[selectedPack].amount;
    return parseInt(customAmount || "0") || 0;
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setScreen("select");
    setMerchantRef(null);
    setRedirectUrl(null);
    setSelectedPack(null);
    setCustomAmount("");
    setCreditedAcoin(0);
    setFailureMsg("");
    setLoading(false);
    setManualChecking(false);
    setActiveMethod(null);
  }

  async function checkStatus(ref: string): Promise<"completed" | "failed" | "pending"> {
    const { data } = await supabase.from("pesapal_orders").select("status").eq("merchant_reference", ref).maybeSingle();
    return (data?.status as any) || "pending";
  }

  const startPolling = useCallback((ref: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 40) {
        clearInterval(pollRef.current!);
        setFailureMsg("Payment confirmation is taking longer than expected. If money was deducted, it will be credited automatically within a few minutes.");
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
  }, [refreshProfile]);

  async function handleManualCheck() {
    if (!merchantRef || manualChecking) return;
    setManualChecking(true);
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
        showAlert("Still Pending", "We haven't received confirmation yet. Please complete the PIN prompt on your phone and try again in a moment.");
      }
    } catch {}
    setManualChecking(false);
  }

  async function initiatePayment(method: PaymentMethod, paymentData: Record<string, string>) {
    const amount = getAmount();
    if (amount < 50) { showAlert("Select Package", "Please select or enter at least 50 ACoin."); return; }

    setLoading(true);
    Haptics.selectionAsync();

    try {
      const token = await getAuthToken();
      const res = await fetch(`${getApiBase()}/api/payments/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acoin_amount: amount, currency: "USD", payment_method: method, payment_data: paymentData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Payment error (${res.status})`);

      setCreditedAcoin(amount);
      setMerchantRef(data.merchant_reference);
      setActiveMethod(method);

      // Store redirect_url for mobile money so the hidden WebView can load it
      // and trigger the USSD/STK push on the user's phone.
      if ((method === "mtn" || method === "airtel") && data.redirect_url) {
        setRedirectUrl(data.redirect_url);
      }

      setScreen("processing");
      startPolling(data.merchant_reference);
    } catch (err: any) {
      showAlert("Payment Error", err?.message || "Could not start payment. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Google Pay message handler ────────────────────────────────────────────
  const handleGpayMsg = useCallback(async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "success") {
        const gpToken = JSON.stringify(msg.data?.paymentMethodData?.tokenizationData?.token || msg.data);
        await initiatePayment("google_pay", { token: gpToken });
      } else if (msg.type === "cancel") {
        setScreen("method");
      } else if (msg.type === "unavailable") {
        showAlert("Google Pay Unavailable", "Google Pay is not available on this device. Please use another payment method.");
        setScreen("method");
      } else if (msg.type === "error") {
        showAlert("Google Pay Error", msg.message || "Google Pay payment failed.");
        setScreen("method");
      }
    } catch {}
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (screen === "select") {
    return (
      <SelectScreen
        insets={insets} colors={colors}
        selectedPack={selectedPack} setSelectedPack={setSelectedPack}
        customAmount={customAmount} setCustomAmount={setCustomAmount}
        profile={profile}
        onContinue={() => setScreen("method")}
      />
    );
  }

  if (screen === "method") {
    return (
      <MethodScreen
        insets={insets} colors={colors}
        acoinAmount={getAmount()}
        onBack={() => setScreen("select")}
        onSelect={(method: PaymentMethod) => {
          setActiveMethod(method);
          if (method === "mtn" || method === "airtel") setScreen("mobile_form");
          else if (method === "card") setScreen("card_form");
          else setScreen("google_pay");
        }}
      />
    );
  }

  if (screen === "mobile_form") {
    return (
      <MobileFormScreen
        insets={insets} colors={colors}
        method={activeMethod}
        acoinAmount={getAmount()}
        userCountry={userCountry}
        loading={loading}
        onBack={() => setScreen("method")}
        onSubmit={(phone: string) => initiatePayment(activeMethod as PaymentMethod, { phone_number: phone })}
      />
    );
  }

  if (screen === "card_form") {
    return (
      <CardFormScreen
        insets={insets} colors={colors}
        acoinAmount={getAmount()}
        loading={loading}
        onBack={() => setScreen("method")}
        onSubmit={(data: any) => initiatePayment("card", data)}
      />
    );
  }

  if (screen === "google_pay" && Platform.OS !== "web" && WebView) {
    const amount = getAmount();
    const AMOUNT = (amount * 0.01).toFixed(2);
    const gpayHTML = `
<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://pay.google.com/gp/p/js/pay.js"></script>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:transparent;}</style>
</head><body>
<div id="gpay-btn"></div>
<script>
const req = {
  apiVersion:2,apiVersionMinor:0,
  allowedPaymentMethods:[{type:"CARD",parameters:{allowedAuthMethods:["PAN_ONLY","CRYPTOGRAM_3DS"],allowedCardNetworks:["MASTERCARD","VISA"]},tokenizationSpecification:{type:"PAYMENT_GATEWAY",parameters:{gateway:"pesapal",gatewayMerchantId:"AfuChat"}}}],
  merchantInfo:{merchantId:"BCR2DN4TY4MH7BZD",merchantName:"AfuChat"},
  transactionInfo:{totalPriceStatus:"FINAL",totalPriceLabel:"ACoin Top-up",totalPrice:"${AMOUNT}",currencyCode:"USD",countryCode:"UG"}
};
function postMsg(o){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(o));}
function onGPLoad(){
  const c=new google.payments.api.PaymentsClient({environment:"PRODUCTION"});
  c.isReadyToPay({apiVersion:2,apiVersionMinor:0,allowedPaymentMethods:req.allowedPaymentMethods}).then(r=>{
    if(r.result){
      const b=c.createButton({onClick:()=>c.loadPaymentData(req).then(d=>postMsg({type:"success",data:d})).catch(e=>{if(e.statusCode==="CANCELED")postMsg({type:"cancel"});else postMsg({type:"error",message:e.message});})});
      document.getElementById("gpay-btn").appendChild(b);
      setTimeout(()=>b.click(),400);
    } else postMsg({type:"unavailable"});
  }).catch(()=>postMsg({type:"unavailable"}));
}
</script>
<script async src="https://pay.google.com/gp/p/js/pay.js" onload="onGPLoad()"></script>
</body></html>`;
    return (
      <View style={[ss.root, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[ss.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setScreen("method")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[ss.headerTitle, { color: colors.text }]}>Google Pay</Text>
          <View style={{ width: 28 }} />
        </View>
        <WebView
          source={{ html: gpayHTML }}
          style={{ flex: 1 }}
          onMessage={handleGpayMsg}
          javaScriptEnabled
        />
      </View>
    );
  }

  if (screen === "processing") {
    return (
      <ProcessingScreen
        insets={insets}
        colors={colors}
        processingMethod={activeMethod}
        merchantRef={merchantRef}
        redirectUrl={redirectUrl}
        manualChecking={manualChecking}
        onManualCheck={handleManualCheck}
        onCancel={() => { if (pollRef.current) clearInterval(pollRef.current); reset(); }}
        onWebViewLoad={() => setRedirectUrl(null)}
        onWebViewError={() => setRedirectUrl(null)}
      />
    );
  }

  if (screen === "success") {
    return (
      <SuccessScreen
        insets={insets}
        colors={colors}
        creditedAcoin={creditedAcoin}
        onDone={() => { reset(); router.back(); }}
      />
    );
  }

  if (screen === "failed") {
    return (
      <FailedScreen
        insets={insets}
        colors={colors}
        failureMsg={failureMsg}
        onRetry={() => { if (pollRef.current) clearInterval(pollRef.current); setScreen("select"); setMerchantRef(null); setRedirectUrl(null); setFailureMsg(""); }}
        onCancel={() => { reset(); router.back(); }}
      />
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1 },
  centeredScreen: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },

  // Balance chip
  balanceChip: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 20 },
  balanceChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Section title
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, marginBottom: 10, marginTop: 4 },

  // Package grid
  packGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  packCard: { width: (SW - 50) / 2, borderRadius: 16, padding: 16, borderWidth: 1, alignItems: "center", position: "relative" },
  popularBadge: { position: "absolute", top: 10, right: 10, backgroundColor: Colors.brand, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  popularText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  packAmount: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  packLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2, marginBottom: 10 },
  packPrice: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  packPriceText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Custom amount
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 24,
  },
  customInput: { flex: 1, fontSize: 17, fontFamily: "Inter_500Medium" },
  customUsd: { fontSize: 13 },

  // Continue button
  continueBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 16 },
  continueBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  // Amount summary
  amountSummary: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  amountSummaryText: { fontSize: 14, fontFamily: "Inter_700Bold" },

  // Method group
  methodGroup: { borderRadius: 16, overflow: "hidden", marginBottom: 8 },
  methodRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  methodLogoWrap: { width: 64, alignItems: "center" },
  methodTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  methodSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  methodDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  // Google Pay box
  gpayBox: { backgroundColor: "#000", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  gpayText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: -0.3 },

  // Brand card
  brandCard: { flexDirection: "row", alignItems: "center", gap: 16, padding: 18, borderRadius: 18, marginBottom: 20 },
  brandName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  brandRegion: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  // Phone input
  phoneRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1.5, overflow: "hidden", marginBottom: 8 },
  dialPrefix: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 14, borderRightWidth: StyleSheet.hairlineWidth },
  dialFlag: { fontSize: 20 },
  dialCode: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  phoneInput: { flex: 1, paddingHorizontal: 14, fontSize: 17, fontFamily: "Inter_500Medium", paddingVertical: 14 },

  // Card preview
  cardPreview: { borderRadius: 18, padding: 20, marginBottom: 20, minHeight: 160, justifyContent: "space-between" },
  cardPreviewNumber: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: 2, marginVertical: 20 },
  cardPreviewName: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  cardPreviewExpiry: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Card fields
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8, marginTop: 16 },
  fieldHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 24, lineHeight: 17 },
  cardField: { borderRadius: 12, borderWidth: 1, marginBottom: 0 },
  cardInput: { paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, fontFamily: "Inter_400Regular" },

  // Secure badge
  secureRow: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 16 },
  secureText: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },

  // Pay button
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 16, marginTop: 24 },
  payBtnText: { fontSize: 17, fontFamily: "Inter_700Bold" },

  // Processing card
  processingCard: { width: SW - 48, borderRadius: 24, padding: 28, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 4 },
  processingIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  processingTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 8 },
  processingSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 20 },

  // Ref box
  refBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, width: "100%", borderWidth: 1, marginBottom: 16 },
  refLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  refValue: { fontSize: 12, fontFamily: "Inter_600SemiBold", maxWidth: "60%" },

  // Manual check
  checkBtn: { borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", width: "100%", marginBottom: 4 },
  checkBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cancelLink: { fontSize: 14, fontFamily: "Inter_500Medium" },

  // Result card
  resultCard: { width: SW - 48, borderRadius: 24, padding: 28, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 4 },
  resultIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  resultTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 8 },
  resultSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 20 },
  creditedRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginBottom: 24 },
  creditedText: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  doneBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, alignItems: "center", width: "100%" },
  doneBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
});
