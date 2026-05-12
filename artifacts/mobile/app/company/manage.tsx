import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";
import { aiResearchCompanyAndGenerateAbout } from "@/lib/aiHelper";

const GOLD = "#D4A853";

const ORG_TYPES = [
  "Company / Private Ltd", "Non-Profit / NGO", "Government / Public Body",
  "Partnership", "Sole Trader", "Cooperative", "Educational Institution", "Other",
];
const INDUSTRIES = [
  "Technology", "Finance & Banking", "Healthcare & Wellness", "Education",
  "Retail & E-commerce", "Media & Entertainment", "Agriculture & Food",
  "Manufacturing", "Construction & Real Estate", "Hospitality & Tourism",
  "Legal & Professional Services", "Energy & Utilities", "Transport & Logistics", "Other",
];
const ORG_SIZES = ["1–10", "11–50", "51–200", "201–500", "501–1,000", "1,001–5,000", "5,000+"];

type OrgPage = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  website: string | null;
  email: string | null;
  industry: string | null;
  org_type: string | null;
  size: string | null;
  founded_year: number | null;
  location: string | null;
  physical_address: string | null;
  registration_number: string | null;
  jurisdiction_code: string | null;
  social_links: Record<string, string>;
  admin_id: string;
  is_verified: boolean;
  followers_count: number;
  posts_count: number;
};

type VerifyRequest = {
  id: string;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  created_at: string;
};

