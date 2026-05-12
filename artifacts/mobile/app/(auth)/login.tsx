import React, { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
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
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { showAlert } from "@/lib/alert";
import { GoogleLogo, GitHubLogo, XLogo, GitLabLogo } from "@/components/ui/OAuthLogos";
import { googleSignIn } from "@/lib/googleAuth";

const afuSymbol = require("@/assets/images/afu-symbol.png");

// ─── Glass input field ─────────────────────────────────────────────────────────
function AuthInput({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  isDark,
  rightElement,
  onSubmitEditing,
  returnKeyType,
  inputRef,
}: any) {
  const [focused, setFocused] = useState(false);
  const { accent } = useAppAccent();
  const borderColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";

  return (
    <View
      style={[
        inputSt.wrap,
        {
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          borderColor: focused ? accent + "70" : borderColor,
          borderWidth: 1,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={17}
        color={focused ? accent : isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.30)"}
        style={inputSt.icon}
      />
      <TextInput
        ref={inputRef}
        style={[inputSt.text, { color: isDark ? "#F1F1F1" : "#0F0F0F" }]}
        placeholder={placeholder}
        placeholderTextColor={isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.28)"}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "none"}
        autoComplete={autoComplete}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType ?? "next"}
      />
      {rightElement}
    </View>
  );
}
const inputSt = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  icon: { marginRight: 10 },
  text: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 52, outlineStyle: "none" } as any,
});

// ─── Or divider ────────────────────────────────────────────────────────────────
function OrDivider({ isDark }: { isDark: boolean }) {
  const divColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: divColor }} />
      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.30)", letterSpacing: 1 }}>OR</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: divColor }} />
    </View>
  );
}

// ─── OAuth button ─────────────────────────────────────────────────────────────
function OAuthBtn({ label, logo, onPress, loading, isDark }: any) {
  return (
    <View
      style={[
        oauthSt.card,
        {
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)",
        },
      ]}
    >
      <TouchableOpacity
        accessibilityLabel={`Continue with ${label}`}
        style={oauthSt.btn}
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.65}
      >
        {loading ? <ActivityIndicator size="small" color={isDark ? "#fff" : "#333"} /> : logo}
      </TouchableOpacity>
    </View>
  );
}
const oauthSt = StyleSheet.create({
  card: { borderRadius: 14, overflow: "hidden", width: 52, height: 52 },
  btn: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
});

// ─── Glass modal base ──────────────────────────────────────────────────────────
function GlassModal({ visible, onClose, isDark, children }: { visible: boolean; onClose: () => void; isDark: boolean; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[modalSt.overlay, { opacity, backgroundColor: isDark ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.48)" }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            modalSt.card,
            {
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
            },
          ]}
        >
          {children}
        </View>
      </Animated.View>
    </Modal>
  );
}
const modalSt = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, borderRadius: 24, overflow: "hidden" },
});

