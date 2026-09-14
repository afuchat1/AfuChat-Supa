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
import { LinearGradient } from "@/components/ui/SafeGradient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { useLanguage } from "@/context/LanguageContext";
import { showAlert } from "@/lib/alert";
import AfuLogo from "@/components/ui/AfuLogo";
import { GitHubLogo, GoogleLogo } from "@/components/ui/OAuthLogos";
import Colors from "@/constants/colors";
import { signInWithNativeGoogle } from "@/lib/nativeGoogleAuth";

const BG = "#000000";

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

// ─── Checkbox ─────────────────────────────────────────────────────────────────
function Checkbox({ checked, onToggle, accent, children }: { checked: boolean; onToggle: () => void; isDark: boolean; accent: string; children: React.ReactNode }) {
  return (
    <TouchableOpacity style={cb.row} onPress={onToggle} activeOpacity={0.7}>
      <View style={[cb.box, {
        borderColor: checked ? accent : "rgba(255,255,255,0.18)",
        backgroundColor: checked ? accent : "transparent",
      }]}>
        {checked && <Ionicons name="checkmark" size={12} color="#fff" />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </TouchableOpacity>
  );
}
const cb = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
});

// ─── Glass modal wrapper ───────────────────────────────────────────────────────
function GlassModal({ visible, onClose, children }: { visible: boolean; onClose: () => void; isDark: boolean; children: React.ReactNode }) {
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
  topBorder: { height: 1, backgroundColor: "rgba(255,255,255,0.14)" },
});

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
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
    } catch (error: any) {
      showAlert("Could not send code", error?.message || "We couldn't send a verification code. Please try again.");
    } finally {
      setSending(false);
    }
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
              {(loading || sending) ? <ActivityIndicator color="#fff" size="small" /> : <Text style={sc.primaryText}>Verify email</Text>}
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

