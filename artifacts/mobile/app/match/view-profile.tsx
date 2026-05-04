import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import { showAlert } from "@/lib/alert";
import { getPublicProfileGifts, getGiftItem } from "@/lib/matchTransactions";

const { width: SW, height: SH } = Dimensions.get("window");
const BRAND = "#FF2D55";
const GOLD = "#FFD60A";

const GOAL_LABELS: Record<string, { l: string; emoji: string }> = {
  serious: { l: "Serious Relationship", emoji: "💍" },
  casual: { l: "Something Casual", emoji: "🌊" },
  friendship: { l: "New Friends", emoji: "👋" },
  open: { l: "Open to Anything", emoji: "✨" },
};

const EDU_LABELS: Record<string, string> = {
  high_school: "High School", associate: "Associate", bachelor: "Bachelor's",
  master: "Master's", doctorate: "Doctorate", other: "Other",
};

export default function ViewProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<any>(null);
  const [photos, setPhotos] = useState<{ url: string; is_primary: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [gifts, setGifts] = useState<{ id: string; gift_emoji: string; sender_name: string; sent_at: string }[]>([]);

  useEffect(() => {
    if (!userId || !user) return;
    Promise.all([
      supabase.from("match_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("match_photos").select("url, is_primary, display_order").eq("user_id", userId).order("display_order"),
      getPublicProfileGifts(user.id, userId),
    ]).then(([{ data: mp }, { data: ph }, giftData]) => {
      setProfile(mp);
      setPhotos(ph ?? []);
      setGifts(giftData);
      setLoading(false);
    });
  }, [userId]);

  function calcAge(dob: string | null) {
    if (!dob) return null;
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age--;
    return age;
  }

  async function report(reason: string) {
    if (!user || !userId) return;
    await supabase.from("match_reports").insert({ reporter_id: user.id, reported_id: userId, reason });
    setShowReport(false);
    showAlert("Report Submitted", "Thank you for keeping AfuMatch safe. We'll review this profile.");
  }

  if (loading) return <ProfileSkeleton />;

  if (!profile) return (
    <View style={[styles.root, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
      <Text style={[{ color: colors.textMuted, fontFamily: "Inter_400Regular" }]}>Profile not found</Text>
    </View>
  );

  const age = calcAge(profile.date_of_birth);
  const goalInfo = GOAL_LABELS[profile.relationship_goal] ?? GOAL_LABELS.open;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        {/* Photo header */}
        <View style={styles.photoSection}>
          {photos.length > 0 ? (
            <>
              <Image source={{ uri: photos[currentPhoto]?.url ?? photos[0].url }} style={styles.mainPhoto} resizeMode="cover" />
              {photos.length > 1 && (
                <View style={styles.photoDots}>
                  {photos.map((_, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: i === currentPhoto ? "#fff" : "rgba(255,255,255,0.4)" }]} />
                  ))}
                </View>
              )}
              {photos.length > 1 && (
                <>
                  <TouchableOpacity style={styles.tapLeft} activeOpacity={1} onPress={() => setCurrentPhoto((p) => Math.max(0, p - 1))} />
                  <TouchableOpacity style={styles.tapRight} activeOpacity={1} onPress={() => setCurrentPhoto((p) => Math.min(photos.length - 1, p + 1))} />
                </>
              )}
            </>
          ) : (
            <LinearGradient colors={["#FF2D55", "#FF6B6B"]} style={styles.mainPhoto}>
              <View style={{ alignItems: "center" }}>
                <Ionicons name="person" size={80} color="rgba(255,255,255,0.5)" />
              </View>
            </LinearGradient>
          )}
          <TouchableOpacity style={[styles.backBtn, { top: insets.top + 8 }]} onPress={() => router.back()}>
            <View style={styles.backBtnInner}><Ionicons name="arrow-back" size={20} color="#fff" /></View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.reportBtn, { top: insets.top + 8 }]} onPress={() => setShowReport(true)}>
            <View style={styles.backBtnInner}><Ionicons name="flag" size={18} color="#fff" /></View>
          </TouchableOpacity>
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={styles.nameOverlay} pointerEvents="none">
            <Text style={styles.profileName}>{profile.name}{profile.show_age && age ? `, ${age}` : ""}</Text>
            {(profile.job_title || profile.company) && (
              <View style={styles.metaRow}>
                <Ionicons name="briefcase" size={13} color="rgba(255,255,255,0.8)" />
                <Text style={styles.metaText}>{[profile.job_title, profile.company].filter(Boolean).join(" at ")}</Text>
              </View>
            )}
            {profile.location_name && (
              <View style={styles.metaRow}>
                <Ionicons name="location" size={13} color="rgba(255,255,255,0.8)" />
                <Text style={styles.metaText}>{[profile.location_name, profile.country].filter(Boolean).join(", ")}</Text>
              </View>
            )}
          </LinearGradient>
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          {/* Relationship goal */}
          <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 26 }}>{goalInfo.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoCardLabel, { color: colors.textMuted }]}>Looking for</Text>
              <Text style={[styles.infoCardValue, { color: colors.text }]}>{goalInfo.l}</Text>
            </View>
          </View>

          {/* Gifts received section */}
          {gifts.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.giftCardHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Gifts Received 🎁</Text>
                <View style={[styles.giftCountBadge, { backgroundColor: BRAND + "18" }]}>
                  <Text style={[styles.giftCountText, { color: BRAND }]}>{gifts.length}</Text>
                </View>
              </View>
              <View style={styles.giftGrid}>
                {gifts.map((g) => {
                  const item = getGiftItem(g.gift_emoji);
                  return (
                    <View key={g.id} style={[styles.giftTile, { backgroundColor: colors.backgroundSecondary }]}>
                      <Text style={styles.giftTileEmoji}>{g.gift_emoji}</Text>
                      <Text style={[styles.giftTileName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                      <View style={styles.giftTilePrice}>
                        <Ionicons name="diamond" size={8} color={GOLD} />
                        <Text style={styles.giftTilePriceText}>{item.price}</Text>
                      </View>
                      <Text style={[styles.giftTileSender, { color: colors.textMuted }]} numberOfLines={1}>from {g.sender_name}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Bio */}
          {profile.bio && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>About {profile.name}</Text>
              <Text style={[styles.cardBody, { color: colors.textSecondary }]}>{profile.bio}</Text>
            </View>
          )}

          {/* Interests */}
          {profile.interests && profile.interests.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Interests</Text>
              <View style={styles.interestWrap}>
                {profile.interests.map((tag: string) => (
                  <View key={tag} style={[styles.interestChip, { backgroundColor: BRAND + "18" }]}>
                    <Text style={[styles.interestText, { color: BRAND }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Education */}
          {(profile.school || profile.education_level) && (
            <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="school" size={22} color="#007AFF" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoCardLabel, { color: colors.textMuted }]}>Education</Text>
                <Text style={[styles.infoCardValue, { color: colors.text }]}>
                  {[profile.school, profile.education_level ? EDU_LABELS[profile.education_level] : null].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </View>
          )}

          {/* Safety notice */}
          <View style={[styles.safetyCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="shield-checkmark" size={18} color="#34C759" />
            <Text style={[styles.safetyText, { color: colors.textMuted }]}>
              Always meet in public places. Tell someone where you're going. Trust your instincts.
            </Text>
          </View>
        </View>

        <View style={{ height: insets.bottom + 100 }} />
      </ScrollView>

      {/* Report Modal */}
      <Modal visible={showReport} transparent animationType="slide" onRequestClose={() => setShowReport(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.reportSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.reportTitle, { color: colors.text }]}>Report Profile</Text>
            <Text style={[styles.reportSub, { color: colors.textMuted }]}>Why are you reporting {profile.name}?</Text>
            {[
              { v: "fake_profile", l: "Fake or Spam Profile" },
              { v: "inappropriate_photos", l: "Inappropriate Photos" },
              { v: "harassment", l: "Harassment or Bullying" },
              { v: "underage", l: "Appears to be Underage" },
              { v: "spam", l: "Spam" },
              { v: "other", l: "Other" },
            ].map((opt) => (
              <TouchableOpacity key={opt.v} style={[styles.reportOption, { borderBottomColor: colors.border }]} onPress={() => report(opt.v)}>
                <Text style={[styles.reportOptionText, { color: colors.text }]}>{opt.l}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.reportCancel} onPress={() => setShowReport(false)}>
              <Text style={[styles.reportCancelText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  photoSection: { position: "relative", height: SH * 0.65 },
  mainPhoto: { width: "100%", height: "100%" },
  photoDots: { position: "absolute", top: 12, left: 16, right: 16, flexDirection: "row", gap: 4 },
  dot: { flex: 1, height: 3, borderRadius: 2 },
  tapLeft: { position: "absolute", left: 0, top: 0, width: SW / 2, height: "100%" },
  tapRight: { position: "absolute", right: 0, top: 0, width: SW / 2, height: "100%" },
  backBtn: { position: "absolute", left: 16 },
  reportBtn: { position: "absolute", right: 16 },
  backBtnInner: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  nameOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, gap: 4 },
  profileName: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontFamily: "Inter_400Regular" },
  infoCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 14, padding: 16 },
  infoCardLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2 },
  infoCardValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 14, padding: 16, gap: 10 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cardBody: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  interestWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  interestChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  interestText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  safetyCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14 },
  safetyText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  giftCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  giftCountBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  giftCountText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  giftGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  giftTile: { width: (SW - 80) / 4, borderRadius: 12, padding: 8, alignItems: "center", gap: 3 },
  giftTileEmoji: { fontSize: 28 },
  giftTileName: { fontSize: 10, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  giftTilePrice: { flexDirection: "row", alignItems: "center", gap: 2 },
  giftTilePriceText: { fontSize: 10, fontFamily: "Inter_700Bold", color: GOLD },
  giftTileSender: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  reportSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#C7C7CC", alignSelf: "center", marginBottom: 20 },
  reportTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  reportSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 16 },
  reportOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  reportOptionText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  reportCancel: { paddingTop: 16, alignItems: "center" },
  reportCancelText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
