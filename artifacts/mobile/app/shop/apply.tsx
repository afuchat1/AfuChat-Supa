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
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

const BUSINESS_TYPES = ["Retailer", "Wholesaler", "Service Provider", "Digital Goods", "Food & Restaurant", "Arts & Crafts", "Education", "Other"];
const CATEGORIES = ["Fashion", "Electronics", "Beauty", "Home & Garden", "Food & Drink", "Digital Goods", "Sports", "Art & Crafts", "Books", "Services", "Other"];

type AppStatus = "idle" | "loading" | "pending" | "approved" | "rejected";

type SellerApp = {
  id: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  business_name: string;
};

export default function SellerApplyScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [pageStatus, setPageStatus] = useState<AppStatus>("loading");
  const [existingApp, setExistingApp] = useState<SellerApp | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    business_name: "",
    business_type: "",
    category: "",
    description: "",
    website_url: "",
    phone_number: profile?.phone_number || "",
    address: "",
    country: profile?.country || "",
    ig: "",
    fb: "",
    tiktok: "",
  });

  useEffect(() => {
    if (!user) return;
    checkExistingApp();
  }, [user]);

  async function checkExistingApp() {
    const { data } = await supabase
      .from("seller_applications")
      .select("id, status, admin_note, created_at, business_name")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setExistingApp(data as SellerApp);
      setPageStatus(data.status as AppStatus);
    } else {
      setPageStatus("idle");
    }
  }

  function set(field: string, val: string) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  async function handleSubmit() {
    if (!form.business_name.trim()) { showAlert("Required", "Business name is required."); return; }
    if (!form.business_type) { showAlert("Required", "Please select a business type."); return; }
    if (!form.category) { showAlert("Required", "Please select a category."); return; }
    if (form.description.trim().length < 30) { showAlert("Required", "Please write at least 30 characters describing your business."); return; }
    if (!form.phone_number.trim()) { showAlert("Required", "Phone number is required."); return; }
    if (!form.address.trim()) { showAlert("Required", "Business address is required."); return; }
    if (!form.country.trim()) { showAlert("Required", "Country is required."); return; }
    if (!user) return;

    setSubmitting(true);
    const social_links: Record<string, string> = {};
    if (form.ig.trim()) social_links.instagram = form.ig.trim();
    if (form.fb.trim()) social_links.facebook = form.fb.trim();
    if (form.tiktok.trim()) social_links.tiktok = form.tiktok.trim();

    const { error } = await supabase.from("seller_applications").insert({
      user_id: user.id,
      business_name: form.business_name.trim(),
      business_type: form.business_type,
      category: form.category,
      description: form.description.trim(),
      website_url: form.website_url.trim() || null,
      phone_number: form.phone_number.trim(),
      address: form.address.trim(),
      country: form.country.trim(),
      social_links,
    });

    setSubmitting(false);
    if (error) { showAlert("Error", error.message); return; }
    await checkExistingApp();
  }

  const headerTopPad = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 16);

  if (pageStatus === "loading") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <View style={[st.header, { paddingTop: headerTopPad, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: colors.text }]}>Seller Application</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </View>
    );
  }

  if (profile?.is_organization_verified) {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <View style={[st.header, { paddingTop: headerTopPad, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: colors.text }]}>Seller Application</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 }}>
          <Ionicons name="checkmark-circle" size={72} color="#34C759" />
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center" }}>You're Already Verified!</Text>
          <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", lineHeight: 21 }}>
            Your account is already organization-verified. Go to your Store Manager to list products.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 }}
            onPress={() => router.replace("/shop/manage")}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>Go to My Store</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (pageStatus === "pending" && existingApp) {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <View style={[st.header, { paddingTop: headerTopPad, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: colors.text }]}>Seller Application</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 }}>
          <View style={[st.statusIcon, { backgroundColor: "#FF9500" + "18" }]}>
            <Ionicons name="time-outline" size={40} color="#FF9500" />
          </View>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center" }}>Application Under Review</Text>
          <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", lineHeight: 21 }}>
            We received your application for{" "}
            <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>{existingApp.business_name}</Text>
            {" "}and our team is reviewing it. You'll be notified once a decision is made.
          </Text>
          <View style={[st.statusPill, { backgroundColor: "#FF9500" + "18" }]}>
            <Ionicons name="hourglass-outline" size={13} color="#FF9500" />
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FF9500" }}>Pending Review</Text>
          </View>
          <Text style={[st.submittedDate, { color: colors.textMuted }]}>
            Submitted {new Date(existingApp.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </Text>
        </View>
      </View>
    );
  }

  if (pageStatus === "rejected" && existingApp) {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <View style={[st.header, { paddingTop: headerTopPad, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: colors.text }]}>Seller Application</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 }}>
          <View style={[st.statusIcon, { backgroundColor: "#FF3B30" + "15" }]}>
            <Ionicons name="close-circle-outline" size={40} color="#FF3B30" />
          </View>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center" }}>Application Not Approved</Text>
          {existingApp.admin_note ? (
            <View style={[st.noteBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textMuted, marginBottom: 4 }}>REVIEW NOTE</Text>
              <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.text, lineHeight: 20 }}>{existingApp.admin_note}</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", lineHeight: 21 }}>
              Your application did not meet our requirements at this time. You may re-apply with updated information.
            </Text>
          )}
          <TouchableOpacity
            style={{ backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 }}
            onPress={() => setPageStatus("idle")}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>Re-apply</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[st.header, { paddingTop: headerTopPad, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.text }]}>Become a Seller</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {/* Intro Banner */}
          <View style={[st.introBanner, { backgroundColor: colors.accent + "12", borderColor: colors.accent + "30" }]}>
            <Ionicons name="storefront-outline" size={24} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[st.introTitle, { color: colors.accent }]}>Join AfuMarket</Text>
              <Text style={[st.introSub, { color: colors.textMuted }]}>
                Fill in your business details below. Our team will review your application within 2–5 business days.
              </Text>
            </View>
          </View>

          {/* Section: Business Info */}
          <View style={[st.card, { backgroundColor: colors.surface }]}>
            <Text style={[st.sectionLabel, { color: colors.text }]}>Business Information</Text>

            <Label text="Business Name *" />
            <TextInput
              style={[st.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. Nile Fashion Co."
              placeholderTextColor={colors.textMuted}
              value={form.business_name}
              onChangeText={(v) => set("business_name", v)}
            />

            <Label text="Business Type *" />
            <View style={st.chipRow}>
              {BUSINESS_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[st.chip, { borderColor: form.business_type === t ? colors.accent : colors.border, backgroundColor: form.business_type === t ? colors.accent + "15" : colors.inputBg }]}
                  onPress={() => set("business_type", t)}
                >
                  <Text style={[st.chipText, { color: form.business_type === t ? colors.accent : colors.textSecondary }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Label text="Primary Category *" />
            <View style={st.chipRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[st.chip, { borderColor: form.category === c ? colors.accent : colors.border, backgroundColor: form.category === c ? colors.accent + "15" : colors.inputBg }]}
                  onPress={() => set("category", c)}
                >
                  <Text style={[st.chipText, { color: form.category === c ? colors.accent : colors.textSecondary }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Label text="Business Description * (min 30 characters)" />
            <TextInput
              style={[st.input, st.textarea, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="Describe what your business sells, how long you've been operating, and what makes you unique..."
              placeholderTextColor={colors.textMuted}
              value={form.description}
              onChangeText={(v) => set("description", v)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={[st.charCount, { color: form.description.length >= 30 ? "#34C759" : colors.textMuted }]}>
              {form.description.length} / 30+ chars
            </Text>
          </View>

          {/* Section: Contact */}
          <View style={[st.card, { backgroundColor: colors.surface }]}>
            <Text style={[st.sectionLabel, { color: colors.text }]}>Contact & Location</Text>

            <Label text="Phone Number *" />
            <TextInput
              style={[st.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="+256 700 000 000"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              value={form.phone_number}
              onChangeText={(v) => set("phone_number", v)}
            />

            <Label text="Business Address *" />
            <TextInput
              style={[st.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="Street, City"
              placeholderTextColor={colors.textMuted}
              value={form.address}
              onChangeText={(v) => set("address", v)}
            />

            <Label text="Country *" />
            <TextInput
              style={[st.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. Uganda"
              placeholderTextColor={colors.textMuted}
              value={form.country}
              onChangeText={(v) => set("country", v)}
            />

            <Label text="Website URL (optional)" />
            <TextInput
              style={[st.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="https://yourbusiness.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="url"
              autoCapitalize="none"
              value={form.website_url}
              onChangeText={(v) => set("website_url", v)}
            />
          </View>

          {/* Section: Social */}
          <View style={[st.card, { backgroundColor: colors.surface }]}>
            <Text style={[st.sectionLabel, { color: colors.text }]}>Social Media (optional)</Text>

            <Label text="Instagram Handle" />
            <View style={[st.prefixInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Text style={[st.prefix, { color: colors.textMuted }]}>@</Text>
              <TextInput
                style={[st.prefixText, { color: colors.text }]}
                placeholder="yourbusiness"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                value={form.ig}
                onChangeText={(v) => set("ig", v)}
              />
            </View>

            <Label text="Facebook Page" />
            <View style={[st.prefixInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Text style={[st.prefix, { color: colors.textMuted }]}>fb.com/</Text>
              <TextInput
                style={[st.prefixText, { color: colors.text }]}
                placeholder="yourbusiness"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                value={form.fb}
                onChangeText={(v) => set("fb", v)}
              />
            </View>

            <Label text="TikTok Handle" />
            <View style={[st.prefixInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Text style={[st.prefix, { color: colors.textMuted }]}>@</Text>
              <TextInput
                style={[st.prefixText, { color: colors.text }]}
                placeholder="yourbusiness"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                value={form.tiktok}
                onChangeText={(v) => set("tiktok", v)}
              />
            </View>
          </View>

          {/* Terms note */}
          <TouchableOpacity
            style={[st.termsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push({ pathname: "/terms", params: { section: "marketplace" } } as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.accent} />
            <Text style={[st.termsText, { color: colors.textMuted }]}>
              By submitting you agree to AfuChat's{" "}
              <Text style={{ color: colors.accent, fontFamily: "Inter_500Medium" }}>Marketplace Terms</Text>
              {" "}and Seller Policies. Providing false information will result in permanent disqualification.
            </Text>
          </TouchableOpacity>

          {/* Submit */}
          <TouchableOpacity
            style={[st.submitBtn, { backgroundColor: colors.accent, opacity: submitting ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send-outline" size={18} color="#fff" />
                <Text style={st.submitText}>Submit Application</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Label({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={[st.label, { color: colors.textSecondary }]}>{text}</Text>;
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  introBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    margin: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  introTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 4 },
  introSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16, gap: 2 },
  sectionLabel: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 10 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 8, marginBottom: 4 },
  input: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 9,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  textarea: { height: 100, paddingTop: 10 },
  charCount: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4, alignSelf: "flex-end" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  prefixInput: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 4,
  },
  prefix: { fontSize: 13, fontFamily: "Inter_500Medium", marginRight: 2 },
  prefixText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: Platform.OS === "ios" ? 12 : 9 },
  termsBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  termsText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, flex: 1 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  statusIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  submittedDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  noteBox: { borderWidth: 1, borderRadius: 12, padding: 14, width: "100%" },
});
