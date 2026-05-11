import React, { useEffect, useRef, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";

const MAX_ACCOUNTS_NON_ADMIN = 2;

export default function LinkedAccountsScreen() {
  const { colors, accent } = useTheme();
  const { user, profile, linkedAccounts, addAccount, switchAccount, removeAccount } = useAuth();
  const insets = useSafeAreaInsets();

  const { addNew } = useLocalSearchParams<{ addNew?: string }>();
  const isQuickAdd = addNew === "1";

  const [showAdd, setShowAdd] = useState(isQuickAdd);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [linking, setLinking] = useState(false);

  // Per-account switching state — maps userId → true while that switch is in-flight
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const formAnim = useRef(new Animated.Value(isQuickAdd ? 1 : 0)).current;

  useEffect(() => {
    if (isQuickAdd) {
      Animated.spring(formAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start();
    }
  }, []);

  function openForm() {
    setShowAdd(true);
    Animated.spring(formAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  }

  function closeForm() {
    Animated.timing(formAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
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
      showAlert("Account linked!", "You can now switch to it anytime.");
      if (isQuickAdd) {
        router.back();
      } else {
        closeForm();
      }
    } else {
      showAlert("Link Failed", result.error || "Could not authenticate. Check your credentials.");
    }
  }

  async function handleSwitch(userId: string) {
    if (userId === user?.id || switchingId) return;

    showAlert(
      "Switch account?",
      "Your current session will be saved and you'll switch to the selected account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            setSwitchingId(userId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const result = await switchAccount(userId);
            setSwitchingId(null);
            if (!result.success) {
              showAlert("Switch Failed", result.error || "Could not switch account. Please add it again.");
            }
            // On success, AuthContext navigates to /(tabs) — no action needed here.
          },
        },
      ]
    );
  }

  function handleRemove(userId: string, displayName: string) {
    if (userId === user?.id) {
      showAlert(
        "Cannot Remove",
        "You cannot remove your currently active account. Sign out first to remove it."
      );
      return;
    }
    showAlert(
      `Remove ${displayName}?`,
      "This removes the account from your quick-switch list. No data is deleted. You can add it back anytime.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeAccount(userId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }

  // Build the display list: always show the active account first, then others.
  const activeAccount = linkedAccounts.find((a) => a.userId === user?.id);
  const otherAccounts = linkedAccounts.filter((a) => a.userId !== user?.id);

  // If no stored accounts yet, synthesise one from the live profile
  const displayAccounts: typeof linkedAccounts =
    linkedAccounts.length === 0 && user && profile
      ? [
          {
            userId: user.id,
            displayName: profile.display_name,
            handle: profile.handle,
            avatarUrl: profile.avatar_url,
            email: "",
            accessToken: "",
            refreshToken: "",
          },
        ]
      : activeAccount
      ? [activeAccount, ...otherAccounts]
      : linkedAccounts;

  const isAdmin = profile?.is_admin ?? false;
  const atLimit = !isAdmin && linkedAccounts.length >= MAX_ACCOUNTS_NON_ADMIN;

  const formTranslateY = formAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const formOpacity = formAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const isBusy = !!switchingId || linking;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <GlassHeader title="Accounts" />

      {/* Full-screen dimmer + spinner shown during switch */}
      {switchingId && (
        <View style={styles.switchOverlay}>
          <View style={[styles.switchCard, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={[styles.switchingText, { color: colors.text }]}>
              Switching account…
            </Text>
            <Text style={[styles.switchingSub, { color: colors.textMuted }]}>
              Clearing data and loading your other account
            </Text>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        pointerEvents={isBusy ? "none" : "auto"}
      >
        {/* ── Account list ── */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          {displayAccounts.map((account, index) => {
            const isCurrent = account.userId === user?.id;
            const isSwitching = switchingId === account.userId;
            const isLast = index === displayAccounts.length - 1;

            return (
              <View key={account.userId}>
                <Pressable
                  style={({ pressed }) => [
                    styles.accountRow,
                    pressed && !isCurrent && !isBusy && { backgroundColor: colors.backgroundSecondary },
                  ]}
                  onPress={() => !isCurrent && !isBusy && handleSwitch(account.userId)}
                  disabled={isCurrent || isBusy}
                >
                  {/* Avatar */}
                  <View style={styles.avatarWrap}>
                    <Avatar uri={account.avatarUrl} name={account.displayName} size={52} />
                    {isCurrent && (
                      <View
                        style={[
                          styles.activeIndicator,
                          { backgroundColor: accent, borderColor: colors.surface },
                        ]}
                      >
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </View>

                  {/* Info */}
                  <View style={styles.accountInfo}>
                    <Text style={[styles.accountName, { color: colors.text }]} numberOfLines={1}>
                      {account.displayName}
                    </Text>
                    <Text
                      style={[styles.accountHandle, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      @{account.handle}
                    </Text>
                    {isCurrent && (
                      <Text style={[styles.activeLabel, { color: accent }]}>Active</Text>
                    )}
                  </View>

                  {/* Right action */}
                  <View style={styles.accountRight}>
                    {isSwitching ? (
                      <ActivityIndicator size="small" color={accent} />
                    ) : isCurrent ? (
                      <View style={[styles.activeDot, { backgroundColor: accent + "22" }]}>
                        <Ionicons name="radio-button-on" size={18} color={accent} />
                      </View>
                    ) : (
                      <View style={styles.rowActions}>
                        <TouchableOpacity
                          onPress={() => handleSwitch(account.userId)}
                          style={[styles.switchBtn, { backgroundColor: accent }]}
                          disabled={isBusy}
                        >
                          <Ionicons name="swap-horizontal" size={14} color="#fff" />
                          <Text style={styles.switchBtnText}>Switch</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleRemove(account.userId, account.displayName)}
                          hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                          disabled={isBusy}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </Pressable>

                {!isLast && (
                  <View
                    style={[
                      styles.separator,
                      { backgroundColor: colors.border, marginLeft: 80 },
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>

        {/* ── Add account button ── */}
        {!showAdd && !atLimit && (
          <TouchableOpacity
            style={[styles.addRow, { backgroundColor: colors.surface }]}
            onPress={openForm}
            activeOpacity={0.7}
            disabled={isBusy}
          >
            <View style={[styles.addIconWrap, { backgroundColor: accent }]}>
              <Ionicons name="add" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.addRowText, { color: colors.text }]}>Add Account</Text>
              <Text style={[styles.addRowSub, { color: colors.textMuted }]}>
                Link another AfuChat account to this device
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* ── Limit notice ── */}
        {atLimit && !showAdd && (
          <View
            style={[styles.limitNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.limitNoticeText, { color: colors.textMuted }]}>
              You've reached the maximum of {MAX_ACCOUNTS_NON_ADMIN} linked accounts.
            </Text>
          </View>
        )}

        {/* ── Add account form ── */}
        {showAdd && (
          <Animated.View
            style={[
              styles.addForm,
              {
                backgroundColor: colors.surface,
                opacity: formOpacity,
                transform: [{ translateY: formTranslateY }],
              },
            ]}
          >
            <View style={styles.addFormHeader}>
              <Text style={[styles.addFormTitle, { color: colors.text }]}>Link Account</Text>
              <TouchableOpacity
                onPress={closeForm}
                hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                disabled={linking}
              >
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.addFormNote, { color: colors.textMuted }]}>
              Sign in with a second account's credentials. You'll stay on your current account
              and can switch anytime.
            </Text>

            <View
              style={[styles.inputWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            >
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
                editable={!linking}
              />
            </View>

            <View
              style={[styles.inputWrap, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            >
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
                editable={!linking}
              />
              <TouchableOpacity
                onPress={() => setShowPw((v) => !v)}
                hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
              >
                <Ionicons
                  name={showPw ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: accent, opacity: linking ? 0.6 : 1 }]}
              onPress={handleAddAccount}
              disabled={linking}
              activeOpacity={0.8}
            >
              {linking ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Link Account</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Info strip ── */}
        <View style={[styles.infoStrip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            Session tokens are stored securely on this device only. Switching accounts wipes all
            local caches so no data leaks between accounts.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Full-screen overlay during switch
  switchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  switchCard: {
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    gap: 14,
    minWidth: 240,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  switchingText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  switchingSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },

  body: { gap: 12, padding: 16 },

  section: { borderRadius: 16, overflow: "hidden" },

  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  activeLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },

  accountRight: { alignItems: "flex-end", justifyContent: "center" },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  switchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  switchBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  activeDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

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
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addRowText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  addRowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  addForm: { borderRadius: 16, padding: 20, gap: 14 },
  addFormHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addFormTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  addFormNote: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    borderWidth: StyleSheet.hairlineWidth,
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

  limitNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  limitNoticeText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  infoStrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
