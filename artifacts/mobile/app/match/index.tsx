import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { chargeMatchSuperLike, chargeProfileBoost, getAcoinBalance, MATCH_PRICES } from "@/lib/matchTransactions";

const { width: SW, height: SH } = Dimensions.get("window");
const CARD_W = Math.min(SW - 32, 420);
const CARD_H = Math.min(SH * 0.64, 580);
const SWIPE_THRESHOLD = CARD_W * 0.28;
const SWIPE_OUT_DURATION = 320;
const BRAND = "#FF2D55";

// ─── Types ──────────────────────────────────────────────────────────────────
type Candidate = {
  user_id: string;
  name: string;
  date_of_birth: string | null;
  bio: string | null;
  job_title: string | null;
  company: string | null;
  school: string | null;
  location_name: string | null;
  country: string | null;
  interests: string[];
  relationship_goal: string;
  show_age: boolean;
  photos: { url: string; display_order: number }[];
};

type MatchRecord = {
  id: string;
  user1_id: string;
  user2_id: string;
  matched_at: string;
  is_super_match: boolean;
  other: Candidate & { primary_photo: string | null };
};

const GOAL_INFO: Record<string, { emoji: string; l: string }> = {
  serious: { emoji: "💍", l: "Serious Relationship" },
  casual: { emoji: "🌊", l: "Something Casual" },
  friendship: { emoji: "👋", l: "New Friends" },
  open: { emoji: "✨", l: "Open to Anything" },
};

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age--;
  return age;
}

