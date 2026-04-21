import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { COUNTRIES, Country, DEFAULT_COUNTRY, flagEmoji } from "@/lib/countries";

const RESEND_COOLDOWN = 45;

function buildE164(country: Country, local: string): string {
  const dial = country.dial.replace(/\D/g, "");
  const digits = local.replace(/\D/g, "");
  return "+" + dial + digits;
}

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

// ─── Country picker modal ─────────────────────────────────────────────────────
function CountryPickerModal({
  visible, onClose, onPick, colors, isDark, currentIso,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (c: Country) => void;
  colors: any;
  isDark: boolean;
  currentIso: string;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    const qDigits = q.replace(/\D/g, "");
    return COUNTRIES.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.iso.toLowerCase().includes(q)) return true;
      if (qDigits && c.dial.includes(qDigits)) return true;
      return false;
    });
  }, [query]);

  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        {/* Header */}
        <View style={pickerSt.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={pickerSt.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[pickerSt.title, { color: colors.text }]}>Select country</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Search */}
        <View style={[pickerSt.search, { backgroundColor: isDark ? "#15151A" : "#F5F5F7" }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search country or code"
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            style={[pickerSt.searchInput, { color: colors.text }]}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(c) => c.iso}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 60 }} />}
          renderItem={({ item }) => {
            const isCurrent = item.iso === currentIso;
            return (
              <Pressable
                onPress={() => onPick(item)}
                style={({ pressed }) => [
                  pickerSt.row,
                  { backgroundColor: pressed ? (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)") : "transparent" },
                ]}
              >
                <Text style={pickerSt.flag}>{flagEmoji(item.iso)}</Text>
                <Text style={[pickerSt.country, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[pickerSt.dial, { color: colors.textMuted }]}>{item.dial}</Text>
                {isCurrent && <Ionicons name="checkmark" size={18} color="#00BCD4" style={{ marginLeft: 8 }} />}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular" }}>No countries found.</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

// ─── Phone screen ─────────────────────────────────────────────────────────────
export default function PhoneAuthScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [local, setLocal] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmedPhone, setConfirmedPhone] = useState("");

  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function sendCode() {
    const e164 = buildE164(country, local);
    if (!isValidE164(e164)) {
      showAlert("Invalid phone", "Enter a valid phone number for the selected country.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { channel: "sms" },
    });
    setLoading(false);
    if (error) {
      showAlert("Couldn't send code", error.message);
      return;
    }
    setConfirmedPhone(e164);
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
      phone: confirmedPhone,
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
      phone: confirmedPhone,
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
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
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

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[st.iconWrap, { backgroundColor: isDark ? "#15151A" : "#F0FAFB" }]}>
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

              {/* Country selector */}
              <TouchableOpacity
                style={[st.countryRow, { backgroundColor: isDark ? "#15151A" : "#F5F5F7" }]}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.7}
              >
                <Text style={st.countryFlag}>{flagEmoji(country.iso)}</Text>
                <Text style={[st.countryName, { color: colors.text }]} numberOfLines={1}>{country.name}</Text>
                <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              {/* Phone input with dial code prefix */}
              <View style={[st.phoneRow, { backgroundColor: isDark ? "#15151A" : "#F5F5F7" }]}>
                <TouchableOpacity onPress={() => setPickerOpen(true)} style={st.dialBtn} activeOpacity={0.7}>
                  <Text style={[st.dialText, { color: colors.text }]}>{country.dial}</Text>
                </TouchableOpacity>
                <View style={[st.dialDivider, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }]} />
                <TextInput
                  value={local}
                  onChangeText={(t) => setLocal(t.replace(/[^\d\s\-()]/g, ""))}
                  placeholder="Phone number"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="send"
                  onSubmitEditing={sendCode}
                  style={[st.phoneInput, { color: colors.text }]}
                />
              </View>

              <Text style={[st.helper, { color: colors.textMuted }]}>
                We'll send a verification code to {country.dial} ··· {local || "your number"}.
              </Text>

              <TouchableOpacity
                style={[st.primaryBtn, loading && { opacity: 0.6 }]}
                onPress={sendCode}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.primaryBtnText}>Send code</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[st.title, { color: colors.text }]}>Enter your code</Text>
              <Text style={[st.sub, { color: colors.textSecondary }]}>
                We sent a 6-digit code to{"\n"}
                <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold" }}>{confirmedPhone}</Text>
              </Text>

              <View style={[st.inputRow, { backgroundColor: isDark ? "#15151A" : "#F5F5F7" }]}>
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
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.primaryBtnText}>Verify & continue</Text>}
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

      <CountryPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(c) => { setCountry(c); setPickerOpen(false); }}
        colors={colors}
        isDark={isDark}
        currentIso={country.iso}
      />
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
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  scroll: { paddingHorizontal: 24, paddingTop: 32, alignItems: "center", maxWidth: 480, alignSelf: "center", width: "100%" },

  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },

  title: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 8, textAlign: "center" },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, textAlign: "center", marginBottom: 28 },

  countryRow: {
    width: "100%", flexDirection: "row", alignItems: "center", gap: 12,
    height: 52, borderRadius: 12, paddingHorizontal: 14, marginBottom: 10,
  },
  countryFlag: { fontSize: 22 },
  countryName: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },

  phoneRow: {
    width: "100%", flexDirection: "row", alignItems: "center",
    height: 52, borderRadius: 12, paddingHorizontal: 4,
  },
  dialBtn: { paddingHorizontal: 14, height: "100%", justifyContent: "center" },
  dialText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dialDivider: { width: StyleSheet.hairlineWidth, height: 24 },
  phoneInput: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", paddingHorizontal: 12, height: "100%" },

  inputRow: {
    width: "100%", flexDirection: "row", alignItems: "center", gap: 10,
    height: 52, borderRadius: 12, paddingHorizontal: 14,
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

const pickerSt = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  search: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginBottom: 12,
    height: 44, borderRadius: 12, paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },

  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14, gap: 16,
  },
  flag: { fontSize: 24, width: 28, textAlign: "center" },
  country: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  dial: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