// ─── Forgot password modal ─────────────────────────────────────────────────────
function ForgotPasswordModal({ visible, onClose, isDark }: { visible: boolean; onClose: () => void; isDark: boolean }) {
  const { accent } = useAppAccent();
  const textColor = isDark ? "#F1F1F1" : "#0F0F0F";
  const mutedColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(() => { setStep("email"); setEmail(""); setCode(""); setNewPwd(""); setConfirmPwd(""); }, 250);
      return () => clearTimeout(t);
    }
  }, [visible]);

  async function sendCode() {
    if (!email.trim()) return showAlert("Enter email", "Please enter your email address.");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: "https://afuchat.com/" });
    setLoading(false);
    if (error) showAlert("Error", error.message);
    else setStep("code");
  }

  async function doReset() {
    if (!code.trim()) return showAlert("Enter code", "Check your email for the code.");
    if (newPwd.length < 6) return showAlert("Too short", "Password must be at least 6 characters.");
    if (newPwd !== confirmPwd) return showAlert("Mismatch", "Passwords don't match.");
    setLoading(true);
    const { error: e1 } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "recovery" });
    if (e1) { setLoading(false); return showAlert("Invalid code", "The code is invalid or expired."); }
    const { error: e2 } = await supabase.auth.updateUser({ password: newPwd });
    setLoading(false);
    if (e2) showAlert("Error", e2.message);
    else {
      showAlert("Password updated", "Your password has been changed. Please sign in.");
      await supabase.auth.signOut();
      onClose();
    }
  }

  const colors = { text: textColor, textSecondary: mutedColor, textMuted: mutedColor };

  return (
    <GlassModal visible={visible} onClose={onClose} isDark={isDark}>
      <View style={fgSt.header}>
        <View style={{ flex: 1 }}>
          <Text style={[fgSt.title, { color: textColor }]}>
            {step === "email" ? "Reset Password" : "Create New Password"}
          </Text>
          <Text style={[fgSt.subtitle, { color: mutedColor }]}>
            {step === "email" ? "Enter your email to receive a reset code" : `Code sent to ${email}`}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={fgSt.closeBtn}>
          <Ionicons name="close" size={18} color={mutedColor} />
        </TouchableOpacity>
      </View>
      <View style={fgSt.body}>
        {step === "email" ? (
          <>
            <AuthInput icon="mail-outline" placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" isDark={isDark} returnKeyType="go" onSubmitEditing={sendCode} />
            <TouchableOpacity style={[fgSt.btn, loading && { opacity: 0.6 }]} onPress={sendCode} disabled={loading} activeOpacity={0.85}>
              <LinearGradient colors={[accent, isDark ? "#005E6E" : "#007A8A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={fgSt.btnGrad}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={fgSt.btnText}>Send Reset Code</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <AuthInput icon="keypad-outline" placeholder="6-digit code from email" value={code} onChangeText={setCode} keyboardType="number-pad" isDark={isDark} colors={colors} />
            <AuthInput icon="lock-closed-outline" placeholder="New password" value={newPwd} onChangeText={setNewPwd} secureTextEntry={!showPwd} isDark={isDark} colors={colors}
              rightElement={<TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}><Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={17} color={mutedColor} /></TouchableOpacity>}
            />
            <AuthInput icon="lock-closed-outline" placeholder="Confirm new password" value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry={!showPwd} isDark={isDark} colors={colors} returnKeyType="go" onSubmitEditing={doReset} />
            <TouchableOpacity style={[fgSt.btn, loading && { opacity: 0.6 }]} onPress={doReset} disabled={loading} activeOpacity={0.85}>
              <LinearGradient colors={[accent, isDark ? "#005E6E" : "#007A8A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={fgSt.btnGrad}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={fgSt.btnText}>Update Password</Text>}
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep("email")} style={{ alignSelf: "center", paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>← Resend code</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </GlassModal>
  );
}
const fgSt = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, gap: 12 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3, marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 2 },
  body: { paddingHorizontal: 24, paddingBottom: 24, gap: 12 },
  btn: { borderRadius: 14, overflow: "hidden" },
  btnGrad: { height: 50, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

// ─── Email verification modal ──────────────────────────────────────────────────
function EmailVerifyModal({ visible, email, onClose, onVerified, isDark }: { visible: boolean; email: string; onClose: () => void; onVerified: () => void; isDark: boolean }) {
  const { accent } = useAppAccent();
  const textColor = isDark ? "#F1F1F1" : "#0F0F0F";
  const mutedColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { if (visible && !sent) sendCode(); }, [visible]);

  async function sendCode() {
    setSending(true);
    await supabase.auth.resend({ type: "signup", email });
    setSending(false); setSent(true);
  }

  async function verify() {
    if (!code.trim()) return showAlert("Enter code", "Please enter the 6-digit code from your email.");
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "signup" });
    setLoading(false);
    if (error) showAlert("Invalid code", "The code is incorrect or expired. Try resending.");
    else onVerified();
  }

  return (
    <GlassModal visible={visible} onClose={onClose} isDark={isDark}>
      <View style={fgSt.header}>
        <View style={{ flex: 1 }}>
          <Text style={[fgSt.title, { color: textColor }]}>Verify Your Email</Text>
          <Text style={[fgSt.subtitle, { color: mutedColor }]}>
            {sending ? "Sending verification code…" : `A 6-digit code was sent to ${email}`}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={fgSt.closeBtn}>
          <Ionicons name="close" size={18} color={mutedColor} />
        </TouchableOpacity>
      </View>
      <View style={fgSt.body}>
        <AuthInput icon="keypad-outline" placeholder="6-digit verification code" value={code} onChangeText={setCode} keyboardType="number-pad" isDark={isDark} returnKeyType="go" onSubmitEditing={verify} />
        <TouchableOpacity style={[fgSt.btn, (loading || sending) && { opacity: 0.6 }]} onPress={verify} disabled={loading || sending} activeOpacity={0.85}>
          <LinearGradient colors={[accent, isDark ? "#005E6E" : "#007A8A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={fgSt.btnGrad}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={fgSt.btnText}>Verify Email</Text>}
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setCode(""); setSent(false); sendCode(); }} disabled={sending} style={{ alignSelf: "center", paddingVertical: 4 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>
            {sending ? "Sending…" : "Resend code"}
          </Text>
        </TouchableOpacity>
      </View>
    </GlassModal>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const { isDark, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => { if (user) router.replace("/(tabs)"); }, [user]);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [forgotVisible, setForgotVisible] = useState(false);
  const [verifyVisible, setVerifyVisible] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const oauthHandledRef = useRef(false);
  const pwdRef = useRef<TextInput>(null);

  // ─── Identifier type detection ──────────────────────────────────────────
  function detectIdentifierType(raw: string): "email" | "handle" | "phone" {
    const s = raw.trim();
    if (s.includes("@") && /\.\w+$/.test(s.split("@")[1] ?? "")) return "email";
    const digits = s.replace(/[\s\-()+]/g, "");
    if (s.startsWith("+") || /^\d{7,15}$/.test(digits)) return "phone";
    return "handle";
  }

  async function resolveIdentifierToEmail(raw: string): Promise<string | null> {
    try {
      const supaUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
      const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "").trim();
      if (!supaUrl) return null;
      const res = await fetch(`${supaUrl}/functions/v1/auth-resolve-identifier`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey },
        body: JSON.stringify({ identifier: raw.trim() }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.email ?? null;
    } catch { return null; }
  }

  // ─── Login ──────────────────────────────────────────────────────────────
  async function handleLogin() {
    const raw = identifier.trim();
    if (!raw || !password) return showAlert("Missing fields", "Please enter your credentials and password.");
    setLoading(true);
    let email = raw;
    const type = detectIdentifierType(raw);
    if (type !== "email") {
      const resolved = await resolveIdentifierToEmail(raw);
      if (!resolved) {
        setLoading(false);
        showAlert("Account not found", type === "handle" ? "No account found with that username." : "No account found with that phone number.");
        return;
      }
      email = resolved;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setLoading(false); showAlert("Sign in failed", error.message); return; }
    if (data.user) {
      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        setLoading(false);
        setVerifyEmail(email); setVerifyVisible(true); return;
      }
      const { data: prof } = await supabase.from("profiles").select("scheduled_deletion_at, account_deleted").eq("id", data.user.id).single();
      if (prof?.account_deleted) {
        setLoading(false); await supabase.auth.signOut();
        showAlert("Account Deleted", "This account has been permanently deleted."); return;
      }
      if (prof?.scheduled_deletion_at) {
        const days = Math.max(0, Math.ceil((new Date(prof.scheduled_deletion_at).getTime() - Date.now()) / 86400000));
        setLoading(false);
        showAlert("Account Scheduled for Deletion", `Your account will be deleted in ${days} day${days !== 1 ? "s" : ""}. Restore it?`, [
          { text: "Delete Anyway", style: "destructive", onPress: async () => supabase.auth.signOut() },
          { text: "Restore", style: "default", onPress: async () => { await supabase.from("profiles").update({ scheduled_deletion_at: null }).eq("id", data.user!.id); router.replace("/(tabs)"); } },
        ]); return;
      }
    }
    setLoading(false); router.replace("/(tabs)");
  }

  // ─── OAuth ──────────────────────────────────────────────────────────────
  async function nativeGoogleSignIn() {
    setOauthLoading("google");
    const result = await googleSignIn();
    if (!result.ok) {
      setOauthLoading(null);
      // User consciously dismissed the picker — stop here.
      if (result.cancelled) return;
      // Native Google Sign-In unavailable (Expo Go, SHA-1 mismatch, missing module,
      // or any other error) — seamlessly fall back to the web-based OAuth flow,
      // which works identically to GitHub sign-in.
      return signInWithProvider("google", false);
    }
    const uid = result.userId;
    if (uid) {
      const { data: prof } = await supabase.from("profiles").select("onboarding_completed").eq("id", uid).maybeSingle();
      if (!prof?.onboarding_completed) { router.replace({ pathname: "/onboarding", params: { userId: uid } } as any); return; }
    }
    router.replace("/(tabs)");
  }

  async function signInWithProvider(provider: string, useNativeFlow = true) {
    try {
      if (useNativeFlow && provider === "google") return nativeGoogleSignIn();
      setOauthLoading(provider);
      const redirectUrl = makeRedirectUri({ native: "afuchat://(auth)/login" });
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: provider as any, options: { redirectTo: redirectUrl, skipBrowserRedirect: true } });
      if (error) { showAlert("Error", error.message); setOauthLoading(null); return; }
      if (!data?.url) { setOauthLoading(null); return; }
      oauthHandledRef.current = false;
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, { showInRecents: false });
      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get("code");
        if (code) {
          const { data: sd, error: e } = await supabase.auth.exchangeCodeForSession(code);
          if (e) { showAlert("Error", e.message); }
          else {
            const uid = sd.user?.id;
            if (uid) {
              const { data: prof } = await supabase.from("profiles").select("onboarding_completed").eq("id", uid).maybeSingle();
              if (!prof?.onboarding_completed) { setOauthLoading(null); router.replace({ pathname: "/onboarding", params: { userId: uid } } as any); return; }
            }
            setOauthLoading(null); router.replace("/(tabs)"); return;
          }
        }
        let at = url.hash ? new URLSearchParams(url.hash.substring(1)).get("access_token") : null;
        let rt = url.hash ? new URLSearchParams(url.hash.substring(1)).get("refresh_token") : null;
        if (!at) { at = url.searchParams.get("access_token"); rt = url.searchParams.get("refresh_token"); }
        if (at && rt) { const { error: e } = await supabase.auth.setSession({ access_token: at, refresh_token: rt }); if (e) showAlert("Error", e.message); else router.replace("/(tabs)"); }
      }
      setOauthLoading(null);
    } catch { setOauthLoading(null); showAlert("Error", "Could not complete sign in."); }
  }

  const identifierType = detectIdentifierType(identifier);
  const identifierIcon = identifierType === "email" ? "mail-outline" : identifierType === "phone" ? "call-outline" : "at-outline";

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? "#0F0F0F" : "#F5F0E8" }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoWrap}>
            <View
              style={[
                styles.logoCircle,
                {
                  backgroundColor: isDark ? "rgba(0,188,212,0.15)" : "rgba(0,188,212,0.10)",
                  borderColor: isDark ? "rgba(0,188,212,0.30)" : "rgba(0,188,212,0.20)",
                },
              ]}
            >
              <Image source={afuSymbol} style={styles.logoImg} resizeMode="contain" tintColor={accent} />
            </View>
            <Text style={[styles.appName, { color: isDark ? "#F1F1F1" : "#0F0F0F" }]}>AfuChat</Text>
            <Text style={[styles.tagline, { color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)" }]}>
              Connect. Discover. Create.
            </Text>
          </View>

          {/* Form card */}
          <View
            style={[
              styles.formCard,
              {
                backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
              },
            ]}
          >
            <View style={styles.formInner}>
              {/* Fields */}
              <View style={{ gap: 10 }}>
                <AuthInput
                  icon={identifierIcon}
                  placeholder="Email, @username, or phone"
                  value={identifier}
                  onChangeText={setIdentifier}
                  keyboardType={identifierType === "phone" ? "phone-pad" : "email-address"}
                  autoComplete="username"
                  isDark={isDark}
                  returnKeyType="next"
                  onSubmitEditing={() => pwdRef.current?.focus()}
                />
                <AuthInput
                  inputRef={pwdRef}
                  icon="lock-closed-outline"
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPwd}
                  autoComplete="current-password"
                  isDark={isDark}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  rightElement={
                    <TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}>
                      <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={17} color={isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.30)"} />
                    </TouchableOpacity>
                  }
                />
              </View>

              {/* Forgot password */}
              <TouchableOpacity onPress={() => setForgotVisible(true)} style={{ alignSelf: "flex-end", marginTop: -2 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>Forgot password?</Text>
              </TouchableOpacity>

              {/* Primary sign-in button */}
              <TouchableOpacity
                style={[styles.signInBtn, loading && { opacity: 0.6 }]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                <LinearGradient colors={[accent, "#0097A7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.signInGrad}>
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.signInText}>Sign In</Text>
                  }
                </LinearGradient>
              </TouchableOpacity>

              {/* Or divider */}
              <OrDivider isDark={isDark} />

              {/* OAuth buttons */}
              <View style={styles.oauthRow}>
                <OAuthBtn label="Google"  logo={<GoogleLogo size={22} />} onPress={() => signInWithProvider("google")} loading={oauthLoading === "google"} isDark={isDark} />
                <OAuthBtn label="GitHub"  logo={<GitHubLogo size={22} color={isDark ? "#fff" : "#24292E"} />} onPress={() => signInWithProvider("github")} loading={oauthLoading === "github"} isDark={isDark} />
                <OAuthBtn label="X"       logo={<XLogo size={20} color={isDark ? "#fff" : "#000"} />} onPress={() => signInWithProvider("twitter")} loading={oauthLoading === "twitter"} isDark={isDark} />
                <OAuthBtn label="GitLab"  logo={<GitLabLogo size={22} />} onPress={() => signInWithProvider("gitlab")} loading={oauthLoading === "gitlab"} isDark={isDark} />
              </View>

              {/* Switch to register */}
              <View style={styles.switchRow}>
                <Text style={[styles.switchText, { color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)" }]}>
                  Don't have an account?
                </Text>
                <TouchableOpacity onPress={() => router.replace("/(auth)/register")}>
                  <Text style={[styles.switchLink, { color: accent }]}>Sign up</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modals */}
      <ForgotPasswordModal visible={forgotVisible} onClose={() => setForgotVisible(false)} isDark={isDark} />
      <EmailVerifyModal visible={verifyVisible} email={verifyEmail} onClose={() => setVerifyVisible(false)} onVerified={() => { setVerifyVisible(false); router.replace("/(tabs)"); }} isDark={isDark} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, gap: 32 },

  // logo section
  logoWrap: { alignItems: "center", gap: 8 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
  },
  logoImg: { width: 46, height: 46 },
  appName: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  tagline: { fontSize: 14, fontFamily: "Inter_400Regular" },

  // form card
  formCard: { borderRadius: 24, overflow: "hidden" },
  formInner: { padding: 24, gap: 16 },

  // sign-in button
  signInBtn: { borderRadius: 12, overflow: "hidden" },
  signInGrad: { height: 52, alignItems: "center", justifyContent: "center" },
  signInText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },

  // OAuth row
  oauthRow: { flexDirection: "row", justifyContent: "center", gap: 12, flexWrap: "wrap" },

  // switch link
  switchRow: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  switchText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  switchLink: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
