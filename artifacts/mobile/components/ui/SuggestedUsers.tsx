/**
 * SuggestedUsers — horizontal "People you may know" strip.
 *
 * Surfaces in:
 *  • Discover → For You feed header (after 3-ish posts)
 *  • Chat home → above the story bar (for users with few chats)
 *
 * Algorithm:
 *  1. Load current user's interests + who they already follow.
 *  2. Query profiles that share at least one interest, ordered by XP.
 *     Falls back to top-XP users when the user has no interests set.
 *  3. Exclude self + already-following + previously dismissed cards.
 *  4. Score by overlap count + XP + verified status, then shuffle
 *     the top pool so every session feels fresh.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useHorizontalScrollLock } from "@/context/TabSwipeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import * as Haptics from "@/lib/haptics";

// ─── Types ────────────────────────────────────────────────────────────────────
type SuggestedUser = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  xp: number;
  is_verified: boolean;
  interests: string[];
  bio: string | null;
  sharedCount: number;
};

const DISMISSED_KEY = "suggested_users_dismissed_v1";
const MAX_DISMISSED  = 200;
const CARD_WIDTH     = 148;
const POOL_SIZE      = 40;
const DISPLAY_SIZE   = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function loadDismissed(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

async function saveDismissed(set: Set<string>) {
  try {
    const arr = Array.from(set).slice(-MAX_DISMISSED);
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
  } catch {}
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── User Card ────────────────────────────────────────────────────────────────
function UserCard({
  user,
  isFollowing,
  onFollow,
  onDismiss,
  accent,
  colors,
}: {
  user: SuggestedUser;
  isFollowing: boolean;
  onFollow: (id: string) => void;
  onDismiss: (id: string) => void;
  accent: string;
  colors: any;
}) {
  const [localFollow, setLocalFollow] = useState(isFollowing);
  const [loading, setLoading] = useState(false);

  async function handleFollow() {
    if (localFollow) return;
    Haptics.selectionAsync();
    setLoading(true);
    setLocalFollow(true);
    await onFollow(user.id);
    setLoading(false);
  }

  const initials = (user.display_name || "?")
    .split(" ")
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const hue = user.display_name
    ? user.display_name.charCodeAt(0) * 37 % 360
    : 200;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => router.push({ pathname: "/[handle]", params: { handle: user.handle } })}
      activeOpacity={0.85}
    >
      {/* Dismiss */}
      <TouchableOpacity
        style={[styles.dismissBtn, { backgroundColor: colors.backgroundTertiary }]}
        onPress={() => onDismiss(user.id)}
        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
      >
        <Ionicons name="close" size={11} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Avatar */}
      <View style={styles.avatarWrap}>
        {user.avatar_url ? (
          <ExpoImage
            source={{ uri: user.avatar_url }}
            style={styles.avatarImg}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: `hsl(${hue},55%,52%)` }]}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}
        {user.is_verified && (
          <View style={[styles.verifiedDot, { backgroundColor: accent }]}>
            <Ionicons name="checkmark" size={8} color="#fff" />
          </View>
        )}
      </View>

      {/* Name */}
      <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
        {user.display_name}
      </Text>
      <Text style={[styles.cardHandle, { color: colors.textMuted }]} numberOfLines={1}>
        @{user.handle}
      </Text>

      {/* Shared interests badge — only shown when there is a real match */}
      {user.sharedCount > 0 && (
        <View style={[styles.interestBadge, { backgroundColor: accent + "18" }]}>
          <Ionicons name="people-outline" size={10} color={accent} />
          <Text style={[styles.interestBadgeText, { color: accent }]}>
            {user.sharedCount} shared interest{user.sharedCount > 1 ? "s" : ""}
          </Text>
        </View>
      )}

      {/* Follow button */}
      <TouchableOpacity
        style={[styles.followBtn, {
          backgroundColor: localFollow ? colors.backgroundTertiary : accent,
          borderColor: localFollow ? colors.border : accent,
        }]}
        onPress={handleFollow}
        disabled={localFollow || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator size="small" color={localFollow ? colors.textMuted : "#fff"} />
        ) : (
          <Text style={[styles.followBtnText, { color: localFollow ? colors.textMuted : "#fff" }]}>
            {localFollow ? "Following" : "Follow"}
          </Text>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function SuggestedUsers({
  maxCards = DISPLAY_SIZE,
  compact = false,
}: {
  maxCards?: number;
  compact?: boolean;
}) {
  const { user, profile } = useAuth();
  const { colors, accent } = useTheme();
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);

    const [dis, followRes] = await Promise.all([
      loadDismissed(),
      supabase.from("follows").select("following_id").eq("follower_id", user.id),
    ]);

    if (!mountedRef.current) return;

    const followingIds = (followRes.data || []).map((f: any) => f.following_id as string);
    const followingSetLocal = new Set(followingIds);
    const excludeIds = new Set([user.id, ...followingIds, ...dis]);
    const userInterests: string[] = profile?.interests || [];

    // Build query — overlap interests when possible, fall back to top XP
    let q = supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, xp, is_verified, interests, bio")
      .neq("id", user.id)
      .order("xp", { ascending: false })
      .limit(POOL_SIZE);

    if (userInterests.length > 0) {
      q = (q as any).overlaps("interests", userInterests);
    }

    const { data } = await q;
    if (!mountedRef.current) return;

    // Filter out excluded IDs + score
    const candidates = (data || [])
      .filter((u: any) => !excludeIds.has(u.id))
      .map((u: any) => {
        const interests: string[] = u.interests || [];
        const sharedCount = interests.filter(i => userInterests.includes(i)).length;
        const score =
          sharedCount * 12 +
          Math.min((u.xp || 0) / 500, 25) +
          (u.is_verified ? 8 : 0);
        return { ...u, interests, sharedCount, score } as SuggestedUser & { score: number };
      })
      .sort((a: any, b: any) => b.score - a.score);

    // Shuffle top pool for variety
    const pool = shuffle(candidates.slice(0, Math.min(POOL_SIZE, candidates.length)));

    // If we got nothing with interests, fall back to top users globally
    if (pool.length === 0 && userInterests.length > 0) {
      const { data: fallback } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, xp, is_verified, interests, bio")
        .neq("id", user.id)
        .order("xp", { ascending: false })
        .limit(POOL_SIZE);

      if (!mountedRef.current) return;
      const fallbackFiltered = (fallback || [])
        .filter((u: any) => !excludeIds.has(u.id))
        .map((u: any) => ({ ...u, interests: u.interests || [], sharedCount: 0 } as SuggestedUser));
      setUsers(shuffle(fallbackFiltered).slice(0, maxCards));
    } else {
      setUsers(pool.slice(0, maxCards));
    }

    setFollowingSet(followingSetLocal);
    setDismissed(dis);
    setLoading(false);
  }, [user, profile?.interests, maxCards]);

  useEffect(() => { load(); }, [load]);

  // Re-shuffle on each mount so the cards feel fresh
  useEffect(() => {
    setUsers(prev => shuffle(prev));
  }, []);

  async function handleFollow(targetId: string) {
    if (!user) return;
    setFollowingSet(prev => new Set([...prev, targetId]));
    await supabase.from("follows").upsert({
      follower_id: user.id,
      following_id: targetId,
    }, { onConflict: "follower_id,following_id" });
  }

  async function handleDismiss(targetId: string) {
    Haptics.selectionAsync();
    setUsers(prev => prev.filter(u => u.id !== targetId));
    const next = new Set([...dismissed, targetId]);
    setDismissed(next);
    await saveDismissed(next);
  }

  const horizontalScrollActive = useHorizontalScrollLock();

  // Don't render until loaded; hide if no results
  if (!user) return null;
  if (loading) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <SectionHeader compact={compact} colors={colors} accent={accent} loading />
        <View style={styles.skeletonRow}>
          {[1, 2, 3].map(i => (
            <View key={i} style={[styles.skeletonCard, { backgroundColor: colors.surface }]} />
          ))}
        </View>
      </View>
    );
  }
  if (users.length === 0) return null;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <SectionHeader compact={compact} colors={colors} accent={accent} loading={false} />
      <FlatList
        data={users}
        keyExtractor={u => u.id}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        onScrollBeginDrag={() => { horizontalScrollActive.value = true; }}
        onScrollEndDrag={() => { horizontalScrollActive.value = false; }}
        onMomentumScrollEnd={() => { horizontalScrollActive.value = false; }}
        renderItem={({ item }) => (
          <UserCard
            user={item}
            isFollowing={followingSet.has(item.id)}
            onFollow={handleFollow}
            onDismiss={handleDismiss}
            accent={accent}
            colors={colors}
          />
        )}
      />
    </View>
  );
}

