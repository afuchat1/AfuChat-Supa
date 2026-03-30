import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
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
import Colors from "@/constants/colors";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { showAlert } from "@/lib/alert";

const { width: SW, height: SH } = Dimensions.get("window");
const CARD_W = Math.min(SW - 32, 420);
const CARD_H = Math.min(SH * 0.62, 580);
const SWIPE_THRESHOLD = CARD_W * 0.26;
const SWIPE_OUT_DURATION = 300;

// ─── Types ───────────────────────────────────────────────────────────────────
type MatchProfile = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  interests: string[] | null;
  current_grade: string | null;
  xp: number;
  acoin: number;
  is_verified: boolean;
  is_organization_verified: boolean;
  date_of_birth: string | null;
  gender: string | null;
};

type MatchRecord = {
  id: string;
  user1_id: string;
  user2_id: string;
  matched_at: string;
  is_super_match: boolean;
  other: MatchProfile;
};

type Gift = {
  id: string;
  name: string;
  emoji: string;
  rarity: string;
  base_xp_cost: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const GRADE_GRADIENTS: Record<string, [string, string]> = {
  Newcomer: ["#8E8E93", "#636366"],
  Explorer: ["#34C759", "#30D158"],
  Achiever: ["#007AFF", "#0A84FF"],
  Champion: ["#AF52DE", "#BF5AF2"],
  Legend: ["#FFD60A", "#FF9F0A"],
  Mythic: ["#FF375F", "#FF6B6B"],
};
function gradeGrad(grade?: string | null): [string, string] {
  return GRADE_GRADIENTS[grade ?? "Newcomer"] ?? ["#8E8E93", "#636366"];
}

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age--;
  return age;
}

const RARITY_COLOR: Record<string, string> = {
  common: "#8E8E93",
  uncommon: Colors.brand,
  rare: "#007AFF",
  epic: "#AF52DE",
  legendary: "#FF9500",
};

