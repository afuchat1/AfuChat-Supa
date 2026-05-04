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
import { WebView } from "react-native-webview";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { showAlert } from "@/lib/alert";
import { GoogleLogo, GitHubLogo, XLogo, GitLabLogo } from "@/components/ui/OAuthLogos";

let GoogleSignin: any = null;
let isErrorWithCode: any = null;
let statusCodes: any = null;
try {
  const mod = require("@react-native-google-signin/google-signin");
  GoogleSignin = mod.GoogleSignin;
  isErrorWithCode = mod.isErrorWithCode;
  statusCodes = mod.statusCodes;
} catch (_) {}

const afuSymbol = require("@/assets/images/afu-symbol.png");

WebBrowser.maybeCompleteAuthSession();

// ─── Shared focused input ─────────────────────────────────────────────────────
function AuthInput({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  colors,
  isDark,
  rightElement,
  onSubmitEditing,
  returnKeyType,
  inputRef,
}: any) {
  const [focused, setFocused] = useState(false);
  const { accent } = useAppAccent();
  return (
    <View
      style={[
        inputSt.wrap,
        {
          backgroundColor: isDark ? "#111113" : "#F5F5F7",
        },
        focused && { borderWidth: 1.5, borderColor: accent },
      ]}
    >
      <Ionicons
        name={icon}
        size={17}
        color={focused ? accent : colors.textMuted}
        style={inputSt.icon}
      />
      <TextInput
        ref={inputRef}
        style={[inputSt.text, { color: colors.text }]}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
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
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 50,
  },
  icon: { marginRight: 10 },
  text: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 50 },
});

// ─── Or divider ───────────────────────────────────────────────────────────────
function OrDivider({ colors }: { colors: any }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.textMuted + "33" }} />
      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.textMuted, letterSpacing: 0.5 }}>OR</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.textMuted + "33" }} />
    </View>
  );
}

// ─── OAuth icon button (circular, icon-only) ─────────────────────────────────
function OAuthBtn({ label, logo, onPress, loading, colors, isDark }: any) {
  return (
    <TouchableOpacity
      accessibilityLabel={`Continue with ${label}`}
      accessibilityRole="button"
      style={[
        oauthSt.btn,
        {
          backgroundColor: isDark ? "#15151A" : "#FFFFFF",
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          shadowColor: isDark ? "#000" : "#000",
        },
      ]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}
    >
      {loading ? <ActivityIndicator size="small" color={colors.text} /> : logo}
    </TouchableOpacity>
  );
}
const oauthSt = StyleSheet.create({
  btn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
});

