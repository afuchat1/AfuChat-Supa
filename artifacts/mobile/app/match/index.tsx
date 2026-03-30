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
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = Math.min(SCREEN_W - 32, 420);
const CARD_H = Math.min(SCREEN_H * 0.62, 560);
const SWIPE_THRESHOLD = CARD_W * 0.28;
const SWIPE_OUT_DURATION = 320;

type MatchProfile = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  interests: string[] | null;
  current_grade: string | null;
  acoin: number;
  xp: number;
  is_verified: boolean;
};

const GRADE_COLORS: Record<string, [string, string]> = {
  Newcomer:  ["#8E8E93", "#636366"],
  Explorer:  ["#34C759", "#30D158"],
  Achiever:  ["#007AFF", "#0A84FF"],
  Champion:  ["#AF52DE", "#BF5AF2"],
  Legend:    ["#FFD60A", "#FF9F0A"],
  Mythic:    ["#FF375F", "#FF6B6B"],
};

function gradeGradient(grade?: string | null): [string, string] {
  return GRADE_COLORS[grade || "Newcomer"] ?? ["#8E8E93", "#636366"];
}

type ActionState = "none" | "like" | "nope" | "super";

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
  const { colors } = useTheme();
  const pan = useRef(new Animated.ValueXY()).current;
  const [action, setAction] = useState<ActionState>("none");

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
        onPanResponderMove: (_, g) => {
          pan.setValue({ x: g.dx, y: g.dy });
          if (g.dx > SWIPE_THRESHOLD / 2) setAction("like");
          else if (g.dx < -SWIPE_THRESHOLD / 2) setAction("nope");
          else setAction("none");
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx > SWIPE_THRESHOLD) {
            flyOut("right");
          } else if (g.dx < -SWIPE_THRESHOLD) {
            flyOut("left");
          } else {
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
            setAction("none");
          }
        },
      }),
    [isTop]
  );

  function flyOut(direction: "left" | "right") {
    const toX = direction === "right" ? SCREEN_W * 1.5 : -SCREEN_W * 1.5;
    Haptics.impactAsync();
    Animated.timing(pan, {
      toValue: { x: toX, y: 0 },
      duration: SWIPE_OUT_DURATION,
      useNativeDriver: true,
    }).start(() => {
      if (direction === "right") onSwipeRight();
      else onSwipeLeft();
    });
  }

  const gradient = gradeGradient(profile.current_grade);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          width: CARD_W,
          height: CARD_H,
          transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {profile.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}

      {/* Like label */}
      <Animated.View style={[styles.stampLike, { opacity: likeOpacity }]}>
        <Text style={styles.stampLikeText}>LIKE</Text>
      </Animated.View>

      {/* Nope label */}
      <Animated.View style={[styles.stampNope, { opacity: nopeOpacity }]}>
        <Text style={styles.stampNopeText}>NOPE</Text>
      </Animated.View>

      {/* Bottom info overlay */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        style={styles.cardOverlay}
        pointerEvents="none"
      >
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.cardName} numberOfLines={1}>
              {profile.display_name || profile.handle || "User"}
            </Text>
            {profile.is_verified && (
              <Ionicons name="checkmark-circle" size={20} color={Colors.brand} />
            )}
          </View>
          {profile.country && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.75)" />
              <Text style={styles.locationText}>{profile.country}</Text>
            </View>
          )}
          {profile.bio ? (
            <Text style={styles.cardBio} numberOfLines={2}>{profile.bio}</Text>
          ) : null}
          {profile.interests && profile.interests.length > 0 && (
            <View style={styles.chips}>
              {profile.interests.slice(0, 4).map((interest) => (
                <View key={interest} style={styles.chip}>
                  <Text style={styles.chipText}>{interest}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.gradeRow}>
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradePill}>
              <Text style={styles.gradeText}>{profile.current_grade || "Newcomer"}</Text>
            </LinearGradient>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.emptyContainer, { backgroundColor: colors.backgroundSecondary }]}>
      <LinearGradient colors={["#FF2D55", "#FF375F", "#FF6B6B"]} style={styles.emptyIcon}>
        <Ionicons name="heart-dislike" size={40} color="#fff" />
      </LinearGradient>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>You've seen everyone!</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        Check back later when more people join, or refresh to start over.
      </Text>
      <Pressable style={styles.refreshBtn} onPress={onRefresh}>
        <Ionicons name="refresh" size={18} color="#fff" />
        <Text style={styles.refreshBtnText}>Start Over</Text>
      </Pressable>
    </View>
  );
}

