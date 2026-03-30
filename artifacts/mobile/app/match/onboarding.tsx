import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
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
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import SchoolPickerInput from "@/components/SchoolPickerInput";
import RegionPickerInput from "@/components/RegionPickerInput";
import { detectGeo } from "@/lib/geoDetect";

const { width: SW } = Dimensions.get("window");
const CONTENT_W = SW - 48; // scrollContent has paddingHorizontal: 24 each side
const DOB_GAP = 10;
const DOB_UNIT = (CONTENT_W - DOB_GAP * 2) / 4; // day=1u, month=1u, year=2u
const BRAND = "#FF2D55";
const TOTAL_STEPS = 6;

const INTERESTS_LIST = [
  "Travel", "Music", "Fitness", "Cooking", "Art", "Photography",
  "Reading", "Gaming", "Hiking", "Movies", "Dancing", "Fashion",
  "Technology", "Coffee", "Yoga", "Pets", "Sports", "Wine",
  "Surfing", "Climbing", "Writing", "Coding", "Meditation", "Foodie",
];

const GENDER_OPTIONS = [
  { v: "man", l: "Man", icon: "male" },
  { v: "woman", l: "Woman", icon: "female" },
  { v: "non_binary", l: "Non-binary", icon: "transgender" },
  { v: "other", l: "Other", icon: "person" },
] as const;

const LOOKING_FOR = [
  { v: "women", l: "Women", emoji: "👩" },
  { v: "men", l: "Men", emoji: "👨" },
  { v: "everyone", l: "Everyone", emoji: "💫" },
] as const;

const GOAL_OPTIONS = [
  { v: "serious", l: "Serious Relationship", emoji: "💍" },
  { v: "casual", l: "Something Casual", emoji: "🌊" },
  { v: "friendship", l: "New Friends", emoji: "👋" },
  { v: "open", l: "Open to Anything", emoji: "✨" },
] as const;

const EDU_OPTIONS = [
  { v: "high_school", l: "High School" },
  { v: "associate", l: "Associate" },
  { v: "bachelor", l: "Bachelor's" },
  { v: "master", l: "Master's" },
  { v: "doctorate", l: "Doctorate" },
  { v: "other", l: "Other" },
] as const;

type PhotoItem = { uri: string; uploaded: boolean; url?: string };

