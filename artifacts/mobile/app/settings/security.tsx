import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
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
import { TwoFactorGate } from "@/components/ui/TwoFactorGate";
import Colors from "@/constants/colors";

// ─── Types ────────────────────────────────────────────────────────────────────
type MfaStatus = "loading" | "enabled" | "disabled";

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SecuritySettingsScreen() {
  const { colors } = useTheme();
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  // ── 2FA status ──────────────────────────────────────────────────────────────
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

  function openChangePassword() {
    setShowPwdGate(true);
  }

  async function handleChangePassword() {
    if (!newPwd || !confirmPwd) {
      showAlert("Missing fields", "Please fill all password fields.");
      return;
    }
    if (newPwd.length < 6) {
      showAlert("Weak password", "Password must be at least 6 characters.");
      return;
    }
    if (newPwd !== confirmPwd) {
      showAlert("Mismatch", "New passwords do not match.");
      return;
    }
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setChangingPwd(false);
    if (error) {
      showAlert("Error", error.message);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Success", "Your password has been updated.");
      setShowChangePwd(false);
      setNewPwd("");
      setConfirmPwd("");
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
        { data: profileData },
        { data: userPosts },
        { data: chatMemberships },
        { data: xpTransfers },
        { data: acoinTx },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase
          .from("posts")
          .select("id, content, created_at, view_count")
          .eq("author_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("chat_members").select("chat_id").eq("user_id", user.id),
        supabase
          .from("xp_transfers")
          .select("*")
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("acoin_transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        account: { email: user.email, created_at: user.created_at },
        profile: profileData,
        posts: userPosts || [],
        chats_count: chatMemberships?.length || 0,
        nexa_transfers: xpTransfers || [],
        acoin_transactions: acoinTx || [],
      };

      const json = JSON.stringify(exportData, null, 2);

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `afuchat_data_${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showAlert("Downloaded", "Your data has been downloaded.");
      } else {
        const fileUri =
          (FileSystem as any).documentDirectory +
          `afuchat_data_${new Date().toISOString().split("T")[0]}.json`;
        await FileSystem.writeAsStringAsync(fileUri, json);
        try {
          const Sharing = await import("expo-sharing");
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, { mimeType: "application/json" });
          } else {
            showAlert("Saved", `Data saved to ${fileUri}`);
          }
        } catch {
          showAlert("Saved", `Data saved to ${fileUri}`);
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      showAlert("Error", "Failed to download data. Please try again.");
    }
    setDownloading(false);
  }

  // ── Delete account ────────────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteGate, setShowDeleteGate] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (deleteText !== "DELETE") {
      showAlert("Confirmation required", 'Type "DELETE" to confirm.');
      return;
    }
    setDeleting(true);
    try {
      if (user) {
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30);
        await supabase
          .from("profiles")
          .update({
            scheduled_deletion_at: deletionDate.toISOString(),
            expo_push_token: null,
          })
          .eq("id", user.id);
      }
      await signOut();
      showAlert(
        "Account Scheduled for Deletion",
        "Your account will be permanently deleted after 30 days. Log back in within that period to restore it."
      );
      router.replace("/(auth)/login");
    } catch {
      showAlert("Error", "Failed to schedule account deletion. Please try again.");
    }
    setDeleting(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
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
          onPress={() => router.back()}
          hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Security & Data</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Security ─────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SECURITY</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          {/* 2FA */}
          <TouchableOpacity
            style={styles.row}
            onPress={() => { loadMfaStatus(); router.push("/settings/two-factor" as any); }}
          >
            <View style={[styles.rowIcon, { backgroundColor: "#5856D6" }]}>
              <Ionicons name="shield-half-outline" size={18} color="#fff" />
            </View>
            <View style={styles.rowMeta}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>
                Two-Factor Authentication
              </Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                {mfaStatus === "loading"
                  ? "Checking…"
                  : mfaStatus === "enabled"
                  ? "Enabled — your account is protected"
                  : "Disabled — tap to enable"}
              </Text>
            </View>
            <View style={styles.rowRight}>
              {mfaStatus === "loading" ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        mfaStatus === "enabled" ? "#30D158" : colors.textMuted,
                    },
                  ]}
                />
              )}
              <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
            </View>
          </TouchableOpacity>

          <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 60 }]} />

          {/* Change Password */}
          <TouchableOpacity style={styles.row} onPress={openChangePassword}>
            <View style={[styles.rowIcon, { backgroundColor: "#007AFF" }]}>
              <Ionicons name="key-outline" size={18} color="#fff" />
            </View>
            <Text style={[styles.rowLabel, { flex: 1, color: colors.text }]}>
              Change Password
            </Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 60 }]} />

          {/* Device Security */}
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/device-security" as any)}
          >
            <View style={[styles.rowIcon, { backgroundColor: "#34C759" }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
            </View>
            <View style={styles.rowMeta}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Device Security</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                PIN lock, biometrics, trusted devices
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Your Data ────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR DATA</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setShowDownloadGate(true)}
            disabled={downloading}
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
              {downloading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="download-outline" size={18} color="#fff" />
              )}
            </View>
            <View style={styles.rowMeta}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Download My Data</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Export profile, posts, contacts & transactions
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Danger Zone ───────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>DANGER ZONE</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setShowDeleteGate(true)}
          >
            <View style={[styles.rowIcon, { backgroundColor: "#FF3B30" }]}>
              <Ionicons name="trash-outline" size={18} color="#fff" />
            </View>
            <Text style={[styles.rowLabel, { flex: 1, color: "#FF3B30" }]}>
              Delete Account
            </Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.footerNote, { color: colors.textMuted }]}>
          Deleted accounts are held for 30 days. Log back in during this period to restore your account.
        </Text>
      </ScrollView>

      {/* ── 2FA gate — Change Password ─────────────────────────────────────── */}
      <TwoFactorGate
        visible={showPwdGate}
        title="Verify Your Identity"
        subtitle="Two-factor authentication is required before changing your password."
        onSuccess={() => {
          setShowPwdGate(false);
          setNewPwd("");
          setConfirmPwd("");
          setShowChangePwd(true);
        }}
        onDismiss={() => setShowPwdGate(false)}
      />

      {/* ── 2FA gate — Download Data ────────────────────────────────────────── */}
      <TwoFactorGate
        visible={showDownloadGate}
        title="Verify Your Identity"
        subtitle="Confirm your identity before exporting your account data."
        onSuccess={() => {
          setShowDownloadGate(false);
          handleDownloadData();
        }}
        onDismiss={() => setShowDownloadGate(false)}
      />

      {/* ── 2FA gate — Delete Account ───────────────────────────────────────── */}
      <TwoFactorGate
        visible={showDeleteGate}
        title="Verify Your Identity"
        subtitle="Two-factor authentication is required before deleting your account."
        onSuccess={() => {
          setShowDeleteGate(false);
          setDeleteText("");
          setShowDeleteModal(true);
        }}
        onDismiss={() => setShowDeleteGate(false)}
      />

      {/* ── Change Password modal ──────────────────────────────────────────── */}
      <Modal visible={showChangePwd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Change Password
              </Text>
              <TouchableOpacity onPress={() => setShowChangePwd(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, backgroundColor: colors.inputBg },
              ]}
              placeholder="New password"
              placeholderTextColor={colors.textMuted}
              value={newPwd}
              onChangeText={setNewPwd}
              secureTextEntry
            />
            <TextInput
              style={[
                styles.input,
                { color: colors.text, backgroundColor: colors.inputBg },
              ]}
              placeholder="Confirm new password"
              placeholderTextColor={colors.textMuted}
              value={confirmPwd}
              onChangeText={setConfirmPwd}
              secureTextEntry
            />
            <TouchableOpacity
              style={[
                styles.modalBtn,
                { backgroundColor: colors.accent },
                changingPwd && { opacity: 0.6 },
              ]}
              onPress={handleChangePassword}
              disabled={changingPwd}
            >
              {changingPwd ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalBtnText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Delete Account modal ───────────────────────────────────────────── */}
      <Modal visible={showDeleteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: "#FF3B30" }]}>
                Delete Account
              </Text>
              <TouchableOpacity onPress={() => setShowDeleteModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View
              style={[
                styles.warningBox,
                { backgroundColor: "rgba(255,59,48,0.08)" },
              ]}
            >
              <Ionicons name="warning" size={22} color="#FF3B30" />
              <Text style={[styles.warningText, { color: colors.text }]}>
                Your account will be deactivated immediately and permanently deleted
                after 30 days. All posts, messages, and data will be removed.
              </Text>
            </View>
            <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>
              Type DELETE to confirm:
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, backgroundColor: colors.inputBg },
              ]}
              placeholder='Type "DELETE"'
              placeholderTextColor={colors.textMuted}
              value={deleteText}
              onChangeText={setDeleteText}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[
                styles.deleteBtn,
                (deleting || deleteText !== "DELETE") && { opacity: 0.4 },
              ]}
              onPress={handleDeleteAccount}
              disabled={deleting || deleteText !== "DELETE"}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalBtnText}>Delete Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
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

  body: { paddingHorizontal: 16, paddingTop: 24, gap: 10 },

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
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  sep: { height: StyleSheet.hairlineWidth },

  footerNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
    marginTop: 4,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 14,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  modalBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: Colors.brand,
  },
  deleteBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#FF3B30",
  },
  modalBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    padding: 14,
  },
  warningText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  confirmLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
