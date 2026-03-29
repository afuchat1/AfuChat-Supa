import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { Platform } from "react-native";

export default function SecuritySettingsScreen() {
  const { colors } = useTheme();
  const { user, profile, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [downloading, setDownloading] = useState(false);

  async function handleChangePassword() {
    if (!newPwd || !confirmPwd) {
      showAlert("Missing fields", "Please fill all password fields.");
      return;
    }
    if (newPwd.length < 6) {
      showAlert("Weak password", "New password must be at least 6 characters.");
      return;
    }
    if (newPwd !== confirmPwd) {
      showAlert("Mismatch", "New passwords do not match.");
      return;
    }
    setChangingPwd(true);

    const { error } = await supabase.auth.updateUser({ password: newPwd });

    if (error) {
      showAlert("Error", error.message);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Success", "Your password has been updated.");
      setShowChangePassword(false);
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    }
    setChangingPwd(false);
  }

  async function handleDownloadData() {
    if (!user) return;
    setDownloading(true);

    try {
      const [
        { data: profileData },
        { data: moments },
        { data: conversations },
        { data: contacts },
        { data: xpTransfers },
        { data: acoinTx },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("moments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id),
        supabase.from("contacts").select("*").or(`user_id.eq.${user.id},contact_id.eq.${user.id}`),
        supabase.from("xp_transfers").select("*").or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(100),
        supabase.from("acoin_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        account: {
          email: user.email,
          created_at: user.created_at,
        },
        profile: profileData,
        posts: moments || [],
        conversations_count: conversations?.length || 0,
        contacts: contacts || [],
        nexa_transfers: xpTransfers || [],
        acoin_transactions: acoinTx || [],
      };

      const jsonString = JSON.stringify(exportData, null, 2);

      if (Platform.OS === "web") {
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `afuchat_data_${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showAlert("Downloaded", "Your data has been downloaded.");
      } else {
        const fileUri = FileSystem.documentDirectory + `afuchat_data_${new Date().toISOString().split("T")[0]}.json`;
        await FileSystem.writeAsStringAsync(fileUri, jsonString);
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
    } catch (err: any) {
      showAlert("Error", "Failed to download data. Please try again.");
    }
    setDownloading(false);
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") {
      showAlert("Confirmation required", 'Please type "DELETE" to confirm.');
      return;
    }
    setDeleting(true);

    try {
      if (user) {
        const deletionDate = new Date();
        deletionDate.setDate(deletionDate.getDate() + 30);

        await supabase.from("profiles").update({
          scheduled_deletion_at: deletionDate.toISOString(),
          expo_push_token: null,
        }).eq("id", user.id);
      }

      await signOut();
      showAlert(
        "Account Scheduled for Deletion",
        "Your account will be permanently deleted after 30 days. If you change your mind, simply log back in to restore it."
      );
      router.replace("/(auth)/login");
    } catch (err: any) {
      showAlert("Error", "Failed to schedule account deletion. Please try again.");
    }
    setDeleting(false);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Security & Data</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SECURITY</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.menuItem} onPress={() => setShowChangePassword(true)}>
            <View style={[styles.menuIcon, { backgroundColor: "#007AFF" }]}>
              <Ionicons name="key-outline" size={18} color="#fff" />
            </View>
            <Text style={[styles.menuLabel, { color: colors.text }]}>Change Password</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 54 }]} />

          <View style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: "#5856D6" }]}>
              <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.text }]}>Two-Factor Authentication</Text>
              <Text style={[styles.menuSub, { color: colors.textMuted }]}>Coming soon</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.inputBg }]}>
              <Text style={[styles.badgeText, { color: colors.textMuted }]}>SOON</Text>
            </View>
          </View>

          <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 54 }]} />

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push("/device-security" as any)}>
            <View style={[styles.menuIcon, { backgroundColor: "#34C759" }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.text }]}>Device Security</Text>
              <Text style={[styles.menuSub, { color: colors.textMuted }]}>Manage devices, PIN lock, biometrics</Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>YOUR DATA</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.menuItem} onPress={handleDownloadData} disabled={downloading}>
            <View style={[styles.menuIcon, { backgroundColor: Colors.brand }]}>
              {downloading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="download-outline" size={18} color="#fff" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.text }]}>Download My Data</Text>
              <Text style={[styles.menuSub, { color: colors.textMuted }]}>Export profile, posts, contacts & transactions</Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>DANGER ZONE</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              showAlert("Sign Out", "Are you sure you want to sign out?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign Out",
                  style: "destructive",
                  onPress: async () => {
                    await signOut();
                    router.replace("/(auth)/login");
                  },
                },
              ]);
            }}
          >
            <View style={[styles.menuIcon, { backgroundColor: "#FF9500" }]}>
              <Ionicons name="log-out-outline" size={18} color="#fff" />
            </View>
            <Text style={[styles.menuLabel, { color: "#FF9500" }]}>Sign Out</Text>
          </TouchableOpacity>

          <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 54 }]} />

          <TouchableOpacity style={styles.menuItem} onPress={() => setShowDeleteAccount(true)}>
            <View style={[styles.menuIcon, { backgroundColor: "#FF3B30" }]}>
              <Ionicons name="trash-outline" size={18} color="#fff" />
            </View>
            <Text style={[styles.menuLabel, { color: "#FF3B30" }]}>Delete Account</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.dangerNote, { color: colors.textMuted }]}>
          Your data will be stored for 30 days after deletion. Log back in within that period to restore your account. After 30 days, all data is permanently removed.
        </Text>
      </ScrollView>

      <Modal visible={showChangePassword} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Change Password</Text>
              <TouchableOpacity onPress={() => setShowChangePassword(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              placeholder="New password"
              placeholderTextColor={colors.textMuted}
              value={newPwd}
              onChangeText={setNewPwd}
              secureTextEntry
            />
            <TextInput
              style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              placeholder="Confirm new password"
              placeholderTextColor={colors.textMuted}
              value={confirmPwd}
              onChangeText={setConfirmPwd}
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.actionBtn, changingPwd && { opacity: 0.6 }]}
              onPress={handleChangePassword}
              disabled={changingPwd}
            >
              {changingPwd ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeleteAccount} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: "#FF3B30" }]}>Delete Account</Text>
              <TouchableOpacity onPress={() => setShowDeleteAccount(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.warningBox]}>
              <Ionicons name="warning" size={24} color="#FF3B30" />
              <Text style={[styles.warningText, { color: colors.text }]}>
                Your account will be deactivated immediately and permanently deleted after 30 days. All your posts, contacts, messages, and data will be removed. You can restore your account by logging back in within the 30-day period.
              </Text>
            </View>
            <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>
              Type DELETE to confirm:
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              placeholder='Type "DELETE"'
              placeholderTextColor={colors.textMuted}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.deleteBtn, (deleting || deleteConfirmText !== "DELETE") && { opacity: 0.4 }]}
              onPress={handleDeleteAccount}
              disabled={deleting || deleteConfirmText !== "DELETE"}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>Delete Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 8 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginLeft: 16, marginTop: 12, marginBottom: 4 },
  section: { borderRadius: 14, overflow: "hidden" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 14,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  menuSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  sep: { height: StyleSheet.hairlineWidth },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  dangerNote: { fontSize: 12, fontFamily: "Inter_400Regular", paddingHorizontal: 16, lineHeight: 18, marginTop: 4 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 4 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  modalInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  actionBtn: { backgroundColor: Colors.brand, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  deleteBtn: { backgroundColor: "#FF3B30", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  actionBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "rgba(255,59,48,0.08)",
    borderRadius: 12,
    padding: 14,
  },
  warningText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  confirmLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
