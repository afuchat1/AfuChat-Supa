import React, { useEffect, useRef, useState } from "react";
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
import { aiGenerateOrgTagline, aiGenerateOrgDescription, type OrgAiContext } from "@/lib/aiHelper";

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

const COUNTRY_TO_JURISDICTION: Record<string, string> = {
  "Afghanistan": "af", "Albania": "al", "Algeria": "dz", "Angola": "ao",
  "Argentina": "ar", "Australia": "au", "Austria": "at", "Bangladesh": "bd",
  "Belgium": "be", "Bolivia": "bo", "Botswana": "bw", "Brazil": "br",
  "Bulgaria": "bg", "Cameroon": "cm", "Canada": "ca", "Chile": "cl",
  "China": "cn", "Colombia": "co", "Croatia": "hr", "Czech Republic": "cz",
  "Denmark": "dk", "Ecuador": "ec", "Egypt": "eg", "Estonia": "ee",
  "Ethiopia": "et", "Finland": "fi", "France": "fr", "Germany": "de",
  "Ghana": "gh", "Greece": "gr", "Guatemala": "gt", "Honduras": "hn",
  "Hungary": "hu", "India": "in", "Indonesia": "id", "Ireland": "ie",
  "Israel": "il", "Italy": "it", "Jamaica": "jm", "Japan": "jp",
  "Jordan": "jo", "Kazakhstan": "kz", "Kenya": "ke", "Latvia": "lv",
  "Lebanon": "lb", "Lithuania": "lt", "Luxembourg": "lu", "Malawi": "mw",
  "Malaysia": "my", "Mexico": "mx", "Moldova": "md", "Morocco": "ma",
  "Mozambique": "mz", "Namibia": "na", "Netherlands": "nl", "New Zealand": "nz",
  "Nicaragua": "ni", "Nigeria": "ng", "Norway": "no", "Pakistan": "pk",
  "Panama": "pa", "Paraguay": "py", "Peru": "pe", "Philippines": "ph",
  "Poland": "pl", "Portugal": "pt", "Romania": "ro", "Russia": "ru",
  "Rwanda": "rw", "Saudi Arabia": "sa", "Senegal": "sn", "Serbia": "rs",
  "Sierra Leone": "sl", "Singapore": "sg", "Slovakia": "sk", "Slovenia": "si",
  "South Africa": "za", "South Korea": "kr", "Spain": "es", "Sri Lanka": "lk",
  "Sweden": "se", "Switzerland": "ch", "Tanzania": "tz", "Thailand": "th",
  "Tunisia": "tn", "Turkey": "tr", "Uganda": "ug", "Ukraine": "ua",
  "United Arab Emirates": "ae", "United Kingdom": "gb", "United States": "us",
  "Uruguay": "uy", "Venezuela": "ve", "Vietnam": "vn", "Zambia": "zm",
  "Zimbabwe": "zw",
};

