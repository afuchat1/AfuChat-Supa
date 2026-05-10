import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import * as Haptics from "@/lib/haptics";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TwoFactorGateProps {
  visible: boolean;
  onSuccess: () => void;
  onDismiss: () => void;
  title?: string;
  subtitle?: string;
}

type GateState = "checking" | "needed" | "verifying" | "error";

// ─── Component ────────────────────────────────────────────────────────────────
// Drop-in modal that gates a sensitive action behind step-up 2FA.
// • If the user has no enrolled TOTP factor, calls onSuccess() instantly.
// • If the session is already aal2, calls onSuccess() instantly.
// • Otherwise shows a 6-digit input and verifies with Supabase MFA.
export function TwoFactorGate({
  visible,
  onSuccess,
  onDismiss,
  title = "Confirm Your Identity",
  subtitle = "Enter the 6-digit code from your authenticator app to continue.",
}: TwoFactorGateProps) {
  const { colors } = useTheme();
  const [gateState, setGateState] = useState<GateState>("checking");
  const [code, setCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      setCode("");
      setErrorMsg("");
      setGateState("checking");
      setFactorId(null);
      setChallengeId(null);
      return;
    }
    setup();
  }, [visible]);

  async function setup() {
    setGateState("checking");
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      // No step-up needed: already aal2 or no 2FA enrolled
      if (!aal || aal.nextLevel !== "aal2" || aal.currentLevel === "aal2") {
        onSuccess();
        return;
      }

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.find((f: any) => f.status === "verified");
      if (!factor) {
        onSuccess();
        return;
      }

      const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });
      if (chalErr || !challenge) {
        setErrorMsg("Could not start verification. Please try again.");
        setGateState("error");
        return;
      }

      setFactorId(factor.id);
      setChallengeId(challenge.id);
      setGateState("needed");
      setTimeout(() => inputRef.current?.focus(), 350);
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setGateState("error");
    }
  }

  async function handleVerify() {
    if (!factorId || !challengeId || code.length !== 6) return;
    setGateState("verifying");
    setErrorMsg("");

    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg("Incorrect code. Please try again.");
      setCode("");
      setGateState("needed");
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSuccess();
  }

  if (!visible || (gateState === "checking" && false)) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => { Keyboard.dismiss(); onDismiss(); }}
        />

        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />

          <TouchableOpacity style={styles.closeBtn} onPress={onDismiss}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark" size={34} color="#5856D6" />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>

          {gateState === "checking" ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 28 }} />
          ) : gateState === "error" ? (
            <>
              <Text style={styles.errorMsg}>{errorMsg}</Text>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.accent }]}
                onPress={setup}
              >
                <Text style={styles.btnText}>Try Again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                ref={inputRef}
                style={[
                  styles.codeInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.inputBg,
                    borderColor: errorMsg ? "#FF3B30" : colors.border,
                  },
                ]}
                value={code}
                onChangeText={(t) => {
                  setCode(t.replace(/\D/g, "").slice(0, 6));
                  setErrorMsg("");
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={colors.textMuted}
                textAlign="center"
                returnKeyType="done"
                onSubmitEditing={handleVerify}
              />

              {errorMsg ? (
                <Text style={styles.errorMsg}>{errorMsg}</Text>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.btn,
                  { backgroundColor: colors.accent },
                  (gateState === "verifying" || code.length !== 6) && { opacity: 0.45 },
                ]}
                onPress={handleVerify}
                disabled={gateState === "verifying" || code.length !== 6}
              >
                {gateState === "verifying" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Verify &amp; Continue</Text>
                )}
              </TouchableOpacity>

              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Open your authenticator app to get the code.
              </Text>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 14,
    alignItems: "center",
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
    alignSelf: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 20,
    right: 20,
    padding: 4,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(88,86,214,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  codeInput: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 18,
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: 10,
  },
  errorMsg: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#FF3B30",
    textAlign: "center",
  },
  btn: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
});