// ─── Gift Picker Modal ────────────────────────────────────────────────────────
function GiftPickerModal({
  visible,
  matchId,
  receiverId,
  onClose,
  userAcoin,
}: {
  visible: boolean;
  matchId: string;
  receiverId: string;
  onClose: () => void;
  userAcoin: number;
}) {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    supabase
      .from("gifts")
      .select("id, name, emoji, rarity, base_xp_cost")
      .order("base_xp_cost")
      .limit(20)
      .then(({ data }) => setGifts((data as Gift[]) ?? []));
  }, [visible]);

  async function sendGift(gift: Gift) {
    if (!user) return;
    if ((profile?.acoin ?? 0) < gift.base_xp_cost) {
      showAlert("Not Enough ACoin", `You need ${gift.base_xp_cost} ACoin to send this gift.`);
      return;
    }
    setSending(gift.id);
    // Deduct acoin
    const { error: deductErr } = await supabase
      .from("profiles")
      .update({ acoin: (profile?.acoin ?? 0) - gift.base_xp_cost })
      .eq("id", user.id);
    if (deductErr) { setSending(null); return; }
    // Record match gift
    await supabase.from("match_gifts").insert({
      match_id: matchId,
      sender_id: user.id,
      receiver_id: receiverId,
      gift_id: gift.id,
    });
    // Record acoin transaction
    await supabase.from("acoin_transactions").insert({
      user_id: user.id,
      amount: -gift.base_xp_cost,
      transaction_type: "gift_sent",
      metadata: { match_id: matchId, receiver_id: receiverId, gift_name: gift.name, gift_emoji: gift.emoji },
    });
    await refreshProfile();
    setSending(null);
    showAlert("Gift Sent! 🎁", `You sent ${gift.emoji} ${gift.name} to your match!`);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.giftSheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <View style={styles.giftHandle} />
          <Text style={[styles.giftTitle, { color: colors.text }]}>Send a Gift 🎁</Text>
          <Text style={[styles.giftSub, { color: colors.textMuted }]}>Your balance: {profile?.acoin ?? 0} ACoin</Text>
          <ScrollView contentContainerStyle={styles.giftGrid} showsVerticalScrollIndicator={false}>
            {gifts.map((g) => {
              const canAfford = (profile?.acoin ?? 0) >= g.base_xp_cost;
              return (
                <Pressable
                  key={g.id}
                  style={[styles.giftTile, { backgroundColor: colors.backgroundSecondary, opacity: canAfford ? 1 : 0.5 }]}
                  onPress={() => sendGift(g)}
                  disabled={!!sending}
                >
                  <Text style={{ fontSize: 36 }}>{g.emoji}</Text>
                  <Text style={[styles.giftName, { color: colors.text }]} numberOfLines={1}>{g.name}</Text>
                  <View style={[styles.giftRarity, { backgroundColor: RARITY_COLOR[g.rarity] + "22" }]}>
                    <Text style={[styles.giftRarityText, { color: RARITY_COLOR[g.rarity] }]}>{g.rarity}</Text>
                  </View>
                  <Text style={[styles.giftPrice, { color: Colors.brand }]}>{g.base_xp_cost} ₳</Text>
                  {sending === g.id && (
                    <View style={styles.giftSending}>
                      <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Sending…</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Match Detail Modal ───────────────────────────────────────────────────────
function MatchDetailModal({
  match,
  onClose,
  onChat,
  onSendGift,
}: {
  match: MatchRecord;
  onClose: () => void;
  onChat: () => void;
  onSendGift: () => void;
}) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(0)).current;
  const age = calcAge(match.other.date_of_birth);
  const grad = gradeGrad(match.other.current_grade);

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }).start();
  }, []);

  return (
    <View style={styles.matchOverlay}>
      <Animated.View style={[styles.matchCard, { transform: [{ scale }] }]}>
        {/* Gradient header */}
        <LinearGradient colors={["#FF2D55", "#FF375F", "#FF6B6B"]} style={styles.matchGradient}>
          <View style={styles.matchHeartWrap}>
            <Ionicons name="heart" size={52} color="#fff" />
          </View>
          {match.is_super_match && (
            <View style={styles.superMatchBadge}>
              <Ionicons name="star" size={13} color="#FFD60A" />
              <Text style={styles.superMatchText}>Super Match!</Text>
            </View>
          )}
          <Text style={styles.matchTitle}>It's a Match!</Text>
          <Text style={styles.matchSub}>You and {match.other.display_name ?? match.other.handle} liked each other</Text>
        </LinearGradient>

        {/* Avatar */}
        <View style={styles.matchAvatarRow}>
          <View style={styles.matchAvatarWrap}>
            <Avatar uri={match.other.avatar_url} name={match.other.display_name} size={76} />
          </View>
        </View>

        {/* Info */}
        <View style={[styles.matchInfo, { backgroundColor: colors.surface }]}>
          <View style={styles.matchNameRow}>
            <Text style={[styles.matchName, { color: colors.text }]}>{match.other.display_name ?? match.other.handle}</Text>
            <VerifiedBadge isVerified={match.other.is_verified} isOrganizationVerified={match.other.is_organization_verified} size={16} />
          </View>
          {(age || match.other.country) ? (
            <Text style={[styles.matchMeta, { color: colors.textMuted }]}>
              {[age ? `${age} yrs` : null, match.other.country].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
          <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.matchGradePill}>
            <Text style={styles.matchGradeText}>{match.other.current_grade ?? "Newcomer"}</Text>
          </LinearGradient>

          <View style={styles.matchActions}>
            <Pressable style={styles.matchGiftBtn} onPress={onSendGift}>
              <Ionicons name="gift" size={18} color="#FF2D55" />
              <Text style={styles.matchGiftText}>Send Gift</Text>
            </Pressable>
            <Pressable style={styles.matchChatBtn} onPress={onChat}>
              <Ionicons name="chatbubble" size={16} color="#fff" />
              <Text style={styles.matchChatText}>Message</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={[styles.matchDismiss, { borderTopColor: colors.border }]} onPress={onClose}>
          <Text style={[styles.matchDismissText, { color: colors.textMuted }]}>Keep Swiping</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── Swipe Card ───────────────────────────────────────────────────────────────
function SwipeCard({
  profile,
  isTop,
  onSwipeLeft,
  onSwipeRight,
  onSuperLike,
}: {
  profile: MatchProfile;
  isTop: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSuperLike: () => void;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const age = calcAge(profile.date_of_birth);
  const grad = gradeGrad(profile.current_grade);

  const rotate = pan.x.interpolate({
    inputRange: [-CARD_W / 2, 0, CARD_W / 2],
    outputRange: ["-12deg", "0deg", "12deg"],
    extrapolate: "clamp",
  });
  const likeOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD / 2], outputRange: [0, 1], extrapolate: "clamp" });
  const nopeOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD / 2, 0], outputRange: [1, 0], extrapolate: "clamp" });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => isTop,
        onMoveShouldSetPanResponder: () => isTop,
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          if (g.dx > SWIPE_THRESHOLD) flyOut("right");
          else if (g.dx < -SWIPE_THRESHOLD) flyOut("left");
          else Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        },
      }),
    [isTop]
  );

  function flyOut(dir: "left" | "right") {
    Haptics.impactAsync();
    Animated.timing(pan, {
      toValue: { x: dir === "right" ? SW * 1.5 : -SW * 1.5, y: 0 },
      duration: SWIPE_OUT_DURATION,
      useNativeDriver: true,
    }).start(() => (dir === "right" ? onSwipeRight() : onSwipeLeft()));
  }

  return (
    <Animated.View
      style={[styles.card, { width: CARD_W, height: CARD_H, transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
      {...panResponder.panHandlers}
    >
      {profile.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}

      {/* Stamps */}
      <Animated.View style={[styles.stampLike, { opacity: likeOpacity }]}>
        <Text style={styles.stampLikeText}>LIKE 💚</Text>
      </Animated.View>
      <Animated.View style={[styles.stampNope, { opacity: nopeOpacity }]}>
        <Text style={styles.stampNopeText}>NOPE ✕</Text>
      </Animated.View>

      {/* Info overlay */}
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} style={styles.cardOverlay} pointerEvents="none">
        <View style={styles.cardInfo}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName} numberOfLines={1}>
              {profile.display_name ?? profile.handle ?? "User"}
              {age ? `, ${age}` : ""}
            </Text>
            <VerifiedBadge isVerified={profile.is_verified} isOrganizationVerified={profile.is_organization_verified} size={18} />
          </View>
          {profile.country && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.75)" />
              <Text style={styles.locationText}>{profile.country}</Text>
            </View>
          )}
          {profile.bio ? <Text style={styles.cardBio} numberOfLines={2}>{profile.bio}</Text> : null}
          {profile.interests && profile.interests.length > 0 && (
            <View style={styles.chips}>
              {profile.interests.slice(0, 4).map((t) => (
                <View key={t} style={styles.chip}><Text style={styles.chipText}>{t}</Text></View>
              ))}
            </View>
          )}
          <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradePill}>
            <Text style={styles.gradeText}>{profile.current_grade ?? "Newcomer"}</Text>
          </LinearGradient>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Matches Tab ─────────────────────────────────────────────────────────────
