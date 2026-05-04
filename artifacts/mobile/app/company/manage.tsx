import React, { useCallback, useEffect, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";

type OrgPage = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
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
  followers_count: number;
  posts_count: number;
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

  const [form, setForm] = useState({
    name: "", tagline: "", description: "", website: "", email: "",
    industry: "", org_type: "", size: "", founded_year: "", location: "", physical_address: "",
    registration_number: "",
    ig: "", x_twitter: "", linkedin: "",
  });

  const load = useCallback(async () => {
    if (!slug) return;
    const { data } = await supabase.from("organization_pages").select("*").eq("slug", slug).single();
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
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  function set(field: string, val: string) {
    setForm((prev) => ({ ...prev, [field]: val }));
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
            <Ionicons name="arrow-back" size={24} color={colors.text} />
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
            <Ionicons name="arrow-back" size={24} color={colors.text} />
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
          <Ionicons name="arrow-back" size={24} color={colors.text} />
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
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
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 8 },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
