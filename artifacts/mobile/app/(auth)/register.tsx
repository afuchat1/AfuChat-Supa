import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

const afuSymbol = require("@/assets/images/afu-symbol.png");

export default function RegisterScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ref?: string }>();
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [referralCode, setReferralCode] = useState(params.ref || "");

  const [verifyStep, setVerifyStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [signupUserId, setSignupUserId] = useState<string | null>(null);
  const [cleanedHandle, setCleanedHandle] = useState("");

  async function handleRegister() {
    if (!displayName || !handle || !email || !password) {
      showAlert("Missing fields", "Please fill all fields.");
      return;
    }
    if (!agreedToTerms) {
      showAlert("Terms Required", "You must agree to the Terms of Service and Privacy Policy to create an account.");
      return;
    }
    if (password.length < 6) {
      showAlert("Weak password", "Password must be at least 6 characters.");
      return;
    }
    const cleanHandle = handle.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    if (cleanHandle.length < 3) {
      showAlert("Invalid handle", "Handle must be at least 3 characters (letters, numbers, underscores).");
      return;
    }
    setLoading(true);
    setCleanedHandle(cleanHandle);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName, handle: cleanHandle },
      },
    });

    if (error) {
      setLoading(false);
      showAlert("Registration failed", error.message);
      return;
    }

    setLoading(false);

    if (data.user) {
      setSignupUserId(data.user.id);

      if (data.user.identities && data.user.identities.length === 0) {
        showAlert("Account exists", "An account with this email already exists. Please log in instead.");
        return;
      }

      if (!data.session) {
        setVerifyStep(true);
        showAlert("Verification code sent", "We've sent a 6-digit code to your email. Please check your inbox (and spam folder).");
      } else {
        await completeRegistration(data.user.id, cleanHandle);
        router.replace("/(tabs)");
      }
    }
  }

  async function completeRegistration(userId: string, finalHandle: string) {
    await supabase.from("profiles").upsert({
      id: userId,
      handle: finalHandle,
      display_name: displayName,
    });

    if (referralCode.trim()) {
      const refHandle = referralCode.trim().toLowerCase();
      if (refHandle !== finalHandle) {
        const { data: referrer } = await supabase
          .from("profiles")
          .select("id, xp")
          .eq("handle", refHandle)
          .single();

        if (referrer && referrer.id !== userId) {
          const { data: existingRef } = await supabase
            .from("referrals")
            .select("id")
            .eq("referred_id", userId)
            .limit(1)
            .maybeSingle();

          if (!existingRef) {
            await supabase.from("referrals").insert({
              referrer_id: referrer.id,
              referred_id: userId,
              reward_given: true,
            });

            await supabase.from("profiles").update({
              xp: (referrer.xp || 0) + 500,
            }).eq("id", referrer.id);

            const { data: platinumPlan } = await supabase
              .from("subscription_plans")
              .select("id")
              .ilike("name", "%platinum%")
              .eq("is_active", true)
              .limit(1)
              .single();

            if (platinumPlan) {
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + 7);
              await supabase.from("user_subscriptions").upsert({
                user_id: userId,
                plan_id: platinumPlan.id,
                started_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
                is_active: true,
                acoin_paid: 0,
              });
            }
          }
        }
      }
    }
  }

  async function handleVerifyOtp() {
    if (otpCode.trim().length !== 6) {
      showAlert("Invalid code", "Please enter the 6-digit code from your email.");
      return;
    }

    setVerifyLoading(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otpCode.trim(),
      type: "signup",
    });

    if (error) {
      setVerifyLoading(false);
      showAlert("Verification failed", "The code you entered is invalid or expired. Please try again.");
      return;
    }

    if (signupUserId) {
      await completeRegistration(signupUserId, cleanedHandle);
    }

    setVerifyLoading(false);
    router.replace("/(tabs)");
  }

  async function handleResendCode() {
    setVerifyLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
    });
    setVerifyLoading(false);

    if (error) {
      showAlert("Error", error.message);
    } else {
      showAlert("Code resent", "A new verification code has been sent to your email.");
    }
  }

  if (verifyStep) {
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
          <View style={styles.headerWrap}>
            <Image source={afuSymbol} style={{ width: 64, height: 64, marginBottom: 12, tintColor: Colors.brand }} resizeMode="contain" />
            <Text style={[styles.title, { color: colors.text, fontSize: 24 }]}>Verify Your Email</Text>
          </View>

          <View style={styles.form}>
            <Text style={[styles.verifyDesc, { color: colors.textSecondary }]}>
              We've sent a 6-digit verification code to{"\n"}
              <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold" }}>{email}</Text>
              {"\n"}Enter it below to complete your registration.
            </Text>

            <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="keypad-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
              <TextInput
                style={[styles.input, { color: colors.text, letterSpacing: 4, fontSize: 20, textAlign: "center" }]}
                placeholder="000000"
                placeholderTextColor={colors.textMuted}
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.registerBtn, verifyLoading && { opacity: 0.6 }]}
              onPress={handleVerifyOtp}
              disabled={verifyLoading}
            >
              {verifyLoading ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.registerBtnText}>Verify & Continue</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleResendCode} style={styles.resendBtn} disabled={verifyLoading}>
              <Text style={[styles.resendText, { color: Colors.brand }]}>Didn't get the code? Resend</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setVerifyStep(false); setOtpCode(""); }} style={styles.backToFormBtn}>
              <Ionicons name="arrow-back" size={18} color={Colors.brand} />
              <Text style={[styles.backToFormText, { color: Colors.brand }]}>Back</Text>
            </TouchableOpacity>
          </View>
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
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerWrap}>
          <Image source={afuSymbol} style={{ width: 72, height: 72, marginBottom: 20, tintColor: Colors.brand }} resizeMode="contain" />
          <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Join AfuChat and start connecting
          </Text>
        </View>

        <View style={styles.form}>
          <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Display name"
              placeholderTextColor={colors.textMuted}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
            />
          </View>

          <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="at-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Handle (e.g. john_doe)"
              placeholderTextColor={colors.textMuted}
              value={handle}
              onChangeText={setHandle}
              autoCapitalize="none"
            />
          </View>

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
            />
          </View>

          <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
            <TextInput
              style={[styles.input, { color: colors.text, flex: 1 }]}
              placeholder="Password (min. 6 characters)"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPwd}
            />
            <Pressable onPress={() => setShowPwd((v) => !v)} style={styles.eyeBtn}>
              <Ionicons
                name={showPwd ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          </View>

          <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="gift-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Referral code (optional)"
              placeholderTextColor={colors.textMuted}
              value={referralCode}
              onChangeText={setReferralCode}
              autoCapitalize="none"
            />
          </View>

          {referralCode.trim() ? (
            <View style={styles.referralNote}>
              <Ionicons name="checkmark-circle" size={16} color="#34C759" />
              <Text style={[styles.referralNoteText, { color: "#34C759" }]}>
                You'll get 1 week free Platinum premium!
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAgreedToTerms((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreedToTerms }}
          >
            <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
              {agreedToTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[styles.termsText, { color: colors.textSecondary }]}>
              I have read and agree to the{" "}
              <Text
                style={styles.termsLink}
                onPress={() => Linking.openURL("https://afuchat.com/terms")}
              >
                Terms of Service
              </Text>
              {" "}and{" "}
              <Text
                style={styles.termsLink}
                onPress={() => Linking.openURL("https://afuchat.com/privacy")}
              >
                Privacy Policy
              </Text>
            </Text>
          </TouchableOpacity>

          <Pressable
            style={[styles.registerBtn, { opacity: (loading || !agreedToTerms) ? 0.5 : 1 }]}
            onPress={handleRegister}
            disabled={loading || !agreedToTerms}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading || !agreedToTerms }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.registerBtnText}>Create Account</Text>
            )}
          </Pressable>

          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.loginLink}
          >
            <Text style={[styles.loginLinkText, { color: colors.textSecondary }]}>
              Already have an account?{" "}
              <Text style={{ color: Colors.brand, fontFamily: "Inter_600SemiBold" }}>
                Log in
              </Text>
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
  backBtn: { marginBottom: 24 },
  headerWrap: { marginBottom: 32, alignItems: "center" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular" },
  form: { gap: 14 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 0,
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
  verifyDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 8,
  },
  resendBtn: { alignSelf: "center", marginTop: 4 },
  resendText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  backToFormBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 },
  backToFormText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#CCC",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  termsLink: {
    color: Colors.brand,
    fontFamily: "Inter_600SemiBold",
  },
  registerBtn: {
    backgroundColor: Colors.brand,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  registerBtnText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  loginLink: { alignItems: "center", marginTop: 4 },
  loginLinkText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  referralNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    marginTop: -4,
  },
  referralNoteText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
