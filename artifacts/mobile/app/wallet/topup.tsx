import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
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

let WebView: any = null;
if (Platform.OS !== "web") {
  const wv = require("react-native-webview");
  WebView = wv.WebView;
}

// ─── ACoin packages ───────────────────────────────────────────────────────────

const ACOIN_PACKAGES = [
  { label: "100 ACoin", amount: 100, priceUsd: 1.0 },
  { label: "500 ACoin", amount: 500, priceUsd: 5.0 },
  { label: "2,000 ACoin", amount: 2000, priceUsd: 20.0 },
  { label: "5,000 ACoin", amount: 5000, priceUsd: 50.0 },
  { label: "20,000 ACoin", amount: 20000, priceUsd: 200.0 },
];

type PaymentMethod = "google_pay" | "card" | "mtn" | "airtel";
type Screen =
  | "select"
  | "method"
  | "card_form"
  | "mobile_form"
  | "google_pay"
  | "mmo_webview"
  | "processing"
  | "verifying"
  | "success"
  | "failed";

const PESAPAL_CALLBACK_URL = "https://afuchat.com/wallet/payment-complete";

// ─── Mobile money country config ──────────────────────────────────────────────

type MmoCountry = {
  name: string;
  dialCode: string;
  flag: string;
  mtn: boolean;
  airtel: boolean;
};

const MMO_COUNTRIES: Record<string, MmoCountry> = {
  UG: { name: "Uganda",   dialCode: "+256", flag: "🇺🇬", mtn: true,  airtel: true  },
  RW: { name: "Rwanda",   dialCode: "+250", flag: "🇷🇼", mtn: true,  airtel: false },
  GH: { name: "Ghana",    dialCode: "+233", flag: "🇬🇭", mtn: true,  airtel: false },
  TZ: { name: "Tanzania", dialCode: "+255", flag: "🇹🇿", mtn: false, airtel: true  },
  KE: { name: "Kenya",    dialCode: "+254", flag: "🇰🇪", mtn: false, airtel: true  },
};

const TZ_TO_COUNTRY: Record<string, string> = {
  "Africa/Kampala":       "UG",
  "Africa/Kigali":        "RW",
  "Africa/Accra":         "GH",
  "Africa/Dar_es_Salaam": "TZ",
  "Africa/Nairobi":       "KE",
};

function detectUserCountry(): string | null {
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions();
    // e.g. "en-UG" → "UG"
    const localeParts = (opts.locale || "").split(/[-_]/);
    const regionFromLocale = localeParts.length >= 2
      ? localeParts[localeParts.length - 1].toUpperCase()
      : "";
    if (regionFromLocale && MMO_COUNTRIES[regionFromLocale]) return regionFromLocale;
    // Fall back to timezone
    return TZ_TO_COUNTRY[opts.timeZone || ""] || null;
  } catch {
    return null;
  }
}

// ─── Card network detection ───────────────────────────────────────────────────

type CardNetwork = "visa" | "mastercard" | "amex" | "discover" | "unknown";

function detectCardNetwork(number: string): CardNetwork {
  const n = number.replace(/\s/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2(2[2-9][1-9]|[3-6]\d{2}|7[01]\d|720))/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^(6011|622(1(2[6-9]|[3-9]\d)|[2-8]\d{2}|9([01]\d|2[0-5]))|64[4-9]|65)/.test(n)) return "discover";
  return "unknown";
}

// ─── Card network logos (inline SVG-style React Native components) ─────────────

function VisaLogo({ size = 36 }: { size?: number }) {
  const h = Math.round(size * 0.56);
  return (
    <View style={[cardLogoStyles.container, { width: size, height: h, backgroundColor: "#1A1F71", borderRadius: 4 }]}>
      <Text style={[cardLogoStyles.visaText, { fontSize: h * 0.52 }]}>VISA</Text>
    </View>
  );
}

