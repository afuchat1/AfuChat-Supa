import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";

export default function LinkedAccountsScreen() {
  const { colors } = useTheme();
  const { user, profile, linkedAccounts, addAccount, switchAccount, removeAccount } = useAuth();
  const insets = useSafeAreaInsets();
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [linking, setLinking] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const formAnim = useRef(new Animated.Value(0)).current;

  function openForm() {
    setShowAdd(true);
    Animated.spring(formAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }).start();
  }

  function closeForm() {
    Animated.timing(formAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setShowAdd(false);
      setEmail("");
      setPassword("");
      setShowPw(false);
    });
  }

  async function handleAddAccount() {
    if (!email.trim() || !password.trim()) {
      showAlert("Missing fields", "Please enter your email and password.");
      return;
    }
    setLinking(true);
    const result = await addAccount(email.trim(), password.trim());
    setLinking(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeForm();
    } else {
      showAlert("Login Failed", result.error || "Could not authenticate. Check your credentials.");
    }
  }

  async function handleSwitch(userId: string) {
    if (userId === user?.id || switching) return;
    setSwitching(userId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await switchAccount(userId);
    setSwitching(null);
    if (!result.success) {
      showAlert("Switch Failed", result.error || "Could not switch account.");
    }
  }

  function handleRemove(userId: string) {
    if (userId === user?.id) {
      showAlert("Cannot Remove", "You cannot remove your currently active account.");
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

  const displayAccounts = linkedAccounts.length === 0 && user && profile
    ? [{ userId: user.id, displayName: profile.display_name, handle: profile.handle, avatarUrl: profile.avatar_url, email: "", accessToken: "", refreshToken: "" }]
    : linkedAccounts;

  const formTranslateY = formAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const formOpacity = formAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Accounts</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Account list */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          {displayAccounts.map((account, index) => {
            const isCurrent = account.userId === user?.id;
            const isSwitching = switching === account.userId;
            const isLast = index === displayAccounts.length - 1;

            return (
              <View key={account.userId}>
                <Pressable
                  style={({ pressed }) => [styles.accountRow, pressed && !isCurrent && { backgroundColor: colors.inputBg }]}
                  onPress={() => handleSwitch(account.userId)}
                  onLongPress={() => !isCurrent && handleRemove(account.userId)}
                  disabled={isCurrent || !!switching}
                >
                  {/* Avatar */}
                  <View style={styles.avatarWrap}>
                    <Avatar uri={account.avatarUrl} name={account.displayName} size={52} />
                    {isCurrent && (
                      <View style={[styles.activeIndicator, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </View>

                  {/* Info */}
                  <View style={styles.accountInfo}>
                    <Text style={[styles.accountName, { color: colors.text }]} numberOfLines={1}>
                      {account.displayName}
                    </Text>
                    <Text style={[styles.accountHandle, { color: colors.textMuted }]} numberOfLines={1}>
                      @{account.handle}
                    </Text>
                  </View>

                  {/* Right side */}
                  <View style={styles.accountRight}>
                    {isSwitching ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : isCurrent ? (
                      <Text style={[styles.activeLabel, { color: colors.accent }]}>Active</Text>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleRemove(account.userId)}
                        hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                </Pressable>

                {!isLast && (
                  <View style={[styles.separator, { backgroundColor: colors.border, marginLeft: 80 }]} />
                )}
              </View>
            );
          })}
        </View>

        {/* Add account button */}
        {!showAdd && (
          <TouchableOpacity
            style={[styles.addRow, { backgroundColor: colors.surface }]}
            onPress={openForm}
            activeOpacity={0.7}
          >
            <View style={[styles.addIconWrap, { backgroundColor: colors.accent }]}>
              <Ionicons name="add" size={20} color="#fff" />
            </View>
            <Text style={[styles.addRowText, { color: colors.text }]}>Add Account</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: "auto" }} />
          </TouchableOpacity>
        )}

        {/* Add account form */}
        {showAdd && (
          <Animated.View
            style={[
              styles.addForm,
              { backgroundColor: colors.surface, opacity: formOpacity, transform: [{ translateY: formTranslateY }] },
            ]}
          >
            <View style={styles.addFormHeader}>
              <Text style={[styles.addFormTitle, { color: colors.text }]}>Add Account</Text>
              <TouchableOpacity onPress={closeForm} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.addFormNote, { color: colors.textMuted }]}>
              Sign in with the credentials of the account you want to link.
            </Text>

            {/* Email */}
            <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Email address"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
              />
            </View>

            {/* Password */}
            <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                textContentType="password"
                autoComplete="password"
              />
              <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.accent }, linking && { opacity: 0.6 }]}
              onPress={handleAddAccount}
              disabled={linking}
              activeOpacity={0.8}
            >
              {linking
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitBtnText}>Sign In & Link</Text>
              }
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Footer hint */}
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Sessions are stored securely on this device.{"\n"}Long-press an account to remove it.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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

  body: { gap: 12, padding: 16 },

  section: { borderRadius: 16, overflow: "hidden" },

  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  avatarWrap: { position: "relative" },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  accountInfo: { flex: 1, gap: 2 },
  accountName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  accountHandle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  accountRight: { width: 48, alignItems: "flex-end", justifyContent: "center" },
  activeLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  separator: { height: StyleSheet.hairlineWidth },

  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
  },
  addIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addRowText: { fontSize: 16, fontFamily: "Inter_500Medium" },

  addForm: {
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  addFormHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addFormTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  addFormNote: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },

  submitBtn: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
});
