import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
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
import QRCode from "@/components/ui/QRCode";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { TwoFactorGate } from "@/components/ui/TwoFactorGate";
import * as Haptics from "@/lib/haptics";
import { GlassHeader } from "@/components/ui/GlassHeader";

// ─── Step machine ─────────────────────────────────────────────────────────────
type Step =
  | { id: "loading" }
  | { id: "status"; enrolled: boolean; factorId?: string; enrolledAt?: string }
  | { id: "enroll"; factorId: string; uri: string; secret: string }
  | { id: "recovery-email" }
  | { id: "recovery-otp"; email: string };

// ─── Animated shield ring ─────────────────────────────────────────────────────
function ShieldHero({ enrolled }: { enrolled: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const color  = enrolled ? "#30D158" : "#5856D6";
  const bgColor = enrolled ? "rgba(48,209,88,0.12)" : "rgba(88,86,214,0.12)";
  const ringColor = enrolled ? "rgba(48,209,88,0.25)" : "rgba(88,86,214,0.22)";

  return (
    <View style={hero.container}>
      {/* Outer rotating dashed ring */}
      <Animated.View style={[hero.outerRing, { borderColor: ringColor, transform: [{ rotate }] }]} />
      {/* Inner pulsing ring */}
      <Animated.View style={[hero.innerRing, { borderColor: color + "55", transform: [{ scale: pulse }] }]} />
      {/* Shield icon */}
      <View style={[hero.iconBg, { backgroundColor: bgColor }]}>
        <Ionicons
          name={enrolled ? "shield-checkmark" : "shield"}
          size={44}
          color={color}
        />
      </View>
    </View>
  );
}
const hero = StyleSheet.create({
  container: { width: 130, height: 130, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  outerRing: { position: "absolute", width: 126, height: 126, borderRadius: 63, borderWidth: 1.5, borderStyle: "dashed" },
  innerRing: { position: "absolute", width: 100, height: 100, borderRadius: 50, borderWidth: 1.5 },
  iconBg:    { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
});

// ─── Security benefit row ─────────────────────────────────────────────────────
function BenefitRow({ icon, label, sub, color }: { icon: string; label: string; sub: string; color: string }) {
  return (
    <View style={bft.row}>
      <View style={bft.icon}>
        <Ionicons name={icon as any} size={22} color={"rgba(255,255,255,0.85)"} />
      </View>
      <View style={bft.text}>
        <Text style={bft.label}>{label}</Text>
        <Text style={bft.sub}>{sub}</Text>
      </View>
    </View>
  );
}
const bft = StyleSheet.create({
  row:   { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  icon:  { width: 28, height: 28, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  text:  { flex: 1 },
  label: { fontSize: 13.5, fontFamily: "Inter_600SemiBold", color: "#fff", lineHeight: 19 },
  sub:   { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", lineHeight: 17, marginTop: 1 },
});

// ─── Step instruction row ─────────────────────────────────────────────────────
function StepRow({ n, text, colors }: { n: number; text: string; colors: any }) {
  return (
    <View style={stp.row}>
      <View style={stp.badge}><Text style={stp.badgeNum}>{n}</Text></View>
      <Text style={[stp.text, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}
const stp = StyleSheet.create({
  row:      { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  badge:    { width: 22, height: 22, borderRadius: 11, backgroundColor: "#5856D6", alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  badgeNum: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  text:     { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
});

// ─── OTP digit boxes ──────────────────────────────────────────────────────────
function OtpBoxes({ value, error, colors }: { value: string; error: boolean; colors: any }) {
  const digits = value.split("").concat(Array(6 - value.length).fill(""));
  return (
    <View style={otpS.row}>
      {digits.map((d, i) => (
        <View key={i} style={[otpS.box, {
          backgroundColor: colors.inputBg,
          borderColor: error ? "#FF3B30" : d ? "#5856D6" : colors.border,
          borderWidth: d ? 2 : 1,
        }]}>
          <Text style={[otpS.digit, { color: colors.text }]}>{d || ""}</Text>
        </View>
      ))}
    </View>
  );
}
const otpS = StyleSheet.create({
  row:   { flexDirection: "row", gap: 8, justifyContent: "center" },
  box:   { width: 44, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  digit: { fontSize: 22, fontFamily: "Inter_700Bold" },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TwoFactorScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep]               = useState<Step>({ id: "loading" });
  const [scannedAck, setScannedAck]   = useState(false);
  const [verifyCode, setVerifyCode]   = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifyBusy, setVerifyBusy]   = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryOtp, setRecoveryOtp]     = useState("");
  const [recoveryBusy, setRecoveryBusy]   = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [showDisableGate, setShowDisableGate] = useState(false);

  const verifyRef = useRef<TextInput>(null);
  const otpRef    = useRef<TextInput>(null);

  // Pulse for "not saved" warning during enroll
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ── Load status ─────────────────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setStep({ id: "loading" });
    const { data: factors, error } = await supabase.auth.mfa.listFactors();
    if (error) { setStep({ id: "status", enrolled: false }); return; }

    const active  = factors?.totp?.find((f: any) => f.status === "verified");
    const pending = factors?.totp?.filter((f: any) => f.status !== "verified") ?? [];

    for (const pf of pending) {
      await supabase.auth.mfa.unenroll({ factorId: pf.id }).catch(() => {});
    }

    setStep({
      id: "status",
      enrolled: !!active,
      factorId: active?.id,
      enrolledAt: active?.created_at,
    });
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // ── Enrollment ──────────────────────────────────────────────────────────────
  async function startEnroll() {
    setStep({ id: "loading" });
    setScannedAck(false);
    setVerifyCode("");
    setVerifyError("");
    setSecretVisible(false);

    // 1. Clean up any stale unverified factors
    try {
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.totp ?? []) {
        if (f.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
        }
      }
    } catch { /* ignore */ }

    // 2. Try to enroll with email as friendly name
    let { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "AfuChat",
      friendlyName: user?.email ?? "AfuChat",
    });

    // 3. If name conflict, retry with a unique name — always succeeds
    if (error?.message?.includes("already exists")) {
      const retry = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "AfuChat",
        friendlyName: `AfuChat-${Date.now()}`,
      });
      data  = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      showAlert("Error", error?.message ?? "Could not start enrollment. Please try again.");
      await loadStatus();
      return;
    }
    setStep({ id: "enroll", factorId: data.id, uri: data.totp.uri, secret: data.totp.secret });
  }

  async function cancelEnroll(factorId: string) {
    await supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
    await loadStatus();
  }

  async function confirmEnroll(factorId: string) {
    if (!scannedAck) {
      showAlert("Step 2 required", "Please confirm you have added AfuChat to your authenticator app.");
      return;
    }
    if (verifyCode.length !== 6) return;
    setVerifyBusy(true);
    setVerifyError("");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: verifyCode });
    setVerifyBusy(false);
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setVerifyError("Wrong code. 2FA has not been saved. Check your authenticator and try again.");
      setVerifyCode("");
      verifyRef.current?.focus();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("2FA Enabled ✓", "Two-factor authentication is now active on your account.");
    loadStatus();
  }

  // ── Disable ─────────────────────────────────────────────────────────────────
  async function doDisable() {
    const s = step;
    if (s.id !== "status" || !s.factorId) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: s.factorId });
    if (error) { showAlert("Error", error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("2FA Disabled", "Two-factor authentication has been removed from your account.");
    loadStatus();
  }

  // ── Recovery ─────────────────────────────────────────────────────────────────
  async function sendRecoveryOtp() {
    const email = recoveryEmail.trim().toLowerCase();
    if (!email) { setRecoveryError("Please enter your email address."); return; }
    setRecoveryBusy(true);
    setRecoveryError("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setRecoveryBusy(false);
    if (error) { setRecoveryError(error.message); return; }
    setRecoveryOtp("");
    setStep({ id: "recovery-otp", email });
    setTimeout(() => otpRef.current?.focus(), 300);
  }

  async function verifyRecoveryOtp(email: string) {
    const token = recoveryOtp.trim();
    if (token.length < 6) { setRecoveryError("Enter the full 6-digit code from your email."); return; }
    setRecoveryBusy(true);
    setRecoveryError("");
    const { error: otpError } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (otpError) { setRecoveryBusy(false); setRecoveryError("Invalid or expired code."); return; }
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.find((f: any) => f.status === "verified");
    if (factor) await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setRecoveryBusy(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Account Recovered", "Two-factor authentication has been removed.");
    loadStatus();
  }

  // ── Back handler ─────────────────────────────────────────────────────────────
  function handleBack() {
    if (step.id === "enroll") {
      cancelEnroll(step.factorId);
    } else if (step.id === "recovery-email" || step.id === "recovery-otp") {
      setStep({ id: "status", enrolled: false });
    } else {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/me" as any);
    }
  }

  function renderHeader(title: string) {
    return <GlassHeader title={title} onBack={handleBack} />;
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (step.id === "loading") {
    return (
      <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
        {renderHeader("Two-Factor Authentication")}
        <View style={s.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[s.loadingText, { color: colors.textMuted }]}>Checking your security status…</Text>
        </View>
      </View>
    );
  }

  // ── Status ───────────────────────────────────────────────────────────────────
  if (step.id === "status") {
    const { enrolled, factorId, enrolledAt } = step;

    const enrolledDate = enrolledAt
      ? new Date(enrolledAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : null;

    return (
      <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
        {renderHeader("Two-Factor Authentication")}
        <ScrollView
          contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 48 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero gradient card ── */}
          <LinearGradient
            colors={enrolled
              ? ["#1a3a2a", "#0a2218", "#051a10"]
              : ["#1a1a3a", "#0e0e2e", "#060614"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.heroCard}
          >
            <ShieldHero enrolled={enrolled} />
            <Text style={s.heroTitle}>
              {enrolled ? "Account Protected" : "Add Extra Security"}
            </Text>
            <Text style={s.heroSub}>
              {enrolled
                ? "Two-factor authentication is active. Your account requires a code to perform sensitive actions."
                : "Two-factor authentication adds a second layer of protection beyond your password."}
            </Text>

            {enrolled && enrolledDate && (
              <View style={s.heroBadge}>
                <Ionicons name="calendar" size={12} color="rgba(48,209,88,0.8)" />
                <Text style={s.heroBadgeText}>Active since {enrolledDate}</Text>
              </View>
            )}

            {!enrolled && (
              <View style={s.benefitsCol}>
                <BenefitRow icon="lock-closed" color="#5856D6"  label="Blocks account takeovers" sub="Even if your password is stolen, attackers can't log in" />
                <BenefitRow icon="eye-off"     color="#30D158"  label="Phishing protection"      sub="Codes are time-based and can't be reused or shared" />
                <BenefitRow icon="phone-portrait" color="#FF9F0A" label="Works offline"           sub="Your authenticator app works without internet" />
              </View>
            )}
          </LinearGradient>

          {/* ── Security score (when enabled) ── */}
          {enrolled && (
            <View style={[s.scoreCard, { backgroundColor: colors.surface, borderColor: "rgba(48,209,88,0.2)" }]}>
              <View style={s.scoreLeft}>
                <Text style={[s.scoreLabel, { color: colors.textMuted }]}>ACCOUNT SECURITY</Text>
                <Text style={[s.scoreValue, { color: "#30D158" }]}>Strong</Text>
              </View>
              <View style={s.scoreBarCol}>
                <View style={[s.scoreBarBg, { backgroundColor: colors.border }]}>
                  <View style={[s.scoreBarFill, { backgroundColor: "#30D158", width: "88%" }]} />
                </View>
                <Text style={[s.scoreBarLabel, { color: colors.textMuted }]}>88 / 100</Text>
              </View>
              <View style={[s.scoreDot, { backgroundColor: "rgba(48,209,88,0.15)" }]}>
                <Ionicons name="shield-checkmark" size={22} color="#30D158" />
              </View>
            </View>
          )}

          {/* ── Setup CTA (when disabled) ── */}
          {!enrolled && (
            <>
              <Text style={[s.sectionLabel, { color: colors.textMuted }]}>GET STARTED</Text>
              <View style={[s.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity style={s.actionRow} onPress={startEnroll} activeOpacity={0.75}>
                  <LinearGradient
                    colors={["#5856D6", "#3634A3"]}
                    style={s.actionIcon}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name="qr-code" size={18} color="#fff" />
                  </LinearGradient>
                  <View style={s.actionMeta}>
                    <Text style={[s.actionLabel, { color: colors.text }]}>Enable Two-Factor Auth</Text>
                    <Text style={[s.actionSub, { color: colors.textMuted }]}>Scan a QR code with your authenticator app</Text>
                  </View>
                  <View style={[s.actionChevron, { backgroundColor: colors.inputBg }]}>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              </View>

              <View style={[s.compatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[s.compatTitle, { color: colors.textMuted }]}>COMPATIBLE APPS</Text>
                {[
                  { name: "Google Authenticator", icon: "logo-google",    note: "iOS & Android" },
                  { name: "Authy",                icon: "phone-portrait",  note: "iOS & Android · Multi-device" },
                  { name: "1Password",            icon: "key",             note: "All platforms" },
                  { name: "Any TOTP app",         icon: "apps",            note: "RFC 6238 compatible" },
                ].map((app, i, arr) => (
                  <React.Fragment key={app.name}>
                    <View style={s.compatRow}>
                      <View style={[s.compatIcon, { backgroundColor: colors.inputBg }]}>
                        <Ionicons name={app.icon as any} size={15} color={colors.accent} />
                      </View>
                      <View style={s.compatMeta}>
                        <Text style={[s.compatName, { color: colors.text }]}>{app.name}</Text>
                        <Text style={[s.compatNote, { color: colors.textMuted }]}>{app.note}</Text>
                      </View>
                      <Ionicons name="checkmark-circle" size={16} color="#30D158" />
                    </View>
                    {i < arr.length - 1 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
                  </React.Fragment>
                ))}
              </View>
            </>
          )}

          {/* ── Manage + Recovery (when enabled) ── */}
          {enrolled && (
            <>
              <Text style={[s.sectionLabel, { color: colors.textMuted }]}>MANAGE</Text>
              <View style={[s.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity style={s.actionRow} onPress={() => setShowDisableGate(true)} activeOpacity={0.75}>
                  <View style={[s.actionIcon, { backgroundColor: "#FF3B30" }]}>
                    <Ionicons name="shield" size={18} color="#fff" />
                  </View>
                  <View style={s.actionMeta}>
                    <Text style={[s.actionLabel, { color: colors.text }]}>Disable Two-Factor Auth</Text>
                    <Text style={[s.actionSub, { color: colors.textMuted }]}>Requires your authenticator code to confirm</Text>
                  </View>
                  <View style={[s.actionChevron, { backgroundColor: colors.inputBg }]}>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={[s.sectionLabel, { color: colors.textMuted }]}>RECOVERY OPTIONS</Text>
              <View style={[s.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={s.actionRow}
                  onPress={() => { setRecoveryEmail(user?.email ?? ""); setRecoveryError(""); setStep({ id: "recovery-email" }); }}
                  activeOpacity={0.75}
                >
                  <View style={[s.actionIcon, { backgroundColor: "#007AFF" }]}>
                    <Ionicons name="mail" size={18} color="#fff" />
                  </View>
                  <View style={s.actionMeta}>
                    <Text style={[s.actionLabel, { color: colors.text }]}>Reset via Email</Text>
                    <Text style={[s.actionSub, { color: colors.textMuted }]}>Verify with a one-time email code</Text>
                  </View>
                  <View style={[s.actionChevron, { backgroundColor: colors.inputBg }]}>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
                <View style={[s.divider, { backgroundColor: colors.border, marginLeft: 66 }]} />
                <View style={s.actionRow}>
                  <View style={[s.actionIcon, { backgroundColor: "#8E8E93" }]}>
                    <Ionicons name="phone-portrait" size={18} color="#fff" />
                  </View>
                  <View style={s.actionMeta}>
                    <Text style={[s.actionLabel, { color: colors.text }]}>Reset via Phone</Text>
                    <Text style={[s.actionSub, { color: colors.textMuted }]}>SMS recovery. Coming soon</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: colors.inputBg }]}>
                    <Text style={[s.badgeText, { color: colors.textMuted }]}>SOON</Text>
                  </View>
                </View>
              </View>

              <Text style={[s.footnote, { color: colors.textMuted }]}>
                Use recovery options only if you have permanently lost access to your authenticator app.
              </Text>
            </>
          )}
        </ScrollView>

        <TwoFactorGate
          visible={showDisableGate}
          title="Disable Two-Factor Auth"
          subtitle="Enter your authenticator code to confirm."
          onSuccess={() => { setShowDisableGate(false); doDisable(); }}
          onDismiss={() => setShowDisableGate(false)}
        />
      </View>
    );
  }

  // ── Enroll ───────────────────────────────────────────────────────────────────
  if (step.id === "enroll") {
    const { factorId, uri, secret } = step;
    const formattedSecret = secret.match(/.{1,4}/g)?.join(" ") ?? secret;
    const canVerify = scannedAck && verifyCode.length === 6;

    return (
      <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
        {renderHeader("Set Up Authenticator")}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 48 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Warning banner */}
            <Animated.View style={[s.warnBanner, { transform: [{ scale: pulseAnim }] }]}>
              <Ionicons name="time" size={15} color="#FF9F0A" />
              <Text style={s.warnText}>
                2FA is <Text style={{ fontFamily: "Inter_700Bold" }}>not active yet</Text>. Complete all steps below
              </Text>
            </Animated.View>

            {/* Progress indicator */}
            <View style={s.progressRow}>
              {["Add to app", "Confirm", "Verify code"].map((label, i) => {
                const done = i === 0 || (i === 1 && scannedAck) || (i === 2 && verifyCode.length === 6);
                const active = i === 0 || (i === 1 && !scannedAck) || (i === 2 && scannedAck && verifyCode.length < 6);
                return (
                  <React.Fragment key={label}>
                    <View style={s.progStep}>
                      <View style={[s.progDot, {
                        backgroundColor: done ? "#5856D6" : active ? "#5856D620" : colors.border,
                        borderColor: done ? "#5856D6" : active ? "#5856D6" : colors.border,
                        borderWidth: active ? 2 : 0,
                      }]}>
                        {done && <Ionicons name="checkmark" size={10} color="#fff" />}
                      </View>
                      <Text style={[s.progLabel, { color: done ? "#5856D6" : colors.textMuted }]}>{label}</Text>
                    </View>
                    {i < 2 && <View style={[s.progLine, { backgroundColor: i === 0 ? "#5856D6" : colors.border }]} />}
                  </React.Fragment>
                );
              })}
            </View>

            {/* Step 1 — QR card */}
            <View style={[s.enrollCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.enrollCardHeader}>
                <View style={s.enrollStepBadge}><Text style={s.enrollStepNum}>1</Text></View>
                <View>
                  <Text style={[s.enrollCardTitle, { color: colors.text }]}>Add AfuChat to your app</Text>
                  <Text style={[s.enrollCardSub, { color: colors.textMuted }]}>Open your authenticator and scan the QR code</Text>
                </View>
              </View>

              <View style={s.instructionList}>
                <StepRow n={1} text='Open Google Authenticator, Authy, 1Password, or any TOTP app' colors={colors} />
                <StepRow n={2} text='Tap "+" or "Add account" inside the app' colors={colors} />
                <StepRow n={3} text='Choose "Scan a QR code" and scan the code below' colors={colors} />
              </View>

              {/* QR code */}
              <View style={[s.qrWrap, { backgroundColor: "#fff" }]}>
                <QRCode value={uri} size={170} />
              </View>

              {/* Manual key toggle */}
              <TouchableOpacity
                style={[s.secretToggle, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => setSecretVisible(v => !v)}
                activeOpacity={0.75}
              >
                <Ionicons name={secretVisible ? "eye-off" : "key"} size={14} color={colors.accent} />
                <Text style={[s.secretToggleText, { color: colors.accent }]}>
                  {secretVisible ? "Hide" : "Can't scan? Show"} manual key
                </Text>
                <Ionicons name={secretVisible ? "chevron-up" : "chevron-down"} size={13} color={colors.textMuted} />
              </TouchableOpacity>

              {secretVisible && (
                <View style={[s.secretBox, { backgroundColor: colors.backgroundTertiary, borderColor: colors.border }]}>
                  <Text style={[s.secretLabel, { color: colors.textMuted }]}>SECRET KEY. Tap to select and copy</Text>
                  <Text style={[s.secretKey, { color: colors.text }]} selectable>{formattedSecret}</Text>
                  <View style={[s.secretMeta, { borderTopColor: colors.border }]}>
                    <Text style={[s.secretMetaText, { color: colors.textMuted }]}>Account: AfuChat · Issuer: AfuChat · Type: TOTP · Period: 30s</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Step 2 — Confirm checkbox */}
            <View style={[s.enrollCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.enrollCardHeader}>
                <View style={[s.enrollStepBadge, scannedAck && { backgroundColor: "#5856D6" }]}>
                  {scannedAck
                    ? <Ionicons name="checkmark" size={12} color="#fff" />
                    : <Text style={s.enrollStepNum}>2</Text>}
                </View>
                <View>
                  <Text style={[s.enrollCardTitle, { color: colors.text }]}>Confirm setup</Text>
                  <Text style={[s.enrollCardSub, { color: colors.textMuted }]}>Tick this when you see a rotating code</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[s.ackRow, {
                  backgroundColor: scannedAck ? "#5856D610" : colors.backgroundTertiary,
                  borderColor: scannedAck ? "#5856D6" : colors.border,
                }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setScannedAck(v => !v);
                  if (!scannedAck) setTimeout(() => verifyRef.current?.focus(), 200);
                }}
                activeOpacity={0.8}
              >
                <View style={[s.checkbox, {
                  backgroundColor: scannedAck ? "#5856D6" : "transparent",
                  borderColor: scannedAck ? "#5856D6" : colors.border,
                }]}>
                  {scannedAck && <Ionicons name="checkmark" size={13} color="#fff" />}
                </View>
                <Text style={[s.ackText, { color: scannedAck ? colors.text : colors.textSecondary }]}>
                  I can see <Text style={{ fontFamily: "Inter_700Bold" }}>AfuChat</Text> in my authenticator app with a 6-digit rotating code
                </Text>
              </TouchableOpacity>
            </View>

            {/* Step 3 — Code entry (reveals after checkbox) */}
            {scannedAck && (
              <View style={[s.enrollCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={s.enrollCardHeader}>
                  <View style={[s.enrollStepBadge, verifyCode.length === 6 && { backgroundColor: "#5856D6" }]}>
                    {verifyCode.length === 6
                      ? <Ionicons name="checkmark" size={12} color="#fff" />
                      : <Text style={s.enrollStepNum}>3</Text>}
                  </View>
                  <View>
                    <Text style={[s.enrollCardTitle, { color: colors.text }]}>Enter the code</Text>
                    <Text style={[s.enrollCardSub, { color: colors.textMuted }]}>
                      Type the <Text style={{ fontFamily: "Inter_600SemiBold" }}>current</Text> 6-digit code from your app
                    </Text>
                  </View>
                </View>

                {/* OTP boxes + transparent overlay input — tap anywhere on the boxes to type */}
                <View style={s.otpContainer}>
                  <OtpBoxes value={verifyCode} error={!!verifyError} colors={colors} />
                  <TextInput
                    ref={verifyRef}
                    value={verifyCode}
                    onChangeText={t => {
                      const v = t.replace(/\D/g, "").slice(0, 6);
                      setVerifyCode(v);
                      setVerifyError("");
                      if (v.length === 6) confirmEnroll(factorId);
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                    caretHidden
                    autoFocus
                    style={s.otpOverlayInput}
                  />
                </View>

                {verifyError ? (
                  <View style={s.errorRow}>
                    <Ionicons name="close-circle" size={15} color="#FF3B30" />
                    <Text style={s.errorText}>{verifyError}</Text>
                  </View>
                ) : (
                  <Text style={[s.codeHint, { color: colors.textMuted }]}>
                    Auto-submits when all 6 digits are entered · codes refresh every 30 s
                  </Text>
                )}
              </View>
            )}

            {/* Verify button */}
            <TouchableOpacity
              style={[s.primaryBtn, (!canVerify || verifyBusy) && { opacity: 0.4 }]}
              onPress={() => confirmEnroll(factorId)}
              disabled={!canVerify || verifyBusy}
            >
              <LinearGradient
                colors={["#5856D6", "#3634A3"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.primaryBtnInner}
              >
                {verifyBusy
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="shield-checkmark" size={18} color="#fff" />
                      <Text style={s.primaryBtnText}>Verify & Enable 2FA</Text>
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={s.cancelBtn} onPress={() => cancelEnroll(factorId)} disabled={verifyBusy}>
              <Text style={[s.cancelText, { color: colors.textMuted }]}>Cancel. No changes will be saved</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ── Recovery — email ─────────────────────────────────────────────────────────
  if (step.id === "recovery-email") {
    return (
      <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
        {renderHeader("Recover Account")}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[s.recoveryIconWrap, { backgroundColor: "rgba(0,122,255,0.12)" }]}>
              <Ionicons name="mail" size={36} color="#007AFF" />
            </View>
            <Text style={[s.stepTitle, { color: colors.text }]}>Reset via Email</Text>
            <Text style={[s.stepDesc, { color: colors.textMuted }]}>
              We'll send a one-time code to your email. Verifying it will remove 2FA from your account.
            </Text>
            <TextInput
              style={[s.textInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: recoveryError ? "#FF3B30" : colors.border }]}
              value={recoveryEmail}
              onChangeText={t => { setRecoveryEmail(t); setRecoveryError(""); }}
              placeholder="your@email.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={sendRecoveryOtp}
            />
            {recoveryError ? (
              <View style={s.errorRow}><Ionicons name="warning" size={14} color="#FF3B30" /><Text style={s.errorText}>{recoveryError}</Text></View>
            ) : null}
            <TouchableOpacity
              style={[(recoveryBusy || !recoveryEmail.trim()) && { opacity: 0.45 }, s.primaryBtn]}
              onPress={sendRecoveryOtp}
              disabled={recoveryBusy || !recoveryEmail.trim()}
            >
              <LinearGradient colors={["#007AFF", "#0055CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.primaryBtnInner}>
                {recoveryBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Send Recovery Code</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ── Recovery — OTP ───────────────────────────────────────────────────────────
  if (step.id === "recovery-otp") {
    const { email } = step;
    return (
      <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
        {renderHeader("Enter Recovery Code")}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[s.recoveryIconWrap, { backgroundColor: "rgba(0,122,255,0.12)" }]}>
              <Ionicons name="lock-open" size={36} color="#007AFF" />
            </View>
            <Text style={[s.stepTitle, { color: colors.text }]}>Check your email</Text>
            <Text style={[s.stepDesc, { color: colors.textMuted }]}>
              Sent a 6-digit code to{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>{email}</Text>.
              Enter it below to remove 2FA.
            </Text>
            <TextInput
              ref={otpRef}
              style={[s.codeInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: recoveryError ? "#FF3B30" : colors.border }]}
              value={recoveryOtp}
              onChangeText={t => { setRecoveryOtp(t.replace(/\D/g, "").slice(0, 6)); setRecoveryError(""); }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={colors.textMuted}
              textAlign="center"
              returnKeyType="done"
              onSubmitEditing={() => verifyRecoveryOtp(email)}
            />
            {recoveryError ? (
              <View style={s.errorRow}><Ionicons name="warning" size={14} color="#FF3B30" /><Text style={s.errorText}>{recoveryError}</Text></View>
            ) : null}
            <TouchableOpacity
              style={[(recoveryBusy || recoveryOtp.length < 6) && { opacity: 0.45 }, s.primaryBtn]}
              onPress={() => verifyRecoveryOtp(email)}
              disabled={recoveryBusy || recoveryOtp.length < 6}
            >
              <LinearGradient colors={["#007AFF", "#0055CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.primaryBtnInner}>
                {recoveryBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Verify & Remove 2FA</Text>}
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setRecoveryOtp(""); setRecoveryError(""); setStep({ id: "recovery-email" }); }}>
              <Text style={[s.linkText, { color: colors.accent }]}>Didn't receive it? Try again</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1 },
  centered:{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  body:    { paddingHorizontal: 16, paddingTop: 12, gap: 12 },

  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  // ── Hero ──
  heroCard: { borderRadius: 24, padding: 24, alignItems: "center", gap: 12, overflow: "hidden" },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  heroSub:   { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)", textAlign: "center", lineHeight: 21 },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(48,209,88,0.15)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  heroBadgeText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(48,209,88,0.9)" },
  benefitsCol: { width: "100%", gap: 14, marginTop: 4 },

  // ── Score ──
  scoreCard:  { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  scoreLeft:  { gap: 2 },
  scoreLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  scoreValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scoreBarCol: { flex: 1, gap: 4 },
  scoreBarBg:  { height: 6, borderRadius: 3, overflow: "hidden" },
  scoreBarFill:{ height: 6, borderRadius: 3 },
  scoreBarLabel:{ fontSize: 10, fontFamily: "Inter_400Regular" },
  scoreDot:   { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },

  // ── Sections ──
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.7, paddingHorizontal: 4, marginTop: 4 },

  actionCard:    { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  actionRow:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  actionIcon:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  actionMeta:    { flex: 1 },
  actionLabel:   { fontSize: 15, fontFamily: "Inter_500Medium" },
  actionSub:     { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1.5, lineHeight: 17 },
  actionChevron: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  compatCard:  { borderRadius: 16, borderWidth: 1, overflow: "hidden", paddingTop: 12 },
  compatTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, paddingHorizontal: 14, marginBottom: 6 },
  compatRow:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, gap: 12 },
  compatIcon:  { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  compatMeta:  { flex: 1 },
  compatName:  { fontSize: 14, fontFamily: "Inter_500Medium" },
  compatNote:  { fontSize: 11.5, fontFamily: "Inter_400Regular", marginTop: 1 },

  divider: { height: StyleSheet.hairlineWidth },
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText:  { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  footnote:   { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, textAlign: "center", paddingHorizontal: 8, marginTop: 4 },

  // ── Warning banner ──
  warnBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FF9F0A18", borderColor: "#FF9F0A40", borderWidth: 1, borderRadius: 12, padding: 12 },
  warnText:   { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#FF9F0A", lineHeight: 18 },

  // ── Progress ──
  progressRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  progStep:    { alignItems: "center", gap: 4 },
  progDot:     { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  progLine:    { flex: 1, height: 1.5, marginBottom: 14 },
  progLabel:   { fontSize: 10, fontFamily: "Inter_500Medium" },

  // ── Enroll card ──
  enrollCard:       { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  enrollCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  enrollStepBadge:  { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(88,86,214,0.25)", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  enrollStepNum:    { color: "#5856D6", fontSize: 13, fontFamily: "Inter_700Bold" },
  enrollCardTitle:  { fontSize: 15, fontFamily: "Inter_700Bold" },
  enrollCardSub:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  instructionList:  { gap: 10 },

  qrWrap: { alignSelf: "center", padding: 18, borderRadius: 18 },

  secretToggle:     { flexDirection: "row", alignItems: "center", gap: 7, padding: 10, borderRadius: 10, borderWidth: 1, alignSelf: "center" },
  secretToggleText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  secretBox:        { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  secretLabel:      { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  secretKey:        { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 2.5, textAlign: "center" },
  secretMeta:       { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  secretMetaText:   { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },

  ackRow:    { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 13, borderRadius: 12, borderWidth: 1.5 },
  checkbox:  { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  ackText:   { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },

  otpContainer:    { position: "relative" },
  otpOverlayInput: { ...StyleSheet.absoluteFill, opacity: 0, zIndex: 10 },
  errorRow:  { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 8 },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#FF3B30", lineHeight: 18 },
  codeHint:  { fontSize: 11.5, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 10, lineHeight: 17 },

  primaryBtn:      { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  primaryBtnInner: { paddingVertical: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnText:  { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  cancelBtn:  { alignItems: "center", paddingVertical: 14 },
  cancelText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  stepTitle:       { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  stepDesc:        { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  textInput:       { borderRadius: 14, borderWidth: 1, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  codeInput:       { borderRadius: 999, borderWidth: 0.5, padding: 16, fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: 12, marginVertical: 8 },
  linkText:        { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center", paddingVertical: 8 },
  recoveryIconWrap:{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", alignSelf: "center" },
});