// ─── Card Profile Detail Modal ───────────────────────────────────────────────
function CardDetailModal({
  candidate,
  onClose,
  onLike,
  onNope,
  onSuperLike,
}: {
  candidate: Candidate;
  onClose: () => void;
  onLike: () => void;
  onNope: () => void;
  onSuperLike: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [photoIdx, setPhotoIdx] = useState(0);
  const age = calcAge(candidate.date_of_birth);
  const goal = GOAL_INFO[candidate.relationship_goal] ?? GOAL_INFO.open;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[detailStyles.root, { backgroundColor: colors.background }]}>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {/* Photos */}
          <View style={{ height: SH * 0.62, position: "relative" }}>
            {candidate.photos.length > 0 ? (
              <Image source={{ uri: candidate.photos[photoIdx]?.url ?? candidate.photos[0].url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <LinearGradient colors={["#FF2D55", "#FF6B6B"]} style={StyleSheet.absoluteFill} />
            )}
            {/* Dots */}
            {candidate.photos.length > 1 && (
              <View style={detailStyles.dots}>
                {candidate.photos.map((_, i) => (
                  <View key={i} style={[detailStyles.dot, { backgroundColor: i === photoIdx ? "#fff" : "rgba(255,255,255,0.4)" }]} />
                ))}
              </View>
            )}
            {candidate.photos.length > 1 && (
              <>
                <Pressable style={detailStyles.tapL} onPress={() => setPhotoIdx((p) => Math.max(0, p - 1))} />
                <Pressable style={detailStyles.tapR} onPress={() => setPhotoIdx((p) => Math.min(candidate.photos.length - 1, p + 1))} />
              </>
            )}
            {/* Back */}
            <Pressable style={[detailStyles.closeBtn, { top: insets.top + 8 }]} onPress={onClose}>
              <View style={detailStyles.closeBtnInner}><Ionicons name="chevron-down" size={20} color="#fff" /></View>
            </Pressable>
            {/* Name overlay */}
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={detailStyles.nameOverlay} pointerEvents="none">
              <Text style={detailStyles.profileName}>{candidate.name}{candidate.show_age && age ? `, ${age}` : ""}</Text>
              {candidate.job_title && (
                <View style={detailStyles.metaRow}>
                  <Ionicons name="briefcase" size={12} color="rgba(255,255,255,0.8)" />
                  <Text style={detailStyles.metaText}>{[candidate.job_title, candidate.company].filter(Boolean).join(" at ")}</Text>
                </View>
              )}
              {candidate.location_name && (
                <View style={detailStyles.metaRow}>
                  <Ionicons name="location" size={12} color="rgba(255,255,255,0.8)" />
                  <Text style={detailStyles.metaText}>{[candidate.location_name, candidate.country].filter(Boolean).join(", ")}</Text>
                </View>
              )}
            </LinearGradient>
          </View>

          <View style={{ padding: 20, gap: 16 }}>
            {/* Goal */}
            <View style={[detailStyles.goalRow, { backgroundColor: colors.surface }]}>
              <Text style={{ fontSize: 24 }}>{goal.emoji}</Text>
              <View>
                <Text style={[detailStyles.goalLabel, { color: colors.textMuted }]}>Looking for</Text>
                <Text style={[detailStyles.goalValue, { color: colors.text }]}>{goal.l}</Text>
              </View>
            </View>
            {/* Bio */}
            {candidate.bio && (
              <View style={[detailStyles.card, { backgroundColor: colors.surface }]}>
                <Text style={[detailStyles.cardTitle, { color: colors.text }]}>About {candidate.name}</Text>
                <Text style={[detailStyles.cardBody, { color: colors.textSecondary }]}>{candidate.bio}</Text>
              </View>
            )}
            {/* Interests */}
            {candidate.interests.length > 0 && (
              <View style={[detailStyles.card, { backgroundColor: colors.surface }]}>
                <Text style={[detailStyles.cardTitle, { color: colors.text }]}>Interests</Text>
                <View style={detailStyles.chips}>
                  {candidate.interests.map((t) => (
                    <View key={t} style={[detailStyles.chip, { backgroundColor: BRAND + "18" }]}>
                      <Text style={[detailStyles.chipText, { color: BRAND }]}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {/* Education */}
            {candidate.school && (
              <View style={[detailStyles.goalRow, { backgroundColor: colors.surface }]}>
                <Ionicons name="school" size={22} color="#007AFF" />
                <View>
                  <Text style={[detailStyles.goalLabel, { color: colors.textMuted }]}>Education</Text>
                  <Text style={[detailStyles.goalValue, { color: colors.text }]}>{candidate.school}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={{ height: insets.bottom + 120 }} />
        </ScrollView>

        {/* Action buttons */}
        <View style={[detailStyles.actions, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
          <Pressable style={[detailStyles.actionBtn, detailStyles.nopeBtn]} onPress={() => { onClose(); onNope(); }}>
            <Ionicons name="close" size={28} color="#FF3B30" />
          </Pressable>
          <Pressable style={[detailStyles.actionBtn, detailStyles.superBtn]} onPress={() => { onClose(); onSuperLike(); }}>
            <Ionicons name="star" size={22} color="#007AFF" />
          </Pressable>
          <Pressable style={[detailStyles.actionBtn, detailStyles.likeBtn]} onPress={() => { onClose(); onLike(); }}>
            <Ionicons name="heart" size={26} color={BRAND} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const detailStyles = StyleSheet.create({
  root: { flex: 1 },
  dots: { position: "absolute", top: 12, left: 16, right: 16, flexDirection: "row", gap: 4 },
  dot: { flex: 1, height: 3, borderRadius: 2 },
  tapL: { position: "absolute", left: 0, top: 0, width: SW / 2, height: "100%" },
  tapR: { position: "absolute", right: 0, top: 0, width: SW / 2, height: "100%" },
  closeBtn: { position: "absolute", left: 16 },
  closeBtnInner: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  nameOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, gap: 5 },
  profileName: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "Inter_400Regular" },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 14, padding: 16 },
  goalLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  goalValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 14, padding: 16, gap: 10 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cardBody: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  actions: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.1)" },
  actionBtn: { alignItems: "center", justifyContent: "center", elevation: 4 },
  nopeBtn: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#fff", borderWidth: 2, borderColor: "#FF3B30" },
  superBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#fff", borderWidth: 2, borderColor: "#007AFF" },
  likeBtn: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#fff", borderWidth: 2, borderColor: BRAND },
});

// ─── Swipe Card ──────────────────────────────────────────────────────────────
function SwipeCard({
  candidate,
  isTop,
  onSwipeLeft,
  onSwipeRight,
  onSuperLike,
  onTap,
}: {
  candidate: Candidate;
  isTop: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSuperLike: () => void;
  onTap: () => void;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [photoIdx, setPhotoIdx] = useState(0);
  const age = calcAge(candidate.date_of_birth);
  const primaryPhoto = candidate.photos[photoIdx]?.url ?? candidate.photos[0]?.url;

  const rotate = pan.x.interpolate({ inputRange: [-CARD_W / 2, 0, CARD_W / 2], outputRange: ["-12deg", "0deg", "12deg"], extrapolate: "clamp" });
  const likeOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD / 2], outputRange: [0, 1], extrapolate: "clamp" });
  const nopeOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD / 2, 0], outputRange: [1, 0], extrapolate: "clamp" });
  const superOpacity = pan.y.interpolate({ inputRange: [-SWIPE_THRESHOLD / 2, 0], outputRange: [1, 0], extrapolate: "clamp" });

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => isTop,
    onMoveShouldSetPanResponder: (_, g) => isTop && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      if (g.dy < -SWIPE_THRESHOLD) flyOut("up");
      else if (g.dx > SWIPE_THRESHOLD) flyOut("right");
      else if (g.dx < -SWIPE_THRESHOLD) flyOut("left");
      else if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) {
        onTap();
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
      } else Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
    },
  }), [isTop]);

  function flyOut(dir: "left" | "right" | "up") {
    Haptics.impactAsync();
    const toVal = dir === "right" ? { x: SW * 1.5, y: 0 } : dir === "left" ? { x: -SW * 1.5, y: 0 } : { x: 0, y: -SH * 1.5 };
    Animated.timing(pan, { toValue: toVal, duration: SWIPE_OUT_DURATION, useNativeDriver: true }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      if (dir === "right") onSwipeRight();
      else if (dir === "left") onSwipeLeft();
      else onSuperLike();
    });
  }

  const photoCount = candidate.photos.length;

  return (
    <Animated.View
      style={[styles.card, { width: CARD_W, height: CARD_H, transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
      {...panResponder.panHandlers}
    >
      {primaryPhoto ? (
        <Image source={{ uri: primaryPhoto }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={["#FF2D55", "#FF6B6B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}

      {/* Photo progress bars */}
      {photoCount > 1 && (
        <View style={styles.photoBars}>
          {candidate.photos.map((_, i) => (
            <Pressable key={i} style={[styles.photoBar, { backgroundColor: i === photoIdx ? "#fff" : "rgba(255,255,255,0.4)" }]}
              onPress={() => setPhotoIdx(i)} />
          ))}
        </View>
      )}

      {/* Tap zones for photos */}
      {photoCount > 1 && (
        <>
          <Pressable style={styles.photoTapL} onPress={() => setPhotoIdx((p) => Math.max(0, p - 1))} />
          <Pressable style={styles.photoTapR} onPress={() => setPhotoIdx((p) => Math.min(photoCount - 1, p + 1))} />
        </>
      )}

      {/* LIKE stamp */}
      <Animated.View style={[styles.stampLike, { opacity: likeOpacity }]}>
        <Text style={styles.stampLikeText}>LIKE</Text>
      </Animated.View>

      {/* NOPE stamp */}
      <Animated.View style={[styles.stampNope, { opacity: nopeOpacity }]}>
        <Text style={styles.stampNopeText}>NOPE</Text>
      </Animated.View>

      {/* SUPER stamp */}
      <Animated.View style={[styles.stampSuper, { opacity: superOpacity }]}>
        <Text style={styles.stampSuperText}>SUPER</Text>
      </Animated.View>

      {/* Info overlay */}
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} style={styles.cardOverlay} pointerEvents="none">
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.cardName} numberOfLines={1}>{candidate.name}{candidate.show_age && age ? `, ${age}` : ""}</Text>
          </View>
          {candidate.job_title && (
            <View style={styles.metaRow}>
              <Ionicons name="briefcase" size={13} color="rgba(255,255,255,0.75)" />
              <Text style={styles.cardMeta} numberOfLines={1}>{[candidate.job_title, candidate.company].filter(Boolean).join(" at ")}</Text>
            </View>
          )}
          {candidate.location_name && (
            <View style={styles.metaRow}>
              <Ionicons name="location" size={13} color="rgba(255,255,255,0.75)" />
              <Text style={styles.cardMeta} numberOfLines={1}>{[candidate.location_name, candidate.country].filter(Boolean).join(", ")}</Text>
            </View>
          )}
          {candidate.bio ? <Text style={styles.cardBio} numberOfLines={2}>{candidate.bio}</Text> : null}
          {candidate.interests.length > 0 && (
            <View style={styles.interestRow}>
              {candidate.interests.slice(0, 3).map((t) => (
                <View key={t} style={styles.interestPill}><Text style={styles.interestPillText}>{t}</Text></View>
              ))}
            </View>
          )}
          {/* Info expand hint */}
          <Pressable style={styles.expandHint} onPress={onTap}>
            <Ionicons name="information-circle-outline" size={20} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Match Celebration Modal ─────────────────────────────────────────────────
function MatchModal({ match, onClose, onMessage }: { match: MatchRecord; onClose: () => void; onMessage: () => void }) {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const age = calcAge(match.other.date_of_birth);

  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }).start();
  }, []);

  return (
    <View style={matchStyles.overlay}>
      {/* Animated hearts background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 12 }).map((_, i) => (
          <Text key={i} style={[matchStyles.floatingHeart, { left: `${(i * 8.3) % 100}%`, top: `${(i * 13) % 80}%`, fontSize: 16 + (i % 3) * 8, opacity: 0.3 + (i % 3) * 0.1 }]}>
            {i % 2 === 0 ? "❤️" : "💕"}
          </Text>
        ))}
      </View>
      <Animated.View style={[matchStyles.card, { transform: [{ scale: scaleAnim }] }]}>
        <LinearGradient colors={[BRAND, "#FF6B6B"]} style={matchStyles.headerGrad}>
          <View style={matchStyles.heartBubble}><Ionicons name="heart" size={44} color="#fff" /></View>
          {match.is_super_match && (
            <View style={matchStyles.superBadge}><Ionicons name="star" size={13} color="#FFD60A" /><Text style={matchStyles.superText}>Super Match!</Text></View>
          )}
          <Text style={matchStyles.matchTitle}>It's a Match!</Text>
          <Text style={matchStyles.matchSub}>You and {match.other.name} liked each other</Text>
        </LinearGradient>

        {/* Avatar */}
        <View style={matchStyles.avatarRow}>
          {match.other.primary_photo ? (
            <Image source={{ uri: match.other.primary_photo }} style={matchStyles.avatar} />
          ) : (
            <View style={[matchStyles.avatar, { backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="person" size={36} color={colors.textMuted} />
            </View>
          )}
        </View>

        <View style={[matchStyles.body, { backgroundColor: colors.surface }]}>
          <Text style={[matchStyles.matchedName, { color: colors.text }]}>
            {match.other.name}{age ? `, ${age}` : ""}
          </Text>
          {match.other.location_name && (
            <View style={matchStyles.locRow}>
              <Ionicons name="location" size={13} color={colors.textMuted} />
              <Text style={[matchStyles.locText, { color: colors.textMuted }]}>{match.other.location_name}</Text>
            </View>
          )}
          <View style={matchStyles.actions}>
            <Pressable style={matchStyles.sendMsgBtn} onPress={onMessage}>
              <Ionicons name="chatbubble" size={16} color="#fff" />
              <Text style={matchStyles.sendMsgText}>Send Message</Text>
            </Pressable>
          </View>
        </View>
        <Pressable style={[matchStyles.dismiss, { borderTopColor: colors.border }]} onPress={onClose}>
          <Text style={[matchStyles.dismissText, { color: colors.textMuted }]}>Keep Swiping</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const matchStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.88)", alignItems: "center", justifyContent: "center", zIndex: 200 },
  floatingHeart: { position: "absolute" },
  card: { width: Math.min(SW - 48, 380), borderRadius: 28, overflow: "hidden" },
  headerGrad: { alignItems: "center", paddingTop: 28, paddingBottom: 16, paddingHorizontal: 24, gap: 6 },
  heartBubble: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  superBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.2)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  superText: { color: "#FFD60A", fontSize: 12, fontFamily: "Inter_700Bold" },
  matchTitle: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold" },
  matchSub: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  avatarRow: { flexDirection: "row", justifyContent: "center", marginTop: -38, paddingBottom: 4, backgroundColor: "transparent", zIndex: 10 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: "#fff" },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, alignItems: "center" },
  matchedName: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 16 },
  locText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  actions: { width: "100%" },
  sendMsgBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14 },
  sendMsgText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  dismiss: { paddingVertical: 14, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth },
  dismissText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});

// ─── Matches Tab ─────────────────────────────────────────────────────────────
function MatchesTab() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("match_matches")
      .select("id, user1_id, user2_id, matched_at, is_super_match")
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order("matched_at", { ascending: false });

    if (!data) { setLoading(false); return; }

    const enriched = await Promise.all(data.map(async (m: any) => {
      const otherId = m.user1_id === user.id ? m.user2_id : m.user1_id;
      const [{ data: mp }, { data: ph }, { data: lastMsg }] = await Promise.all([
        supabase.from("match_profiles").select("user_id, name, date_of_birth, location_name, show_age").eq("user_id", otherId).maybeSingle(),
        supabase.from("match_photos").select("url").eq("user_id", otherId).eq("is_primary", true).maybeSingle(),
        supabase.from("match_messages").select("content, sent_at, sender_id").eq("match_id", m.id).order("sent_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { ...m, other: { ...(mp ?? { user_id: otherId, name: "User" }), primary_photo: ph?.url ?? null, last_msg: lastMsg } };
    }));

    setMatches(enriched.filter((m) => m.other));
    setLoading(false);
  }

  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={BRAND} /></View>;

  if (matches.length === 0) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
      <View style={[styles.emptyIcon, { backgroundColor: BRAND }]}><Ionicons name="heart-outline" size={40} color="#fff" /></View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No matches yet</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>Keep swiping to find your matches!</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
      {matches.map((m) => {
        const age = m.other.show_age ? calcAge(m.other.date_of_birth) : null;
        const lastMsg = (m.other as any).last_msg;
        return (
          <Pressable
            key={m.id}
            style={[styles.matchRow, { backgroundColor: "#fff" }]}
            onPress={() => router.push(`/match/${m.id}` as any)}
          >
            <View style={styles.matchAvatarWrap}>
              {m.other.primary_photo ? (
                <Image source={{ uri: m.other.primary_photo }} style={styles.matchAvatar} />
              ) : (
                <View style={[styles.matchAvatar, { backgroundColor: "#F2F2F7", alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="person" size={24} color="#C7C7CC" />
                </View>
              )}
              {m.is_super_match && (
                <View style={styles.superDot}><Ionicons name="star" size={10} color="#FFD60A" /></View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={styles.matchName}>{m.other.name}{age ? `, ${age}` : ""}</Text>
                {m.is_super_match && <Ionicons name="star" size={12} color="#FFD60A" />}
              </View>
              {lastMsg ? (
                <Text style={styles.matchLastMsg} numberOfLines={1}>
                  {lastMsg.sender_id === user?.id ? "You: " : ""}{lastMsg.content ?? "Sent a gift 🎁"}
                </Text>
              ) : (
                <Text style={[styles.matchLastMsg, { color: BRAND, fontFamily: "Inter_600SemiBold" }]}>Say hello! 👋</Text>
              )}
            </View>
            <View style={styles.matchMeta}>
              {lastMsg && <Text style={styles.matchTime}>{new Date(lastMsg.sent_at).toLocaleDateString([], { month: "short", day: "numeric" })}</Text>}
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function MatchScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [myProfile, setMyProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [tab, setTab] = useState<"discover" | "matches">("discover");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchResult, setMatchResult] = useState<MatchRecord | null>(null);
  const [detailCandidate, setDetailCandidate] = useState<Candidate | null>(null);
  const [undoStack, setUndoStack] = useState<Candidate[]>([]);
  const [acoinBalance, setAcoinBalance] = useState(0);

  // Check if user has a dating profile
  useEffect(() => { checkProfile(); }, []);

  async function checkProfile() {
    if (!user) return;
    const [{ data }, balance] = await Promise.all([
      supabase.from("match_profiles").select("user_id, name, is_paused, show_in_discovery, profile_complete").eq("user_id", user.id).maybeSingle(),
      getAcoinBalance(user.id),
    ]);
    setMyProfile(data);
    setAcoinBalance(balance);
    setProfileLoading(false);
    if (data && !data.is_paused) fetchCandidates();
  }

  async function fetchCandidates() {
    if (!user) return;
    setLoading(true);
    // Get my preferences
    const { data: prefs } = await supabase.from("match_preferences").select("*").eq("user_id", user.id).maybeSingle();
    // Get swiped IDs
    const { data: swiped } = await supabase.from("match_swipes").select("swiped_id").eq("swiper_id", user.id);
    const swipedIds = (swiped ?? []).map((s: any) => s.swiped_id);

    // Build query
    let query = supabase
      .from("match_profiles")
      .select("user_id, name, date_of_birth, bio, job_title, company, school, location_name, country, interests, relationship_goal, show_age")
      .neq("user_id", user.id)
      .eq("show_in_discovery", true)
      .eq("is_paused", false)
      .eq("profile_complete", true)
      .limit(30);

    if (swipedIds.length > 0) {
      query = query.not("user_id", "in", `(${swipedIds.join(",")})`);
    }
    if (prefs?.interested_in && prefs.interested_in !== "everyone") {
      query = query.eq("gender", prefs.interested_in === "men" ? "man" : "woman");
    }

    const { data: profileData } = await query;

    if (!profileData) { setLoading(false); return; }

    // Fetch photos for each candidate
    const withPhotos = await Promise.all(
      (profileData as any[]).map(async (p) => {
        const { data: ph } = await supabase.from("match_photos").select("url, display_order").eq("user_id", p.user_id).order("display_order").limit(6);
        return { ...p, photos: ph ?? [], interests: p.interests ?? [] };
      })
    );

    // Filter out candidates with no photos
    setCandidates(withPhotos.filter((c) => c.photos.length > 0));
    setLoading(false);
  }

  async function recordSwipe(c: Candidate, direction: "like" | "nope" | "superlike") {
    if (!user) return;
    await supabase.from("match_swipes").upsert({ swiper_id: user.id, swiped_id: c.user_id, direction }, { onConflict: "swiper_id,swiped_id" });

    if (direction !== "nope") {
      const { data: matchId } = await supabase.rpc("check_mutual_match", { p_swiper: user.id, p_swiped: c.user_id, p_direction: direction });
      if (matchId) {
        // Fetch the match record
        const primary = c.photos[0]?.url ?? null;
        Haptics.impactAsync();
        setMatchResult({
          id: matchId,
          user1_id: user.id,
          user2_id: c.user_id,
          matched_at: new Date().toISOString(),
          is_super_match: direction === "superlike",
          other: { ...c, primary_photo: primary },
        });
      }
    }
  }

  function handleSwipeLeft() {
    const top = candidates[0];
    if (!top) return;
    setUndoStack((prev) => [top, ...prev.slice(0, 2)]);
    setCandidates((prev) => prev.slice(1));
    recordSwipe(top, "nope");
    Haptics.selectionAsync();
  }

  function handleSwipeRight() {
    const top = candidates[0];
    if (!top) return;
    setUndoStack((prev) => [top, ...prev.slice(0, 2)]);
    setCandidates((prev) => prev.slice(1));
    recordSwipe(top, "like");
  }

  async function handleSuperLike() {
    const top = candidates[0];
    if (!top || !user) return;

    const result = await chargeMatchSuperLike(user.id, top.name);
    if (!result.success) {
      showAlert("Insufficient ACoins", `${result.error}\n\nSuper Likes cost ${MATCH_PRICES.SUPER_LIKE} AC after your 3 free daily ones. Top up your wallet to continue.`, [
        { text: "Top Up Wallet", onPress: () => router.push("/wallet/topup" as any) },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    if (!result.wasFree && result.newBalance !== undefined) {
      setAcoinBalance(result.newBalance);
    }

    setUndoStack((prev) => [top, ...prev.slice(0, 2)]);
    setCandidates((prev) => prev.slice(1));
    recordSwipe(top, "superlike");
    Haptics.impactAsync();
  }

  async function handleBoost() {
    if (!user) return;
    showAlert(
      "Boost Your Profile ⚡",
      `Boost will show your profile to 10× more people for 30 minutes.\n\nCost: ${MATCH_PRICES.BOOST_30MIN} AC\nYour balance: ${acoinBalance} AC`,
      [
        { text: "Cancel", style: "cancel" },
        { text: `Boost for ${MATCH_PRICES.BOOST_30MIN} AC`, onPress: async () => {
          const result = await chargeProfileBoost(user.id);
          if (!result.success) {
            showAlert("Insufficient ACoins", `${result.error}\n\nTop up your AfuChat wallet to use Boost.`, [
              { text: "Top Up Wallet", onPress: () => router.push("/wallet/topup" as any) },
              { text: "Cancel", style: "cancel" },
            ]);
          } else {
            setAcoinBalance(result.newBalance ?? 0);
            showAlert("Boost Active! ⚡", "Your profile is now boosted for 30 minutes. Good luck!");
          }
        }},
      ]
    );
  }

  function handleUndo() {
    if (undoStack.length === 0) { showAlert("No more undos", "You can undo up to 3 recent swipes."); return; }
    const [prev, ...rest] = undoStack;
    setUndoStack(rest);
    setCandidates((prevCards) => [prev, ...prevCards]);
  }

  const displayStack = candidates.slice(0, 3);

  // ── Guard: no profile ──
  if (profileLoading) return (
    <View style={[styles.root, { backgroundColor: isDark ? "#0D0D0D" : "#F2F2F7", alignItems: "center", justifyContent: "center" }]}>
      <ActivityIndicator color={BRAND} size="large" />
    </View>
  );

  if (!myProfile) return (
    <View style={[styles.root, { backgroundColor: isDark ? "#0D0D0D" : "#F2F2F7" }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <LinearGradient colors={[BRAND, "#FF6B6B"]} style={styles.headerLogo}>
            <Ionicons name="heart" size={16} color="#fff" />
          </LinearGradient>
          <Text style={[styles.headerTitle, { color: colors.text }]}>AfuMatch</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <LinearGradient colors={[BRAND, "#FF6B6B"]} style={styles.onboardIcon}>
          <Ionicons name="heart" size={52} color="#fff" />
        </LinearGradient>
        <Text style={[styles.onboardTitle, { color: colors.text }]}>Welcome to AfuMatch</Text>
        <Text style={[styles.onboardSub, { color: colors.textMuted }]}>
          AfuMatch is a completely separate, private dating experience. Create your dating profile to get started — your main AfuChat account is never shared.
        </Text>
        <View style={[styles.onboardFeatures, { backgroundColor: colors.surface }]}>
          {[
            { icon: "lock-closed", text: "Completely separate from your AfuChat profile" },
            { icon: "eye-off", text: "Your dating profile is private by default" },
            { icon: "heart-circle", text: "Match, chat, and connect within AfuMatch" },
          ].map((f) => (
            <View key={f.text} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: BRAND + "18" }]}><Ionicons name={f.icon as any} size={16} color={BRAND} /></View>
              <Text style={[styles.featureText, { color: colors.textSecondary }]}>{f.text}</Text>
            </View>
          ))}
        </View>
        <Pressable style={styles.createProfileBtn} onPress={() => router.push("/match/onboarding" as any)}>
          <Ionicons name="heart" size={18} color="#fff" />
          <Text style={styles.createProfileText}>Create My Dating Profile</Text>
        </Pressable>
      </View>
    </View>
  );

  // ── Guard: paused ──
  if (myProfile.is_paused) return (
    <View style={[styles.root, { backgroundColor: isDark ? "#0D0D0D" : "#F2F2F7" }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}><Ionicons name="arrow-back" size={24} color={colors.text} /></Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <LinearGradient colors={[BRAND, "#FF6B6B"]} style={styles.headerLogo}><Ionicons name="heart" size={16} color="#fff" /></LinearGradient>
          <Text style={[styles.headerTitle, { color: colors.text }]}>AfuMatch</Text>
        </View>
        <Pressable style={styles.headerBtn} onPress={() => router.push("/match/settings" as any)}><Ionicons name="settings-outline" size={22} color={colors.textMuted} /></Pressable>
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <View style={[styles.pausedIcon, { backgroundColor: "#FF950022" }]}><Ionicons name="pause-circle" size={56} color="#FF9500" /></View>
        <Text style={[styles.onboardTitle, { color: colors.text }]}>Discovery is Paused</Text>
        <Text style={[styles.onboardSub, { color: colors.textMuted }]}>Your profile is hidden from discovery. Resume to start matching again.</Text>
        <Pressable style={styles.resumeBtn} onPress={async () => {
          await supabase.from("match_profiles").update({ is_paused: false }).eq("user_id", user?.id ?? "");
          setMyProfile((p: any) => ({ ...p, is_paused: false }));
          fetchCandidates();
        }}>
          <Ionicons name="play" size={16} color="#fff" />
          <Text style={styles.resumeBtnText}>Resume Discovery</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: isDark ? "#0D0D0D" : "#F2F2F7" }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <LinearGradient colors={[BRAND, "#FF6B6B"]} style={styles.headerLogo}>
            <Ionicons name="heart" size={16} color="#fff" />
          </LinearGradient>
          <Text style={[styles.headerTitle, { color: colors.text }]}>AfuMatch</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Pressable
            style={styles.acoinBadge}
            onPress={() => router.push("/wallet" as any)}
            hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
          >
            <Ionicons name="logo-bitcoin" size={13} color="#FFD60A" />
            <Text style={styles.acoinBadgeText}>{acoinBalance}</Text>
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={() => router.push("/match/preferences" as any)} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
            <Ionicons name="options-outline" size={22} color={colors.textMuted} />
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={() => router.push("/match/settings" as any)} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
            <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["discover", "matches"] as const).map((t) => (
          <Pressable key={t} style={styles.tabItem} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, { color: tab === t ? BRAND : colors.textMuted }]}>
              {t === "discover" ? "Discover" : "My Matches"}
            </Text>
            {tab === t && <View style={styles.tabIndicator} />}
          </Pressable>
        ))}
      </View>

      {tab === "matches" ? <MatchesTab /> : (
        <>
          {/* Card area */}
          <View style={styles.cardArea}>
            {loading ? (
              <View style={[styles.card, { width: CARD_W, height: CARD_H, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }]}>
                <ActivityIndicator color={BRAND} size="large" />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>Finding people nearby…</Text>
              </View>
            ) : displayStack.length === 0 ? (
              <View style={[styles.card, { width: CARD_W, height: CARD_H, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: 32 }]}>
                <View style={[styles.emptyIcon, { backgroundColor: BRAND }]}><Ionicons name="search-outline" size={40} color="#fff" /></View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>You've seen everyone!</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>New people join every day. Check back later or adjust your preferences.</Text>
                <Pressable style={styles.refreshBtn} onPress={fetchCandidates}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.refreshBtnText}>Refresh</Text>
                </Pressable>
              </View>
            ) : (
              [...displayStack].reverse().map((c, revIdx) => {
                const idx = displayStack.length - 1 - revIdx;
                const isTop = idx === 0;
                const scale = 1 - idx * 0.04;
                const translateY = idx * 12;
                return (
                  <View key={c.user_id} style={[styles.cardWrapper, !isTop && { transform: [{ scale }, { translateY }] }]}>
                    {isTop ? (
                      <SwipeCard
                        candidate={c}
                        isTop
                        onSwipeLeft={handleSwipeLeft}
                        onSwipeRight={handleSwipeRight}
                        onSuperLike={handleSuperLike}
                        onTap={() => setDetailCandidate(c)}
                      />
                    ) : (
                      <View style={[styles.card, { width: CARD_W, height: CARD_H }]}>
                        {c.photos[0] ? (
                          <Image source={{ uri: c.photos[0].url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        ) : (
                          <LinearGradient colors={["#FF2D55", "#FF6B6B"]} style={StyleSheet.absoluteFill} />
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>

          {/* Action buttons */}
          {!loading && displayStack.length > 0 && (
            <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
              <Pressable style={[styles.actionBtn, styles.undoBtn]} onPress={handleUndo}>
                <Ionicons name="arrow-undo" size={20} color="#FF9500" />
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.nopeBtn]} onPress={handleSwipeLeft}>
                <Ionicons name="close" size={32} color="#FF3B30" />
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.superBtn]} onPress={handleSuperLike}>
                <Ionicons name="star" size={22} color="#007AFF" />
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.likeBtn]} onPress={handleSwipeRight}>
                <Ionicons name="heart" size={28} color={BRAND} />
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.boostBtn]} onPress={handleBoost}>
                <Ionicons name="flash" size={20} color="#AF52DE" />
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* Profile detail modal */}
      {detailCandidate && (
        <CardDetailModal
          candidate={detailCandidate}
          onClose={() => setDetailCandidate(null)}
          onLike={() => { handleSwipeRight(); setDetailCandidate(null); }}
          onNope={() => { handleSwipeLeft(); setDetailCandidate(null); }}
          onSuperLike={() => { handleSuperLike(); setDetailCandidate(null); }}
        />
      )}

      {/* Match modal */}
      {matchResult && (
        <MatchModal
          match={matchResult}
          onClose={() => setMatchResult(null)}
          onMessage={() => { const id = matchResult.id; setMatchResult(null); router.push(`/match/${id}` as any); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 10 },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerLogo: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  acoinBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1C1C1E", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  acoinBadgeText: { color: "#FFD60A", fontSize: 13, fontFamily: "Inter_700Bold" },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  tabIndicator: { position: "absolute", bottom: 0, height: 2, width: "55%", backgroundColor: BRAND, borderRadius: 1 },
  cardArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardWrapper: { position: "absolute", alignItems: "center" },
  card: {
    borderRadius: 20, overflow: "hidden", backgroundColor: "#1C1C1E",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  photoBars: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", gap: 4, zIndex: 5 },
  photoBar: { flex: 1, height: 3, borderRadius: 2 },
  photoTapL: { position: "absolute", left: 0, top: 0, width: "40%", height: "100%", zIndex: 4 },
  photoTapR: { position: "absolute", right: 0, top: 0, width: "40%", height: "100%", zIndex: 4 },
  stampLike: { position: "absolute", top: 52, left: 16, borderWidth: 3, borderColor: "#00C853", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, transform: [{ rotate: "-22deg" }], zIndex: 10 },
  stampLikeText: { color: "#00C853", fontSize: 28, fontFamily: "Inter_700Bold" },
  stampNope: { position: "absolute", top: 52, right: 16, borderWidth: 3, borderColor: "#FF3B30", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, transform: [{ rotate: "22deg" }], zIndex: 10 },
  stampNopeText: { color: "#FF3B30", fontSize: 28, fontFamily: "Inter_700Bold" },
  stampSuper: { position: "absolute", bottom: 120, alignSelf: "center", borderWidth: 3, borderColor: "#007AFF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, zIndex: 10 },
  stampSuperText: { color: "#007AFF", fontSize: 22, fontFamily: "Inter_700Bold" },
  cardOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingTop: 80, paddingHorizontal: 18, paddingBottom: 18 },
  cardInfo: { gap: 5 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardName: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold", flex: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardMeta: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  cardBio: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  interestRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  interestPill: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  interestPillText: { color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" },
  expandHint: { position: "absolute", bottom: 0, right: 0, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12, paddingTop: 8, paddingHorizontal: 20 },
  actionBtn: { alignItems: "center", justifyContent: "center", ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 6 }, android: { elevation: 4 } }) },
  undoBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#FF9500" },
  nopeBtn: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#fff", borderWidth: 2, borderColor: "#FF3B30" },
  superBtn: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#fff", borderWidth: 2, borderColor: "#007AFF" },
  likeBtn: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#fff", borderWidth: 2, borderColor: BRAND },
  boostBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#AF52DE" },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 16 },
  emptyIcon: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 10 },
  emptySub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 20 },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: BRAND, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 22 },
  refreshBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  onboardIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  onboardTitle: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 12 },
  onboardSub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  onboardFeatures: { width: "100%", borderRadius: 16, padding: 16, gap: 14, marginBottom: 28 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  featureText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  createProfileBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: BRAND, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 32, width: "100%" },
  createProfileText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  pausedIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  resumeBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FF9500", borderRadius: 22, paddingHorizontal: 32, paddingVertical: 14 },
  resumeBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  matchRow: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 14, ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 6 }, android: { elevation: 2 } }) },
  matchAvatarWrap: { position: "relative" },
  matchAvatar: { width: 60, height: 60, borderRadius: 30 },
  superDot: { position: "absolute", bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: "#1C1C1E", alignItems: "center", justifyContent: "center" },
  matchName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#1C1C1E" },
  matchLastMsg: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#8E8E93", marginTop: 3 },
  matchMeta: { alignItems: "flex-end", gap: 4 },
  matchTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#C7C7CC" },
});
