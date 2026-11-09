import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { TwoFactorGate } from "@/components/ui/TwoFactorGate";
import { useLanguage } from "@/context/LanguageContext";
import { registerUiTexts } from "@/lib/i18n";

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP2_WAIT   = 30;
const STEP5_WAIT   = 15;
const FINAL_PHRASE = "PERMANENTLY DELETE MY ACCOUNT";

const CONSEQUENCES = [
  { id: "posts",    icon: "newspaper"   as const, text: "All posts, stories and moments will be permanently erased" },
  { id: "chats",    icon: "chatbubbles"  as const, text: "Every chat, message and media file will be removed forever" },
  { id: "coins",    icon: "wallet"       as const, text: "Your entire ACoins balance will be forfeited. No refund" },
  { id: "friends",  icon: "people"       as const, text: "All followers, contacts and community memberships will be lost" },
  { id: "premium",  icon: "star"         as const, text: "Active Premium or Platinum subscriptions will NOT be refunded" },
  { id: "media",    icon: "images"       as const, text: "Every photo, video and file you uploaded will be deleted" },
  { id: "irrev",    icon: "warning"      as const, text: "After 30 days this is irreversible. Your data is gone forever" },
];

const LEAVE_REASONS = [
  "Privacy concerns",
  "Found a better alternative",
  "Too many notifications",
  "Account was hacked or compromised",
  "Taking a break",
  "Other",
];
registerUiTexts([...CONSEQUENCES.map((item) => item.text), ...LEAVE_REASONS]);

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <View style={si.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[si.dot, {
          backgroundColor: i < step ? "#FF3B30" : i === step ? "#FF3B30" : "rgba(120,120,128,0.25)",
          width: i === step ? 22 : 8,
          opacity: i < step ? 0.40 : 1,
        }]} />
      ))}
      <Text style={si.label}>Step {step + 1} of {total}</Text>
    </View>
  );
}
const si = StyleSheet.create({
  row:   { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 18 },
  dot:   { height: 8, borderRadius: 4 },
  label: { marginLeft: 6, fontSize: 12, fontFamily: "Inter_500Medium", color: "#8E8E93" },
});

// ─── Step 1 — Acknowledge all consequences ────────────────────────────────────

