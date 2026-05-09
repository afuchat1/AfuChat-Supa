import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { uploadAvatarWithError, uploadToStorage } from "@/lib/mediaUpload";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import { aiGenerateBio } from "@/lib/aiHelper";
import { COUNTRIES, type Country } from "@/constants/countries";

// ─── Constants ────────────────────────────────────────────────────────────────
const INTERESTS = [
  { id: "technology",  label: "Technology",    icon: "laptop-outline" },
  { id: "music",       label: "Music",         icon: "musical-notes-outline" },
  { id: "sports",      label: "Sports",        icon: "football-outline" },
  { id: "fashion",     label: "Fashion",       icon: "shirt-outline" },
  { id: "food",        label: "Food & Cooking",icon: "restaurant-outline" },
  { id: "travel",      label: "Travel",        icon: "airplane-outline" },
  { id: "art",         label: "Art & Design",  icon: "color-palette-outline" },
  { id: "gaming",      label: "Gaming",        icon: "game-controller-outline" },
  { id: "fitness",     label: "Fitness",       icon: "barbell-outline" },
  { id: "photography", label: "Photography",   icon: "camera-outline" },
  { id: "business",    label: "Business",      icon: "briefcase-outline" },
  { id: "education",   label: "Education",     icon: "school-outline" },
  { id: "movies",      label: "Movies & TV",   icon: "film-outline" },
  { id: "reading",     label: "Reading",       icon: "book-outline" },
  { id: "nature",      label: "Nature",        icon: "leaf-outline" },
  { id: "politics",    label: "Politics",      icon: "megaphone-outline" },
  { id: "science",     label: "Science",       icon: "flask-outline" },
  { id: "crypto",      label: "Crypto & Web3", icon: "logo-bitcoin" },
];