function MatchModal({ profile, onClose, onChat }: { profile: MatchProfile; onClose: () => void; onChat: () => void }) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }).start();
  }, []);
  const gradient = gradeGradient(profile.current_grade);

  return (
    <View style={styles.matchOverlay}>
      <Animated.View style={[styles.matchCard, { transform: [{ scale }] }]}>
        <LinearGradient colors={["#FF2D55", "#FF375F"]} style={styles.matchGradient}>
          <Ionicons name="heart" size={48} color="#fff" />
          <Text style={styles.matchTitle}>It's a Match!</Text>
          <Text style={styles.matchSub}>You and {profile.display_name || profile.handle} liked each other</Text>
        </LinearGradient>

        <View style={styles.matchAvatarRow}>
          <View style={styles.matchAvatarWrap}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.matchAvatar} />
            ) : (
              <LinearGradient colors={gradient} style={styles.matchAvatar} />
            )}
          </View>
        </View>

        <View style={styles.matchActions}>
          <Pressable style={[styles.matchBtn, styles.matchBtnOutline]} onPress={onClose}>
            <Text style={styles.matchBtnOutlineText}>Keep Swiping</Text>
          </Pressable>
          <Pressable style={[styles.matchBtn, styles.matchBtnFilled]} onPress={onChat}>
            <Ionicons name="chatbubble" size={16} color="#fff" />
            <Text style={styles.matchBtnFilledText}>Send Message</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const SWIPES_KEY = "match_swipes_v1";

