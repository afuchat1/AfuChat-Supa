import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

const afuSymbol = require("@/assets/images/afu-symbol.png");

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);

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
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      showAlert("Login failed", error.message);
    } else {
      router.replace("/(tabs)");
    }
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

  async function handleOAuth(provider: "google" | "github") {
    try {
      setOauthLoading(provider);

      const redirectUrl = makeRedirectUri({
        scheme: "afuchat",
        path: "(auth)/login",
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        showAlert("Error", error.message);
        setOauthLoading(null);
        return;
      }

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
          showInRecents: false,
        });

        if (result.type === "success" && result.url) {
          const url = new URL(result.url);

          const code = url.searchParams.get("code");
          if (code) {
            const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
            if (codeError) {
              showAlert("Error", codeError.message);
            } else {
              router.replace("/(tabs)");
              setOauthLoading(null);
              return;
            }
          }

          let accessToken: string | null = null;
          let refreshToken: string | null = null;

          if (url.hash) {
            const hashParams = new URLSearchParams(url.hash.substring(1));
            accessToken = hashParams.get("access_token");
            refreshToken = hashParams.get("refresh_token");
          }

          if (!accessToken) {
            accessToken = url.searchParams.get("access_token");
            refreshToken = url.searchParams.get("refresh_token");
          }

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              showAlert("Error", sessionError.message);
            } else {
              router.replace("/(tabs)");
            }
          }
        }
      }
      setOauthLoading(null);
    } catch (err: any) {
      setOauthLoading(null);
      showAlert("Error", "Could not complete sign in. Please try again.");
    }
  }

  if (resetStep !== "idle") {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.root, { backgroundColor: colors.background }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
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
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <Image source={afuSymbol} style={{ width: 88, height: 88, marginBottom: 16, tintColor: Colors.brand }} resizeMode="contain" />
          <Text style={[styles.appName, { color: colors.text }]}>AfuChat</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            Connect with everyone
          </Text>
        </View>

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
            onPress={() => handleOAuth("google")}
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
            onPress={() => handleOAuth("github")}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