function SectionHeader({ compact, colors, accent, loading }: {
  compact: boolean; colors: any; accent: string; loading: boolean;
}) {
  return (
    <View style={[styles.sectionHeader, compact && { paddingHorizontal: 12 }]}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name="people" size={16} color={accent} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>People you may know</Text>
        {loading && <ActivityIndicator size="small" color={colors.textMuted} style={{ marginLeft: 6 }} />}
      </View>
      <TouchableOpacity onPress={() => router.push("/user-discovery")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={[styles.seeAll, { color: accent }]}>See all</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  containerCompact: {
    paddingTop: 8,
    paddingBottom: 0,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  seeAll: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },

  // Card
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  dismissBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarWrap: { position: "relative", marginBottom: 2 },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
  },
  avatarInitials: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  verifiedDot: {
    position: "absolute", bottom: 0, right: 0,
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },

  cardName: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center", width: "100%" },
  cardHandle: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", width: "100%", marginTop: -2 },

  interestBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 2,
  },
  interestBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium" },

  followBtn: {
    width: "100%",
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    minHeight: 34,
  },
  followBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Skeleton
  skeletonRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16 },
  skeletonCard: {
    width: CARD_WIDTH,
    height: 190,
    borderRadius: 16,
    opacity: 0.4,
  },
});
