import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import { useLanguage } from "@/context/LanguageContext";
import {
  saveAndShareUserDataExport,
} from "@/lib/userDataExport";
import type { ExportFormat, UserDataExport } from "@/lib/userDataExport";

const DATA_TYPES: {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  description: string;
}[] = [
  { id: "profile", icon: "person-circle", label: "download.profile_data", description: "download.profile_data_description" },
  { id: "messages", icon: "chatbubble", label: "download.messages", description: "download.messages_description" },
  { id: "posts", icon: "document-text", label: "download.posts", description: "download.posts_description" },
  { id: "activity", icon: "analytics", label: "download.activity", description: "download.activity_description" },
  { id: "transactions", icon: "card", label: "download.transactions", description: "download.transactions_description" },
];

const FORMAT_OPTIONS: {
  id: ExportFormat;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}[] = [
  { id: "xlsx", title: "Excel workbook", subtitle: ".xlsx · formatted sheets", icon: "grid-outline" },
  { id: "json", title: "JSON file", subtitle: ".json · structured records", icon: "code-slash-outline" },
  { id: "csv", title: "CSV tables", subtitle: ".zip · one CSV per table", icon: "archive-outline" },
];

export default function PrivacyDownloadScreen() {
  const { colors, accent } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { preset } = useLocalSearchParams<{ preset?: string }>();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(preset === "all" ? DATA_TYPES.map((item) => item.id) : ["profile"]),
  );
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [emailCopy, setEmailCopy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [savedFileName, setSavedFileName] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");

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
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        showAlert(t("download.not_signed_in"), t("download.not_signed_in_description"));
        return;
      }

      const session = sessionData.session;
      const functionUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/export-user-data`;
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          types: Array.from(selected),
          emailCopy,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.error) {
        showAlert(
          t("download.export_failed"),
          result?.error || `${t("Server error")} (${response.status}). ${t("Please try again.")}`,
        );
        return;
      }

      const exportData = result?.export as UserDataExport | undefined;
      if (
        !exportData ||
        typeof exportData !== "object" ||
        !exportData.tables ||
        typeof exportData.tables !== "object" ||
        Object.keys(exportData.tables).length === 0
      ) {
        showAlert(
          t("download.export_failed"),
          "The server did not return the export tables. The export function must be updated before this download can work.",
        );
        return;
      }

      const fileName = await saveAndShareUserDataExport(exportData, format);
      setSavedFileName(fileName);
      setEmailStatus(typeof result.emailStatus === "string" ? result.emailStatus : "not_requested");
      setRecipientEmail(typeof result.email === "string" ? result.email : session.user.email ?? "");
      setCompleted(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      showAlert(
        t("download.network_error"),
        message || "Could not complete the export. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function emailResultText(): string {
    if (emailStatus === "accepted") {
      return `A JSON email copy was accepted for delivery to ${recipientEmail || "your account email"} from privacy@afuchat.com.`;
    }
    if (emailStatus === "not_configured") {
      return "The file is saved on this device. Email delivery is not configured on the export service.";
    }
    if (emailStatus === "too_large") {
      return "The file is saved on this device. The email copy was skipped because the export is too large for an attachment.";
    }
    if (emailStatus === "failed") {
      return "The file is saved on this device, but the email copy could not be accepted. You can still use the saved file.";
    }
    if (emailStatus === "unavailable") {
      return "The file is saved on this device. This account does not have an email address for a copy.";
    }
    return "The file is saved on this device. Use the share menu to save it to Downloads or open it in another app.";
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="download.download_data" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {completed ? (
          <View style={s.successContainer}>
            <View style={[s.successIcon, { backgroundColor: "#34C75922" }]}>
              <Ionicons name="checkmark-circle" size={56} color="#34C759" />
            </View>
            <Text style={[s.successTitle, { color: colors.text }]}>Export ready</Text>
            <Text style={[s.successFile, { color: accent }]}>{savedFileName}</Text>
            <Text style={[s.successDesc, { color: colors.textMuted }]}>{emailResultText()}</Text>
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
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.infoTitle, { color: colors.text }]}>Your data is yours</Text>
                  <Text style={[s.infoText, { color: colors.textMuted }]}>
                    Select the account data to export. AfuChat reads your records from the database and creates a file on this device.
                  </Text>
                </View>
              </View>
            </GlassCard>

            <Text style={[s.sectionTitle, { color: colors.textMuted }]}>SELECT DATA TO INCLUDE</Text>
            <GlassCard style={s.group} variant="medium">
              {DATA_TYPES.map((item, index) => {
                const isSelected = selected.has(item.id);
                return (
                  <View key={item.id}>
                    {index > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                    <TouchableOpacity
                      style={[s.row, { backgroundColor: colors.surface }]}
                      onPress={() => toggle(item.id)}
                      activeOpacity={0.7}
                      testID={`export-type-${item.id}`}
                    >
                      <View style={s.rowIcon}>
                        <Ionicons name={item.icon} size={22} color={colors.text} />
                      </View>
                      <View style={s.rowText}>
                        <Text style={[s.rowLabel, { color: colors.text }]}>{t(item.label)}</Text>
                        <Text style={[s.rowDesc, { color: colors.textMuted }]}>
                          {item.id === "activity"
                            ? "Following, followers, story likes, XP activity and referrals"
                            : t(item.description)}
                        </Text>
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

            <Text style={[s.sectionTitle, { color: colors.textMuted }]}>CHOOSE FILE FORMAT</Text>
            <View style={s.formatList}>
              {FORMAT_OPTIONS.map((option) => {
                const active = format === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      s.formatOption,
                      {
                        backgroundColor: colors.surface,
                        borderColor: active ? accent : colors.border,
                      },
                    ]}
                    onPress={() => setFormat(option.id)}
                    activeOpacity={0.75}
                    testID={`export-format-${option.id}`}
                  >
                    <Ionicons name={option.icon} size={20} color={active ? accent : colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.formatTitle, { color: colors.text }]}>{option.title}</Text>
                      <Text style={[s.formatSubtitle, { color: colors.textMuted }]}>{option.subtitle}</Text>
                    </View>
                    <View style={[s.radio, { borderColor: active ? accent : colors.border }]}>
                      {active && <View style={[s.radioInner, { backgroundColor: accent }]} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={s.emailToggle}
              onPress={() => setEmailCopy((value) => !value)}
              activeOpacity={0.75}
              testID="export-email-copy"
            >
              <View style={[s.checkbox, {
                borderColor: emailCopy ? accent : colors.border,
                backgroundColor: emailCopy ? accent : "transparent",
              }]}>
                {emailCopy && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowLabel, { color: colors.text }]}>Email a JSON copy</Text>
                <Text style={[s.rowDesc, { color: colors.textMuted }]}>
                  Send to your registered email from privacy@afuchat.com
                </Text>
              </View>
              <Ionicons name="mail-outline" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            <Text style={[s.hint, { color: colors.textMuted }]}>
              Excel files have a worksheet for each data table, with named columns, frozen headers, and filters. CSV exports contain one file per table. Message and post rows include media links, not the media files themselves.
            </Text>

            <TouchableOpacity
              style={[s.requestBtn, { backgroundColor: accent, opacity: (selected.size === 0 || loading) ? 0.5 : 1 }]}
              onPress={requestDownload}
              activeOpacity={0.85}
              disabled={loading || selected.size === 0}
              testID="create-data-export"
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={s.requestBtnText}>Preparing your export…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-download" size={18} color="#fff" />
                  <Text style={s.requestBtnText}>Create {format.toUpperCase()} export ({selected.size} selected)</Text>
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
  infoTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4, textAlign: "left" },
  infoText: { minWidth: 0, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, textAlign: "left" },
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
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 2, textAlign: "left" },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16, textAlign: "left" },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  formatList: { marginHorizontal: 16, gap: 8 },
  formatOption: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13 },
  formatTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  formatSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  emailToggle: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginTop: 18, padding: 14, borderRadius: 14 },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 14, lineHeight: 18, textAlign: "left" },
  requestBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, marginTop: 20, borderRadius: 16, paddingVertical: 16 },
  requestBtnText: { flexShrink: 1, minWidth: 0, color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  successContainer: { alignItems: "center", paddingHorizontal: 32, paddingTop: 60, gap: 16 },
  successIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  successFile: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  successDesc: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  doneBtn: { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 999, marginTop: 8 },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
