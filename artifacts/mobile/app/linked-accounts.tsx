import React, { useState } from "react";
import {
  ActivityIndicator,
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
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

export default function LinkedAccountsScreen() {
  const { colors } = useTheme();
  const { user, profile, linkedAccounts, addAccount, switchAccount, removeAccount } = useAuth();
  const insets = useSafeAreaInsets();
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [linking, setLinking] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  async function handleAddAccount() {
    if (!email.trim() || !password.trim()) {
      showAlert("Missing fields", "Please enter email and password.");
      return;
    }
    setLinking(true);

    const result = await addAccount(email.trim(), password.trim());

    setLinking(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Account Added", "You can now switch between accounts instantly.");
      setEmail("");
      setPassword("");
      setShowAdd(false);
    } else {
      showAlert("Login Failed", result.error || "Could not authenticate. Check your credentials.");
    }
  }

  async function handleSwitch(userId: string) {
    if (userId === user?.id) return;
    setSwitching(userId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await switchAccount(userId);
    setSwitching(null);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      showAlert("Switch Failed", result.error || "Could not switch account.");
    }
  }

  async function handleRemove(userId: string) {
    if (userId === user?.id) {
      showAlert("Cannot Remove", "You cannot remove the currently active account.");
      return;
    }
    showAlert("Remove Account", "Remove this account from the quick-switch list?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await removeAccount(userId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Switch Accounts</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.infoCard, { backgroundColor: Colors.brand + "10" }]}>
          <Ionicons name="swap-horizontal" size={20} color={Colors.brand} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Add accounts with their email and password. Switch instantly without logging out.
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Accounts</Text>

        {linkedAccounts.map((account) => {
          const isCurrent = account.userId === user?.id;
          const isSwitching = switching === account.userId;
          return (
            <TouchableOpacity
              key={account.userId}
              style={[styles.accountCard, { backgroundColor: colors.surface, borderColor: isCurrent ? Colors.brand : colors.border }]}
              onPress={() => handleSwitch(account.userId)}
              disabled={isCurrent || !!switching}
              activeOpacity={0.7}
            >
              <Avatar uri={account.avatarUrl} name={account.displayName} size={48} />
              <View style={{ flex: 1 }}>
                <View style={styles.accountNameRow}>
                  <Text style={[styles.accountName, { color: colors.text }]}>{account.displayName}</Text>
                  {isCurrent && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>ACTIVE</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.accountHandle, { color: colors.textSecondary }]}>@{account.handle}</Text>
                <Text style={[styles.accountEmail, { color: colors.textMuted }]}>{account.email}</Text>
              </View>
              {isSwitching ? (
                <ActivityIndicator color={Colors.brand} />
              ) : isCurrent ? null : (
                <View style={styles.switchActions}>
                  <TouchableOpacity style={styles.switchBtn} onPress={() => handleSwitch(account.userId)}>
                    <Ionicons name="swap-horizontal" size={18} color={Colors.brand} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemove(account.userId)}>
                    <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {linkedAccounts.length === 0 && user && profile && (
          <View style={[styles.accountCard, { backgroundColor: colors.surface, borderColor: Colors.brand }]}>
            <Avatar uri={profile.avatar_url} name={profile.display_name} size={48} />
            <View style={{ flex: 1 }}>
              <View style={styles.accountNameRow}>
                <Text style={[styles.accountName, { color: colors.text }]}>{profile.display_name}</Text>
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>ACTIVE</Text>
                </View>
              </View>
              <Text style={[styles.accountHandle, { color: colors.textSecondary }]}>@{profile.handle}</Text>
            </View>
          </View>
        )}

        {!showAdd ? (
          <TouchableOpacity
            style={[styles.addBtn, { borderColor: colors.border }]}
            onPress={() => setShowAdd(true)}
          >
            <Ionicons name="add-circle-outline" size={22} color={Colors.brand} />
            <Text style={[styles.addBtnText, { color: Colors.brand }]}>Add Another Account</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.addForm, { backgroundColor: colors.surface }]}>
            <Text style={[styles.addFormTitle, { color: colors.text }]}>Add Account</Text>
            <Text style={[styles.addFormNote, { color: colors.textMuted }]}>
              Sign in with the email and password of the account you want to add.
            </Text>
            <TextInput
              style={[styles.addInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              placeholder="Email address"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TextInput
              style={[styles.addInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
            />
            <View style={styles.addFormActions}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => { setShowAdd(false); setEmail(""); setPassword(""); }}>
                <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.linkBtn, linking && { opacity: 0.6 }]} onPress={handleAddAccount} disabled={linking}>
                {linking ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.linkBtnText}>Add & Connect</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={[styles.footerNote, { color: colors.textMuted }]}>
          Sessions are stored on your device. Tap any account to switch instantly.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { padding: 20, gap: 16 },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  accountCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  accountNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  accountName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  accountHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  accountEmail: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  currentBadge: { backgroundColor: Colors.brand, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  currentBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  switchActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  switchBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brand + "15", alignItems: "center", justifyContent: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
  addBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  addForm: { padding: 20, borderRadius: 14, gap: 14 },
  addFormTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  addFormNote: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  addInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  addFormActions: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  linkBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: Colors.brand, alignItems: "center", justifyContent: "center" },
  linkBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  footerNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
