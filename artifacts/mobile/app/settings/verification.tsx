import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassHeader } from "@/components/ui/GlassHeader";
import AfuTextInput from "@/components/ui/AfuTextInput";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";

type Requirement = {
  key: string;
  passed: boolean;
  current?: number;
  target?: number;
  posts?: number;
  posts_target?: number;
  active_weeks?: number;
  weeks_target?: number;
  reapply_at?: string | null;
};

type Eligibility = {
  ok: boolean;
  eligible: boolean;
  already_verified: boolean;
  pending: boolean;
  requirements: Requirement[];
  latest_request: {
    status: "pending" | "approved" | "rejected";
    created_at: string;
    decision_note: string | null;
    reapply_at: string | null;
  } | null;
};

const CATEGORIES = [
  ["public_figure", "Public figure"],
  ["journalist", "Journalist"],
  ["public_official", "Public official"],
  ["activist", "Activist"],
  ["creator", "Creator"],
  ["other", "Other"],
] as const;

const REQUIREMENT_COPY: Record<string, { label: string; next: string }> = {
  account_age: {
    label: "Account age · 90 days",
    next: "Keep building; recheck when your account reaches 90 days.",
  },
  email_verified: {
    label: "Verified email",
    next: "Verify the email linked to your AfuChat account.",
  },
  public_profile: {
    label: "Public profile",
    next: "Make your profile public so people can confirm it.",
  },
  complete_profile: {
    label: "Complete profile · photo and bio",
    next: "Add a profile photo and a bio of at least 40 characters.",
  },
  sustained_activity: {
    label: "Sustained public activity",
    next: "Share 10 public posts across at least 6 different weeks.",
  },
  good_standing: {
    label: "Good account standing",
    next: "Resolve account restrictions and continue following AfuChat guidelines.",
  },
  reapply_window: {
    label: "Reapply window",
    next: "You can apply again after the 90-day review period.",
  },
};

