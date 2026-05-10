import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import QRCode from "react-native-qrcode-svg";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { TwoFactorGate } from "@/components/ui/TwoFactorGate";
import * as Haptics from "@/lib/haptics";

// ─── Step machine ─────────────────────────────────────────────────────────────
type Step =
  | { id: "loading" }
  | { id: "status"; enrolled: boolean; factorId?: string }
  | { id: "enroll-qr"; factorId: string; uri: string; secret: string }
  | { id: "enroll-verify"; factorId: string }
  | { id: "recovery-email" }
  | { id: "recovery-otp"; email: string };

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function TwoFactorScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>({ id: "loading" });
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [showDisableGate, setShowDisableGate] = useState(false);
  const verifyRef = useRef<TextInput>(null);
  const otpRef = useRef<TextInput>(null);

  const loadStatus = useCallback(async () => {
    setStep({ id: "loading" });
    const { data: factors, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setStep({ id: "status", enrolled: false });
      return;
    }
    const active = factors?.totp?.find((f: any) => f.status === "verified");
    setStep({ id: "status", enrolled: !!active, factorId: active?.id });
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // ─── Enrollment ─────────────────────────────────────────────────────────────
  async function startEnroll() {
    setStep({ id: "loading" });
    const label = user?.email ?? "AfuChat";
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "AfuChat",
      friendlyName: label,
    });
    if (error || !data) {
      showAlert("Error", error?.message ?? "Could not start enrollment.");
      await loadStatus();
      return;
    }
    setVerifyCode("");
    setVerifyError("");
    setStep({
      id: "enroll-qr",
      factorId: data.id,
      uri: data.totp.uri,
      secret: data.totp.secret,
    });
  }

  async function confirmEnroll(factorId: string) {
    if (verifyCode.length !== 6) return;
    setVerifyBusy(true);
    setVerifyError("");
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: verifyCode,
    });
    setVerifyBusy(false);
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setVerifyError("Incorrect code. Check your app and try again.");
      setVerifyCode("");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("2FA Enabled", "Two-factor authentication is now active on your account.");
    loadStatus();
  }

  // ─── Disable ────────────────────────────────────────────────────────────────
  async function doDisable() {
    const s = step;
    if (s.id !== "status" || !s.factorId) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: s.factorId });
    if (error) {
      showAlert("Error", error.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("2FA Disabled", "Two-factor authentication has been removed from your account.");
    loadStatus();
  }

  // ─── Recovery (email OTP) ───────────────────────────────────────────────────
  async function sendRecoveryOtp() {
    const email = recoveryEmail.trim().toLowerCase();
    if (!email) {
      setRecoveryError("Please enter your email address.");
      return;
    }
    setRecoveryBusy(true);
    setRecoveryError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setRecoveryBusy(false);
    if (error) {
      setRecoveryError(error.message);
      return;
    }
    setRecoveryOtp("");
    setStep({ id: "recovery-otp", email });
    setTimeout(() => otpRef.current?.focus(), 300);
  }

  async function verifyRecoveryOtp(email: string) {
    const token = recoveryOtp.trim();
    if (token.length < 6) {
      setRecoveryError("Enter the full 6-digit code from your email.");
      return;
    }
    setRecoveryBusy(true);
    setRecoveryError("");

    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (otpError) {
      setRecoveryBusy(false);
      setRecoveryError("Invalid or expired code. Check your email and try again.");
      return;
    }

    // After email OTP succeeds we have a fresh aal1 session.
    // Unenroll the TOTP factor so 2FA is cleared.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.find((f: any) => f.status === "verified");
    if (factor) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }

    setRecoveryBusy(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert(
      "Account Recovered",
      "Two-factor authentication has been removed. You can re-enable it from Security settings."
    );
    loadStatus();
  }

  // ─── Render helpers ──────────────────────────────────────────────────────────
  function renderHeader(title: string) {
    return (
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => {
            if (step.id === "enroll-verify" || step.id === "enroll-qr") {
              loadStatus();
            } else if (step.id === "recovery-email" || step.id === "recovery-otp") {
              setStep({ id: "status", enrolled: false });
            } else {
              router.back();
            }
          }}
          hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
        >
          <Ionicons
            name={
              step.id === "enroll-verify" ||
              step.id === "enroll-qr" ||
              step.id === "recovery-email" ||
              step.id === "recovery-otp"
                ? "chevron-back"
                : "chevron-back"
            }
            size={26}
            color={colors.accent}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.headerBtn} />
      </View>
    );
  }

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (step.id === "loading") {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        {renderHeader("Two-Factor Authentication")}
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </View>
    );
  }

  // ─── Status page ─────────────────────────────────────────────────────────────
  if (step.id === "status") {
    const { enrolled, factorId } = step;
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        {renderHeader("Two-Factor Authentication")}
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Status card */}
          <View style={[styles.statusCard, { backgroundColor: colors.surface }]}>
            <View
              style={[
                styles.statusIcon,
                {
                  backgroundColor: enrolled
                    ? "rgba(48,209,88,0.12)"
                    : "rgba(142,142,147,0.12)",
                },
              ]}
            >
              <Ionicons
                name={enrolled ? "shield-checkmark" : "shield-outline"}
                size={36}
                color={enrolled ? "#30D158" : colors.textMuted}
              />
            </View>
            <Text style={[styles.statusTitle, { color: colors.text }]}>
              {enrolled ? "2FA is Active" : "2FA is Disabled"}
            </Text>
            <Text style={[styles.statusDesc, { color: colors.textMuted }]}>
              {enrolled
                ? "Your account requires a verification code for sensitive changes."
                : "Add an extra layer of security using an authenticator app."}
            </Text>
          </View>

          {/* Actions */}
          {enrolled ? (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MANAGE</Text>
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setShowDisableGate(true)}
                >
                  <View style={[styles.rowIcon, { backgroundColor: "#FF3B30" }]}>
                    <Ionicons name="shield-off-outline" size={18} color="#fff" />
                  </View>
                  <View style={styles.rowMeta}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>
                      Disable Two-Factor Auth
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                      Requires your authenticator code
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                RECOVERY OPTIONS
              </Text>
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    setRecoveryEmail(user?.email ?? "");
                    setRecoveryError("");
                    setStep({ id: "recovery-email" });
                  }}
                >
                  <View style={[styles.rowIcon, { backgroundColor: "#007AFF" }]}>
                    <Ionicons name="mail-outline" size={18} color="#fff" />
                  </View>
                  <View style={styles.rowMeta}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>
                      Reset via Email
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                      Verify your identity by email OTP
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>

                <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 60 }]} />

                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: "#8E8E93" }]}>
                    <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                  </View>
                  <View style={styles.rowMeta}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>
                      Reset via Phone
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                      SMS recovery — coming soon
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: colors.inputBg }]}>
                    <Text style={[styles.badgeText, { color: colors.textMuted }]}>SOON</Text>
                  </View>
                </View>
              </View>

              <Text style={[styles.infoText, { color: colors.textMuted }]}>
                Use recovery options only if you have permanently lost access to your
                authenticator app.
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SET UP</Text>
              <View style={[styles.section, { backgroundColor: colors.surface }]}>
                <TouchableOpacity style={styles.row} onPress={startEnroll}>
                  <View style={[styles.rowIcon, { backgroundColor: "#5856D6" }]}>
                    <Ionicons name="qr-code-outline" size={18} color="#fff" />
                  </View>
                  <View style={styles.rowMeta}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>
                      Enable Two-Factor Auth
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                      Scan a QR code with any authenticator app
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.infoText, { color: colors.textMuted }]}>
                Compatible with Google Authenticator, Authy, 1Password, and any TOTP app.
              </Text>
            </>
          )}
        </ScrollView>

        {/* Step-up gate for disabling */}
        <TwoFactorGate
          visible={showDisableGate}
          title="Disable Two-Factor Auth"
          subtitle="Enter your authenticator code to confirm you want to disable 2FA."
          onSuccess={() => {
            setShowDisableGate(false);
            doDisable();
          }}
          onDismiss={() => setShowDisableGate(false)}
        />
      </View>
    );
  }

  // ─── Enroll — QR code ────────────────────────────────────────────────────────
  if (step.id === "enroll-qr") {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        {renderHeader("Scan QR Code")}
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.stepTitle, { color: colors.text }]}>
            Step 1 — Scan with your authenticator
          </Text>
          <Text style={[styles.stepDesc, { color: colors.textMuted }]}>
            Open Google Authenticator, Authy, or any TOTP app and scan the QR code below.
          </Text>

          <View style={[styles.qrCard, { backgroundColor: "#fff" }]}>
            <QRCode value={step.uri} size={200} />
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            OR ENTER MANUALLY
          </Text>
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <View style={styles.secretRow}>
              <Text
                style={[styles.secretKey, { color: colors.text }]}
                selectable
              >
                {step.secret.match(/.{1,4}/g)?.join(" ") ?? step.secret}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
            onPress={() => {
              setVerifyCode("");
              setVerifyError("");
              setStep({ id: "enroll-verify", factorId: step.factorId });
              setTimeout(() => verifyRef.current?.focus(), 300);
            }}
          >
            <Text style={styles.primaryBtnText}>I've scanned it — Next</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ─── Enroll — Verify code ────────────────────────────────────────────────────
  if (step.id === "enroll-verify") {
    const { factorId } = step;
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        {renderHeader("Verify Code")}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.stepTitle, { color: colors.text }]}>
              Step 2 — Confirm it works
            </Text>
            <Text style={[styles.stepDesc, { color: colors.textMuted }]}>
              Enter the 6-digit code shown in your authenticator app to confirm setup.
            </Text>

            <TextInput
              ref={verifyRef}
              style={[
                styles.codeInput,
                {
                  color: colors.text,
                  backgroundColor: colors.inputBg,
                  borderColor: verifyError ? "#FF3B30" : colors.border,
                },
              ]}
              value={verifyCode}
              onChangeText={(t) => {
                setVerifyCode(t.replace(/\D/g, "").slice(0, 6));
                setVerifyError("");
              }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={colors.textMuted}
              textAlign="center"
              returnKeyType="done"
              onSubmitEditing={() => confirmEnroll(factorId)}
            />

            {verifyError ? (
              <Text style={styles.errorText}>{verifyError}</Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: colors.accent },
                (verifyBusy || verifyCode.length !== 6) && { opacity: 0.45 },
              ]}
              onPress={() => confirmEnroll(factorId)}
              disabled={verifyBusy || verifyCode.length !== 6}
            >
              {verifyBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Enable Two-Factor Auth</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ─── Recovery — Email input ───────────────────────────────────────────────────
  if (step.id === "recovery-email") {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        {renderHeader("Recover Account")}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.recoveryIcon}>
              <Ionicons name="mail" size={36} color="#007AFF" />
            </View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>
              Reset via Email
            </Text>
            <Text style={[styles.stepDesc, { color: colors.textMuted }]}>
              We'll send a one-time code to your email. Verifying it will remove
              two-factor authentication from your account.
            </Text>

            <TextInput
              style={[
                styles.textInput,
                {
                  color: colors.text,
                  backgroundColor: colors.inputBg,
                  borderColor: recoveryError ? "#FF3B30" : colors.border,
                },
              ]}
              value={recoveryEmail}
              onChangeText={(t) => {
                setRecoveryEmail(t);
                setRecoveryError("");
              }}
              placeholder="your@email.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={sendRecoveryOtp}
            />

            {recoveryError ? (
              <Text style={styles.errorText}>{recoveryError}</Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: "#007AFF" },
                (recoveryBusy || !recoveryEmail.trim()) && { opacity: 0.45 },
              ]}
              onPress={sendRecoveryOtp}
              disabled={recoveryBusy || !recoveryEmail.trim()}
            >
              {recoveryBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Send Recovery Code</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ─── Recovery — OTP input ────────────────────────────────────────────────────
  if (step.id === "recovery-otp") {
    const { email } = step;
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        {renderHeader("Enter Recovery Code")}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.recoveryIcon}>
              <Ionicons name="lock-open" size={36} color="#007AFF" />
            </View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>
              Check your email
            </Text>
            <Text style={[styles.stepDesc, { color: colors.textMuted }]}>
              We sent a 6-digit code to{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>
                {email}
              </Text>
              . Enter it below to remove 2FA from your account.
            </Text>

            <TextInput
              ref={otpRef}
              style={[
                styles.codeInput,
                {
                  color: colors.text,
                  backgroundColor: colors.inputBg,
                  borderColor: recoveryError ? "#FF3B30" : colors.border,
                },
              ]}
              value={recoveryOtp}
              onChangeText={(t) => {
                setRecoveryOtp(t.replace(/\D/g, "").slice(0, 6));
                setRecoveryError("");
              }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={colors.textMuted}
              textAlign="center"
              returnKeyType="done"
              onSubmitEditing={() => verifyRecoveryOtp(email)}
            />

            {recoveryError ? (
              <Text style={styles.errorText}>{recoveryError}</Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: "#007AFF" },
                (recoveryBusy || recoveryOtp.length < 6) && { opacity: 0.45 },
              ]}
              onPress={() => verifyRecoveryOtp(email)}
              disabled={recoveryBusy || recoveryOtp.length < 6}
            >
              {recoveryBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify &amp; Remove 2FA</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setRecoveryOtp("");
                setRecoveryError("");
                setStep({ id: "recovery-email" });
              }}
            >
              <Text style={[styles.linkText, { color: colors.accent }]}>
                Didn't receive the code? Try again
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, alignItems: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  body: { paddingHorizontal: 16, paddingTop: 24, gap: 14 },

  statusCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  statusIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statusDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginLeft: 4,
    marginTop: 6,
  },
  section: { borderRadius: 14, overflow: "hidden" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 14,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMeta: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sep: { height: StyleSheet.hairlineWidth },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },

  infoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },

  stepTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  stepDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    color: "#8E8E93",
  },

  qrCard: {
    alignSelf: "center",
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  secretRow: { padding: 16, alignItems: "center" },
  secretKey: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 4,
    textAlign: "center",
  },

  codeInput: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 18,
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: 10,
  },
  textInput: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#FF3B30",
    textAlign: "center",
  },

  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },

  recoveryIcon: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0,122,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    textDecorationLine: "underline",
  },
});
