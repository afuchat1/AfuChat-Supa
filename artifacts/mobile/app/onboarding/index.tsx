import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { supabase } from "@/lib/supabase";
import { uploadAvatar as uploadAvatarMedia } from "@/lib/mediaUpload";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { showAlert } from "@/lib/alert";
import { COUNTRIES, type Country } from "@/constants/countries";
import {
  parsePhoneNumberFromString,
  AsYouType,
  type CountryCode,
} from "libphonenumber-js";
import { Avatar } from "@/components/ui/Avatar";
import { ensureAfuAiChat } from "@/lib/afuAiBot";
import { useAppAccent } from "@/context/AppAccentContext";
import { CHAT_THEME_COLORS, type ChatTheme } from "@/context/ChatPreferencesContext";

// ─── Constants ────────────────────────────────────────────────────────────────
const SCREEN_WIDTH = Dimensions.get("window").width;
const TOTAL_STEPS  = 5;

// Spring matching the tab-swipe architecture in (tabs)/_layout.tsx
const SPRING_CONF = { damping: 26, stiffness: 340, mass: 0.75, overshootClamping: false } as const;

const INTERESTS = [
  { id: "technology", label: "Technology",   icon: "laptop-outline"         },
  { id: "music",      label: "Music",         icon: "musical-notes-outline"  },
  { id: "sports",     label: "Sports",         icon: "football-outline"       },
  { id: "fashion",    label: "Fashion",        icon: "shirt-outline"          },
  { id: "food",       label: "Food & Cooking", icon: "restaurant-outline"     },
  { id: "travel",     label: "Travel",         icon: "airplane-outline"       },
  { id: "art",        label: "Art & Design",   icon: "color-palette-outline"  },
  { id: "gaming",     label: "Gaming",         icon: "game-controller-outline"},
  { id: "fitness",    label: "Fitness",        icon: "barbell-outline"        },
  { id: "photography",label: "Photography",    icon: "camera-outline"         },
  { id: "business",   label: "Business",       icon: "briefcase-outline"      },
  { id: "education",  label: "Education",      icon: "school-outline"         },
  { id: "movies",     label: "Movies & TV",    icon: "film-outline"           },
  { id: "reading",    label: "Reading",        icon: "book-outline"           },
  { id: "nature",     label: "Nature",         icon: "leaf-outline"           },
  { id: "politics",   label: "Politics",       icon: "megaphone-outline"      },
  { id: "science",    label: "Science",        icon: "flask-outline"          },
  { id: "crypto",     label: "Crypto & Web3",  icon: "logo-bitcoin"           },
];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function getDaysInMonth(month: number, year: number) {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

const ACCENT_THEMES: { name: ChatTheme; hex: string }[] = [
  { name: "Teal",    hex: "#00BCD4" },
  { name: "Blue",    hex: "#007AFF" },
  { name: "Purple",  hex: "#AF52DE" },
  { name: "Rose",    hex: "#FF2D55" },
  { name: "Amber",   hex: "#FF9500" },
  { name: "Emerald", hex: "#34C759" },
];

// ─── Dot indicator ─────────────────────────────────────────────────────────────
// Driven directly by translateX so it animates live while the user drags.
function DotIndicator({
  index,
  translateX,
  accent,
}: {
  index:      number;
  translateX: Reanimated.SharedValue<number>;
  accent:     string;
}) {
  const style = useAnimatedStyle(() => {
    // Current fractional page position (0 = step1, 1 = step2, …)
    const pos  = -translateX.value / SCREEN_WIDTH;
    const dist = Math.abs(pos - index);
    return {
      width:        interpolate(dist, [0, 0.55, 1], [20, 7, 7],   Extrapolation.CLAMP),
      borderRadius: interpolate(dist, [0, 0.55, 1], [5,  3.5, 3.5], Extrapolation.CLAMP),
      opacity:      interpolate(dist, [0, 0.55, 1], [1,  0.38, 0.3], Extrapolation.CLAMP),
    };
  });
  return <Reanimated.View style={[st.dot, style, { backgroundColor: accent }]} />;
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { user, refreshProfile } = useAuth();
  const { appTheme, setAppTheme } = useAppAccent();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ userId?: string }>();

  // ── Form state (identical to original) ──────────────────────────────────────
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<ChatTheme>(appTheme);

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleStatus, setHandleStatus] = useState<"idle"|"checking"|"available"|"taken"|"invalid_format">("idle");
  const handleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [phoneAvailStatus, setPhoneAvailStatus] = useState<"idle"|"checking"|"available"|"taken">("idle");
  const phoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [takenHandleProfile, setTakenHandleProfile] = useState<{ display_name: string; avatar_url: string | null; handle: string } | null>(null);
  const [takenPhoneProfile, setTakenPhoneProfile] = useState<{ display_name: string; avatar_url: string | null; handle: string } | null>(null);

  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const [dobDay, setDobDay]     = useState(0);
  const [dobMonth, setDobMonth] = useState(0);
  const [dobYear, setDobYear]   = useState(0);
  const [showDobPicker, setShowDobPicker] = useState<"day"|"month"|"year"|null>(null);
  const [gender, setGender] = useState<"male"|"female"|"">("");

  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const userId = params.userId || user?.id;

  // ── Reanimated — page slide (same pattern as SwipeTabsWrapper in tabs) ───────
  // translateX = 0 → step 1, -(SCREEN_WIDTH) → step 2, etc.
  const translateX = useSharedValue(0);
  // stepSV mirrors `step` as a shared value so worklets can read it without
  // capturing a stale closure — identical to tabIdxSV in the tabs layout.
  const stepSV = useSharedValue(1);

  // Sync animation whenever step state changes (same role as useEffect in tabs)
  useEffect(() => {
    stepSV.value = step;
    translateX.value = withSpring(-(step - 1) * SCREEN_WIDTH, SPRING_CONF);
  }, [step]);

  const pagerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // ── Navigation helpers ────────────────────────────────────────────────────────
  function goNext() {
    if (step >= TOTAL_STEPS) return;
    Keyboard.dismiss();
    Haptics.selectionAsync();
    setStep(step + 1);
  }

  function goBack() {
    if (step <= 1) return;
    Keyboard.dismiss();
    Haptics.selectionAsync();
    setStep(step - 1);
  }

  // Called by the gesture's onEnd via runOnJS when a swipe-left gesture completes.
  // Checks canProceed() on the JS thread where all state is current.
  function tryGoNext() {
    if (canProceed()) {
      goNext();
    } else {
      // Snap back — user can't advance yet
      translateX.value = withSpring(-(step - 1) * SCREEN_WIDTH, SPRING_CONF);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }

  // ── Pan gesture — same architecture as SwipeTabsWrapper ───────────────────────
  const panGesture = useRef(
    Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-20, 20])
      .onUpdate((e) => {
        "worklet";
        const base   = -(stepSV.value - 1) * SCREEN_WIDTH;
        const atStart = stepSV.value === 1;
        const atEnd   = stepSV.value === TOTAL_STEPS;

        // Rubber-band at first/last step — identical coefficient (0.15) as tabs
        if (atStart && e.translationX > 0) {
          translateX.value = base + e.translationX * 0.15;
        } else if (atEnd && e.translationX < 0) {
          translateX.value = base + e.translationX * 0.15;
        } else {
          translateX.value = base + e.translationX;
        }
      })
      .onEnd((e) => {
        "worklet";
        const base      = -(stepSV.value - 1) * SCREEN_WIDTH;
        const THRESHOLD = SCREEN_WIDTH * 0.28;
        const isFling   = Math.abs(e.velocityX) > 350;
        const isFar     = Math.abs(e.translationX) > THRESHOLD;

        if (e.translationX < 0 && (isFling || isFar) && stepSV.value < TOTAL_STEPS) {
          // Swiped left → try to advance (canProceed() checked on JS thread)
          runOnJS(tryGoNext)();
        } else if (e.translationX > 0 && (isFling || isFar) && stepSV.value > 1) {
          // Swiped right → always allowed to go back
          runOnJS(goBack)();
        } else {
          // Below threshold — snap back to current step
          translateX.value = withSpring(base, SPRING_CONF);
        }
      })
  ).current;

  // ── Validation (unchanged) ───────────────────────────────────────────────────
  function canProceed(): boolean {
    switch (step) {
      case 1:
        return displayName.trim().length >= 2 && handle.trim().length >= 3 && handleStatus === "available";
      case 2:
        return selectedCountry !== null && validatePhone() && phoneAvailStatus === "available";
      case 3: {
        const currentYear = new Date().getFullYear();
        return dobDay > 0 && dobMonth > 0 && dobYear > 0 && dobYear <= currentYear - 13 && gender !== "";
      }
      case 4:
        return selectedInterests.size >= 3;
      case 5:
        return avatarUri !== null;
      default:
        return false;
    }
  }

  // ── Effects (unchanged) ──────────────────────────────────────────────────────
  useEffect(() => { detectCountry(); }, []);

  useEffect(() => {
    if (handleTimerRef.current) clearTimeout(handleTimerRef.current);
    const raw = handle.trim();
    if (!raw) { setHandleStatus("idle"); return; }
    const clean = raw.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    if (raw !== raw.replace(/[^a-zA-Z0-9_@]/g, "") || clean.length < 3) {
      setHandleStatus("invalid_format"); return;
    }
    setHandleStatus("checking");
    setTakenHandleProfile(null);
    handleTimerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, handle")
        .eq("handle", clean)
        .neq("id", userId || "")
        .maybeSingle();
      if (data) {
        setHandleStatus("taken");
        setTakenHandleProfile({ display_name: data.display_name, avatar_url: data.avatar_url, handle: data.handle });
      } else {
        setHandleStatus("available");
        setTakenHandleProfile(null);
      }
    }, 600);
    return () => { if (handleTimerRef.current) clearTimeout(handleTimerRef.current); };
  }, [handle]);

  useEffect(() => {
    if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current);
    if (!selectedCountry || !phoneNumber) { setPhoneAvailStatus("idle"); return; }
    const v = getPhoneValidation();
    if (!v.valid) { setPhoneAvailStatus("idle"); return; }
    const fullPhone = `${selectedCountry.dial}${phoneNumber.replace(/\D/g, "")}`;
    setPhoneAvailStatus("checking");
    setTakenPhoneProfile(null);
    phoneTimerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, handle")
        .eq("phone_number", fullPhone)
        .neq("id", userId || "")
        .maybeSingle();
      if (data) {
        setPhoneAvailStatus("taken");
        setTakenPhoneProfile({ display_name: data.display_name, avatar_url: data.avatar_url, handle: data.handle });
      } else {
        setPhoneAvailStatus("available");
        setTakenPhoneProfile(null);
      }
    }, 700);
    return () => { if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current); };
  }, [phoneNumber, selectedCountry]);

  // ── Country detection (unchanged) ────────────────────────────────────────────
  async function detectCountry() {
    if (selectedCountry) return;
    const pickByCode = (code?: string | null) => {
      if (!code) return false;
      const match = COUNTRIES.find((c) => c.code.toUpperCase() === code.toUpperCase());
      if (match) { setSelectedCountry(match); return true; }
      return false;
    };
    const ipEndpoints = [
      { url: "https://ipwho.is/",    field: "country_code" },
      { url: "https://ipapi.co/json/", field: "country"     },
    ];
    for (const { url, field } of ipEndpoints) {
      try {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res   = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const json = await res.json();
        if (pickByCode(json?.[field])) return;
      } catch { /* try next */ }
    }
    if (Platform.OS === "web") {
      try {
        const langs: string[] = (navigator as any)?.languages?.length
          ? (navigator as any).languages : [navigator.language];
        for (const lang of langs) {
          const region = lang?.split("-")[1];
          if (pickByCode(region)) return;
        }
      } catch { /* ignore */ }
    }
    if (Platform.OS !== "web") {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const [geo]    = await Location.reverseGeocodeAsync({ latitude: location.coords.latitude, longitude: location.coords.longitude });
        pickByCode(geo?.isoCountryCode);
      } catch { /* ignore */ }
    }
  }

  // ── Phone helpers (unchanged) ────────────────────────────────────────────────
  function normalizeLocalNumber(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    return digits.startsWith("0") ? digits.replace(/^0+/, "") : digits;
  }

  function formatPhoneForDisplay(raw: string): string {
    if (!selectedCountry) return raw;
    const local = normalizeLocalNumber(raw);
    try { return new AsYouType(selectedCountry.code as CountryCode).input(local); }
    catch { return local; }
  }

  function getPhoneValidation(): { valid: boolean; reason?: "empty"|"tooShort"|"tooLong"|"invalid"; e164?: string } {
    if (!selectedCountry) return { valid: false, reason: "empty" };
    const local = normalizeLocalNumber(phoneNumber);
    if (!local) return { valid: false, reason: "empty" };
    try {
      const parsed = parsePhoneNumberFromString(`${selectedCountry.dial}${local}`, selectedCountry.code as CountryCode);
      if (parsed?.isValid()) return { valid: true, e164: parsed.number };
      const expected = selectedCountry.phoneLength;
      const min = Math.min(...expected);
      const max = Math.max(...expected);
      if (local.length < min) return { valid: false, reason: "tooShort" };
      if (local.length > max) return { valid: false, reason: "tooLong" };
      return { valid: false, reason: "invalid" };
    } catch {
      const ok = selectedCountry.phoneLength.includes(local.length);
      return ok ? { valid: true, e164: `${selectedCountry.dial}${local}` } : { valid: false, reason: "invalid" };
    }
  }

  function validatePhone(): boolean { return getPhoneValidation().valid; }

  // ── Accent / interest helpers (unchanged) ────────────────────────────────────
  function handleAccentTheme(theme: ChatTheme) {
    setSelectedTheme(theme);
    setAppTheme(theme);
    Haptics.selectionAsync();
  }

  function toggleInterest(id: string) {
    setSelectedInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    Haptics.selectionAsync();
  }

  // ── Avatar (unchanged) ───────────────────────────────────────────────────────
  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Please allow access to your photo library to upload a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setAvatarUri(result.assets[0].uri);
  }

  async function uploadAvatar(): Promise<string | null> {
    if (!avatarUri || !userId) return null;
    return uploadAvatarMedia(userId, avatarUri);
  }

  // ── Complete (unchanged) ─────────────────────────────────────────────────────
  async function handleComplete() {
    if (!userId) { showAlert("Error", "User session not found. Please log in again."); return; }
    const cleanHandle = handle.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    if (cleanHandle.length < 3) { showAlert("Invalid handle", "Handle must be at least 3 characters."); return; }

    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const { error: handleError } = await supabase
      .from("profiles").select("id").eq("handle", cleanHandle).neq("id", userId).limit(1).single();
    if (!handleError) {
      setLoading(false);
      showAlert("Handle taken", "This handle is already in use. Please choose another one.");
      setStep(1); return;
    }

    let avatarUrl: string | null = null;
    if (avatarUri) avatarUrl = await uploadAvatar();

    const fullPhone = selectedCountry ? `${selectedCountry.dial}${phoneNumber.replace(/\D/g, "")}` : null;
    if (fullPhone) {
      const { data: existingPhone } = await supabase.from("profiles").select("id").eq("phone_number", fullPhone).neq("id", userId).limit(1).maybeSingle();
      if (existingPhone) {
        setLoading(false);
        showAlert("Phone number taken", "This phone number is already linked to another account.");
        return;
      }
    }

    const profileData: any = {
      id: userId,
      handle: cleanHandle,
      display_name: displayName.trim(),
      gender,
      date_of_birth: `${String(dobYear).padStart(4,"0")}-${String(dobMonth).padStart(2,"0")}-${String(dobDay).padStart(2,"0")}`,
      country: selectedCountry?.name || null,
      phone_number: fullPhone,
      interests: Array.from(selectedInterests),
      onboarding_completed: true,
    };
    if (avatarUrl) profileData.avatar_url = avatarUrl;

    const { error: profileError } = await supabase.from("profiles").upsert(profileData, { onConflict: "id" });
    if (profileError) {
      setLoading(false);
      if (profileError.code === "23505") {
        const constraint = (profileError as any).details || profileError.message || "";
        if (constraint.includes("phone_number") || constraint.includes("profiles_phone_number")) {
          showAlert("Phone number taken", "This phone number is already linked to another account.");
        } else {
          showAlert("Handle taken", "This handle is already in use."); setStep(1);
        }
      } else {
        showAlert("Error", profileError.message || "Could not save your profile. Please try again.");
      }
      return;
    }

    try {
      const stored = await AsyncStorage.getItem("referrer_handle");
      if (stored) {
        await AsyncStorage.removeItem("referrer_handle");
        const refHandle = stored.trim().toLowerCase();
        // Call the SECURITY DEFINER SQL function — it runs as postgres,
        // bypasses RLS so it can update the referrer's XP from the invitee's
        // session, uses the correct column names, and is fully atomic.
        if (refHandle && refHandle !== cleanHandle) {
          const { data: rpcResult, error: rpcError } = await supabase.rpc(
            "handle_referral_reward",
            { p_referrer_handle: refHandle, p_referred_id: userId },
          );
          if (rpcError) {
            console.warn("[referral] rpc error:", rpcError.message);
          } else if (rpcResult && !rpcResult.ok) {
            console.warn("[referral] not rewarded:", rpcResult.reason);
          } else if (rpcResult?.ok) {
            console.log("[referral] referrer rewarded with 2000 XP:", rpcResult.referrer_id);
          }
        }
      }
    } catch (referralErr) {
      console.warn("[referral] unexpected error:", referralErr);
    }

    try { const { rewardXp } = await import("../../lib/rewardXp"); await rewardXp("profile_completed"); } catch (_) {}
    try { await supabase.from("chat_preferences").upsert({ user_id: userId, chat_theme: selectedTheme }, { onConflict: "user_id" }); } catch (_) {}

    await refreshProfile();
    ensureAfuAiChat(userId, displayName.trim()).catch(() => {});
    setLoading(false);
    router.replace("/(tabs)");
  }

  // ── Derived display data ─────────────────────────────────────────────────────
  const filteredCountries = countrySearch.trim()
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.dial.includes(countrySearch) || c.code.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRIES;

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1920 - 12 }, (_, i) => currentYear - 13 - i);
  const days  = Array.from({ length: getDaysInMonth(dobMonth, dobYear) }, (_, i) => i + 1);

  // ── Step renderers (identical content to original) ───────────────────────────
  function renderStep1() {
    return (
      <View style={st.stepContent}>
        <View style={st.stepHeader}>
          <Text style={st.stepEmoji}>👋</Text>
          <Text style={[st.stepTitle, { color: colors.text }]}>Set up your profile</Text>
          <Text style={[st.stepDesc, { color: colors.textSecondary }]}>
            Choose a display name and a unique handle that others will use to find you.
          </Text>
        </View>

        <View style={st.fieldsGroup}>
          <View style={st.fieldWrap}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Display Name</Text>
            <View style={[st.field, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="person-outline" size={18} color={focusedField === "displayName" ? colors.accent : colors.textMuted} style={st.fieldIcon} />
              <TextInput
                style={[st.input, { color: colors.text }]}
                placeholder="e.g. John Doe"
                placeholderTextColor={colors.textMuted}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                autoFocus
                onFocus={() => setFocusedField("displayName")}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </View>

          <View style={st.fieldWrap}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Username</Text>
            <View style={[st.field, { backgroundColor: colors.inputBg }]}>
              <Ionicons
                name="at-outline"
                size={18}
                color={handleStatus === "available" ? "#34C759" : handleStatus === "taken" || handleStatus === "invalid_format" ? "#FF3B30" : focusedField === "handle" ? colors.accent : colors.textMuted}
                style={st.fieldIcon}
              />
              <TextInput
                style={[st.input, { color: colors.text }]}
                placeholder="e.g. johndoe"
                placeholderTextColor={colors.textMuted}
                value={handle}
                onChangeText={(t) => setHandle(t.replace(/[^a-zA-Z0-9_@]/g, "").toLowerCase())}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocusedField("handle")}
                onBlur={() => setFocusedField(null)}
              />
              {handleStatus === "checking" && <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 8 }} />}
              {handleStatus === "available" && <Ionicons name="checkmark-circle" size={20} color="#34C759" style={{ marginRight: 8 }} />}
              {handleStatus === "taken" && <Ionicons name="close-circle" size={20} color="#FF3B30" style={{ marginRight: 8 }} />}
            </View>
            {handleStatus === "invalid_format" && <Text style={st.errorHint}>Use only letters, numbers, and underscores (min 3 chars)</Text>}
            {handleStatus === "available" && <Text style={st.successHint}>✓ @{handle.replace(/[^a-zA-Z0-9_]/g,"").toLowerCase()} is available</Text>}
            {handleStatus === "taken" && takenHandleProfile && (
              <View style={[st.takenCard, { backgroundColor: colors.inputBg, borderColor: "#FF3B30" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Avatar uri={takenHandleProfile.avatar_url} name={takenHandleProfile.display_name} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontSize: 14, fontFamily: "Inter_600SemiBold" }, { color: colors.text }]}>{takenHandleProfile.display_name}</Text>
                    <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular" }, { color: colors.textMuted }]}>@{takenHandleProfile.handle}</Text>
                  </View>
                </View>
                <TouchableOpacity style={[st.takenLoginBtn, { backgroundColor: colors.accent }]} onPress={() => router.replace("/(auth)/login")}>
                  <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Log In Instead</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  function renderStep2() {
    const phoneV = getPhoneValidation();
    return (
      <View style={st.stepContent}>
        <View style={st.stepHeader}>
          <Text style={st.stepEmoji}>📱</Text>
          <Text style={[st.stepTitle, { color: colors.text }]}>Your phone number</Text>
          <Text style={[st.stepDesc, { color: colors.textSecondary }]}>
            Used for account recovery and connecting with contacts. Never shared publicly.
          </Text>
        </View>

        <View style={st.fieldsGroup}>
          <View style={st.fieldWrap}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Country</Text>
            <TouchableOpacity style={[st.field, { backgroundColor: colors.inputBg }]} onPress={() => setShowCountryPicker(true)}>
              {selectedCountry ? (
                <>
                  <Text style={st.countryFlag}>{selectedCountry.flag}</Text>
                  <Text style={[st.countryName, { color: colors.text }]}>{selectedCountry.name}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="globe-outline" size={18} color={colors.textMuted} style={st.fieldIcon} />
                  <Text style={[st.placeholderText, { color: colors.textMuted }]}>Select your country</Text>
                </>
              )}
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {selectedCountry && (
            <View style={st.fieldWrap}>
              <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Phone Number</Text>
              <View style={st.phoneRow}>
                <View style={[st.dialCodeBox, { backgroundColor: colors.inputBg }]}>
                  <Text style={st.countryFlag}>{selectedCountry.flag}</Text>
                  <Text style={[st.dialCodeText, { color: colors.text }]}>{selectedCountry.dial}</Text>
                </View>
                <View style={[st.phoneField, { backgroundColor: colors.inputBg, flex: 1 }]}>
                  <TextInput
                    style={[st.input, { color: colors.text }]}
                    placeholder="e.g. 772 123 456"
                    placeholderTextColor={colors.textMuted}
                    value={phoneNumber}
                    onChangeText={(t) => setPhoneNumber(formatPhoneForDisplay(t))}
                    keyboardType="phone-pad"
                    onFocus={() => setFocusedField("phone")}
                    onBlur={() => setFocusedField(null)}
                  />
                  {phoneAvailStatus === "checking" && <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 8 }} />}
                  {phoneAvailStatus === "available" && <Ionicons name="checkmark-circle" size={20} color="#34C759" style={{ marginRight: 8 }} />}
                  {phoneAvailStatus === "taken" && <Ionicons name="close-circle" size={20} color="#FF3B30" style={{ marginRight: 8 }} />}
                </View>
              </View>
              {phoneNumber && !phoneV.valid && phoneV.reason === "tooShort" && <Text style={[st.fieldHint, { color: colors.textMuted }]}>Number seems too short</Text>}
              {phoneNumber && !phoneV.valid && phoneV.reason === "tooLong"  && <Text style={st.errorHint}>Number seems too long</Text>}
              {phoneV.valid && phoneAvailStatus === "available" && <Text style={st.successHint}>✓ Phone number is available</Text>}
              {phoneAvailStatus === "taken" && takenPhoneProfile && (
                <View style={[st.takenCard, { backgroundColor: colors.inputBg, borderColor: "#FF3B30" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    <Avatar uri={takenPhoneProfile.avatar_url} name={takenPhoneProfile.display_name} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={[{ fontSize: 14, fontFamily: "Inter_600SemiBold" }, { color: colors.text }]}>{takenPhoneProfile.display_name}</Text>
                      <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular" }, { color: colors.textMuted }]}>@{takenPhoneProfile.handle}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={[st.takenLoginBtn, { backgroundColor: colors.accent }]} onPress={() => router.replace("/(auth)/login")}>
                    <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Log In Instead</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  }

  function renderStep3() {
    return (
      <View style={st.stepContent}>
        <View style={st.stepHeader}>
          <Text style={st.stepEmoji}>🎂</Text>
          <Text style={[st.stepTitle, { color: colors.text }]}>Date of birth & gender</Text>
          <Text style={[st.stepDesc, { color: colors.textSecondary }]}>
            Your birthday is private and used only for age verification and recommendations.
          </Text>
        </View>

        <View style={st.fieldsGroup}>
          <View style={st.fieldWrap}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Date of Birth</Text>
            <View style={st.dobRow}>
              {(["day","month","year"] as const).map((part) => (
                <TouchableOpacity
                  key={part}
                  style={[st.dobSelector, { backgroundColor: colors.inputBg, flex: part === "month" ? 1.4 : 1 }]}
                  onPress={() => setShowDobPicker(part)}
                >
                  <Text style={[st.dobSelectorText, {
                    color: (part === "day" ? dobDay : part === "month" ? dobMonth : dobYear) ? colors.text : colors.textMuted,
                  }]}>
                    {part === "day" ? (dobDay || "Day") : part === "month" ? (dobMonth ? MONTHS[dobMonth - 1].slice(0, 3) : "Month") : (dobYear || "Year")}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={st.fieldWrap}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Gender</Text>
            <View style={st.genderRow}>
              {([["male","Male","♂"], ["female","Female","♀"]] as const).map(([val, label, icon]) => (
                <TouchableOpacity
                  key={val}
                  style={[st.genderBtn, { backgroundColor: gender === val ? colors.accent : colors.inputBg }]}
                  onPress={() => { setGender(val); Haptics.selectionAsync(); }}
                >
                  <Text style={{ fontSize: 20 }}>{icon}</Text>
                  <Text style={[st.genderText, { color: gender === val ? "#fff" : colors.text }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  }

  function renderStep4() {
    return (
      <View style={st.stepContent}>
        <View style={st.stepHeader}>
          <Text style={st.stepEmoji}>✨</Text>
          <Text style={[st.stepTitle, { color: colors.text }]}>What are you into?</Text>
          <Text style={[st.stepDesc, { color: colors.textSecondary }]}>
            Pick at least 3 interests to personalise your feed and connect with like-minded people.
          </Text>
        </View>

        <View style={st.fieldsGroup}>
          {/* Accent theme card */}
          <View style={[st.accentCard, { backgroundColor: colors.inputBg }]}>
            <View style={st.accentCardTop}>
              <View style={[st.accentIconWrap, { backgroundColor: colors.accent + "22" }]}>
                <Ionicons name="color-palette-outline" size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.accentCardLabel, { color: colors.text }]}>App Accent Color</Text>
                <Text style={[st.accentCardDesc, { color: colors.textMuted }]}>Pick a theme that feels like you</Text>
              </View>
              <View style={[st.accentIconWrap, { backgroundColor: colors.accent }]}>
                <Text style={st.accentChipLabel}>{selectedTheme.charAt(0)}</Text>
              </View>
            </View>
            <View style={st.accentSwatches}>
              {ACCENT_THEMES.map(({ name, hex }) => (
                <TouchableOpacity key={name} onPress={() => handleAccentTheme(name)} style={[st.accentSwatch, { backgroundColor: hex }, selectedTheme === name && st.accentSwatchActive]}>
                  {selectedTheme === name && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            <Text style={[st.interestCount, { color: colors.textSecondary, textAlign: "left", marginBottom: 10 }]}>
              {selectedInterests.size}/3 minimum selected
            </Text>
            <View style={st.interestsGrid}>
              {INTERESTS.map(({ id, label, icon }) => {
                const sel = selectedInterests.has(id);
                return (
                  <TouchableOpacity
                    key={id}
                    style={[st.interestChip, { backgroundColor: sel ? colors.accent : colors.inputBg, borderColor: sel ? colors.accent : colors.border }]}
                    onPress={() => toggleInterest(id)}
                  >
                    <Ionicons name={icon as any} size={16} color={sel ? "#fff" : colors.textMuted} />
                    <Text style={[st.interestText, { color: sel ? "#fff" : colors.text }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    );
  }

  function renderStep5() {
    return (
      <View style={st.stepContent}>
        <View style={st.stepHeader}>
          <Text style={st.stepEmoji}>📸</Text>
          <Text style={[st.stepTitle, { color: colors.text }]}>Add a profile photo</Text>
          <Text style={[st.stepDesc, { color: colors.textSecondary }]}>
            Let people recognise you! Add a photo to complete your profile.
          </Text>
        </View>

        <View style={st.avatarSection}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
            <View style={st.avatarContainer}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={st.avatarImage} />
              ) : (
                <View style={[st.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
                  <Ionicons name="camera" size={40} color={colors.textMuted} />
                </View>
              )}
              <View style={st.avatarBadge}>
                <Ionicons name="add-circle" size={28} color={colors.accent} />
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickAvatar}>
            <Text style={[st.photoActionText, { color: colors.accent }]}>
              {avatarUri ? "Change Photo" : "Choose from Gallery"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[st.summaryCard, { backgroundColor: colors.inputBg }]}>
          <Text style={[st.summaryTitle, { color: colors.text }]}>Your Profile Summary</Text>
          {[
            ["Name",     displayName],
            ["Username", `@${handle.replace(/[^a-zA-Z0-9_]/g,"").toLowerCase()}`],
            ["Country",  `${selectedCountry?.flag ?? ""} ${selectedCountry?.name ?? "—"}`],
            ["Phone",    `${selectedCountry?.dial ?? ""} ${phoneNumber}`],
            ["Born",     `${dobDay} ${MONTHS[dobMonth - 1] ?? ""} ${dobYear}`],
            ["Gender",   gender === "male" ? "Male" : gender === "female" ? "Female" : "—"],
          ].map(([label, val]) => (
            <View key={label} style={st.summaryRow}>
              <Text style={[st.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
              <Text style={[st.summaryValue, { color: colors.text }]}>{val}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Modal renderers (unchanged) ──────────────────────────────────────────────
  function renderCountryPicker() {
    return (
      <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={[st.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[st.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[st.modalTitle, { color: colors.text }]}>Select Country</Text>
            <TouchableOpacity onPress={() => { setShowCountryPicker(false); setCountrySearch(""); }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={[st.searchBox, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[st.searchInput, { color: colors.text }]}
              placeholder="Search country..."
              placeholderTextColor={colors.textMuted}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoFocus
            />
          </View>
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[st.countryItem, { borderBottomColor: colors.border }, selectedCountry?.code === item.code && { backgroundColor: colors.inputBg }]}
                onPress={() => { setSelectedCountry(item); setShowCountryPicker(false); setCountrySearch(""); setPhoneNumber(""); Haptics.selectionAsync(); }}
              >
                <Text style={st.countryItemFlag}>{item.flag}</Text>
                <Text style={[st.countryItemName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[st.countryItemDial, { color: colors.textMuted }]}>{item.dial}</Text>
                {selectedCountry?.code === item.code && <Ionicons name="checkmark-circle" size={20} color={colors.accent} style={{ marginLeft: 8 }} />}
              </TouchableOpacity>
            )}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </Modal>
    );
  }

  function renderDobPicker() {
    if (!showDobPicker) return null;
    let data: { label: string; value: number }[] = [];
    let title = "";
    if (showDobPicker === "day")        { data = days.map((d) => ({ label: String(d), value: d })); title = "Select Day"; }
    else if (showDobPicker === "month") { data = MONTHS.map((m, i) => ({ label: m, value: i + 1 })); title = "Select Month"; }
    else                                { data = years.map((y) => ({ label: String(y), value: y })); title = "Select Year"; }

    return (
      <Modal visible={!!showDobPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={[st.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[st.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[st.modalTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={() => setShowDobPicker(null)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={data}
            keyExtractor={(item) => String(item.value)}
            renderItem={({ item }) => {
              const selected = (showDobPicker === "day" && dobDay === item.value) || (showDobPicker === "month" && dobMonth === item.value) || (showDobPicker === "year" && dobYear === item.value);
              return (
                <TouchableOpacity
                  style={[st.pickerItem, { borderBottomColor: colors.border }, selected && { backgroundColor: colors.inputBg }]}
                  onPress={() => {
                    if (showDobPicker === "day") setDobDay(item.value);
                    else if (showDobPicker === "month") setDobMonth(item.value);
                    else setDobYear(item.value);
                    setShowDobPicker(null);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={[st.pickerItemText, { color: colors.text }]}>{item.label}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                </TouchableOpacity>
              );
            }}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </Modal>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];

  return (
    <KeyboardAvoidingView
      style={[st.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* ── Top bar ── */}
      <View style={[st.topBar, { paddingTop: insets.top + 8 }]}>
        {step > 1 ? (
          <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={24} color={colors.accent} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <Text style={[st.stepIndicator, { color: colors.textMuted }]}>Step {step} of {TOTAL_STEPS}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* ── Page dot indicator — live-animated by translateX ── */}
      <View style={st.dotsRow}>
        {stepRenderers.map((_, i) => (
          <DotIndicator key={i} index={i} translateX={translateX} accent={colors.accent} />
        ))}
      </View>

      {/* ── Sliding page strip — identical pattern to SwipeTabsWrapper ── */}
      <View style={st.pagerOuter}>
        <GestureDetector gesture={panGesture}>
          <Reanimated.View style={[st.pagerStrip, pagerAnimStyle]}>
            {stepRenderers.map((renderFn, i) => (
              <ScrollView
                key={i}
                style={{ width: SCREEN_WIDTH }}
                contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 140 }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                // Prevent nested horizontal scroll from interfering with pan gesture
                scrollEnabled
              >
                {renderFn()}
              </ScrollView>
            ))}
          </Reanimated.View>
        </GestureDetector>
      </View>

      {/* ── Bottom action bar — positioned absolute so it floats above keyboard ── */}
      <View style={[st.bottomBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16, backgroundColor: colors.background }]}>
        <Pressable
          style={[st.nextBtn, { backgroundColor: colors.accent, opacity: canProceed() ? 1 : 0.4 }]}
          onPress={step === TOTAL_STEPS ? handleComplete : tryGoNext}
          disabled={!canProceed() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={st.nextBtnText}>
              {step === TOTAL_STEPS ? "Get Started" : "Continue"}
            </Text>
          )}
        </Pressable>
      </View>

      {renderCountryPicker()}
      {renderDobPicker()}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root:    { flex: 1 },

  // Header
  topBar: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom:  12,
  },
  stepIndicator: { fontSize: 14, fontFamily: "Inter_500Medium" },

  // Page dots
  dotsRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:  8,
    paddingBottom: 14,
    paddingTop:  2,
  },
  dot: {
    height: 7,
    // width animated per DotIndicator
  },

  // Sliding pager — same overflow pattern as tabs SwipeTabsWrapper
  pagerOuter: { flex: 1, overflow: "hidden" },
  pagerStrip: {
    flexDirection: "row",
    width: SCREEN_WIDTH * TOTAL_STEPS,
  },

  // Per-step scroll
  scrollContent: { paddingHorizontal: 24, paddingTop: 24 },

  // Step content layout
  stepContent: { gap: 28 },
  stepHeader:  { alignItems: "center", gap: 8 },
  stepEmoji:   { fontSize: 48, marginBottom: 4 },
  stepTitle:   { fontSize: 26, fontFamily: "Inter_700Bold",     textAlign: "center" },
  stepDesc:    { fontSize: 15, fontFamily: "Inter_400Regular",  textAlign: "center", lineHeight: 22, paddingHorizontal: 8 },

  // Form fields
  fieldsGroup: { gap: 20 },
  fieldWrap:   { gap: 6 },
  fieldLabel:  { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingLeft: 2 },
  field: {
    flexDirection: "row",
    alignItems:    "center",
    borderRadius:  12,
    paddingHorizontal: 14,
    height: 52,
  },
  fieldIcon:   { marginRight: 10 },
  input:       { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", height: 52, outlineStyle: "none" } as any,
  fieldHint:   { fontSize: 12, fontFamily: "Inter_400Regular", paddingLeft: 2 },
  errorHint:   { fontSize: 12, fontFamily: "Inter_500Medium",  paddingLeft: 2, color: "#FF3B30" },
  successHint: { fontSize: 12, fontFamily: "Inter_500Medium",  paddingLeft: 2, color: "#34C759" },
  takenCard:   { borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 4, flexDirection: "row", alignItems: "center", gap: 8 },
  takenLoginBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },

  // Phone
  countryFlag:  { fontSize: 22, marginRight: 10 },
  countryName:  { fontSize: 16, fontFamily: "Inter_400Regular", flex: 1 },
  placeholderText: { fontSize: 16, fontFamily: "Inter_400Regular", flex: 1 },
  phoneRow:     { flexDirection: "row", gap: 8 },
  dialCodeBox:  { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, height: 52, minWidth: 90 },
  dialCodeText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  phoneField:   { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, height: 52 },

  // DOB / gender
  dobRow:          { flexDirection: "row", alignItems: "center", gap: 8 },
  dobSelector:     { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, paddingHorizontal: 14 },
  dobSelectorText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  genderRow:       { flexDirection: "row", gap: 12 },
  genderBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  genderText:      { fontSize: 16, fontFamily: "Inter_600SemiBold" },

  // Interests
  interestsGrid:  { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  interestChip:   { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  interestText:   { fontSize: 14, fontFamily: "Inter_500Medium" },
  interestCount:  { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 4 },

  // Accent theme card
  accentCard:       { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, gap: 14 },
  accentCardTop:    { flexDirection: "row", alignItems: "center", gap: 12 },
  accentIconWrap:   { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  accentCardLabel:  { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  accentCardDesc:   { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  accentChipLabel:  { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  accentSwatches:   { flexDirection: "row", gap: 10 },
  accentSwatch:     { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  accentSwatchActive: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4, transform: [{ scale: 1.15 }] },

  // Avatar
  avatarSection:     { alignItems: "center", gap: 16, marginTop: 8 },
  avatarContainer:   { position: "relative" },
  avatarImage:       { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center" },
  avatarBadge:       { position: "absolute", bottom: 0, right: 0, backgroundColor: "#fff", borderRadius: 14 },
  photoActionText:   { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // Profile summary
  summaryCard:   { borderRadius: 14, padding: 16, gap: 12, marginTop: 16 },
  summaryTitle:  { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  summaryRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  summaryLabel:  { fontSize: 13, fontFamily: "Inter_400Regular", width: 80 },
  summaryValue:  { fontSize: 14, fontFamily: "Inter_500Medium",  flex: 1, textAlign: "right" },

  // Bottom action bar
  bottomBar: {
    position:         "absolute",
    bottom:  0,
    left:    0,
    right:   0,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  nextBtn:     { backgroundColor: Colors.brand, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  nextBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },

  // Modals
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle:  { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  searchBox:   { flexDirection: "row", alignItems: "center", margin: 16, borderRadius: 12, paddingHorizontal: 12, height: 44, gap: 8 },
  searchInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", height: 44 },
  countryItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  countryItemFlag: { fontSize: 24 },
  countryItemName: { fontSize: 16, fontFamily: "Inter_400Regular", flex: 1 },
  countryItemDial: { fontSize: 14, fontFamily: "Inter_400Regular" },
  pickerItem:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerItemText: { fontSize: 16, fontFamily: "Inter_400Regular" },
});
