import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import type { UserIdentity } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { GitHubLogo, XLogo, GitLabLogo } from "@/components/ui/OAuthLogos";
import * as Haptics from "@/lib/haptics";

// ─── Provider config ──────────────────────────────────────────────────────────
type Provider = {
  id: string;
  label: string;
  iconBg: string;
  renderLogo: (isDark: boolean) => React.ReactNode;
};

const PROVIDERS: Provider[] = [
  {
    id: "github",
    label: "GitHub",
    iconBg: "#24292E",
    renderLogo: () => <GitHubLogo size={18} color="#fff" />,
  },
  {
    id: "twitter",
    label: "X (Twitter)",
    iconBg: "#000000",
    renderLogo: () => <XLogo size={18} color="#fff" />,
  },
  {
    id: "gitlab",
    label: "GitLab",
    iconBg: "#FC6D26",
    renderLogo: () => <GitLabLogo size={18} />,
  },
];

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function OAuthProvidersScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchIdentities = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.getUserIdentities();
    if (!error && data?.identities) {
      setIdentities(data.identities);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchIdentities();
  }, [fetchIdentities]);

  async function handleConnect(providerId: string) {
    setActionLoading(providerId);
    const redirectUrl = makeRedirectUri({ native: "afuchat://settings/oauth-providers" });
    const { data, error } = await (supabase.auth as any).linkIdentity({
      provider: providerId,
      options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
    });
    if (error) {
      setActionLoading(null);
      showAlert("Error", error.message);
      return;
    }
    if (!data?.url) {
      setActionLoading(null);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
      showInRecents: false,
    });

    if (result.type === "success" && result.url) {
      try {
        const qIndex = result.url.indexOf("?");
        if (qIndex !== -1) {
          const params = new URLSearchParams(result.url.slice(qIndex + 1));
          const code = params.get("code");
          if (code) await supabase.auth.exchangeCodeForSession(code);
        }
      } catch (_) {}
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchIdentities();
    }

    setActionLoading(null);
  }

  function handleDisconnect(identity: UserIdentity) {
    if (identities.length <= 1) {
      showAlert(
        "Cannot Disconnect",
        "You need at least one sign-in method. Add another one first."
      );
      return;
    }
    const providerName =
      PROVIDERS.find((p) => p.id === identity.provider)?.label ?? identity.provider;
    showAlert(
      `Disconnect ${providerName}?`,
      `You won't be able to sign in with ${providerName} anymore.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setActionLoading(identity.provider);
            const { error } = await supabase.auth.unlinkIdentity(identity);
            if (error) {
              showAlert("Error", error.message);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await fetchIdentities();
            }
            setActionLoading(null);
          },
        },
      ]
    );
  }

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Linked Accounts</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          SOCIAL SIGN-IN
        </Text>

        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            PROVIDERS.map((provider, index) => {
              const identity = identities.find((i) => i.provider === provider.id);
              const isConnected = !!identity;
              const isBusy = actionLoading === provider.id;
              const isLast = index === PROVIDERS.length - 1;

              return (
                <View key={provider.id}>
                  <View style={styles.row}>
                    {/* Icon */}
                    <View style={[styles.iconWrap, { backgroundColor: provider.iconBg }]}>
                      {provider.renderLogo(isDark)}
                    </View>

                    {/* Label + status */}
                    <View style={styles.rowMeta}>
                      <Text style={[styles.rowLabel, { color: colors.text }]}>
                        {provider.label}
                      </Text>
                      <Text
                        style={[
                          styles.rowStatus,
                          { color: isConnected ? colors.accent : colors.textMuted },
                        ]}
                      >
                        {isConnected ? "Connected" : "Not connected"}
                      </Text>
                    </View>

                    {/* Action */}
                    {isBusy ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : isConnected ? (
                      <TouchableOpacity
                        style={styles.disconnectBtn}
                        onPress={() => handleDisconnect(identity)}
                        activeOpacity={0.7}
                        disabled={!!actionLoading}
                      >
                        <Text style={styles.disconnectText}>Disconnect</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.connectBtn, { backgroundColor: colors.accent }]}
                        onPress={() => handleConnect(provider.id)}
                        activeOpacity={0.7}
                        disabled={!!actionLoading}
                      >
                        <Text style={styles.connectText}>Connect</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {!isLast && (
                    <View
                      style={[
                        styles.sep,
                        { backgroundColor: colors.border, marginLeft: 60 },
                      ]}
                    />
                  )}
                </View>
              );
            })
          )}
        </View>

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Connected accounts let you sign in with that service.{"\n"}
          At least one sign-in method must remain active.
        </Text>
      </ScrollView>
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

  body: { paddingHorizontal: 16, paddingTop: 24, gap: 12 },

  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginLeft: 4,
  },

  section: { borderRadius: 14, overflow: "hidden" },

  loadingRow: { paddingVertical: 36, alignItems: "center" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMeta: { flex: 1, gap: 3 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  rowStatus: { fontSize: 12, fontFamily: "Inter_400Regular" },

  connectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  connectText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },

  disconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  disconnectText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#FF3B30",
  },

  sep: { height: StyleSheet.hairlineWidth },

  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
