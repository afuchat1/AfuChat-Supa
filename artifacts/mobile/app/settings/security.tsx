import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { TwoFactorGate } from "@/components/ui/TwoFactorGate";

// ─── Section ──────────────────────────────────────────────────────────────────
function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const { t } = useLanguage();
  return (
    <View style={sec.section}>
      <Text style={[sec.sectionLabel, { color: colors.textMuted }]}>{t(title)}</Text>
      <View style={[sec.card, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function Row({
  icon,
  iconColor,
  label,
  sublabel,
  last,
  danger,
  loading: rowLoading,
  onPress,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  label: string;
  sublabel?: string;
  last?: boolean;
  danger?: boolean;
  loading?: boolean;
  onPress?: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const ic = danger ? "#FF3B30" : iconColor;
  const { t } = useLanguage();
  return (
    <>
      <TouchableOpacity
        style={sec.row}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        disabled={!onPress || rowLoading}
      >
        <View style={sec.iconWrap}>
          {rowLoading
            ? <ActivityIndicator size="small" color={danger ? "#FF3B30" : colors.text} />
            : <Ionicons name={icon} size={22} color={danger ? "#FF3B30" : colors.text} />
          }
        </View>
        <View style={sec.rowText}>
          <Text style={[sec.rowLabel, { color: danger ? "#FF3B30" : colors.text }]}>{t(label)}</Text>
          {sublabel && (
            <Text style={[sec.rowSub, { color: colors.textMuted }]} numberOfLines={2}>{t(sublabel)}</Text>
          )}
        </View>
        {onPress && !rowLoading && (
          <Ionicons name="chevron-forward" size={15} color={danger ? "#FF3B3088" : colors.textMuted} style={{ marginLeft: 2 }} />
        )}
      </TouchableOpacity>
      {!last && <View style={[sec.divider, { backgroundColor: colors.separator }]} />}
    </>
  );
}

const sec = StyleSheet.create({
  section: { marginBottom: 0 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8, paddingHorizontal: 4 },
  card: { borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  iconWrap: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  divider: { height: 0.5, marginHorizontal: 16 },
});
import Colors from "@/constants/colors";

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SecuritySettingsScreen() {
  const { colors, isDark } = useTheme();
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  // ── 2FA status ──────────────────────────────────────────────────────────────
  type MfaStatus = "loading" | "enabled" | "disabled";
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>("loading");

  const loadMfaStatus = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const active = data?.totp?.find((f: any) => f.status === "verified");
    setMfaStatus(active ? "enabled" : "disabled");
  }, []);

  useEffect(() => { loadMfaStatus(); }, [loadMfaStatus]);

  // ── Change password ──────────────────────────────────────────────────────────
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [showPwdGate, setShowPwdGate] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  async function handleChangePassword() {
    if (!newPwd || !confirmPwd) { showAlert("Missing fields", "Please fill all password fields."); return; }
    if (newPwd.length < 6) { showAlert("Weak password", "Password must be at least 6 characters."); return; }
    if (newPwd !== confirmPwd) { showAlert("Mismatch", "New passwords do not match."); return; }
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setChangingPwd(false);
    if (error) { showAlert("Error", error.message); }
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Success", "Your password has been updated.");
      setShowChangePwd(false); setNewPwd(""); setConfirmPwd("");
    }
  }

  // ── Download data (via Supabase Edge Function → email) ──────────────────────
  const [showDownloadGate, setShowDownloadGate] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadData() {
    if (!user) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-user-data", {
        body: { types: ["profile", "posts", "messages", "activity", "transactions"] },
      });

      if (error || data?.error) {
        const msg = data?.error ?? error?.message ?? "Something went wrong. Please try again.";
        showAlert("Export Failed", msg);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const email = data?.email ?? user.email ?? "your registered email";
      showAlert(
        "Export Sent",
        `Your data export has been sent to ${email}. Check your inbox for the attached JSON file.`
      );
    } catch {
      showAlert("Error", "Failed to request data export. Please check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  }

  // ── Sign Out (3-step — buried here intentionally) ────────────────────────────
  const [showLogoutStep1, setShowLogoutStep1] = useState(false);
  const [showLogoutStep2, setShowLogoutStep2] = useState(false);
  const [logoutText, setLogoutText]           = useState("");
  const [logoutCountdown, setLogoutCountdown] = useState(5);
  const [loggingOut, setLoggingOut]           = useState(false);

  useEffect(() => {
    if (!showLogoutStep2) { setLogoutCountdown(5); return; }
    if (logoutCountdown <= 0) return;
    const t = setTimeout(() => setLogoutCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [showLogoutStep2, logoutCountdown]);

  async function handleConfirmLogout() {
    if (logoutText.trim().toUpperCase() !== "SIGN OUT") {
      showAlert("Confirmation required", 'Type "SIGN OUT" (all caps) to confirm.');
      return;
    }
    setLoggingOut(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowLogoutStep2(false);
    await signOut();
    setLoggingOut(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="security.title" />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 2FA status card ──────────────────────────────────────────── */}
        <GlassCard style={styles.mfaCard} variant="medium">
          <LinearGradient
            colors={mfaStatus === "enabled"
              ? ["rgba(48,209,88,0.18)", "rgba(48,209,88,0.04)"]
              : ["rgba(142,142,147,0.14)", "rgba(142,142,147,0.04)"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.mfaInner}>
            <View style={[styles.mfaIconWrap, {
              backgroundColor: mfaStatus === "enabled" ? "rgba(48,209,88,0.18)" : "rgba(142,142,147,0.14)",
            }]}>
              <Ionicons
                name={mfaStatus === "enabled" ? "shield-checkmark" : "shield"}
                size={28}
                color={mfaStatus === "enabled" ? "#30D158" : colors.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.mfaTitle, { color: colors.text }]}>
                {t("security.two_factor")}
              </Text>
              <Text style={[styles.mfaSub, { color: mfaStatus === "enabled" ? "#30D158" : colors.textMuted }]}>
                {mfaStatus === "loading" ? t("Checking status…")
                : mfaStatus === "enabled" ? t("security.two_factor_enabled")
                : t("security.two_factor_disabled")}
              </Text>
            </View>
            {mfaStatus === "loading"
              ? <ActivityIndicator size="small" color={colors.textMuted} />
              : <View style={[styles.mfaDot, { backgroundColor: mfaStatus === "enabled" ? "#30D158" : colors.textMuted }]} />
            }
          </View>
          <TouchableOpacity
            style={[styles.mfaBtn, { borderColor: mfaStatus === "enabled" ? "#30D158" + "40" : colors.border }]}
            onPress={() => { loadMfaStatus(); router.push("/settings/two-factor" as any); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.mfaBtnText, { color: mfaStatus === "enabled" ? "#30D158" : colors.accent }]}>
              {mfaStatus === "enabled" ? t("Manage 2FA") : t("Enable 2FA")}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={mfaStatus === "enabled" ? "#30D158" : colors.accent} />
          </TouchableOpacity>
        </GlassCard>

        {/* ── SECURITY ─────────────────────────────────────────────────── */}
        <Section title="security.security" colors={colors}>
          <Row
            icon="key"
            iconColor="#0A84FF"
            label="security.change_password"
            sublabel="security.change_password_description"
            onPress={() => setShowPwdGate(true)}
            colors={colors}
          />
          <Row
            icon="phone-portrait"
            iconColor="#30D158"
            label="security.device_security"
            sublabel="security.device_security_description"
            onPress={() => router.push("/device-security" as any)}
            last
            colors={colors}
          />
        </Section>

        {/* ── YOUR DATA ────────────────────────────────────────────────── */}
        <Section title="security.your_data" colors={colors}>
          <Row
            icon="cloud-download"
            iconColor="#0A84FF"
            label="settings.download_data"
            sublabel="security.export_data_description"
            loading={downloading}
            onPress={() => setShowDownloadGate(true)}
            last
            colors={colors}
          />
        </Section>

        {/* ── SIGN OUT ──────────────────────────────────────────────────── */}
        <Section title="security.session" colors={colors}>
          <Row
            icon="exit"
            iconColor="#FF9500"
            label="security.sign_out_device"
            sublabel="security.sign_out_device_description"
            onPress={() => { setLogoutText(""); setShowLogoutStep1(true); }}
            last
            colors={colors}
          />
        </Section>

        <Text style={[styles.footerNote, { color: colors.textMuted }]}>
          Your account data is synced to the cloud and stays safe when you sign out.
        </Text>

        {/* ── Deeply buried account closure link ────────────────────── */}
        <TouchableOpacity
          style={styles.closureLink}
          onPress={() => router.push("/settings/danger-zone" as any)}
          activeOpacity={0.5}
        >
          <Text style={[styles.closureLinkText, { color: colors.textMuted }]}>
            {t("Account closure")}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── 2FA gates ───────────────────────────────────────────────────── */}
      <TwoFactorGate
        visible={showPwdGate}
        title={t("security.verify_identity")}
        subtitle={t("security.two_factor_password")}
        onSuccess={() => { setShowPwdGate(false); setNewPwd(""); setConfirmPwd(""); setShowChangePwd(true); }}
        onDismiss={() => setShowPwdGate(false)}
      />
      <TwoFactorGate
        visible={showDownloadGate}
        title={t("security.verify_identity")}
        subtitle={t("security.confirm_export")}
        onSuccess={() => { setShowDownloadGate(false); handleDownloadData(); }}
        onDismiss={() => setShowDownloadGate(false)}
      />

      {/* ── Change Password modal ──────────────────────────────────────── */}
      <Modal visible={showChangePwd} animationType="none" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <GlassCard style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]} variant="strong">
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t("security.change_password")}</Text>
              <TouchableOpacity onPress={() => setShowChangePwd(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { color: colors.text, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", borderColor: colors.border }]}
              placeholder={t("security.new_password")} placeholderTextColor={colors.textMuted} value={newPwd} onChangeText={setNewPwd} secureTextEntry />
            <TextInput style={[styles.input, { color: colors.text, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", borderColor: colors.border }]}
              placeholder={t("Confirm new password")} placeholderTextColor={colors.textMuted} value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry />
            <TouchableOpacity style={[styles.modalBtn, changingPwd && { opacity: 0.6 }]} onPress={handleChangePassword} disabled={changingPwd} activeOpacity={0.8}>
              <LinearGradient colors={["#1018D8", "#0B10A8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalBtnGradient}>
                {changingPwd ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>{t("Update Password")}</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </GlassCard>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Sign Out Step 1: Warning ────────────────────────────────────── */}
      <Modal visible={showLogoutStep1} animationType="none" transparent>
        <View style={styles.modalOverlay}>
          <GlassCard style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]} variant="strong">
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Sign Out?</Text>
              <TouchableOpacity onPress={() => setShowLogoutStep1(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.warningBox}>
              <Ionicons name="information-circle" size={22} color={colors.accent} />
              <Text style={[styles.warningText, { color: colors.text }]}>
                Signing out will permanently erase all local data from this device. This includes messages, media, and settings.
                Your account remains active and you can log back in anytime.
              </Text>
            </View>

            <View style={styles.logoutChecklist}>
              {[
                "All offline messages will be removed",
                "Cached media and downloads deleted",
                "You will need your password to log back in",
                "Your account and data on our servers are safe",
              ].map((item) => (
                <View key={item} style={styles.checklistRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.textMuted} />
                  <Text style={[styles.checklistText, { color: colors.textMuted }]}>{item}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.logoutContinueBtn, { borderColor: colors.border }]}
              onPress={() => { setShowLogoutStep1(false); setLogoutText(""); setLogoutCountdown(5); setShowLogoutStep2(true); }}
              activeOpacity={0.75}
            >
              <Text style={[styles.logoutContinueBtnText, { color: colors.text }]}>Continue to confirmation →</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </Modal>

      {/* ── Sign Out Step 2: Type SIGN OUT + countdown ──────────────────── */}
      <Modal visible={showLogoutStep2} animationType="none" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <GlassCard style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]} variant="strong">
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Final Confirmation</Text>
              <TouchableOpacity onPress={() => setShowLogoutStep2(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>
              Type{" "}
              <Text style={{ fontFamily: "Inter_700Bold", color: colors.text, letterSpacing: 1 }}>SIGN OUT</Text>
              {" "}to confirm:
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", borderColor: colors.border }]}
              placeholder='Type "SIGN OUT"'
              placeholderTextColor={colors.textMuted}
              value={logoutText}
              onChangeText={setLogoutText}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[
                styles.deleteBtnWrap,
                (loggingOut || logoutText.trim().toUpperCase() !== "SIGN OUT" || logoutCountdown > 0) && { opacity: 0.4 },
              ]}
              onPress={handleConfirmLogout}
              disabled={loggingOut || logoutText.trim().toUpperCase() !== "SIGN OUT" || logoutCountdown > 0}
              activeOpacity={0.8}
            >
              <LinearGradient colors={["#636366", "#3A3A3C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalBtnGradient}>
                {loggingOut
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.modalBtnText}>
                      {logoutCountdown > 0 ? `Wait ${logoutCountdown}s…` : "Sign Out of This Device"}
                    </Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </GlassCard>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 24, gap: 28 },

  mfaCard: { borderRadius: 20, overflow: "hidden", padding: 0 },
  mfaInner: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, paddingBottom: 12 },
  mfaIconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  mfaTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  mfaSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  mfaDot: { width: 10, height: 10, borderRadius: 5 },
  mfaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    marginHorizontal: 18, marginBottom: 14, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1,
  },
  mfaBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  footerNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18, paddingHorizontal: 8 },

  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.50)" },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(120,120,128,0.4)", alignSelf: "center", marginBottom: 4 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  input: { borderRadius: 14, borderWidth: 1, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  modalBtn: { borderRadius: 14, overflow: "hidden" },
  deleteBtnWrap: { borderRadius: 14, overflow: "hidden" },
  modalBtnGradient: { paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  modalBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  warningBox: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: "rgba(255,59,48,0.10)", borderRadius: 14, padding: 14 },
  warningText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  confirmLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },

  closureLink:     { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 20 },
  closureLinkText: { fontSize: 11, fontFamily: "Inter_400Regular", textDecorationLine: "underline", opacity: 0.45 },

  logoutChecklist: { gap: 10 },
  checklistRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  checklistText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  logoutContinueBtn: { borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: "center" },
  logoutContinueBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
