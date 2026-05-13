import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import * as Haptics from "@/lib/haptics";
import * as FileSystem from "expo-file-system";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassMenuSection, GlassMenuItem, GlassMenuSeparator } from "@/components/ui/GlassMenuItem";
import { TwoFactorGate } from "@/components/ui/TwoFactorGate";
import Colors from "@/constants/colors";

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SecuritySettingsScreen() {
  const { colors, isDark } = useTheme();
  const { user, signOut } = useAuth();
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

  // ── Download data ────────────────────────────────────────────────────────────
  const [showDownloadGate, setShowDownloadGate] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadData() {
    if (!user) return;
    setDownloading(true);
    try {
      const [
        { data: profileData }, { data: userPosts }, { data: chatMemberships },
        { data: xpTransfers }, { data: acoinTx },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("posts").select("id, content, created_at, view_count").eq("author_id", user.id).order("created_at", { ascending: false }),
        supabase.from("chat_members").select("chat_id").eq("user_id", user.id),
        supabase.from("xp_transfers").select("*").or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(100),
        supabase.from("acoin_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      ]);
      const exportData = {
        exported_at: new Date().toISOString(),
        account: { email: user.email, created_at: user.created_at },
        profile: profileData, posts: userPosts || [],
        chats_count: chatMemberships?.length || 0,
        nexa_transfers: xpTransfers || [], acoin_transactions: acoinTx || [],
      };
      const json = JSON.stringify(exportData, null, 2);
      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `afuchat_data_${new Date().toISOString().split("T")[0]}.json`; a.click();
        URL.revokeObjectURL(url); showAlert("Downloaded", "Your data has been downloaded.");
      } else {
        const fileUri = (FileSystem as any).documentDirectory + `afuchat_data_${new Date().toISOString().split("T")[0]}.json`;
        await FileSystem.writeAsStringAsync(fileUri, json);
        try {
          const Sharing = await import("expo-sharing");
          if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(fileUri, { mimeType: "application/json" }); }
          else { showAlert("Saved", `Data saved to ${fileUri}`); }
        } catch { showAlert("Saved", `Data saved to ${fileUri}`); }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { showAlert("Error", "Failed to download data. Please try again."); }
    setDownloading(false);
  }

  // ── Delete account ────────────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteGate, setShowDeleteGate] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (deleteText !== "DELETE") { showAlert("Confirmation required", 'Type "DELETE" to confirm.'); return; }
    setDeleting(true);
    try {
      if (user) {
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30);
        await supabase.from("profiles").update({ scheduled_deletion_at: deletionDate.toISOString(), expo_push_token: null }).eq("id", user.id);
      }
      await signOut();
      showAlert("Account Scheduled for Deletion", "Your account will be permanently deleted after 30 days. Log back in within that period to restore it.");
      router.replace("/(auth)/login");
    } catch { showAlert("Error", "Failed to schedule account deletion. Please try again."); }
    setDeleting(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Security & Data" />

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
                name={mfaStatus === "enabled" ? "shield-checkmark" : "shield-outline"}
                size={28}
                color={mfaStatus === "enabled" ? "#30D158" : colors.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.mfaTitle, { color: colors.text }]}>
                Two-Factor Authentication
              </Text>
              <Text style={[styles.mfaSub, { color: mfaStatus === "enabled" ? "#30D158" : colors.textMuted }]}>
                {mfaStatus === "loading" ? "Checking status…"
                  : mfaStatus === "enabled" ? "Active — your account is protected"
                  : "Disabled — add extra security"}
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
              {mfaStatus === "enabled" ? "Manage 2FA" : "Enable 2FA"}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={mfaStatus === "enabled" ? "#30D158" : colors.accent} />
          </TouchableOpacity>
        </GlassCard>

        {/* ── SECURITY ─────────────────────────────────────────────────── */}
        <GlassMenuSection title="SECURITY">
          <GlassMenuItem
            icon="key-outline"
            label="Change Password"
            subtitle="Update your account password"
            onPress={() => setShowPwdGate(true)}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="shield-checkmark-outline"
            label="Device Security"
            subtitle="PIN lock, biometrics, trusted devices"
            onPress={() => router.push("/device-security" as any)}
          />
        </GlassMenuSection>

        {/* ── YOUR DATA ────────────────────────────────────────────────── */}
        <GlassMenuSection title="YOUR DATA">
          <GlassMenuItem
            icon="download-outline"
            label="Download My Data"
            subtitle="Export profile, posts, contacts & transactions"
            onPress={() => setShowDownloadGate(true)}
            loading={downloading}
          />
        </GlassMenuSection>

        {/* ── DANGER ZONE ───────────────────────────────────────────────── */}
        <GlassMenuSection title="DANGER ZONE">
          <GlassMenuItem
            icon="trash-outline"
            label="Delete Account"
            danger
            noChevron={false}
            onPress={() => setShowDeleteGate(true)}
          />
        </GlassMenuSection>

        <Text style={[styles.footerNote, { color: colors.textMuted }]}>
          Deleted accounts are held for 30 days. Log back in during this period to restore your account.
        </Text>
      </ScrollView>

      {/* ── 2FA gates ───────────────────────────────────────────────────── */}
      <TwoFactorGate
        visible={showPwdGate}
        title="Verify Your Identity"
        subtitle="2FA is required before changing your password."
        onSuccess={() => { setShowPwdGate(false); setNewPwd(""); setConfirmPwd(""); setShowChangePwd(true); }}
        onDismiss={() => setShowPwdGate(false)}
      />
      <TwoFactorGate
        visible={showDownloadGate}
        title="Verify Your Identity"
        subtitle="Confirm your identity before exporting your data."
        onSuccess={() => { setShowDownloadGate(false); handleDownloadData(); }}
        onDismiss={() => setShowDownloadGate(false)}
      />
      <TwoFactorGate
        visible={showDeleteGate}
        title="Verify Your Identity"
        subtitle="2FA is required before deleting your account."
        onSuccess={() => { setShowDeleteGate(false); setDeleteText(""); setShowDeleteModal(true); }}
        onDismiss={() => setShowDeleteGate(false)}
      />

      {/* ── Change Password modal ──────────────────────────────────────── */}
      <Modal visible={showChangePwd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <GlassCard style={styles.modalSheet} variant="strong">
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Change Password</Text>
              <TouchableOpacity onPress={() => setShowChangePwd(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { color: colors.text, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", borderColor: colors.border }]}
              placeholder="New password" placeholderTextColor={colors.textMuted} value={newPwd} onChangeText={setNewPwd} secureTextEntry />
            <TextInput style={[styles.input, { color: colors.text, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", borderColor: colors.border }]}
              placeholder="Confirm new password" placeholderTextColor={colors.textMuted} value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry />
            <TouchableOpacity style={[styles.modalBtn, changingPwd && { opacity: 0.6 }]} onPress={handleChangePassword} disabled={changingPwd} activeOpacity={0.8}>
              <LinearGradient colors={["#00BCD4", "#0097A7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalBtnGradient}>
                {changingPwd ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Update Password</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </Modal>

      {/* ── Delete Account modal ───────────────────────────────────────── */}
      <Modal visible={showDeleteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <GlassCard style={styles.modalSheet} variant="strong">
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: "#FF3B30" }]}>Delete Account</Text>
              <TouchableOpacity onPress={() => setShowDeleteModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.warningBox}>
              <Ionicons name="warning" size={22} color="#FF3B30" />
              <Text style={[styles.warningText, { color: colors.text }]}>
                Your account will be deactivated immediately and permanently deleted after 30 days. All posts, messages, and data will be removed.
              </Text>
            </View>
            <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>Type DELETE to confirm:</Text>
            <TextInput style={[styles.input, { color: colors.text, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", borderColor: colors.border }]}
              placeholder='Type "DELETE"' placeholderTextColor={colors.textMuted} value={deleteText} onChangeText={setDeleteText} autoCapitalize="characters" />
            <TouchableOpacity
              style={[styles.deleteBtnWrap, (deleting || deleteText !== "DELETE") && { opacity: 0.4 }]}
              onPress={handleDeleteAccount} disabled={deleting || deleteText !== "DELETE"} activeOpacity={0.8}
            >
              <LinearGradient colors={["#FF3B30", "#CC2B22"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalBtnGradient}>
                {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Delete Account</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </GlassCard>
        </View>
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
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, gap: 14 },
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

  showDeleteGate: {},
});