export default function ManualVerificationScreen() {
  const { colors, accent, isDark } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [statement, setStatement] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const loadEligibility = useCallback(async (quiet = false) => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (quiet) setRefreshing(true);
    else setLoading(true);
    const { data, error } = await supabase.rpc("get_my_manual_verification_eligibility");
    if (error) {
      showAlert(t("Couldn’t check eligibility"), t("Try again when your connection is available."));
    } else {
      setEligibility(data as Eligibility);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user, t]);

  useEffect(() => {
    void loadEligibility();
  }, [loadEligibility]);

  async function submitRequest() {
    if (!category) {
      showAlert(t("Complete the request"), t("Choose the public role that best fits."));
      return;
    }
    if (statement.trim().length < 80) {
      showAlert(t("Complete the request"), t("Add at least 80 characters about your public work."));
      return;
    }
    if (!/^https:\/\/\S+/i.test(evidenceUrl.trim())) {
      showAlert(t("Complete the request"), t("Add a public source link beginning with https://."));
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc("submit_manual_verification_request", {
      p_category: category,
      p_statement: statement.trim(),
      p_evidence_url: evidenceUrl.trim(),
    });
    setSubmitting(false);

    if (error) {
      showAlert(t("Request not sent"), t("Please try again."));
      return;
    }
    const result = data as { ok?: boolean; reason?: string; eligibility?: Eligibility };
    if (!result?.ok) {
      if (result?.eligibility) setEligibility(result.eligibility);
      else await loadEligibility(true);
      showAlert(t("Eligibility changed"), t("Review the current requirements and try again when ready."));
      return;
    }
    setStatement("");
    setEvidenceUrl("");
    setCategory("");
    await loadEligibility(true);
  }

  const headerStyle = Platform.OS === "web"
    ? { paddingTop: Math.max(insets.top, 67) }
    : undefined;
  const bottomPadding = Platform.OS === "web"
    ? Math.max(insets.bottom, 34) + 24
    : Math.max(insets.bottom, 12) + 24;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Verification" style={headerStyle} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={accent} />
        </View>
      ) : !user ? (
        <View style={styles.center}>
          <GlassCard style={styles.statusCard} variant="medium">
            <StatusLine
              icon="person-circle-outline"
              color={accent}
              title={t("Sign in to continue")}
              body={t("Sign in to check whether you qualify for manual verification.")}
              colors={colors}
            />
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: accent }]}
              onPress={() => router.push("/login" as any)}
              activeOpacity={0.82}
            >
              <Text style={styles.primaryButtonText}>{t("Sign in")}</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      ) : (
        <KeyboardAwareScrollViewCompat
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bottomOffset={24}
        >
          <GlassCard style={styles.hero} variant="medium">
            <View style={[styles.heroIcon, { backgroundColor: `${accent}20` }]}>
              <Ionicons name="ribbon-outline" size={25} color={accent} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.text }]}>{t("Earn trust through your presence")}</Text>
            <Text style={[styles.bodyText, { color: colors.textMuted }]}>
              {t("Authenticity, steady contribution, and public relevance matter most.")}
            </Text>
            <TouchableOpacity
              style={[styles.refreshButton, { borderColor: colors.border }]}
              onPress={() => void loadEligibility(true)}
              disabled={refreshing}
              activeOpacity={0.75}
              testID="verification-recheck"
            >
              {refreshing
                ? <ActivityIndicator size="small" color={accent} />
                : <Ionicons name="refresh" size={15} color={accent} />}
              <Text style={[styles.refreshText, { color: accent }]}>{t("Check eligibility again")}</Text>
            </TouchableOpacity>
          </GlassCard>

          {eligibility?.already_verified ? (
            <GlassCard style={styles.statusCard} variant="medium">
              <StatusLine icon="checkmark-circle" color={accent} title={t("Your account is verified")} body={t("Your verification is active.")} colors={colors} />
            </GlassCard>
          ) : eligibility?.pending ? (
            <GlassCard style={styles.statusCard} variant="medium">
              <StatusLine icon="time" color={accent} title={t("Under review")} body={t("Your request is with the AfuChat team. We’ll update its status here.")} colors={colors} />
              {!!eligibility.latest_request?.created_at && (
                <Text style={[styles.dateText, { color: colors.textMuted }]}>
                  {new Date(eligibility.latest_request.created_at).toLocaleDateString()}
                </Text>
              )}
            </GlassCard>
          ) : (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("What qualifies")}</Text>
              <GlassCard style={styles.requirementsCard} variant="medium">
                {eligibility?.requirements.map((requirement, index) => (
                  <RequirementRow
                    key={requirement.key}
                    requirement={requirement}
                    last={index === eligibility.requirements.length - 1}
                    colors={colors}
                    accent={accent}
                    t={t}
                  />
                ))}
              </GlassCard>

              {eligibility?.latest_request?.status === "rejected" && (
                <GlassCard style={styles.noteCard} variant="medium">
                  <Text style={[styles.noteTitle, { color: colors.text }]}>{t("Previous review")}</Text>
                  {!!eligibility.latest_request.decision_note && (
                    <Text style={[styles.bodyText, { color: colors.textMuted }]}>
                      {eligibility.latest_request.decision_note}
                    </Text>
                  )}
                </GlassCard>
              )}

              {eligibility?.eligible ? (
                <View style={styles.form}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("Request a review")}</Text>
                  <Text style={[styles.bodyText, { color: colors.textMuted }]}>{t("Share why your account matters publicly and one reliable source.")}</Text>

                  <Text style={[styles.fieldLabel, { color: colors.text }]}>{t("Your public role")}</Text>
                  <View style={styles.chips}>
                    {CATEGORIES.map(([value, label]) => {
                      const selected = category === value;
                      return (
                        <TouchableOpacity
                          key={value}
                          style={[
                            styles.chip,
                            { borderColor: selected ? accent : colors.border },
                            selected && { backgroundColor: `${accent}18` },
                          ]}
                          onPress={() => setCategory(value)}
                          activeOpacity={0.75}
                          testID={`verification-category-${value}`}
                        >
                          <Text style={[styles.chipText, { color: selected ? accent : colors.text }]}>
                            {t(label)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.fieldLabel, { color: colors.text }]}>{t("Why should this account be verified?")}</Text>
                  <AfuTextInput
                    appearance="embedded"
                    multiline
                    maxLength={600}
                    value={statement}
                    onChangeText={setStatement}
                    placeholder={t("Describe your public work and why people look for the authentic account.")}
                    placeholderTextColor={colors.textMuted}
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)",
                        borderColor: colors.border,
                      },
                    ]}
                    textAlignVertical="top"
                    testID="verification-statement"
                  />
                  <Text style={[styles.counter, { color: colors.textMuted }]}>{statement.trim().length}/600</Text>

                  <Text style={[styles.fieldLabel, { color: colors.text }]}>{t("Public evidence link")}</Text>
                  <AfuTextInput
                    appearance="embedded"
                    value={evidenceUrl}
                    onChangeText={setEvidenceUrl}
                    placeholder={t("https://…")}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)",
                        borderColor: colors.border,
                      },
                    ]}
                    testID="verification-evidence-url"
                  />

                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: accent }, submitting && styles.disabled]}
                    onPress={() => void submitRequest()}
                    disabled={submitting}
                    activeOpacity={0.82}
                    testID="verification-submit"
                  >
                    {submitting
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={styles.primaryButtonText}>{t("Submit for review")}</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.notReady}>
                  <Text style={[styles.notReadyTitle, { color: colors.text }]}>{t("Not eligible yet")}</Text>
                  <Text style={[styles.bodyText, { color: colors.textMuted }]}>{t("Complete the items above, then return and check again.")}</Text>
                </View>
              )}
            </>
          )}

          <TouchableOpacity
            style={[styles.planLink, { borderColor: colors.border }]}
            onPress={() => router.push("/premium" as any)}
            activeOpacity={0.75}
          >
            <Ionicons name="star-outline" size={17} color={accent} />
            <Text style={[styles.planLinkText, { color: colors.text }]}>{t("See verification through Premium")}</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        </KeyboardAwareScrollViewCompat>
      )}
    </View>
  );
}

