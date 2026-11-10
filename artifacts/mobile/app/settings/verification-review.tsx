import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";

type RequestRow = {
  request_id: string;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  category: string;
  statement: string;
  evidence_url: string;
  submitted_at: string;
};

export default function VerificationReviewScreen() {
  const { colors, accent } = useTheme();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_pending_manual_verification_requests");
    if (error) {
      showAlert(t("Couldn’t load requests"), t("Try again in a moment."));
    } else {
      setRequests((data ?? []) as RequestRow[]);
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    if (profile?.is_admin) void loadRequests();
    else setLoading(false);
  }, [profile?.is_admin, loadRequests]);

  async function decide(item: RequestRow, decision: "approved" | "rejected") {
    setWorkingId(item.request_id);
    const note = decision === "rejected"
      ? "The evidence does not yet establish public recognition. You may reapply after 90 days."
      : null;
    const { error } = await supabase.rpc("review_manual_verification_request", {
      p_request_id: item.request_id,
      p_decision: decision,
      p_note: note,
    });
    setWorkingId(null);
    if (error) {
      showAlert(t("Couldn’t load requests"), t("Try again in a moment."));
      return;
    }
    setRequests((current) => current.filter((request) => request.request_id !== item.request_id));
  }

  const headerStyle = Platform.OS === "web"
    ? { paddingTop: Math.max(insets.top, 67) }
    : undefined;
  const bottomPadding = Platform.OS === "web"
    ? Math.max(insets.bottom, 34) + 24
    : Math.max(insets.bottom, 12) + 24;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Verification requests" style={headerStyle} />
      {!profile?.is_admin ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("Administrator access required.")}</Text>
        </View>
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={accent} /></View>
      ) : (
        <KeyboardAwareScrollViewCompat
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
          keyboardShouldPersistTaps="handled"
        >
          {requests.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={32} color={accent} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("No requests are waiting for review.")}</Text>
            </View>
          ) : requests.map((item) => (
            <GlassCard key={item.request_id} style={styles.card} variant="medium">
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.display_name || item.handle || t("AfuChat user")}</Text>
                  {!!item.handle && <Text style={[styles.handle, { color: colors.textMuted }]}>@{item.handle}</Text>}
                </View>
                <Text style={[styles.date, { color: colors.textMuted }]}>{new Date(item.submitted_at).toLocaleDateString()}</Text>
              </View>
              <Text style={[styles.category, { color: accent }]}>{t(item.category.replace(/_/g, " "))}</Text>
              <Text style={[styles.statement, { color: colors.text }]}>{item.statement}</Text>
              <TouchableOpacity
                style={[styles.evidenceLink, { borderColor: colors.border }]}
                onPress={() => {
                  if (item.evidence_url.startsWith("https://")) void Linking.openURL(item.evidence_url);
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="open-outline" size={16} color={accent} />
                <Text numberOfLines={1} style={[styles.evidenceText, { color: accent }]}>{item.evidence_url}</Text>
              </TouchableOpacity>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.decline, { borderColor: colors.border }, workingId === item.request_id && styles.disabled]}
                  onPress={() => void decide(item, "rejected")}
                  disabled={workingId !== null}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.declineText, { color: colors.textMuted }]}>{t("Decline")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approve, { backgroundColor: accent }, workingId === item.request_id && styles.disabled]}
                  onPress={() => void decide(item, "approved")}
                  disabled={workingId !== null}
                  activeOpacity={0.75}
                >
                  {workingId === item.request_id
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
                    : <Text style={styles.approveText}>{t("Approve verification")}</Text>}
                </TouchableOpacity>
              </View>
            </GlassCard>
          ))}
        </KeyboardAwareScrollViewCompat>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 44 },
  emptyTitle: { fontSize: 15, textAlign: "center", fontFamily: "Inter_600SemiBold" },
  card: { padding: 16, borderRadius: 18, gap: 11 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 15, fontFamily: "Inter_700Bold" },
  handle: { fontSize: 12, marginTop: 2, fontFamily: "Inter_400Regular" },
  date: { fontSize: 11, fontFamily: "Inter_400Regular" },
  category: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statement: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  evidenceLink: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9 },
  evidenceText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  actions: { flexDirection: "row", gap: 9, marginTop: 2 },
  decline: { minHeight: 44, borderRadius: 12, borderWidth: 1, flex: 1, alignItems: "center", justifyContent: "center" },
  declineText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  approve: { minHeight: 44, borderRadius: 12, flex: 1, alignItems: "center", justifyContent: "center" },
  approveText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_700Bold" },
  disabled: { opacity: 0.6 },
});
