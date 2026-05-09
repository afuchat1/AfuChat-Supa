import React, { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { googleSignIn } from "@/lib/googleAuth";

const afuSymbol = require("@/assets/images/afu-symbol.png");

WebBrowser.maybeCompleteAuthSession();

// ─── Focused input ────────────────────────────────────────────────────────────
function AuthInput({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, autoComplete, colors, isDark, rightElement, onSubmitEditing, returnKeyType, inputRef }: any) {
  const [focused, setFocused] = useState(false);
  const { accent } = useAppAccent();
  return (
    <View style={[inputSt.wrap, { backgroundColor: isDark ? "#111113" : "#F5F5F7" }, ]}>
      <Ionicons name={icon} size={17} color={focused ? accent : colors.textMuted} style={inputSt.icon} />
      <TextInput ref={inputRef} style={[inputSt.text, { color: colors.text }]} placeholder={placeholder} placeholderTextColor={colors.textMuted} value={value} onChangeText={onChangeText} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize ?? "none"} autoComplete={autoComplete} autoCorrect={false} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onSubmitEditing={onSubmitEditing} returnKeyType={returnKeyType ?? "next"} />
      {rightElement}
    </View>
  );
}
const inputSt = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 14, height: 50 },
  icon: { marginRight: 10 },
  text: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 50, outlineStyle: "none" } as any,
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

// ─── OAuth button ─────────────────────────────────────────────────────────────
function OAuthBtn({ label, logo, onPress, loading, colors, isDark }: any) {
  return (
    <TouchableOpacity
      accessibilityLabel={`Continue with ${label}`}
      accessibilityRole="button"
      style={[oauthSt.btn, { backgroundColor: isDark ? "#15151A" : "#FFFFFF", borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", shadowColor: "#000" }]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}
    >
      {loading ? <ActivityIndicator size="small" color={colors.text} /> : logo}
    </TouchableOpacity>
  );
}
const oauthSt = StyleSheet.create({
  btn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: "center", justifyContent: "center", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
});

// ─── Email verification modal ─────────────────────────────────────────────────
function VerifyEmailModal({
  visible, onClose, email, onVerified, colors, isDark,
}: { visible: boolean; onClose: () => void; email: string; onVerified: (uid: string) => void; colors: any; isDark: boolean }) {
  const { accent } = useAppAccent();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    if (!visible) { const t = setTimeout(() => setCode(""), 220); return () => clearTimeout(t); }
  }, [visible]);

  async function verify() {
    if (code.trim().length !== 6) return showAlert("Invalid code", "Please enter the 6-digit code from your email.");
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "signup" });
    setLoading(false);
    if (error) showAlert("Verification failed", "The code is invalid or expired. Please try again.");
    else onVerified(data.user?.id ?? "");
  }

  async function resend() {
    const redirect = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin + "/" : "https://afuchat.com/";
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirect } });
    if (error) showAlert("Error", error.message);
    else showAlert("Code resent", "A new code has been sent to your email.");
  }

  const bg = isDark ? "#18181B" : "#FFFFFF";

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[vmSt.overlay, { opacity, backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.45)" }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[vmSt.card, { backgroundColor: bg }]}>
          <View style={vmSt.header}>
            <View style={{ flex: 1 }}>
              <Text style={[vmSt.title, { color: colors.text }]}>Verify your email</Text>
              <Text style={[vmSt.subtitle, { color: colors.textSecondary }]}>
                We sent a 6-digit code to{"\n"}<Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>{email}</Text>
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={vmSt.closeBtn}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={vmSt.body}>
            <AuthInput icon="keypad-outline" placeholder="6-digit verification code" value={code} onChangeText={setCode} keyboardType="number-pad" colors={colors} isDark={isDark} returnKeyType="go" onSubmitEditing={verify} />
            <TouchableOpacity style={[vmSt.btn, { backgroundColor: accent }, loading && { opacity: 0.6 }]} onPress={verify} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={vmSt.btnText}>Verify email</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={resend} style={{ alignSelf: "center", paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>Didn't receive it? Resend code</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}
const vmSt = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, borderRadius: 16, overflow: "hidden",
    // @ts-ignore
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)" },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 28, paddingTop: 28, paddingBottom: 20, gap: 12 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3, marginBottom: 6 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 2 },
  body: { paddingHorizontal: 28, paddingBottom: 28, gap: 12 },
  btn: { height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 4 },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

// ─── OAuth WebView modal ──────────────────────────────────────────────────────
function OAuthWebModal({ url, onClose, onNav, onShouldLoad, colors }: any) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.text }}>Sign Up</Text>
          <View style={{ width: 36 }} />
        </View>
        <WebView source={{ uri: url }} style={{ flex: 1 }} javaScriptEnabled domStorageEnabled startInLoadingState onNavigationStateChange={onNav} onShouldStartLoadWithRequest={onShouldLoad} />
      </View>
    </Modal>
  );
}

