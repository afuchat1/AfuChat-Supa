import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import SchoolPickerInput from "@/components/SchoolPickerInput";
import RegionPickerInput from "@/components/RegionPickerInput";
import { detectGeo } from "@/lib/geoDetect";
import { getReceivedMatchGifts, ReceivedMatchGift } from "@/lib/matchTransactions";

const { width: SW } = Dimensions.get("window");
const BRAND = "#FF2D55";

const INTERESTS_LIST = [
  "Travel", "Music", "Fitness", "Cooking", "Art", "Photography",
  "Reading", "Gaming", "Hiking", "Movies", "Dancing", "Fashion",
  "Technology", "Coffee", "Yoga", "Pets", "Sports", "Wine",
  "Surfing", "Climbing", "Writing", "Coding", "Meditation", "Foodie",
];

const GOAL_OPTIONS = [
  { v: "serious", l: "Serious Relationship", emoji: "💍" },
  { v: "casual", l: "Something Casual", emoji: "🌊" },
  { v: "friendship", l: "New Friends", emoji: "👋" },
  { v: "open", l: "Open to Anything", emoji: "✨" },
] as const;

type PhotoItem = { id?: string; uri: string; url?: string; order: number; is_primary: boolean; uploading?: boolean };

export default function MatchProfileEditScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [receivedGifts, setReceivedGifts] = useState<ReceivedMatchGift[]>([]);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [school, setSchool] = useState("");
  const [locationName, setLocationName] = useState("");
  const [country, setCountry] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [goal, setGoal] = useState("open");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    if (!user) return;
    const [{ data: mp }, { data: mphotos }, gifts] = await Promise.all([
      supabase.from("match_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("match_photos").select("*").eq("user_id", user.id).order("display_order"),
      getReceivedMatchGifts(user.id),
    ]);
    setReceivedGifts(gifts);
    if (mp) {
      setName(mp.name ?? "");
      setBio(mp.bio ?? "");
      setJobTitle(mp.job_title ?? "");
      setCompany(mp.company ?? "");
      setSchool(mp.school ?? "");
      setLocationName(mp.location_name ?? "");
      setInterests(mp.interests ?? []);
      setGoal(mp.relationship_goal ?? "open");
      const savedCountry = mp.country ?? "";
      if (savedCountry) {
        setCountry(savedCountry);
      } else {
        setGeoLoading(true);
        detectGeo().then((geo) => {
          if (geo) {
            setCountry(geo.countryName);
            if (!mp.location_name) setLocationName(geo.city);
          }
          setGeoLoading(false);
        });
      }
    }
    if (mphotos) {
      setPhotos(mphotos.map((p: any) => ({ id: p.id, uri: p.url, url: p.url, order: p.display_order, is_primary: p.is_primary })));
    }
    setLoading(false);
  }

  async function pickPhoto() {
    if (photos.length >= 6) { showAlert("Limit", "You can have up to 6 photos."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const newPhoto: PhotoItem = { uri: asset.uri, order: photos.length, is_primary: photos.length === 0, uploading: true };
    const idx = photos.length;
    setPhotos((prev) => [...prev, newPhoto]);

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
          updated[idx] = { ...updated[idx], url: urlData.publicUrl, uploading: false };
          return updated;
        });
      }
    } catch { setPhotos((prev) => prev.filter((_, j) => j !== idx)); }
  }

  async function removePhoto(i: number) {
    const photo = photos[i];
    setPhotos((prev) => prev.filter((_, j) => j !== i).map((p, j) => ({ ...p, order: j, is_primary: j === 0 })));
    if (photo.id) {
      await supabase.from("match_photos").delete().eq("id", photo.id);
    }
  }

  async function save() {
    if (!user || !name.trim()) { showAlert("Name required", "Please enter your name."); return; }
    setSaving(true);
    const { error } = await supabase.from("match_profiles").update({
      name: name.trim(),
      bio: bio.trim() || null,
      job_title: jobTitle.trim() || null,
      company: company.trim() || null,
      school: school.trim() || null,
      location_name: locationName.trim() || null,
      country: country.trim() || null,
      interests,
      relationship_goal: goal,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    if (!error) {
      // Sync photos
      const uploaded = photos.filter((p) => p.url);
      if (uploaded.length > 0) {
        await supabase.from("match_photos").delete().eq("user_id", user.id);
        await supabase.from("match_photos").insert(uploaded.map((p, i) => ({
          user_id: user.id,
          url: p.url,
          display_order: i,
          is_primary: i === 0,
        })));
      }
      showAlert("Saved!", "Your dating profile has been updated.");
      router.back();
    } else {
      showAlert("Error", "Failed to save. Please try again.");
    }
    setSaving(false);
  }

  if (loading) return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" }]}>
      <ActivityIndicator color={BRAND} size="large" />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Dating Profile</Text>
        <TouchableOpacity onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color={BRAND} /> : <Text style={[styles.saveBtn, { color: BRAND }]}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >

          {/* Photos */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PHOTOS</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
            <View style={styles.photoGrid}>
              {Array.from({ length: 6 }).map((_, i) => {
                const photo = photos[i];
                if (photo) {
                  return (
                    <View key={i} style={styles.photoCell}>
                      <Image source={{ uri: photo.uri }} style={styles.photoThumb} resizeMode="cover" />
                      {photo.uploading && (
                        <View style={styles.photoUploading}><ActivityIndicator color="#fff" /></View>
                      )}
                      {i === 0 && <View style={styles.primaryBadge}><Text style={styles.primaryText}>Main</Text></View>}
                      <Pressable style={styles.photoRemove} onPress={() => removePhoto(i)}>
                        <Ionicons name="close-circle" size={22} color="#FF3B30" />
                      </Pressable>
                    </View>
                  );
                }
                return (
                  <Pressable key={i} style={[styles.photoAdd, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]} onPress={pickPhoto}>
                    <Ionicons name="add" size={24} color={colors.textMuted} />
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.photoHint, { color: colors.textMuted }]}>Add up to 6 photos. Drag to reorder. First photo is your main photo.</Text>
          </View>

          {/* About */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ABOUT YOU</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>NAME</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                value={name}
                onChangeText={setName}
                placeholder="Your first name"
                placeholderTextColor={colors.textMuted}
                maxLength={30}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>BIO</Text>
              <TextInput
                style={[styles.textarea, { color: colors.text, borderColor: colors.border }]}
                value={bio}
                onChangeText={(v) => setBio(v.slice(0, 300))}
                placeholder="Tell people about yourself…"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <Text style={[styles.charCount, { color: colors.textMuted }]}>{bio.length}/300</Text>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>RELATIONSHIP GOAL</Text>
              <View style={styles.goalGrid}>
                {GOAL_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.v}
                    style={[styles.goalChip, { borderColor: goal === opt.v ? BRAND : colors.border, backgroundColor: goal === opt.v ? BRAND + "15" : "transparent" }]}
                    onPress={() => setGoal(opt.v)}
                  >
                    <Text>{opt.emoji}</Text>
                    <Text style={[styles.goalChipText, { color: goal === opt.v ? BRAND : colors.textSecondary }]}>{opt.l}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Interests */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>INTERESTS ({interests.length}/8)</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
            <View style={styles.interestGrid}>
              {INTERESTS_LIST.map((tag) => {
                const on = interests.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    style={[styles.interestChip, { backgroundColor: on ? BRAND : colors.backgroundSecondary, borderColor: on ? BRAND : colors.border }]}
                    onPress={() => {
                      if (on) setInterests((p) => p.filter((t) => t !== tag));
                      else if (interests.length < 8) setInterests((p) => [...p, tag]);
                      else showAlert("Limit", "You can select up to 8 interests.");
                    }}
                  >
                    <Text style={[styles.interestText, { color: on ? "#fff" : colors.text }]}>{tag}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Career */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CAREER & EDUCATION</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, zIndex: 20 }]}>
            {[
              { l: "JOB TITLE", v: jobTitle, s: setJobTitle, ph: "e.g. Designer" },
              { l: "COMPANY", v: company, s: setCompany, ph: "e.g. Apple" },
            ].map((f) => (
              <View key={f.l} style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{f.l}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  value={f.v}
                  onChangeText={f.s}
                  placeholder={f.ph}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            ))}
            <View style={[styles.fieldGroup, { zIndex: 10, marginBottom: 0 }]}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>SCHOOL</Text>
              <SchoolPickerInput
                value={school}
                onChange={(v) => setSchool(v.slice(0, 120))}
                country={country || undefined}
                placeholder="Search your school or university"
              />
            </View>
          </View>

          {/* Gifts Received */}
          {receivedGifts.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>GIFTS RECEIVED ({receivedGifts.length})</Text>
              <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
                <View style={styles.giftGrid}>
                  {receivedGifts.slice(0, 18).map((g, i) => (
                    <View key={g.id} style={[styles.giftCell, { backgroundColor: colors.backgroundSecondary }]}>
                      <Text style={styles.giftCellEmoji}>{g.gift_emoji}</Text>
                      <Text style={[styles.giftCellName, { color: colors.textMuted }]} numberOfLines={1}>{g.sender_name}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.giftHint, { color: colors.textMuted }]}>
                  Gifts from your matches · visible on your public profile
                </Text>
              </View>
            </>
          )}

          {/* Location */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>LOCATION</Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, zIndex: 10 }]}>
            {/* Country — auto-detected, locked */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>COUNTRY</Text>
              <View style={[styles.lockedRow, { borderColor: country ? BRAND : colors.border }]}>
                <Ionicons name="earth" size={18} color={country ? BRAND : colors.textMuted} style={{ marginRight: 8 }} />
                {geoLoading ? (
                  <>
                    <ActivityIndicator size="small" color={BRAND} style={{ marginRight: 8 }} />
                    <Text style={[styles.lockedText, { color: colors.textMuted }]}>Detecting your country…</Text>
                  </>
                ) : (
                  <Text style={[styles.lockedText, { color: country ? colors.text : colors.textMuted }]}>
                    {country || "Could not detect — check network"}
                  </Text>
                )}
                <View style={styles.lockedBadge}>
                  <Ionicons name="lock-closed" size={11} color="#34C759" />
                  <Text style={styles.lockedBadgeText}>Auto</Text>
                </View>
              </View>
            </View>

            {/* City / Region — searchable dropdown */}
            <View style={[styles.fieldGroup, { zIndex: 10, marginBottom: 0 }]}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CITY / TOWN</Text>
              <RegionPickerInput
                value={locationName}
                onChange={setLocationName}
                country={country}
                placeholder="Search your city or town"
              />
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  saveBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  sectionCard: { marginHorizontal: 16, borderRadius: 14, padding: 16 },
  fieldGroup: { marginBottom: 16 },
  lockedRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  lockedText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  lockedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 8, backgroundColor: "#34C75922" },
  lockedBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#34C759" },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  textarea: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 100 },
  charCount: { textAlign: "right", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  photoCell: { width: (SW - 80) / 3, aspectRatio: 3 / 4, borderRadius: 12, overflow: "hidden", position: "relative" },
  photoThumb: { width: "100%", height: "100%" },
  photoUploading: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  primaryBadge: { position: "absolute", bottom: 6, left: 6, backgroundColor: BRAND, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  primaryText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  photoRemove: { position: "absolute", top: 4, right: 4 },
  photoAdd: { width: (SW - 80) / 3, aspectRatio: 3 / 4, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  photoHint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  goalGrid: { gap: 8 },
  goalChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  goalChipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  interestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  interestChip: { borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 7 },
  interestText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  giftGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  giftCell: { width: 60, height: 68, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 4, padding: 6 },
  giftCellEmoji: { fontSize: 26 },
  giftCellName: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
  giftHint: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
});
