import React, { useCallback, useEffect, useState } from "react";
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
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

type LinkedAccount = {
  id: string;
  linked_user_id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_current: boolean;
};

export default function LinkedAccountsScreen() {
  const { colors } = useTheme();
  const { profile, user, isPremium, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [linkHandle, setLinkHandle] = useState("");
  const [linking, setLinking] = useState(false);

  const loadLinkedAccounts = useCallback(async () => {
    if (!user || !profile) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("linked_accounts")
      .select("id, linked_user_id")
      .eq("primary_user_id", user.id);

    const linked: LinkedAccount[] = [
      {
        id: "current",
        linked_user_id: user.id,
        display_name: profile.display_name,
        handle: profile.handle,
        avatar_url: profile.avatar_url,
        is_current: true,
      },
    ];

    if (data && data.length > 0) {
      const userIds = data.map((r: any) => r.linked_user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url")
        .in("id", userIds);

      if (profiles) {
        for (const row of data) {
          const p = profiles.find((pr: any) => pr.id === row.linked_user_id);
          if (p) {
            linked.push({
              id: row.id,
              linked_user_id: row.linked_user_id,
              display_name: p.display_name,
              handle: p.handle,
              avatar_url: p.avatar_url,
              is_current: false,
            });
          }
        }
      }
    }

    if (error) {
      showAlert("Error", "Could not load linked accounts.");
    }

    setAccounts(linked);
    setLoading(false);
  }, [user, profile]);

  useEffect(() => {
    if (!isPremium) {
      setLoading(false);
      return;
    }
    loadLinkedAccounts();
  }, [isPremium, loadLinkedAccounts]);

  async function handleLinkAccount() {
    if (!linkHandle.trim() || !user) {
      showAlert("Missing field", "Please enter the @handle of the account you want to link.");
      return;
    }
    setLinking(true);

    const handle = linkHandle.trim().toLowerCase().replace(/^@/, "");

    const { data: targetProfile, error: lookupErr } = await supabase
      .from("profiles")
      .select("id, display_name, handle")
      .eq("handle", handle)
      .single();

    if (lookupErr || !targetProfile) {
      showAlert("Not Found", `No account found with handle @${handle}.`);
      setLinking(false);
      return;
    }

    if (targetProfile.id === user.id) {
      showAlert("Same Account", "You can't link your own account.");
      setLinking(false);
      return;
    }

    const existing = accounts.find((a) => a.linked_user_id === targetProfile.id);
    if (existing) {
      showAlert("Already Linked", `@${handle} is already linked.`);
      setLinking(false);
      return;
    }

    const { error: linkErr } = await supabase.from("linked_accounts").insert({
      primary_user_id: user.id,
      linked_user_id: targetProfile.id,
    });

    if (linkErr) {
      if (linkErr.code === "23505") {
        showAlert("Already Linked", "This account is already linked.");
      } else {
        showAlert("Error", linkErr.message);
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Linked!", `@${targetProfile.handle} has been linked. Sign out and sign in with that account to switch.`);
      loadLinkedAccounts();
    }

    setLinkHandle("");
    setShowAdd(false);
    setLinking(false);
  }

  function handleSwitchAccount(account: LinkedAccount) {
    if (account.is_current) return;
    showAlert(
      "Switch Account",
      `To switch to @${account.handle}, sign out and sign in with that account's credentials.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out & Switch",
          onPress: async () => {
            await signOut();
            router.replace("/(auth)/login");
          },
        },
      ]
    );
  }

  async function handleRemoveAccount(account: LinkedAccount) {
    if (account.is_current) {
      showAlert("Cannot Remove", "You cannot remove the currently active account.");
      return;
    }
    showAlert("Remove Account", `Remove @${account.handle} from linked accounts?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("linked_accounts").delete().eq("id", account.id);
          if (error) {
            showAlert("Error", error.message);
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            loadLinkedAccounts();
          }
        },
      },
    ]);
  }

  if (!isPremium) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Linked Accounts</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.premiumGate}>
          <Ionicons name="diamond" size={48} color="#FFD60A" />
          <Text style={[styles.premiumGateTitle, { color: colors.text }]}>Premium Feature</Text>
          <Text style={[styles.premiumGateDesc, { color: colors.textSecondary }]}>
            Upgrade to AfuChat Premium to link and switch between multiple accounts.
          </Text>
          <TouchableOpacity style={styles.upgradeBtn} onPress={() => router.push("/premium")}>
            <Text style={styles.upgradeBtnText}>Upgrade to Premium</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Linked Accounts</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={[styles.infoCard, { backgroundColor: Colors.brand + "10" }]}>
            <Ionicons name="information-circle" size={20} color={Colors.brand} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Link accounts by entering their @handle. To switch, sign out and sign in with that account's credentials.
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Accounts</Text>

          {accounts.map((account) => (
            <TouchableOpacity
              key={account.id}
              style={[styles.accountCard, { backgroundColor: colors.surface, borderColor: account.is_current ? Colors.brand : colors.border }]}
              onPress={() => handleSwitchAccount(account)}
              onLongPress={() => handleRemoveAccount(account)}
              activeOpacity={0.7}
            >
              <Avatar uri={account.avatar_url} name={account.display_name} size={48} />
              <View style={{ flex: 1 }}>
                <View style={styles.accountNameRow}>
                  <Text style={[styles.accountName, { color: colors.text }]}>{account.display_name}</Text>
                  {account.is_current && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>ACTIVE</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.accountHandle, { color: colors.textSecondary }]}>@{account.handle}</Text>
              </View>
              {!account.is_current && (
                <TouchableOpacity onPress={() => handleRemoveAccount(account)}>
                  <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}

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
              <Text style={[styles.addFormTitle, { color: colors.text }]}>Link an Account</Text>
              <Text style={[styles.addFormNote, { color: colors.textMuted }]}>
                Enter the @handle of the account you want to link.
              </Text>
              <TextInput
                style={[styles.addInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                placeholder="@handle"
                placeholderTextColor={colors.textMuted}
                value={linkHandle}
                onChangeText={setLinkHandle}
                autoCapitalize="none"
              />
              <View style={styles.addFormActions}>
                <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => { setShowAdd(false); setLinkHandle(""); }}>
                  <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.linkBtn, linking && { opacity: 0.6 }]} onPress={handleLinkAccount} disabled={linking}>
                  {linking ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.linkBtnText}>Link</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={[styles.footerNote, { color: colors.textMuted }]}>
            For security, account switching requires sign-out. Your data remains safe across all linked accounts.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { padding: 20, gap: 16 },
  premiumGate: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  premiumGateTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  premiumGateDesc: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  upgradeBtn: { backgroundColor: "#FFD60A", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  upgradeBtnText: { color: "#000", fontSize: 16, fontFamily: "Inter_700Bold" },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  accountCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  accountNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  accountName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  accountHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  currentBadge: { backgroundColor: Colors.brand, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  currentBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
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