// ─── Sign up screen ────────────────────────────────────────────────────────────
export default function SignUpScreen() {
  const { isDark } = useTheme();
  const { accent } = useAppAccent();
  const { t } = useLanguage();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = useWindowDimensions();
  // Only redirect already-logged-in users when this screen first mounts.
  // Do NOT react to `user` becoming set during the sign-up flow itself —
  // the sign-up handlers navigate explicitly. Reacting to [user] caused a
  // race: SIGNED_IN fires → setUser() → this effect → router.replace("/(tabs)/chats")
  // which overwrote the intentional router.replace("/onboarding") and sent
  // the new user back to the start of onboarding with a fresh (empty) state.
  useEffect(() => { if (user) router.replace("/(tabs)/chats"); }, []);

  const [step, setStep] = useState<"landing" | "email">("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);
  const [verifyVisible, setVerifyVisible] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [signupUserId, setSignupUserId] = useState<string | null>(null);
  const pwdRef = useRef<TextInput>(null);

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

  async function handleSignup() {
    const e = email.trim();
    if (!e || !password) return showAlert("Missing fields", "Please enter your email and a password.");
    if (!ageOk) return showAlert("Age required", "You must confirm that you are 13 years of age or older.");
    if (!termsOk) return showAlert("Terms required", "You must agree to the Terms of Service and Privacy Policy.");
    if (password.length < 8) return showAlert("Password too short", "Password must be at least 8 characters.");
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: e, password });
      if (error) {
        const message = error.message || "We couldn't create your account. Please try again.";
        if (/already registered|already exists|user already/i.test(message)) {
          showAlert("Account exists", "An account with this email already exists. Please sign in instead.");
          router.replace("/(auth)/login");
        } else {
          showAlert("Sign up failed", message);
        }
        return;
      }
      if (!data.user) {
        showAlert("Sign up failed", "No account was created. Please try again.");
        return;
      }
      if (data.user.identities && data.user.identities.length === 0) {
        showAlert("Account exists", "An account with this email already exists. Please sign in instead.");
        router.replace("/(auth)/login"); return;
      }
      setSignupUserId(data.user.id);
      if (!data.session) { setVerifyEmail(e); setVerifyVisible(true); }
      else router.replace({ pathname: "/onboarding", params: { userId: data.user.id } } as any);
    } catch (error: any) {
      showAlert("Sign up failed", error?.message || "We couldn't create your account. Check your connection and try again.");
    } finally {
      setLoading(false);
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

      const redirectUrl = makeRedirectUri({ native: "afuchat://(auth)/register" });
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
        showAlert("Google sign-up unavailable", "Google sign-up is available in the Android app.");
        return;
      }

      const nativeResult = await signInWithNativeGoogle();
      if (nativeResult.kind === "cancelled" || nativeResult.kind === "no_saved_credential") return;
      if (nativeResult.kind === "unavailable") {
        showAlert("Google sign-up unavailable", "Install the Android app to use native Google sign-up.");
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: nativeResult.idToken,
      });
      if (authError) throw authError;

      const uid = authData.user?.id;
      if (!uid) throw new Error("Google sign-up did not create a user session.");
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", uid)
        .maybeSingle();
      if (!profile?.onboarding_completed) {
        router.replace({ pathname: "/onboarding", params: { userId: uid } } as any);
      } else {
        router.replace("/(tabs)/chats");
      }
    } catch (error: any) {
      showAlert("Google sign-up failed", error?.message || "Could not complete Google sign-up.");
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG, overflow: "hidden" }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Background orbs ── */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
        <SoftOrb cx={SW * 0.15} cy={SH * 0.10} size={260} color={accent} />
        <SoftOrb cx={SW * 0.88} cy={SH * 0.50} size={220} color={accent} />
        <SoftOrb cx={SW * 0.40} cy={SH * 0.88} size={180} color={accent} />
      </View>

      {/* ── LANDING PANEL ── */}
      <Animated.View style={[sc.panel, { transform: [{ translateX: landingX }], pointerEvents: step === "landing" ? "auto" : "none" } as any]}>
        <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }}>

          {/* Logo + tagline */}
          <View style={{ alignItems: "center", marginBottom: 48 }}>
            <View style={sc.logoRing}>
              <AfuLogo size={56} visualScale={1.12} forceTheme="dark" />
            </View>
            <Text style={sc.logoWordmark}>AfuChat</Text>
            <View style={sc.freeBadge}>
              <Text style={sc.freeBadgeText}>Free forever</Text>
            </View>
          </View>

          <Text style={sc.heading}>{t("Create account")}</Text>
          <Text style={sc.subheading}>{t("Join millions of people on AfuChat")}</Text>

          <View style={{ gap: 12, marginTop: 28 }}>
            {/* Native Google is available only in the Android standalone app. */}
            {Platform.OS === "android" && (
              <TouchableOpacity style={[sc.glassBtn, oauthLoading === "google" && { opacity: 0.62 }]} onPress={handleGoogle} disabled={oauthLoading !== null} activeOpacity={0.78}>
                {oauthLoading === "google" ? <ActivityIndicator size="small" color={accent} /> : <GoogleLogo size={20} />}
                <Text style={sc.glassBtnText}>{oauthLoading === "google" ? t("Signing up…") : t("Continue with Google")}</Text>
              </TouchableOpacity>
            )}

            {/* GitHub */}
            <TouchableOpacity style={[sc.glassBtn, oauthLoading === "github" && { opacity: 0.62 }]} onPress={handleGitHub} disabled={oauthLoading !== null} activeOpacity={0.78}>
              {oauthLoading === "github" ? <ActivityIndicator size="small" color={accent} /> : <GitHubLogo size={20} color="rgba(255,255,255,0.85)" />}
              <Text style={sc.glassBtnText}>{oauthLoading === "github" ? t("Signing up…") : t("Continue with GitHub")}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={sc.glassBtn} onPress={goToEmail} activeOpacity={0.78}>
              <Ionicons name="mail" size={20} color="rgba(255,255,255,0.75)" />
              <Text style={sc.glassBtnText}>{t("Continue with email")}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 24 }}>
            <View style={{ flex: 1, height: 0.5, backgroundColor: "rgba(255,255,255,0.10)" }} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.25)", letterSpacing: 0.4 }}>or</Text>
            <View style={{ flex: 1, height: 0.5, backgroundColor: "rgba(255,255,255,0.10)" }} />
          </View>

          <TouchableOpacity
            style={[sc.outlineBtn, { borderColor: "rgba(255,255,255,0.14)" }]}
            onPress={() => router.replace("/(auth)/login")}
            activeOpacity={0.78}
          >
            <Text style={[sc.outlineBtnText, { color: accent }]}>{t("Already have an account")}</Text>
          </TouchableOpacity>

          <View style={{ marginTop: "auto", paddingTop: 32, alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.25)", textAlign: "center", lineHeight: 17, paddingHorizontal: 8 }}>
              {t("By continuing, you agree to our")}{" "}
              <Text style={{ color: accent }} onPress={() => Linking.openURL("https://afuchat.com/terms").catch(() => {})}>{t("Terms")}</Text>
              {" "}{t("and")}{" "}
              <Text style={{ color: accent }} onPress={() => Linking.openURL("https://afuchat.com/privacy").catch(() => {})}>{t("Privacy Policy")}</Text>
            </Text>
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
            <TouchableOpacity onPress={goToLanding} style={sc.backBtn} hitSlop={14}>
              <View style={sc.backBtnInner}>
                <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.80)" />
              </View>
            </TouchableOpacity>

            <View style={{ marginTop: 24, marginBottom: 32 }}>
              <Text style={sc.heading}>{t("Create account")}</Text>
              <Text style={sc.subheading}>{t("Enter your details to get started")}</Text>
            </View>

            <View style={{ gap: 14 }}>
              <AuthInput
                icon="mail" placeholder="Email address"
                value={email} onChangeText={setEmail}
                keyboardType="email-address" autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => pwdRef.current?.focus()}
                accent={accent}
              />
              <AuthInput
                inputRef={pwdRef}
                icon="lock-closed" placeholder="Password (min. 8 characters)"
                value={password} onChangeText={setPassword}
                secureTextEntry={!showPwd} autoComplete="new-password"
                returnKeyType="go" onSubmitEditing={handleSignup}
                accent={accent}
                rightElement={
                  <TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}>
                    <Ionicons name={showPwd ? "eye-off" : "eye"} size={18} color="rgba(255,255,255,0.35)" />
                  </TouchableOpacity>
                }
              />
            </View>

            <View style={{ gap: 14, marginTop: 20, marginBottom: 24 }}>
              <Checkbox checked={ageOk} onToggle={() => setAgeOk(p => !p)} isDark={isDark} accent={accent}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.50)", lineHeight: 19, flex: 1 }}>
                  I confirm I am{" "}
                  <Text style={{ fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.85)" }}>13 years of age or older</Text>
                </Text>
              </Checkbox>
              <Checkbox checked={termsOk} onToggle={() => setTermsOk(p => !p)} isDark={isDark} accent={accent}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.50)", lineHeight: 19, flex: 1 }}>
                  I agree to the{" "}
                  <Text style={{ color: accent, fontFamily: "Inter_500Medium" }} onPress={() => Linking.openURL("https://afuchat.com/terms").catch(() => {})}>Terms of Service</Text>
                  {" "}and{" "}
                  <Text style={{ color: accent, fontFamily: "Inter_500Medium" }} onPress={() => Linking.openURL("https://afuchat.com/privacy").catch(() => {})}>Privacy Policy</Text>
                </Text>
              </Checkbox>
            </View>

            <TouchableOpacity
              style={[sc.primaryBtn, loading && { opacity: 0.62 }]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[accent, accent]} style={sc.primaryGrad}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={sc.primaryText}>{t("Create account")}</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 24 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.40)" }}>{t("Already have an account?")}</Text>
              <TouchableOpacity onPress={() => router.replace("/(auth)/login")} activeOpacity={0.7}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: accent }}>{t("Sign in")}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      <EmailVerifyModal
        visible={verifyVisible} email={verifyEmail}
        onClose={() => setVerifyVisible(false)}
        onVerified={() => {
          setVerifyVisible(false);
          if (signupUserId) router.replace({ pathname: "/onboarding", params: { userId: signupUserId } } as any);
          else router.replace("/(tabs)/chats");
        }}
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
    marginBottom: 8,
  },
  freeBadge: {
    backgroundColor: "rgba(175,82,222,0.20)",
    borderWidth: 1,
    borderColor: "rgba(175,82,222,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  freeBadgeText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
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

  backBtn: { marginBottom: 4 },
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
  primaryText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.1 },
});