const GENDERS = [
  { id: "male",   label: "Male",              icon: "male-outline" },
  { id: "female", label: "Female",            icon: "female-outline" },
  { id: "other",  label: "Other",             icon: "ellipsis-horizontal-outline" },
  { id: "prefer_not", label: "Prefer not to say", icon: "lock-closed-outline" },
];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function getDaysInMonth(month: number, year: number) {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionCard({ title, icon, children, colors }: {
  title: string; icon: string; children: React.ReactNode; colors: any;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon as any} size={16} color={colors.textMuted} />
        <Text style={[styles.cardTitle, { color: colors.textMuted }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function FieldRow({ label, children, noBorder, colors }: {
  label: string; children: React.ReactNode; noBorder?: boolean; colors: any;
}) {
  return (
    <View style={[styles.fieldRow, !noBorder && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function HandleStatus({ status, colors, accent }: {
  status: "idle" | "checking" | "available" | "taken" | "invalid_format" | "own";
  colors: any; accent: string;
}) {
  if (status === "idle" || status === "own") return null;
  if (status === "checking") return <ActivityIndicator size="small" color={colors.textMuted} style={{ marginLeft: 8 }} />;
  const map = {
    available:      { icon: "checkmark-circle", color: "#34C759", label: "Available" },
    taken:          { icon: "close-circle",     color: "#FF3B30", label: "Already taken" },
    invalid_format: { icon: "warning",          color: "#FF9F0A", label: "Letters, numbers & _ only (min 3)" },
  } as const;
  const cfg = map[status as keyof typeof map];
  if (!cfg) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 8 }}>
      <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
      <Text style={{ fontSize: 11, color: cfg.color, fontFamily: "Inter_500Medium" }}>{cfg.label}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function EditProfileScreen() {
  const { colors, accent } = useTheme();
  const { user, profile, patchProfile } = useAuth();
  const insets = useSafeAreaInsets();

  // ── Form state ──
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [handle, setHandle] = useState(profile?.handle || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [website, setWebsite] = useState(profile?.website_url || "");
  const [gender, setGender] = useState<string>(profile?.gender || "");
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(
    new Set(profile?.interests || [])
  );

  // DOB
  const parsedDob = profile?.date_of_birth ? new Date(profile.date_of_birth) : null;
  const [dobDay,   setDobDay]   = useState(parsedDob ? parsedDob.getUTCDate() : 0);
  const [dobMonth, setDobMonth] = useState(parsedDob ? parsedDob.getUTCMonth() + 1 : 0);
  const [dobYear,  setDobYear]  = useState(parsedDob ? parsedDob.getUTCFullYear() : 0);
  const [dobPicker, setDobPicker] = useState<"day" | "month" | "year" | null>(null);

  // Country
  const initCountry = COUNTRIES.find(c => c.name === profile?.country || c.code === profile?.country) || null;
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(initCountry);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  // Avatar & banner
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [bannerUri, setBannerUri] = useState<string | null>(null);

  // Handle availability
  const [handleStatus, setHandleStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid_format" | "own">("own");
  const handleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Loading
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // ── Handle check ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (handleTimerRef.current) clearTimeout(handleTimerRef.current);
    const raw = handle.trim();
    if (!raw || raw === profile?.handle) { setHandleStatus("own"); return; }
    const clean = raw.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    if (raw !== raw.replace(/[^a-zA-Z0-9_]/g, "") || clean.length < 3) {
      setHandleStatus("invalid_format");
      return;
    }
    setHandleStatus("checking");
    handleTimerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("handle", clean)
        .neq("id", user?.id || "")
        .maybeSingle();
      setHandleStatus(data ? "taken" : "available");
    }, 600);
    return () => { if (handleTimerRef.current) clearTimeout(handleTimerRef.current); };
  }, [handle]);

  // ── Photo pickers ──────────────────────────────────────────────────────────
  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { showAlert("Permission needed", "Allow photo library access to change your picture."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (!result.canceled && result.assets[0]) setAvatarUri(result.assets[0].uri);
  }

  async function pickBanner() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { showAlert("Permission needed", "Allow photo library access to change your banner."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 1], quality: 0.85 });
    if (!result.canceled && result.assets[0]) setBannerUri(result.assets[0].uri);
  }

  // ── Upload helpers ─────────────────────────────────────────────────────────
  async function uploadBanner(uri: string): Promise<string | null> {
    if (!user?.id) return null;
    const ext = uri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
    const safeExt = ["png", "webp"].includes(ext) ? ext : "jpg";
    const fileName = `${user.id}/banner_${Date.now()}.${safeExt}`;
    const mime = `image/${safeExt === "jpg" ? "jpeg" : safeExt}`;
    const { publicUrl, error } = await uploadToStorage("banners", fileName, uri, mime);
    if (!publicUrl) showAlert("Upload failed", error || "Could not upload banner.");
    return publicUrl;
  }

  // ── Interest toggle ────────────────────────────────────────────────────────
  function toggleInterest(id: string) {
    Haptics.selectionAsync();
    setSelectedInterests(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    if (!displayName.trim()) { showAlert("Required", "Display name cannot be empty."); return; }
    if (bio.length > 150) { showAlert("Too long", "Bio is limited to 150 characters."); return; }
    if (handleStatus === "taken" || handleStatus === "invalid_format") {
      showAlert("Invalid handle", "Please fix your handle before saving."); return;
    }
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let newAvatarUrl: string | null = null;
    let newBannerUrl: string | null = null;

    if (avatarUri) {
      setUploadingAvatar(true);
      const { publicUrl, error } = await uploadAvatarWithError(user!.id, avatarUri);
      setUploadingAvatar(false);
      if (!publicUrl) { setSaving(false); return; }
      newAvatarUrl = publicUrl;
    }
    if (bannerUri) {
      setUploadingBanner(true);
      newBannerUrl = await uploadBanner(bannerUri);
      setUploadingBanner(false);
      if (!newBannerUrl) { setSaving(false); return; }
    }

    const cleanHandle = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const updateData: Record<string, any> = {
      display_name: displayName.trim(),
      handle: cleanHandle,
      bio: bio.trim() || null,
      website_url: website.trim() || null,
      country: selectedCountry?.name || null,
      gender: gender || null,
      interests: Array.from(selectedInterests),
    };
    if (dobDay && dobMonth && dobYear) {
      updateData.date_of_birth = `${String(dobYear).padStart(4,"0")}-${String(dobMonth).padStart(2,"0")}-${String(dobDay).padStart(2,"0")}`;
    }
    if (newAvatarUrl) updateData.avatar_url = newAvatarUrl;
    if (newBannerUrl) updateData.banner_url = newBannerUrl;

    const { error } = await supabase.from("profiles").update(updateData).eq("id", user!.id);
    if (error) {
      showAlert("Error", error.message);
    } else {
      patchProfile(updateData);
      router.back();
    }
    setSaving(false);
  }

  // ── Filtered countries ─────────────────────────────────────────────────────
  const filteredCountries = countrySearch.trim()
    ? COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRIES;

  const dobLabel = (dobDay && dobMonth && dobYear)
    ? `${dobDay} ${MONTHS[dobMonth - 1]} ${dobYear}`
    : "Not set";

  const currentAvatar = avatarUri || profile?.avatar_url;
  const currentBanner = bannerUri || profile?.banner_url;

  // ── DOB picker data ────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const days   = Array.from({ length: getDaysInMonth(dobMonth, dobYear) }, (_, i) => ({ label: String(i + 1), value: i + 1 }));
  const months = MONTHS.map((m, i) => ({ label: m, value: i + 1 }));
  const years  = Array.from({ length: 80 }, (_, i) => {
    const y = currentYear - 13 - i;
    return { label: String(y), value: y };
  });

  const dobPickerData = dobPicker === "day" ? days : dobPicker === "month" ? months : years;
  const dobPickerValue = dobPicker === "day" ? dobDay : dobPicker === "month" ? dobMonth : dobYear;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}
      keyboardVerticalOffset={0}
    >
      {/* ── Sticky header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Profile</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={save} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <View style={[styles.saveChip, { backgroundColor: accent }]}>
              <Text style={styles.saveChipText}>Save</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Banner + Avatar ── */}
        <View style={styles.mediaSurface}>
          {/* Banner */}
          <TouchableOpacity onPress={pickBanner} activeOpacity={0.9} style={[styles.banner, { backgroundColor: colors.backgroundTertiary }]}>
            {currentBanner ? (
              <ExpoImage source={{ uri: currentBanner }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={styles.bannerPlaceholder}>
                <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.bannerPlaceholderText, { color: colors.textMuted }]}>Tap to add cover photo</Text>
              </View>
            )}
            {uploadingBanner && (
              <View style={[StyleSheet.absoluteFill, styles.uploadOverlay]}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            <View style={styles.bannerCameraChip}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* Avatar */}
          <View style={[styles.avatarContainer, { borderColor: colors.backgroundSecondary }]}>
            <TouchableOpacity onPress={pickAvatar} activeOpacity={0.85} style={styles.avatarTouchable}>
              {currentAvatar ? (
                <ExpoImage source={{ uri: currentAvatar }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Avatar uri={null} name={profile?.display_name} size={88} />
              )}
              {uploadingAvatar ? (
                <View style={[StyleSheet.absoluteFill, styles.avatarOverlay]}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : (
                <View style={styles.avatarCameraChip}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Identity ── */}
        <SectionCard title="IDENTITY" icon="person-outline" colors={colors}>
          <FieldRow label="Name" colors={colors}>
            <TextInput
              style={[styles.fieldInput, { color: colors.text }]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your display name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </FieldRow>
          <FieldRow label="Handle" noBorder colors={colors}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={[styles.handleAt, { color: colors.textMuted }]}>@</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.text, flex: 1 }]}
                value={handle}
                onChangeText={setHandle}
                placeholder="your_handle"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
              <HandleStatus status={handleStatus} colors={colors} accent={accent} />
            </View>
            {handleStatus === "taken" && (
              <Text style={[styles.handleHint, { color: "#FF3B30" }]}>That handle is already taken — try another.</Text>
            )}
            {handleStatus === "invalid_format" && (
              <Text style={[styles.handleHint, { color: "#FF9F0A" }]}>Only letters, numbers and underscores, minimum 3 characters.</Text>
            )}
            {handleStatus === "available" && (
              <Text style={[styles.handleHint, { color: "#34C759" }]}>@{handle.trim().toLowerCase()} is available!</Text>
            )}
          </FieldRow>
        </SectionCard>

        {/* ── About ── */}
        <SectionCard title="ABOUT" icon="document-text-outline" colors={colors}>
          <FieldRow label="Bio" colors={colors}>
            <TextInput
              style={[styles.fieldInput, styles.bioInput, { color: colors.text }]}
              value={bio}
              onChangeText={t => setBio(t.slice(0, 150))}
              placeholder="Tell people about yourself…"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.bioFooter}>
              <TouchableOpacity
                style={[styles.aiBioBtn, { backgroundColor: accent + "14", borderColor: accent + "30" }]}
                onPress={async () => {
                  setAiGenerating(true);
                  try {
                    const generated = await aiGenerateBio(displayName || "User", Array.from(selectedInterests), selectedCountry?.name);
                    setBio(generated.slice(0, 150));
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch {
                    showAlert("AI Error", "Could not generate bio. Try again.");
                  }
                  setAiGenerating(false);
                }}
                disabled={aiGenerating}
              >
                {aiGenerating ? (
                  <ActivityIndicator size="small" color={accent} />
                ) : (
                  <Ionicons name="sparkles" size={13} color={accent} />
                )}
                <Text style={[styles.aiBioBtnText, { color: accent }]}>
                  {aiGenerating ? "Generating…" : "AI Generate"}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.charCounter, { color: bio.length > 130 ? (bio.length >= 150 ? "#FF3B30" : "#FF9F0A") : colors.textMuted }]}>
                {bio.length}/150
              </Text>
            </View>
          </FieldRow>
          <FieldRow label="Website" noBorder colors={colors}>
            <TextInput
              style={[styles.fieldInput, { color: colors.text }]}
              value={website}
              onChangeText={setWebsite}
              placeholder="https://your-website.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="url"
              autoCorrect={false}
            />
          </FieldRow>
        </SectionCard>

        {/* ── Location ── */}
        <SectionCard title="LOCATION" icon="location-outline" colors={colors}>
          <FieldRow label="Country" noBorder colors={colors}>
            <TouchableOpacity onPress={() => setShowCountryModal(true)} style={styles.pickerBtn}>
              <Text style={[styles.pickerBtnText, { color: selectedCountry ? colors.text : colors.textMuted }]}>
                {selectedCountry ? `${selectedCountry.flag}  ${selectedCountry.name}` : "Select country"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </FieldRow>
        </SectionCard>

        {/* ── Personal ── */}
        <SectionCard title="PERSONAL" icon="heart-outline" colors={colors}>
          {/* Gender */}
          <FieldRow label="Gender" colors={colors}>
            <View style={styles.genderGrid}>
              {GENDERS.map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.genderChip, {
                    backgroundColor: gender === g.id ? accent + "18" : colors.backgroundTertiary,
                    borderColor: gender === g.id ? accent : colors.border,
                  }]}
                  onPress={() => { Haptics.selectionAsync(); setGender(prev => prev === g.id ? "" : g.id); }}
                >
                  <Ionicons name={g.icon as any} size={14} color={gender === g.id ? accent : colors.textMuted} />
                  <Text style={[styles.genderChipText, { color: gender === g.id ? accent : colors.textSecondary }]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </FieldRow>

          {/* Date of birth */}
          <FieldRow label="Birthday" noBorder colors={colors}>
            <View style={styles.dobRow}>
              {(["day","month","year"] as const).map(part => {
                const val = part === "day" ? dobDay : part === "month" ? dobMonth : dobYear;
                const label = part === "day" ? (dobDay || "Day") : part === "month" ? (dobMonth ? MONTHS[dobMonth - 1] : "Month") : (dobYear || "Year");
                return (
                  <TouchableOpacity
                    key={part}
                    style={[styles.dobPart, { backgroundColor: colors.backgroundTertiary, borderColor: dobPicker === part ? accent : colors.border }]}
                    onPress={() => setDobPicker(prev => prev === part ? null : part)}
                  >
                    <Text style={[styles.dobPartText, { color: val ? colors.text : colors.textMuted }]}>{label}</Text>
                    <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>

            {dobPicker && (
              <View style={[styles.dobPickerWrap, { backgroundColor: colors.backgroundTertiary, borderColor: colors.border }]}>
                <FlatList
                  data={dobPickerData}
                  keyExtractor={item => String(item.value)}
                  style={{ maxHeight: 180 }}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const isSelected = item.value === dobPickerValue;
                    return (
                      <TouchableOpacity
                        style={[styles.dobPickerItem, isSelected && { backgroundColor: accent + "15" }]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          if (dobPicker === "day")   setDobDay(item.value);
                          if (dobPicker === "month") setDobMonth(item.value);
                          if (dobPicker === "year")  setDobYear(item.value);
                          setDobPicker(null);
                        }}
                      >
                        <Text style={[styles.dobPickerItemText, { color: isSelected ? accent : colors.text }]}>
                          {item.label}
                        </Text>
                        {isSelected && <Ionicons name="checkmark" size={16} color={accent} />}
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            )}
            {(dobDay > 0 || dobMonth > 0 || dobYear > 0) && (
              <TouchableOpacity onPress={() => { setDobDay(0); setDobMonth(0); setDobYear(0); }}>
                <Text style={[styles.clearText, { color: colors.textMuted }]}>Clear date</Text>
              </TouchableOpacity>
            )}
          </FieldRow>
        </SectionCard>

        {/* ── Interests ── */}
        <SectionCard title="INTERESTS" icon="compass-outline" colors={colors}>
          <Text style={[styles.interestsHint, { color: colors.textMuted }]}>
            Select topics you care about — they shape your feed and help others find you.
          </Text>
          <View style={styles.interestsGrid}>
            {INTERESTS.map(item => {
              const active = selectedInterests.has(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.interestChip, {
                    backgroundColor: active ? accent + "18" : colors.backgroundTertiary,
                    borderColor: active ? accent : colors.border,
                  }]}
                  onPress={() => toggleInterest(item.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={item.icon as any} size={14} color={active ? accent : colors.textMuted} />
                  <Text style={[styles.interestChipText, { color: active ? accent : colors.textSecondary }]}>
                    {item.label}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={13} color={accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.interestCount, { color: selectedInterests.size >= 3 ? "#34C759" : colors.textMuted }]}>
            {selectedInterests.size} selected{selectedInterests.size < 3 ? ` · pick at least 3` : ""}
          </Text>
        </SectionCard>
      </ScrollView>

      {/* ── Country picker modal ── */}
      <Modal visible={showCountryModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCountryModal(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Country</Text>
            <TouchableOpacity onPress={() => setShowCountryModal(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={[styles.modalSearch, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.modalSearchInput, { color: colors.text }]}
              value={countrySearch}
              onChangeText={setCountrySearch}
              placeholder="Search countries…"
              placeholderTextColor={colors.textMuted}
              autoFocus
              clearButtonMode="while-editing"
            />
          </View>
          <FlatList
            data={filteredCountries}
            keyExtractor={c => c.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = selectedCountry?.code === item.code;
              return (
                <TouchableOpacity
                  style={[styles.countryRow, { borderBottomColor: colors.border }, isSelected && { backgroundColor: accent + "10" }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedCountry(item);
                    setShowCountryModal(false);
                    setCountrySearch("");
                  }}
                >
                  <Text style={styles.countryFlag}>{item.flag}</Text>
                  <Text style={[styles.countryName, { color: colors.text }]}>{item.name}</Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={accent} />}
                </TouchableOpacity>
              );
            }}
          />
          {selectedCountry && (
            <TouchableOpacity
              style={[styles.clearCountryBtn, { borderTopColor: colors.border }]}
              onPress={() => { setSelectedCountry(null); setShowCountryModal(false); }}
            >
              <Ionicons name="close-circle-outline" size={18} color="#FF3B30" />
              <Text style={{ color: "#FF3B30", fontSize: 14, fontFamily: "Inter_500Medium" }}>Clear Country</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { minWidth: 64, alignItems: "flex-start" },
  cancelText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  saveChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  saveChipText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  body: { gap: 14, paddingHorizontal: 16, paddingTop: 0 },

  // Banner + Avatar
  mediaSurface: { marginHorizontal: -16, marginBottom: 36 },
  banner: { height: 160, overflow: "hidden" },
  bannerPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  bannerPlaceholderText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  bannerCameraChip: {
    position: "absolute", bottom: 10, right: 12,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20,
    padding: 6,
  },
  uploadOverlay: { backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  avatarContainer: {
    position: "absolute",
    bottom: -44,
    left: 20,
    borderRadius: 50,
    borderWidth: 3,
    overflow: "hidden",
  },
  avatarTouchable: { width: 88, height: 88 },
  avatarImg: { width: 88, height: 88, borderRadius: 44 },
  avatarOverlay: { backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", borderRadius: 44 },
  avatarCameraChip: {
    position: "absolute", bottom: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 14,
    padding: 4,
  },

  // Cards
  card: { borderRadius: 16, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  cardTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" },

  // Fields
  fieldRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldInput: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  handleAt: { fontSize: 15, fontFamily: "Inter_400Regular", marginRight: 2 },
  handleHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },

  // Bio
  bioInput: { minHeight: 72 },
  bioFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  aiBioBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  aiBioBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  charCounter: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Picker button
  pickerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerBtnText: { fontSize: 15, fontFamily: "Inter_400Regular", flex: 1 },

  // Gender
  genderGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  genderChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  genderChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  // DOB
  dobRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  dobPart: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  dobPartText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  dobPickerWrap: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginTop: 8 },
  dobPickerItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  dobPickerItemText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  clearText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 },

  // Interests
  interestsHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4, paddingHorizontal: 16 },
  interestsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  interestChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  interestChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  interestCount: { fontSize: 12, fontFamily: "Inter_500Medium", paddingHorizontal: 16, paddingBottom: 8 },

  // Country modal
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalSearch: { flexDirection: "row", alignItems: "center", gap: 10, margin: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  modalSearchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  countryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  countryFlag: { fontSize: 24 },
  countryName: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  clearCountryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
