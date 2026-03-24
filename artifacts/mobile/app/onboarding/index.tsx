import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
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
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { showAlert } from "@/lib/alert";

const TOTAL_STEPS = 4;

const REGIONS = [
  "East Africa",
  "West Africa",
  "Southern Africa",
  "North Africa",
  "Central Africa",
  "Europe",
  "North America",
  "South America",
  "Asia",
  "Middle East",
  "Oceania",
  "Caribbean",
];

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

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { user, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ userId?: string }>();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");

  const [region, setRegion] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");

  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());

  const progressAnim = useRef(new Animated.Value(1)).current;

  const userId = params.userId || user?.id;

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

  function canProceed(): boolean {
    switch (step) {
      case 1:
        return displayName.trim().length >= 2 && handle.trim().length >= 3;
      case 2: {
        const d = parseInt(dobDay, 10);
        const m = parseInt(dobMonth, 10);
        const y = parseInt(dobYear, 10);
        const validDob = d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1920 && y <= new Date().getFullYear() - 13;
        return region !== "" && gender !== "" && validDob;
      }
      case 3:
        return selectedInterests.size >= 3;
      case 4:
        return true;
      default:
        return false;
    }
  }

  function toggleInterest(id: string) {
    setSelectedInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    Haptics.selectionAsync();
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

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      handle: cleanHandle,
      display_name: displayName.trim(),
      gender: gender,
      date_of_birth: `${dobYear.padStart(4, "0")}-${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}`,
      region: region,
      interests: Array.from(selectedInterests),
      onboarding_completed: true,
    });

    if (profileError) {
      setLoading(false);
      showAlert("Error", "Could not save your profile. Please try again.");
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
                .update({ xp: (referrer.xp || 0) + 500 })
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

    await refreshProfile();
    setLoading(false);
    router.replace("/(tabs)");
  }

  const progressWidth = progressAnim.interpolate({
    inputRange: [1, TOTAL_STEPS],
    outputRange: ["25%", "100%"],
  });

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
          <Text style={[styles.stepTitle, { color: colors.text }]}>Tell us about yourself</Text>
          <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
            This helps us personalize your experience. All fields are required.
          </Text>
        </View>

        <View style={styles.fieldsGroup}>
          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Region</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              <View style={styles.chipsRow}>
                {REGIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.chip,
                      { backgroundColor: region === r ? Colors.brand : colors.inputBg },
                    ]}
                    onPress={() => { setRegion(r); Haptics.selectionAsync(); }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: region === r ? "#fff" : colors.text },
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Date of Birth</Text>
            <View style={styles.dobRow}>
              <View style={[styles.dobField, { backgroundColor: colors.inputBg }]}>
                <TextInput
                  style={[styles.dobInput, { color: colors.text }]}
                  placeholder="DD"
                  placeholderTextColor={colors.textMuted}
                  value={dobDay}
                  onChangeText={(v) => setDobDay(v.replace(/[^0-9]/g, "").slice(0, 2))}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <Text style={[styles.dobSeparator, { color: colors.textMuted }]}>/</Text>
              <View style={[styles.dobField, { backgroundColor: colors.inputBg }]}>
                <TextInput
                  style={[styles.dobInput, { color: colors.text }]}
                  placeholder="MM"
                  placeholderTextColor={colors.textMuted}
                  value={dobMonth}
                  onChangeText={(v) => setDobMonth(v.replace(/[^0-9]/g, "").slice(0, 2))}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <Text style={[styles.dobSeparator, { color: colors.textMuted }]}>/</Text>
              <View style={[styles.dobFieldWide, { backgroundColor: colors.inputBg }]}>
                <TextInput
                  style={[styles.dobInput, { color: colors.text }]}
                  placeholder="YYYY"
                  placeholderTextColor={colors.textMuted}
                  value={dobYear}
                  onChangeText={(v) => setDobYear(v.replace(/[^0-9]/g, "").slice(0, 4))}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
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

  function renderStep3() {
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

  function renderStep4() {
    return (
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Text style={[styles.stepEmoji]}>🎉</Text>
          <Text style={[styles.stepTitle, { color: colors.text }]}>You're all set!</Text>
          <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
            Review your profile below and tap "Get Started" to join AfuChat.
          </Text>
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
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Born</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{dobDay}/{dobMonth}/{dobYear}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Region</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{region}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Gender</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{gender === "male" ? "Male" : "Female"}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Interests</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]} numberOfLines={2}>
              {Array.from(selectedInterests).join(", ")}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
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
    borderRadius: 0,
    paddingHorizontal: 14,
    height: 52,
  },
  fieldIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", height: 52 },
  fieldHint: { fontSize: 12, fontFamily: "Inter_400Regular", paddingLeft: 2 },
  chipsScroll: { marginTop: 4 },
  chipsRow: { flexDirection: "row", gap: 8, paddingRight: 24 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  chipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  dobRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dobField: {
    flex: 1,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 0,
  },
  dobFieldWide: {
    flex: 1.5,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 0,
  },
  dobInput: {
    fontSize: 18,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    width: "100%",
    height: 52,
  },
  dobSeparator: { fontSize: 20, fontFamily: "Inter_400Regular" },
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
  summaryCard: {
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginTop: 4,
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
});
