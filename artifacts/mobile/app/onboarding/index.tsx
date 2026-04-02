import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
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
import { Avatar } from "@/components/ui/Avatar";

const TOTAL_STEPS = 5;

const INTERESTS = [
  { id: "technology", label: "Technology", icon: "laptop-outline" },
  { id: "music", label: "Music", icon: "musical-notes-outline" },
  { id: "sports", label: "Sports", icon: "football-outline" },
  { id: "fashion", label: "Fashion", icon: "shirt-outline" },
  { id: "food", label: "Food & Cooking", icon: "restaurant-outline" },
  { id: "travel", label: "Travel", icon: "airplane-outline" },
  { id: "art", label: "Art & Design", icon: "color-palette-outline" },
  { id: "gaming", label: "Gaming", icon: "game-controller-outline" },
  { id: "fitness", label: "Fitness", icon: "barbell-outline" },
  { id: "photography", label: "Photography", icon: "camera-outline" },
  { id: "business", label: "Business", icon: "briefcase-outline" },
  { id: "education", label: "Education", icon: "school-outline" },
  { id: "movies", label: "Movies & TV", icon: "film-outline" },
  { id: "reading", label: "Reading", icon: "book-outline" },
  { id: "nature", label: "Nature", icon: "leaf-outline" },
  { id: "politics", label: "Politics", icon: "megaphone-outline" },
  { id: "science", label: "Science", icon: "flask-outline" },
  { id: "crypto", label: "Crypto & Web3", icon: "logo-bitcoin" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(month: number, year: number) {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { user, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ userId?: string }>();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");

  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const [dobDay, setDobDay] = useState(0);
  const [dobMonth, setDobMonth] = useState(0);
  const [dobYear, setDobYear] = useState(0);
  const [showDobPicker, setShowDobPicker] = useState<"day" | "month" | "year" | null>(null);
  const [gender, setGender] = useState<"male" | "female" | "">("");

  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());

  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const progressAnim = useRef(new Animated.Value(1)).current;

  const userId = params.userId || user?.id;

  useEffect(() => {
    detectCountry();
  }, []);

  async function detectCountry() {
    if (selectedCountry) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      if (geo?.isoCountryCode) {
        const match = COUNTRIES.find(
          (c) => c.code.toUpperCase() === geo.isoCountryCode?.toUpperCase()
        );
        if (match) {
          setSelectedCountry(match);
        }
      }
    } catch (_) {}
  }

  function animateProgress(nextStep: number) {
    Animated.timing(progressAnim, {
      toValue: nextStep,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }

  function goNext() {
    if (step < TOTAL_STEPS) {
      const next = step + 1;
      setStep(next);
      animateProgress(next);
      Haptics.selectionAsync();
    }
  }

  function goBack() {
    if (step > 1) {
      const prev = step - 1;
      setStep(prev);
      animateProgress(prev);
    }
  }

  function validatePhone(): boolean {
    if (!selectedCountry) return false;
    const digits = phoneNumber.replace(/\D/g, "");
    return selectedCountry.phoneLength.includes(digits.length);
  }

  function canProceed(): boolean {
    switch (step) {
      case 1:
        return displayName.trim().length >= 2 && handle.trim().length >= 3;
      case 2:
        return selectedCountry !== null && validatePhone();
      case 3: {
        const currentYear = new Date().getFullYear();
        return dobDay > 0 && dobMonth > 0 && dobYear > 0 && dobYear <= currentYear - 13 && gender !== "";
      }
      case 4:
        return selectedInterests.size >= 3;
      case 5:
        return true;
      default:
        return false;
    }
  }

  function toggleInterest(id: string) {
    setSelectedInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    Haptics.selectionAsync();
  }

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Please allow access to your photo library to upload a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  }

  async function uploadAvatar(): Promise<string | null> {
    if (!avatarUri || !userId) return null;
    return uploadAvatarMedia(userId, avatarUri);
  }

  async function handleComplete() {
    if (!userId) {
      showAlert("Error", "User session not found. Please log in again.");
      return;
    }

    const cleanHandle = handle.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    if (cleanHandle.length < 3) {
      showAlert("Invalid handle", "Handle must be at least 3 characters (letters, numbers, underscores).");
      return;
    }

    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const { error: handleError } = await supabase
      .from("profiles")
      .select("id")
      .eq("handle", cleanHandle)
      .neq("id", userId)
      .limit(1)
      .single();

    if (!handleError) {
      setLoading(false);
      showAlert("Handle taken", "This handle is already in use. Please choose another one.");
      setStep(1);
      animateProgress(1);
      return;
    }

    let avatarUrl: string | null = null;
    if (avatarUri) {
      avatarUrl = await uploadAvatar();
    }

    const fullPhone = selectedCountry ? `${selectedCountry.dial}${phoneNumber.replace(/\D/g, "")}` : null;

    const profileData: any = {
      id: userId,
      handle: cleanHandle,
      display_name: displayName.trim(),
      gender: gender,
      date_of_birth: `${String(dobYear).padStart(4, "0")}-${String(dobMonth).padStart(2, "0")}-${String(dobDay).padStart(2, "0")}`,
      country: selectedCountry?.name || null,
      phone_number: fullPhone,
      interests: Array.from(selectedInterests),
      onboarding_completed: true,
    };

    if (avatarUrl) {
      profileData.avatar_url = avatarUrl;
    }

    const { error: profileError } = await supabase.from("profiles").upsert(profileData, { onConflict: "id" });

    if (profileError) {
      console.error("[Onboarding] Profile save error:", JSON.stringify(profileError));
      setLoading(false);
      if (profileError.code === "23505") {
        showAlert("Handle taken", "This handle is already in use. Please choose another.");
        setStep(1);
        animateProgress(1);
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
        if (refHandle !== cleanHandle) {
          const { data: referrer } = await supabase
            .from("profiles")
            .select("id, xp")
            .eq("handle", refHandle)
            .single();

          if (referrer && referrer.id !== userId) {
            const { data: existingRef } = await supabase
              .from("referrals")
              .select("id")
              .eq("referred_id", userId)
              .limit(1)
              .maybeSingle();

            if (!existingRef) {
              await supabase.from("referrals").insert({
                referrer_id: referrer.id,
                referred_id: userId,
                reward_given: true,
              });

              await supabase
                .from("profiles")
                .update({ xp: (referrer.xp || 0) + 2000 })
                .eq("id", referrer.id);

              const { data: platinumPlan } = await supabase
                .from("subscription_plans")
                .select("id")
                .ilike("name", "%platinum%")
                .eq("is_active", true)
                .limit(1)
                .single();

              if (platinumPlan) {
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7);
                await supabase.from("user_subscriptions").upsert({
                  user_id: userId,
                  plan_id: platinumPlan.id,
                  started_at: new Date().toISOString(),
                  expires_at: expiresAt.toISOString(),
                  is_active: true,
                  acoin_paid: 0,
                });
              }
            }
          }
        }
      }
    } catch (_) {}

    try {
      const { rewardXp } = await import("../../lib/rewardXp");
      await rewardXp("profile_completed");
    } catch (_) {}

    await refreshProfile();
    setLoading(false);
    router.replace("/(tabs)");
  }

  const progressWidth = progressAnim.interpolate({
    inputRange: [1, TOTAL_STEPS],
    outputRange: ["20%", "100%"],
  });

  const filteredCountries = countrySearch.trim()
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
          c.dial.includes(countrySearch) ||
          c.code.toLowerCase().includes(countrySearch.toLowerCase())
      )
    : COUNTRIES;

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1920 - 12 }, (_, i) => currentYear - 13 - i);
  const days = Array.from({ length: getDaysInMonth(dobMonth, dobYear) }, (_, i) => i + 1);

  function renderStep1() {
    return (
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Text style={[styles.stepEmoji]}>👋</Text>
          <Text style={[styles.stepTitle, { color: colors.text }]}>Set up your profile</Text>
          <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
            Choose a display name and a unique handle that others will use to find you.
          </Text>
        </View>

        <View style={styles.fieldsGroup}>
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Display Name</Text>
            <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="e.g. John Doe"
                placeholderTextColor={colors.textMuted}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                autoFocus
              />
            </View>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Username</Text>
            <View style={[styles.field, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="at-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="e.g. john_doe"
                placeholderTextColor={colors.textMuted}
                value={handle}
                onChangeText={setHandle}
                autoCapitalize="none"
              />
            </View>
            <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
              Letters, numbers, and underscores only. Min 3 characters.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  function renderStep2() {
    return (
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Text style={[styles.stepEmoji]}>🌍</Text>
          <Text style={[styles.stepTitle, { color: colors.text }]}>Where are you from?</Text>
          <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
            Provide your country and phone number for account security.
          </Text>
        </View>

        <View style={styles.fieldsGroup}>
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Country</Text>
            <TouchableOpacity
              style={[styles.field, { backgroundColor: colors.inputBg }]}
              onPress={() => setShowCountryPicker(true)}
              activeOpacity={0.7}
            >
              {selectedCountry ? (
                <>
                  <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                  <Text style={[styles.countryName, { color: colors.text }]}>{selectedCountry.name}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="globe-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
                  <Text style={[styles.placeholderText, { color: colors.textMuted }]}>Select your country</Text>
                </>
              )}
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} style={{ marginLeft: "auto" }} />
            </TouchableOpacity>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Phone Number</Text>
            <View style={[styles.phoneRow]}>
              <TouchableOpacity
                style={[styles.dialCodeBox, { backgroundColor: colors.inputBg }]}
                onPress={() => setShowCountryPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dialCodeText, { color: selectedCountry ? colors.text : colors.textMuted }]}>
                  {selectedCountry ? `${selectedCountry.flag} ${selectedCountry.dial}` : "+--"}
                </Text>
              </TouchableOpacity>
              <View style={[styles.phoneField, { backgroundColor: colors.inputBg }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder={selectedCountry ? `${"0".repeat(selectedCountry.phoneLength[0])}` : "Phone number"}
                  placeholderTextColor={colors.textMuted}
                  value={phoneNumber}
                  onChangeText={(v) => setPhoneNumber(v.replace(/[^0-9]/g, ""))}
                  keyboardType="phone-pad"
                  maxLength={selectedCountry ? Math.max(...selectedCountry.phoneLength) : 15}
                />
              </View>
            </View>
            {selectedCountry && phoneNumber.length > 0 && !validatePhone() && (
              <Text style={[styles.errorHint]}>
                {selectedCountry.name} numbers must be {selectedCountry.phoneLength.join(" or ")} digits
              </Text>
            )}
            {selectedCountry && validatePhone() && (
              <Text style={[styles.successHint]}>
                Valid {selectedCountry.name} phone number
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  }

  function renderStep3() {
    return (
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Text style={[styles.stepEmoji]}>📅</Text>
          <Text style={[styles.stepTitle, { color: colors.text }]}>Personal details</Text>
          <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
            Your date of birth and gender help personalize your experience.
          </Text>
        </View>

        <View style={styles.fieldsGroup}>
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Date of Birth</Text>
            <View style={styles.dobRow}>
              <TouchableOpacity
                style={[styles.dobSelector, { backgroundColor: colors.inputBg }]}
                onPress={() => setShowDobPicker("day")}
              >
                <Text style={[styles.dobSelectorText, { color: dobDay ? colors.text : colors.textMuted }]}>
                  {dobDay || "Day"}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dobSelector, { backgroundColor: colors.inputBg, flex: 1.5 }]}
                onPress={() => setShowDobPicker("month")}
              >
                <Text style={[styles.dobSelectorText, { color: dobMonth ? colors.text : colors.textMuted }]}>
                  {dobMonth ? MONTHS[dobMonth - 1] : "Month"}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dobSelector, { backgroundColor: colors.inputBg }]}
                onPress={() => setShowDobPicker("year")}
              >
                <Text style={[styles.dobSelectorText, { color: dobYear ? colors.text : colors.textMuted }]}>
                  {dobYear || "Year"}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
              You must be at least 13 years old to use AfuChat.
            </Text>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Gender</Text>
            <View style={styles.genderRow}>
              <TouchableOpacity
                style={[
                  styles.genderBtn,
                  { backgroundColor: gender === "male" ? Colors.brand : colors.inputBg },
                ]}
                onPress={() => { setGender("male"); Haptics.selectionAsync(); }}
              >
                <Ionicons name="male" size={20} color={gender === "male" ? "#fff" : colors.text} />
                <Text style={[styles.genderText, { color: gender === "male" ? "#fff" : colors.text }]}>Male</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.genderBtn,
                  { backgroundColor: gender === "female" ? Colors.brand : colors.inputBg },
                ]}
                onPress={() => { setGender("female"); Haptics.selectionAsync(); }}
              >
                <Ionicons name="female" size={20} color={gender === "female" ? "#fff" : colors.text} />
                <Text style={[styles.genderText, { color: gender === "female" ? "#fff" : colors.text }]}>Female</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  function renderStep4() {
    return (
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Text style={[styles.stepEmoji]}>✨</Text>
          <Text style={[styles.stepTitle, { color: colors.text }]}>What are you into?</Text>
          <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
            Pick at least 3 interests so we can show you content you'll love.
          </Text>
        </View>

        <View style={styles.interestsGrid}>
          {INTERESTS.map((item) => {
            const isSelected = selectedInterests.has(item.id);
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.interestChip,
                  {
                    backgroundColor: isSelected ? Colors.brand : colors.inputBg,
                    borderColor: isSelected ? Colors.brand : colors.border,
                  },
                ]}
                onPress={() => toggleInterest(item.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.icon as any}
                  size={16}
                  color={isSelected ? "#fff" : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.interestText,
                    { color: isSelected ? "#fff" : colors.text },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.interestCount, { color: selectedInterests.size >= 3 ? Colors.brand : colors.textMuted }]}>
          {selectedInterests.size} of 3 minimum selected
        </Text>
      </View>
    );
  }

  function renderStep5() {
    return (
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Text style={[styles.stepEmoji]}>📸</Text>
          <Text style={[styles.stepTitle, { color: colors.text }]}>Add a profile photo</Text>
          <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
            Let people recognize you! Add a photo to complete your profile.
          </Text>
        </View>

        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
            <View style={[styles.avatarContainer]}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
                  <Ionicons name="camera" size={40} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.avatarBadge}>
                <Ionicons name="add-circle" size={28} color={Colors.brand} />
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickAvatar}>
            <Text style={[styles.photoActionText, { color: Colors.brand }]}>
              {avatarUri ? "Change Photo" : "Choose from Gallery"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: colors.inputBg }]}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>Your Profile Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Name</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{displayName}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Username</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>@{handle.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Country</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{selectedCountry?.flag} {selectedCountry?.name}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Phone</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{selectedCountry?.dial} {phoneNumber}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Born</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{dobDay} {MONTHS[dobMonth - 1]} {dobYear}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Gender</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{gender === "male" ? "Male" : "Female"}</Text>
          </View>
        </View>
      </View>
    );
  }

  function renderCountryPicker() {
    return (
      <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Country</Text>
            <TouchableOpacity onPress={() => { setShowCountryPicker(false); setCountrySearch(""); }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={[styles.searchBox, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
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
                style={[
                  styles.countryItem,
                  { borderBottomColor: colors.border },
                  selectedCountry?.code === item.code && { backgroundColor: colors.inputBg },
                ]}
                onPress={() => {
                  setSelectedCountry(item);
                  setShowCountryPicker(false);
                  setCountrySearch("");
                  setPhoneNumber("");
                  Haptics.selectionAsync();
                }}
              >
                <Text style={styles.countryItemFlag}>{item.flag}</Text>
                <Text style={[styles.countryItemName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.countryItemDial, { color: colors.textMuted }]}>{item.dial}</Text>
                {selectedCountry?.code === item.code && (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.brand} style={{ marginLeft: 8 }} />
                )}
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

    if (showDobPicker === "day") {
      data = days.map((d) => ({ label: String(d), value: d }));
      title = "Select Day";
    } else if (showDobPicker === "month") {
      data = MONTHS.map((m, i) => ({ label: m, value: i + 1 }));
      title = "Select Month";
    } else {
      data = years.map((y) => ({ label: String(y), value: y }));
      title = "Select Year";
    }

    return (
      <Modal visible={!!showDobPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={() => setShowDobPicker(null)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={data}
            keyExtractor={(item) => String(item.value)}
            renderItem={({ item }) => {
              const selected =
                (showDobPicker === "day" && dobDay === item.value) ||
                (showDobPicker === "month" && dobMonth === item.value) ||
                (showDobPicker === "year" && dobYear === item.value);
              return (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    { borderBottomColor: colors.border },
                    selected && { backgroundColor: colors.inputBg },
                  ]}
                  onPress={() => {
                    if (showDobPicker === "day") setDobDay(item.value);
                    else if (showDobPicker === "month") setDobMonth(item.value);
                    else setDobYear(item.value);
                    setShowDobPicker(null);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.pickerItemText, { color: colors.text }]}>{item.label}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={20} color={Colors.brand} />}
                </TouchableOpacity>
              );
            }}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </Modal>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        {step > 1 ? (
          <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <Text style={[styles.stepIndicator, { color: colors.textMuted }]}>Step {step} of {TOTAL_STEPS}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.progressBarBg, { backgroundColor: colors.inputBg }]}>
        <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16, backgroundColor: colors.background }]}>
        <Pressable
          style={[
            styles.nextBtn,
            { opacity: canProceed() ? 1 : 0.4 },
          ]}
          onPress={step === TOTAL_STEPS ? handleComplete : goNext}
          disabled={!canProceed() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.nextBtnText}>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  stepIndicator: { fontSize: 14, fontFamily: "Inter_500Medium" },
  progressBarBg: {
    height: 4,
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 4,
    backgroundColor: Colors.brand,
    borderRadius: 2,
  },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24 },
  stepContent: { gap: 28 },
  stepHeader: { alignItems: "center", gap: 8 },
  stepEmoji: { fontSize: 48, marginBottom: 4 },
  stepTitle: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center" },
  stepDesc: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, paddingHorizontal: 8 },
  fieldsGroup: { gap: 20 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingLeft: 2 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  fieldIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", height: 52 },
  fieldHint: { fontSize: 12, fontFamily: "Inter_400Regular", paddingLeft: 2 },
  errorHint: { fontSize: 12, fontFamily: "Inter_500Medium", paddingLeft: 2, color: "#FF3B30" },
  successHint: { fontSize: 12, fontFamily: "Inter_500Medium", paddingLeft: 2, color: "#34C759" },
  countryFlag: { fontSize: 22, marginRight: 10 },
  countryName: { fontSize: 16, fontFamily: "Inter_400Regular", flex: 1 },
  placeholderText: { fontSize: 16, fontFamily: "Inter_400Regular", flex: 1 },
  phoneRow: { flexDirection: "row", gap: 8 },
  dialCodeBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 52,
    minWidth: 90,
  },
  dialCodeText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  phoneField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  dobRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dobSelector: {
    flex: 1,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  dobSelectorText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  genderRow: { flexDirection: "row", gap: 12 },
  genderBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  genderText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  interestsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  interestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  interestText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  interestCount: { textAlign: "center", fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 4 },
  avatarSection: { alignItems: "center", gap: 16, marginTop: 8 },
  avatarContainer: { position: "relative" },
  avatarImage: { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 14,
  },
  photoActionText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  summaryCard: {
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginTop: 16,
  },
  summaryTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular", width: 80 },
  summaryValue: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1, textAlign: "right" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  nextBtn: {
    backgroundColor: Colors.brand,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  nextBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", height: 44 },
  countryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  countryItemFlag: { fontSize: 24 },
  countryItemName: { fontSize: 16, fontFamily: "Inter_400Regular", flex: 1 },
  countryItemDial: { fontSize: 14, fontFamily: "Inter_400Regular" },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerItemText: { fontSize: 16, fontFamily: "Inter_400Regular" },
});