export default function ManageCompanyPageScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const headerTop = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 16);

  const [page, setPage] = useState<OrgPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [verifyRequest, setVerifyRequest] = useState<VerifyRequest | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState("");
  const [submittingVerify, setSubmittingVerify] = useState(false);
  const [aboutAiLoading, setAboutAiLoading] = useState(false);

  const [verOrgType, setVerOrgType] = useState("");
  const [verIndustry, setVerIndustry] = useState("");
  const [verSize, setVerSize] = useState("");
  const [verRegNum, setVerRegNum] = useState("");
  const [verEmail, setVerEmail] = useState("");
  const [verAddress, setVerAddress] = useState("");
  const [verPickerVisible, setVerPickerVisible] = useState(false);
  const [verPickerKey, setVerPickerKey] = useState<"orgType" | "industry" | "size">("orgType");

  const [form, setForm] = useState({
    name: "", tagline: "", description: "", website: "", email: "",
    industry: "", org_type: "", size: "", founded_year: "", location: "", physical_address: "",
    registration_number: "",
    ig: "", x_twitter: "", linkedin: "",
  });

  const load = useCallback(async () => {
    if (!slug || !user) return;
    const [{ data }, { data: verReqs }] = await Promise.all([
      supabase.from("organization_pages").select("*").eq("slug", slug).single(),
      supabase
        .from("org_verification_requests")
        .select("id, status, notes, created_at")
        .eq("submitted_by", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (data) {
      setPage(data as OrgPage);
      setForm({
        name: data.name || "",
        tagline: data.tagline || "",
        description: data.description || "",
        website: data.website || "",
        email: data.email || "",
        industry: data.industry || "",
        org_type: data.org_type || "",
        size: data.size || "",
        founded_year: data.founded_year ? String(data.founded_year) : "",
        location: data.location || "",
        physical_address: data.physical_address || "",
        registration_number: data.registration_number || "",
        ig: data.social_links?.instagram || "",
        x_twitter: data.social_links?.x_twitter || "",
        linkedin: data.social_links?.linkedin || "",
      });
    }
    setVerifyRequest(verReqs as VerifyRequest | null);
    setLoading(false);
  }, [slug, user?.id]);

  useEffect(() => { load(); }, [load]);

  function set(field: string, val: string) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  function openVerifyModal() {
    if (!page) return;
    setVerOrgType(page.org_type || form.org_type || "");
    setVerIndustry(page.industry || form.industry || "");
    setVerSize(page.size || form.size || "");
    setVerRegNum(page.registration_number || form.registration_number || "");
    setVerEmail(page.email || form.email || "");
    setVerAddress(page.physical_address || form.physical_address || "");
    setVerifyNotes("");
    setShowVerifyModal(true);
  }

  async function submitVerifyRequest() {
    if (!page || !user) return;
    if (!verRegNum.trim()) {
      showAlert("Required", "Please enter a registration number before submitting.");
      return;
    }
    setSubmittingVerify(true);
    const updates: Record<string, string | null> = {};
    if (verOrgType && verOrgType !== page.org_type) updates.org_type = verOrgType;
    if (verIndustry && verIndustry !== page.industry) updates.industry = verIndustry;
    if (verSize && verSize !== page.size) updates.size = verSize;
    if (verRegNum.trim() !== (page.registration_number ?? "")) updates.registration_number = verRegNum.trim();
    if (verEmail.trim() !== (page.email ?? "")) updates.email = verEmail.trim() || null;
    if (verAddress.trim() !== (page.physical_address ?? "")) updates.physical_address = verAddress.trim() || null;
    if (Object.keys(updates).length > 0) {
      await supabase.from("organization_pages").update(updates).eq("id", page.id);
    }
    const { error } = await supabase.from("org_verification_requests").insert({
      page_id: page.id,
      submitted_by: user.id,
      notes: verifyNotes.trim() || null,
    });
    setSubmittingVerify(false);
    if (error) {
      showAlert("Error", error.message || "Could not submit request.");
      return;
    }
    setShowVerifyModal(false);
    setVerifyNotes("");
    showAlert("Request submitted", "Our team will review your verification request and get back to you.");
    load();
  }

  async function pickLogo() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) setLogoUri(result.assets[0].uri);
  }

  async function pickCover() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) setCoverUri(result.assets[0].uri);
  }

  async function handleSave() {
    if (!page || !user) return;
    if (!form.name.trim()) { showAlert("Required", "Page name cannot be empty."); return; }

    setSaving(true);

    const social_links: Record<string, string> = {};
    if (form.ig.trim()) social_links.instagram = form.ig.trim();
    if (form.x_twitter.trim()) social_links.x_twitter = form.x_twitter.trim();
    if (form.linkedin.trim()) social_links.linkedin = form.linkedin.trim();

    const updates: any = {
      name: form.name.trim(),
      tagline: form.tagline.trim() || null,
      description: form.description.trim() || null,
      website: form.website.trim() || null,
      email: form.email.trim() || null,
      industry: form.industry.trim() || null,
      org_type: form.org_type.trim() || null,
      size: form.size || null,
      location: form.location.trim() || null,
      physical_address: form.physical_address.trim() || null,
      registration_number: form.registration_number.trim() || null,
      social_links,
    };
    if (form.founded_year.trim() && !isNaN(Number(form.founded_year))) {
      updates.founded_year = Number(form.founded_year);
    } else {
      updates.founded_year = null;
    }

    if (logoUri) {
      setUploadingLogo(true);
      const ext = logoUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
      const { publicUrl, error: uploadErr } = await uploadToStorage(
        "org-logos",
        `${user.id}/${page.id}_logo.${ext}`,
        logoUri,
      );
      setUploadingLogo(false);
      if (!publicUrl) {
        setSaving(false);
        showAlert("Upload failed", uploadErr || "Could not upload logo. Please try again.");
        return;
      }
      updates.logo_url = publicUrl;
    }

    if (coverUri) {
      setUploadingCover(true);
      const ext = coverUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
      const { publicUrl, error: uploadErr } = await uploadToStorage(
        "org-covers",
        `${user.id}/${page.id}_cover.${ext}`,
        coverUri,
      );
      setUploadingCover(false);
      if (!publicUrl) {
        setSaving(false);
        showAlert("Upload failed", uploadErr || "Could not upload cover image. Please try again.");
        return;
      }
      updates.cover_url = publicUrl;
    }

    const { error } = await supabase.from("organization_pages").update(updates).eq("id", page.id);
    setSaving(false);

    if (error) {
      showAlert("Error", error.message || "Could not save changes.");
      return;
    }
    showAlert("Saved", "Your page has been updated.", [
      { text: "View Page", onPress: () => router.replace(`/company/${page.slug}` as any) },
      { text: "OK", style: "cancel" },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.navBar, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.accent} />
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: colors.text }]}>Manage Page</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </View>
    );
  }

  if (!page || page.admin_id !== user?.id) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.navBar, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.accent} />
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: colors.text }]}>Manage Page</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>Access denied.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.navBar, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Manage Page</Text>
        <TouchableOpacity onPress={() => router.push(`/company/${page.slug}` as any)} hitSlop={12}>
          <Ionicons name="eye-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 60, gap: 12 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cover image picker */}
          <View style={[styles.imageSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.groupLabel, { color: colors.text, marginTop: 0 }]}>Cover Image</Text>
            <TouchableOpacity onPress={pickCover} activeOpacity={0.8} style={styles.coverPickerWrap}>
              {coverUri || page.cover_url ? (
                <Image
                  source={{ uri: coverUri ?? page.cover_url! }}
                  style={styles.coverPreview}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.coverPlaceholder, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                  <Text style={[styles.placeholderLabel, { color: colors.textMuted }]}>Tap to add cover image</Text>
                </View>
              )}
              <View style={styles.coverEditBadge}>
                {uploadingCover
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="camera" size={16} color="#fff" />}
              </View>
            </TouchableOpacity>

            {/* Logo picker */}
            <View style={styles.logoPickerRow}>
              <TouchableOpacity onPress={pickLogo} activeOpacity={0.8} style={styles.logoPickerWrap}>
                {logoUri || page.logo_url ? (
                  <Image
                    source={{ uri: logoUri ?? page.logo_url! }}
                    style={styles.logoPreview}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.logoPreview, { backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }]}>
                    <Text style={{ color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold" }}>
                      {page.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={[styles.logoEditBadge, { backgroundColor: colors.accent }]}>
                  {uploadingLogo
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="camera" size={12} color="#fff" />}
                </View>
              </TouchableOpacity>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.groupLabel, { color: colors.text, marginTop: 0 }]}>Logo</Text>
                <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted }]}>
                  Square image, min 200×200px
                </Text>
              </View>
            </View>
          </View>

          {/* Stats banner */}
          <View style={[styles.statsBanner, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "30" }]}>
            <StatItem icon="people" value={page.followers_count} label="Followers" accent={colors.accent} />
            <View style={[styles.statDivider, { backgroundColor: colors.accent + "30" }]} />
            <StatItem icon="newspaper" value={page.posts_count} label="Updates" accent={colors.accent} />
            <View style={[styles.statDivider, { backgroundColor: colors.accent + "30" }]} />
            <TouchableOpacity style={styles.statCta} onPress={() => router.push(`/company/${page.slug}` as any)}>
              <Ionicons name="open-outline" size={14} color={colors.accent} />
              <Text style={[styles.statCtaText, { color: colors.accent }]}>View live</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.groupLabel, { color: colors.text }]}>Page Identity</Text>

          <Field label="Page Name" required colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} value={form.name} onChangeText={(v) => set("name", v)} maxLength={100} />
          </Field>
          <Field label="Tagline" colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} value={form.tagline} onChangeText={(v) => set("tagline", v)} maxLength={160} placeholder="Short description" placeholderTextColor={colors.textMuted} />
          </Field>

          <Text style={[styles.groupLabel, { color: colors.text }, { marginTop: 4 }]}>About</Text>
          <Field label="Description" colors={colors}>
            <TextInput style={[styles.input, styles.textarea, { color: colors.text }]} value={form.description} onChangeText={(v) => set("description", v)} multiline numberOfLines={4} maxLength={2000} placeholder="Describe your organization…" placeholderTextColor={colors.textMuted} />
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.accent + "0D", borderWidth: 1, borderColor: colors.accent + "30", alignSelf: "flex-start" }}
              activeOpacity={0.75}
              disabled={aboutAiLoading || !form.name.trim()}
              onPress={async () => {
                if (!form.name.trim()) return;
                setAboutAiLoading(true);
                try {
                  const about = await aiResearchCompanyAndGenerateAbout({
                    orgName: form.name.trim(),
                    orgType: form.org_type || undefined,
                    industry: form.industry || undefined,
                    location: form.location || undefined,
                    website: form.website || undefined,
                    description: form.description || undefined,
                    tagline: form.tagline || undefined,
                  });
                  set("description", about.slice(0, 2000));
                } catch {
                  showAlert("AI Error", "Could not generate description. Please try again.");
                }
                setAboutAiLoading(false);
              }}
            >
              {aboutAiLoading
                ? <ActivityIndicator size="small" color={colors.accent} />
                : <Ionicons name="sparkles" size={14} color={colors.accent} />
              }
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.accent }}>
                {aboutAiLoading ? "Researching…" : "Write with AI"}
              </Text>
            </TouchableOpacity>
          </Field>
          <Field label="Website" colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} value={form.website} onChangeText={(v) => set("website", v)} autoCapitalize="none" keyboardType="url" maxLength={200} placeholder="https://…" placeholderTextColor={colors.textMuted} />
          </Field>
          <Field label="Contact Email" colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} value={form.email} onChangeText={(v) => set("email", v)} keyboardType="email-address" autoCapitalize="none" maxLength={120} />
          </Field>

          <Text style={[styles.groupLabel, { color: colors.text }, { marginTop: 4 }]}>Details</Text>
          <Field label="City / Region" colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} value={form.location} onChangeText={(v) => set("location", v)} maxLength={100} placeholder="e.g. Nairobi, Kenya" placeholderTextColor={colors.textMuted} />
          </Field>
          <Field label="Registration Number" colors={colors}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="document-text-outline" size={15} color={colors.textMuted} />
              <TextInput style={[styles.input, { color: colors.text, flex: 1 }]} value={form.registration_number} onChangeText={(v) => set("registration_number", v)} autoCapitalize="characters" maxLength={50} placeholder="Government registration number" placeholderTextColor={colors.textMuted} />
            </View>
          </Field>
          <Field label="Physical Address" colors={colors}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Ionicons name="location-outline" size={15} color={colors.textMuted} style={{ marginTop: 6 }} />
              <TextInput
                style={[styles.input, styles.textarea, { color: colors.text, flex: 1, minHeight: 54 }]}
                value={form.physical_address}
                onChangeText={(v) => set("physical_address", v)}
                multiline
                numberOfLines={2}
                maxLength={300}
                placeholder={"Street address, building, floor…"}
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </Field>
          <Field label="Founded Year" colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} value={form.founded_year} onChangeText={(v) => set("founded_year", v)} keyboardType="numeric" maxLength={4} placeholder="e.g. 2018" placeholderTextColor={colors.textMuted} />
          </Field>
          <Field label="Industry" colors={colors}>
            <TextInput style={[styles.input, { color: colors.text }]} value={form.industry} onChangeText={(v) => set("industry", v)} maxLength={100} placeholder="e.g. Technology" placeholderTextColor={colors.textMuted} />
          </Field>

          <Text style={[styles.groupLabel, { color: colors.text }, { marginTop: 4 }]}>Social Links</Text>
          {[
            { key: "ig", label: "Instagram", icon: "logo-instagram", color: "#E1306C" },
            { key: "x_twitter", label: "X / Twitter", icon: "logo-twitter", color: "#1DA1F2" },
            { key: "linkedin", label: "LinkedIn", icon: "logo-linkedin", color: "#0A66C2" },
          ].map((s) => (
            <Field key={s.key} label={s.label} colors={colors}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name={s.icon as any} size={16} color={s.color} />
                <TextInput style={[styles.input, { color: colors.text, flex: 1 }]} value={(form as any)[s.key]}
                  onChangeText={(v) => set(s.key, v)} autoCapitalize="none" maxLength={120} placeholder="@handle or URL" placeholderTextColor={colors.textMuted} />
              </View>
            </Field>
          ))}

          {/* Slug note */}
          <View style={[styles.slugNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="link-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.slugNoteText, { color: colors.textMuted }]}>
              Page URL: <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.textSecondary }}>afuchat.com/company/{page.slug}</Text>
            </Text>
          </View>

          {/* ── Verification section ── */}
          <Text style={[styles.groupLabel, { color: colors.text, marginTop: 4 }]}>Page Verification</Text>
          {page.is_verified ? (
            <View style={[styles.verifyCard, { backgroundColor: GOLD + "14", borderColor: GOLD + "44" }]}>
              <Ionicons name="checkmark-circle" size={22} color={GOLD} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.verifyCardTitle, { color: GOLD }]}>Verified Organization</Text>
                <Text style={[styles.verifyCardSub, { color: colors.textMuted }]}>
                  This page has been officially verified by AfuChat.
                </Text>
              </View>
            </View>
          ) : verifyRequest?.status === "pending" ? (
            <View style={[styles.verifyCard, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "30" }]}>
              <Ionicons name="time-outline" size={22} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.verifyCardTitle, { color: colors.accent }]}>Verification Pending</Text>
                <Text style={[styles.verifyCardSub, { color: colors.textMuted }]}>
                  Submitted {new Date(verifyRequest.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. Our team will review it shortly.
                </Text>
              </View>
            </View>
          ) : verifyRequest?.status === "rejected" ? (
            <TouchableOpacity
              style={[styles.verifyCard, { backgroundColor: "#FF3B3010", borderColor: "#FF3B3030" }]}
              onPress={openVerifyModal}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={22} color="#FF3B30" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.verifyCardTitle, { color: "#FF3B30" }]}>Verification Not Approved</Text>
                <Text style={[styles.verifyCardSub, { color: colors.textMuted }]}>
                  Tap to re-apply with updated information.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.verifyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={openVerifyModal}
              activeOpacity={0.8}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD + "18", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark-circle-outline" size={22} color={GOLD} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.verifyCardTitle, { color: colors.text }]}>Apply for Verification</Text>
                <Text style={[styles.verifyCardSub, { color: colors.textMuted }]}>
                  Get the gold badge for your organization page.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.accent, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave} disabled={saving} activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Verification request modal */}
      <Modal visible={showVerifyModal} transparent animationType="slide" onRequestClose={() => setShowVerifyModal(false)}>
        <TouchableOpacity style={verSt.overlay} activeOpacity={1} onPress={() => setShowVerifyModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <ScrollView
              style={[verSt.sheet, { backgroundColor: colors.surface }]}
              contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[verSt.handle, { backgroundColor: colors.border }]} />

              <View style={verSt.headerRow}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD + "18", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="checkmark-circle-outline" size={22} color={GOLD} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[verSt.title, { color: colors.text }]}>Apply for Verification</Text>
                  <Text style={[verSt.sub, { color: colors.textMuted }]}>For <Text style={{ fontFamily: "Inter_600SemiBold" }}>{page.name}</Text></Text>
                </View>
                <TouchableOpacity onPress={() => setShowVerifyModal(false)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[verSt.sectionLabel, { color: colors.textMuted }]}>ORGANIZATION TYPE</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {ORG_TYPES.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[verSt.chip, { borderColor: verOrgType === opt ? GOLD : colors.border, backgroundColor: verOrgType === opt ? GOLD + "18" : colors.background }]}
                    onPress={() => setVerOrgType(opt)}
                    activeOpacity={0.75}
                  >
                    <Text style={[verSt.chipText, { color: verOrgType === opt ? GOLD : colors.textSecondary }]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[verSt.sectionLabel, { color: colors.textMuted, marginTop: 8 }]}>INDUSTRY</Text>
              <TouchableOpacity
                style={[verSt.dropdown, { backgroundColor: colors.background, borderColor: verIndustry ? GOLD + "66" : colors.border }]}
                onPress={() => { setVerPickerKey("industry"); setVerPickerVisible(true); }}
                activeOpacity={0.8}
              >
                <Ionicons name="briefcase-outline" size={15} color={verIndustry ? GOLD : colors.textMuted} />
                <Text style={[verSt.dropdownText, { color: verIndustry ? colors.text : colors.textMuted, flex: 1 }]}>
                  {verIndustry || "Select industry…"}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </TouchableOpacity>

              <Text style={[verSt.sectionLabel, { color: colors.textMuted, marginTop: 8 }]}>TEAM SIZE</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {ORG_SIZES.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[verSt.chip, { borderColor: verSize === opt ? GOLD : colors.border, backgroundColor: verSize === opt ? GOLD + "18" : colors.background }]}
                    onPress={() => setVerSize(opt)}
                    activeOpacity={0.75}
                  >
                    <Text style={[verSt.chipText, { color: verSize === opt ? GOLD : colors.textSecondary }]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[verSt.sectionLabel, { color: colors.textMuted, marginTop: 8 }]}>VERIFICATION DETAILS</Text>

              <View style={[verSt.infoBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={verSt.infoRow}>
                  <Ionicons name="document-text-outline" size={14} color={colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[verSt.infoLabel, { color: colors.textMuted }]}>Registration Number *</Text>
                    <TextInput
                      style={[verSt.inlineInput, { color: colors.text }]}
                      value={verRegNum}
                      onChangeText={setVerRegNum}
                      autoCapitalize="characters"
                      maxLength={60}
                      placeholder="Government registration number"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </View>
                <View style={[verSt.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }]}>
                  <Ionicons name="mail-outline" size={14} color={colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[verSt.infoLabel, { color: colors.textMuted }]}>Contact Email</Text>
                    <TextInput
                      style={[verSt.inlineInput, { color: colors.text }]}
                      value={verEmail}
                      onChangeText={setVerEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      maxLength={120}
                      placeholder="official@company.com"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </View>
                <View style={[verSt.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }]}>
                  <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[verSt.infoLabel, { color: colors.textMuted }]}>Physical Address</Text>
                    <TextInput
                      style={[verSt.inlineInput, { color: colors.text }]}
                      value={verAddress}
                      onChangeText={setVerAddress}
                      multiline
                      numberOfLines={2}
                      maxLength={300}
                      placeholder="Street address, building, floor…"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </View>
              </View>

              <Text style={[verSt.notesLabel, { color: colors.textMuted }]}>Additional notes (optional)</Text>
              <TextInput
                style={[verSt.notes, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholder="Supporting links, context, or anything else our team should know…"
                placeholderTextColor={colors.textMuted}
                value={verifyNotes}
                onChangeText={setVerifyNotes}
                multiline
                numberOfLines={3}
                maxLength={1000}
              />
              <Text style={[{ color: colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right" }]}>
                {verifyNotes.length}/1000
              </Text>

              <TouchableOpacity
                style={[verSt.submitBtn, { backgroundColor: GOLD, opacity: submittingVerify ? 0.7 : 1 }]}
                onPress={submitVerifyRequest}
                disabled={submittingVerify}
                activeOpacity={0.85}
              >
                {submittingVerify
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="send-outline" size={16} color="#fff" />
                      <Text style={verSt.submitBtnText}>Submit Request</Text>
                    </>
                }
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Industry picker sheet */}
      <Modal visible={verPickerVisible} transparent animationType="slide" onRequestClose={() => setVerPickerVisible(false)}>
        <TouchableOpacity style={verSt.overlay} activeOpacity={1} onPress={() => setVerPickerVisible(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[verSt.pickerSheet, { backgroundColor: colors.surface }]}>
              <View style={[verSt.handle, { backgroundColor: colors.border }]} />
              <Text style={[verSt.pickerTitle, { color: colors.text }]}>Select Industry</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                {INDUSTRIES.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[verSt.pickerOption, verIndustry === opt && { backgroundColor: GOLD + "14" }]}
                    onPress={() => { setVerIndustry(opt); setVerPickerVisible(false); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[verSt.pickerOptionText, { color: verIndustry === opt ? GOLD : colors.text }]}>{opt}</Text>
                    {verIndustry === opt && <Ionicons name="checkmark" size={16} color={GOLD} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function StatItem({ icon, value, label, accent }: { icon: any; value: number; label: string; accent: string }) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon} size={16} color={accent} />
      <Text style={[styles.statValue, { color: accent }]}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Field({ label, children, required, colors }: { label: string; children: React.ReactNode; required?: boolean; colors: any }) {
  return (
    <View style={[fieldSt.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[fieldSt.label, { color: colors.textMuted }]}>
        {label}{required ? <Text style={{ color: "#FF3B30" }}> *</Text> : ""}
      </Text>
      {children}
    </View>
  );
}

const fieldSt = StyleSheet.create({
  wrap: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.2 },
});

const verSt = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "90%" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  dropdown: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11 },
  dropdownText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  infoBox: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 10 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 14, fontFamily: "Inter_500Medium" },
  inlineInput: { fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  notesLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  notes: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 80, textAlignVertical: "top" },
  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  pickerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  pickerOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, paddingHorizontal: 4, borderRadius: 8 },
  pickerOptionText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  navTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },

  imageSection: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  coverPickerWrap: { position: "relative" },
  coverPreview: { width: "100%", height: 120 },
  coverPlaceholder: { height: 120, alignItems: "center", justifyContent: "center", gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  placeholderLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  coverEditBadge: { position: "absolute", bottom: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  logoPickerRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  logoPickerWrap: { position: "relative" },
  logoPreview: { width: 64, height: 64, borderRadius: 8, overflow: "hidden" },
  logoEditBadge: { position: "absolute", bottom: -4, right: -4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },

  statsBanner: { borderRadius: 14, borderWidth: 1, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  statItem: { alignItems: "center", gap: 2 },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#888" },
  statDivider: { width: 1, height: 32 },
  statCta: { flexDirection: "row", alignItems: "center", gap: 4 },
  statCtaText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  groupLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  input: { fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  textarea: { minHeight: 100, textAlignVertical: "top" },
  slugNote: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  slugNoteText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  verifyCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  verifyCardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  verifyCardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 8 },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
