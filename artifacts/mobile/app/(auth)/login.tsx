import React, { useState, useRef } from "react";
import {
  ActivityIndicator,
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
import { WebView } from "react-native-webview";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

const afuSymbol = require("@/assets/images/afu-symbol.png");

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const [oauthModalUrl, setOauthModalUrl] = useState<string | null>(null);
  const oauthHandledRef = useRef(false);

  const [resetStep, setResetStep] = useState<"idle" | "email" | "code">("idle");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      showAlert("Missing fields", "Please enter email and password.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      showAlert("Login failed", error.message);
      return;
    }

    if (data.user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("scheduled_deletion_at, account_deleted")
        .eq("id", data.user.id)
        .single();

      if (prof?.account_deleted) {
        setLoading(false);
        await supabase.auth.signOut();
        showAlert("Account Deleted", "This account has been permanently deleted and can no longer be accessed.");
        return;
      }

      if (prof?.scheduled_deletion_at) {
        const deletionDate = new Date(prof.scheduled_deletion_at);
        const daysLeft = Math.max(0, Math.ceil((deletionDate.getTime() - Date.now()) / 86400000));
        setLoading(false);
        showAlert(
          "Account Scheduled for Deletion",
          `Your account is set to be permanently deleted in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Would you like to cancel the deletion and restore your account?`,
          [
            {
              text: "Delete Anyway",
              style: "destructive",
              onPress: async () => {
                await supabase.auth.signOut();
              },
            },
            {
              text: "Restore Account",
              style: "default",
              onPress: async () => {
                await supabase
                  .from("profiles")
                  .update({ scheduled_deletion_at: null })
                  .eq("id", data.user.id);
                router.replace("/(tabs)");
              },
            },
          ]
        );
        return;
      }
    }

    setLoading(false);
    router.replace("/(tabs)");
  }

  async function handleSendResetCode() {
    if (!resetEmail.trim()) {
      showAlert("Missing email", "Please enter your email address.");
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: "https://afuchat.com/reset-callback",
    });
    setResetLoading(false);
    if (error) {
      showAlert("Error", error.message);
    } else {
      showAlert("Code sent", "We've sent a 6-digit code to your email. Check your inbox (and spam folder).");
      setResetStep("code");
    }
  }

  async function handleVerifyAndReset() {
    if (!resetCode.trim()) {
      showAlert("Missing code", "Please enter the code from your email.");
      return;
    }
    if (newPassword.length < 6) {
      showAlert("Password too short", "Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert("Passwords don't match", "Please make sure both passwords match.");
      return;
    }

    setResetLoading(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: resetEmail.trim(),
      token: resetCode.trim(),
      type: "recovery",
    });

    if (verifyError) {
      setResetLoading(false);
      showAlert("Invalid code", "The code you entered is invalid or expired. Please try again.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setResetLoading(false);

    if (updateError) {
      showAlert("Error", updateError.message);
    } else {
      showAlert("Password updated", "Your password has been changed. You can now log in with your new password.");
      setResetStep("idle");
      setResetEmail("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
      await supabase.auth.signOut();
    }
  }

  function isOAuthCallback(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        (host === "www.afuchat.com" || host === "afuchat.com") &&
        parsed.pathname === "/auth/callback"
      );
    } catch {
      return false;
    }
  }

  async function handleOAuthCallback(url: string) {
    if (oauthHandledRef.current) return;
    oauthHandledRef.current = true;

    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get("code");

      if (!code) {
        showAlert("Error", "No authorization code received. Please try again.");
        setOauthModalUrl(null);
        setOauthLoading(null);
        return;
      }

      const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
      if (codeError) {
        showAlert("Error", codeError.message);
      } else {
        setOauthModalUrl(null);
        setOauthLoading(null);
        router.replace("/(tabs)");
        return;
      }
    } catch (_) {
      showAlert("Error", "Could not complete sign in. Please try again.");
    }

    setOauthModalUrl(null);
    setOauthLoading(null);
  }

  async function signInWithProvider(provider: string) {
    try {
      setOauthLoading(provider);

      const CALLBACK_URL = "https://www.afuchat.com/auth/callback";

      if (Platform.OS === "web") {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: provider as any,
          options: { redirectTo: CALLBACK_URL },
        });
        if (error) {
          showAlert("Error", error.message);
          setOauthLoading(null);
        }
        return;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: {
          redirectTo: CALLBACK_URL,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        showAlert("Error", error.message);
        setOauthLoading(null);
        return;
      }

      if (data?.url) {
        oauthHandledRef.current = false;
        setOauthModalUrl(data.url);
      } else {
        setOauthLoading(null);
      }
    } catch (_) {
      setOauthLoading(null);
      showAlert("Error", "Could not complete sign in. Please try again.");
    }
  }

  if (resetStep !== "idle") {
    return (
      <View style={[styles.root, { flexDirection: isDesktop ? "row" : "column", backgroundColor: isDesktop ? (isDark ? "#0a0a0a" : "#ffffff") : colors.background }]}>
        {isDesktop && (
          <View style={[authSplit.brandPanel, { backgroundColor: Colors.brand }]}>
            <Image source={afuSymbol} style={{ width: 80, height: 80, tintColor: "#fff", marginBottom: 28 }} resizeMode="contain" />
            <Text style={authSplit.brandTitle}>AfuChat</Text>
            <Text style={authSplit.brandTagline}>Connect with everyone, everywhere.</Text>
          </View>
        )}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: isDesktop ? (isDark ? "#111113" : "#ffffff") : colors.background }}
        >
        <ScrollView
          contentContainerStyle={
            isDesktop
              ? { flexGrow: 1, justifyContent: "center", paddingHorizontal: 60, paddingVertical: 48 }
              : { ...styles.scroll, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }
          }
          keyboardShouldPersistTaps="handled"
        >
          <View style={isDesktop ? { maxWidth: 400, width: "100%" as any, alignSelf: "center" } : undefined}>
          <View style={styles.logoWrap}>
            <Image source={afuSymbol} style={{ width: 64, height: 64, marginBottom: 12, tintColor: Colors.brand }} resizeMode="contain" />
            <Text style={[styles.appName, { color: colors.text, fontSize: 24 }]}>Reset Password</Text>
          </View>

          {resetStep === "email" && (
            <View style={styles.form}>
              <Text style={[styles.resetDesc, { color: colors.textSecondary }]}>
                Enter your email address and we'll send you a verification code to reset your password.
              </Text>
              <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="mail-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Email address"
                  placeholderTextColor={colors.textMuted}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[styles.loginBtn, resetLoading && styles.btnDisabled]}
                onPress={handleSendResetCode}
                disabled={resetLoading}
              >
                {resetLoading ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.loginBtnText}>Send Code</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setResetStep("idle"); setResetEmail(""); }} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={18} color={Colors.brand} />
                <Text style={[styles.backBtnText, { color: Colors.brand }]}>Back to login</Text>
              </TouchableOpacity>
            </View>
          )}

          {resetStep === "code" && (
            <View style={styles.form}>
              <Text style={[styles.resetDesc, { color: colors.textSecondary }]}>
                Enter the 6-digit code sent to {resetEmail} and set your new password.
              </Text>

              <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="keypad-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text, letterSpacing: 4, fontSize: 20 }]}
                  placeholder="000000"
                  placeholderTextColor={colors.textMuted}
                  value={resetCode}
                  onChangeText={setResetCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>

              <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text, flex: 1 }]}
                  placeholder="New password"
                  placeholderTextColor={colors.textMuted}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPwd}
                />
                <Pressable onPress={() => setShowNewPwd((v) => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showNewPwd ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
                </Pressable>
              </View>

              <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showNewPwd}
                />
              </View>

              <TouchableOpacity
                style={[styles.loginBtn, resetLoading && styles.btnDisabled]}
                onPress={handleVerifyAndReset}
                disabled={resetLoading}
              >
                {resetLoading ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.loginBtnText}>Reset Password</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSendResetCode} style={styles.resendBtn} disabled={resetLoading}>
                <Text style={[styles.resendText, { color: Colors.brand }]}>Didn't get the code? Resend</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setResetStep("idle"); setResetCode(""); setNewPassword(""); setConfirmPassword(""); }} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={18} color={Colors.brand} />
                <Text style={[styles.backBtnText, { color: Colors.brand }]}>Back to login</Text>
              </TouchableOpacity>
            </View>
          )}
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { flexDirection: isDesktop ? "row" : "column", backgroundColor: isDesktop ? (isDark ? "#0a0a0a" : "#ffffff") : colors.background }]}>
      {isDesktop && (
        <View style={[authSplit.brandPanel, { backgroundColor: Colors.brand }]}>
          <Image source={afuSymbol} style={{ width: 80, height: 80, tintColor: "#fff", marginBottom: 28 }} resizeMode="contain" />
          <Text style={authSplit.brandTitle}>AfuChat</Text>
          <Text style={authSplit.brandTagline}>Connect with everyone, everywhere.</Text>
          <View style={authSplit.featureList}>
            {[
              { icon: "chatbubbles", text: "Real-time messaging with end-to-end privacy" },
              { icon: "compass", text: "Discover trending content and creators" },
              { icon: "people", text: "Groups, channels, and communities" },
              { icon: "gift", text: "Send gifts and red envelopes to friends" },
            ].map((f) => (
              <View key={f.text} style={authSplit.featureRow}>
                <Ionicons name={f.icon as any} size={20} color="rgba(255,255,255,0.9)" />
                <Text style={authSplit.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: isDesktop ? (isDark ? "#111113" : "#ffffff") : colors.background }}
    >
      <ScrollView
        contentContainerStyle={
          isDesktop
            ? { flexGrow: 1, justifyContent: "center", paddingHorizontal: 60, paddingVertical: 48 }
            : { ...styles.scroll, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={isDesktop ? { maxWidth: 400, width: "100%" as any, alignSelf: "center" } : undefined}>
        {isDesktop ? (
          <View style={{ marginBottom: 40 }}>
            <Text style={[styles.appName, { color: colors.text, textAlign: "left", marginBottom: 8 }]}>Sign in to AfuChat</Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>Welcome back. Enter your credentials below.</Text>
          </View>
        ) : (
          <View style={[styles.logoWrap, { marginTop: 20 }]}>
            <Image source={afuSymbol} style={{ width: 88, height: 88, marginBottom: 16, tintColor: Colors.brand }} resizeMode="contain" />
            <Text style={[styles.appName, { color: colors.text }]}>AfuChat</Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>Connect with everyone</Text>
          </View>
        )}

        <View style={styles.form}>
          <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="mail-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Email address"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
            <TextInput
              style={[styles.input, { color: colors.text, flex: 1 }]}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPwd}
              autoComplete="password"
            />
            <Pressable onPress={() => setShowPwd((v) => !v)} style={styles.eyeBtn}>
              <Ionicons
                name={showPwd ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          </View>

          <TouchableOpacity onPress={() => { setResetStep("email"); setResetEmail(email); }} style={styles.forgotBtn}>
            <Text style={[styles.forgotText, { color: Colors.brand }]}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>Log In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <Text style={[styles.orText, { color: colors.textMuted }]}>or</Text>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.oauthBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => signInWithProvider("google")}
            disabled={!!oauthLoading}
            activeOpacity={0.7}
          >
            {oauthLoading === "google" ? (
              <ActivityIndicator color={Colors.brand} />
            ) : (
              <>
                <View style={styles.googleIconWrap}>
                  <Text style={styles.googleG}>G</Text>
                </View>
                <Text style={[styles.oauthBtnText, { color: colors.text }]}>
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.oauthBtn, { backgroundColor: "#24292e" }]}
            onPress={() => signInWithProvider("github")}
            disabled={!!oauthLoading}
            activeOpacity={0.7}
          >
            {oauthLoading === "github" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="logo-github" size={20} color="#fff" />
                <Text style={[styles.oauthBtnText, { color: "#fff" }]}>
                  Continue with GitHub
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <Text style={[styles.orText, { color: colors.textMuted }]}>new here?</Text>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            onPress={() => router.push("/(auth)/register")}
            style={[styles.registerBtn, { borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.registerBtnText, { color: colors.text }]}>
              Create new account
            </Text>
          </TouchableOpacity>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>

      {Platform.OS !== "web" && (
        <Modal
          visible={!!oauthModalUrl}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            setOauthModalUrl(null);
            setOauthLoading(null);
          }}
        >
          <View style={[oauthModalStyles.container, { backgroundColor: colors.background }]}>
            <View style={[oauthModalStyles.header, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  setOauthModalUrl(null);
                  setOauthLoading(null);
                }}
                style={oauthModalStyles.closeBtn}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[oauthModalStyles.headerTitle, { color: colors.text }]}>Sign In</Text>
              <View style={{ width: 40 }} />
            </View>
            {oauthModalUrl && (
              <WebView
                source={{ uri: oauthModalUrl }}
                style={{ flex: 1 }}
                javaScriptEnabled
                domStorageEnabled
                startInLoadingState
                renderLoading={() => (
                  <View style={oauthModalStyles.loadingOverlay}>
                    <ActivityIndicator size="large" color={Colors.brand} />
                  </View>
                )}
                onNavigationStateChange={(navState) => {
                  if (navState.url && isOAuthCallback(navState.url)) {
                    handleOAuthCallback(navState.url);
                  }
                }}
                onShouldStartLoadWithRequest={(request) => {
                  if (request.url && isOAuthCallback(request.url)) {
                    handleOAuthCallback(request.url);
                    return false;
                  }
                  return true;
                }}
              />
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}

const oauthModalStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
});

const authSplit = StyleSheet.create({
  brandPanel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 60,
    gap: 0,
  },
  brandTitle: {
    fontSize: 52,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 16,
    letterSpacing: -1,
  },
  brandTagline: {
    fontSize: 18,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 28,
    marginBottom: 48,
  },
  featureList: { gap: 20, width: "100%" as any, maxWidth: 380 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.9)",
    flex: 1,
    lineHeight: 22,
  },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 28 },
  logoWrap: { alignItems: "center", marginBottom: 44 },
  appName: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  tagline: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  form: { gap: 14 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  fieldIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    height: 52,
  },
  eyeBtn: { padding: 4 },
  forgotBtn: { alignSelf: "flex-end", marginTop: -6 },
  forgotText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  resetDesc: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 4 },
  loginBtn: {
    backgroundColor: Colors.brand,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  btnDisabled: { opacity: 0.6 },
  loginBtnText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  backBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 },
  backBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  resendBtn: { alignSelf: "center", marginTop: 4 },
  resendText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 4,
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  oauthBtn: {
    flexDirection: "row",
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  oauthBtnText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  googleIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  googleG: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4285F4",
  },
  registerBtn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  registerBtnText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
});
