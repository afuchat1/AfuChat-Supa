import React, { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { LinearGradient } from "@/components/ui/SafeGradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/env";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { useLanguage } from "@/context/LanguageContext";
import { showAlert } from "@/lib/alert";
import AfuLogo from "@/components/ui/AfuLogo";
import { GitHubLogo, GoogleLogo } from "@/components/ui/OAuthLogos";
import Colors from "@/constants/colors";
import {
  signInSilentlyWithNativeGoogle,
  signInWithNativeGoogle,
} from "@/lib/nativeGoogleAuth";

const BG = "#000000";
const BIO_REFRESH_KEY = "afu_bio_refresh_token";
const BIO_EMAIL_KEY = "afu_bio_display_email";
const PENDING_INVITE_KEY = "afuchat_pending_invite_code";

// ─── Soft orb ─────────────────────────────────────────────────────────────────
function SoftOrb({ cx, cy, size, color }: { cx: number; cy: number; size: number; color: string }) {
  return (
    <>
      <View style={{ position: "absolute", left: cx - size * 0.75, top: cy - size * 0.75, width: size * 1.5, height: size * 1.5, borderRadius: size * 0.75, backgroundColor: color, opacity: 0.07 }} />
      <View style={{ position: "absolute", left: cx - size * 0.5, top: cy - size * 0.5, width: size, height: size, borderRadius: size * 0.5, backgroundColor: color, opacity: 0.11 }} />
      <View style={{ position: "absolute", left: cx - size * 0.27, top: cy - size * 0.27, width: size * 0.54, height: size * 0.54, borderRadius: size * 0.27, backgroundColor: color, opacity: 0.16 }} />
    </>
  );
}

// ─── Glass input ──────────────────────────────────────────────────────────────
function AuthInput({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, autoComplete, rightElement, onSubmitEditing, returnKeyType, inputRef, accent }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[inp.wrap, {
      backgroundColor: focused ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.06)",
      borderColor: focused ? accent + "70" : "rgba(255,255,255,0.10)",
    }]}>
      <Ionicons name={icon} size={17} color={focused ? accent : "rgba(255,255,255,0.32)"} style={inp.icon} />
      <TextInput
        ref={inputRef}
        style={inp.text}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.25)"
        value={value} onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType} autoCapitalize={autoCapitalize ?? "none"}
        autoComplete={autoComplete} autoCorrect={false}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing} returnKeyType={returnKeyType ?? "next"}
      />
      {rightElement}
    </View>
  );
}
const inp = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", borderRadius: 999, paddingHorizontal: 18, height: 56, borderWidth: 0 },
  icon: { marginRight: 10 },
  text: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 56, color: "#F1F1F1", outlineStyle: "none" } as any,
});

// ─── Glass modal wrapper ───────────────────────────────────────────────────────
function GlassModal({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 240, useNativeDriver: true }),
      Animated.spring(scale, { toValue: visible ? 1 : 0.94, useNativeDriver: true, tension: 220, friction: 22 }),
    ]).start();
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[gm.overlay, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[gm.card, { transform: [{ scale }] }]}>
          <LinearGradient
            colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.04)"]}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Top border glow */}
          <View style={gm.topBorder} />
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
const gm = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.75)" },
  card: { width: "100%", maxWidth: 420, borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.04)" },
  topBorder: { height: 1, backgroundColor: "rgba(255,255,255,0.14)", marginHorizontal: 0 },
});

