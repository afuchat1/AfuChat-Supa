import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { uploadToStorage } from "@/lib/mediaUpload";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import { showAlert } from "@/lib/alert";
import SchoolPickerInput from "@/components/SchoolPickerInput";
import RegionPickerInput from "@/components/RegionPickerInput";
import { detectGeo } from "@/lib/geoDetect";
import { getReceivedMatchGifts, ReceivedMatchGift, convertMatchGiftsToAcoins, getConvertedGiftIds, getGiftItem } from "@/lib/matchTransactions";

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
  const [hiddenGiftIds, setHiddenGiftIds] = useState<Set<string>>(new Set());
  const [convertedGiftIds, setConvertedGiftIds] = useState<Set<string>>(new Set());
  const [managingGift, setManagingGift] = useState<ReceivedMatchGift | null>(null);

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
    const [{ data: mp }, { data: mphotos }, gifts, convertedIds, hiddenRaw] = await Promise.all([
      supabase.from("match_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("match_photos").select("*").eq("user_id", user.id).order("display_order"),
      getReceivedMatchGifts(user.id),
      getConvertedGiftIds(user.id),
      AsyncStorage.getItem(`match_hidden_gifts_${user.id}`),
    ]);
    setReceivedGifts(gifts);
    setConvertedGiftIds(convertedIds);
    setHiddenGiftIds(new Set(hiddenRaw ? JSON.parse(hiddenRaw) : []));
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
      mediaTypes: "images",
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
      const ext = asset.uri.split(".").pop()?.toLowerCase() ?? "jpg";
      const safeExt = ext === "jpeg" ? "jpg" : ext;
      const path = `${user?.id}/${Date.now()}.${safeExt}`;
      const { publicUrl, error } = await uploadToStorage(
        "match-photos",
        path,
        asset.uri,
        `image/${safeExt === "jpg" ? "jpeg" : safeExt}`,
      );
      if (!error && publicUrl) {
        setPhotos((prev) => {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], url: publicUrl, uploading: false };
          return updated;
        });
      } else {
        setPhotos((prev) => prev.filter((_, j) => j !== idx));
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

  async function hideGift(giftId: string) {
    if (!user) return;
    const updated = new Set(hiddenGiftIds);
    updated.add(giftId);
    setHiddenGiftIds(updated);
    await AsyncStorage.setItem(`match_hidden_gifts_${user.id}`, JSON.stringify([...updated]));
    setManagingGift(null);
  }

  async function unhideGift(giftId: string) {
    if (!user) return;
    const updated = new Set(hiddenGiftIds);
    updated.delete(giftId);
    setHiddenGiftIds(updated);
    await AsyncStorage.setItem(`match_hidden_gifts_${user.id}`, JSON.stringify([...updated]));
  }

  async function convertGift(gift: ReceivedMatchGift) {
    if (!user) return;
    setManagingGift(null);
    if (convertedGiftIds.has(gift.id)) {
      showAlert("Already Converted", "This gift has already been converted to ACoins.");
      return;
    }
    const item = getGiftItem(gift.gift_emoji);
    const fee = Math.ceil(item.price * 0.05);
    const net = Math.max(1, item.price - fee);
    showAlert(
      `Convert ${gift.gift_emoji} to ACoins`,
      `You'll receive ${net} AC (${fee} AC platform fee applies).`,
      [
        { text: "Cancel", style: "cancel" },
        { text: `Convert for ${net} AC`, onPress: async () => {
          const result = await convertMatchGiftsToAcoins(user.id, [gift.id]);
          if (result.success) {
            showAlert("Converted!", `+${result.credited} AC added to your wallet. 🎉`);
            setConvertedGiftIds((prev) => new Set([...prev, gift.id]));
          } else {
            showAlert("Error", result.error ?? "Conversion failed. Try again.");
          }
        }},
      ]
    );
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

  if (loading) return <ProfileSkeleton />;

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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
                  {receivedGifts.slice(0, 18).map((g) => {
                    const isHidden = hiddenGiftIds.has(g.id);
                    const isConverted = convertedGiftIds.has(g.id);
                    return (
                      <Pressable
                        key={g.id}
                        style={({ pressed }) => [
                          styles.giftCell,
                          { backgroundColor: colors.backgroundSecondary, opacity: pressed ? 0.7 : 1 },
                          isHidden && { opacity: 0.32 },
                        ]}
                        onPress={() => setManagingGift(g)}
                      >
                        <Text style={[styles.giftCellEmoji, isHidden && { opacity: 0.5 }]}>{g.gift_emoji}</Text>
                        {isConverted && (
                          <View style={styles.giftConvertedBadge}>
                            <Ionicons name="checkmark" size={8} color="#34C759" />
                          </View>
                        )}
                        {isHidden && (
                          <View style={styles.giftHiddenBadge}>
                            <Ionicons name="eye-off" size={8} color="#8E8E93" />
                          </View>
                        )}
                        <Text style={[styles.giftCellName, { color: colors.textMuted }]} numberOfLines={1}>{g.sender_name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.giftHint, { color: colors.textMuted }]}>
                  Tap any gift to manage · Hidden gifts won't show on your public profile
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

      {/* Gift management modal */}
      <Modal
        visible={!!managingGift}
        transparent
        animationType="slide"
        onRequestClose={() => setManagingGift(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setManagingGift(null)}>
          <Pressable onPress={() => {}} style={[styles.giftSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHandle} />
            {/* Gift preview */}
            <View style={styles.giftSheetPreview}>
              <View style={[styles.giftSheetEmoji, { backgroundColor: BRAND + "12" }]}>
                <Text style={{ fontSize: 48 }}>{managingGift?.gift_emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.giftSheetName, { color: colors.text }]}>
                  {managingGift ? getGiftItem(managingGift.gift_emoji).name : ""}
                </Text>
                <Text style={[styles.giftSheetFrom, { color: colors.textMuted }]}>
                  from {managingGift?.sender_name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="diamond" size={11} color="#FFD60A" />
                  <Text style={[styles.giftSheetPrice, { color: "#FFD60A" }]}>
                    {managingGift ? getGiftItem(managingGift.gift_emoji).price : 0} ACoins
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.giftSheetDivider, { backgroundColor: colors.border }]} />

            {/* Actions */}
            {managingGift && hiddenGiftIds.has(managingGift.id) ? (
              <TouchableOpacity
                style={styles.giftSheetOption}
                onPress={() => { unhideGift(managingGift.id); setManagingGift(null); }}
              >
                <View style={[styles.giftSheetOptionIcon, { backgroundColor: "#34C75920" }]}>
                  <Ionicons name="eye" size={20} color="#34C759" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.giftSheetOptionTitle, { color: colors.text }]}>Show on Profile</Text>
                  <Text style={[styles.giftSheetOptionSub, { color: colors.textMuted }]}>Make this gift visible to others</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.giftSheetOption}
                onPress={() => managingGift && hideGift(managingGift.id)}
              >
                <View style={[styles.giftSheetOptionIcon, { backgroundColor: "#8E8E9320" }]}>
                  <Ionicons name="eye-off-outline" size={20} color="#8E8E93" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.giftSheetOptionTitle, { color: colors.text }]}>Hide from Profile</Text>
                  <Text style={[styles.giftSheetOptionSub, { color: colors.textMuted }]}>Others won't see this gift</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.giftSheetOption, managingGift && convertedGiftIds.has(managingGift.id) && { opacity: 0.4 }]}
              onPress={() => managingGift && convertGift(managingGift)}
              disabled={!!(managingGift && convertedGiftIds.has(managingGift.id))}
            >
              <View style={[styles.giftSheetOptionIcon, { backgroundColor: "#FFD60A20" }]}>
                <Ionicons name="diamond" size={20} color="#FFD60A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.giftSheetOptionTitle, { color: colors.text }]}>
                  {managingGift && convertedGiftIds.has(managingGift.id) ? "Already Converted" : "Convert to ACoins"}
                </Text>
                <Text style={[styles.giftSheetOptionSub, { color: colors.textMuted }]}>
                  Earn {managingGift ? Math.max(1, getGiftItem(managingGift.gift_emoji).price - Math.ceil(getGiftItem(managingGift.gift_emoji).price * 0.05)) : 0} AC (5% fee applies)
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.giftSheetOption} onPress={() => setManagingGift(null)}>
              <View style={[styles.giftSheetOptionIcon, { backgroundColor: BRAND + "18" }]}>
                <Ionicons name="heart" size={20} color={BRAND} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.giftSheetOptionTitle, { color: colors.text }]}>Leave on Profile</Text>
                <Text style={[styles.giftSheetOptionSub, { color: colors.textMuted }]}>Keep showcasing this gift</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  textarea: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 100 },
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
  giftCell: { width: 60, height: 72, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 3, padding: 6, position: "relative" },
  giftCellEmoji: { fontSize: 26 },
  giftCellName: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
  giftHint: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  giftConvertedBadge: { position: "absolute", top: 4, right: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: "#34C759", alignItems: "center", justifyContent: "center" },
  giftHiddenBadge: { position: "absolute", top: 4, right: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: "#3A3A3C", alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  giftSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 34 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#C7C7CC", alignSelf: "center", margin: 12 },
  giftSheetPreview: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, paddingVertical: 12 },
  giftSheetEmoji: { width: 72, height: 72, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  giftSheetName: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 2 },
  giftSheetFrom: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  giftSheetPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },
  giftSheetDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 20, marginVertical: 4 },
  giftSheetOption: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  giftSheetOptionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  giftSheetOptionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  giftSheetOptionSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