// ─── Forgot password modal ────────────────────────────────────────────────────
function ForgotPasswordModal({
  visible, onClose, colors, isDark,
}: { visible: boolean; onClose: () => void; colors: any; isDark: boolean }) {
  const { accent } = useAppAccent();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    if (!visible) {
      const t = setTimeout(() => {
        setStep("email"); setEmail(""); setCode(""); setNewPwd(""); setConfirmPwd("");
      }, 220);
      return () => clearTimeout(t);
    }
  }, [visible]);

  async function sendCode() {
    if (!email.trim()) return showAlert("Enter email", "Please enter your email address.");
    setLoading(true);
    const redirect = Platform.OS === "web" && typeof window !== "undefined"
      ? window.location.origin + "/" : "https://afuchat.com/";
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect });
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

  const bg = isDark ? "#18181B" : "#FFFFFF";

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[fgSt.overlay, { opacity, backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.45)" }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[fgSt.card, { backgroundColor: bg }]}>
          <View style={fgSt.header}>
            <View style={{ flex: 1 }}>
              <Text style={[fgSt.title, { color: colors.text }]}>
                {step === "email" ? "Reset password" : "Create new password"}
              </Text>
              <Text style={[fgSt.subtitle, { color: colors.textSecondary }]}>
                {step === "email" ? "Enter your email to receive a reset code" : `Code sent to ${email}`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={fgSt.closeBtn}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={fgSt.body}>
            {step === "email" ? (
              <>
                <AuthInput icon="mail-outline" placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" colors={colors} isDark={isDark} returnKeyType="go" onSubmitEditing={sendCode} />
                <TouchableOpacity style={[fgSt.btn, { backgroundColor: accent }, loading && { opacity: 0.6 }]} onPress={sendCode} disabled={loading} activeOpacity={0.85}>
                  {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={fgSt.btnText}>Send reset code</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <AuthInput icon="keypad-outline" placeholder="6-digit code from email" value={code} onChangeText={setCode} keyboardType="number-pad" colors={colors} isDark={isDark} />
                <AuthInput icon="lock-closed-outline" placeholder="New password" value={newPwd} onChangeText={setNewPwd} secureTextEntry={!showPwd} colors={colors} isDark={isDark}
                  rightElement={
                    <TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}>
                      <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={17} color={colors.textMuted} />
                    </TouchableOpacity>
                  }
                />
                <AuthInput icon="lock-closed-outline" placeholder="Confirm new password" value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry={!showPwd} colors={colors} isDark={isDark} returnKeyType="go" onSubmitEditing={doReset} />
                <TouchableOpacity style={[fgSt.btn, { backgroundColor: accent }, loading && { opacity: 0.6 }]} onPress={doReset} disabled={loading} activeOpacity={0.85}>
                  {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={fgSt.btnText}>Update password</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setStep("email")} style={{ alignSelf: "center", paddingVertical: 4 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>← Resend code</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}
const fgSt = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: {
    width: "100%", maxWidth: 420, borderRadius: 16, overflow: "hidden",
    // @ts-ignore
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 28, paddingTop: 28, paddingBottom: 20, gap: 12 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3, marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 2 },
  body: { paddingHorizontal: 28, paddingBottom: 28, gap: 12 },
  btn: { height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 4 },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

// ─── Email verification modal (shown when email is unconfirmed) ───────────────
function EmailVerifyModal({
  visible, email, onClose, onVerified, colors, isDark,
}: { visible: boolean; email: string; onClose: () => void; onVerified: () => void; colors: any; isDark: boolean }) {
  const { accent } = useAppAccent();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    if (visible && !sent) sendCode();
  }, [visible]);

  async function sendCode() {
    setSending(true);
    await supabase.auth.resend({ type: "signup", email });
    setSending(false);
    setSent(true);
  }

  async function verify() {
    if (!code.trim()) return showAlert("Enter code", "Please enter the 6-digit code from your email.");
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "signup" });
    setLoading(false);
    if (error) {
      showAlert("Invalid code", "The code is incorrect or expired. Try resending.");
    } else {
      onVerified();
    }
  }

  async function resend() {
    setCode("");
    setSent(false);
    await sendCode();
  }

  const bg = isDark ? "#18181B" : "#FFFFFF";
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[fgSt.overlay, { opacity, backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.45)" }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[fgSt.card, { backgroundColor: bg }]}>
          <View style={fgSt.header}>
            <View style={{ flex: 1 }}>
              <Text style={[fgSt.title, { color: colors.text }]}>Verify your email</Text>
              <Text style={[fgSt.subtitle, { color: colors.textSecondary }]}>
                {sending ? "Sending verification code…" : `A 6-digit code was sent to ${email}`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={fgSt.closeBtn}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={fgSt.body}>
            <AuthInput
              icon="keypad-outline"
              placeholder="6-digit verification code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              colors={colors}
              isDark={isDark}
              returnKeyType="go"
              onSubmitEditing={verify}
            />
            <TouchableOpacity
              style={[fgSt.btn, { backgroundColor: accent }, (loading || sending) && { opacity: 0.6 }]}
              onPress={verify}
              disabled={loading || sending}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={fgSt.btnText}>Verify email</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={resend} disabled={sending} style={{ alignSelf: "center", paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>
                {sending ? "Sending…" : "Resend code"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── OAuth WebView modal ──────────────────────────────────────────────────────
function OAuthWebModal({
  url, onClose, onNav, onShouldLoad, colors,
}: { url: string; onClose: () => void; onNav: (s: any) => void; onShouldLoad: (r: any) => boolean; colors: any }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.text }}>Sign In</Text>
          <View style={{ width: 36 }} />
        </View>
        <WebView source={{ uri: url }} style={{ flex: 1 }} javaScriptEnabled domStorageEnabled startInLoadingState onNavigationStateChange={onNav} onShouldStartLoadWithRequest={onShouldLoad} />
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const { colors, isDark, accent } = useTheme();
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
  const [oauthModalUrl, setOauthModalUrl] = useState<string | null>(null);
  const oauthHandledRef = useRef(false);
  const pwdRef = useRef<TextInput>(null);

  function detectIdentifierType(raw: string): "email" | "handle" | "phone" {
    const s = raw.trim();
    if (s.includes("@") && /\.\w+$/.test(s.split("@")[1] ?? "")) return "email";
    const digits = s.replace(/[\s\-()+]/g, "");
    if (s.startsWith("+") || /^\d{7,15}$/.test(digits)) return "phone";
    return "handle";
  }

  function getApiBase(): string {
    if (Platform.OS === "web" && typeof window !== "undefined") return "";
    const domain = process.env.EXPO_PUBLIC_DOMAIN || "";
    if (domain) return `https://${domain}`;
    return "http://localhost:3000";
  }

  async function resolveIdentifierToEmail(raw: string): Promise<string | null> {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/resolve-identifier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: raw.trim() }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.email ?? null;
    } catch {
      return null;
    }
  }

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
        showAlert("Account not found", type === "handle"
          ? "No account found with that username."
          : "No account found with that phone number.");
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
        setVerifyEmail(email);
        setVerifyVisible(true);
        return;
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

  function isOAuthRedirect(url: string) {
    try {
      const p = new URL(url); const h = p.hostname.toLowerCase();
      return (h === "afuchat.com" || h === "www.afuchat.com") && (p.pathname === "/" || p.pathname === "") && (p.searchParams.has("code") || p.hash.includes("access_token"));
    } catch { return false; }
  }

  async function handleOAuthRedirect(url: string) {
    if (oauthHandledRef.current) return; oauthHandledRef.current = true;
    try {
      const code = new URL(url).searchParams.get("code");
      if (!code) { showAlert("Error", "No code received."); setOauthModalUrl(null); setOauthLoading(null); return; }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) showAlert("Error", error.message);
      else { setOauthModalUrl(null); setOauthLoading(null); router.replace("/(tabs)"); return; }
    } catch { showAlert("Error", "Could not complete sign in."); }
    setOauthModalUrl(null); setOauthLoading(null);
  }

  async function nativeGoogleSignIn() {
    try {
      setOauthLoading("google");
      GoogleSignin.configure({ webClientId: "830762767270-lmefgjjk25i17lithkq6iisjv8gfh08d.apps.googleusercontent.com" });
      await GoogleSignin.hasPlayServices();
      const resp = await GoogleSignin.signIn();
      const idToken = resp?.data?.idToken;
      if (!idToken) { showAlert("Error", "Could not get Google ID token."); setOauthLoading(null); return; }
      const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
      if (error) { showAlert("Error", error.message); setOauthLoading(null); } else router.replace("/(tabs)");
    } catch (err: any) {
      if (err?.code === 10 || String(err?.message ?? "").includes("DEVELOPER_ERROR")) return signInWithProvider("google");
      if (isErrorWithCode?.(err) && (err.code === statusCodes?.SIGN_IN_CANCELLED || err.code === statusCodes?.IN_PROGRESS)) { setOauthLoading(null); return; }
      setOauthLoading(null); showAlert("Error", err?.message || "Google sign in failed.");
    }
  }

  async function signInWithProvider(provider: string) {
    try {
      if (provider === "google" && Platform.OS !== "web" && GoogleSignin) return nativeGoogleSignIn();
      setOauthLoading(provider);
      const redirectUrl = Platform.OS === "web"
        ? (typeof window !== "undefined" ? window.location.origin + "/" : "https://afuchat.com/")
        : makeRedirectUri({ native: "afuchat://(auth)/login" });
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: provider as any, options: { redirectTo: redirectUrl, skipBrowserRedirect: true } });
      if (error) { showAlert("Error", error.message); setOauthLoading(null); return; }
      if (!data?.url) { setOauthLoading(null); return; }
      oauthHandledRef.current = false;
      if (Platform.OS === "web") {
        const w = 500, h = 650;
        const left = window.screenX + (window.innerWidth - w) / 2;
        const top = window.screenY + (window.innerHeight - h) / 2;
        const popup = window.open(data.url, "oauth_popup", `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);
        if (!popup) { window.location.href = data.url; return; }
        const timer = setInterval(async () => {
          try {
            if (popup.closed) { clearInterval(timer); setOauthLoading(null); return; }
            const u = popup.location.href;
            if (u && isOAuthRedirect(u)) { clearInterval(timer); popup.close(); await handleOAuthRedirect(u); }
          } catch (_) {}
        }, 300);
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, { showInRecents: false });
      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get("code");
        if (code) { const { error: e } = await supabase.auth.exchangeCodeForSession(code); if (e) showAlert("Error", e.message); else router.replace("/(tabs)"); setOauthLoading(null); return; }
        let at = url.hash ? new URLSearchParams(url.hash.substring(1)).get("access_token") : null;
        let rt = url.hash ? new URLSearchParams(url.hash.substring(1)).get("refresh_token") : null;
        if (!at) { at = url.searchParams.get("access_token"); rt = url.searchParams.get("refresh_token"); }
        if (at && rt) { const { error: e } = await supabase.auth.setSession({ access_token: at, refresh_token: rt }); if (e) showAlert("Error", e.message); else router.replace("/(tabs)"); }
      }
      setOauthLoading(null);
    } catch { setOauthLoading(null); showAlert("Error", "Could not complete sign in."); }
  }

  const identifierType = detectIdentifierType(identifier);
  const identifierIcon =
    identifierType === "email" ? "mail-outline" :
    identifierType === "phone" ? "call-outline" :
    "at-outline";

  const FormContent = (
    <>
      {/* Fields */}
      <View style={{ gap: 10 }}>
        <AuthInput
          icon={identifierIcon}
          placeholder="Email, @username, or phone number"
          value={identifier}
          onChangeText={setIdentifier}
          keyboardType={identifierType === "phone" ? "phone-pad" : "email-address"}
          autoComplete="username"
          colors={colors}
          isDark={isDark}
          returnKeyType="next"
          onSubmitEditing={() => pwdRef.current?.focus()}
        />
        <AuthInput inputRef={pwdRef} icon="lock-closed-outline" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry={!showPwd} autoComplete="current-password" colors={colors} isDark={isDark} returnKeyType="go" onSubmitEditing={handleLogin}
          rightElement={
            <TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}>
              <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={17} color={colors.textMuted} />
            </TouchableOpacity>
          }
        />
      </View>
      <TouchableOpacity onPress={() => setForgotVisible(true)} style={{ alignSelf: "flex-end" }}>
        <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>Forgot password?</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[formSt.primaryBtn, { backgroundColor: accent }, loading && { opacity: 0.6 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={formSt.primaryBtnText}>Sign in</Text>}
      </TouchableOpacity>
      <OrDivider colors={colors} />
      {/* OAuth icon row — bottom */}
      <View style={{ flexDirection: "row", gap: 12, justifyContent: "center", marginTop: 4, flexWrap: "wrap" }}>
        <OAuthBtn label="Google" logo={<GoogleLogo size={22} />} onPress={() => signInWithProvider("google")} loading={oauthLoading === "google"} colors={colors} isDark={isDark} />
        <OAuthBtn label="GitHub" logo={<GitHubLogo size={22} color={isDark ? "#fff" : "#24292E"} />} onPress={() => signInWithProvider("github")} loading={oauthLoading === "github"} colors={colors} isDark={isDark} />
        <OAuthBtn label="X" logo={<XLogo size={20} color={isDark ? "#fff" : "#000"} />} onPress={() => signInWithProvider("twitter")} loading={oauthLoading === "twitter"} colors={colors} isDark={isDark} />
        <OAuthBtn label="GitLab" logo={<GitLabLogo size={22} />} onPress={() => signInWithProvider("gitlab")} loading={oauthLoading === "gitlab"} colors={colors} isDark={isDark} />
      </View>
      <View style={formSt.switchRow}>
        <Text style={[formSt.switchText, { color: colors.textSecondary }]}>Don't have an account?</Text>
        <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: accent }}>{" "}Create account</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TouchableOpacity
        style={[mobBackSt.btn, { top: insets.top + 8, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/" as any))}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="arrow-back" size={20} color={colors.text} />
      </TouchableOpacity>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[mobSt.scroll, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={mobSt.logoArea}>
            <Image source={afuSymbol} style={[mobSt.logo, { tintColor: accent }]} resizeMode="contain" />
            <Text style={[mobSt.appName, { color: colors.text }]}>AfuChat</Text>
            <Text style={[mobSt.tagline, { color: colors.textSecondary }]}>Sign in to your account</Text>
          </View>
          <View style={{ gap: 16 }}>{FormContent}</View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ForgotPasswordModal visible={forgotVisible} onClose={() => setForgotVisible(false)} colors={colors} isDark={isDark} />
      <EmailVerifyModal
        visible={verifyVisible}
        email={verifyEmail}
        onClose={() => setVerifyVisible(false)}
        onVerified={() => { setVerifyVisible(false); router.replace("/(tabs)"); }}
        colors={colors}
        isDark={isDark}
      />
      {oauthModalUrl && <OAuthWebModal url={oauthModalUrl} onClose={() => { setOauthModalUrl(null); setOauthLoading(null); }} onNav={(s) => { if (s.url && isOAuthRedirect(s.url)) handleOAuthRedirect(s.url); }} onShouldLoad={(r) => { if (r.url && isOAuthRedirect(r.url)) { handleOAuthRedirect(r.url); return false; } return true; }} colors={colors} />}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const formSt = StyleSheet.create({
  primaryBtn: { height: 50, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", letterSpacing: 0.1 },
  switchRow: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap" },
  switchText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});

const mobBackSt = StyleSheet.create({
  btn: { position: "absolute", left: 16, zIndex: 10, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
const mobSt = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 28 },
  logoArea: { alignItems: "center", marginBottom: 36 },
  logo: { width: 56, height: 56, marginBottom: 12 },
  appName: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 4 },
  tagline: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
