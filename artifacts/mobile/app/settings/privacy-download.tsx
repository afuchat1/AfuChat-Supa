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
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import { useLanguage } from "@/context/LanguageContext";

const DATA_TYPES: {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  label: string;
  description: string;
}[] = [
  { id: "profile",      icon: "person-circle",  iconColor: "#007AFF", label: "download.profile_data",     description: "download.profile_data_description" },
  { id: "messages",     icon: "chatbubble",      iconColor: "#34C759", label: "download.messages",         description: "download.messages_description" },
  { id: "posts",        icon: "document-text",   iconColor: "#FF9500", label: "download.posts",           description: "download.posts_description" },
  { id: "activity",     icon: "analytics",       iconColor: "#AF52DE", label: "download.activity",        description: "download.activity_description" },
  { id: "transactions", icon: "card",            iconColor: "#FFD60A", label: "download.transactions",    description: "download.transactions_description" },
];

export default function PrivacyDownloadScreen() {
  const { colors, accent } = useTheme();
  const { t } = useLanguage();
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
      showAlert(t("download.select_data"), t("download.select_data_description"));
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData?.session) {
        showAlert(t("download.not_signed_in"), t("download.not_signed_in_description"));
        return;
      }
      const accessToken = sessionData.session.access_token;
      const functionUrl = `${supabaseUrl}/functions/v1/export-user-data`;
      const res = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ types: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        showAlert(t("download.export_failed"), data?.error || `${t("Server error")} (${res.status}). ${t("Please try again.")}`);
        return;
      }
      setSentToEmail(data?.email ?? "");
      setRequested(true);
    } catch {
      showAlert(t("download.network_error"), t("Could not reach the server. Please check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="download.download_data" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {requested ? (
          <View style={s.successContainer}>
            <View style={[s.successIcon, { backgroundColor: "#34C75922" }]}>
              <Ionicons name="checkmark-circle" size={56} color="#34C759" />
            </View>
            <Text style={[s.successTitle, { color: colors.text }]}>{t("Export Sent!")}</Text>
            <Text style={[s.successDesc, { color: colors.textMuted }]}>
              {t("Your data export has been sent to")}{"\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>{sentToEmail}</Text>
              {"\n\n"}{t("Open the email and download the attached JSON file. It contains all the data you selected.")}
            </Text>
            <TouchableOpacity style={[s.doneBtn, { backgroundColor: accent }]} onPress={() => router.back()}>
              <Text style={s.doneBtnText}>{t("Done")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <GlassCard style={{ marginHorizontal: 16, marginTop: 20, borderRadius: 16, overflow: "hidden" }} variant="subtle" noShadow>
              <View style={s.infoCard}>
                <View style={[s.infoIconWrap, { backgroundColor: accent + "18" }]}>
                  <Ionicons name="shield-checkmark" size={20} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.infoTitle, { color: colors.text }]}>{t("Your data is yours")}</Text>
                  <Text style={[s.infoText, { color: colors.textMuted }]}>
                    {t("AfuChat gives you full access to a copy of your personal data. Select what you'd like to include and we'll email it to you instantly.")}
                  </Text>
                </View>
              </View>
            </GlassCard>

            <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("SELECT DATA TO INCLUDE")}</Text>
            <GlassCard style={s.group} variant="medium">
              {DATA_TYPES.map((item, i) => {
                const isSelected = selected.has(item.id);
                return (
                  <View key={item.id}>
                    {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                    <TouchableOpacity
                      style={[s.row, { backgroundColor: colors.surface }]}
                      onPress={() => toggle(item.id)}
                      activeOpacity={0.7}
                    >
                      <View style={s.rowIcon}>
                        <Ionicons name={item.icon} size={22} color={colors.text} />
                      </View>
                      <View style={s.rowText}>
                        <Text style={[s.rowLabel, { color: colors.text }]}>{t(item.label)}</Text>
                        <Text style={[s.rowDesc, { color: colors.textMuted }]}>{t(item.description)}</Text>
                      </View>
                      <View style={[s.checkbox, {
                        borderColor: isSelected ? accent : colors.border,
                        backgroundColor: isSelected ? accent : "transparent",
                      }]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </GlassCard>

            <Text style={[s.hint, { color: colors.textMuted }]}>
              Your selected data will be compiled into a JSON file and emailed to your registered address immediately — no waiting required.
            </Text>

            <TouchableOpacity
              style={[s.requestBtn, { backgroundColor: accent, opacity: (selected.size === 0 || loading) ? 0.5 : 1 }]}
              onPress={requestDownload}
              activeOpacity={0.85}
              disabled={loading || selected.size === 0}
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={s.requestBtnText}>Preparing export…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-download" size={18} color="#fff" />
                  <Text style={s.requestBtnText}>Export & Email My Data ({selected.size} selected)</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 },
  infoIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  group: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },
  sep: { height: 0.5, marginLeft: 62 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 14 },
  rowIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 2 },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 14, lineHeight: 18 },
  requestBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, marginTop: 20, borderRadius: 16, paddingVertical: 16 },
  requestBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  successContainer: { alignItems: "center", paddingHorizontal: 32, paddingTop: 60, gap: 16 },
  successIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  successDesc: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  doneBtn: { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 999, marginTop: 8 },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