type RegResult = {
  name: string;
  company_number: string;
  incorporation_date: string | null;
  registered_address_in_full: string | null;
  current_status: string | null;
  jurisdiction_code: string;
};

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

  const [existingOrg, setExistingOrg] = useState<{ id: string; name: string } | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("organization_pages")
      .select("id, name")
      .eq("admin_id", user.id)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setExistingOrg((data as { id: string; name: string } | null)));
  }, [user?.id]);

  const [form, setForm] = useState({
    name: "", slug: "", org_type: "",
    tagline: "", description: "", website: "",
    industry: "", size: "", location: "", physical_address: "",
    founded_year: "", email: "", ig: "", x_twitter: "", linkedin: "",
    registration_number: "", jurisdiction_code: "",
  });

  const [regSearch, setRegSearch] = useState("");
  const [regResults, setRegResults] = useState<RegResult[]>([]);
  const [regSearching, setRegSearching] = useState(false);
  const [regSelected, setRegSelected] = useState<RegResult | null>(null);
  const [regError, setRegError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [aiTaglineLoading, setAiTaglineLoading] = useState(false);
  const [aiDescLoading, setAiDescLoading] = useState(false);

  const userCountry = profile?.country || null;
  const jurisdictionCode = userCountry ? (COUNTRY_TO_JURISDICTION[userCountry] || "") : "";

  function buildOrgCtx(): OrgAiContext {
    return {
      name: form.name.trim(),
      orgType: form.org_type || undefined,
      industry: form.industry || undefined,
      location: form.location || userCountry || undefined,
      foundedYear: form.founded_year || undefined,
      registrationNumber: form.registration_number || undefined,
      website: form.website || undefined,
      tagline: form.tagline || undefined,
    };
  }

  async function generateTagline() {
    if (!form.name.trim()) { showAlert("Name required", "Enter your organization name first (Step 1)."); return; }
    setAiTaglineLoading(true);
    try {
      const result = await aiGenerateOrgTagline(buildOrgCtx());
      set("tagline", result.slice(0, 160));
    } catch {
      showAlert("AI unavailable", "Could not reach the AI service. Please try again.");
    } finally {
      setAiTaglineLoading(false);
    }
  }

  async function generateDescription() {
    if (!form.name.trim()) { showAlert("Name required", "Enter your organization name first (Step 1)."); return; }
    setAiDescLoading(true);
    try {
      const result = await aiGenerateOrgDescription(buildOrgCtx());
      set("description", result.slice(0, 2000));
    } catch {
      showAlert("AI unavailable", "Could not reach the AI service. Please try again.");
    } finally {
      setAiDescLoading(false);
    }
  }

  useEffect(() => {
    if (userCountry && !form.location) {
      setForm((prev) => ({ ...prev, location: userCountry, jurisdiction_code: jurisdictionCode }));
    }
  }, [userCountry]);

  function set(field: string, val: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: val };
      if (field === "name" && !slugEdited) next.slug = slugify(val);
      return next;
    });
  }

  async function searchRegisteredCompany(query: string) {
    if (!query.trim() || query.trim().length < 2) { setRegResults([]); return; }
    setRegSearching(true);
    setRegError("");
    try {
      const jcode = jurisdictionCode || "gb";
      const url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(query.trim())}&jurisdiction_code=${jcode}&per_page=10&format=json`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error("Registry unavailable");
      const json = await res.json();
      const companies: RegResult[] = (json?.results?.companies || []).map((c: any) => ({
        name: c.company?.name || "",
        company_number: c.company?.company_number || "",
        incorporation_date: c.company?.incorporation_date || null,
        registered_address_in_full: c.company?.registered_address_in_full || null,
        current_status: c.company?.current_status || null,
        jurisdiction_code: c.company?.jurisdiction_code || jcode,
      }));
      setRegResults(companies);
      if (companies.length === 0) setRegError("No registered companies found. Try a different name.");
    } catch {
      setRegError("Could not reach the registry. Check your connection and try again.");
      setRegResults([]);
    } finally {
      setRegSearching(false);
    }
  }

  function onRegSearchChange(text: string) {
    setRegSearch(text);
    setRegSelected(null);
    setRegError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchRegisteredCompany(text), 600);
  }

  function selectRegisteredCompany(company: RegResult) {
    setRegSelected(company);
    setRegResults([]);
    setRegSearch(company.name);
    const year = company.incorporation_date ? company.incorporation_date.slice(0, 4) : "";
    setSlugEdited(false);
    setForm((prev) => ({
      ...prev,
      name: company.name,
      slug: slugify(company.name),
      registration_number: company.company_number,
      jurisdiction_code: company.jurisdiction_code,
      founded_year: year,
      physical_address: company.registered_address_in_full || prev.physical_address,
    }));
  }

  const canCreate = profile?.is_verified || profile?.is_organization_verified;

  if (existingOrg !== undefined && existingOrg !== null) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.nav, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.accent} />
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: colors.text }]}>Create Page</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 }}>
          <View style={{ width: 88, height: 88, borderRadius: 22, backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="business" size={44} color={colors.accent} />
          </View>
          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center" }}>You Already Have an Organization</Text>
          <Text style={{ fontSize: 15, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", lineHeight: 22 }}>
            Each account can only have one organization page. You can manage your existing page "{existingOrg.name}" instead.
          </Text>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.accent }]}
            onPress={() => router.replace("/company" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="business-outline" size={18} color="#fff" />
            <Text style={styles.submitBtnText}>Go to My Page</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!canCreate) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.nav, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.accent} />
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
    if (form.registration_number.trim()) payload.registration_number = form.registration_number.trim();
    if (form.jurisdiction_code.trim()) payload.jurisdiction_code = form.jurisdiction_code.trim();
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
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
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

              {/* ── Registry Search ── */}
              <View style={[styles.registryCard, { backgroundColor: colors.surface, borderColor: colors.accent + "40" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <View style={[styles.registryIconWrap, { backgroundColor: colors.accent + "14" }]}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.registryTitle, { color: colors.text }]}>Find Your Registered Company</Text>
                    <Text style={[styles.registrySub, { color: colors.textMuted }]}>
                      {userCountry
                        ? `Searching ${userCountry} government registry`
                        : "Search the government business registry"}
                      {!jurisdictionCode && userCountry ? " (not yet supported — fill manually below)" : ""}
                    </Text>
                  </View>
                  {userCountry ? (
                    <View style={[styles.countryBadge, { backgroundColor: colors.accent + "14" }]}>
                      <Text style={[styles.countryBadgeText, { color: colors.accent }]}>{userCountry}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Search input */}
                <View style={[styles.regSearchRow, { backgroundColor: isDark ? colors.background : "#f5f5f7", borderColor: colors.border }]}>
                  <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                  <TextInput
                    style={[styles.regSearchInput, { color: colors.text }]}
                    placeholder="Type registered company name…"
                    placeholderTextColor={colors.textMuted}
                    value={regSearch}
                    onChangeText={onRegSearchChange}
                    returnKeyType="search"
                    onSubmitEditing={() => searchRegisteredCompany(regSearch)}
                    editable={!!jurisdictionCode}
                  />
                  {regSearching && <ActivityIndicator size="small" color={colors.accent} />}
                  {regSearch.length > 0 && !regSearching && (
                    <TouchableOpacity onPress={() => { setRegSearch(""); setRegResults([]); setRegSelected(null); setRegError(""); }} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Selected company badge */}
                {regSelected && (
                  <View style={[styles.regSelectedBadge, { backgroundColor: colors.accent + "12", borderColor: colors.accent + "30" }]}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.regSelectedName, { color: colors.accent }]} numberOfLines={1}>{regSelected.name}</Text>
                      <Text style={[styles.regSelectedSub, { color: colors.textMuted }]}>
                        Reg. {regSelected.company_number}{regSelected.current_status ? ` · ${regSelected.current_status}` : ""}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => { setRegSelected(null); setRegSearch(""); setForm((p) => ({ ...p, registration_number: "", jurisdiction_code: jurisdictionCode })); }} hitSlop={8}>
                      <Ionicons name="close" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Results */}
                {regResults.length > 0 && (
                  <View style={[styles.regResultsList, { borderColor: colors.border }]}>
                    {regResults.map((r, idx) => (
                      <TouchableOpacity
                        key={`${r.company_number}-${idx}`}
                        style={[styles.regResultRow, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}
                        onPress={() => selectRegisteredCompany(r)}
                        activeOpacity={0.75}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.regResultName, { color: colors.text }]} numberOfLines={2}>{r.name}</Text>
                          <Text style={[styles.regResultSub, { color: colors.textMuted }]}>
                            #{r.company_number}
                            {r.incorporation_date ? ` · Inc. ${r.incorporation_date.slice(0, 4)}` : ""}
                            {r.current_status ? ` · ${r.current_status}` : ""}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Error */}
                {regError.length > 0 && (
                  <Text style={[styles.regError, { color: colors.textMuted }]}>{regError}</Text>
                )}

                {!jurisdictionCode && (
                  <Text style={[styles.regError, { color: colors.textMuted }]}>
                    Registry lookup not available for your country yet. Please fill the form below manually.
                  </Text>
                )}
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

              {/* Registration number — shown once user has one selected or types manually */}
              {(form.registration_number || regSelected) && (
                <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>REGISTRATION NUMBER</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="document-text-outline" size={15} color={colors.textMuted} />
                    <TextInput
                      style={[styles.inputField, { color: colors.text, flex: 1 }]}
                      placeholder="Government registration number"
                      placeholderTextColor={colors.textMuted}
                      value={form.registration_number}
                      onChangeText={(v) => set("registration_number", v)}
                      autoCapitalize="characters"
                      maxLength={50}
                    />
                  </View>
                </View>
              )}

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

              {/* AI context hint */}
              <View style={[styles.aiHintBanner, { backgroundColor: colors.accent + "0E", borderColor: colors.accent + "35" }]}>
                <Ionicons name="sparkles" size={14} color={colors.accent} />
                <Text style={[styles.aiHintText, { color: colors.textMuted }]}>
                  AI generates content based only on the facts you've entered — no invented details.
                  {form.name ? ` Working with: ${form.name}${form.org_type ? ` · ${form.org_type}` : ""}${form.industry ? ` · ${form.industry}` : ""}.` : " Add a name and org type in Step 1 first."}
                </Text>
              </View>

              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>TAGLINE</Text>
                  <TouchableOpacity
                    style={[styles.aiBtn, { backgroundColor: aiTaglineLoading ? colors.accent + "20" : colors.accent + "14", borderColor: colors.accent + "40" }]}
                    onPress={generateTagline}
                    disabled={aiTaglineLoading}
                    activeOpacity={0.75}
                  >
                    {aiTaglineLoading
                      ? <ActivityIndicator size={11} color={colors.accent} />
                      : <Ionicons name="sparkles" size={12} color={colors.accent} />
                    }
                    <Text style={[styles.aiBtnText, { color: colors.accent }]}>
                      {aiTaglineLoading ? "Generating…" : form.tagline ? "Regenerate" : "Generate"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.inputField, { color: colors.text }]}
                  placeholder="One line that captures your organization"
                  placeholderTextColor={colors.textMuted}
                  value={form.tagline}
                  onChangeText={(v) => set("tagline", v)}
                  maxLength={160}
                />
                <Text style={[styles.charCount, { color: colors.textMuted }]}>{form.tagline.length}/160</Text>
              </View>

              <View style={[styles.inputGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>DESCRIPTION</Text>
                  <TouchableOpacity
                    style={[styles.aiBtn, { backgroundColor: aiDescLoading ? colors.accent + "20" : colors.accent + "14", borderColor: colors.accent + "40" }]}
                    onPress={generateDescription}
                    disabled={aiDescLoading}
                    activeOpacity={0.75}
                  >
                    {aiDescLoading
                      ? <ActivityIndicator size={11} color={colors.accent} />
                      : <Ionicons name="sparkles" size={12} color={colors.accent} />
                    }
                    <Text style={[styles.aiBtnText, { color: colors.accent }]}>
                      {aiDescLoading ? "Generating…" : form.description ? "Regenerate" : "Generate"}
                    </Text>
                  </TouchableOpacity>
                </View>
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
                  {form.registration_number ? (
                    <Text style={[{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.accent, marginTop: 3 }]}>
                      Reg. {form.registration_number}
                    </Text>
                  ) : null}
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
            <Ionicons name="chevron-back" size={18} color={colors.accent} />
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
  navTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },
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
  aiHintBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  aiHintText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 17 },
  aiBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  aiBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  registryCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 10 },
  registryIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  registryTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  registrySub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  countryBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  countryBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  regSearchRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },
  regSearchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  regResultsList: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginTop: 2 },
  regResultRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  regResultName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  regResultSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  regSelectedBadge: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 2 },
  regSelectedName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  regSelectedSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  regError: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 4 },
});
