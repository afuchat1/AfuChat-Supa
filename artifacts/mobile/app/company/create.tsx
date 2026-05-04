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

const ORG_TYPES = [
  { label: "Company", icon: "business-outline" },
  { label: "Brand", icon: "pricetag-outline" },
  { label: "Non-Profit / NGO", icon: "heart-outline" },
  { label: "Government", icon: "flag-outline" },
  { label: "Media / Press", icon: "newspaper-outline" },
  { label: "Education", icon: "school-outline" },
  { label: "Religious Org", icon: "leaf-outline" },
  { label: "Sports / Entertainment", icon: "trophy-outline" },
  { label: "Other", icon: "ellipsis-horizontal-circle-outline" },
];

const SIZE_OPTIONS = [
  { label: "1–10", sub: "Micro" },
  { label: "11–50", sub: "Small" },
  { label: "51–200", sub: "Mid-size" },
  { label: "201–500", sub: "Growth" },
  { label: "501–1000", sub: "Large" },
  { label: "1000+", sub: "Enterprise" },
];

const INDUSTRIES = [
  "Technology", "Healthcare / Medical", "Finance / Banking", "Education",
  "Retail / E-commerce", "Media & Entertainment", "Food & Beverage", "Real Estate",
  "Manufacturing", "Transportation / Logistics", "Travel & Hospitality",
  "Legal / Professional Services", "Energy & Utilities", "Agriculture",
  "Construction", "Government / Public Sector", "Non-Profit / Charity",
  "Sports & Recreation", "Fashion & Beauty", "Other",
];

const TOTAL_STEPS = 3;

function slugify(text: string): string {
  return text.toLowerCase().trim()
    .replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60);
}