// ─── Forgot password modal ─────────────────────────────────────────────────────
function ForgotPasswordModal({ visible, onClose, accent }: { visible: boolean; onClose: () => void; isDark: boolean; accent: string }) {
  const { t } = useLanguage();
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
    if (!email.trim()) return showAlert(t("Enter email"), t("Please enter your email address."));
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: "https://afuchat.com/" });
    setLoading(false);
    if (error) showAlert(t("Error"), error.message);
    else setStep("code");
  }

  async function doReset() {
    if (!code.trim()) return showAlert(t("Enter code"), t("Check your email for the 6-digit code."));
    if (newPwd.length < 6) return showAlert(t("Too short"), t("Password must be at least 6 characters."));
    if (newPwd !== confirmPwd) return showAlert(t("Mismatch"), t("Passwords don't match."));
    setLoading(true);
    const { error: e1 } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "recovery" });
    if (e1) { setLoading(false); return showAlert(t("Invalid code"), t("The code is invalid or expired.")); }
    const { error: e2 } = await supabase.auth.updateUser({ password: newPwd });
    setLoading(false);
    if (e2) showAlert(t("Error"), e2.message);
    else { showAlert(t("Password updated"), t("Your password has been changed. Please sign in.")); await supabase.auth.signOut(); onClose(); }
  }

  return (
    <GlassModal visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#F1F1F1" }}>
            {step === "email" ? "Reset password" : "New password"}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.40)" />
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", marginBottom: 20, lineHeight: 20 }}>
          {step === "email" ? "Enter your email to receive a reset code" : `Reset code sent to ${email}`}
        </Text>
        <View style={{ gap: 12 }}>
          {step === "email" ? (
            <>
              <AuthInput icon="mail" placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" returnKeyType="go" onSubmitEditing={sendCode} accent={accent} />
              <TouchableOpacity style={[sc.primaryBtn, loading && { opacity: 0.6 }]} onPress={sendCode} disabled={loading} activeOpacity={0.85}>
                <LinearGradient colors={[accent, Colors.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sc.primaryGrad}>
                  {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                    <Text style={sc.primaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                      Send reset code
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <AuthInput icon="keypad" placeholder="6-digit code from email" value={code} onChangeText={setCode} keyboardType="number-pad" accent={accent} />
              <AuthInput icon="lock-closed" placeholder="New password" value={newPwd} onChangeText={setNewPwd} secureTextEntry={!showPwd} accent={accent}
                rightElement={<TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}><Ionicons name={showPwd ? "eye-off" : "eye"} size={17} color="rgba(255,255,255,0.35)" /></TouchableOpacity>}
              />
              <AuthInput icon="lock-closed" placeholder="Confirm password" value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry={!showPwd} returnKeyType="go" onSubmitEditing={doReset} accent={accent} />
              <TouchableOpacity style={[sc.primaryBtn, loading && { opacity: 0.6 }]} onPress={doReset} disabled={loading} activeOpacity={0.85}>
                <LinearGradient colors={[accent, Colors.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sc.primaryGrad}>
                  {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                    <Text style={sc.primaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                      Update password
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep("email")} style={{ alignSelf: "center", paddingVertical: 4 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>← Back / Resend</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </GlassModal>
  );
}

// ─── Email verify modal ────────────────────────────────────────────────────────
function EmailVerifyModal({ visible, email, onClose, onVerified, isDark, accent }: { visible: boolean; email: string; onClose: () => void; onVerified: () => void; isDark: boolean; accent: string }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const sentRef = useRef(false);

  useEffect(() => {
    if (visible && !sentRef.current && email) { sentRef.current = true; sendCode(); }
    if (!visible) { sentRef.current = false; setCode(""); }
  }, [visible, email]);

  async function sendCode() {
    setSending(true);
    await supabase.auth.resend({ type: "signup", email });
    setSending(false);
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
    <GlassModal visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#F1F1F1" }}>Verify your email</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}><Ionicons name="close" size={20} color="rgba(255,255,255,0.40)" /></TouchableOpacity>
        </View>
        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", marginBottom: 20, lineHeight: 20 }}>
          {sending ? "Sending verification code…" : `We sent a 6-digit code to ${email}`}
        </Text>
        <View style={{ gap: 12 }}>
          <AuthInput icon="keypad" placeholder="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" returnKeyType="go" onSubmitEditing={verify} accent={accent} />
          <TouchableOpacity style={[sc.primaryBtn, (loading || sending) && { opacity: 0.6 }]} onPress={verify} disabled={loading || sending} activeOpacity={0.85}>
            <LinearGradient colors={[accent, Colors.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sc.primaryGrad}>
              {(loading || sending) ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text style={sc.primaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  Verify email
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setCode(""); sentRef.current = false; sendCode(); }} disabled={sending} style={{ alignSelf: "center", paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>{sending ? "Sending…" : "Resend code"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
}

// ─── Sign in screen ────────────────────────────────────────────────────────────
export default function SignInScreen() {
  const { isDark } = useTheme();
  const { accent } = useAppAccent();
  const { t } = useLanguage();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = useWindowDimensions();
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void AsyncStorage.getItem(PENDING_INVITE_KEY).then(async (pendingCode) => {
      if (cancelled) return;
      if (pendingCode) {
        await AsyncStorage.removeItem(PENDING_INVITE_KEY).catch(() => {});
        if (!cancelled) router.replace({ pathname: "/join/[code]", params: { code: pendingCode } } as any);
      } else {
        router.replace("/(tabs)/chats");
      }
    }).catch(() => {
      if (!cancelled) router.replace("/(tabs)/chats");
    });
    return () => { cancelled = true; };
  }, [user]);

  const [step, setStep] = useState<"landing" | "email">("landing");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);
  const [forgotVisible, setForgotVisible] = useState(false);
  const [verifyVisible, setVerifyVisible] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const pwdRef = useRef<TextInput>(null);
  const isSubmittingRef = useRef(false);
  const nativeAutoSignInRef = useRef(false);

  async function finishGoogleIdTokenSignIn(idToken: string) {
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });
    if (error) throw error;
    setOauthLoading(null);
    router.replace("/(tabs)/chats");
  }

  // A returning Android user should not have to press the Google button again.
  // GoogleSignin restores the previously approved account without showing a
  // browser or account picker. A first-time user still gets the native picker
  // when they press Continue with Google.
  useEffect(() => {
    if (Platform.OS !== "android" || user || nativeAutoSignInRef.current) return;
    nativeAutoSignInRef.current = true;
    let cancelled = false;
    setOauthLoading("google");

    void (async () => {
      try {
        const result = await signInSilentlyWithNativeGoogle();
        if (cancelled || result.kind !== "success") return;
        await finishGoogleIdTokenSignIn(result.idToken);
      } catch (error: any) {
        // Silent sign-in must never interrupt the login screen. A missing
        // native module or unregistered signing certificate is handled by the
        // explicit native button flow.
        if (__DEV__) {
          console.warn("[Auth] Native Google silent sign-in unavailable", error?.code ?? error?.message ?? error);
        }
      } finally {
        if (!cancelled) setOauthLoading(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ── Biometric state ──────────────────────────────────────────────────────────
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioStored, setBioStored] = useState(false);
  const [bioLabel, setBioLabel] = useState<"Face ID" | "Touch ID" | "Biometrics">("Biometrics");
  const [bioIcon, setBioIcon] = useState<"scan" | "finger-print">("scan");
  const [bioLoading, setBioLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [hw, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!hw || !enrolled) return;
        setBioAvailable(true);
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBioLabel("Face ID"); setBioIcon("scan");
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBioLabel("Touch ID"); setBioIcon("finger-print");
        }
        const stored = await SecureStore.getItemAsync(BIO_REFRESH_KEY);
        setBioStored(!!stored);
      } catch {}
    })();
  }, []);

  async function storeSessionForBio(refreshToken: string, email: string) {
    if (!bioAvailable) return;
    try {
      await SecureStore.setItemAsync(BIO_REFRESH_KEY, refreshToken);
      await SecureStore.setItemAsync(BIO_EMAIL_KEY, email);
      setBioStored(true);
    } catch {}
  }

  async function handleBioSignIn() {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setBioLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Sign in to AfuChat`,
        cancelLabel: "Use password",
        disableDeviceFallback: false,
      });
      if (!result.success) { setBioLoading(false); return; }
      const storedToken = await SecureStore.getItemAsync(BIO_REFRESH_KEY);
      if (!storedToken) {
        setBioStored(false); setBioLoading(false);
        return showAlert("Session expired", "Please sign in again.");
      }
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: storedToken });
      if (error || !data.session) {
        await SecureStore.deleteItemAsync(BIO_REFRESH_KEY);
        setBioStored(false); setBioLoading(false);
        return showAlert("Session expired", "Please sign in again to re-enable biometrics.");
      }
      await SecureStore.setItemAsync(BIO_REFRESH_KEY, data.session.refresh_token);
      setBioLoading(false);
      router.replace("/(tabs)/chats");
    } catch {
      setBioLoading(false);
      showAlert("Error", "Biometric authentication failed.");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  // Slide animation
  const landingX = useRef(new Animated.Value(0)).current;
  const formX = useRef(new Animated.Value(SW)).current;

  function goToEmail() {
    setStep("email");
    Animated.parallel([
      Animated.spring(landingX, { toValue: -SW, useNativeDriver: true, tension: 200, friction: 28 }),
      Animated.spring(formX, { toValue: 0, useNativeDriver: true, tension: 200, friction: 28 }),
    ]).start();
  }

  function goToLanding() {
    setStep("landing");
    Animated.parallel([
      Animated.spring(landingX, { toValue: 0, useNativeDriver: true, tension: 200, friction: 28 }),
      Animated.spring(formX, { toValue: SW, useNativeDriver: true, tension: 200, friction: 28 }),
    ]).start();
  }

  function detectType(raw: string): "email" | "handle" | "phone" {
    const s = raw.trim();
    if (s.includes("@") && /\.\w+$/.test(s.split("@")[1] ?? "")) return "email";
    if (s.startsWith("+") || /^\d{7,15}$/.test(s.replace(/[\s\-()+]/g, ""))) return "phone";
    return "handle";
  }

  async function resolveToEmail(raw: string): Promise<string | null> {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-resolve-identifier`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ identifier: raw.trim() }),
      });
      const json = await res.json();
      return json.email ?? null;
    } catch { return null; }
  }

  async function handleLogin() {
    if (isSubmittingRef.current) return;
    const raw = identifier.trim();
    if (!raw || !password) return showAlert("Missing fields", "Please enter your email/username and password.");
    isSubmittingRef.current = true;
    setLoading(true);
    if (__DEV__) console.log("[Auth] signInWithPassword →", raw, new Date().toISOString());
    try {
      let resolvedEmail = raw;
      const type = detectType(raw);
      if (type !== "email") {
        const found = await resolveToEmail(raw);
        if (!found) {
          setLoading(false);
          showAlert("Account not found", type === "handle" ? "No account found for that username." : "No account found for that phone number.");
          return;
        }
        resolvedEmail = found;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });
      if (error) {
        setLoading(false);
        const msg = error.message ?? "";
        const msgL = msg.toLowerCase();
        const isRateLimit = error.status === 429 || msgL.includes("rate limit") || msgL.includes("too many requests") || msgL.includes("over_email_send_rate_limit") || msgL.includes("email rate limit exceeded") || msgL.includes("too many sign");
        if (isRateLimit) showAlert("Too many attempts", "You've made too many sign-in attempts.\n\nPlease wait a few minutes before trying again.");
        else showAlert("Sign in failed", msg || "An unexpected error occurred. Please try again.");
        return;
      }
      if (data.user) {
        if (!data.user.email_confirmed_at) {
          await supabase.auth.signOut();
          setLoading(false);
          setVerifyEmail(resolvedEmail); setVerifyVisible(true); return;
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
            { text: "Restore", style: "default", onPress: async () => { await supabase.from("profiles").update({ scheduled_deletion_at: null }).eq("id", data.user!.id); router.replace("/(tabs)/chats"); } },
          ]); return;
        }
      }
      if (data.session) storeSessionForBio(data.session.refresh_token, resolvedEmail);
      setLoading(false);
      router.replace("/(tabs)/chats");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  async function handleGitHub() {
    try {
      setOauthLoading("github");
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "github",
          options: { redirectTo: `${window.location.origin}/` },
        });
        if (error) {
          showAlert("Error", error.message);
          setOauthLoading(null);
        }
        return;
      }

      const redirectUrl = makeRedirectUri({ native: "afuchat://(auth)/login" });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });
      if (error) { showAlert("Error", error.message); setOauthLoading(null); return; }
      if (!data?.url) { setOauthLoading(null); return; }
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
            setOauthLoading(null); router.replace("/(tabs)/chats"); return;
          }
        }
        let at = url.hash ? new URLSearchParams(url.hash.substring(1)).get("access_token") : null;
        let rt = url.hash ? new URLSearchParams(url.hash.substring(1)).get("refresh_token") : null;
        if (!at) { at = url.searchParams.get("access_token"); rt = url.searchParams.get("refresh_token"); }
        if (at && rt) {
          const { error: e } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
          if (e) showAlert("Error", e.message);
          else router.replace("/(tabs)/chats");
        }
      }
      setOauthLoading(null);
    } catch { setOauthLoading(null); showAlert("Error", "Could not complete GitHub sign-in."); }
  }

  async function handleGoogle() {
    try {
      setOauthLoading("google");
      if (Platform.OS !== "android") {
        showAlert("Google sign-in unavailable", "Google sign-in is available in the Android app.");
        return;
      }

      const nativeResult = await signInWithNativeGoogle();
      if (nativeResult.kind === "cancelled" || nativeResult.kind === "no_saved_credential") return;
      if (nativeResult.kind === "unavailable") {
        showAlert("Google sign-in unavailable", "Install the Android app to use native Google sign-in.");
        return;
      }
      await finishGoogleIdTokenSignIn(nativeResult.idToken);
    } catch (error: any) {
      showAlert("Google sign-in failed", error?.message || "Could not complete Google sign-in.");
    } finally {
      setOauthLoading(null);
    }
  }

  const idType = detectType(identifier);
  const idIcon = idType === "email" ? "mail" : idType === "phone" ? "call" : "at";
  const showBioBtn = bioAvailable && bioStored;

  return (
    <View style={{ flex: 1, backgroundColor: BG, overflow: "hidden" }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Background orbs ── */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
        <SoftOrb cx={SW * 0.85} cy={SH * 0.08} size={280} color={accent} />
        <SoftOrb cx={SW * 0.10} cy={SH * 0.55} size={220} color="#7B5EA7" />
        <SoftOrb cx={SW * 0.55} cy={SH * 0.85} size={180} color={accent} />
      </View>

      {/* ── LANDING PANEL ── */}
      <Animated.View style={[sc.panel, { transform: [{ translateX: landingX }], pointerEvents: step === "landing" ? "auto" : "none" } as any]}>
        <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }}>

          {/* Logo + wordmark */}
          <View style={{ alignItems: "center", marginBottom: showBioBtn ? 32 : 48 }}>
            <View style={sc.logoRing}>
              <AfuLogo size={56} visualScale={1.12} forceTheme="dark" />
            </View>
            <Text style={sc.logoWordmark}>AfuChat</Text>
          </View>

          {/* Biometric quick-sign-in */}
          {showBioBtn && (
            <View style={{ alignItems: "center", marginBottom: 28 }}>
              <TouchableOpacity
                style={[sc.bioCircle, { borderColor: accent + "50", backgroundColor: accent + "12" }]}
                onPress={handleBioSignIn}
                disabled={bioLoading}
                activeOpacity={0.82}
              >
                {bioLoading
                  ? <ActivityIndicator size="large" color={accent} />
                  : <Ionicons name={bioIcon} size={32} color={accent} />
                }
              </TouchableOpacity>
              <Text style={{ marginTop: 10, fontSize: 13, fontFamily: "Inter_600SemiBold", color: accent, letterSpacing: 0.1 }}>
                {bioLoading ? "Verifying…" : `Sign in with ${bioLabel}`}
              </Text>
              <Text style={{ marginTop: 3, fontSize: 11.5, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.32)" }}>
                Tap to unlock instantly
              </Text>
            </View>
          )}

          <Text style={sc.heading}>{t("Welcome back")}</Text>
          <Text style={sc.subheading}>{t("Sign in to your AfuChat account")}</Text>

          <View style={{ gap: 12, marginTop: 28 }}>
            {/* Native Google is available only in the Android standalone app. */}
            {Platform.OS === "android" && (
              <TouchableOpacity style={[sc.glassBtn, oauthLoading === "google" && { opacity: 0.62 }]} onPress={handleGoogle} disabled={oauthLoading !== null} activeOpacity={0.78}>
                {oauthLoading === "google" ? <ActivityIndicator size="small" color={accent} /> : <GoogleLogo size={20} />}
                <Text style={sc.glassBtnText}>{oauthLoading === "google" ? t("Signing in…") : t("Continue with Google")}</Text>
              </TouchableOpacity>
            )}

            {/* GitHub */}
            <TouchableOpacity style={[sc.glassBtn, oauthLoading === "github" && { opacity: 0.62 }]} onPress={handleGitHub} disabled={oauthLoading !== null} activeOpacity={0.78}>
              {oauthLoading === "github" ? <ActivityIndicator size="small" color={accent} /> : <GitHubLogo size={20} color="rgba(255,255,255,0.85)" />}
              <Text style={sc.glassBtnText}>{oauthLoading === "github" ? t("Signing in…") : t("Continue with GitHub")}</Text>
            </TouchableOpacity>

            {/* Email */}
            <TouchableOpacity style={sc.glassBtn} onPress={goToEmail} activeOpacity={0.78}>
              <Ionicons name="mail" size={20} color="rgba(255,255,255,0.75)" />
              <Text style={sc.glassBtnText}>{t("Continue with email")}</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 24 }}>
            <View style={{ flex: 1, height: 0.5, backgroundColor: "rgba(255,255,255,0.10)" }} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.25)", letterSpacing: 0.4 }}>or</Text>
            <View style={{ flex: 1, height: 0.5, backgroundColor: "rgba(255,255,255,0.10)" }} />
          </View>

          {/* Create account */}
          <TouchableOpacity
            style={[sc.outlineBtn, { borderColor: "rgba(255,255,255,0.14)" }]}
            onPress={() => router.push("/(auth)/register")}
            activeOpacity={0.78}
          >
            <Text style={[sc.outlineBtnText, { color: accent }]}>{t("Create a new account")}</Text>
          </TouchableOpacity>

          {/* Footer */}
          <View style={{ marginTop: "auto", paddingTop: 28, alignItems: "center", gap: 6 }}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Text style={[sc.footerLink, { color: accent }]} onPress={() => Linking.openURL("https://afuchat.com/terms").catch(() => {})}>{t("Terms")}</Text>
              <Text style={{ color: "rgba(255,255,255,0.20)", fontSize: 12 }}>·</Text>
              <Text style={[sc.footerLink, { color: accent }]} onPress={() => Linking.openURL("https://afuchat.com/privacy").catch(() => {})}>{t("Privacy")}</Text>
              <Text style={{ color: "rgba(255,255,255,0.20)", fontSize: 12 }}>·</Text>
              <Text style={[sc.footerLink, { color: accent }]} onPress={() => router.push("/help")}>{t("Help")}</Text>
            </View>
            <Text style={{ fontSize: 10.5, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.14)" }}>
              © {new Date().getFullYear()} AfuChat Technologies Limited
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* ── EMAIL FORM PANEL ── */}
      <Animated.View style={[sc.panel, { transform: [{ translateX: formX }], pointerEvents: step === "email" ? "auto" : "none" } as any]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Back */}
            <TouchableOpacity onPress={goToLanding} style={sc.backBtn} hitSlop={14}>
              <View style={sc.backBtnInner}>
                <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.80)" />
              </View>
            </TouchableOpacity>

            <View style={{ marginTop: 24, marginBottom: 36 }}>
              <Text style={sc.heading}>{t("Sign in")}</Text>
              <Text style={sc.subheading}>{t("Enter your credentials to continue")}</Text>
            </View>

            <View style={{ gap: 14 }}>
              <AuthInput
                icon={idIcon}
                placeholder="Email, @username, or phone"
                value={identifier} onChangeText={setIdentifier}
                keyboardType={idType === "phone" ? "phone-pad" : "email-address"}
                autoComplete="username"
                returnKeyType="next" onSubmitEditing={() => pwdRef.current?.focus()}
                accent={accent}
              />
              <AuthInput
                inputRef={pwdRef}
                icon="lock-closed" placeholder="Password"
                value={password} onChangeText={setPassword}
                secureTextEntry={!showPwd} autoComplete="current-password"
                returnKeyType="go" onSubmitEditing={handleLogin}
                accent={accent}
                rightElement={
                  <TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}>
                    <Ionicons name={showPwd ? "eye-off" : "eye"} size={18} color="rgba(255,255,255,0.35)" />
                  </TouchableOpacity>
                }
              />
            </View>

            <TouchableOpacity onPress={() => setForgotVisible(true)} style={{ alignSelf: "flex-end", paddingVertical: 12, marginBottom: 4 }}>
              <Text style={{ fontSize: 13.5, fontFamily: "Inter_500Medium", color: accent }}>{t("Forgot password?")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[sc.primaryBtn, loading && { opacity: 0.62 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[accent, Colors.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sc.primaryGrad}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={sc.primaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                    {t("Sign in")}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 24 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.40)" }}>{t("Don't have an account?")}</Text>
              <TouchableOpacity onPress={() => router.push("/(auth)/register")} activeOpacity={0.7}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: accent }}>{t("Sign up")}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      <ForgotPasswordModal visible={forgotVisible} onClose={() => setForgotVisible(false)} isDark={isDark} accent={accent} />
      <EmailVerifyModal
        visible={verifyVisible} email={verifyEmail}
        onClose={() => setVerifyVisible(false)}
        onVerified={() => { setVerifyVisible(false); router.replace("/(tabs)/chats"); }}
        isDark={isDark} accent={accent}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  panel: { ...StyleSheet.absoluteFill, backgroundColor: "transparent" },

  logoRing: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  logoWordmark: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },

  heading: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
    lineHeight: 40,
    marginBottom: 8,
    color: "#FFFFFF",
  },
  subheading: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    color: "rgba(255,255,255,0.45)",
  },

  bioCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  glassBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 0,
  },
  glassBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
    color: "rgba(255,255,255,0.85)",
  },
  outlineBtn: {
    height: 56,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },

  backBtn: {
    marginBottom: 4,
  },
  backBtnInner: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtn: { borderRadius: 999, overflow: "hidden", marginTop: 4 },
  primaryGrad: { height: 58, alignItems: "center", justifyContent: "center" },
  primaryText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.1,
    flexShrink: 1,
    minWidth: 0,
    textAlign: "center",
    ...Platform.select({
      web: { whiteSpace: "nowrap" } as any,
    }),
  },

  footerLink: { fontSize: 12.5, fontFamily: "Inter_500Medium" },
});