function MastercardLogo({ size = 36 }: { size?: number }) {
  const h = Math.round(size * 0.56);
  const circR = h * 0.44;
  const overlap = circR * 0.35;
  const totalW = circR * 2 * 2 - overlap;
  return (
    <View style={{ width: size, height: h, alignItems: "center", justifyContent: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", width: totalW }}>
        <View style={{ width: circR * 2, height: circR * 2, borderRadius: circR, backgroundColor: "#EB001B" }} />
        <View style={{ width: circR * 2, height: circR * 2, borderRadius: circR, backgroundColor: "#F79E1B", marginLeft: -overlap, opacity: 0.92 }} />
      </View>
    </View>
  );
}

function AmexLogo({ size = 36 }: { size?: number }) {
  const h = Math.round(size * 0.56);
  return (
    <View style={[cardLogoStyles.container, { width: size, height: h, backgroundColor: "#016FD0", borderRadius: 4 }]}>
      <Text style={[cardLogoStyles.amexText, { fontSize: h * 0.38 }]}>AMERICAN{"\n"}EXPRESS</Text>
    </View>
  );
}

function DiscoverLogo({ size = 36 }: { size?: number }) {
  const h = Math.round(size * 0.56);
  return (
    <View style={[cardLogoStyles.container, { width: size, height: h, backgroundColor: "#FFFFFF", borderRadius: 4, borderWidth: 1, borderColor: "#E0E0E0" }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <Text style={[cardLogoStyles.discoverText, { fontSize: h * 0.35 }]}>DISCOVER</Text>
        <View style={{ width: h * 0.38, height: h * 0.38, borderRadius: h * 0.19, backgroundColor: "#F76F20" }} />
      </View>
    </View>
  );
}

function CardNetworkLogo({ network, size = 36 }: { network: CardNetwork; size?: number }) {
  if (network === "visa") return <VisaLogo size={size} />;
  if (network === "mastercard") return <MastercardLogo size={size} />;
  if (network === "amex") return <AmexLogo size={size} />;
  if (network === "discover") return <DiscoverLogo size={size} />;
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      <VisaLogo size={size * 0.8} />
      <MastercardLogo size={size * 0.8} />
    </View>
  );
}

const cardLogoStyles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  visaText: { color: "#FFFFFF", fontStyle: "italic", fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  amexText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 7, textAlign: "center", lineHeight: 8 },
  discoverText: { color: "#231F20", fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
});

// ─── MTN Logo ─────────────────────────────────────────────────────────────────

function MtnLogo({ size = 44 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#FFCB00", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.27, fontFamily: "Inter_700Bold", color: "#000000", letterSpacing: -0.5 }}>MTN</Text>
    </View>
  );
}

// ─── Airtel Logo ──────────────────────────────────────────────────────────────

function AirtelLogo({ size = 44 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#E40000", alignItems: "center", justifyContent: "center" }}>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: size * 0.42, height: size * 0.42 * 0.55, borderTopLeftRadius: size * 0.21, borderTopRightRadius: size * 0.21, borderWidth: size * 0.055, borderBottomWidth: 0, borderColor: "#FFFFFF" }} />
        <View style={{ width: size * 0.08, height: size * 0.18, backgroundColor: "#FFFFFF", marginTop: -size * 0.02, borderBottomLeftRadius: size * 0.04, borderBottomRightRadius: size * 0.04 }} />
      </View>
    </View>
  );
}

// ─── API helper ───────────────────────────────────────────────────────────────

function getApiBase(): string {
  const explicit = (process.env.EXPO_PUBLIC_API_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin.replace(/\/+$/, "");
  }
  const domain = (process.env.EXPO_PUBLIC_DOMAIN || "").trim();
  if (domain) return `https://${domain}`.replace(/\/+$/, "");
  return "";
}

async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired. Please sign in again.");
  return session.access_token;
}

// ─── Google Pay HTML ──────────────────────────────────────────────────────────

function buildGooglePayHtml(amountUsd: string, isDark: boolean): string {
  const bg = isDark ? "#0F0F0F" : "#FFFFFF";
  const text = isDark ? "#F1F1F1" : "#0F0F0F";
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { background: ${bg}; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    #container { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px; width: 100%; max-width: 400px; }
    #status { color: ${text}; font-family: -apple-system, sans-serif; font-size: 14px; text-align: center; min-height: 20px; }
    #google-pay-button { width: 100%; min-height: 48px; }
    .spinner { width: 32px; height: 32px; border: 3px solid #E5E5E5; border-top-color: #00BCD4; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="container">
    <div id="google-pay-button"></div>
    <div id="status"></div>
  </div>
  <script>
    const MERCHANT_ID = 'BCR2DN5TY2R53GCL';
    const AMOUNT = '${amountUsd}';

    const paymentRequest = {
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [{
        type: 'CARD',
        parameters: {
          allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
          allowedCardNetworks: ['MASTERCARD', 'VISA', 'AMEX', 'DISCOVER'],
        },
        tokenizationSpecification: {
          type: 'DIRECT',
          parameters: {
            protocolVersion: 'ECv2',
            publicKey: 'BCR2DN5TY2R53GCL',
          }
        }
      }],
      merchantInfo: {
        merchantId: MERCHANT_ID,
        merchantName: 'AfuChat',
      },
      transactionInfo: {
        totalPriceStatus: 'FINAL',
        totalPriceLabel: 'ACoin Top-up',
        totalPrice: AMOUNT,
        currencyCode: 'USD',
        countryCode: 'US',
      },
    };

    function postMsg(obj) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    }

    function setStatus(msg) {
      document.getElementById('status').textContent = msg;
    }

    function onGooglePayLoaded() {
      const client = new google.payments.api.PaymentsClient({ environment: 'PRODUCTION' });
      client.isReadyToPay({
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: paymentRequest.allowedPaymentMethods,
      }).then(res => {
        if (res.result) {
          const btn = client.createButton({
            onClick: () => {
              setStatus('');
              client.loadPaymentData(paymentRequest).then(paymentData => {
                postMsg({ type: 'success', data: paymentData });
              }).catch(err => {
                if (err.statusCode === 'CANCELED') {
                  postMsg({ type: 'cancel' });
                } else {
                  postMsg({ type: 'error', message: err.message || 'Google Pay failed' });
                }
              });
            },
            buttonSizeMode: 'fill',
            buttonType: 'pay',
          });
          document.getElementById('google-pay-button').appendChild(btn);
        } else {
          postMsg({ type: 'unavailable' });
        }
      }).catch(() => {
        postMsg({ type: 'error', message: 'Google Pay not available' });
      });
    }
  </script>
  <script async src="https://pay.google.com/gp/p/js/pay.js" onload="onGooglePayLoaded()"></script>
</body>
</html>`;
}

// ─── Card form ────────────────────────────────────────────────────────────────

function CardForm({
  colors,
  onSubmit,
  loading,
}: {
  colors: any;
  onSubmit: (data: { number: string; expiry_month: string; expiry_year: string; cvv: string; name_on_card: string }) => void;
  loading: boolean;
}) {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");

  const network = detectCardNetwork(number);
  const isAmex = network === "amex";
  const maxCvv = isAmex ? 4 : 3;

  function formatCardNumber(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  }

  function formatExpiry(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  }

  function handleSubmit() {
    const rawNumber = number.replace(/\s/g, "");
    if (rawNumber.length < 13) { showAlert("Invalid card", "Enter a valid card number."); return; }
    const [mm, yy] = expiry.split("/");
    if (!mm || !yy || mm.length !== 2 || yy.length !== 2) { showAlert("Invalid expiry", "Enter expiry as MM/YY."); return; }
    if (cvv.length < 3) { showAlert("Invalid CVV", "Enter a valid CVV."); return; }
    onSubmit({
      number: rawNumber,
      expiry_month: mm,
      expiry_year: `20${yy}`,
      cvv,
      name_on_card: name || "Card Holder",
    });
  }

  const inputStyle = [styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }];

  return (
    <View style={styles.form}>
      {/* Card preview strip */}
      <View style={[styles.cardPreview, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <View style={styles.cardPreviewLeft}>
          <View style={[styles.cardChip, { backgroundColor: colors.border }]} />
        </View>
        <CardNetworkLogo network={network} size={48} />
      </View>

      <Text style={[styles.formLabel, { color: colors.textMuted }]}>CARD NUMBER</Text>
      <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <TextInput
          style={[styles.inputInner, { color: colors.text }]}
          placeholder="1234 5678 9012 3456"
          placeholderTextColor={colors.textMuted}
          value={number}
          onChangeText={(v) => setNumber(formatCardNumber(v))}
          keyboardType="numeric"
          maxLength={19}
        />
        {network !== "unknown" && (
          <View style={{ paddingRight: 12 }}>
            <CardNetworkLogo network={network} size={32} />
          </View>
        )}
      </View>

      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.formLabel, { color: colors.textMuted }]}>EXPIRY</Text>
          <TextInput
            style={inputStyle}
            placeholder="MM/YY"
            placeholderTextColor={colors.textMuted}
            value={expiry}
            onChangeText={(v) => setExpiry(formatExpiry(v))}
            keyboardType="numeric"
            maxLength={5}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.formLabel, { color: colors.textMuted }]}>
            {isAmex ? "CID (4 digits)" : "CVV"}
          </Text>
          <TextInput
            style={inputStyle}
            placeholder={isAmex ? "1234" : "123"}
            placeholderTextColor={colors.textMuted}
            value={cvv}
            onChangeText={(v) => setCvv(v.replace(/\D/g, "").slice(0, maxCvv))}
            keyboardType="numeric"
            maxLength={maxCvv}
            secureTextEntry
          />
        </View>
      </View>

      <Text style={[styles.formLabel, { color: colors.textMuted }]}>NAME ON CARD</Text>
      <TextInput
        style={inputStyle}
        placeholder="Cardholder name"
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />

      <TouchableOpacity
        style={[styles.payBtn, { backgroundColor: "#1A1F71", opacity: loading ? 0.7 : 1 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" size="small" /> : (
          <View style={styles.payBtnInner}>
            <CardNetworkLogo network={network} size={28} />
            <Text style={styles.payBtnText}>Pay Now</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={[styles.securityNote, { backgroundColor: colors.inputBg }]}>
        <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
        <Text style={[styles.securityText, { color: colors.textMuted }]}>PCI DSS Secured</Text>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row", gap: 6 }}>
          <VisaLogo size={28} />
          <MastercardLogo size={28} />
          <AmexLogo size={28} />
          <DiscoverLogo size={28} />
        </View>
      </View>
    </View>
  );
}

// ─── Mobile Money form ────────────────────────────────────────────────────────

function MobileMoneyForm({
  method,
  colors,
  onSubmit,
  loading,
  dialCode,
  flag,
}: {
  method: "mtn" | "airtel";
  colors: any;
  onSubmit: (phone: string) => void;
  loading: boolean;
  dialCode: string;
  flag: string;
}) {
  const [number, setNumber] = useState("");
  const isMtn = method === "mtn";
  const accent = isMtn ? "#FFCB00" : "#E40000";
  const textAccent = isMtn ? "#000000" : "#FFFFFF";

  function handleSubmit() {
    const digits = number.trim().replace(/\D/g, "");
    if (digits.length < 7) { showAlert("Invalid number", "Enter your mobile money number without the country code."); return; }
    // Combine dial code + digits, remove leading 0 if present
    const subscriber = digits.startsWith("0") ? digits.slice(1) : digits;
    onSubmit(`${dialCode}${subscriber}`);
  }

  return (
    <View style={styles.form}>
      {/* Brand header */}
      <View style={[styles.mmoBrandCard, { backgroundColor: accent }]}>
        {isMtn ? <MtnLogo size={52} /> : <AirtelLogo size={52} />}
        <View style={{ flex: 1 }}>
          <Text style={[styles.mmoBrandName, { color: textAccent }]}>
            {isMtn ? "MTN Mobile Money" : "Airtel Money"}
          </Text>
          <Text style={[styles.mmoBrandCountry, { color: isMtn ? "#333" : "rgba(255,255,255,0.75)" }]}>
            {isMtn ? "Uganda · Rwanda · Ghana" : "Uganda · Tanzania · Kenya"}
          </Text>
        </View>
      </View>

      <Text style={[styles.formLabel, { color: colors.textMuted }]}>MOBILE MONEY NUMBER</Text>
      <View style={[styles.dialRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <View style={[styles.dialPrefix, { borderRightColor: colors.border }]}>
          <Text style={styles.dialFlag}>{flag}</Text>
          <Text style={[styles.dialCode, { color: colors.text }]}>{dialCode}</Text>
        </View>
        <TextInput
          style={[styles.dialInput, { color: colors.text }]}
          placeholder="7XX XXX XXX"
          placeholderTextColor={colors.textMuted}
          value={number}
          onChangeText={(v) => setNumber(v.replace(/[^\d\s]/g, ""))}
          keyboardType="phone-pad"
          autoFocus
          maxLength={12}
        />
      </View>
      <Text style={[styles.mmoHint, { color: colors.textMuted }]}>
        Enter your number without the country code
      </Text>

      <TouchableOpacity
        style={[styles.payBtn, { backgroundColor: accent, opacity: loading ? 0.7 : 1 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={textAccent} size="small" />
        ) : (
          <View style={styles.payBtnInner}>
            {isMtn ? <MtnLogo size={24} /> : <AirtelLogo size={24} />}
            <Text style={[styles.payBtnText, { color: textAccent }]}>Confirm Payment</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TopUpScreen() {
  const { colors, isDark } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>("select");
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [activeMethod, setActiveMethod] = useState<PaymentMethod>("card");
  const [loading, setLoading] = useState(false);
  const [merchantRef, setMerchantRef] = useState<string | null>(null);
  const [creditedAcoin, setCreditedAcoin] = useState(0);
  const [failureMsg, setFailureMsg] = useState("");
  const [processingMethod, setProcessingMethod] = useState<PaymentMethod>("card");
  const [manualChecking, setManualChecking] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [userCountry, setUserCountry] = useState<MmoCountry | null | undefined>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    const code = detectUserCountry();
    setUserCountry(code ? (MMO_COUNTRIES[code] ?? null) : null);
  }, []);

  function getSelectedAmount(): number {
    if (selectedPack !== null) return ACOIN_PACKAGES[selectedPack].amount;
    const custom = parseInt(customAmount || "0", 10);
    return isNaN(custom) ? 0 : custom;
  }

  function getAmountUsd(): string {
    return (getSelectedAmount() * 0.01).toFixed(2);
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setScreen("select");
    setMerchantRef(null);
    setSelectedPack(null);
    setCustomAmount("");
    setCreditedAcoin(0);
    setFailureMsg("");
    setLoading(false);
    setManualChecking(false);
    setRedirectUrl(null);
  }

  async function checkOrderStatus(ref: string): Promise<"completed" | "failed" | "pending"> {
    const { data: order } = await supabase
      .from("pesapal_orders")
      .select("status")
      .eq("merchant_reference", ref)
      .maybeSingle();
    return (order?.status as any) || "pending";
  }

  const startPolling = useCallback((ref: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 36) {
        clearInterval(pollRef.current!);
        setFailureMsg(
          "Payment confirmation is taking longer than expected. If money was deducted from your account, it will be credited automatically within a few minutes.",
        );
        setScreen("failed");
        return;
      }
      try {
        const status = await checkOrderStatus(ref);
        if (status === "completed") {
          clearInterval(pollRef.current!);
          await refreshProfile();
          Haptics.notificationAsync("success");
          setScreen("success");
        } else if (status === "failed" || status === "invalid") {
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
      const status = await checkOrderStatus(merchantRef);
      if (status === "completed") {
        if (pollRef.current) clearInterval(pollRef.current);
        await refreshProfile();
        Haptics.notificationAsync("success");
        setScreen("success");
      } else if (status === "failed" || status === "invalid") {
        if (pollRef.current) clearInterval(pollRef.current);
        setFailureMsg("Your payment could not be completed. No funds were charged.");
        setScreen("failed");
      }
    } catch {}
    setManualChecking(false);
  }

  async function initiatePayment(
    method: PaymentMethod,
    paymentData: Record<string, string>,
  ) {
    const amount = getSelectedAmount();
    if (amount < 50) { showAlert("Select a package", "Please select or enter at least 50 ACoin."); return; }

    setLoading(true);
    Haptics.selectionAsync();

    try {
      const token = await getAuthToken();
      const res = await fetch(`${getApiBase()}/api/payments/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          acoin_amount: amount,
          currency: "USD",
          payment_method: method,
          payment_data: paymentData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Payment error (${res.status})`);

      setCreditedAcoin(amount);
      setMerchantRef(data.merchant_reference);
      setProcessingMethod(method);

      const isMmo = method === "mtn" || method === "airtel";
      if (isMmo && data.redirect_url) {
        // Open Pesapal's hosted page in-app — this triggers the STK push
        setRedirectUrl(data.redirect_url);
        setScreen("mmo_webview");
        // Start polling in background so we catch the IPN as soon as it fires
        startPolling(data.merchant_reference);
      } else {
        setScreen("processing");
        startPolling(data.merchant_reference);
      }
    } catch (err: any) {
      showAlert("Payment Error", err?.message || "Could not start payment. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const handleGooglePayMessage = useCallback(
    async (event: any) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === "success") {
          setScreen("processing");
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
    },
    [activeMethod],
  );

  function Header({ title, onBack }: { title: string; onBack?: () => void }) {
    return (
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack || (() => router.back())}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
    );
  }

  // ─── Result screens ───────────────────────────────────────────────────────

  if (screen === "processing") {
    const isMobileMoney = processingMethod === "mtn" || processingMethod === "airtel";
    const methodHint = processingMethod === "mtn"
      ? "Check your phone for an MTN Mobile Money prompt and enter your PIN to complete."
      : processingMethod === "airtel"
      ? "Check your phone for an Airtel Money prompt and enter your PIN to complete."
      : processingMethod === "google_pay"
      ? "Waiting for Google Pay confirmation…"
      : "Verifying your card payment…";

    return (
      <View style={[styles.root, styles.resultScreen, { backgroundColor: colors.background }]}>
        <View style={[styles.processingCard, { backgroundColor: colors.surface }]}>
          <ActivityIndicator size="large" color={Colors.brand} style={{ marginBottom: 20 }} />
          <Text style={[styles.resultTitle, { color: colors.text }]}>Processing…</Text>
          <Text style={[styles.resultSub, { color: colors.textMuted }]}>{methodHint}</Text>

          {merchantRef && (
            <View style={[styles.refRow, { backgroundColor: colors.inputBg, marginBottom: 16 }]}>
              <Text style={[styles.refLabel, { color: colors.textMuted }]}>Reference</Text>
              <Text style={[styles.refValue, { color: colors.text }]} numberOfLines={1}>
                {merchantRef.slice(-16)}
              </Text>
            </View>
          )}

          {isMobileMoney && (
            <TouchableOpacity
              style={[styles.checkBtn, { backgroundColor: Colors.brand, opacity: manualChecking ? 0.7 : 1 }]}
              onPress={handleManualCheck}
              disabled={manualChecking}
            >
              {manualChecking
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.checkBtnText}>I've completed the payment</Text>}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={{ marginTop: 16 }}
            onPress={() => {
              if (pollRef.current) clearInterval(pollRef.current);
              reset();
            }}
          >
            <Text style={[styles.cancelLink, { color: colors.textMuted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === "verifying") {
    return (
      <View style={[styles.root, styles.resultScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={Colors.brand} style={{ marginBottom: 24 }} />
        <Text style={[styles.resultTitle, { color: colors.text }]}>Verifying…</Text>
      </View>
    );
  }

  // ─── Mobile Money WebView — loads Pesapal hosted page to trigger STK push ────
  if (screen === "mmo_webview" && redirectUrl) {
    const isMtn = processingMethod === "mtn";

    // Native: use a WebView that monitors navigation to the callback URL
    if (Platform.OS !== "web" && WebView) {
      return (
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <Header
            title={isMtn ? "MTN Mobile Money" : "Airtel Money"}
            onBack={() => {
              if (pollRef.current) clearInterval(pollRef.current);
              reset();
            }}
          />
          <WebView
            source={{ uri: redirectUrl }}
            style={{ flex: 1 }}
            onNavigationStateChange={(navState: { url?: string }) => {
              const url = navState?.url || "";
              if (url.startsWith(PESAPAL_CALLBACK_URL) || url.includes("payment-complete")) {
                // Payment submitted — switch to polling screen
                setRedirectUrl(null);
                setScreen("processing");
              }
            }}
            startInLoadingState
            renderLoading={() => (
              <View style={[styles.webviewLoader, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={Colors.brand} />
                <Text style={[styles.resultSub, { color: colors.textMuted, marginTop: 16 }]}>
                  Loading payment page…
                </Text>
              </View>
            )}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
          />
        </View>
      );
    }

    // Web platform fallback — can't embed cross-origin, so open in new tab + poll manually
    return (
      <View style={[styles.root, styles.resultScreen, { backgroundColor: colors.background }]}>
        <View style={[styles.processingCard, { backgroundColor: colors.surface }]}>
          {isMtn ? <MtnLogo size={56} /> : <AirtelLogo size={56} />}
          <Text style={[styles.resultTitle, { color: colors.text, marginTop: 16 }]}>
            Complete Payment
          </Text>
          <Text style={[styles.resultSub, { color: colors.textMuted }]}>
            {isMtn
              ? "Tap below to open the MTN payment page. You'll receive a PIN prompt on your phone."
              : "Tap below to open the Airtel payment page. You'll receive a PIN prompt on your phone."}
          </Text>

          <TouchableOpacity
            style={[styles.checkBtn, { backgroundColor: isMtn ? "#FFCB00" : "#E40000", marginBottom: 8 }]}
            onPress={() => {
              if (typeof window !== "undefined") window.open(redirectUrl, "_blank");
            }}
          >
            <Text style={[styles.checkBtnText, { color: isMtn ? "#000" : "#fff" }]}>
              Open Payment Page
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.checkBtn, { backgroundColor: Colors.brand, opacity: manualChecking ? 0.7 : 1 }]}
            onPress={handleManualCheck}
            disabled={manualChecking}
          >
            {manualChecking
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.checkBtnText}>I've completed the payment</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={{ marginTop: 16 }} onPress={() => { if (pollRef.current) clearInterval(pollRef.current); reset(); }}>
            <Text style={[styles.cancelLink, { color: colors.textMuted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen === "success") {
    return (
      <View style={[styles.root, styles.resultScreen, { backgroundColor: colors.background }]}>
        <View style={[styles.successIcon, { backgroundColor: "#34C75918" }]}>
          <Ionicons name="checkmark-circle" size={64} color="#34C759" />
        </View>
        <Text style={[styles.resultTitle, { color: colors.text, marginTop: 20 }]}>Payment Successful!</Text>
        <Text style={[styles.resultSub, { color: colors.textMuted }]}>
          {creditedAcoin > 0
            ? `${creditedAcoin.toLocaleString()} ACoin added to your wallet`
            : "ACoin will be credited shortly"}
        </Text>
        {merchantRef && (
          <View style={[styles.refRow, { backgroundColor: colors.inputBg, marginBottom: 28 }]}>
            <Text style={[styles.refLabel, { color: colors.textMuted }]}>Reference</Text>
            <Text style={[styles.refValue, { color: colors.text }]} numberOfLines={1}>
              {merchantRef.slice(-16)}
            </Text>
          </View>
        )}
        <TouchableOpacity style={[styles.doneBtn, { backgroundColor: Colors.brand }]} onPress={() => router.back()}>
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
        <View style={[styles.successIcon, { backgroundColor: "#FF3B3018" }]}>
          <Ionicons name="close-circle" size={64} color="#FF3B30" />
        </View>
        <Text style={[styles.resultTitle, { color: colors.text, marginTop: 20 }]}>Payment Failed</Text>
        <Text style={[styles.resultSub, { color: colors.textMuted }]}>
          {failureMsg || "No funds were charged."}
        </Text>
        <TouchableOpacity style={[styles.doneBtn, { backgroundColor: Colors.gold }]} onPress={reset}>
          <Text style={styles.doneBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={[styles.topUpAgain, { color: colors.textMuted }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (screen === "google_pay" && WebView) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Header title="Google Pay" onBack={() => setScreen("method")} />
        <WebView
          source={{ html: buildGooglePayHtml(getAmountUsd(), isDark) }}
          style={{ flex: 1, backgroundColor: colors.background }}
          onMessage={handleGooglePayMessage}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="compatibility"
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.webviewLoader, { backgroundColor: colors.background }]}>
              <ActivityIndicator size="large" color={Colors.brand} />
            </View>
          )}
        />
      </View>
    );
  }

  if (screen === "card_form") {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <Header title="Card Payment" onBack={() => setScreen("method")} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.amountChip, { backgroundColor: Colors.brand + "18" }]}>
              <Ionicons name="diamond" size={16} color={Colors.brand} />
              <Text style={[styles.amountChipText, { color: Colors.brand }]}>
                {getSelectedAmount().toLocaleString()} ACoin · ${getAmountUsd()} USD
              </Text>
            </View>
            <View style={[styles.formCard, { backgroundColor: colors.surface }]}>
              <CardForm colors={colors} onSubmit={(d) => initiatePayment("card", d as any)} loading={loading} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (screen === "mobile_form") {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <Header
          title={activeMethod === "mtn" ? "MTN Mobile Money" : "Airtel Money"}
          onBack={() => setScreen("method")}
        />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.amountChip, { backgroundColor: (activeMethod === "mtn" ? "#FFCB00" : "#E40000") + "18" }]}>
              <Ionicons name="diamond" size={16} color={activeMethod === "mtn" ? "#FFCB00" : "#E40000"} />
              <Text style={[styles.amountChipText, { color: activeMethod === "mtn" ? "#FFCB00" : "#E40000" }]}>
                {getSelectedAmount().toLocaleString()} ACoin · ${getAmountUsd()} USD
              </Text>
            </View>
            <View style={[styles.formCard, { backgroundColor: colors.surface }]}>
              <MobileMoneyForm
                method={activeMethod as "mtn" | "airtel"}
                colors={colors}
                onSubmit={(phone) => initiatePayment(activeMethod as "mtn" | "airtel", { phone_number: phone })}
                loading={loading}
                dialCode={userCountry?.dialCode ?? "+256"}
                flag={userCountry?.flag ?? "🌍"}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (screen === "method") {
    const amount = getSelectedAmount();
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <Header title="Payment" onBack={() => setScreen("select")} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.amountChip, { backgroundColor: Colors.brand + "18" }]}>
            <Ionicons name="diamond" size={16} color={Colors.brand} />
            <Text style={[styles.amountChipText, { color: Colors.brand }]}>
              {amount.toLocaleString()} ACoin · ${getAmountUsd()} USD
            </Text>
          </View>

          {/* Google Pay — primary */}
          <TouchableOpacity
            style={[styles.googlePayBtn, { shadowColor: colors.text }]}
            onPress={() => {
              Haptics.selectionAsync();
              if (Platform.OS === "web") {
                showAlert("Google Pay", "Google Pay is available on the Android app.");
              } else {
                setScreen("google_pay");
              }
            }}
            activeOpacity={0.85}
          >
            <View style={styles.googlePayInner}>
              <View style={styles.googlePayLogoRow}>
                <Text style={styles.googlePayG}>G</Text>
                <Text style={[styles.googlePayLabel, { color: "#1a1a1a" }]}>oogle Pay</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#444" />
            </View>
          </TouchableOpacity>

          <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 8 }]}>MORE WAYS TO PAY</Text>

          {/* Card */}
          <TouchableOpacity
            style={[styles.methodCard, { backgroundColor: colors.surface }]}
            onPress={() => { Haptics.selectionAsync(); setScreen("card_form"); }}
          >
            <View style={[styles.methodIconBox, { backgroundColor: "#1A1F7110" }]}>
              <View style={{ flexDirection: "row", gap: 3 }}>
                <VisaLogo size={24} />
                <MastercardLogo size={24} />
              </View>
            </View>
            <View style={styles.methodInfo}>
              <Text style={[styles.methodTitle, { color: colors.text }]}>Debit / Credit Card</Text>
              <Text style={[styles.methodSub, { color: colors.textMuted }]}>Visa · Mastercard · Amex · Discover</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Mobile money — shown only when country is detected and supported */}
          {userCountry === undefined ? null : userCountry === null ? (
            <View style={[styles.mmoUnavailable, { backgroundColor: colors.surface }]}>
              <Ionicons name="location-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.mmoUnavailableText, { color: colors.textMuted }]}>
                Mobile money is not available in your region
              </Text>
            </View>
          ) : (
            <>
              {userCountry.mtn && (
                <TouchableOpacity
                  style={[styles.methodCard, { backgroundColor: colors.surface }]}
                  onPress={() => { Haptics.selectionAsync(); setActiveMethod("mtn"); setScreen("mobile_form"); }}
                >
                  <View style={[styles.methodIconBox, { backgroundColor: "#FFCB0010" }]}>
                    <MtnLogo size={40} />
                  </View>
                  <View style={styles.methodInfo}>
                    <Text style={[styles.methodTitle, { color: colors.text }]}>MTN Mobile Money</Text>
                    <Text style={[styles.methodSub, { color: colors.textMuted }]}>
                      {userCountry.flag} {userCountry.name} · {userCountry.dialCode}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              {userCountry.airtel && (
                <TouchableOpacity
                  style={[styles.methodCard, { backgroundColor: colors.surface }]}
                  onPress={() => { Haptics.selectionAsync(); setActiveMethod("airtel"); setScreen("mobile_form"); }}
                >
                  <View style={[styles.methodIconBox, { backgroundColor: "#E4000010" }]}>
                    <AirtelLogo size={40} />
                  </View>
                  <View style={styles.methodInfo}>
                    <Text style={[styles.methodTitle, { color: colors.text }]}>Airtel Money</Text>
                    <Text style={[styles.methodSub, { color: colors.textMuted }]}>
                      {userCountry.flag} {userCountry.name} · {userCountry.dialCode}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </>
          )}

          <View style={[styles.securedRow, { borderColor: colors.border }]}>
            <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
            <Text style={[styles.securedText, { color: colors.textMuted }]}>Secured by Pesapal · PCI DSS Compliant</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── Package select screen ─────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <Header title="Buy ACoin" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.balanceCard, { backgroundColor: Colors.gold }]}>
          <Ionicons name="diamond" size={28} color="rgba(255,255,255,0.9)" />
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceValue}>{(profile?.acoin || 0).toLocaleString()} ACoin</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SELECT PACKAGE</Text>

        {ACOIN_PACKAGES.map((pack, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.packCard, { backgroundColor: colors.surface, borderColor: selectedPack === i ? Colors.gold : "transparent" }]}
            onPress={() => { setSelectedPack(i); setCustomAmount(""); Haptics.selectionAsync(); }}
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
            {selectedPack === i && <Ionicons name="checkmark-circle" size={22} color={Colors.gold} />}
          </TouchableOpacity>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 16 }]}>CUSTOM AMOUNT</Text>
        <View style={[styles.customRow, { backgroundColor: colors.surface }]}>
          <Ionicons name="diamond" size={18} color={Colors.gold} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.customInput, { color: colors.text }]}
            placeholder="ACoin amount (min. 50)"
            placeholderTextColor={colors.textMuted}
            value={customAmount}
            onChangeText={(v) => { setCustomAmount(v.replace(/[^0-9]/g, "")); setSelectedPack(null); }}
            keyboardType="numeric"
          />
          {customAmount ? (
            <Text style={[styles.customPrice, { color: Colors.gold }]}>
              ${((parseInt(customAmount || "0") || 0) * 0.01).toFixed(2)}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: Colors.brand, opacity: (getSelectedAmount() < 50) ? 0.5 : 1 }]}
          onPress={() => {
            if (getSelectedAmount() < 50) { showAlert("Select a package", "Please select a package or enter at least 50 ACoin."); return; }
            Haptics.selectionAsync();
            setScreen("method");
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>

        <Text style={[styles.rateNote, { color: colors.textMuted }]}>
          1 ACoin = $0.01 USD
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  balanceCard: { borderRadius: 16, padding: 20, alignItems: "center", gap: 6 },
  balanceLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  balanceValue: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff" },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginLeft: 4, marginTop: 4 },
  packCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 14, padding: 16, borderWidth: 2,
  },
  packLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  packLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  packSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  customRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4,
  },
  customInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 48 },
  customPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
  continueBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 8,
  },
  continueBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  rateNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  amountChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "center",
  },
  amountChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  googlePayBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  googlePayInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  googlePayLogoRow: { flexDirection: "row", alignItems: "center" },
  googlePayG: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#4285F4" },
  googlePayLabel: { fontSize: 20, fontFamily: "Inter_400Regular" },
  methodCard: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 14, padding: 14, gap: 14,
  },
  methodIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  methodInfo: { flex: 1 },
  methodTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  methodSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  securedRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    justifyContent: "center", paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4,
  },
  securedText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  formCard: { borderRadius: 16, padding: 20 },
  form: { gap: 12 },
  formLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: -4 },
  cardPreview: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 4,
  },
  cardPreviewLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardChip: { width: 28, height: 22, borderRadius: 4 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 10, borderWidth: 1, overflow: "hidden",
  },
  inputInner: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  input: {
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular", borderWidth: 1,
  },
  row2: { flexDirection: "row", gap: 12 },
  payBtn: {
    borderRadius: 14, paddingVertical: 16, marginTop: 8,
    alignItems: "center", justifyContent: "center",
  },
  payBtnInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  payBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  securityNote: {
    flexDirection: "row", alignItems: "center",
    gap: 6, borderRadius: 10, padding: 10, marginTop: 4,
  },
  securityText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  mmoBrandCard: {
    flexDirection: "row", alignItems: "center",
    gap: 14, borderRadius: 14, padding: 16, marginBottom: 4,
  },
  mmoBrandName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  mmoBrandCountry: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  mmoHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -6 },
  resultScreen: { alignItems: "center", justifyContent: "center", padding: 32 },
  processingCard: { borderRadius: 20, padding: 28, alignItems: "center", width: "100%", maxWidth: 340 },
  resultTitle: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 12 },
  resultSub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 16 },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  refRow: { width: "100%", borderRadius: 10, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  refLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  refValue: { fontSize: 12, fontFamily: "Inter_600SemiBold", maxWidth: "55%" },
  doneBtn: { borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48, alignItems: "center", width: "100%" },
  doneBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  topUpAgain: { fontSize: 15, fontFamily: "Inter_500Medium" },
  webviewLoader: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  checkBtn: {
    width: "100%", borderRadius: 12, paddingVertical: 14,
    alignItems: "center", justifyContent: "center", marginTop: 4,
  },
  checkBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cancelLink: { fontSize: 14, fontFamily: "Inter_400Regular" },
  dialRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 10, borderWidth: 1, overflow: "hidden",
  },
  dialPrefix: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 12,
    borderRightWidth: 1,
  },
  dialFlag: { fontSize: 20 },
  dialCode: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dialInput: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  mmoUnavailable: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 14, padding: 16,
  },
  mmoUnavailableText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
});
