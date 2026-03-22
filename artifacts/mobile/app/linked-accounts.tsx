import React, { useEffect, useState } from "react";
import {
  Alert,
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

type LinkedAccount = {
  id: string;
  email: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_current: boolean;
};

export default function LinkedAccountsScreen() {
  const { colors } = useTheme();
  const { profile, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const isPremium = !!profile?.is_premium;

  useEffect(() => {
    if (!isPremium) {
      Alert.alert("Premium Required", "Linked accounts is a premium feature.", [
        { text: "Go Back", onPress: () => router.back() },
        { text: "Upgrade", onPress: () => { router.back(); setTimeout(() => router.push("/premium"), 300); } },
      ]);
      return;
    }
    if (user && profile) {
      setAccounts([
        {
          id: user.id,
          email: user.email || "",
          display_name: profile.display_name,
          handle: profile.handle,
          avatar_url: profile.avatar_url,
          is_current: true,
        },
      ]);
    }
  }, [user, profile, isPremium]);

  function handleLinkAccount() {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Please enter email and password for the account to link.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "Link Account",
      "To switch to another account, you'll need to sign out and sign in with the other account's credentials. This keeps your session secure.\n\nWould you like to sign out now?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out & Switch",
          onPress: async () => {
            const { signOut } = useAuth();
            await signOut();
            router.replace("/(auth)/login");
          },
        },
      ]
    );
    setEmail("");
    setPassword("");
    setShowAdd(false);
  }

  function handleSwitchAccount(account: LinkedAccount) {
    if (account.is_current) return;
    Alert.alert(
      "Switch Account",
      `To switch to @${account.handle}, you need to sign out and sign in with that account. This keeps your sessions secure.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "OK", style: "default" },
      ]
    );
  }

  function handleRemoveAccount(account: LinkedAccount) {
    if (account.is_current) {
      Alert.alert("Cannot Remove", "You cannot remove the currently active account.");
      return;
    }
    Alert.alert("Remove Account", `Remove @${account.handle} from linked accounts?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setAccounts((prev) => prev.filter((a) => a.id !== account.id));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.infoCard, { backgroundColor: Colors.brand + "10" }]}>
          <Ionicons name="information-circle" size={20} color={Colors.brand} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Link multiple AfuChat accounts. To switch accounts securely, sign out and sign in with the other account.
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
              <Text style={[styles.accountEmail, { color: colors.textMuted }]}>{account.email}</Text>
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
            <Text style={[styles.addFormTitle, { color: colors.text }]}>Add an Account</Text>
            <Text style={[styles.addFormNote, { color: colors.textMuted }]}>
              Enter the credentials of the account you want to link. You'll need to sign out to switch.
            </Text>
            <TextInput
              style={[styles.addInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              placeholder="Email address"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={[styles.addInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <View style={styles.addFormActions}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => { setShowAdd(false); setEmail(""); setPassword(""); }}>
                <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkBtn} onPress={handleLinkAccount}>
                <Text style={styles.linkBtnText}>Link Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={[styles.footerNote, { color: colors.textMuted }]}>
          For security, account switching requires sign-out. Your data remains safe across all linked accounts.
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
  accountEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
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
