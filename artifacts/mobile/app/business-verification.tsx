import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
  { label: "Company / Corporation", icon: "business-outline" },
  { label: "Brand", icon: "pricetag-outline" },
  { label: "Non-Profit / NGO", icon: "heart-outline" },
  { label: "Government / Public Body", icon: "flag-outline" },
  { label: "Media / Press", icon: "newspaper-outline" },
  { label: "Educational Institution", icon: "school-outline" },
  { label: "Religious Organization", icon: "leaf-outline" },
  { label: "Sports / Entertainment", icon: "trophy-outline" },
  { label: "Other", icon: "ellipsis-horizontal-circle-outline" },
];

const INDUSTRIES = [
  "Technology", "Healthcare / Medical", "Finance / Banking", "Education",
  "Retail / E-commerce", "Media & Entertainment", "Food & Beverage", "Real Estate",
  "Manufacturing", "Transportation / Logistics", "Travel & Hospitality",
  "Legal / Professional Services", "Energy & Utilities", "Agriculture",
  "Construction", "Government / Public Sector", "Non-Profit / Charity",
  "Sports & Recreation", "Fashion & Beauty", "Other",
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
  const [showOrgTypePicker, setShowOrgTypePicker] = useState(false);
  const [showIndustryPicker, setShowIndustryPicker] = useState(false);

  const [form, setForm] = useState({
    org_name: "",
    legal_name: "",
    org_type: "",
    industry: "",
    registration_number: "",
    registration_country: "",
    phone: "",
    business_address: "",
    website_url: "",
    contact_name: "",
    contact_title: "",
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
    if (!form.phone.trim()) { showAlert("Required", "Business phone number is required."); return; }
    if (!form.registration_country.trim()) { showAlert("Required", "Country of registration is required."); return; }
    if (form.description.trim().length < 40) {
      showAlert("Required", "Please write at least 40 characters about your organization."); return;
    }
    if (!user) return;
    setSubmitting(true);
    const social_links: Record<string, string> = {};
    if (form.ig.trim()) social_links.instagram = form.ig.trim();
    if (form.x_twitter.trim()) social_links.x_twitter = form.x_twitter.trim();
    if (form.linkedin.trim()) social_links.linkedin = form.linkedin.trim();
    const { error } = await supabase.from("business_verification_requests").insert({
      user_id: user.id,
      org_name: form.org_name.trim(),
      legal_name: form.legal_name.trim() || null,
      org_type: form.org_type,
      industry: form.industry.trim() || null,
      registration_number: form.registration_number.trim() || null,
      registration_country: form.registration_country.trim(),
      phone: form.phone.trim(),
      business_address: form.business_address.trim() || null,
      website_url: form.website_url.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_title: form.contact_title.trim() || null,
      description: form.description.trim(),
      notable_links: form.notable_links.trim() || null,
      social_links,
      status: "pending",
    });
    setSubmitting(false);
    if (error) {
      showAlert("Submission Error", "Unable to submit at this time. Please try again or contact support.");
      return;
    }
    await checkExisting();
  }

  const selectedOrgType = ORG_TYPES.find((t) => t.label === form.org_type);

  const NavBar = () => (
    <View style={[st.navBar, { paddingTop: headerTopPad, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="chevron-back" size={24} color={colors.accent} />
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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 }}>
          <View style={{ width: 88, height: 88, borderRadius: 22, backgroundColor: GOLD + "22", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="ribbon" size={44} color={GOLD} />
          </View>
          <Text style={[st.bigTitle, { color: colors.text }]}>Already Verified!</Text>
          <Text style={[st.bigSub, { color: colors.textMuted }]}>
            Your account carries the Organization Verified gold badge, active across AfuChat.
          </Text>
        </View>
      </View>
    );
  }

  if (pageStatus === "pending") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <NavBar />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 }}>
          <View style={{ width: 88, height: 88, borderRadius: 22, backgroundColor: "#FF9500" + "22", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="time-outline" size={44} color="#FF9500" />
          </View>
          <Text style={[st.bigTitle, { color: colors.text }]}>Under Review</Text>
          <Text style={[st.bigSub, { color: colors.textMuted }]}>
            Your application for <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>{existingApp?.org_name}</Text> is being reviewed. We typically respond within 3–5 business days.
          </Text>
          {existingApp?.created_at ? (
            <View style={[st.dateBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
              <Text style={[st.dateBadgeText, { color: colors.textMuted }]}>
                Submitted {new Date(existingApp.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  if (pageStatus === "rejected") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <NavBar />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 }}>
          <View style={{ width: 88, height: 88, borderRadius: 22, backgroundColor: "#FF3B30" + "22", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="close-circle-outline" size={44} color="#FF3B30" />
          </View>
          <Text style={[st.bigTitle, { color: colors.text }]}>Not Approved</Text>
          {existingApp?.admin_note ? (
            <View style={[st.noteBox, { backgroundColor: colors.surface, borderColor: GOLD + "40" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Ionicons name="chatbox-outline" size={14} color={GOLD} />
                <Text style={[st.noteLabel, { color: GOLD }]}>Reviewer Note</Text>
              </View>
              <Text style={[st.noteText, { color: colors.text }]}>{existingApp.admin_note}</Text>
            </View>
          ) : (
            <Text style={[st.bigSub, { color: colors.textMuted }]}>
              Your application did not meet our current verification criteria. You may reapply.
            </Text>
          )}
          <TouchableOpacity
            style={[st.submitBtn, { backgroundColor: GOLD }]}
            onPress={() => { setExistingApp(null); setPageStatus("idle"); }}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={18} color="#fff" />
            <Text style={st.submitBtnText}>Reapply</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <NavBar />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 60, gap: 14 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View style={[st.heroCard, { backgroundColor: GOLD + "12", borderColor: GOLD + "40" }]}>
            <View style={[st.heroIcon, { backgroundColor: GOLD + "22" }]}>
              <Ionicons name="ribbon" size={30} color={GOLD} />
            </View>
            <Text style={[st.heroTitle, { color: colors.text }]}>Organization Verification</Text>
            <Text style={[st.heroSub, { color: colors.textSecondary }]}>
              Get the gold badge confirming your organization is authentic. We verify real business credentials and notable presence.
            </Text>
          </View>

          {/* Criteria */}
          <View style={[st.criteriaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[st.sectionMicro, { color: colors.textMuted }]}>REQUIREMENTS</Text>
            {[
              { icon: "business-outline", text: "Registered business, brand, or recognized organization" },
              { icon: "call-outline", text: "Valid business contact phone number" },
              { icon: "document-text-outline", text: "Registration number or official documentation" },
              { icon: "shield-checkmark-outline", text: "Notable presence — website, press, or industry recognition" },
            ].map((c, i) => (
              <View key={i} style={st.criteriaRow}>
                <View style={[st.criteriaIconWrap, { backgroundColor: GOLD + "18" }]}>
                  <Ionicons name={c.icon as any} size={14} color={GOLD} />
                </View>
                <Text style={[st.criteriaText, { color: colors.textSecondary }]}>{c.text}</Text>
              </View>
            ))}
          </View>

          {/* ── SECTION: Business Identity ── */}
          <SectionHeader title="Business Identity" />

          <Field label="Organization Name" required colors={colors}>
            <TextInput style={[st.input, { color: colors.text }]} placeholder="Your official public name"
              placeholderTextColor={colors.textMuted} value={form.org_name}
              onChangeText={(v) => set("org_name", v)} maxLength={120} />
          </Field>

          <Field label="Legal / Registered Name" colors={colors} hint="If different from your display name">
            <TextInput style={[st.input, { color: colors.text }]} placeholder="Legal name as registered"
              placeholderTextColor={colors.textMuted} value={form.legal_name}
              onChangeText={(v) => set("legal_name", v)} maxLength={120} />
          </Field>

          <Field label="Organization Type" required colors={colors}>
            <TouchableOpacity
              style={[st.pickerRow, { borderColor: form.org_type ? GOLD + "60" : colors.border, backgroundColor: form.org_type ? GOLD + "08" : "transparent" }]}
              activeOpacity={0.75}
              onPress={() => setShowOrgTypePicker(true)}
            >
              {selectedOrgType ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <View style={[st.pickerIconWrap, { backgroundColor: GOLD + "22" }]}>
                    <Ionicons name={selectedOrgType.icon as any} size={16} color={GOLD} />
                  </View>
                  <Text style={[st.pickerValue, { color: colors.text }]}>{selectedOrgType.label}</Text>
                </View>
              ) : (
                <Text style={[st.pickerPlaceholder, { color: colors.textMuted }]}>Select organization type…</Text>
              )}
              <Ionicons name="chevron-down" size={16} color={form.org_type ? GOLD : colors.textMuted} />
            </TouchableOpacity>
          </Field>

          <Field label="Industry / Sector" colors={colors}>
            <TouchableOpacity
              style={[st.pickerRow, { borderColor: colors.border }]}
              activeOpacity={0.75}
              onPress={() => setShowIndustryPicker(true)}
            >
              {form.industry ? (
                <Text style={[st.pickerValue, { color: colors.text, flex: 1 }]}>{form.industry}</Text>
              ) : (
                <Text style={[st.pickerPlaceholder, { color: colors.textMuted, flex: 1 }]}>Select industry…</Text>
              )}
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Field>

          {/* ── SECTION: Registration ── */}
          <SectionHeader title="Registration & Legal" />

          <Field label="Business Registration Number" colors={colors} hint="Company or charity registration number">
            <TextInput style={[st.input, { color: colors.text }]} placeholder="e.g. C123456 or BN/2020/001234"
              placeholderTextColor={colors.textMuted} value={form.registration_number}
              onChangeText={(v) => set("registration_number", v)} maxLength={80} autoCapitalize="characters" />
          </Field>

          <Field label="Country of Registration" required colors={colors}>
            <TextInput style={[st.input, { color: colors.text }]} placeholder="e.g. Kenya, Nigeria, United States"
              placeholderTextColor={colors.textMuted} value={form.registration_country}
              onChangeText={(v) => set("registration_country", v)} maxLength={80} />
          </Field>

          <Field label="Business Address" colors={colors}>
            <TextInput style={[st.input, { color: colors.text }]} placeholder="Physical office or registered address"
              placeholderTextColor={colors.textMuted} value={form.business_address}
              onChangeText={(v) => set("business_address", v)} maxLength={200} />
          </Field>

          {/* ── SECTION: Contact ── */}
          <SectionHeader title="Contact Information" />

          <Field label="Business Phone" required colors={colors} hint="Include country code, e.g. +254 712 345678">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="call-outline" size={16} color={colors.textMuted} />
              <TextInput style={[st.input, { color: colors.text, flex: 1 }]} placeholder="+254 712 345 678"
                placeholderTextColor={colors.textMuted} value={form.phone}
                onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" maxLength={30} />
            </View>
          </Field>

          <Field label="Official Website" colors={colors}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="globe-outline" size={16} color={colors.textMuted} />
              <TextInput style={[st.input, { color: colors.text, flex: 1 }]} placeholder="https://yourorganization.com"
                placeholderTextColor={colors.textMuted} value={form.website_url}
                onChangeText={(v) => set("website_url", v)} autoCapitalize="none" keyboardType="url" maxLength={200} />
            </View>
          </Field>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label="Contact Person Name" colors={colors}>
                <TextInput style={[st.input, { color: colors.text }]} placeholder="Full name"
                  placeholderTextColor={colors.textMuted} value={form.contact_name}
                  onChangeText={(v) => set("contact_name", v)} maxLength={80} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Job Title" colors={colors}>
                <TextInput style={[st.input, { color: colors.text }]} placeholder="CEO, Director…"
                  placeholderTextColor={colors.textMuted} value={form.contact_title}
                  onChangeText={(v) => set("contact_title", v)} maxLength={60} />
              </Field>
            </View>
          </View>

          {/* ── SECTION: Presence ── */}
          <SectionHeader title="Notable Presence" />

          <Field label="Describe your organization and why it qualifies" required colors={colors}>
            <TextInput style={[st.input, st.textarea, { color: colors.text }]}
              placeholder="Tell us about your reach, achievements, and why you qualify for verification…"
              placeholderTextColor={colors.textMuted} value={form.description}
              onChangeText={(v) => set("description", v)} multiline numberOfLines={5} maxLength={1000} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={[st.hint, { color: form.description.length < 40 ? "#FF9500" : colors.textMuted }]}>
                {form.description.length < 40 ? `${40 - form.description.length} more chars needed` : "✓ Looks good"}
              </Text>
              <Text style={[st.hint, { color: colors.textMuted }]}>{form.description.length}/1000</Text>
            </View>
          </Field>

          <Field label="Links to press, directories, or official registrations" colors={colors}>
            <TextInput style={[st.input, st.textareaSm, { color: colors.text }]}
              placeholder="News articles, Wikipedia, CAC registry, industry directories…"
              placeholderTextColor={colors.textMuted} value={form.notable_links}
              onChangeText={(v) => set("notable_links", v)} multiline numberOfLines={3}
              maxLength={500} autoCapitalize="none" />
          </Field>

          {/* ── SECTION: Social Media ── */}
          <SectionHeader title="Social Media" sub="optional" />

          {[
            { key: "ig", label: "Instagram", icon: "logo-instagram", placeholder: "@yourorg", color: "#E1306C" },
            { key: "x_twitter", label: "X / Twitter", icon: "logo-twitter", placeholder: "@yourorg", color: "#1DA1F2" },
            { key: "linkedin", label: "LinkedIn", icon: "logo-linkedin", placeholder: "linkedin.com/company/yourorg", color: "#0A66C2" },
          ].map((s) => (
            <Field key={s.key} label={s.label} colors={colors}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name={s.icon as any} size={16} color={s.color} />
                <TextInput style={[st.input, { color: colors.text, flex: 1 }]} placeholder={s.placeholder}
                  placeholderTextColor={colors.textMuted} value={(form as any)[s.key]}
                  onChangeText={(v) => set(s.key, v)} autoCapitalize="none" maxLength={120} />
              </View>
            </Field>
          ))}

          {/* Premium tip */}
          <TouchableOpacity style={[st.notableBanner, { backgroundColor: GOLD + "0E", borderColor: GOLD + "50" }]}
            onPress={() => router.push("/premium")} activeOpacity={0.8}>
            <View style={[st.bannerIconWrap, { backgroundColor: GOLD + "22" }]}>
              <Ionicons name="diamond-outline" size={14} color={GOLD} />
            </View>
            <Text style={[st.notableBannerText, { color: colors.textSecondary }]}>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: GOLD }}>Premium members</Text> get priority review and a dedicated support contact.
            </Text>
            <Ionicons name="chevron-forward" size={14} color={GOLD} />
          </TouchableOpacity>

          {/* Submit */}
          <TouchableOpacity
            style={[st.submitBtn, { backgroundColor: GOLD, opacity: submitting ? 0.7 : 1, marginTop: 4 }]}
            onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}
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
            Submitting does not guarantee verification. Our team reviews all applications and will notify you within 3–5 business days. False information will result in permanent disqualification.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Org Type Picker */}
      <Modal visible={showOrgTypePicker} transparent animationType="slide" onRequestClose={() => setShowOrgTypePicker(false)}>
        <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setShowOrgTypePicker(false)}>
          <View style={[st.pickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[st.pickerSheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[st.pickerSheetTitle, { color: colors.text }]}>Organization Type</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {ORG_TYPES.map((t) => {
                const selected = form.org_type === t.label;
                return (
                  <TouchableOpacity key={t.label}
                    style={[st.pickerOption, { borderBottomColor: colors.border, backgroundColor: selected ? GOLD + "12" : "transparent" }]}
                    onPress={() => { set("org_type", t.label); setShowOrgTypePicker(false); }} activeOpacity={0.75}>
                    <View style={[st.pickerOptionIcon, { backgroundColor: selected ? GOLD + "28" : colors.backgroundSecondary ?? colors.surface }]}>
                      <Ionicons name={t.icon as any} size={18} color={selected ? GOLD : colors.textSecondary} />
                    </View>
                    <Text style={[st.pickerOptionText, { color: selected ? GOLD : colors.text, fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular" }]}>{t.label}</Text>
                    {selected && <Ionicons name="checkmark" size={18} color={GOLD} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Industry Picker */}
      <Modal visible={showIndustryPicker} transparent animationType="slide" onRequestClose={() => setShowIndustryPicker(false)}>
        <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setShowIndustryPicker(false)}>
          <View style={[st.pickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[st.pickerSheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[st.pickerSheetTitle, { color: colors.text }]}>Industry / Sector</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {INDUSTRIES.map((ind) => {
                const selected = form.industry === ind;
                return (
                  <TouchableOpacity key={ind}
                    style={[st.pickerOption, { borderBottomColor: colors.border, backgroundColor: selected ? colors.backgroundSecondary ?? colors.surface : "transparent" }]}
                    onPress={() => { set("industry", ind); setShowIndustryPicker(false); }} activeOpacity={0.75}>
                    <Text style={[st.pickerOptionText, { color: selected ? colors.text : colors.textSecondary, fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular", flex: 1 }]}>{ind}</Text>
                    {selected && <Ionicons name="checkmark" size={18} color={GOLD} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
      <Text style={[st.groupLabel]}>{title}</Text>
      {sub ? <Text style={[st.optionalTag]}>{sub}</Text> : null}
    </View>
  );
}

function Field({ label, required, hint, children, colors }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode; colors: any;
}) {
  return (
    <View style={[st.fieldWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
        <Text style={[st.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
        {required && <Text style={{ color: GOLD, fontSize: 11, fontFamily: "Inter_700Bold" }}>*</Text>}
      </View>
      {children}
      {hint ? <Text style={[st.hint, { color: colors.textMuted, marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  bigTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  bigSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  dateBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  dateBadgeText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  noteBox: { width: "100%", borderRadius: 14, borderWidth: 1, padding: 16, gap: 4 },
  noteLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.6 },
  noteText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  heroCard: { borderRadius: 18, borderWidth: 1, padding: 22, alignItems: "center", gap: 10 },
  heroIcon: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  criteriaCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  sectionMicro: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.9, marginBottom: 2 },
  criteriaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  criteriaIconWrap: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  criteriaText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  groupLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  optionalTag: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#888" },
  fieldWrap: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },
  input: { fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 2, minHeight: 28 },
  textarea: { minHeight: 96, textAlignVertical: "top" },
  textareaSm: { minHeight: 66, textAlignVertical: "top" },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular" },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  pickerIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pickerValue: { fontSize: 14, fontFamily: "Inter_500Medium" },
  pickerPlaceholder: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  notableBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 4 },
  bannerIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  notableBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  disclaimer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 17, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  pickerSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12, paddingBottom: 40, maxHeight: "80%" },
  pickerSheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
  pickerSheetTitle: { fontSize: 16, fontFamily: "Inter_700Bold", paddingHorizontal: 20, marginBottom: 8 },
  pickerOption: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerOptionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pickerOptionText: { fontSize: 14, flex: 1 },
});