// ─── Terms checkbox ───────────────────────────────────────────────────────────
function TermsRow({ agreed, onToggle, colors, isDark }: any) {
  const { accent } = useAppAccent();
  return (
    <TouchableOpacity style={termsSt.row} onPress={onToggle} activeOpacity={0.7}>
      <View style={[termsSt.box, { borderColor: agreed ? accent : isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)", backgroundColor: agreed ? accent : "transparent" }]}>
        {agreed && <Ionicons name="checkmark" size={13} color="#fff" />}
      </View>
      <Text style={[termsSt.text, { color: colors.textSecondary }]}>
        I agree to the{" "}
        <Text style={{ color: accent }} onPress={() => Linking.openURL("https://afuchat.com/terms")}>Terms of Service</Text>
        {" "}and{" "}
        <Text style={{ color: accent }} onPress={() => Linking.openURL("https://afuchat.com/privacy")}>Privacy Policy</Text>
      </Text>
    </TouchableOpacity>
  );
}
const termsSt = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  text: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function RegisterScreen() {
  const { colors, isDark, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => { if (user) router.replace("/(tabs)"); }, [user]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [oauthModalUrl, setOauthModalUrl] = useState<string | null>(null);
  const oauthHandledRef = useRef(false);
  const [verifyVisible, setVerifyVisible] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupUserId, setSignupUserId] = useState<string | null>(null);
  const pwdRef = useRef<TextInput>(null);

  async function handleRegister() {
    if (!email || !password) return showAlert("Missing fields", "Please enter your email and password.");
    if (!agreed) return showAlert("Terms required", "You must agree to the Terms of Service and Privacy Policy.");
    if (password.length < 6) return showAlert("Password too short", "Password must be at least 6 characters.");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setLoading(false);
    if (error) { showAlert("Registration failed", error.message); return; }
    if (data.user) {
      setSignupUserId(data.user.id);
      if (data.user.identities && data.user.identities.length === 0) {
        showAlert("Account exists", "An account with this email already exists. Please sign in instead."); return;
      }
      if (!data.session) {
        setSignupEmail(email.trim());
        setVerifyVisible(true);
      } else {
        router.replace({ pathname: "/onboarding", params: { userId: data.user.id } });
      }
    }
  }

  function onVerified(uid: string) {
    setVerifyVisible(false);
    router.replace({ pathname: "/onboarding", params: { userId: signupUserId || uid || "" } });
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
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) { showAlert("Error", error.message); }
      else {
        setOauthModalUrl(null); setOauthLoading(null);
        const uid = data.user?.id;
        if (uid) {
          const { data: prof } = await supabase.from("profiles").select("onboarding_completed").eq("id", uid).maybeSingle();
          if (!prof?.onboarding_completed) { router.replace({ pathname: "/onboarding", params: { userId: uid } } as any); return; }
        }
        router.replace("/(tabs)"); return;
      }
    } catch { showAlert("Error", "Could not complete sign up."); }
    setOauthModalUrl(null); setOauthLoading(null);
  }

  async function nativeGoogleSignIn() {
    setOauthLoading("google");
    const result = await googleSignIn();
    if (!result.ok) {
      if (result.cancelled) { setOauthLoading(null); return; }
      if (result.error === "DEVELOPER_ERROR") {
        // Native Google Sign-In isn't configured for this build (SHA-1 not
        // registered). Fall back to the in-app WebView OAuth flow seamlessly.
        const { data: oauthData, error: oauthErr } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: "https://afuchat.com/",
            skipBrowserRedirect: true,
            queryParams: { prompt: "select_account" },
          },
        });
        if (oauthErr || !oauthData?.url) {
          setOauthLoading(null);
          showAlert("Sign-in Error", "Could not start Google sign-in. Please try again.");
          return;
        }
        oauthHandledRef.current = false;
        setOauthModalUrl(oauthData.url);
        return;
      }
      setOauthLoading(null);
      showAlert("Error", result.error);
      return;
    }
    const uid = result.userId;
    if (uid) {
      const { data: prof } = await supabase.from("profiles").select("onboarding_completed").eq("id", uid).maybeSingle();
      if (!prof?.onboarding_completed) {
        router.replace({ pathname: "/onboarding", params: { userId: uid } } as any);
        return;
      }
    }
    router.replace("/(tabs)");
  }

  async function signInWithProvider(provider: string, useNativeFlow = true) {
    try {
      if (useNativeFlow && provider === "google" && Platform.OS !== "web") return nativeGoogleSignIn();
      setOauthLoading(provider);
      const redirectUrl = Platform.OS === "web"
        ? (typeof window !== "undefined" ? window.location.origin + "/" : "https://afuchat.com/")
        : makeRedirectUri({ native: "afuchat://(auth)/register" });
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: provider as any, options: { redirectTo: redirectUrl, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } } });
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
    } catch { setOauthLoading(null); showAlert("Error", "Could not complete sign up."); }
  }

  // ── Shared form content ───────────────────────────────────────────────────
  const FormContent = (
    <>
      <View style={{ gap: 10 }}>
        <AuthInput icon="mail-outline" placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" colors={colors} isDark={isDark} returnKeyType="next" onSubmitEditing={() => pwdRef.current?.focus()} />
        <AuthInput inputRef={pwdRef} icon="lock-closed-outline" placeholder="Password (min. 6 characters)" value={password} onChangeText={setPassword} secureTextEntry={!showPwd} autoComplete="new-password" colors={colors} isDark={isDark} returnKeyType="go" onSubmitEditing={handleRegister}
          rightElement={
            <TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}>
              <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={17} color={colors.textMuted} />
            </TouchableOpacity>
          }
        />
      </View>
      <TermsRow agreed={agreed} onToggle={() => setAgreed(p => !p)} colors={colors} isDark={isDark} />
      <TouchableOpacity style={[formSt.primaryBtn, { backgroundColor: accent }, loading && { opacity: 0.6 }]} onPress={handleRegister} disabled={loading} activeOpacity={0.85}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={formSt.primaryBtnText}>Create account</Text>}
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
        <Text style={[{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }]}>Already have an account?</Text>
        <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: accent }}>{" "}Sign in</Text>
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
            <Text style={[mobSt.tagline, { color: colors.textSecondary }]}>Create your free account</Text>
          </View>
          <View style={{ gap: 16 }}>{FormContent}</View>
        </ScrollView>
      </KeyboardAvoidingView>
      <VerifyEmailModal visible={verifyVisible} onClose={() => setVerifyVisible(false)} email={signupEmail} onVerified={onVerified} colors={colors} isDark={isDark} />
      {oauthModalUrl && <OAuthWebModal url={oauthModalUrl} onClose={() => { setOauthModalUrl(null); setOauthLoading(null); }} onNav={(s: any) => { if (s.url && isOAuthRedirect(s.url)) handleOAuthRedirect(s.url); }} onShouldLoad={(r: any) => { if (r.url && isOAuthRedirect(r.url)) { handleOAuthRedirect(r.url); return false; } return true; }} colors={colors} />}
    </View>
  );
}

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