function MatchesTab() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [giftModal, setGiftModal] = useState<{ matchId: string; receiverId: string } | null>(null);

  useEffect(() => {
    loadMatches();
  }, []);

  async function loadMatches() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("match_matches")
      .select("id, user1_id, user2_id, matched_at, is_super_match")
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order("matched_at", { ascending: false });

    if (!data) { setLoading(false); return; }

    const withProfiles = await Promise.all(
      data.map(async (m: any) => {
        const otherId = m.user1_id === user.id ? m.user2_id : m.user1_id;
        const { data: p } = await supabase
          .from("profiles")
          .select("id, display_name, handle, avatar_url, bio, country, current_grade, xp, acoin, is_verified, is_organization_verified, date_of_birth, gender, interests")
          .eq("id", otherId)
          .single();
        return { ...m, other: p };
      })
    );
    setMatches(withProfiles.filter((m) => m.other));
    setLoading(false);
  }

  if (loading) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="heart" size={40} color={colors.border} />
      <Text style={[{ color: colors.textMuted, marginTop: 12, fontFamily: "Inter_400Regular", fontSize: 15 }]}>Loading matches…</Text>
    </View>
  );

  if (matches.length === 0) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
      <LinearGradient colors={["#FF2D55", "#FF375F"]} style={styles.emptyIcon}>
        <Ionicons name="heart-outline" size={40} color="#fff" />
      </LinearGradient>
      <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 16 }]}>No matches yet</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>Keep swiping to find your perfect match!</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
      {matches.map((m) => {
        const age = calcAge(m.other.date_of_birth);
        return (
          <Pressable
            key={m.id}
            style={[styles.matchRow, { backgroundColor: colors.surface }]}
            onPress={() => router.push(`/contact/${m.other.id}` as any)}
          >
            <View style={styles.matchRowAvatarWrap}>
              <Avatar uri={m.other.avatar_url} name={m.other.display_name} size={56} />
              {m.is_super_match && (
                <View style={styles.superBadgeSmall}>
                  <Ionicons name="star" size={10} color="#FFD60A" />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[styles.matchRowName, { color: colors.text }]}>{m.other.display_name ?? m.other.handle}</Text>
                <VerifiedBadge isVerified={m.other.is_verified} isOrganizationVerified={m.other.is_organization_verified} size={14} />
              </View>
              <Text style={[styles.matchRowMeta, { color: colors.textMuted }]}>
                {[age ? `${age} yrs` : null, m.other.country].filter(Boolean).join(" · ")}
              </Text>
              <Text style={[styles.matchRowDate, { color: colors.textMuted }]}>
                Matched {new Date(m.matched_at).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.matchRowActions}>
              <Pressable
                style={[styles.matchRowBtn, { borderColor: "#FF2D55" }]}
                onPress={() => setGiftModal({ matchId: m.id, receiverId: m.other.id })}
              >
                <Ionicons name="gift-outline" size={16} color="#FF2D55" />
              </Pressable>
              <Pressable
                style={[styles.matchRowBtn, { borderColor: Colors.brand }]}
                onPress={() => router.push(`/contact/${m.other.id}` as any)}
              >
                <Ionicons name="chatbubble-outline" size={16} color={Colors.brand} />
              </Pressable>
            </View>
          </Pressable>
        );
      })}
      {giftModal && (
        <GiftPickerModal
          visible
          matchId={giftModal.matchId}
          receiverId={giftModal.receiverId}
          onClose={() => setGiftModal(null)}
          userAcoin={0}
        />
      )}
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MatchScreen() {
  const { colors, isDark } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"swipe" | "matches">("swipe");
  const [candidates, setCandidates] = useState<MatchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchResult, setMatchResult] = useState<MatchRecord | null>(null);
  const [giftForMatch, setGiftForMatch] = useState<{ matchId: string; receiverId: string } | null>(null);

  useEffect(() => { fetchCandidates(); }, []);

  async function fetchCandidates() {
    if (!user) return;
    setLoading(true);

    // Get already swiped IDs
    const { data: swiped } = await supabase
      .from("match_swipes")
      .select("swiped_id")
      .eq("swiper_id", user.id);
    const swipedIds = (swiped ?? []).map((s: any) => s.swiped_id);

    let query = supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, country, interests, current_grade, xp, acoin, is_verified, is_organization_verified, date_of_birth, gender")
      .neq("id", user.id)
      .eq("match_visible", true)
      .limit(50);

    if (swipedIds.length > 0) {
      query = query.not("id", "in", `(${swipedIds.join(",")})`);
    }

    const { data } = await query;
    setCandidates((data as MatchProfile[]) ?? []);
    setLoading(false);
  }

  async function recordSwipe(profileId: string, direction: "like" | "nope" | "superlike") {
    if (!user) return;
    await supabase.from("match_swipes").upsert(
      { swiper_id: user.id, swiped_id: profileId, direction },
      { onConflict: "swiper_id,swiped_id" }
    );

    if (direction !== "nope") {
      // Check for mutual match using the DB function
      const { data } = await supabase.rpc("check_mutual_match", {
        p_swiper: user.id,
        p_swiped: profileId,
        p_direction: direction,
      });
      if (data) {
        // It's a match — fetch the other profile
        const { data: otherProfile } = await supabase
          .from("profiles")
          .select("id, display_name, handle, avatar_url, bio, country, current_grade, xp, acoin, is_verified, is_organization_verified, date_of_birth, gender, interests")
          .eq("id", profileId)
          .single();
        if (otherProfile) {
          Haptics.impactAsync();
          setMatchResult({
            id: data,
            user1_id: user.id,
            user2_id: profileId,
            matched_at: new Date().toISOString(),
            is_super_match: direction === "superlike",
            other: otherProfile as MatchProfile,
          });
        }
      }
    }
  }

  function handleSwipeLeft() {
    const top = candidates[0];
    if (top) recordSwipe(top.id, "nope");
    setCandidates((prev) => prev.slice(1));
    Haptics.selectionAsync();
  }

  function handleSwipeRight() {
    const top = candidates[0];
    if (top) recordSwipe(top.id, "like");
    setCandidates((prev) => prev.slice(1));
  }

  function handleSuperLike() {
    const top = candidates[0];
    if (top) recordSwipe(top.id, "superlike");
    setCandidates((prev) => prev.slice(1));
    Haptics.impactAsync();
  }

  const displayStack = candidates.slice(0, 3);

  return (
    <View style={[styles.root, { backgroundColor: isDark ? "#0D0D0D" : "#F2F2F7" }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <LinearGradient colors={["#FF2D55", "#FF375F"]} style={styles.headerIcon}>
            <Ionicons name="heart" size={16} color="#fff" />
          </LinearGradient>
          <Text style={[styles.headerTitle, { color: colors.text }]}>AfuMatch</Text>
        </View>
        <Pressable style={styles.headerBtn} onPress={() => router.push("/match/preferences" as any)} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
          <Ionicons name="options-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["swipe", "matches"] as const).map((t) => (
          <Pressable key={t} style={styles.tabItem} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, { color: tab === t ? "#FF2D55" : colors.textMuted }]}>
              {t === "swipe" ? "Discover" : "My Matches"}
            </Text>
            {tab === t && <View style={styles.tabIndicator} />}
          </Pressable>
        ))}
      </View>

      {tab === "matches" ? (
        <MatchesTab />
      ) : (
        <>
          {/* Card area */}
          <View style={styles.cardArea}>
            {loading ? (
              <View style={[styles.card, { width: CARD_W, height: CARD_H, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }]}>
                <LinearGradient colors={["#FF2D55", "#FF375F"]} style={styles.loadingIcon}>
                  <Ionicons name="heart" size={40} color="#fff" />
                </LinearGradient>
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>Finding people…</Text>
              </View>
            ) : displayStack.length === 0 ? (
              <View style={[styles.card, { width: CARD_W, height: CARD_H, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: 32 }]}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="search-outline" size={40} color="#fff" />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>You've seen everyone!</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>Come back later or adjust your preferences.</Text>
                <Pressable style={styles.refreshBtn} onPress={fetchCandidates}>
                  <Ionicons name="refresh" size={18} color="#fff" />
                  <Text style={styles.refreshBtnText}>Refresh</Text>
                </Pressable>
              </View>
            ) : (
              [...displayStack].reverse().map((p, revIdx) => {
                const idx = displayStack.length - 1 - revIdx;
                const isTop = idx === 0;
                const scale = 1 - idx * 0.04;
                const translateY = idx * 12;
                return (
                  <Animated.View
                    key={p.id}
                    style={[styles.cardWrapper, !isTop && { transform: [{ scale }, { translateY }] }]}
                  >
                    {isTop ? (
                      <SwipeCard
                        profile={p}
                        isTop
                        onSwipeLeft={handleSwipeLeft}
                        onSwipeRight={handleSwipeRight}
                        onSuperLike={handleSuperLike}
                      />
                    ) : (
                      <View style={[styles.card, { width: CARD_W, height: CARD_H }]}>
                        {p.avatar_url ? (
                          <Image source={{ uri: p.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        ) : (
                          <LinearGradient colors={gradeGrad(p.current_grade)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        )}
                      </View>
                    )}
                  </Animated.View>
                );
              })
            )}
          </View>

          {/* Action buttons */}
          {!loading && displayStack.length > 0 && (
            <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
              <Pressable style={[styles.actionBtn, styles.nopeBtn]} onPress={handleSwipeLeft}>
                <Ionicons name="close" size={30} color="#FF3B30" />
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.superBtn]} onPress={handleSuperLike}>
                <Ionicons name="star" size={22} color="#007AFF" />
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.likeBtn]} onPress={handleSwipeRight}>
                <Ionicons name="heart" size={28} color="#FF2D55" />
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* Match modal */}
      {matchResult && (
        <MatchDetailModal
          match={matchResult}
          onClose={() => setMatchResult(null)}
          onChat={() => { setMatchResult(null); router.push(`/contact/${matchResult.other.id}` as any); }}
          onSendGift={() => {
            const m = matchResult;
            setMatchResult(null);
            setGiftForMatch({ matchId: m.id, receiverId: m.other.id });
          }}
        />
      )}

      {giftForMatch && (
        <GiftPickerModal
          visible
          matchId={giftForMatch.matchId}
          receiverId={giftForMatch.receiverId}
          onClose={() => setGiftForMatch(null)}
          userAcoin={profile?.acoin ?? 0}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  tabIndicator: { position: "absolute", bottom: 0, height: 2, width: "60%", backgroundColor: "#FF2D55", borderRadius: 1 },
  cardArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardWrapper: { position: "absolute", alignItems: "center" },
  card: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#1C1C1E",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  stampLike: {
    position: "absolute", top: 40, left: 20,
    borderWidth: 3, borderColor: "#00C853", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 4,
    transform: [{ rotate: "-22deg" }],
  },
  stampLikeText: { color: "#00C853", fontSize: 26, fontFamily: "Inter_700Bold" },
  stampNope: {
    position: "absolute", top: 40, right: 20,
    borderWidth: 3, borderColor: "#FF3B30", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 4,
    transform: [{ rotate: "22deg" }],
  },
  stampNopeText: { color: "#FF3B30", fontSize: 26, fontFamily: "Inter_700Bold" },
  cardOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    paddingTop: 80, paddingHorizontal: 20, paddingBottom: 20,
  },
  cardInfo: { gap: 6 },
  cardNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardName: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold", flex: 1 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_400Regular" },
  cardBio: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  chipText: { color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" },
  gradePill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  gradeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    paddingTop: 12,
    paddingHorizontal: 32,
  },
  actionBtn: {
    alignItems: "center", justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  nopeBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#fff", borderWidth: 2, borderColor: "#FF3B30" },
  superBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#fff", borderWidth: 2, borderColor: "#007AFF" },
  likeBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#fff", borderWidth: 2, borderColor: "#FF2D55" },
  loadingIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  loadingText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#FF2D55", marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginTop: 8 },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FF2D55", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 16 },
  refreshBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  // Match modal
  matchOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", zIndex: 100 },
  matchCard: {
    width: Math.min(SW - 48, 380), borderRadius: 28, backgroundColor: "#fff", overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.4, shadowRadius: 30 },
      android: { elevation: 20 },
    }),
  },
  matchGradient: { alignItems: "center", paddingTop: 28, paddingHorizontal: 24, paddingBottom: 20, gap: 6 },
  matchHeartWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  superMatchBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  superMatchText: { color: "#FFD60A", fontSize: 12, fontFamily: "Inter_700Bold" },
  matchTitle: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold" },
  matchSub: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  matchAvatarRow: { flexDirection: "row", justifyContent: "center", marginTop: -38, paddingBottom: 8 },
  matchAvatarWrap: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: "#fff", overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  matchInfo: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 },
  matchNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  matchName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  matchMeta: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 8 },
  matchGradePill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 16 },
  matchGradeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  matchActions: { flexDirection: "row", gap: 10 },
  matchGiftBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderColor: "#FF2D55", borderRadius: 14, paddingVertical: 12,
  },
  matchGiftText: { color: "#FF2D55", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  matchChatBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#FF2D55", borderRadius: 14, paddingVertical: 12,
  },
  matchChatText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  matchDismiss: { paddingVertical: 14, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth },
  matchDismissText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  // Gift modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  giftSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingBottom: 40, maxHeight: SH * 0.7 },
  giftHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#C7C7CC", alignSelf: "center", marginBottom: 16 },
  giftTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 4 },
  giftSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 16 },
  giftGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 10 },
  giftTile: {
    width: (SW - 52) / 3, alignItems: "center", borderRadius: 16, padding: 12, gap: 4, position: "relative",
  },
  giftName: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  giftRarity: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  giftRarityText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  giftPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },
  giftSending: {
    ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  // Matches list
  matchRow: {
    flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 14, gap: 12,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  matchRowAvatarWrap: { position: "relative" },
  superBadgeSmall: {
    position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#1C1C1E", alignItems: "center", justifyContent: "center",
  },
  matchRowName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  matchRowMeta: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  matchRowDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  matchRowActions: { flexDirection: "row", gap: 8 },
  matchRowBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
});
