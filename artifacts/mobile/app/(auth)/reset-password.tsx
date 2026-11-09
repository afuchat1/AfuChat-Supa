import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/context/LanguageContext";
import { showAlert } from "@/lib/alert";
import Colors from "@/constants/colors";

type Step = "email" | "code";

export default function ResetPasswordNative() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendCode() {
    const trimmed = email.trim();
    if (!trimmed) { setError(t("Please enter your email address.")); return; }
    setError("");
    setLoading(true);
    try {
      const { error: sbErr } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: "https://afuchat.com/",
      });
      if (sbErr) throw sbErr;
      setStep("code");
    } catch (e: any) {
      setError(e.message || t("Failed to send reset code."));
    } finally {
      setLoading(false);
    }
  }

  async function doReset() {
    if (!code.trim()) { setError(t("Please enter the code from your email.")); return; }
    if (newPwd.length < 6) { setError(t("Password must be at least 6 characters.")); return; }
    if (newPwd !== confirmPwd) { setError(t("Passwords don't match.")); return; }
    setError("");
    setLoading(true);
    try {
      const { error: e1 } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "recovery",
      });
      if (e1) throw new Error(t("The code is invalid or expired."));
      const { error: e2 } = await supabase.auth.updateUser({ password: newPwd });
      if (e2) throw e2;
      await supabase.auth.signOut();
      showAlert(t("Password updated"), t("Your password has been changed. Please sign in."));
      router.replace("/(auth)/login");
    } catch (e: any) {
      setError(e.message || t("Failed to reset password."));
    } finally {
      setLoading(false);
    }
  }

  const accent = Colors.brand;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      
    >
      <ScrollView
        contentContainerStyle={[s.root, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity style={s.back} onPress={() => step === "code" ? setStep("email") : router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text style={[s.backTxt, { color: colors.text }]}>
            {step === "code" ? "Back" : "Sign in"}
          </Text>
        </TouchableOpacity>

        {/* Icon — flat, no box */}
        <Ionicons
          name={step === "email" ? "key" : "lock-closed"}
          size={40}
          color={accent}
          style={{ marginBottom: 20 }}
        />

        {/* Title */}
        <Text style={[s.title, { color: colors.text }]}>
          {step === "email" ? "Forgot password?" : "Create new password"}
        </Text>
        <Text style={[s.sub, { color: colors.textMuted }]}>
          {step === "email"
            ? "Enter your email and we'll send a 6-digit reset code."
            : `Code sent to ${email}. Enter it below with your new password.`}
        </Text>

        {/* Error */}
        {error !== "" && (
          <View style={s.errBox}>
            <Text style={s.errTxt}>{error}</Text>
          </View>
        )}

        {step === "email" ? (
          <>
            <View style={[s.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="mail" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={[s.input, { color: colors.text }]}
                placeholder={t("you@example.com")}
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onSubmitEditing={sendCode}
                returnKeyType="go"
              />
            </View>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: accent, opacity: loading ? 0.6 : 1 }]}
              onPress={sendCode}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={s.btnTxt}>{t("Send Reset Code")}</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* OTP code */}
            <View style={[s.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="keypad" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={[s.input, { color: colors.text }]}
                placeholder={t("6-digit code from email")}
                placeholderTextColor={colors.textMuted}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoFocus
              />
            </View>
            {/* New password */}
            <View style={[s.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="lock-closed" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={[s.input, { color: colors.text }]}
                placeholder={t("New password")}
                placeholderTextColor={colors.textMuted}
                value={newPwd}
                onChangeText={setNewPwd}
                secureTextEntry={!showPwd}
              />
              <TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}>
                <Ionicons name={showPwd ? "eye-off" : "eye"} size={17} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {/* Confirm password */}
            <View style={[s.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="lock-closed" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={[s.input, { color: colors.text }]}
                placeholder={t("Confirm new password")}
                placeholderTextColor={colors.textMuted}
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                secureTextEntry={!showPwd}
                onSubmitEditing={doReset}
                returnKeyType="go"
              />
            </View>

            <TouchableOpacity
              style={[s.btn, { backgroundColor: accent, opacity: loading ? 0.6 : 1 }]}
              onPress={doReset}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={s.btnTxt}>{t("Update Password")}</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={sendCode} style={{ alignSelf: "center", paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>
                {t("← Resend code")}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flexGrow: 1, padding: 28, paddingTop: 56 },
  back: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 32, alignSelf: "flex-start" },
  backTxt: { fontSize: 16, fontFamily: "Inter_500Medium" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 8 },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 24 },
  errBox: { backgroundColor: "rgba(192,57,43,.12)", borderColor: "rgba(192,57,43,.3)", borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 14 },
  errTxt: { color: "#FF6B6B", fontSize: 13, fontFamily: "Inter_400Regular" },
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 0.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, ...Platform.select({ web: { boxShadow: "0 3px 12px rgba(0,0,0,0.13)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.13, shadowRadius: 12, elevation: 8 } }) },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  btn: { borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  btnTxt: { color: "#000", fontSize: 15, fontFamily: "Inter_700Bold" },
});
