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
import { GlassBackButton } from "@/components/ui/GlassBackButton";
import { FloatingGlassSurface } from "@/components/ui/FloatingNavSurface";
import AfuTextInput from "@/components/ui/AfuTextInput";
import AuthContent from "@/components/ui/AuthContent";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/context/LanguageContext";
import { showAlert } from "@/lib/alert";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Step = "email" | "code";

export default function ResetPasswordNative() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
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
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          s.root,
          {
            backgroundColor: colors.background,
            paddingTop: Math.max(56, insets.top + 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthContent style={{ flexGrow: 1 }}>
        {/* Back */}
        <GlassBackButton
          style={s.back}
          onPress={() => step === "code" ? setStep("email") : router.back()}
          icon="chevron-back"
          label={step === "code" ? "Back" : "Sign in"}
        />

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
            <FloatingGlassSurface fill={false} variant="input" style={s.inputWrap} contentStyle={s.inputRow}>
              <Ionicons name="mail" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
              <AfuTextInput
                appearance="embedded"
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
            </FloatingGlassSurface>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: accent, opacity: loading ? 0.6 : 1 }]}
              onPress={sendCode}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={colors.bubbleText} size="small" />
                : <Text style={[s.btnTxt, { color: colors.bubbleText }]}>{t("Send Reset Code")}</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* OTP code */}
            <FloatingGlassSurface fill={false} variant="input" style={s.inputWrap} contentStyle={s.inputRow}>
              <Ionicons name="keypad" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
              <AfuTextInput
                appearance="embedded"
                style={[s.input, { color: colors.text }]}
                placeholder={t("6-digit code from email")}
                placeholderTextColor={colors.textMuted}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoFocus
              />
            </FloatingGlassSurface>
            {/* New password */}
            <FloatingGlassSurface fill={false} variant="input" style={s.inputWrap} contentStyle={s.inputRow}>
              <Ionicons name="lock-closed" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
              <AfuTextInput
                appearance="embedded"
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
            </FloatingGlassSurface>
            {/* Confirm password */}
            <FloatingGlassSurface fill={false} variant="input" style={s.inputWrap} contentStyle={s.inputRow}>
              <Ionicons name="lock-closed" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
              <AfuTextInput
                appearance="embedded"
                style={[s.input, { color: colors.text }]}
                placeholder={t("Confirm new password")}
                placeholderTextColor={colors.textMuted}
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                secureTextEntry={!showPwd}
                onSubmitEditing={doReset}
                returnKeyType="go"
              />
            </FloatingGlassSurface>

            <TouchableOpacity
              style={[s.btn, { backgroundColor: accent, opacity: loading ? 0.6 : 1 }]}
              onPress={doReset}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={colors.bubbleText} size="small" />
                : <Text style={[s.btnTxt, { color: colors.bubbleText }]}>{t("Update Password")}</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={sendCode} style={{ alignSelf: "center", paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>
                {t("← Resend code")}
              </Text>
            </TouchableOpacity>
          </>
        )}
        </AuthContent>
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
  inputWrap: { alignSelf: "stretch", minHeight: 46, marginBottom: 12 },
  inputRow: { width: "100%", minHeight: 46, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 2, gap: 8 },
  input: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 20, fontFamily: "Inter_400Regular", paddingHorizontal: 0, paddingVertical: 6, outlineStyle: "none" } as any,
  btn: { borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  btnTxt: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
