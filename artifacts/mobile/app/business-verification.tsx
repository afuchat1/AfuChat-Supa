import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";

const GOLD = "#D4A853";

const ORG_TYPES = [
  "Company / Corporation",
  "Brand",
  "Non-Profit / NGO",
  "Government / Public Body",
  "Media / Press",
  "Educational Institution",
  "Religious Organization",
  "Sports / Entertainment",
  "Other",
];

type PageStatus = "loading" | "idle" | "pending" | "approved" | "rejected";

type VerifApp = {
  id: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  org_name: string;
};

export default function BusinessVerificationScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [existingApp, setExistingApp] = useState<VerifApp | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    org_name: "",
    org_type: "",
    industry: "",
    website_url: "",
    description: "",
    notable_links: "",
    ig: "",
    x_twitter: "",
    linkedin: "",
  });

  const headerTopPad = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 16);

  useEffect(() => {
    if (!user) return;
    checkExisting();
  }, [user]);

  async function checkExisting() {
    const { data } = await supabase
      .from("business_verification_requests")
      .select("id, status, admin_note, created_at, org_name")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setExistingApp(data as VerifApp);
      setPageStatus((data as any).status as PageStatus);
    } else {
      setPageStatus("idle");
    }
  }

  function set(field: string, val: string) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  async function handleSubmit() {
    if (!form.org_name.trim()) { showAlert("Required", "Organization name is required."); return; }
    if (!form.org_type) { showAlert("Required", "Please select an organization type."); return; }
    if (form.description.trim().length < 40) { showAlert("Required", "Please write at least 40 characters describing your organization and its notable presence."); return; }
    if (!user) return;

    setSubmitting(true);

    const social_links: Record<string, string> = {};
    if (form.ig.trim()) social_links.instagram = form.ig.trim();
    if (form.x_twitter.trim()) social_links.x_twitter = form.x_twitter.trim();
    if (form.linkedin.trim()) social_links.linkedin = form.linkedin.trim();

    const { error } = await supabase.from("business_verification_requests").insert({
      user_id: user.id,
      org_name: form.org_name.trim(),
      org_type: form.org_type,
      industry: form.industry.trim() || null,
      website_url: form.website_url.trim() || null,
      description: form.description.trim(),
      notable_links: form.notable_links.trim() || null,
      social_links,
      status: "pending",
    });

    setSubmitting(false);
    if (error) {
      showAlert("Submission Error", "Unable to submit at this time. Please contact support.");
      return;
    }
    await checkExisting();
  }

  const NavBar = () => (
    <View style={[st.navBar, { paddingTop: headerTopPad, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={[st.navTitle, { color: colors.text }]}>Business Verification</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  if (pageStatus === "loading") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <NavBar />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={GOLD} />
        </View>
      </View>
    );
  }

  if (profile?.is_organization_verified) {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <NavBar />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
          <View style={[st.iconCircle, { backgroundColor: GOLD + "22" }]}>
            <Ionicons name="checkmark-circle" size={48} color={GOLD} />
          </View>
          <Text style={[st.bigTitle, { color: colors.text }]}>Already Verified!</Text>
          <Text style={[st.bigSub, { color: colors.textMuted }]}>
            Your account has organization verification. Your gold badge is active across the platform.
          </Text>
        </View>
      </View>
    );
  }

  if (pageStatus === "pending") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <NavBar />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
          <View style={[st.iconCircle, { backgroundColor: "#FF9500" + "22" }]}>
            <Ionicons name="time-outline" size={48} color="#FF9500" />
          </View>
          <Text style={[st.bigTitle, { color: colors.text }]}>Under Review</Text>
          <Text style={[st.bigSub, { color: colors.textMuted }]}>
            Your application for <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>{existingApp?.org_name}</Text> is being reviewed by our team. We typically respond within 3–5 business days.
          </Text>
          <Text style={[st.bigSub, { color: colors.textMuted, marginTop: 4 }]}>
            Submitted {existingApp?.created_at ? new Date(existingApp.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : ""}
          </Text>
        </View>
      </View>
    );
  }

  if (pageStatus === "rejected") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <NavBar />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
          <View style={[st.iconCircle, { backgroundColor: "#FF3B30" + "22" }]}>
            <Ionicons name="close-circle-outline" size={48} color="#FF3B30" />
          </View>
          <Text style={[st.bigTitle, { color: colors.text }]}>Not Approved</Text>
          {existingApp?.admin_note ? (
            <View style={[st.noteBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Text style={[st.noteLabel, { color: colors.textMuted }]}>Reviewer note</Text>
              <Text style={[st.noteText, { color: colors.textSecondary }]}>{existingApp.admin_note}</Text>
            </View>
          ) : (
            <Text style={[st.bigSub, { color: colors.textMuted }]}>
              Your application did not meet our current verification criteria. You may reapply after addressing the requirements.
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <NavBar />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View style={[st.heroCard, { backgroundColor: GOLD + "14", borderColor: GOLD + "40" }]}>
            <View style={[st.iconCircle, { backgroundColor: GOLD + "22", alignSelf: "center" }]}>
              <Ionicons name="business-outline" size={36} color={GOLD} />
            </View>
            <Text style={[st.heroTitle, { color: colors.text }]}>Organization Verification</Text>
            <Text style={[st.heroSub, { color: colors.textSecondary }]}>
              Apply for the gold verified badge to show AfuChat has confirmed your organization is authentic and has notable presence in its field.
            </Text>
          </View>

          {/* Criteria reminder */}
          <View style={[st.criteriaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[st.sectionLabel, { color: colors.textMuted }]}>ELIGIBILITY CRITERIA</Text>
            {[
              { icon: "business-outline", text: "Confirmed authentic business, brand, or organization" },
              { icon: "shield-checkmark-outline", text: "Notable presence in your industry or community" },
              { icon: "document-text-outline", text: "Compliant with AfuChat's community guidelines" },
            ].map((c, i) => (
              <View key={i} style={st.criteriaRow}>
                <Ionicons name={c.icon as any} size={15} color={GOLD} />
                <Text style={[st.criteriaText, { color: colors.textSecondary }]}>{c.text}</Text>
              </View>
            ))}
          </View>

          {/* Form */}
          <Text style={[st.groupLabel, { color: colors.text }]}>Organization Details</Text>

          <Field label="Organization Name *" colors={colors}>
            <TextInput
              style={[st.input, { color: colors.text }]}
              placeholder="Your official organization name"
              placeholderTextColor={colors.textMuted}
              value={form.org_name}
              onChangeText={(v) => set("org_name", v)}
              maxLength={120}
            />
          </Field>

          <Field label="Organization Type *" colors={colors}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 8 }}>
              {ORG_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[st.typeChip, { borderColor: form.org_type === t ? GOLD : colors.border, backgroundColor: form.org_type === t ? GOLD + "18" : colors.backgroundSecondary }]}
                  onPress={() => set("org_type", t)}
                  activeOpacity={0.75}
                >
                  <Text style={[st.typeChipText, { color: form.org_type === t ? GOLD : colors.textSecondary }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Field>

          <Field label="Industry / Sector" colors={colors}>
            <TextInput
              style={[st.input, { color: colors.text }]}
              placeholder="e.g. Technology, Healthcare, Finance"
              placeholderTextColor={colors.textMuted}
              value={form.industry}
              onChangeText={(v) => set("industry", v)}
              maxLength={80}
            />
          </Field>

          <Field label="Official Website" colors={colors}>
            <TextInput
              style={[st.input, { color: colors.text }]}
              placeholder="https://yourorganization.com"
              placeholderTextColor={colors.textMuted}
              value={form.website_url}
              onChangeText={(v) => set("website_url", v)}
              autoCapitalize="none"
              keyboardType="url"
              maxLength={200}
            />
          </Field>

          <Text style={[st.groupLabel, { color: colors.text, marginTop: 4 }]}>Notable Presence</Text>

          <Field label="Describe your organization and its impact *" colors={colors}>
            <TextInput
              style={[st.input, st.textarea, { color: colors.text }]}
              placeholder="Tell us about your organization, what you do, your reach, and why you qualify for verification…"
              placeholderTextColor={colors.textMuted}
              value={form.description}
              onChangeText={(v) => set("description", v)}
              multiline
              numberOfLines={5}
              maxLength={1000}
            />
            <Text style={[st.charCount, { color: colors.textMuted }]}>{form.description.length}/1000</Text>
          </Field>

          <Field label="Links to press, articles, or proof of presence" colors={colors}>
            <TextInput
              style={[st.input, st.textarea, { color: colors.text }]}
              placeholder="Paste links to news articles, Wikipedia, industry directories, official registrations…"
              placeholderTextColor={colors.textMuted}
              value={form.notable_links}
              onChangeText={(v) => set("notable_links", v)}
              multiline
              numberOfLines={3}
              maxLength={500}
              autoCapitalize="none"
            />
          </Field>

          <Text style={[st.groupLabel, { color: colors.text, marginTop: 4 }]}>Social Media (optional)</Text>

          {[
            { key: "ig", label: "Instagram", placeholder: "@yourorg" },
            { key: "x_twitter", label: "X / Twitter", placeholder: "@yourorg" },
            { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/company/yourorg" },
          ].map((s) => (
            <Field key={s.key} label={s.label} colors={colors}>
              <TextInput
                style={[st.input, { color: colors.text }]}
                placeholder={s.placeholder}
                placeholderTextColor={colors.textMuted}
                value={(form as any)[s.key]}
                onChangeText={(v) => set(s.key, v)}
                autoCapitalize="none"
                maxLength={120}
              />
            </Field>
          ))}

          {/* Notable presence note */}
          <TouchableOpacity
            style={[st.notableBanner, { backgroundColor: colors.surface, borderColor: GOLD + "44" }]}
            onPress={() => router.push("/premium")}
            activeOpacity={0.8}
          >
            <Ionicons name="star-outline" size={16} color={GOLD} />
            <Text style={[st.notableBannerText, { color: colors.textSecondary }]}>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: GOLD }}>Notable presence</Text> is a key requirement. Premium members get priority review.
            </Text>
            <Ionicons name="chevron-forward" size={14} color={GOLD} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.submitBtn, { backgroundColor: GOLD, opacity: submitting ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="ribbon-outline" size={18} color="#fff" />
                <Text style={st.submitBtnText}>Submit Verification Request</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={[st.disclaimer, { color: colors.textMuted }]}>
            Submitting a request does not guarantee verification. Our team reviews all applications and will notify you of the outcome within 3–5 business days.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, children, colors }: { label: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={[st.fieldWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[st.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  bigTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  bigSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  noteBox: { width: "100%", borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  noteLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  noteText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  heroCard: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center", gap: 10 },
  heroTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  criteriaCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 2 },
  criteriaRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  criteriaText: { flex: 1, fontSize: 13, lineHeight: 18 },
  groupLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  fieldWrap: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.4, marginBottom: 4 },
  input: { fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 4, minHeight: 34 },
  textarea: { minHeight: 90, textAlignVertical: "top" },
  charCount: { fontSize: 11, textAlign: "right", marginTop: 4 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  typeChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  notableBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 4 },
  notableBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14, marginTop: 8 },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  disclaimer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 17, marginTop: 4 },
});
