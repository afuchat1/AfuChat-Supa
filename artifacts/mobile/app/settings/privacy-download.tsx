import React, { useState } from "react";
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
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { supabase } from "@/lib/supabase";
import { getBaseUrl } from "@/lib/api-client-react/src/custom-fetch";

const DATA_TYPES = [
  { id: "profile",      icon: "person-circle"   as const, iconBg: Colors.brand,  label: "Profile Data",     description: "Your display name, bio, settings, and account info" },
  { id: "messages",     icon: "chatbubble"       as const, iconBg: "#34C759",     label: "Messages",         description: "All your chat conversations and media" },
  { id: "posts",        icon: "document-text"    as const, iconBg: "#FF9500",     label: "Posts & Moments",  description: "Everything you've posted on Discover" },
  { id: "activity",     icon: "analytics"        as const, iconBg: "#007AFF",     label: "Activity History", description: "Notifications, follows, and app activity" },
  { id: "transactions", icon: "card"             as const, iconBg: "#AF52DE",     label: "Transactions",     description: "ACoin and XP transaction history" },
];

export default function PrivacyDownloadScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<string>>(new Set(["profile"]));
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [sentToEmail, setSentToEmail] = useState("");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function requestDownload() {
    if (selected.size === 0) {
      showAlert("Select Data", "Please select at least one data type to download.");
      return;
    }

    // Get the current session JWT
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData?.session?.access_token) {
      showAlert("Not Signed In", "Please sign in to request a data export.");
      return;
    }

    const token = sessionData.session.access_token;
    const base = getBaseUrl();
    if (!base) {
      showAlert("Error", "Could not reach the server. Please try again later.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${base}/api/data-export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ types: Array.from(selected) }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        showAlert("Export Failed", json?.error || "Something went wrong. Please try again.");
        return;
      }

      setSentToEmail(json.email || "");
      setRequested(true);
    } catch (err: any) {
      showAlert("Network Error", "Could not reach the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Download My Data" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {requested ? (
          <View style={styles.successContainer}>
            <View style={[styles.successIcon, { backgroundColor: "#34C75922" }]}>
              <Ionicons name="checkmark-circle" size={56} color="#34C759" />
            </View>
            <Text style={[styles.successTitle, { color: colors.text }]}>Export Sent!</Text>
            <Text style={[styles.successDesc, { color: colors.textMuted }]}>
              Your data export has been sent to{"\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>{sentToEmail}</Text>
              {"\n\n"}Open the email and download the attached JSON file. It contains all the data you selected.
            </Text>
            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.accent }]} onPress={() => router.back()}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <GlassCard style={{ marginHorizontal: 16, marginTop: 20, borderRadius: 14, overflow: "hidden" }} variant="subtle" noShadow>
              <View style={styles.infoCard}>
                <Ionicons name="shield-checkmark" size={22} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoTitle, { color: colors.text }]}>Your data is yours</Text>
                  <Text style={[styles.infoText, { color: colors.textMuted }]}>
                    AfuChat gives you full access to a copy of your personal data. Select what you'd like to include and we'll email it to you instantly.
                  </Text>
                </View>
              </View>
            </GlassCard>

            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SELECT DATA TO INCLUDE</Text>
            <GlassCard style={styles.group} variant="medium">
              {DATA_TYPES.map((item, i) => {
                const isSelected = selected.has(item.id);
                return (
                  <View key={item.id}>
                    {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 62 }]} />}
                    <TouchableOpacity
                      style={[styles.row, { backgroundColor: colors.surface }]}
                      onPress={() => toggle(item.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: item.id === "profile" ? colors.accent : item.iconBg }]}>
                        <Ionicons name={item.icon} size={18} color="#fff" />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={[styles.rowLabel, { color: colors.text }]}>{item.label}</Text>
                        <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{item.description}</Text>
                      </View>
                      <View style={[styles.checkbox, { borderColor: isSelected ? colors.accent : colors.border, backgroundColor: isSelected ? colors.accent : "transparent" }]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </GlassCard>

            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Your selected data will be compiled into a JSON file and emailed to your registered address immediately — no waiting required.
            </Text>

            <TouchableOpacity
              style={[styles.requestBtn, { backgroundColor: colors.accent, opacity: (selected.size === 0 || loading) ? 0.5 : 1 }]}
              onPress={requestDownload}
              activeOpacity={0.85}
              disabled={loading || selected.size === 0}
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.requestBtnText}>Preparing export…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-download" size={18} color="#fff" />
                  <Text style={styles.requestBtnText}>Export & Email My Data ({selected.size} selected)</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 14, padding: 16 },
  infoTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  group: { marginHorizontal: 16, borderRadius: 14, overflow: "hidden" },
  sep: { height: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 14 },
  rowIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_400Regular", marginBottom: 2 },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 14, lineHeight: 18 },
  requestBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, marginTop: 20, borderRadius: 16, paddingVertical: 16 },
  requestBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  successContainer: { alignItems: "center", paddingHorizontal: 32, paddingTop: 60, gap: 16 },
  successIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  successDesc: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  doneBtn: { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 24, marginTop: 8 },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
