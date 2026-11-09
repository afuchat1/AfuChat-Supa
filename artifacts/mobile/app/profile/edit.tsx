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
import type { Country } from "@/constants/countries";
const getCountries = () => (require("@/constants/countries").COUNTRIES as Country[]);
import { storage, KEYS } from "@/lib/storage";
import { checkUsernameAvailability, usernamePurchasePrompt } from "@/lib/usernameAvailability";

// ─── Cooldown helpers ─────────────────────────────────────────────────────────
const HANDLE_COOLDOWN_DAYS = 30;
const NAME_COOLDOWN_DAYS   = 7;

function getDaysRemaining(storedMs: string | undefined, cooldownDays: number): number {
  if (!storedMs) return 0;
  const ts = parseInt(storedMs, 10);
  if (!Number.isFinite(ts)) return 0;
  const elapsed  = Date.now() - ts;
  const remaining = cooldownDays * 24 * 60 * 60 * 1000 - elapsed;
  return remaining > 0 ? Math.ceil(remaining / (24 * 60 * 60 * 1000)) : 0;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const INTERESTS = [
  { id: "technology",  label: "Technology",    icon: "laptop" },
  { id: "music",       label: "Music",         icon: "musical-notes" },
  { id: "sports",      label: "Sports",        icon: "football" },
  { id: "fashion",     label: "Fashion",       icon: "shirt" },
  { id: "food",        label: "Food & Cooking",icon: "restaurant" },
  { id: "travel",      label: "Travel",        icon: "airplane" },
  { id: "art",         label: "Art & Design",  icon: "color-palette" },
  { id: "gaming",      label: "Gaming",        icon: "game-controller" },
  { id: "fitness",     label: "Fitness",       icon: "barbell" },
  { id: "photography", label: "Photography",   icon: "camera" },
  { id: "business",    label: "Business",      icon: "briefcase" },
  { id: "education",   label: "Education",     icon: "school" },
  { id: "movies",      label: "Movies & TV",   icon: "film" },
  { id: "reading",     label: "Reading",       icon: "book" },
  { id: "nature",      label: "Nature",        icon: "leaf" },
  { id: "politics",    label: "Politics",      icon: "megaphone" },
  { id: "science",     label: "Science",       icon: "flask" },
  { id: "crypto",      label: "Crypto & Web3", icon: "logo-bitcoin" },
];

const GENDERS = [
  { id: "male",   label: "Male",              icon: "male" },
  { id: "female", label: "Female",            icon: "female" },
  { id: "other",  label: "Other",             icon: "ellipsis-horizontal" },
  { id: "prefer_not", label: "Prefer not to say", icon: "lock-closed" },
];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function getDaysInMonth(month: number, year: number) {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

// ─── Profile Completion Card ──────────────────────────────────────────────────
type CompletionStep = {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  icon: string;
};

function ProfileCompletionCard({
  steps,
  colors,
  accent,
}: {
  steps: CompletionStep[];
  colors: any;
  accent: string;
}) {
  const doneCount  = steps.filter((s) => s.done).length;
  const total      = steps.length;
  const pct        = Math.round((doneCount / total) * 100);
  const allDone    = doneCount === total;
  const barColor   = allDone ? "#34C759" : accent;

  return (
    <View style={[compStyles.card, { backgroundColor: colors.surface }]}>
      {/* Header row */}
      <View style={compStyles.header}>
        <View style={compStyles.headerLeft}>
          <Ionicons
            name={allDone ? "checkmark-circle" : "stats-chart"}
            size={16}
            color={allDone ? "#34C759" : colors.textMuted}
          />
          <Text style={[compStyles.title, { color: colors.textMuted }]}>
            PROFILE COMPLETENESS
          </Text>
        </View>
        <Text style={[compStyles.pct, { color: allDone ? "#34C759" : accent }]}>
          {pct}%
        </Text>
      </View>

      {/* Progress bar */}
      <View style={[compStyles.trackWrap, { backgroundColor: colors.backgroundTertiary }]}>
        <View
          style={[
            compStyles.fill,
            {
              width: `${pct}%` as any,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>

      {/* Discovery nudge */}
      {!allDone && (
        <Text style={[compStyles.nudge, { color: colors.textMuted }]}>
          Complete your profile to appear in People You May Know
        </Text>
      )}

      {/* Step rows */}
      <View style={compStyles.steps}>
        {steps.map((step, idx) => (
          <View
            key={step.id}
            style={[
              compStyles.stepRow,
              idx < steps.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
            ]}
          >
            <View
              style={[
                compStyles.stepIcon,
                {
                  backgroundColor: step.done ? (allDone ? "#34C75918" : accent + "18") : colors.backgroundTertiary,
                  borderColor: step.done ? (allDone ? "#34C759" : accent) : colors.border,
                },
              ]}
            >
              <Ionicons
                name={step.done ? "checkmark" : (step.icon as any)}
                size={13}
                color={step.done ? (allDone ? "#34C759" : accent) : colors.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[compStyles.stepLabel, { color: step.done ? colors.text : colors.textSecondary }]}>
                {step.label}
              </Text>
              {!step.done && (
                <Text style={[compStyles.stepHint, { color: colors.textMuted }]}>
                  {step.hint}
                </Text>
              )}
            </View>
            {step.done && (
              <Text style={[compStyles.doneTag, { color: allDone ? "#34C759" : accent }]}>Done</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const compStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  pct: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  trackWrap: {
    marginHorizontal: 16,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  nudge: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 17,
  },
  steps: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
  },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  stepHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  doneTag: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});

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
    <View style={[styles.fieldRow, !noBorder && { borderBottomColor: colors.border }]}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function HandleStatus({ status, colors, accent }: {
  status: "idle" | "checking" | "available" | "taken" | "invalid_format" | "own" | "owned" | "listed";
  colors: any; accent: string;
}) {
  if (status === "idle" || status === "own") return null;
  if (status === "checking") return <ActivityIndicator size="small" color={colors.textMuted} style={{ marginLeft: 8 }} />;
  const map = {
    available:      { icon: "checkmark-circle", color: "#34C759", label: "Available" },
    owned:          { icon: "checkmark-circle", color: "#34C759", label: "You own this username" },
    taken:          { icon: "close-circle",     color: "#FF3B30", label: "Already taken" },
    listed:         { icon: "pricetag",          color: colors.accent, label: "Listed for sale. Buy first" },
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
  const initCountry = getCountries().find(c => c.name === profile?.country || c.code === profile?.country) || null;
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(initCountry);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  // Avatar & banner
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [bannerUri, setBannerUri] = useState<string | null>(null);

  // Handle availability
  const [handleStatus, setHandleStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid_format" | "own" | "owned" | "listed">("own");
  const [listedHandle, setListedHandle] = useState<{ username: string; price: number } | null>(null);
  const handleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cooldown — read once synchronously from MMKV (synchronous store)
  const [handleLockedDays] = useState(() =>
    getDaysRemaining(storage.getString(KEYS.HANDLE_CHANGED_AT_PREFIX + (user?.id ?? "")), HANDLE_COOLDOWN_DAYS)
  );
  const [nameLockedDays] = useState(() =>
    getDaysRemaining(storage.getString(KEYS.NAME_CHANGED_AT_PREFIX + (user?.id ?? "")), NAME_COOLDOWN_DAYS)
  );

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
    setListedHandle(null);
    handleTimerRef.current = setTimeout(async () => {
      const result = await checkUsernameAvailability(clean);
      if (!result) return;
      if (result.status === "listed") {
        setHandleStatus("listed");
        setListedHandle({ username: clean, price: result.price });
      } else if (result.status === "owned") {
        setHandleStatus("owned");
      } else {
        setHandleStatus(result.status === "available" ? "available" : result.status === "taken" ? "taken" : "invalid_format");
      }
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

  function selectDobPart(part: "day" | "month" | "year", value: number) {
    Haptics.selectionAsync();
    if (part === "day") setDobDay(value);
    if (part === "month") {
      setDobMonth(value);
      setDobDay(previous => Math.min(previous || 31, getDaysInMonth(value, dobYear)));
    }
    if (part === "year") {
      setDobYear(value);
      setDobDay(previous => Math.min(previous || 31, getDaysInMonth(dobMonth, value)));
    }
    setDobPicker(null);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    if (!displayName.trim()) { showAlert("Required", "Display name cannot be empty."); return; }
    if (bio.length > 150) { showAlert("Too long", "Bio is limited to 150 characters."); return; }
    if (handleStatus === "taken" || handleStatus === "listed" || handleStatus === "invalid_format") {
      if (handleStatus === "listed" && listedHandle) {
        showAlert(
          "Username listed for sale",
          `@${listedHandle.username} is reserved and can only be used after purchase.`,
          usernamePurchasePrompt(listedHandle.username, listedHandle.price, () => router.push("/app/afuusernames")),
        );
        return;
      }
      showAlert("Invalid handle", "Please fix your handle before saving."); return;
    }

    const nameChanged   = displayName.trim() !== profile?.display_name;
    const handleChanged = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_") !== profile?.handle;

    if (nameChanged && nameLockedDays > 0) {
      showAlert(
        "Name Locked",
        `You can change your display name again in ${nameLockedDays} day${nameLockedDays !== 1 ? "s" : ""}.`
      );
      return;
    }
    if (handleChanged && handleLockedDays > 0) {
      showAlert(
        "Username Locked",
        `You can change your username again in ${handleLockedDays} day${handleLockedDays !== 1 ? "s" : ""}.`
      );
      return;
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

    const { error: claimError } = handleChanged
      ? await supabase.rpc("claim_username", { p_username: cleanHandle })
      : { error: null };
    if (claimError) {
      setSaving(false);
      if (claimError.message.toLowerCase().includes("listed for sale")) {
        showAlert(
          "Username listed for sale",
          `@${cleanHandle} is reserved and can only be used after purchase.`,
          usernamePurchasePrompt(cleanHandle, listedHandle?.price, () => router.push("/app/afuusernames")),
        );
      } else {
        showAlert("Username unavailable", claimError.message);
      }
      return;
    }
    if (handleChanged) updateData.handle = cleanHandle;
    const { error } = await supabase.from("profiles").update(updateData).eq("id", user!.id);
    if (error) {
      showAlert("Error", error.message);
    } else {
      if (nameChanged)   storage.setString(KEYS.NAME_CHANGED_AT_PREFIX   + user!.id, Date.now().toString());
      if (handleChanged) storage.setString(KEYS.HANDLE_CHANGED_AT_PREFIX + user!.id, Date.now().toString());
      patchProfile(updateData);
      if (router.canGoBack()) router.back(); else router.replace("/(tabs)/me" as any);
    }
    setSaving(false);
  }

  // ── Filtered countries ─────────────────────────────────────────────────────
  const filteredCountries = countrySearch.trim()
    ? getCountries().filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()))
    : getCountries();

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
      behavior="padding"
      style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}
      keyboardVerticalOffset={insets.top + 48}
    >
      {/* Native-style navigation header */}
      <View style={[styles.navBar, { paddingTop: insets.top, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.navBarInner}>
          {/* Left — back */}
          <TouchableOpacity
            style={styles.navSideLeft}
            onPress={() => router.back()}
            hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            activeOpacity={0.6}
          >
            <Ionicons name="chevron-back" size={28} color={accent} />
          </TouchableOpacity>

          {/* Center — title */}
          <Text style={[styles.navTitle, { color: colors.text }]} numberOfLines={1}>
            Edit Profile
          </Text>

          {/* Right — save */}
          <View style={styles.navSideRight}>
            <TouchableOpacity
              onPress={save}
              disabled={saving}
              style={[styles.saveChip, { backgroundColor: accent, opacity: saving ? 0.7 : 1 }]}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveChipText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
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
                <Ionicons name="image" size={28} color={colors.textMuted} />
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

        {/* ── Profile Completion ── */}
        <ProfileCompletionCard
          accent={accent}
          colors={colors}
          steps={[
            {
              id: "photo",
              label: "Profile photo",
              hint: "Add a profile picture so people can recognise you",
              done: !!currentAvatar,
              icon: "camera",
            },
            {
              id: "name",
              label: "Display name",
              hint: "Set the name others see on your profile",
              done: !!displayName.trim(),
              icon: "person",
            },
            {
              id: "bio",
              label: "Bio",
              hint: "Write a short description about yourself",
              done: !!bio.trim(),
              icon: "document-text",
            },
            {
              id: "interests",
              label: "Interests (pick at least 3)",
              hint: "Choose topics to improve your recommendations",
              done: selectedInterests.size >= 3,
              icon: "compass",
            },
            {
              id: "country",
              label: "Country",
              hint: "Add your location to connect with nearby people",
              done: !!selectedCountry,
              icon: "location",
            },
          ]}
        />

        {/* ── Identity ── */}
        <SectionCard title="IDENTITY" icon="person" colors={colors}>
          <FieldRow label="Name" colors={colors}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TextInput
                style={[styles.fieldInput, { color: nameLockedDays > 0 ? colors.textMuted : colors.text, flex: 1 }]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your display name"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                returnKeyType="next"
                editable={nameLockedDays === 0}
              />
              {nameLockedDays > 0 && (
                <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
              )}
            </View>
            {nameLockedDays > 0 && (
              <Text style={[styles.handleHint, { color: colors.textMuted }]}>
                Can change in {nameLockedDays} day{nameLockedDays !== 1 ? "s" : ""} · changes every {NAME_COOLDOWN_DAYS} days
              </Text>
            )}
          </FieldRow>
          <FieldRow label="Handle" noBorder colors={colors}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={[styles.handleAt, { color: colors.textMuted }]}>@</Text>
              <TextInput
                style={[styles.fieldInput, { color: handleLockedDays > 0 ? colors.textMuted : colors.text, flex: 1 }]}
                value={handle}
                onChangeText={setHandle}
                placeholder="your_handle"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                editable={handleLockedDays === 0}
              />
              {handleLockedDays > 0
                ? <Ionicons name="lock-closed" size={14} color={colors.textMuted} style={{ marginLeft: 6 }} />
                : <HandleStatus status={handleStatus} colors={colors} accent={accent} />
              }
            </View>
            {handleLockedDays > 0 && (
              <Text style={[styles.handleHint, { color: colors.textMuted }]}>
                Can change in {handleLockedDays} day{handleLockedDays !== 1 ? "s" : ""} · changes every {HANDLE_COOLDOWN_DAYS} days
              </Text>
            )}
            {handleLockedDays === 0 && handleStatus === "taken" && (
              <Text style={[styles.handleHint, { color: "#FF3B30" }]}>That handle is already taken. Try another.</Text>
            )}
            {handleLockedDays === 0 && handleStatus === "invalid_format" && (
              <Text style={[styles.handleHint, { color: "#FF9F0A" }]}>Only letters, numbers and underscores, minimum 3 characters.</Text>
            )}
            {handleLockedDays === 0 && handleStatus === "available" && (
              <Text style={[styles.handleHint, { color: "#34C759" }]}>@{handle.trim().toLowerCase()} is available!</Text>
            )}
          </FieldRow>
        </SectionCard>

        {/* ── About ── */}
        <SectionCard title="ABOUT" icon="document-text" colors={colors}>
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
                  <Ionicons name="person-add-outline" size={13} color={accent} />
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
        <SectionCard title="LOCATION" icon="location" colors={colors}>
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
        <SectionCard title="PERSONAL" icon="heart" colors={colors}>
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
                    style={[
                      styles.dobPart,
                      part === "day" ? styles.dobPartDay : part === "month" ? styles.dobPartMonth : styles.dobPartYear,
                      { backgroundColor: colors.backgroundTertiary, borderColor: dobPicker === part ? accent : colors.border },
                    ]}
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
                <ScrollView
                  style={styles.dobPickerScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {dobPickerData.map(item => {
                    const isSelected = item.value === dobPickerValue;
                    return (
                      <TouchableOpacity
                        key={String(item.value)}
                        style={[styles.dobPickerItem, isSelected && { backgroundColor: accent + "15" }]}
                        onPress={() => selectDobPart(dobPicker, item.value)}
                      >
                        <Text style={[styles.dobPickerItemText, { color: isSelected ? accent : colors.text }]}>
                          {item.label}
                        </Text>
                        {isSelected && <Ionicons name="checkmark" size={16} color={accent} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
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
        <SectionCard title="INTERESTS" icon="compass" colors={colors}>
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
            <Ionicons name="search" size={16} color={colors.textMuted} />
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
              <Ionicons name="close-circle" size={18} color="#FF3B30" />
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

  // Native nav header
  navBar: {},
  navBarInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    paddingTop: 6,
  },
  navSideLeft: {
    width: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  navSideRight: {
    width: 72,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  saveChip: {
    width: 64,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
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
  dobRow: { flexDirection: "row", gap: 8, marginTop: 4, width: "100%" },
  dobPart: { minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
  dobPartDay: { flex: 0.8 },
  dobPartMonth: { flex: 1.45 },
  dobPartYear: { flex: 1 },
  dobPartText: { fontSize: 14, fontFamily: "Inter_400Regular", flexShrink: 1 },
  dobPickerWrap: { borderRadius: 12, borderWidth: 0.5, overflow: "hidden", marginTop: 10 },
  dobPickerScroll: { maxHeight: 180 },
  dobPickerItem: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
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
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalSearch: { flexDirection: "row", alignItems: "center", gap: 10, margin: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 0.5, ...Platform.select({ web: { boxShadow: "0 4px 20px rgba(0,0,0,0.13)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.13, shadowRadius: 12, elevation: 8 } }) },
  modalSearchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  countryRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  countryFlag: { fontSize: 24 },
  countryName: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  clearCountryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
});
