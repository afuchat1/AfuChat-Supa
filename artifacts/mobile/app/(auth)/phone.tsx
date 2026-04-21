import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";

const RESEND_COOLDOWN = 45; // seconds

function normalizePhone(raw: string): string {
  const trimmed = raw.trim().replace(/[\s\-()]/g, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  return "+" + trimmed.replace(/\D/g, "");
}

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

export default function PhoneAuthScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function sendCode() {
    const normalized = normalizePhone(phone);
    if (!isValidE164(normalized)) {
      showAlert("Invalid phone", "Enter a phone number in international format, e.g. +14155552671");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized,
      options: { channel: "sms" },
    });
    setLoading(false);
    if (error) {
      showAlert("Couldn't send code", error.message);
      return;
    }
    setPhone(normalized);
    setStep("code");
    setCooldown(RESEND_COOLDOWN);
    setTimeout(() => codeRef.current?.focus(), 250);
  }

  async function verifyCode() {
    if (code.length < 4) {
      showAlert("Invalid code", "Enter the 6-digit code we sent you.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: code.trim(),
      type: "sms",
    });
    setLoading(false);
    if (error || !data.session) {
      showAlert("Verification failed", error?.message ?? "That code didn't work. Try again.");
      return;
    }
    router.replace("/" as any);
  }

  async function resend() {
    if (cooldown > 0) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: "sms" },
    });
    setLoading(false);
    if (error) {
      showAlert("Couldn't resend", error.message);
      return;
    }
    setCooldown(RESEND_COOLDOWN);
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => (step === "code" ? setStep("phone") : router.back())}
          style={st.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.text }]}>AfuChat Verify</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand mark */}
          <View style={[st.iconWrap, { backgroundColor: isDark ? "#15151A" : "#F0FAFB", borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,188,212,0.2)" }]}>
            <Ionicons
              name={step === "phone" ? "phone-portrait-outline" : "shield-checkmark-outline"}
              size={32}
              color="#00BCD4"
            />
          </View>

          {step === "phone" ? (
            <>
              <Text style={[st.title, { color: colors.text }]}>Sign in with your phone</Text>
              <Text style={[st.sub, { color: colors.textSecondary }]}>
                We'll text you a one-time verification code. Standard SMS rates may apply.
              </Text>

              <View style={[st.inputRow, { backgroundColor: isDark ? "#15151A" : "#F5F5F7", borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }]}>
                <Ionicons name="call-outline" size={18} color={colors.textMuted} />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+1 415 555 2671"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="send"
                  onSubmitEditing={sendCode}
                  style={[st.input, { color: colors.text }]}
                />
              </View>

              <Text style={[st.helper, { color: colors.textMuted }]}>
                Use international format starting with + and your country code.
              </Text>

              <TouchableOpacity
                style={[st.primaryBtn, loading && { opacity: 0.6 }]}
                onPress={sendCode}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={st.primaryBtnText}>Send code</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[st.title, { color: colors.text }]}>Enter your code</Text>
              <Text style={[st.sub, { color: colors.textSecondary }]}>
                We sent a 6-digit code to{"\n"}
                <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold" }}>{phone}</Text>
              </Text>

              <View style={[st.inputRow, { backgroundColor: isDark ? "#15151A" : "#F5F5F7", borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }]}>
                <Ionicons name="key-outline" size={18} color={colors.textMuted} />
                <TextInput
                  ref={codeRef}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  returnKeyType="go"
                  onSubmitEditing={verifyCode}
                  style={[st.input, { color: colors.text, letterSpacing: 6, fontSize: 18, fontFamily: "Inter_600SemiBold" }]}
                />
              </View>

              <TouchableOpacity
                style={[st.primaryBtn, loading && { opacity: 0.6 }]}
                onPress={verifyCode}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={st.primaryBtnText}>Verify & continue</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={resend} disabled={cooldown > 0 || loading} style={st.resendRow}>
                <Text style={[st.resendText, { color: cooldown > 0 ? colors.textMuted : "#00BCD4" }]}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't get it? Resend code"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setStep("phone"); setCode(""); }} style={st.changeRow}>
                <Ionicons name="create-outline" size={14} color={colors.textMuted} />
                <Text style={[st.changeText, { color: colors.textMuted }]}>Change phone number</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={st.footer}>
            <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
            <Text style={[st.footerText, { color: colors.textMuted }]}>
              Secured by AfuChat Verify · Powered by Twilio
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  scroll: { paddingHorizontal: 24, paddingTop: 32, alignItems: "center", maxWidth: 480, alignSelf: "center", width: "100%" },

  iconWrap: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 1,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },

  title: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 8, textAlign: "center" },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, textAlign: "center", marginBottom: 28 },

  inputRow: {
    width: "100%", flexDirection: "row", alignItems: "center", gap: 10,
    height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },

  helper: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8, alignSelf: "flex-start" },

  primaryBtn: {
    width: "100%", height: 50, borderRadius: 12, marginTop: 24,
    alignItems: "center", justifyContent: "center", backgroundColor: "#00BCD4",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", letterSpacing: 0.1 },

  resendRow: { marginTop: 20, padding: 8 },
  resendText: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },

  changeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, padding: 6 },
  changeText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  footer: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 36 },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