export default function MatchScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [profiles, setProfiles] = useState<MatchProfile[]>([]);
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [matchedProfile, setMatchedProfile] = useState<MatchProfile | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const topCardRef = useRef<any>(null);

  useEffect(() => {
    loadSwipes().then(() => fetchProfiles());
  }, []);

  async function loadSwipes() {
    const raw = await AsyncStorage.getItem(SWIPES_KEY);
    if (raw) {
      const ids: string[] = JSON.parse(raw);
      setSwipedIds(new Set(ids));
    }
  }

  async function saveSwipe(profileId: string) {
    const next = new Set(swipedIds).add(profileId);
    setSwipedIds(next);
    await AsyncStorage.setItem(SWIPES_KEY, JSON.stringify([...next]));
  }

  async function fetchProfiles() {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, country, interests, current_grade, acoin, xp, is_verified")
      .neq("id", user?.id || "")
      .limit(50);
    if (data) setProfiles(data as MatchProfile[]);
    setLoading(false);
  }

  const queue = useMemo(
    () => profiles.filter((p) => !swipedIds.has(p.id)),
    [profiles, swipedIds]
  );

  function handleSwipeLeft() {
    const profile = queue[0];
    if (profile) { saveSwipe(profile.id); Haptics.selectionAsync(); }
    setCurrentIdx((i) => i + 1);
  }

  function handleSwipeRight() {
    const profile = queue[0];
    if (!profile) return;
    saveSwipe(profile.id);
    Haptics.impactAsync();
    const isMatch = Math.random() < 0.3;
    if (isMatch) {
      setMatchedProfile(profile);
    }
    setCurrentIdx((i) => i + 1);
  }

  function handleSuperLike() {
    const profile = queue[0];
    if (!profile) return;
    saveSwipe(profile.id);
    Haptics.impactAsync();
    setMatchedProfile(profile);
    setCurrentIdx((i) => i + 1);
  }

  function handleReset() {
    AsyncStorage.removeItem(SWIPES_KEY);
    setSwipedIds(new Set());
    setCurrentIdx(0);
    fetchProfiles();
  }

  function handleStartChat(profile: MatchProfile) {
    setMatchedProfile(null);
    router.push(`/contact/${profile.id}` as any);
  }

  const displayQueue = queue.slice(0, 3);

  return (
    <View style={[styles.root, { backgroundColor: isDark ? "#0D0D0D" : "#F5F5F5" }]}>
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
        <Pressable style={styles.headerBtn} onPress={handleReset} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
          <Ionicons name="refresh-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Card stack */}
      <View style={styles.cardArea}>
        {loading ? (
          <View style={[styles.card, { width: CARD_W, height: CARD_H, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="heart" size={48} color={colors.border} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Finding people…</Text>
          </View>
        ) : displayQueue.length === 0 ? (
          <EmptyState onRefresh={handleReset} />
        ) : (
          <>
            {[...displayQueue].reverse().map((profile, revIdx) => {
              const idx = displayQueue.length - 1 - revIdx;
              const isTop = idx === 0;
              const scale = 1 - (idx * 0.04);
              const translateY = idx * 12;
              return (
                <Animated.View
                  key={profile.id}
                  style={[
                    styles.cardWrapper,
                    !isTop && { transform: [{ scale }, { translateY }] },
                  ]}
                >
                  {isTop ? (
                    <SwipeCard
                      profile={profile}
                      isTop
                      onSwipeLeft={handleSwipeLeft}
                      onSwipeRight={handleSwipeRight}
                      onSuperLike={handleSuperLike}
                    />
                  ) : (
                    <View style={[styles.card, { width: CARD_W, height: CARD_H }]}>
                      {profile.avatar_url ? (
                        <Image source={{ uri: profile.avatar_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      ) : (
                        <LinearGradient colors={gradeGradient(profile.current_grade)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      )}
                    </View>
                  )}
                </Animated.View>
              );
            })}
          </>
        )}
      </View>

      {/* Action buttons */}
      {!loading && displayQueue.length > 0 && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnNope]}
            onPress={handleSwipeLeft}
          >
            <Ionicons name="close" size={28} color="#FF3B30" />
          </Pressable>

          <Pressable
            style={[styles.actionBtn, styles.actionBtnSuper]}
            onPress={handleSuperLike}
          >
            <Ionicons name="star" size={22} color="#007AFF" />
          </Pressable>

          <Pressable
            style={[styles.actionBtn, styles.actionBtnLike]}
            onPress={handleSwipeRight}
          >
            <Ionicons name="heart" size={28} color="#FF2D55" />
          </Pressable>
        </View>
      )}

      {/* Match modal */}
      {matchedProfile && (
        <MatchModal
          profile={matchedProfile}
          onClose={() => setMatchedProfile(null)}
          onChat={() => handleStartChat(matchedProfile)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  cardArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardWrapper: {
    position: "absolute",
    alignItems: "center",
  },
  card: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#1C1C1E",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  stampLike: {
    position: "absolute",
    top: 40,
    left: 24,
    borderWidth: 3,
    borderColor: "#00C853",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    transform: [{ rotate: "-22deg" }],
  },
  stampLikeText: { color: "#00C853", fontSize: 28, fontFamily: "Inter_700Bold" },
  stampNope: {
    position: "absolute",
    top: 40,
    right: 24,
    borderWidth: 3,
    borderColor: "#FF3B30",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    transform: [{ rotate: "22deg" }],
  },
  stampNopeText: { color: "#FF3B30", fontSize: 28, fontFamily: "Inter_700Bold" },
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  cardInfo: { gap: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardName: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold", flex: 1 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_400Regular" },
  cardBio: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  chipText: { color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" },
  gradeRow: { marginTop: 4 },
  gradePill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  gradeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    paddingTop: 16,
    paddingHorizontal: 32,
  },
  actionBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  actionBtnNope: { backgroundColor: "#fff", borderWidth: 2, borderColor: "#FF3B30" },
  actionBtnSuper: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#fff", borderWidth: 2, borderColor: "#007AFF" },
  actionBtnLike: { backgroundColor: "#fff", borderWidth: 2, borderColor: "#FF2D55" },
  loadingText: { marginTop: 16, fontSize: 16, fontFamily: "Inter_400Regular" },
  emptyContainer: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FF2D55",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 4,
  },
  refreshBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  matchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  matchCard: {
    width: Math.min(SCREEN_W - 48, 380),
    borderRadius: 28,
    backgroundColor: "#fff",
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.4, shadowRadius: 30 },
      android: { elevation: 20 },
    }),
  },
  matchGradient: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 24, gap: 8 },
  matchTitle: { color: "#fff", fontSize: 32, fontFamily: "Inter_700Bold" },
  matchSub: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  matchAvatarRow: { flexDirection: "row", justifyContent: "center", marginTop: -32, paddingBottom: 16 },
  matchAvatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#fff",
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  matchAvatar: { width: "100%", height: "100%" },
  matchActions: { flexDirection: "row", padding: 16, gap: 12 },
  matchBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  matchBtnOutline: { borderWidth: 1.5, borderColor: "#E5E5EA" },
  matchBtnOutlineText: { color: "#1C1C1E", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  matchBtnFilled: { backgroundColor: "#FF2D55" },
  matchBtnFilledText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
