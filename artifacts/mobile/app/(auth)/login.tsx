import React, { useState } from "react";
import {
  ActivityIndicator,
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
import AfuChatIcon from "@/components/icons/AfuChatIcon";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";


WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

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

  async function handleForgotPassword() {
    if (!resetEmail.trim()) {
      showAlert("Missing email", "Please enter your email address.");
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim());
    setResetLoading(false);
    if (error) {
      showAlert("Error", error.message);
    } else {
      showAlert("Check your email", "We've sent a password reset link to your email address.");
      setShowForgot(false);
      setResetEmail("");
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    try {
      setOauthLoading(provider);
      const redirectUrl = makeRedirectUri({ path: "/(auth)/login" });

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
          preferEphemeralSession: true,
        });

        if (result.type === "success" && result.url) {
          const url = new URL(result.url);
          const params = new URLSearchParams(url.hash.substring(1));
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");

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
          <View style={{ marginBottom: 16 }}><AfuChatIcon size={88} color={Colors.brand} /></View>
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

          <TouchableOpacity onPress={() => { setShowForgot(!showForgot); setResetEmail(email); }} style={styles.forgotBtn}>
            <Text style={[styles.forgotText, { color: Colors.brand }]}>Forgot password?</Text>
          </TouchableOpacity>

          {showForgot && (
            <View style={[styles.forgotCard, { backgroundColor: colors.inputBg }]}>
              <Text style={[styles.forgotCardTitle, { color: colors.text }]}>Reset Password</Text>
              <Text style={[styles.forgotCardDesc, { color: colors.textMuted }]}>
                Enter your email and we'll send you a reset link.
              </Text>
              <TextInput
                style={[styles.forgotInput, { color: colors.text, backgroundColor: colors.surface }]}
                placeholder="Email address"
                placeholderTextColor={colors.textMuted}
                value={resetEmail}
                onChangeText={setResetEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TouchableOpacity
                style={[styles.resetBtn, resetLoading && { opacity: 0.6 }]}
                onPress={handleForgotPassword}
                disabled={resetLoading}
              >
                {resetLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={styles.resetBtnText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

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
    borderRadius: 14,
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
  forgotCard: { borderRadius: 14, padding: 16, gap: 10 },
  forgotCardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  forgotCardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  forgotInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  resetBtn: { backgroundColor: Colors.brand, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  resetBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
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