function Step1({
  checked, onToggle, onNext, onCancel, colors,
}: {
  checked: Set<string>; onToggle: (id: string) => void;
  onNext: () => void; onCancel: () => void; colors: any;
}) {
  const { t } = useLanguage();
  const allChecked = CONSEQUENCES.every(c => checked.has(c.id));
  const remaining  = CONSEQUENCES.filter(c => !checked.has(c.id)).length;

  return (
    <>
      <Text style={[st.title, { color: "#FF3B30" }]}>What you will permanently lose</Text>
      <Text style={[st.subtitle, { color: colors.textMuted }]}>
        Read every item carefully. You must check all {CONSEQUENCES.length} boxes before you can continue.
      </Text>

      <View style={{ gap: 9, marginVertical: 4 }}>
        {CONSEQUENCES.map(c => {
          const active = checked.has(c.id);
          return (
            <TouchableOpacity
              key={c.id}
              style={[st.ackRow, {
                backgroundColor: active ? "#FF3B3010" : colors.backgroundTertiary,
                borderColor:     active ? "#FF3B3040" : colors.border,
              }]}
              onPress={() => { Haptics.selectionAsync(); onToggle(c.id); }}
              activeOpacity={0.75}
            >
              <View style={[st.checkbox, {
                backgroundColor: active ? "#FF3B30" : "transparent",
                borderColor: active ? "#FF3B30" : colors.border,
              }]}>
                {active && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <Ionicons name={c.icon} size={15} color={active ? "#FF3B30" : colors.textMuted} style={{ marginTop: 1 }} />
              <Text style={[st.ackText, { color: active ? colors.text : colors.textMuted }]}>{t(c.text)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[st.btn, { backgroundColor: allChecked ? "#FF3B30" : colors.backgroundTertiary }]}
        onPress={allChecked ? onNext : undefined}
        activeOpacity={0.8}
      >
        <Text style={[st.btnText, { color: allChecked ? "#fff" : colors.textMuted }]}>
              {allChecked ? "I understand everything. Continue" : `${remaining} item${remaining !== 1 ? "s" : ""} left to acknowledge`}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} style={st.cancelBtn}>
        <Text style={[st.cancelText, { color: colors.textMuted }]}>← Keep my account</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── Step 2 — Mandatory 30s cooldown + reason ────────────────────────────────

function Step2({
  reason, onReasonChange, onNext, onBack, colors,
}: {
  reason: string; onReasonChange: (v: string) => void;
  onNext: () => void; onBack: () => void; colors: any;
}) {
  const { t } = useLanguage();
  const [seconds, setSeconds]   = useState(STEP2_WAIT);
  const [timerDone, setTimerDone] = useState(false);
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 0, duration: STEP2_WAIT * 1000, useNativeDriver: false,
    }).start();
    const iv = setInterval(() => {
      setSeconds(p => {
        if (p <= 1) { clearInterval(iv); setTimerDone(true); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const canContinue = timerDone && !!reason;

  return (
    <>
      <Text style={[st.title, { color: "#FF3B30" }]}>Mandatory waiting period</Text>
      <Text style={[st.subtitle, { color: colors.textMuted }]}>
        We require a {STEP2_WAIT}-second pause so this decision isn't made in haste.
      </Text>

      {!timerDone ? (
        <View style={[st.timerBox, { backgroundColor: colors.backgroundTertiary }]}>
          <Ionicons name="time" size={16} color="#FF9F0A" />
          <View style={{ flex: 1 }}>
            <Text style={[st.timerLabel, { color: colors.text }]}>
              Please wait {seconds}s before you can continue
            </Text>
            <View style={[st.timerTrack, { backgroundColor: colors.border }]}>
              <Animated.View style={[st.timerFill, {
                width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
              }]} />
            </View>
          </View>
        </View>
      ) : (
        <View style={[st.timerBox, { backgroundColor: "#34C75912" }]}>
          <Ionicons name="checkmark-circle" size={16} color="#34C759" />
          <Text style={[st.timerLabel, { color: "#34C759" }]}>Waiting period complete</Text>
        </View>
      )}

      <Text style={[st.fieldLabel, { color: colors.textMuted }]}>
        Why are you deleting your account? <Text style={{ color: "#FF3B30" }}>*</Text>
      </Text>
      <View style={{ gap: 7 }}>
        {LEAVE_REASONS.map(r => (
          <TouchableOpacity
            key={r}
            style={[st.reasonRow, {
              backgroundColor: reason === r ? "#FF3B3010" : colors.backgroundTertiary,
              borderColor:     reason === r ? "#FF3B3060" : colors.border,
            }]}
            onPress={() => { Haptics.selectionAsync(); onReasonChange(r); }}
            activeOpacity={0.75}
          >
            <View style={[st.radio, {
              borderColor: reason === r ? "#FF3B30" : colors.border,
            }]}>
              {reason === r && <View style={st.radioDot} />}
            </View>
            <Text style={[st.reasonText, { color: reason === r ? colors.text : colors.textMuted }]}>{t(r)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[st.btn, { backgroundColor: canContinue ? "#FF3B30" : colors.backgroundTertiary, marginTop: 8 }]}
        onPress={canContinue ? onNext : undefined}
        activeOpacity={0.8}
      >
        <Text style={[st.btnText, { color: canContinue ? "#fff" : colors.textMuted }]}>
          {!timerDone ? `Wait ${seconds}s…` : !reason ? "Select a reason to continue" : "Continue"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} style={st.cancelBtn}>
        <Text style={[st.cancelText, { color: colors.textMuted }]}>← Go back</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── Step 3 — Email confirmation ─────────────────────────────────────────────

function Step3({
  userEmail, emailInput, onEmailChange, onNext, onBack, colors, isDark,
}: {
  userEmail: string; emailInput: string; onEmailChange: (v: string) => void;
  onNext: () => void; onBack: () => void; colors: any; isDark: boolean;
}) {
  const emailMatch = emailInput.trim().toLowerCase() === userEmail.toLowerCase();

  return (
    <>
      <Text style={[st.title, { color: "#FF3B30" }]}>Confirm your identity</Text>
      <Text style={[st.subtitle, { color: colors.textMuted }]}>
        Type your exact account email address — character for character.
      </Text>

      <Text style={[st.fieldLabel, { color: colors.textMuted }]}>Account email address</Text>
      <TextInput
        style={[st.input, {
          color: colors.text,
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          borderColor: emailInput.length > 0 ? (emailMatch ? "#34C759" : "#FF3B30") : colors.border,
        }]}
        placeholder={userEmail.replace(/(.{2}).+(@.+)/, "$1···$2")}
        placeholderTextColor={colors.textMuted}
        value={emailInput}
        onChangeText={onEmailChange}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {emailInput.length > 3 && !emailMatch && (
        <Text style={st.mismatchText}>Email does not match your account</Text>
      )}
      {emailMatch && (
        <View style={[st.timerBox, { backgroundColor: "#34C75912", marginBottom: 0 }]}>
          <Ionicons name="checkmark-circle" size={15} color="#34C759" />
          <Text style={[st.timerLabel, { color: "#34C759", fontSize: 12 }]}>Email verified</Text>
        </View>
      )}

      <TouchableOpacity
        style={[st.btn, { backgroundColor: emailMatch ? "#FF3B30" : colors.backgroundTertiary, marginTop: 10 }]}
        onPress={emailMatch ? onNext : undefined}
        activeOpacity={0.8}
      >
        <Text style={[st.btnText, { color: emailMatch ? "#fff" : colors.textMuted }]}>
          {emailMatch ? "Continue" : "Enter exact email to continue"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} style={st.cancelBtn}>
        <Text style={[st.cancelText, { color: colors.textMuted }]}>← Go back</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── Step 4 — Handle confirmation ─────────────────────────────────────────────

function Step4({
  userHandle, handleInput, onHandleChange, onNext, onBack, colors, isDark,
}: {
  userHandle: string; handleInput: string; onHandleChange: (v: string) => void;
  onNext: () => void; onBack: () => void; colors: any; isDark: boolean;
}) {
  const handleMatch = handleInput.trim().replace(/^@/, "") === userHandle.replace(/^@/, "");

  return (
    <>
      <Text style={[st.title, { color: "#FF3B30" }]}>Username verification</Text>
      <Text style={[st.subtitle, { color: colors.textMuted }]}>
        Type your exact @handle to prove you own this account.
      </Text>

      <Text style={[st.fieldLabel, { color: colors.textMuted }]}>Your account @handle</Text>
      <TextInput
        style={[st.input, {
          color: colors.text,
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          borderColor: handleInput.length > 0 ? (handleMatch ? "#34C759" : "#FF3B30") : colors.border,
        }]}
        placeholder={`@${userHandle.replace(/^@/, "")}`}
        placeholderTextColor={colors.textMuted}
        value={handleInput}
        onChangeText={onHandleChange}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {handleInput.length > 1 && !handleMatch && (
        <Text style={st.mismatchText}>Handle does not match your account</Text>
      )}
      {handleMatch && (
        <View style={[st.timerBox, { backgroundColor: "#34C75912", marginBottom: 0 }]}>
          <Ionicons name="checkmark-circle" size={15} color="#34C759" />
          <Text style={[st.timerLabel, { color: "#34C759", fontSize: 12 }]}>Handle verified</Text>
        </View>
      )}

      <TouchableOpacity
        style={[st.btn, { backgroundColor: handleMatch ? "#FF3B30" : colors.backgroundTertiary, marginTop: 10 }]}
        onPress={handleMatch ? onNext : undefined}
        activeOpacity={0.8}
      >
        <Text style={[st.btnText, { color: handleMatch ? "#fff" : colors.textMuted }]}>
          {handleMatch ? "Continue" : "Enter exact handle to continue"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} style={st.cancelBtn}>
        <Text style={[st.cancelText, { color: colors.textMuted }]}>← Go back</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── Step 5 — Final phrase + 15s countdown ───────────────────────────────────

function Step5({
  phraseInput, onPhraseChange, onConfirm, onBack, deleting, colors, isDark,
}: {
  phraseInput: string; onPhraseChange: (v: string) => void;
  onConfirm: () => void; onBack: () => void;
  deleting: boolean; colors: any; isDark: boolean;
}) {
  const [countdown, setCountdown] = useState(STEP5_WAIT);
  const [ready, setReady]         = useState(false);
  const phraseMatch = phraseInput.trim() === FINAL_PHRASE;

  useEffect(() => {
    if (!phraseMatch) { setCountdown(STEP5_WAIT); setReady(false); return; }
    setReady(false);
    const iv = setInterval(() => {
      setCountdown(p => {
        if (p <= 1) { clearInterval(iv); setReady(true); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [phraseMatch]);

  const canDelete = phraseMatch && ready;

  return (
    <>
      <Text style={[st.title, { color: "#FF3B30" }]}>Final confirmation</Text>
      <Text style={[st.subtitle, { color: colors.textMuted }]}>
        There is no going back after this. Your account enters a 30-day deletion queue.
      </Text>

      <View style={[st.warnBox, { backgroundColor: "#FF3B3012", borderColor: "#FF3B3035" }]}>
        <Ionicons name="skull" size={20} color="#FF3B30" />
        <Text style={[st.warnText, { color: colors.text }]}>
          After 30 days your account and{" "}
          <Text style={{ fontFamily: "Inter_700Bold", color: "#FF3B30" }}>all associated data</Text>
          {" "}will be permanently erased. This cannot be undone.
        </Text>
      </View>

      <Text style={[st.fieldLabel, { color: colors.textMuted }]}>
        Type{" "}
        <Text style={{ fontFamily: "Inter_700Bold", color: colors.text, letterSpacing: 0.3, fontSize: 12 }}>
          {FINAL_PHRASE}
        </Text>{" "}
        exactly:
      </Text>
      <TextInput
        style={[st.input, {
          color: "#FF3B30",
          fontFamily: "Inter_700Bold",
          fontSize: 13,
          backgroundColor: isDark ? "rgba(255,59,48,0.08)" : "rgba(255,59,48,0.05)",
          borderColor: phraseMatch ? "#FF3B30" : colors.border,
        }]}
        placeholder={FINAL_PHRASE}
        placeholderTextColor={colors.textMuted}
        value={phraseInput}
        onChangeText={onPhraseChange}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {phraseMatch && !ready && (
        <View style={[st.timerBox, { backgroundColor: colors.backgroundTertiary }]}>
          <Ionicons name="hourglass" size={15} color="#FF9F0A" />
          <Text style={[st.timerLabel, { color: colors.textMuted }]}>
            Delete button unlocks in {countdown}s — this is your last chance to reconsider
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[st.btn, {
          backgroundColor: canDelete ? "#FF3B30" : colors.backgroundTertiary,
          opacity: deleting ? 0.6 : 1,
        }]}
        onPress={canDelete && !deleting ? onConfirm : undefined}
        activeOpacity={0.8}
      >
        {deleting
          ? <ActivityIndicator color="#fff" />
          : <Text style={[st.btnText, { color: canDelete ? "#fff" : colors.textMuted }]}>
              {canDelete ? "⚠ Schedule Permanent Deletion" : "Complete the phrase above"}
            </Text>
        }
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} style={st.cancelBtn} disabled={deleting}>
        <Text style={[st.cancelText, { color: colors.textMuted }]}>← Go back</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── Shared step styles ───────────────────────────────────────────────────────

const st = StyleSheet.create({
  title:        { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 6 },
  subtitle:     { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginBottom: 14 },
  ackRow:       { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 11, borderRadius: 11, borderWidth: 1 },
  checkbox:     { width: 19, height: 19, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  ackText:      { flex: 1, fontSize: 12.5, fontFamily: "Inter_400Regular", lineHeight: 17 },
  btn:          { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  btnText:      { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cancelBtn:    { alignItems: "center", paddingVertical: 12 },
  cancelText:   { fontSize: 14, fontFamily: "Inter_400Regular" },
  timerBox:     { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, marginBottom: 12 },
  timerLabel:   { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1, lineHeight: 18 },
  timerTrack:   { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 6 },
  timerFill:    { height: "100%", borderRadius: 2, backgroundColor: "#FF9F0A" },
  fieldLabel:   { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 8, lineHeight: 20 },
  input:        { borderRadius: 14, borderWidth: 1.5, padding: 14, fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 4 },
  mismatchText: { fontSize: 12, color: "#FF3B30", fontFamily: "Inter_400Regular", marginBottom: 6 },
  reasonRow:    { flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderRadius: 11, borderWidth: 1 },
  radio:        { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  radioDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF3B30" },
  reasonText:   { fontSize: 13, fontFamily: "Inter_400Regular" },
  warnBox:      { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  warnText:     { flex: 1, fontSize: 13.5, fontFamily: "Inter_400Regular", lineHeight: 20 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DangerZoneScreen() {
  const { colors, isDark } = useTheme();
  const { user, profile, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [showGate, setShowGate]   = useState(false);
  const [started, setStarted]     = useState(false);
  const [step, setStep]           = useState(0);

  // Step 1
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Step 2
  const [reason, setReason]   = useState("");
  // Step 3
  const [emailInput, setEmailInput] = useState("");
  // Step 4
  const [handleInput, setHandleInput] = useState("");
  // Step 5
  const [phraseInput, setPhraseInput] = useState("");
  const [deleting, setDeleting]       = useState(false);

  const userEmail  = user?.email ?? "";
  const userHandle = profile?.handle ?? "";

  function reset() {
    setStep(0);
    setChecked(new Set());
    setReason("");
    setEmailInput("");
    setHandleInput("");
    setPhraseInput("");
    setDeleting(false);
  }

  function toggleCheck(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      if (user) {
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30);
        await supabase
          .from("profiles")
          .update({ scheduled_deletion_at: deletionDate.toISOString() })
          .eq("id", user.id);
      }
      await signOut();
      showAlert(
        "Account Scheduled for Deletion",
        "Your account will be permanently deleted in 30 days. Log back in within that period to cancel."
      );
      router.replace("/welcome");
    } catch {
      showAlert("Error", "Failed to schedule account deletion. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Account Closure" />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 48 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {!started ? (
            /* ── Landing / Warning screen ─────────────────────────────── */
            <>
              <LinearGradient
                colors={["rgba(255,59,48,0.12)", "rgba(255,59,48,0.03)"]}
                style={s.heroBanner}
              >
                <View style={s.heroIcon}>
                  <Ionicons name="skull" size={36} color="#FF3B30" />
                </View>
                <Text style={[s.heroTitle, { color: "#FF3B30" }]}>Account Closure</Text>
                <Text style={[s.heroSub, { color: colors.textMuted }]}>
                  This is a permanent and irreversible action. Your account, data, messages and purchases will be lost forever.
                </Text>
              </LinearGradient>

              <GlassCard style={s.warnCard} variant="medium">
                {[
                  { icon: "time" as const,          text: "5-step verification process with mandatory waiting periods" },
                  { icon: "shield" as const,        text: "2FA identity check required before you can begin" },
          { icon: "hourglass" as const,     text: "30-day grace period. You can restore your account during this time" },
                  { icon: "trash" as const,         text: "After 30 days all data is permanently erased with no recovery" },
                ].map(item => (
                  <View key={item.text} style={s.warnRow}>
                    <Ionicons name={item.icon} size={16} color="#FF9F0A" />
                    <Text style={[s.warnText, { color: colors.textMuted }]}>{item.text}</Text>
                  </View>
                ))}
              </GlassCard>

              <TouchableOpacity
                style={[s.beginBtn, { borderColor: "#FF3B3050" }]}
                onPress={() => setShowGate(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="lock-closed" size={16} color="#FF3B30" />
                <Text style={s.beginBtnText}>Begin Account Closure Process</Text>
              </TouchableOpacity>

              <Text style={[s.footerNote, { color: colors.textMuted }]}>
                Changed your mind? Tap the back arrow above. Your account will remain active.
              </Text>
            </>
          ) : (
            /* ── Active deletion flow ─────────────────────────────────── */
            <GlassCard style={s.flowCard} variant="strong">
              <StepIndicator step={step} total={5} />

              {step === 0 && (
                <Step1
                  checked={checked}
                  onToggle={toggleCheck}
                  onNext={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); setStep(1); }}
                  onCancel={() => { reset(); }}
                  colors={colors}
                />
              )}
              {step === 1 && (
                <Step2
                  reason={reason}
                  onReasonChange={setReason}
                  onNext={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); setStep(2); }}
                  onBack={() => setStep(0)}
                  colors={colors}
                />
              )}
              {step === 2 && (
                <Step3
                  userEmail={userEmail}
                  emailInput={emailInput}
                  onEmailChange={setEmailInput}
                  onNext={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); setStep(3); }}
                  onBack={() => setStep(1)}
                  colors={colors}
                  isDark={isDark}
                />
              )}
              {step === 3 && (
                <Step4
                  userHandle={userHandle}
                  handleInput={handleInput}
                  onHandleChange={setHandleInput}
                  onNext={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); setStep(4); }}
                  onBack={() => setStep(2)}
                  colors={colors}
                  isDark={isDark}
                />
              )}
              {step === 4 && (
                <Step5
                  phraseInput={phraseInput}
                  onPhraseChange={setPhraseInput}
                  onConfirm={handleDeleteAccount}
                  onBack={() => { setPhraseInput(""); setStep(3); }}
                  deleting={deleting}
                  colors={colors}
                  isDark={isDark}
                />
              )}
            </GlassCard>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 2FA Gate — must pass before flow starts */}
      <TwoFactorGate
        visible={showGate}
        title="Identity Verification Required"
        subtitle="Two-factor authentication is required before you can begin the account closure process."
        onSuccess={() => { setShowGate(false); reset(); setStarted(true); }}
        onDismiss={() => setShowGate(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },

  heroBanner: { borderRadius: 20, padding: 24, alignItems: "center", gap: 10 },
  heroIcon:   { width: 72, height: 72, borderRadius: 22, backgroundColor: "rgba(255,59,48,0.12)", alignItems: "center", justifyContent: "center" },
  heroTitle:  { fontSize: 22, fontFamily: "Inter_700Bold" },
  heroSub:    { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },

  warnCard:  { borderRadius: 18, padding: 18, gap: 14 },
  warnRow:   { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  warnText:  { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },

  beginBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, borderWidth: 1.5, paddingVertical: 15, backgroundColor: "rgba(255,59,48,0.06)" },
  beginBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FF3B30" },

  footerNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18, paddingHorizontal: 12 },

  flowCard: { borderRadius: 22, padding: 22, paddingBottom: 8 },
});
