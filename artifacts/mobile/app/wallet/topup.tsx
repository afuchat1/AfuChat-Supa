/**
 * AfuChat Wallet — Buy ACoin
 *
 * Payment architecture:
 * ─ Mobile money (MTN/Airtel): initiate → get redirect_url → load it in a
 *   hidden off-screen WebView (triggers USSD/STK push) → poll for status
 *
 * ─ Card (manual): submit card details → Pesapal returns redirect_url for 3DS
 *   verification → show it in a styled in-app WebView → intercept callback URL
 *
 * ─ Card from Google Pay: initiate a googlepay order (no token needed) →
 *   Pesapal returns redirect_url showing Google Pay with user's saved cards →
 *   styled WebView → intercept callback URL
 *
 * ─ Google Pay standalone: same as "Card from Google Pay"
 *
 * Credentials live entirely in Supabase secrets via the edge function.
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
const CALLBACK_URL = "https://afuchat.com/wallet/payment-complete";

let WebView: any = null;
if (Platform.OS !== "web") {
  try { WebView = require("react-native-webview").WebView; } catch {}
}

// ─── Packages ─────────────────────────────────────────────────────────────────

const ACOIN_PACKAGES = [
  { amount: 100,   priceUsd: 1.0,   popular: false },
  { amount: 500,   priceUsd: 5.0,   popular: false },
  { amount: 2000,  priceUsd: 20.0,  popular: true  },
  { amount: 5000,  priceUsd: 50.0,  popular: false },
  { amount: 20000, priceUsd: 200.0, popular: false },
];

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
    const r = (opts.locale || "").split(/[-_]/).pop()?.toUpperCase() || "";
    if (r && MMO_COUNTRIES[r]) return r;
    return TZ_TO_COUNTRY[opts.timeZone || ""] || null;
  } catch { return null; }
}

// ─── Card helpers ─────────────────────────────────────────────────────────────

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
  const d = v.replace(/\D/g, "").slice(0, 16);
  return d.replace(/(.{4})/g, "$1 ").trim();
}
function fmtExpiry(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  if (d.length >= 3) return d.slice(0, 2) + "/" + d.slice(2);
  return d;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function getApiBase(): string {
  const d = process.env.EXPO_PUBLIC_DOMAIN || process.env.EXPO_PUBLIC_REPLIT_DEV_DOMAIN || "";
  if (d) return `https://${d}`;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
}
async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || "";
}

// ─── Brand logos ──────────────────────────────────────────────────────────────

function MtnLogo({ size = 56 }: { size?: number }) {
  const h = Math.round(size * 0.5);
  const r = Math.round(size * 0.12);
  return (
    <View style={{ width: size, height: h, backgroundColor: "#FFCB00", borderRadius: r, alignItems: "center", justifyContent: "center" }}>
      <View style={{ alignItems: "center" }}>
        <View style={{ flexDirection: "row", gap: Math.round(h * 0.07), marginBottom: 1 }}>
          {[0, 1, 2].map(i => (
            <View key={i} style={{ width: Math.round(h * 0.2), height: Math.round(h * 0.2), borderRadius: Math.round(h * 0.1), backgroundColor: "#000", borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} />
          ))}
        </View>
        <Text style={{ color: "#000", fontFamily: "Inter_700Bold", fontSize: Math.round(h * 0.35), letterSpacing: -0.5 }}>mtn</Text>
      </View>
    </View>
  );
}

function AirtelLogo({ size = 56 }: { size?: number }) {
  const h = Math.round(size * 0.5);
  const r = Math.round(size * 0.12);
  const fs = Math.round(h * 0.33);
  return (
    <View style={{ width: size, height: h, backgroundColor: "#E40000", borderRadius: r, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: fs, letterSpacing: -0.2 }}>airtel</Text>
      <View style={{ width: Math.round(size * 0.5), height: Math.round(h * 0.07), borderRadius: 10, backgroundColor: "rgba(255,255,255,0.5)", marginTop: 2 }} />
    </View>
  );
}

function VisaLogo({ size = 40 }: { size?: number }) {
  const h = Math.round(size * 0.58);
  return (
    <View style={{ width: size, height: h, backgroundColor: "#1A1F71", borderRadius: 6, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: Math.round(h * 0.46), fontStyle: "italic" }}>VISA</Text>
    </View>
  );
}

function McardLogo({ size = 40 }: { size?: number }) {
  const r = Math.round(size * 0.27);
  return (
    <View style={{ width: size, height: r * 2, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: r * 2, height: r * 2, borderRadius: r, backgroundColor: "#EB001B" }} />
      <View style={{ width: r * 2, height: r * 2, borderRadius: r, backgroundColor: "#F79E1B", marginLeft: -r * 0.55 }} />
    </View>
  );
}

function CardNetworkBadge({ network }: { network: CardNetwork }) {
  if (network === "visa") return <VisaLogo size={42} />;
  if (network === "mastercard") return <McardLogo size={42} />;
  if (network === "amex") return (
    <View style={{ width: 42, height: 26, backgroundColor: "#016FD0", borderRadius: 5, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 7, textAlign: "center", lineHeight: 8 }}>AMERICAN{"\n"}EXPRESS</Text>
    </View>
  );
  return null;
}

// ─── Shared UI pieces ─────────────────────────────────────────────────────────

function ScreenHeader({ title, onBack, right, insets, colors }: {
  title: string; onBack?: () => void; right?: React.ReactNode;
  insets: any; colors: any;
}) {
  return (
    <View style={[sh.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {onBack
        ? <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        : <View style={{ width: 28 }} />}
      <Text style={[sh.title, { color: colors.text }]}>{title}</Text>
      {right ?? <View style={{ width: 28 }} />}
    </View>
  );
}

function AmountChip({ amount, colors }: { amount: number; colors: any }) {
  return (
    <View style={[sh.chip, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "25" }]}>
      <Ionicons name="diamond" size={15} color={Colors.brand} />
      <Text style={[sh.chipText, { color: Colors.brand }]}>
        {amount.toLocaleString()} ACoin · ${(amount * 0.01).toFixed(2)}
      </Text>
    </View>
  );
}

// ─── Screen: Package Selection ────────────────────────────────────────────────

function SelectScreen({ insets, colors, selectedPack, setSelectedPack, customAmount, setCustomAmount, onContinue, profile }: any) {
  const amount = selectedPack !== null
    ? ACOIN_PACKAGES[selectedPack].amount
    : (parseInt(customAmount || "0") || 0);

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <ScreenHeader title="Buy ACoin" onBack={() => router.back()} insets={insets} colors={colors} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <View style={[sh.chip, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "25", marginBottom: 20 }]}>
          <Ionicons name="diamond" size={15} color={Colors.brand} />
          <Text style={[sh.chipText, { color: Colors.brand }]}>Balance: {(profile?.acoin || 0).toLocaleString()} ACoin</Text>
        </View>

        <Text style={[s.sectionTitle, { color: colors.text }]}>Choose a Package</Text>
        <View style={s.packGrid}>
          {ACOIN_PACKAGES.map((pkg, i) => {
            const sel = selectedPack === i;
            return (
              <TouchableOpacity
                key={i}
                style={[s.packCard, { backgroundColor: colors.surface, borderColor: sel ? Colors.brand : colors.border, borderWidth: sel ? 2 : 1 }]}
                onPress={() => { setSelectedPack(i); setCustomAmount(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.75}
              >
                {pkg.popular && <View style={s.popularBadge}><Text style={s.popularText}>POPULAR</Text></View>}
                <Ionicons name="diamond" size={26} color={sel ? Colors.brand : "#8E8E93"} style={{ marginBottom: 8 }} />
                <Text style={[s.packAmt, { color: colors.text }]}>{pkg.amount.toLocaleString()}</Text>
                <Text style={[s.packLabel, { color: colors.textMuted }]}>ACoin</Text>
                <View style={[s.packPrice, { backgroundColor: sel ? Colors.brand : colors.inputBg }]}>
                  <Text style={[s.packPriceText, { color: sel ? "#fff" : colors.textMuted }]}>${pkg.priceUsd.toFixed(2)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[s.sectionTitle, { color: colors.text, marginTop: 4 }]}>Or enter custom amount</Text>
        <View style={[s.customRow, { backgroundColor: colors.surface, borderColor: !selectedPack && customAmount ? Colors.brand : colors.border }]}>
          <Ionicons name="diamond" size={18} color={Colors.brand} />
          <TextInput
            style={[s.customInput, { color: colors.text }]}
            placeholder="Min. 50 ACoin"
            placeholderTextColor={colors.textMuted}
            value={customAmount}
            onChangeText={(v) => { setCustomAmount(v.replace(/\D/g, "")); setSelectedPack(null); }}
            keyboardType="number-pad"
          />
          {customAmount ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>${((parseInt(customAmount) || 0) * 0.01).toFixed(2)}</Text> : null}
        </View>

        {amount >= 50 && (
          <TouchableOpacity style={[s.continueBtn, { backgroundColor: Colors.brand }]} onPress={onContinue} activeOpacity={0.85}>
            <Text style={s.continueBtnText}>Continue · {amount.toLocaleString()} ACoin (${(amount * 0.01).toFixed(2)})</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Screen: Payment Method ───────────────────────────────────────────────────

function MethodScreen({ insets, colors, acoinAmount, onBack, onSelect }: any) {
  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <ScreenHeader title="Payment Method" onBack={onBack} insets={insets} colors={colors} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <AmountChip amount={acoinAmount} colors={colors} />

        <Text style={[s.sectionTitle, { color: colors.text, marginTop: 20 }]}>Mobile Money</Text>
        <View style={[s.methodGroup, { backgroundColor: colors.surface }]}>
          <MethodRow logo={<MtnLogo size={58} />} title="MTN Mobile Money" sub="Uganda · Rwanda · Ghana" onPress={() => onSelect("mtn")} colors={colors} />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <MethodRow logo={<AirtelLogo size={58} />} title="Airtel Money" sub="Uganda · Tanzania · Kenya" onPress={() => onSelect("airtel")} colors={colors} />
        </View>

        <Text style={[s.sectionTitle, { color: colors.text }]}>Card</Text>
        <View style={[s.methodGroup, { backgroundColor: colors.surface }]}>
          <MethodRow
            logo={<View style={{ flexDirection: "row", gap: 4 }}><VisaLogo size={36} /><McardLogo size={36} /></View>}
            title="Debit / Credit Card"
            sub="Enter manually or use Google Pay saved cards"
            onPress={() => onSelect("card")}
            colors={colors}
          />
        </View>

        <Text style={[s.sectionTitle, { color: colors.text }]}>Digital Wallet</Text>
        <View style={[s.methodGroup, { backgroundColor: colors.surface }]}>
          <MethodRow
            logo={<View style={[s.gpayChip, { backgroundColor: "#000" }]}><Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 }}>G Pay</Text></View>}
            title="Google Pay"
            sub="Pay with your saved Google cards"
            onPress={() => onSelect("google_pay")}
            colors={colors}
          />
        </View>

        <View style={[s.secureNote, { backgroundColor: "#34C75910", borderColor: "#34C75930" }]}>
          <Ionicons name="shield-checkmark" size={16} color="#34C759" />
          <Text style={{ color: "#34C759", fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 }}>
            Payments are processed securely via Pesapal. Your details are encrypted end-to-end.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function MethodRow({ logo, title, sub, onPress, colors }: any) {
  return (
    <TouchableOpacity style={s.methodRow} onPress={onPress} activeOpacity={0.7}>
      <View style={s.methodLogoWrap}>{logo}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.methodTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[s.methodSub, { color: colors.textMuted }]}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Screen: Mobile Money Form ────────────────────────────────────────────────

function MobileFormScreen({ insets, colors, method, acoinAmount, userCountry, loading, onBack, onSubmit }: any) {
  const [number, setNumber] = useState("");
  const isMtn = method === "mtn";
  const accent = isMtn ? "#FFCB00" : "#E40000";
  const textOnAccent = isMtn ? "#000" : "#fff";

  function handleSubmit() {
    const digits = number.trim().replace(/\D/g, "");
    if (digits.length < 7) { showAlert("Invalid Number", "Enter your mobile money number without the country code."); return; }
    const sub = digits.startsWith("0") ? digits.slice(1) : digits;
    onSubmit(`${userCountry?.dialCode ?? "+256"}${sub}`);
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <ScreenHeader title={isMtn ? "MTN Mobile Money" : "Airtel Money"} onBack={onBack} insets={insets} colors={colors} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
          <View style={[s.brandCard, { backgroundColor: accent }]}>
            {isMtn ? <MtnLogo size={72} /> : <AirtelLogo size={72} />}
            <View style={{ flex: 1 }}>
              <Text style={[s.brandName, { color: textOnAccent }]}>{isMtn ? "MTN Mobile Money" : "Airtel Money"}</Text>
              <Text style={[s.brandSub, { color: isMtn ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)" }]}>{isMtn ? "Uganda · Rwanda · Ghana" : "Uganda · Tanzania · Kenya"}</Text>
            </View>
          </View>

          <AmountChip amount={acoinAmount} colors={colors} />

          <Text style={[s.fieldLabel, { color: colors.textMuted, marginTop: 20 }]}>MOBILE MONEY NUMBER</Text>
          <View style={[s.phoneRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.dialPrefix, { borderRightColor: colors.border }]}>
              <Text style={{ fontSize: 18 }}>{userCountry?.flag ?? "🌍"}</Text>
              <Text style={[s.dialCode, { color: colors.text }]}>{userCountry?.dialCode ?? "+256"}</Text>
            </View>
            <TextInput
              style={[s.phoneInput, { color: colors.text }]}
              placeholder="7XX XXX XXX"
              placeholderTextColor={colors.textMuted}
              value={number}
              onChangeText={(v) => setNumber(v.replace(/[^\d\s]/g, ""))}
              keyboardType="phone-pad"
              autoFocus
              maxLength={13}
            />
          </View>
          <Text style={[s.fieldHint, { color: colors.textMuted }]}>Enter without country code. You'll receive a PIN prompt on your phone.</Text>

          <TouchableOpacity
            style={[s.payBtn, { backgroundColor: accent, opacity: loading ? 0.7 : 1 }]}
            onPress={handleSubmit} disabled={loading} activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={textOnAccent} />
              : <><Text style={[s.payBtnText, { color: textOnAccent }]}>Confirm Payment</Text><Ionicons name="lock-closed" size={16} color={textOnAccent} /></>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Screen: Card Form ────────────────────────────────────────────────────────

function CardFormScreen({ insets, colors, acoinAmount, loading, onBack, onSubmit, onGooglePay }: any) {
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
    if (cvv.length < 3) { showAlert("Invalid CVV", "Enter your 3 or 4 digit CVV."); return; }
    onSubmit({ number: digits, expiry_month: parts[0], expiry_year: "20" + parts[1], cvv, name_on_card: name });
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <ScreenHeader title="Card Payment" onBack={onBack} insets={insets} colors={colors} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 48 }}>

          {/* ── Google Pay saved-cards button ── */}
          <TouchableOpacity style={[s.gpayFull, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={onGooglePay} activeOpacity={0.8}>
            <View style={{ backgroundColor: "#000", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>G Pay</Text>
            </View>
            <Text style={[s.gpayFullText, { color: colors.text }]}>Use Google Pay saved cards</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={s.orRow}>
            <View style={[s.orLine, { backgroundColor: colors.border }]} />
            <Text style={[s.orText, { color: colors.textMuted }]}>or enter manually</Text>
            <View style={[s.orLine, { backgroundColor: colors.border }]} />
          </View>

          {/* ── Card preview ── */}
          <View style={[s.cardPreview, { backgroundColor: Colors.brand }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Ionicons name="diamond" size={22} color="rgba(255,255,255,0.75)" />
              <CardNetworkBadge network={network} />
            </View>
            <Text style={s.cardPrevNum}>{number ? fmtCard(number.replace(/\s/g, "")).padEnd(19, " ").slice(0, 19) : "•••• •••• •••• ••••"}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={s.cardPrevLabel}>{name || "CARDHOLDER NAME"}</Text>
              <Text style={s.cardPrevLabel}>{expiry || "MM/YY"}</Text>
            </View>
          </View>

          <AmountChip amount={acoinAmount} colors={colors} />

          {/* Card number */}
          <Text style={[s.fieldLabel, { color: colors.textMuted, marginTop: 20 }]}>CARD NUMBER</Text>
          <View style={[s.cardField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput style={[s.cardInput, { color: colors.text }]} value={number} onChangeText={(v) => setNumber(fmtCard(v))} placeholder="1234 5678 9012 3456" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={19} />
          </View>

          {/* Name */}
          <Text style={[s.fieldLabel, { color: colors.textMuted }]}>CARDHOLDER NAME</Text>
          <View style={[s.cardField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput style={[s.cardInput, { color: colors.text }]} value={name} onChangeText={setName} placeholder="As printed on card" placeholderTextColor={colors.textMuted} autoCapitalize="characters" maxLength={40} />
          </View>

          {/* Expiry + CVV */}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[s.fieldLabel, { color: colors.textMuted }]}>EXPIRY</Text>
              <View style={[s.cardField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput style={[s.cardInput, { color: colors.text }]} value={expiry} onChangeText={(v) => setExpiry(fmtExpiry(v))} placeholder="MM/YY" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={5} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.fieldLabel, { color: colors.textMuted }]}>CVV</Text>
              <View style={[s.cardField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput style={[s.cardInput, { color: colors.text }]} value={cvv} onChangeText={(v) => setCvv(v.replace(/\D/g, "").slice(0, 4))} placeholder="•••" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={4} secureTextEntry />
              </View>
            </View>
          </View>

          <View style={[s.secureNote, { backgroundColor: "#34C75910", borderColor: "#34C75930" }]}>
            <Ionicons name="lock-closed" size={13} color="#34C759" />
            <Text style={{ color: "#34C759", fontSize: 12 }}>Card details are encrypted and never stored on our servers</Text>
          </View>

          <TouchableOpacity style={[s.payBtn, { backgroundColor: Colors.brand, opacity: loading ? 0.7 : 1 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <><Text style={[s.payBtnText, { color: "#fff" }]}>Pay ${(acoinAmount * 0.01).toFixed(2)}</Text><Ionicons name="lock-closed" size={16} color="#fff" /></>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Screen: In-App Payment WebView ──────────────────────────────────────────
// Used for:
//   • Card 3D Secure verification (redirect_url from Pesapal)
//   • Google Pay checkout (redirect_url from Pesapal showing Google Pay)
//
// Intercepts navigation to CALLBACK_URL and resolves payment result.

function PaymentWebView({
  insets, colors, url, title, onSuccess, onCancel, onError,
}: {
  insets: any; colors: any; url: string; title: string;
  onSuccess: () => void; onCancel: () => void; onError: (msg: string) => void;
}) {
  const [webLoading, setWebLoading] = useState(true);

  function handleNavChange(evt: any) {
    const navUrl: string = evt.url || "";
    if (navUrl.startsWith(CALLBACK_URL) || navUrl.includes("payment-complete")) {
      onSuccess();
      return false; // prevent navigation
    }
    // Pesapal failure redirect
    if (navUrl.includes("payment-failed") || navUrl.includes("payment_failed") || navUrl.includes("cancel")) {
      onCancel();
      return false;
    }
    return true;
  }

  if (Platform.OS === "web" || !WebView) {
    return (
      <View style={[s.root, s.centered, { backgroundColor: colors.backgroundSecondary }]}>
        <ScreenHeader title={title} onBack={onCancel} insets={insets} colors={colors} />
        <View style={s.centered}>
          <Ionicons name="globe-outline" size={48} color={colors.textMuted} />
          <Text style={[{ color: colors.textMuted, marginTop: 12, textAlign: "center", paddingHorizontal: 32 }]}>
            Please open this app on your phone to complete the payment.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <ScreenHeader
        title={title}
        onBack={onCancel}
        insets={insets}
        colors={colors}
        right={
          <View style={[s.sslBadge, { backgroundColor: "#34C75915" }]}>
            <Ionicons name="lock-closed" size={12} color="#34C759" />
            <Text style={{ color: "#34C759", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Secure</Text>
          </View>
        }
      />
      {webLoading && (
        <View style={[s.webLoader, { backgroundColor: colors.backgroundSecondary }]}>
          <ActivityIndicator size="large" color={Colors.brand} />
          <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 14 }}>Loading secure payment…</Text>
        </View>
      )}
      <WebView
        source={{ uri: url }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        thirdPartyCookiesEnabled
        onShouldStartLoadWithRequest={handleNavChange}
        onNavigationStateChange={(nav: any) => {
          const navUrl: string = nav.url || "";
          if (navUrl.startsWith(CALLBACK_URL) || navUrl.includes("payment-complete")) {
            onSuccess();
          } else if (navUrl.includes("payment-failed") || navUrl.includes("cancel")) {
            onCancel();
          }
        }}
        onLoad={() => setWebLoading(false)}
        onLoadEnd={() => setWebLoading(false)}
        onError={(e: any) => onError(e.nativeEvent?.description || "Failed to load payment page")}
        onHttpError={(e: any) => {
          if (e.nativeEvent?.statusCode >= 400) onError(`Payment page error (${e.nativeEvent.statusCode})`);
        }}
      />
    </View>
  );
}

// ─── Screen: Mobile Money Processing ─────────────────────────────────────────

function MmoProcessingScreen({
  insets, colors, method, merchantRef, redirectUrl, manualChecking,
  onManualCheck, onCancel, onWebViewLoaded,
}: any) {
  const isMtn = method === "mtn";
  const accent = isMtn ? "#FFCB00" : "#E40000";
  const textOnAccent = isMtn ? "#000" : "#fff";

  return (
    <View style={[s.root, s.centered, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Off-screen WebView — gives a real 1000-px-tall viewport so Pesapal's
          JS executes and fires the USSD/STK push on the user's phone. */}
      {redirectUrl && Platform.OS !== "web" && WebView && (
        <WebView
          source={{ uri: redirectUrl }}
          style={{ position: "absolute", top: -1200, left: 0, width: SW, height: 1000 }}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          onLoad={() => setTimeout(onWebViewLoaded, 4000)}
          onError={onWebViewLoaded}
        />
      )}

      <View style={[s.resultCard, { backgroundColor: colors.surface }]}>
        <View style={{ marginBottom: 20 }}>
          {isMtn ? <MtnLogo size={68} /> : <AirtelLogo size={68} />}
        </View>
        <ActivityIndicator size="large" color={accent} style={{ marginBottom: 16 }} />
        <Text style={[s.resultTitle, { color: colors.text }]}>Processing Payment</Text>
        <Text style={[s.resultSub, { color: colors.textMuted }]}>
          {isMtn
            ? "A PIN prompt has been sent to your phone.\nEnter your MTN Mobile Money PIN to confirm."
            : "A PIN prompt has been sent to your phone.\nEnter your Airtel Money PIN to confirm."}
        </Text>

        {merchantRef && (
          <View style={[s.refBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Reference</Text>
            <Text style={{ color: colors.text, fontSize: 12, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
              {merchantRef.slice(-20)}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[s.payBtn, { backgroundColor: accent, width: "100%", opacity: manualChecking ? 0.7 : 1, marginTop: 16 }]}
          onPress={onManualCheck} disabled={manualChecking}
        >
          {manualChecking
            ? <ActivityIndicator color={textOnAccent} size="small" />
            : <Text style={[s.payBtnText, { color: textOnAccent }]}>I've entered my PIN ✓</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 14 }} onPress={onCancel}>
          <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: "Inter_500Medium" }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen: Success ──────────────────────────────────────────────────────────

function SuccessScreen({ insets, colors, creditedAcoin, onDone }: any) {
  return (
    <View style={[s.root, s.centered, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[s.resultCard, { backgroundColor: colors.surface }]}>
        <View style={[s.resultIconWrap, { backgroundColor: "#34C75918" }]}>
          <Ionicons name="checkmark-circle" size={56} color="#34C759" />
        </View>
        <Text style={[s.resultTitle, { color: colors.text }]}>Payment Successful!</Text>
        <Text style={[s.resultSub, { color: colors.textMuted }]}>Your wallet has been credited</Text>
        <View style={[s.creditedRow, { backgroundColor: Colors.brand + "10" }]}>
          <Ionicons name="diamond" size={22} color={Colors.brand} />
          <Text style={[s.creditedText, { color: Colors.brand }]}>+{creditedAcoin.toLocaleString()} ACoin</Text>
        </View>
        <TouchableOpacity style={[s.payBtn, { backgroundColor: Colors.brand, width: "100%" }]} onPress={onDone}>
          <Text style={[s.payBtnText, { color: "#fff" }]}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen: Failed ───────────────────────────────────────────────────────────

function FailedScreen({ colors, failureMsg, onRetry, onCancel }: any) {
  return (
    <View style={[s.root, s.centered, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[s.resultCard, { backgroundColor: colors.surface }]}>
        <View style={[s.resultIconWrap, { backgroundColor: "#FF3B3018" }]}>
          <Ionicons name="close-circle" size={56} color="#FF3B30" />
        </View>
        <Text style={[s.resultTitle, { color: colors.text }]}>Payment Failed</Text>
        <Text style={[s.resultSub, { color: colors.textMuted }]}>
          {failureMsg || "Your payment could not be completed. No funds were charged."}
        </Text>
        <TouchableOpacity style={[s.payBtn, { backgroundColor: Colors.brand, width: "100%" }]} onPress={onRetry}>
          <Text style={[s.payBtnText, { color: "#fff" }]}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 12 }} onPress={onCancel}>
          <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: "Inter_500Medium" }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

type PaymentMethod = "mtn" | "airtel" | "card" | "google_pay";
type Screen =
  | "select"        // package selection
  | "method"        // payment method picker
  | "mobile_form"   // MTN / Airtel phone input
  | "card_form"     // manual card entry
  | "mmo_processing"// mobile money: off-screen WebView + polling
  | "payment_web"   // card 3DS / Google Pay: full-screen styled WebView
  | "success"
  | "failed";

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

  function reset(goToSelect = true) {
    if (pollRef.current) clearInterval(pollRef.current);
    if (goToSelect) setScreen("select");
    setMerchantRef(null);
    setRedirectUrl(null);
    setCreditedAcoin(0);
    setFailureMsg("");
    setLoading(false);
    setManualChecking(false);
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
      if (attempts > 48) { // 4 minutes
        clearInterval(pollRef.current!);
        setFailureMsg("Confirmation is taking longer than expected. If money was deducted, it will be credited within a few minutes.");
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
        showAlert("Still Pending", "We haven't received confirmation yet. Please complete the PIN prompt on your phone and try again.");
      }
    } catch {}
    setManualChecking(false);
  }

  async function initiatePayment(
    method: PaymentMethod,
    paymentData: Record<string, string> = {}
  ) {
    const amount = getAmount();
    if (amount < 50) { showAlert("Select Package", "Please select at least 50 ACoin."); return; }

    setLoading(true);
    Haptics.selectionAsync();

    try {
      const token = await getAuthToken();
      const res = await fetch(`${getApiBase()}/api/payments/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          acoin_amount: amount,
          currency: "USD",
          payment_method: method,
          payment_data: Object.keys(paymentData).length > 0 ? paymentData : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Payment error (${res.status})`);

      setCreditedAcoin(amount);
      setMerchantRef(data.merchant_reference);
      setActiveMethod(method);

      if (method === "mtn" || method === "airtel") {
        // Mobile money: load redirect_url in off-screen WebView, poll for status
        setRedirectUrl(data.redirect_url || null);
        setScreen("mmo_processing");
        startPolling(data.merchant_reference);
      } else {
        // Card / Google Pay: Pesapal returns a redirect_url for 3DS or GPay checkout
        if (data.redirect_url) {
          setRedirectUrl(data.redirect_url);
          setScreen("payment_web");
          startPolling(data.merchant_reference);
        } else {
          // No redirect_url — already completed (rare) or error
          showAlert("Payment Error", "Could not get payment page URL. Please try again.");
          reset(false);
          setScreen("method");
        }
      }
    } catch (err: any) {
      showAlert("Payment Error", err?.message || "Could not start payment. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (screen === "select") {
    return (
      <SelectScreen
        insets={insets} colors={colors} profile={profile}
        selectedPack={selectedPack} setSelectedPack={setSelectedPack}
        customAmount={customAmount} setCustomAmount={setCustomAmount}
        onContinue={() => setScreen("method")}
      />
    );
  }

  if (screen === "method") {
    return (
      <MethodScreen
        insets={insets} colors={colors} acoinAmount={getAmount()}
        onBack={() => setScreen("select")}
        onSelect={(m: PaymentMethod) => {
          setActiveMethod(m);
          if (m === "mtn" || m === "airtel") setScreen("mobile_form");
          else if (m === "card") setScreen("card_form");
          else initiatePayment("google_pay"); // Google Pay: initiate immediately
        }}
      />
    );
  }

  if (screen === "mobile_form") {
    return (
      <MobileFormScreen
        insets={insets} colors={colors} method={activeMethod}
        acoinAmount={getAmount()} userCountry={userCountry} loading={loading}
        onBack={() => setScreen("method")}
        onSubmit={(phone: string) => initiatePayment(activeMethod as PaymentMethod, { phone_number: phone })}
      />
    );
  }

  if (screen === "card_form") {
    return (
      <CardFormScreen
        insets={insets} colors={colors} acoinAmount={getAmount()} loading={loading}
        onBack={() => setScreen("method")}
        onSubmit={(data: any) => initiatePayment("card", data)}
        onGooglePay={() => initiatePayment("google_pay")} // uses saved Google cards
      />
    );
  }

  if (screen === "mmo_processing") {
    return (
      <MmoProcessingScreen
        insets={insets} colors={colors} method={activeMethod}
        merchantRef={merchantRef} redirectUrl={redirectUrl}
        manualChecking={manualChecking}
        onManualCheck={handleManualCheck}
        onCancel={() => { reset(); }}
        onWebViewLoaded={() => setRedirectUrl(null)} // unmount WebView after push fires
      />
    );
  }

  if (screen === "payment_web" && redirectUrl) {
    const webTitle =
      activeMethod === "google_pay"
        ? "Google Pay"
        : activeMethod === "card"
        ? "Secure Card Payment"
        : "Payment";
    return (
      <PaymentWebView
        insets={insets} colors={colors}
        url={redirectUrl}
        title={webTitle}
        onSuccess={async () => {
          // Callback URL intercepted — wait for IPN then show result
          setScreen("mmo_processing"); // re-use the "checking" spinner while IPN arrives
          setRedirectUrl(null);
          // IPN can take a few seconds; poll faster now
          if (merchantRef) {
            let tries = 0;
            const iv = setInterval(async () => {
              tries++;
              if (tries > 30) { clearInterval(iv); setScreen("failed"); return; }
              try {
                const st = await checkStatus(merchantRef);
                if (st === "completed") {
                  clearInterval(iv);
                  if (pollRef.current) clearInterval(pollRef.current);
                  await refreshProfile();
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setScreen("success");
                } else if (st === "failed") {
                  clearInterval(iv);
                  setFailureMsg("Your payment could not be completed.");
                  setScreen("failed");
                }
              } catch {}
            }, 3000);
          }
        }}
        onCancel={() => {
          if (pollRef.current) clearInterval(pollRef.current);
          showAlert("Payment Cancelled", "You cancelled the payment. No funds were charged.");
          reset();
        }}
        onError={(msg: string) => {
          showAlert("Payment Error", msg);
          reset();
        }}
      />
    );
  }

  // If payment_web but no URL yet — show a brief loading state
  if (screen === "payment_web") {
    return (
      <View style={[s.root, s.centered, { backgroundColor: colors.backgroundSecondary }]}>
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  if (screen === "mmo_processing" && !redirectUrl) {
    // Re-used as a "waiting for IPN" spinner after WebView callback
    return (
      <View style={[s.root, s.centered, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[s.resultCard, { backgroundColor: colors.surface }]}>
          <ActivityIndicator size="large" color={Colors.brand} style={{ marginBottom: 16 }} />
          <Text style={[s.resultTitle, { color: colors.text }]}>Confirming Payment</Text>
          <Text style={[s.resultSub, { color: colors.textMuted }]}>Please wait while we verify your payment…</Text>
        </View>
      </View>
    );
  }

  if (screen === "success") {
    return <SuccessScreen insets={insets} colors={colors} creditedAcoin={creditedAcoin} onDone={() => { reset(); router.back(); }} />;
  }

  if (screen === "failed") {
    return (
      <FailedScreen
        colors={colors} failureMsg={failureMsg}
        onRetry={() => { reset(false); setScreen("select"); }}
        onCancel={() => { reset(); router.back(); }}
      />
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sh = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, borderRadius: 12, borderWidth: 1 },
  chipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, marginBottom: 10, marginTop: 8 },

  // Packages
  packGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  packCard: { width: (SW - 50) / 2, borderRadius: 16, padding: 16, alignItems: "center", position: "relative" },
  popularBadge: { position: "absolute", top: 10, right: 10, backgroundColor: Colors.brand, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  popularText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  packAmt: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  packLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2, marginBottom: 10 },
  packPrice: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  packPriceText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  customRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 16, borderWidth: 1.5, marginBottom: 24 },
  customInput: { flex: 1, fontSize: 17, fontFamily: "Inter_500Medium" },
  continueBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 16 },
  continueBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  // Method
  methodGroup: { borderRadius: 16, overflow: "hidden", marginBottom: 8 },
  methodRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  methodLogoWrap: { width: 66, alignItems: "center" },
  methodTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  methodSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  gpayChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  secureNote: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 16 },

  // Mobile form
  brandCard: { flexDirection: "row", alignItems: "center", gap: 16, padding: 18, borderRadius: 18, marginBottom: 20 },
  brandName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  brandSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  phoneRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1.5, overflow: "hidden", marginBottom: 8 },
  dialPrefix: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 14, borderRightWidth: StyleSheet.hairlineWidth },
  dialCode: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  phoneInput: { flex: 1, paddingHorizontal: 14, fontSize: 17, fontFamily: "Inter_500Medium", paddingVertical: 14 },
  fieldHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 24, lineHeight: 17 },

  // Card form
  gpayFull: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  gpayFullText: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardPreview: { borderRadius: 18, padding: 20, marginBottom: 20, minHeight: 160, justifyContent: "space-between" },
  cardPrevNum: { color: "#fff", fontSize: 19, fontFamily: "Inter_700Bold", letterSpacing: 2, marginVertical: 16 },
  cardPrevLabel: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8, marginTop: 14 },
  cardField: { borderRadius: 12, borderWidth: 1, marginBottom: 0 },
  cardInput: { paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, fontFamily: "Inter_400Regular" },

  // Shared pay button
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 15, marginTop: 20 },
  payBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },

  // WebView
  sslBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  webLoader: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, alignItems: "center", justifyContent: "center" },

  // Processing
  refBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, width: "100%", borderWidth: 1, marginBottom: 8, gap: 8 },

  // Result cards
  resultCard: { width: SW - 48, borderRadius: 24, padding: 28, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 4 },
  resultIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  resultTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 8 },
  resultSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 20 },
  creditedRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginBottom: 24 },
  creditedText: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
});
