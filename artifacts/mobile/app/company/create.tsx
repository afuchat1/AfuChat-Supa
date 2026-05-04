import React, { useState } from "react";
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

const BRAND = "#00BCD4";
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

const SIZE_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

const INDUSTRIES = [
  "Technology", "Healthcare / Medical", "Finance / Banking", "Education",
  "Retail / E-commerce", "Media & Entertainment", "Food & Beverage", "Real Estate",
  "Manufacturing", "Transportation / Logistics", "Travel & Hospitality",
  "Legal / Professional Services", "Energy & Utilities", "Agriculture",
  "Construction", "Government / Public Sector", "Non-Profit / Charity",
  "Sports & Recreation", "Fashion & Beauty", "Other",
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function CreateCompanyPageScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const headerTop = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 16);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    tagline: "",
    description: "",
    website: "",
    email: "",
    industry: "",
    org_type: "",
    size: "",
    founded_year: "",
    location: "",
    ig: "", x_twitter: "", linkedin: "",
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showOrgTypePicker, setShowOrgTypePicker] = useState(false);
  const [showIndustryPicker, setShowIndustryPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);

  function set(field: string, val: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: val };
      if (field === "name" && !slugEdited) {
        next.slug = slugify(val);
      }
      return next;
    });
  }

  if (!profile?.is_organization_verified) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.navBar, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: colors.text }]}>Create Page</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: GOLD + "22", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="ribbon" size={44} color={GOLD} />
          </View>
          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center" }}>
            Verification Required
          </Text>
          <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", lineHeight: 22 }}>
            Only verified organizations can create company pages. Apply for the gold badge first — it's free and usually reviewed within 3–5 days.
          </Text>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: GOLD }]}
            onPress={() => router.push("/business-verification")}
            activeOpacity={0.85}
          >
            <Ionicons name="ribbon-outline" size={18} color="#fff" />
            <Text style={styles.submitBtnText}>Apply for Verification</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  async function handleCreate() {
    if (!form.name.trim()) { showAlert("Required", "Page name is required."); return; }
    if (!form.slug.trim()) { showAlert("Required", "Page URL slug is required."); return; }
    if (!/^[a-z0-9-]+$/.test(form.slug)) { showAlert("Invalid slug", "Slug can only contain lowercase letters, numbers, and dashes."); return; }
    if (!form.org_type) { showAlert("Required", "Please select an organization type."); return; }
    if (!user) return;

    setSubmitting(true);

    const social_links: Record<string, string> = {};
    if (form.ig.trim()) social_links.instagram = form.ig.trim();
    if (form.x_twitter.trim()) social_links.x_twitter = form.x_twitter.trim();
    if (form.linkedin.trim()) social_links.linkedin = form.linkedin.trim();

    const payload: any = {
      admin_id: user.id,
      name: form.name.trim(),
      slug: form.slug.trim(),
      org_type: form.org_type,
      social_links,
    };
    if (form.tagline.trim()) payload.tagline = form.tagline.trim();
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.website.trim()) payload.website = form.website.trim();
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.industry.trim()) payload.industry = form.industry.trim();
    if (form.size) payload.size = form.size;
    if (form.location.trim()) payload.location = form.location.trim();
    if (form.founded_year.trim() && !isNaN(Number(form.founded_year))) {
      payload.founded_year = Number(form.founded_year);
    }

    const { data, error } = await supabase
      .from("organization_pages")
      .insert(payload)
      .select("slug")
      .single();

    setSubmitting(false);

    if (error) {
      if (error.code === "23505") {
        showAlert("Slug taken", "That page URL is already in use. Try a different one.");
      } else {
        showAlert("Error", error.message || "Could not create page.");
      }
      return;
    }

    showAlert("Page Created!", `Your page "${form.name}" is live at /company/${data.slug}`, [
      { text: "View Page", onPress: () => router.replace(`/company/${data.slug}` as any) },
    ]);
  }

  const selectedOrgType = ORG_TYPES.find((t) => t.label === form.org_type);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.navBar, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Create Company Page</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 48, gap: 12 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View style={[styles.heroCard, { backgroundColor: BRAND + "10", borderColor: BRAND + "40" }]}>
            <Ionicons name="business" size={28} color={BRAND} />
            <Text style={[styles.heroTitle, { color: colors.text }]}>Create an Organization Page</Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
              Build a professional presence for your brand, company, or organization — just like LinkedIn Pages.
            </Text>
          </View>

          {/* Basic Info */}
          <Text style={[styles.groupLabel, { color: colors.text }]}>Page Identity</Text>

          <Field label="Page Name" required colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} placeholder="Your organization name" placeholderTextColor={colors.textMuted}
              value={form.name} onChangeText={(v) => set("name", v)} maxLength={100} />
          </Field>

          <Field label="Page URL" required hint={`afuchat.com/company/${form.slug || "your-slug"}`} colors={colors}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>/company/</Text>
              <TextInput
                style={[styles.input, { color: colors.text, flex: 1 }]}
                placeholder="your-company"
                placeholderTextColor={colors.textMuted}
                value={form.slug}
                onChangeText={(v) => { setSlugEdited(true); set("slug", slugify(v)); }}
                autoCapitalize="none"
                maxLength={60}
              />
            </View>
          </Field>

          <Field label="Tagline" colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} placeholder="Short description shown under the name"
              placeholderTextColor={colors.textMuted} value={form.tagline} onChangeText={(v) => set("tagline", v)} maxLength={160} />
          </Field>

          {/* Org Type */}
          <Field label="Organization Type" required colors={colors}>
            <TouchableOpacity
              style={[styles.pickerRow, { borderColor: form.org_type ? BRAND + "60" : colors.border, backgroundColor: form.org_type ? BRAND + "08" : "transparent" }]}
              onPress={() => setShowOrgTypePicker(true)} activeOpacity={0.75}
            >
              {selectedOrgType ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Ionicons name={selectedOrgType.icon as any} size={16} color={BRAND} />
                  <Text style={[styles.pickerValue, { color: colors.text }]}>{selectedOrgType.label}</Text>
                </View>
              ) : (
                <Text style={[styles.pickerPlaceholder, { color: colors.textMuted }]}>Select type…</Text>
              )}
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Field>

          {/* Industry */}
          <Field label="Industry" colors={colors}>
            <TouchableOpacity style={[styles.pickerRow, { borderColor: colors.border }]} onPress={() => setShowIndustryPicker(true)} activeOpacity={0.75}>
              {form.industry
                ? <Text style={[styles.pickerValue, { color: colors.text, flex: 1 }]}>{form.industry}</Text>
                : <Text style={[styles.pickerPlaceholder, { color: colors.textMuted, flex: 1 }]}>Select industry…</Text>
              }
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Field>

          {/* About */}
          <Text style={[styles.groupLabel, { color: colors.text, marginTop: 4 }]}>About</Text>

          <Field label="Description" colors={colors}>
            <TextInput style={[styles.input, styles.textarea, { color: colors.text }]}
              placeholder="Describe what your organization does, its mission, and impact…"
              placeholderTextColor={colors.textMuted} value={form.description}
              onChangeText={(v) => set("description", v)} multiline numberOfLines={4} maxLength={2000} />
          </Field>

          <Field label="Website" colors={colors}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="globe-outline" size={16} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text, flex: 1 }]} placeholder="https://yourcompany.com"
                placeholderTextColor={colors.textMuted} value={form.website} onChangeText={(v) => set("website", v)}
                autoCapitalize="none" keyboardType="url" maxLength={200} />
            </View>
          </Field>

          {/* Details */}
          <Text style={[styles.groupLabel, { color: colors.text, marginTop: 4 }]}>Details <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted }}>optional</Text></Text>

          <Field label="Location" colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} placeholder="e.g. Nairobi, Kenya"
              placeholderTextColor={colors.textMuted} value={form.location} onChangeText={(v) => set("location", v)} maxLength={100} />
          </Field>

          <Field label="Company Size" colors={colors}>
            <TouchableOpacity style={[styles.pickerRow, { borderColor: colors.border }]} onPress={() => setShowSizePicker(true)} activeOpacity={0.75}>
              {form.size
                ? <Text style={[styles.pickerValue, { color: colors.text, flex: 1 }]}>{form.size} employees</Text>
                : <Text style={[styles.pickerPlaceholder, { color: colors.textMuted, flex: 1 }]}>Select size…</Text>
              }
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Field>

          <Field label="Founded Year" colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} placeholder="e.g. 2020"
              placeholderTextColor={colors.textMuted} value={form.founded_year} onChangeText={(v) => set("founded_year", v)}
              keyboardType="numeric" maxLength={4} />
          </Field>

          <Field label="Contact Email" colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} placeholder="contact@yourcompany.com"
              placeholderTextColor={colors.textMuted} value={form.email} onChangeText={(v) => set("email", v)}
              keyboardType="email-address" autoCapitalize="none" maxLength={120} />
          </Field>

          {/* Social */}
          <Text style={[styles.groupLabel, { color: colors.text, marginTop: 4 }]}>Social Links <Text style={{ fontSize: 12, color: colors.textMuted, fontFamily: "Inter_400Regular" }}>optional</Text></Text>
          {[
            { key: "ig", label: "Instagram", icon: "logo-instagram", color: "#E1306C" },
            { key: "x_twitter", label: "X / Twitter", icon: "logo-twitter", color: "#1DA1F2" },
            { key: "linkedin", label: "LinkedIn", icon: "logo-linkedin", color: "#0A66C2" },
          ].map((s) => (
            <Field key={s.key} label={s.label} colors={colors}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name={s.icon as any} size={16} color={s.color} />
                <TextInput style={[styles.input, { color: colors.text, flex: 1 }]} placeholder={`@yourorg`}
                  placeholderTextColor={colors.textMuted} value={(form as any)[s.key]}
                  onChangeText={(v) => set(s.key, v)} autoCapitalize="none" maxLength={120} />
              </View>
            </Field>
          ))}

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: BRAND, opacity: submitting ? 0.7 : 1, marginTop: 8 }]}
            onPress={handleCreate} disabled={submitting} activeOpacity={0.85}
          >
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="business-outline" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>Create Page</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Org Type picker */}
      <Modal visible={showOrgTypePicker} transparent animationType="slide" onRequestClose={() => setShowOrgTypePicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowOrgTypePicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Organization Type</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {ORG_TYPES.map((t) => {
                const sel = form.org_type === t.label;
                return (
                  <TouchableOpacity key={t.label} style={[styles.pickerOption, { borderBottomColor: colors.border, backgroundColor: sel ? BRAND + "12" : "transparent" }]}
                    onPress={() => { set("org_type", t.label); setShowOrgTypePicker(false); }} activeOpacity={0.75}>
                    <View style={[styles.pickerOptionIcon, { backgroundColor: sel ? BRAND + "28" : colors.backgroundSecondary }]}>
                      <Ionicons name={t.icon as any} size={18} color={sel ? BRAND : colors.textSecondary} />
                    </View>
                    <Text style={[styles.pickerOptionText, { color: sel ? BRAND : colors.text, fontFamily: sel ? "Inter_600SemiBold" : "Inter_400Regular" }]}>{t.label}</Text>
                    {sel && <Ionicons name="checkmark" size={18} color={BRAND} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Industry picker */}
      <Modal visible={showIndustryPicker} transparent animationType="slide" onRequestClose={() => setShowIndustryPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowIndustryPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Industry</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {INDUSTRIES.map((ind) => {
                const sel = form.industry === ind;
                return (
                  <TouchableOpacity key={ind} style={[styles.pickerOption, { borderBottomColor: colors.border, backgroundColor: sel ? colors.backgroundSecondary : "transparent" }]}
                    onPress={() => { set("industry", ind); setShowIndustryPicker(false); }} activeOpacity={0.75}>
                    <Text style={[styles.pickerOptionText, { color: sel ? colors.text : colors.textSecondary, fontFamily: sel ? "Inter_600SemiBold" : "Inter_400Regular", flex: 1 }]}>{ind}</Text>
                    {sel && <Ionicons name="checkmark" size={18} color={BRAND} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Size picker */}
      <Modal visible={showSizePicker} transparent animationType="slide" onRequestClose={() => setShowSizePicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSizePicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Company Size</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {SIZE_OPTIONS.map((s) => {
                const sel = form.size === s;
                return (
                  <TouchableOpacity key={s} style={[styles.pickerOption, { borderBottomColor: colors.border, backgroundColor: sel ? BRAND + "12" : "transparent" }]}
                    onPress={() => { set("size", s); setShowSizePicker(false); }} activeOpacity={0.75}>
                    <Ionicons name="people-outline" size={18} color={sel ? BRAND : colors.textSecondary} />
                    <Text style={[styles.pickerOptionText, { color: sel ? BRAND : colors.text, fontFamily: sel ? "Inter_600SemiBold" : "Inter_400Regular", flex: 1 }]}>{s} employees</Text>
                    {sel && <Ionicons name="checkmark" size={18} color={BRAND} />}
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

function Field({ label, children, required, hint, colors }: { label: string; children: React.ReactNode; required?: boolean; hint?: string; colors: any }) {
  return (
    <View style={[fieldSt.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[fieldSt.label, { color: colors.textMuted }]}>
        {label}{required ? <Text style={{ color: "#FF3B30" }}> *</Text> : ""}
      </Text>
      {children}
      {hint ? <Text style={[fieldSt.hint, { color: colors.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

const fieldSt = StyleSheet.create({
  wrap: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.2 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  heroCard: { borderRadius: 14, borderWidth: 1, padding: 16, alignItems: "center", gap: 8 },
  heroTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  groupLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  input: { fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  textarea: { minHeight: 100, textAlignVertical: "top" },
  pickerRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  pickerValue: { fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 },
  pickerPlaceholder: { fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 },
  submitBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "70%" },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  pickerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  pickerOption: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerOptionIcon: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pickerOptionText: { fontSize: 15 },
});