function RequirementRow({
  requirement,
  last,
  colors,
  accent,
  t,
}: {
  requirement: Requirement;
  last: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  accent: string;
  t: (text: string, params?: Record<string, string | number>) => string;
}) {
  const copy = REQUIREMENT_COPY[requirement.key];
  if (!copy) return null;
  let detail = "";
  if (requirement.key === "account_age") {
    detail = `${requirement.current ?? 0}/90`;
  } else if (requirement.key === "sustained_activity") {
    detail = `${requirement.posts ?? 0}/10 · ${requirement.active_weeks ?? 0}/6`;
  } else if (requirement.key === "reapply_window" && !requirement.passed && requirement.reapply_at) {
    detail = new Date(requirement.reapply_at).toLocaleDateString();
  }

  return (
    <View style={[styles.requirementRow, !last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Ionicons
        name={requirement.passed ? "checkmark-circle" : "ellipse-outline"}
        size={20}
        color={requirement.passed ? accent : colors.textMuted}
      />
      <View style={styles.requirementCopy}>
        <Text style={[styles.requirementTitle, { color: colors.text }]}>{t(copy.label)}</Text>
        {!requirement.passed && (
          <Text style={[styles.requirementNext, { color: colors.textMuted }]}>{t(copy.next)}</Text>
        )}
      </View>
      {!!detail && <Text style={[styles.requirementDetail, { color: requirement.passed ? accent : colors.textMuted }]}>{detail}</Text>}
    </View>
  );
}

function StatusLine({
  icon,
  color,
  title,
  body,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  title: string;
  body: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={styles.statusRow}>
      <Ionicons name={icon} size={23} color={color} />
      <View style={styles.statusCopy}>
        <Text style={[styles.statusTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.bodyText, { color: colors.textMuted }]}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { padding: 18, borderRadius: 20, gap: 9 },
  heroIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 19, fontFamily: "Inter_700Bold" },
  bodyText: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  refreshButton: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 8, marginTop: 3 },
  refreshText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 2 },
  requirementsCard: { borderRadius: 18, paddingHorizontal: 14 },
  requirementRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10 },
  requirementCopy: { flex: 1, gap: 3 },
  requirementTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  requirementNext: { fontSize: 11, lineHeight: 15, fontFamily: "Inter_400Regular" },
  requirementDetail: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  notReady: { gap: 5, paddingHorizontal: 3, paddingVertical: 3 },
  notReadyTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  form: { gap: 10, paddingTop: 3 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, lineHeight: 19, fontFamily: "Inter_400Regular", minHeight: 48 },
  counter: { fontSize: 11, textAlign: "right", marginTop: -6, fontFamily: "Inter_400Regular" },
  primaryButton: { minHeight: 50, borderRadius: 14, justifyContent: "center", alignItems: "center", marginTop: 5 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_700Bold" },
  disabled: { opacity: 0.6 },
  statusCard: { padding: 17, borderRadius: 18, gap: 8 },
  statusRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  statusCopy: { flex: 1, gap: 5 },
  statusTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: 35 },
  noteCard: { borderRadius: 16, padding: 15, gap: 5 },
  noteTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  planLink: { minHeight: 48, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, marginTop: 2 },
  planLinkText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
});
