import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { TwoFactorGate } from "@/components/ui/TwoFactorGate";


// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({
  title, children, colors,
}: { title?: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={s.section}>
      {title && <Text style={[s.sectionLabel, { color: colors.textMuted }]}>{title}</Text>}
      <View style={[s.card, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

function Row({
  icon, iconColor, label, sublabel, last, danger, loading, onPress, colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor?: string; label: string; sublabel?: string;
  last?: boolean; danger?: boolean; loading?: boolean;
  onPress?: () => void; colors: any;
}) {
  const ic = iconColor ?? (danger ? "#FF3B30" : colors.accent);
  return (
    <>
      <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress || loading}>
        <View style={s.iconWrap}>
          {loading
            ? <ActivityIndicator size="small" color={danger ? "#FF3B30" : colors.text} />
            : <Ionicons name={icon} size={22} color={danger ? "#FF3B30" : colors.text} />}
        </View>
        <View style={s.rowText}>
          <Text style={[s.rowLabel, { color: danger ? "#FF3B30" : colors.text }]}>{label}</Text>
          {sublabel && <Text style={[s.rowSub, { color: colors.textMuted }]} numberOfLines={2}>{sublabel}</Text>}
        </View>
        {onPress && !loading && (
          <Ionicons name="chevron-forward" size={15} color={danger ? "#FF3B3088" : colors.textMuted} style={{ marginLeft: 2 }} />
        )}
      </TouchableOpacity>
      {!last && <View style={[s.divider, { backgroundColor: colors.separator }]} />}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ManageAccountScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // ── Download ────────────────────────────────────────────────────────────────
  const [showDownloadGate, setShowDownloadGate] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadData() {
    if (!user) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-user-data", {
        body: { types: ["profile", "posts", "messages", "activity", "transactions"] },
      });

      if (error || data?.error) {
        const msg = data?.error ?? error?.message ?? "Something went wrong. Please try again.";
        showAlert("Export Failed", msg);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const email = data?.email ?? user.email ?? "your registered email";
      showAlert(
        "Export Sent",
        `Your data export has been sent to ${email}. Check your inbox for the attached JSON file.`
      );
    } catch {
      showAlert("Error", "Failed to request data export. Please check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Manage Account" />

      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Banner */}
        <View style={[s.banner, { backgroundColor: colors.card }]}>
          <View style={[s.bannerIcon, { backgroundColor: "#0A84FF18" }]}>
            <Ionicons name="person-circle" size={24} color="#0A84FF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.bannerTitle, { color: colors.text }]}>Your Account</Text>
            <Text style={[s.bannerSub, { color: colors.textMuted }]}>
              Export a copy of your data or permanently delete your account from here.
            </Text>
          </View>
        </View>

        {/* Data portability */}
        <Section title="DATA PORTABILITY" colors={colors}>
          <Row
            icon="cloud-download" iconColor="#0A84FF"
            label="Export My Data"
            sublabel="Download a copy of your profile, posts, messages and activity"
            loading={downloading}
            onPress={() => setShowDownloadGate(true)}
            last colors={colors}
          />
        </Section>

        <Text style={[s.footerNote, { color: colors.textMuted }]}>
          Need help with your account? Contact support before making any permanent changes.
        </Text>
      </ScrollView>

      {/* 2FA Gates */}
      <TwoFactorGate
        visible={showDownloadGate}
        title="Verify Your Identity"
        subtitle="Confirm your identity before exporting your data."
        onSuccess={() => { setShowDownloadGate(false); handleDownloadData(); }}
        onDismiss={() => setShowDownloadGate(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 16, gap: 0 },

  banner: { flexDirection: "row", alignItems: "flex-start", gap: 14, borderRadius: 18, padding: 16, marginBottom: 24 },
  bannerIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  bannerTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  bannerSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8, paddingHorizontal: 4 },
  card: { borderRadius: 18, overflow: "hidden" },

  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  iconWrap: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  divider: { height: 0.5, marginHorizontal: 16 },

  footerNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18, paddingHorizontal: 16, marginBottom: 8 },
});