export default function MatchOnboarding() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — Identity
  const [name, setName] = useState("");
  const [dob, setDob] = useState({ day: "", month: "", year: "" });
  const [gender, setGender] = useState<string>("");

  // Step 2 — Photos
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  // Step 3 — About
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);

  // Step 4 — Career
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [school, setSchool] = useState("");
  const [educationLevel, setEducationLevel] = useState<string>("");

  // Step 5 — Preferences
  const [lookingFor, setLookingFor] = useState<string>("everyone");
  const [goal, setGoal] = useState<string>("open");

  // Step 6 — Location
  const [locationName, setLocationName] = useState("");
  const [country, setCountry] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const geoDetected = useRef(false);

  useEffect(() => {
    if (step === 6 && !geoDetected.current && !country) {
      geoDetected.current = true;
      setGeoLoading(true);
      detectGeo().then((geo) => {
        if (geo) {
          setCountry(geo.countryName);
          if (!locationName) setLocationName(geo.city);
        }
        setGeoLoading(false);
      });
    }
  }, [step]);

  function advanceProgress(toStep: number) {
    Animated.spring(progress, {
      toValue: (toStep - 1) / TOTAL_STEPS,
      useNativeDriver: false,
      tension: 60,
      friction: 8,
    }).start();
  }

  function nextStep() {
    if (!validateStep()) return;
    const next = step + 1;
    setStep(next);
    advanceProgress(next);
  }

  function prevStep() {
    if (step === 1) { router.back(); return; }
    const prev = step - 1;
    setStep(prev);
    advanceProgress(prev);
  }

  function validateStep(): boolean {
    switch (step) {
      case 1:
        if (!name.trim()) { showAlert("Name required", "Please enter your first name."); return false; }
        if (!dob.day || !dob.month || !dob.year) { showAlert("Birthday required", "Please enter your date of birth."); return false; }
        const age = new Date().getFullYear() - parseInt(dob.year);
        if (age < 18) { showAlert("Age Restriction", "You must be 18 or older to use AfuMatch."); return false; }
        if (age > 100) { showAlert("Invalid Date", "Please enter a valid year of birth."); return false; }
        if (!gender) { showAlert("Gender required", "Please select your gender."); return false; }
        return true;
      case 2:
        if (photos.length === 0) { showAlert("Photos required", "Please add at least one photo to continue."); return false; }
        return true;
      default: return true;
    }
  }

  async function pickPhoto() {
    if (photos.length >= 6) { showAlert("Photo Limit", "You can add up to 6 photos."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const newPhoto: PhotoItem = { uri: asset.uri, uploaded: false };
    setPhotos((prev) => [...prev, newPhoto]);

    // Upload immediately
    const idx = photos.length;
    try {
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const path = `${user?.id}/${Date.now()}.${ext}`;
      const res = await fetch(asset.uri);
      const blob = await res.blob();
      const { data, error } = await supabase.storage.from("match-photos").upload(path, blob, { contentType: `image/${ext}` });
      if (!error && data) {
        const { data: urlData } = supabase.storage.from("match-photos").getPublicUrl(data.path);
        setPhotos((prev) => {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], uploaded: true, url: urlData.publicUrl };
          return updated;
        });
      }
    } catch {}
  }

  function removePhoto(i: number) {
    setPhotos((prev) => prev.filter((_, j) => j !== i));
  }

  async function submit() {
    if (!user) return;
    setSaving(true);

    const dobStr = `${dob.year}-${dob.month.padStart(2, "0")}-${dob.day.padStart(2, "0")}`;

    // Insert match_profile
    const { error: profileErr } = await supabase.from("match_profiles").upsert({
      user_id: user.id,
      name: name.trim(),
      date_of_birth: dobStr,
      gender,
      bio: bio.trim() || null,
      job_title: jobTitle.trim() || null,
      company: company.trim() || null,
      school: school.trim() || null,
      education_level: educationLevel || null,
      interests,
      looking_for: lookingFor,
      relationship_goal: goal,
      location_name: locationName.trim() || null,
      country: country.trim() || null,
      profile_complete: photos.some((p) => p.uploaded),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (profileErr) {
      showAlert("Error", "Failed to save profile. Please try again.");
      setSaving(false);
      return;
    }

    // Insert photos
    const uploaded = photos.filter((p) => p.uploaded && p.url);
    if (uploaded.length > 0) {
      await supabase.from("match_photos").delete().eq("user_id", user.id);
      await supabase.from("match_photos").insert(
        uploaded.map((p, i) => ({
          user_id: user.id,
          url: p.url,
          display_order: i,
          is_primary: i === 0,
        }))
      );
    }

    setSaving(false);
    router.replace("/match" as any);
  }

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={[styles.root, { backgroundColor: isDark ? "#0D0D0D" : "#FFF" }]}>
      {/* Progress bar */}
      <View style={[styles.progressTrack, { marginTop: insets.top + 8 }]}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      {/* Back button */}
      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 16 }]} onPress={prevStep}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </TouchableOpacity>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 52 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step 1: Identity ── */}
          {step === 1 && (
            <View style={styles.stepWrap}>
              <Text style={[styles.stepLabel, { color: BRAND }]}>Step 1 of {TOTAL_STEPS}</Text>
              <Text style={[styles.stepTitle, { color: colors.text }]}>Let's start with the basics</Text>
              <Text style={[styles.stepSub, { color: colors.textMuted }]}>This is your AfuMatch identity — separate from your main profile.</Text>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>YOUR FIRST NAME</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: name ? BRAND : colors.border }]}
                  placeholder="First name"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  maxLength={30}
                />
                <Text style={[styles.fieldHint, { color: colors.textMuted }]}>This is how you'll appear to matches.</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>DATE OF BIRTH</Text>
                <View style={styles.dobRow}>
                  {([
                    { field: "day" as const, ph: "DD", ml: 2, w: DOB_UNIT, label: "Day" },
                    { field: "month" as const, ph: "MM", ml: 2, w: DOB_UNIT, label: "Month" },
                    { field: "year" as const, ph: "YYYY", ml: 4, w: DOB_UNIT * 2, label: "Year" },
                  ]).map(({ field, ph, ml, w, label }) => (
                    <View key={field} style={{ width: w }}>
                      <Text style={[styles.dobLabel, { color: colors.textMuted }]}>{label}</Text>
                      <TextInput
                        style={[styles.dobInput, { width: w, backgroundColor: colors.surface, color: colors.text, borderColor: dob[field] ? BRAND : colors.border }]}
                        placeholder={ph}
                        placeholderTextColor={colors.textMuted}
                        value={dob[field]}
                        onChangeText={(v) => setDob((d) => ({ ...d, [field]: v.replace(/\D/g, "").slice(0, ml) }))}
                        keyboardType="number-pad"
                        maxLength={ml}
                      />
                    </View>
                  ))}
                </View>
                <Text style={[styles.fieldHint, { color: colors.textMuted }]}>You must be 18 or older. Your age may be shown to matches.</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>I AM A...</Text>
                <View style={styles.genderGrid}>
                  {GENDER_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.v}
                      style={[styles.genderTile, { backgroundColor: gender === opt.v ? BRAND : colors.surface, borderColor: gender === opt.v ? BRAND : colors.border }]}
                      onPress={() => setGender(opt.v)}
                    >
                      <Ionicons name={opt.icon as any} size={22} color={gender === opt.v ? "#fff" : colors.textMuted} />
                      <Text style={[styles.genderLabel, { color: gender === opt.v ? "#fff" : colors.text }]}>{opt.l}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* ── Step 2: Photos ── */}
          {step === 2 && (
            <View style={styles.stepWrap}>
              <Text style={[styles.stepLabel, { color: BRAND }]}>Step 2 of {TOTAL_STEPS}</Text>
              <Text style={[styles.stepTitle, { color: colors.text }]}>Add your best photos</Text>
              <Text style={[styles.stepSub, { color: colors.textMuted }]}>Profiles with photos get 10× more matches. Add up to 6 photos. Your first photo is your main photo.</Text>

              <View style={styles.photoGrid}>
                {Array.from({ length: 6 }).map((_, i) => {
                  const photo = photos[i];
                  if (photo) {
                    return (
                      <View key={i} style={styles.photoCell}>
                        <Image source={{ uri: photo.uri }} style={styles.photoThumb} resizeMode="cover" />
                        {!photo.uploaded && (
                          <View style={styles.photoUploading}>
                            <ActivityIndicator color="#fff" size="small" />
                          </View>
                        )}
                        {i === 0 && (
                          <View style={styles.primaryBadge}>
                            <Text style={styles.primaryBadgeText}>Main</Text>
                          </View>
                        )}
                        <Pressable style={styles.photoRemove} onPress={() => removePhoto(i)}>
                          <Ionicons name="close-circle" size={22} color="#FF3B30" />
                        </Pressable>
                      </View>
                    );
                  }
                  return (
                    <Pressable key={i} style={[styles.photoAdd, { backgroundColor: colors.surface, borderColor: i === 0 ? BRAND : colors.border }]} onPress={pickPhoto}>
                      <Ionicons name="add" size={28} color={i === 0 ? BRAND : colors.textMuted} />
                      {i === 0 && <Text style={[styles.photoAddLabel, { color: BRAND }]}>Required</Text>}
                    </Pressable>
                  );
                })}
              </View>

              <View style={[styles.photoTip, { backgroundColor: colors.surface }]}>
                <Ionicons name="information-circle" size={18} color={BRAND} />
                <Text style={[styles.photoTipText, { color: colors.textMuted }]}>
                  Choose clear, well-lit face photos. Avoid group photos as your main photo. Photos are only visible within AfuMatch.
                </Text>
              </View>
            </View>
          )}

          {/* ── Step 3: About ── */}
          {step === 3 && (
            <View style={styles.stepWrap}>
              <Text style={[styles.stepLabel, { color: BRAND }]}>Step 3 of {TOTAL_STEPS}</Text>
              <Text style={[styles.stepTitle, { color: colors.text }]}>Tell them about you</Text>
              <Text style={[styles.stepSub, { color: colors.textMuted }]}>A good bio doubles your matches. Be genuine.</Text>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>BIO (optional)</Text>
                <TextInput
                  style={[styles.textarea, { backgroundColor: colors.surface, color: colors.text, borderColor: bio ? BRAND : colors.border }]}
                  placeholder="Write something interesting about yourself…"
                  placeholderTextColor={colors.textMuted}
                  value={bio}
                  onChangeText={(v) => setBio(v.slice(0, 300))}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <Text style={[styles.charCount, { color: colors.textMuted }]}>{bio.length}/300</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>INTERESTS ({interests.length}/8)</Text>
                <View style={styles.interestGrid}>
                  {INTERESTS_LIST.map((tag) => {
                    const on = interests.includes(tag);
                    return (
                      <Pressable
                        key={tag}
                        style={[styles.interestChip, { backgroundColor: on ? BRAND : colors.surface, borderColor: on ? BRAND : colors.border }]}
                        onPress={() => {
                          if (on) setInterests((p) => p.filter((t) => t !== tag));
                          else if (interests.length < 8) setInterests((p) => [...p, tag]);
                          else showAlert("Limit Reached", "You can select up to 8 interests.");
                        }}
                      >
                        <Text style={[styles.interestText, { color: on ? "#fff" : colors.text }]}>{tag}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {/* ── Step 4: Career/Education ── */}
          {step === 4 && (
            <View style={styles.stepWrap}>
              <Text style={[styles.stepLabel, { color: BRAND }]}>Step 4 of {TOTAL_STEPS}</Text>
              <Text style={[styles.stepTitle, { color: colors.text }]}>Career & Education</Text>
              <Text style={[styles.stepSub, { color: colors.textMuted }]}>Optional — but people love knowing what you do.</Text>

              {[
                { label: "JOB TITLE", value: jobTitle, set: setJobTitle, ph: "e.g. Software Engineer", cap: 60 },
                { label: "COMPANY", value: company, set: setCompany, ph: "e.g. Google", cap: 60 },
              ].map((f) => (
                <View key={f.label} style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: f.value ? BRAND : colors.border }]}
                    placeholder={f.ph}
                    placeholderTextColor={colors.textMuted}
                    value={f.value}
                    onChangeText={(v) => f.set(v.slice(0, f.cap))}
                  />
                </View>
              ))}

              <View style={[styles.fieldGroup, { zIndex: 200 }]}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>SCHOOL</Text>
                <SchoolPickerInput
                  value={school}
                  onChange={(v) => setSchool(v.slice(0, 120))}
                  country={country || undefined}
                  placeholder="Search your school or university"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>EDUCATION LEVEL</Text>
                <View style={styles.eduGrid}>
                  {EDU_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.v}
                      style={[styles.eduChip, { backgroundColor: educationLevel === opt.v ? BRAND : colors.surface, borderColor: educationLevel === opt.v ? BRAND : colors.border }]}
                      onPress={() => setEducationLevel(educationLevel === opt.v ? "" : opt.v)}
                    >
                      <Text style={[styles.eduText, { color: educationLevel === opt.v ? "#fff" : colors.text }]}>{opt.l}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* ── Step 5: Preferences ── */}
          {step === 5 && (
            <View style={styles.stepWrap}>
              <Text style={[styles.stepLabel, { color: BRAND }]}>Step 5 of {TOTAL_STEPS}</Text>
              <Text style={[styles.stepTitle, { color: colors.text }]}>What are you looking for?</Text>
              <Text style={[styles.stepSub, { color: colors.textMuted }]}>This helps us show you the most compatible people.</Text>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>SHOW ME</Text>
                <View style={styles.lookingRow}>
                  {LOOKING_FOR.map((opt) => (
                    <Pressable
                      key={opt.v}
                      style={[styles.lookingTile, { backgroundColor: lookingFor === opt.v ? BRAND : colors.surface, borderColor: lookingFor === opt.v ? BRAND : colors.border }]}
                      onPress={() => setLookingFor(opt.v)}
                    >
                      <Text style={{ fontSize: 28 }}>{opt.emoji}</Text>
                      <Text style={[styles.lookingLabel, { color: lookingFor === opt.v ? "#fff" : colors.text }]}>{opt.l}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>RELATIONSHIP GOAL</Text>
                <View style={styles.goalGrid}>
                  {GOAL_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.v}
                      style={[styles.goalTile, { backgroundColor: goal === opt.v ? BRAND + "22" : colors.surface, borderColor: goal === opt.v ? BRAND : colors.border }]}
                      onPress={() => setGoal(opt.v)}
                    >
                      <Text style={{ fontSize: 24 }}>{opt.emoji}</Text>
                      <Text style={[styles.goalLabel, { color: goal === opt.v ? BRAND : colors.text }]}>{opt.l}</Text>
                      {goal === opt.v && <Ionicons name="checkmark-circle" size={18} color={BRAND} />}
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* ── Step 6: Location ── */}
          {step === 6 && (
            <View style={styles.stepWrap}>
              <Text style={[styles.stepLabel, { color: BRAND }]}>Step 6 of {TOTAL_STEPS}</Text>
              <Text style={[styles.stepTitle, { color: colors.text }]}>Where are you?</Text>
              <Text style={[styles.stepSub, { color: colors.textMuted }]}>Your location helps find people near you. Only your city or country is ever shown — never your exact location.</Text>

              <View style={[styles.locationCard, { backgroundColor: colors.surface }]}>
                <Ionicons name="shield-checkmark" size={20} color="#34C759" />
                <Text style={[styles.locationPrivacy, { color: colors.textSecondary }]}>
                  AfuMatch never shares your precise location. Only your city name is shown to potential matches.
                </Text>
              </View>

              {/* Country — auto-detected, locked */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>COUNTRY</Text>
                <View style={[styles.lockedRow, { backgroundColor: colors.surface, borderColor: country ? BRAND : colors.border }]}>
                  <Ionicons name="earth" size={18} color={country ? BRAND : colors.textMuted} style={{ marginRight: 8 }} />
                  {geoLoading ? (
                    <>
                      <ActivityIndicator size="small" color={BRAND} style={{ marginRight: 8 }} />
                      <Text style={[styles.lockedText, { color: colors.textMuted }]}>Detecting your country…</Text>
                    </>
                  ) : (
                    <Text style={[styles.lockedText, { color: country ? colors.text : colors.textMuted }]}>
                      {country || "Could not detect — please check network"}
                    </Text>
                  )}
                  <View style={[styles.lockedBadge, { backgroundColor: "#34C75922" }]}>
                    <Ionicons name="lock-closed" size={11} color="#34C759" />
                    <Text style={styles.lockedBadgeText}>Auto</Text>
                  </View>
                </View>
              </View>

              {/* City / Region — searchable dropdown */}
              <View style={[styles.fieldGroup, { zIndex: 200 }]}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CITY / TOWN</Text>
                <RegionPickerInput
                  value={locationName}
                  onChange={setLocationName}
                  country={country}
                  placeholder="Search your city or town"
                />
              </View>

              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: BRAND }]}>
                <Text style={[styles.summaryTitle, { color: colors.text }]}>Your AfuMatch Profile</Text>
                <View style={styles.summaryRows}>
                  <SummaryRow icon="person" label={name || "—"} />
                  <SummaryRow icon="calendar" label={dob.day && dob.month && dob.year ? `${dob.day}/${dob.month}/${dob.year}` : "—"} />
                  <SummaryRow icon="body" label={GENDER_OPTIONS.find(g => g.v === gender)?.l ?? "—"} />
                  <SummaryRow icon="images" label={`${photos.length} photo${photos.length !== 1 ? "s" : ""}`} />
                  <SummaryRow icon="heart" label={GOAL_OPTIONS.find(g => g.v === goal)?.l ?? "—"} />
                </View>
              </View>
            </View>
          )}

          {/* CTA */}
          <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 24 }]}>
            {step < TOTAL_STEPS ? (
              <Pressable style={styles.nextBtn} onPress={nextStep}>
                <Text style={styles.nextBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </Pressable>
            ) : (
              <Pressable style={[styles.nextBtn, saving && { opacity: 0.7 }]} onPress={submit} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="heart" size={18} color="#fff" />
                    <Text style={styles.nextBtnText}>Start Matching!</Text>
                  </>
                )}
              </Pressable>
            )}
            {step > 3 && step < TOTAL_STEPS && (
              <Pressable onPress={nextStep} style={{ marginTop: 12, alignItems: "center" }}>
                <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip this step</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SummaryRow({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
      <Ionicons name={icon} size={16} color={BRAND} />
      <Text style={{ color: colors.textSecondary, fontSize: 14, fontFamily: "Inter_400Regular" }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progressTrack: { height: 3, backgroundColor: "#E5E5EA", marginHorizontal: 0 },
  progressFill: { height: 3, backgroundColor: BRAND, borderRadius: 2 },
  backBtn: { position: "absolute", left: 16, zIndex: 10, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
  stepWrap: { paddingTop: 8 },
  stepLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 8 },
  stepTitle: { fontSize: 28, fontFamily: "Inter_700Bold", lineHeight: 34, marginBottom: 8 },
  stepSub: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 28 },
  fieldGroup: { marginBottom: 24 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 8 },
  fieldHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 16 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  textarea: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontFamily: "Inter_400Regular", minHeight: 110 },
  charCount: { textAlign: "right", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  dobRow: { flexDirection: "row", gap: DOB_GAP, alignItems: "flex-end" },
  dobLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 6, textAlign: "center" },
  dobInput: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 14, fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center" },
  genderGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  genderTile: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, minWidth: (SW - 68) / 2 },
  genderLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  photoCell: { width: (SW - 68) / 3, aspectRatio: 3 / 4, borderRadius: 16, overflow: "hidden", position: "relative" },
  photoThumb: { width: "100%", height: "100%" },
  photoUploading: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  primaryBadge: { position: "absolute", bottom: 6, left: 6, backgroundColor: BRAND, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  primaryBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  photoRemove: { position: "absolute", top: 4, right: 4 },
  photoAdd: { width: (SW - 68) / 3, aspectRatio: 3 / 4, borderRadius: 16, borderWidth: 2, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4 },
  photoAddLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  photoTip: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14 },
  photoTipText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  interestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  interestChip: { borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8 },
  interestText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  eduGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  eduChip: { borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8 },
  eduText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  lookingRow: { flexDirection: "row", gap: 10 },
  lookingTile: { flex: 1, borderWidth: 1.5, borderRadius: 16, alignItems: "center", paddingVertical: 16, gap: 6 },
  lookingLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  goalGrid: { gap: 10 },
  goalTile: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  goalLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  locationCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14, marginBottom: 24 },
  locationPrivacy: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  lockedRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  lockedText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  lockedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 8 },
  lockedBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#34C759" },
  summaryCard: { borderWidth: 1.5, borderRadius: 16, padding: 16, marginTop: 8 },
  summaryTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  summaryRows: { gap: 4 },
  ctaWrap: { marginTop: 32 },
  nextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: BRAND, borderRadius: 18, paddingVertical: 18 },
  nextBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  skipText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