export default function CreateCompanyPageScreen() {
  const { colors, isDark } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const headerTop = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 16);

  const [step, setStep] = useState(1);
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showIndustryPicker, setShowIndustryPicker] = useState(false);

  const [form, setForm] = useState({
    name: "", slug: "", org_type: "",
    tagline: "", description: "", website: "",
    industry: "", size: "", location: "", physical_address: "",
    founded_year: "", email: "", ig: "", x_twitter: "", linkedin: "",
  });

  function set(field: string, val: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: val };
      if (field === "name" && !slugEdited) next.slug = slugify(val);
      return next;
    });
  }

  const canCreate = profile?.is_verified || profile?.is_organization_verified;

  if (!canCreate) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.nav, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: colors.text }]}>Create Page</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 }}>
          <View style={{ width: 88, height: 88, borderRadius: 22, backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="checkmark-circle" size={44} color={colors.accent} />
          </View>
          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center" }}>Verified Account Required</Text>
          <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", lineHeight: 22 }}>
            You need a verified account (blue checkmark) to create a company page. Once live, your page can separately apply for a verified page badge.
          </Text>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.accent }]}
            onPress={() => router.push("/premium")}
            activeOpacity={0.85}
          >
            <Ionicons name="diamond-outline" size={18} color="#fff" />
            <Text style={styles.submitBtnText}>Get Verified</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  async function handleCreate() {
    if (!form.name.trim()) { showAlert("Required", "Page name is required."); return; }
    if (!form.slug.trim() || !/^[a-z0-9-]+$/.test(form.slug)) {
      showAlert("Invalid slug", "Slug can only contain lowercase letters, numbers and dashes."); return;
    }
    if (!form.org_type) { showAlert("Required", "Please select an organization type."); return; }
    if (!user) return;
    setSubmitting(true);
    const social_links: Record<string, string> = {};
    if (form.ig.trim()) social_links.instagram = form.ig.trim();
    if (form.x_twitter.trim()) social_links.x_twitter = form.x_twitter.trim();
    if (form.linkedin.trim()) social_links.linkedin = form.linkedin.trim();
    const payload: any = {
      admin_id: user.id, name: form.name.trim(), slug: form.slug.trim(),
      org_type: form.org_type, social_links,
    };
    if (form.tagline.trim()) payload.tagline = form.tagline.trim();
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.website.trim()) payload.website = form.website.trim();
    if (form.industry.trim()) payload.industry = form.industry.trim();
    if (form.size) payload.size = form.size;
    if (form.location.trim()) payload.location = form.location.trim();
    if (form.physical_address.trim()) payload.physical_address = form.physical_address.trim();
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.founded_year.trim() && !isNaN(Number(form.founded_year)))
      payload.founded_year = Number(form.founded_year);
    const { data, error } = await supabase.from("organization_pages").insert(payload).select("slug").single();
    setSubmitting(false);
    if (error) {
      showAlert(error.code === "23505" ? "Slug taken" : "Error",
        error.code === "23505" ? "That page URL is already in use. Try a different one." : error.message || "Could not create page.");
      return;
    }
    showAlert("Page Created!", `"${form.name}" is live!`, [
      { text: "View Page", onPress: () => router.replace(`/company/${data.slug}` as any) },
    ]);
  }

  function goNext() {
    if (step === 1) {
      if (!form.name.trim()) { showAlert("Required", "Please enter a page name."); return; }
      if (!form.org_type) { showAlert("Required", "Please select an organization type."); return; }
    }
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
    else handleCreate();
  }

  const stepLabels = ["Identity", "Story", "Details"];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Nav */}
      <View style={[styles.nav, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={step === 1 ? () => router.back() : () => setStep((s) => s - 1)} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Create Page</Text>
        <Text style={[styles.stepCounter, { color: colors.textMuted }]}>{step}/{TOTAL_STEPS}</Text>
      </View>

      {/* Progress */}
      <View style={[styles.progressBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                {
                  backgroundColor: i < step ? colors.accent : (isDark ? "#333" : "#e0e0e0"),
                  flex: 1,
                },
              ]}
            />
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          {stepLabels.map((l, i) => (
            <Text key={l} style={[styles.progressLabel, { color: i + 1 === step ? colors.accent : colors.textMuted }]}>{l}</Text>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100, gap: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── STEP 1: Identity ── */}
          {step === 1 && (
            <>
              <View style={{ gap: 4, marginBottom: 4 }}>
                <Text style={[styles.stepTitle, { color: colors.text }]}>Who are you?</Text>
                <Text style={[styles.stepSub, { color: colors.textMuted }]}>Give your organization page an identity.</Text>
              </View>

              {/* Page Name */}
              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>PAGE NAME <Text style={{ color: "#FF3B30" }}>*</Text></Text>
                <TextInput
                  style={[styles.inputField, { color: colors.text }]}
                  placeholder="Your organization name"
                  placeholderTextColor={colors.textMuted}
                  value={form.name}
                  onChangeText={(v) => set("name", v)}
                  maxLength={100}
                  returnKeyType="next"
                />
              </View>

              {/* Slug */}
              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>PAGE URL <Text style={{ color: "#FF3B30" }}>*</Text></Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={[styles.slugPrefix, { color: colors.textMuted }]}>@</Text>
                  <TextInput
                    style={[styles.inputField, { color: colors.text, flex: 1 }]}
                    placeholder="your-page"
                    placeholderTextColor={colors.textMuted}
                    value={form.slug}
                    onChangeText={(v) => { setSlugEdited(true); set("slug", slugify(v)); }}
                    autoCapitalize="none"
                    maxLength={60}
                  />
                </View>
                <Text style={[styles.inputHint, { color: colors.textMuted }]}>afuchat.com/company/{form.slug || "your-page"}</Text>
              </View>

              {/* Org Type — card grid */}
              <View>
                <Text style={[styles.sectionLabel, { color: colors.text }]}>Organization Type <Text style={{ color: "#FF3B30" }}>*</Text></Text>
                <View style={styles.typeGrid}>
                  {ORG_TYPES.map((t) => {
                    const sel = form.org_type === t.label;
                    return (
                      <TouchableOpacity
                        key={t.label}
                        style={[styles.typeCard, {
                          backgroundColor: sel ? colors.accent + "14" : colors.surface,
                          borderColor: sel ? colors.accent : colors.border,
                        }]}
                        onPress={() => set("org_type", t.label)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name={t.icon as any} size={20} color={sel ? colors.accent : colors.textMuted} />
                        <Text style={[styles.typeLabel, { color: sel ? colors.accent : colors.text }]} numberOfLines={2}>{t.label}</Text>
                        {sel && (
                          <View style={[styles.typeCheck, { backgroundColor: colors.accent }]}>
                            <Ionicons name="checkmark" size={10} color="#fff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* ── STEP 2: Story ── */}
          {step === 2 && (
            <>
              <View style={{ gap: 4, marginBottom: 4 }}>
                <Text style={[styles.stepTitle, { color: colors.text }]}>Tell your story</Text>
                <Text style={[styles.stepSub, { color: colors.textMuted }]}>Help people understand what you stand for.</Text>
              </View>

              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>TAGLINE</Text>
                <TextInput
                  style={[styles.inputField, { color: colors.text }]}
                  placeholder="One line that captures your organization"
                  placeholderTextColor={colors.textMuted}
                  value={form.tagline}
                  onChangeText={(v) => set("tagline", v)}
                  maxLength={160}
                />
              </View>

              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>DESCRIPTION</Text>
                <TextInput
                  style={[styles.inputField, styles.textarea, { color: colors.text }]}
                  placeholder="What does your organization do? What's your mission?"
                  placeholderTextColor={colors.textMuted}
                  value={form.description}
                  onChangeText={(v) => set("description", v)}
                  multiline
                  numberOfLines={5}
                  maxLength={2000}
                />
                <Text style={[styles.charCount, { color: colors.textMuted }]}>{form.description.length}/2000</Text>
              </View>

              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>WEBSITE</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="globe-outline" size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.inputField, { color: colors.text, flex: 1 }]}
                    placeholder="https://yourcompany.com"
                    placeholderTextColor={colors.textMuted}
                    value={form.website}
                    onChangeText={(v) => set("website", v)}
                    autoCapitalize="none"
                    keyboardType="url"
                    maxLength={200}
                  />
                </View>
              </View>

              {/* Industry picker */}
              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>INDUSTRY</Text>
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}
                  onPress={() => setShowIndustryPicker(true)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.inputField, { color: form.industry ? colors.text : colors.textMuted, flex: 1 }]}>
                    {form.industry || "Select industry…"}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Company size */}
              <View>
                <Text style={[styles.sectionLabel, { color: colors.text }]}>Company Size</Text>
                <View style={styles.sizeRow}>
                  {SIZE_OPTIONS.map((s) => {
                    const sel = form.size === s.label;
                    return (
                      <TouchableOpacity
                        key={s.label}
                        style={[styles.sizeChip, {
                          backgroundColor: sel ? colors.accent : colors.surface,
                          borderColor: sel ? colors.accent : colors.border,
                        }]}
                        onPress={() => set("size", s.label)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.sizeChipLabel, { color: sel ? "#fff" : colors.text }]}>{s.label}</Text>
                        <Text style={[styles.sizeChipSub, { color: sel ? "rgba(255,255,255,0.75)" : colors.textMuted }]}>{s.sub}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* ── STEP 3: Details ── */}
          {step === 3 && (
            <>
              <View style={{ gap: 4, marginBottom: 4 }}>
                <Text style={[styles.stepTitle, { color: colors.text }]}>The details</Text>
                <Text style={[styles.stepSub, { color: colors.textMuted }]}>Optional info that makes your page stand out.</Text>
              </View>

              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>CITY / REGION</Text>
                <TextInput
                  style={[styles.inputField, { color: colors.text }]}
                  placeholder="e.g. Nairobi, Kenya"
                  placeholderTextColor={colors.textMuted}
                  value={form.location}
                  onChangeText={(v) => set("location", v)}
                  maxLength={100}
                />
              </View>

              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>PHYSICAL ADDRESS</Text>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <Ionicons name="location-outline" size={16} color={colors.textMuted} style={{ marginTop: 4 }} />
                  <TextInput
                    style={[styles.inputField, { color: colors.text, flex: 1, minHeight: 54, textAlignVertical: "top" }]}
                    placeholder={"Street address, building, floor…"}
                    placeholderTextColor={colors.textMuted}
                    value={form.physical_address}
                    onChangeText={(v) => set("physical_address", v)}
                    multiline
                    numberOfLines={2}
                    maxLength={300}
                  />
                </View>
              </View>

              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>FOUNDED YEAR</Text>
                <TextInput
                  style={[styles.inputField, { color: colors.text }]}
                  placeholder="e.g. 2018"
                  placeholderTextColor={colors.textMuted}
                  value={form.founded_year}
                  onChangeText={(v) => set("founded_year", v)}
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>

              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>CONTACT EMAIL</Text>
                <TextInput
                  style={[styles.inputField, { color: colors.text }]}
                  placeholder="contact@yourcompany.com"
                  placeholderTextColor={colors.textMuted}
                  value={form.email}
                  onChangeText={(v) => set("email", v)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  maxLength={120}
                />
              </View>

              {/* Social Links */}
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Social Links <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted }}>optional</Text></Text>
              {[
                { key: "ig", label: "Instagram", icon: "logo-instagram", color: "#E1306C", placeholder: "@yourorg" },
                { key: "x_twitter", label: "X / Twitter", icon: "logo-twitter", color: "#1DA1F2", placeholder: "@yourorg" },
                { key: "linkedin", label: "LinkedIn", icon: "logo-linkedin", color: "#0A66C2", placeholder: "linkedin.com/company/yourorg" },
              ].map((s) => (
                <View key={s.key} style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>{s.label.toUpperCase()}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons name={s.icon as any} size={16} color={s.color} />
                    <TextInput
                      style={[styles.inputField, { color: colors.text, flex: 1 }]}
                      placeholder={s.placeholder}
                      placeholderTextColor={colors.textMuted}
                      value={(form as any)[s.key]}
                      onChangeText={(v) => set(s.key, v)}
                      autoCapitalize="none"
                      maxLength={120}
                    />
                  </View>
                </View>
              ))}

              {/* Preview card */}
              <View style={[styles.previewCard, { backgroundColor: colors.accent + "0C", borderColor: colors.accent + "30" }]}>
                <Ionicons name="eye-outline" size={16} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.accent }]}>Page Preview</Text>
                  <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 17, marginTop: 2 }]}>
                    {form.name || "Your Organization"} · {form.org_type || "Organization"}{form.location ? ` · ${form.location}` : ""}
                  </Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {step > 1 && (
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: colors.border }]}
            onPress={() => setStep((s) => s - 1)}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back" size={18} color={colors.text} />
            <Text style={[styles.backBtnText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.accent, opacity: submitting ? 0.7 : 1, flex: step === 1 ? 1 : undefined }]}
          onPress={goNext}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : step < TOTAL_STEPS ? (
            <>
              <Text style={styles.nextBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          ) : (
            <>
              <Ionicons name="business-outline" size={18} color="#fff" />
              <Text style={styles.nextBtnText}>Create Page</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Industry picker modal */}
      <Modal visible={showIndustryPicker} transparent animationType="slide" onRequestClose={() => setShowIndustryPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowIndustryPicker(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.pickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Industry</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {INDUSTRIES.map((ind) => {
                const sel = form.industry === ind;
                return (
                  <TouchableOpacity
                    key={ind}
                    style={[styles.pickerOption, { borderBottomColor: colors.border, backgroundColor: sel ? colors.accent + "10" : "transparent" }]}
                    onPress={() => { set("industry", ind); setShowIndustryPicker(false); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.pickerOptionText, { color: sel ? colors.accent : colors.text, fontFamily: sel ? "Inter_600SemiBold" : "Inter_400Regular", flex: 1 }]}>{ind}</Text>
                    {sel && <Ionicons name="checkmark" size={18} color={colors.accent} />}
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  stepCounter: { fontSize: 13, fontFamily: "Inter_500Medium", width: 32, textAlign: "right" },
  progressBar: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  progressSegment: { height: 3, borderRadius: 2 },
  progressLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  stepTitle: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  stepSub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  inputGroup: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 13, gap: 6 },
  inputLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  inputField: { fontSize: 16, fontFamily: "Inter_400Regular", paddingVertical: 2 },
  inputHint: { fontSize: 11, fontFamily: "Inter_400Regular" },
  slugPrefix: { fontSize: 16, fontFamily: "Inter_400Regular" },
  textarea: { minHeight: 110, textAlignVertical: "top" },
  charCount: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  typeCard: { width: "30%", flexGrow: 1, borderRadius: 14, borderWidth: 1.5, padding: 12, alignItems: "center", gap: 6, position: "relative", minHeight: 80, justifyContent: "center" },
  typeLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  typeCheck: { position: "absolute", top: 7, right: 7, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sizeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sizeChip: { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", minWidth: "30%", flexGrow: 1 },
  sizeChipLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sizeChipSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  previewCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, borderWidth: 1, padding: 14 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, flexDirection: "row", gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  backBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  nextBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 14 },
  nextBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  submitBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  pickerSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 40, maxHeight: "70%" },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
  pickerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 8 },
  pickerOption: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerOptionText: { fontSize: 15 },
});
