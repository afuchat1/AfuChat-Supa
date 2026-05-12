/**
 * SuggestedUsers — horizontal "People you may know" strip.
 *
 * Surfaces in:
 *  • Discover → For You feed header (after 3-ish posts)
 *  • Chat home → above the story bar (for users with few chats)
 *
 * Algorithm (3 signals, merged + scored):
 *  1. Friends-of-friends — if you follow A and A follows B, surface B.
 *     mutualCount = how many of your follows also follow this person.
 *  2. Shared interests — profiles that overlap with your interests, by XP.
 *  3. Top XP fallback — when the user has no interests and no follows.
 *
 *  Score = mutualCount × 18 + sharedInterests × 12 + xp/500 (capped 25) + verified × 8
 *  Top pool is shuffled so every session feels fresh.
 *  Already-following and dismissed cards are always excluded.
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
  mutualCount: number;
  mutualHandle: string | null;
};

const DISMISSED_KEY = "suggested_users_dismissed_v1";
const MAX_DISMISSED  = 200;
const CARD_WIDTH     = 148;
const POOL_SIZE      = 40;
const DISPLAY_SIZE   = 12;
const FOF_FOLLOWING_LIMIT = 60;

// ─── Module-level result cache (survives tab switches, expires after 5 min) ───
type CachedResult = {
  users: SuggestedUser[];
  followingSet: Set<string>;
  followersSet: Set<string>;
  dismissed: Set<string>;
  userId: string;
  expiresAt: number;
};
let _cachedResult: CachedResult | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

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
  theyFollowMe,
  onFollow,
  onDismiss,
  accent,
  colors,
}: {
  user: SuggestedUser;
  isFollowing: boolean;
  theyFollowMe: boolean;
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

  const MUTUAL_COLOR = "#FF9500";

  const badgeLabel = (() => {
    if (user.mutualCount > 0 && user.mutualHandle) {
      if (user.mutualCount === 1) return `@${user.mutualHandle} follows them`;
      return `@${user.mutualHandle} +${user.mutualCount - 1} follow them`;
    }
    if (user.mutualCount > 0) {
      return `${user.mutualCount} mutual connection${user.mutualCount > 1 ? "s" : ""}`;
    }
    if (user.sharedCount > 0) {
      return `${user.sharedCount} shared interest${user.sharedCount > 1 ? "s" : ""}`;
    }
    return null;
  })();

  const badgeColor = user.mutualCount > 0 ? MUTUAL_COLOR : accent;
  const badgeIcon  = user.mutualCount > 0 ? "person-add-outline" : "people-outline";

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

      {/* Badge — mutual connection takes priority over shared interests */}
      {badgeLabel && (
        <View style={[styles.interestBadge, { backgroundColor: badgeColor + "18" }]}>
          <Ionicons name={badgeIcon as any} size={10} color={badgeColor} />
          <Text style={[styles.interestBadgeText, { color: badgeColor }]} numberOfLines={1}>
            {badgeLabel}
          </Text>
        </View>
      )}

      {/* Follow button — shows Follow / Follow Back / Following */}
      {(() => {
        const _fs = localFollow ? "following" : theyFollowMe ? "follow_back" : "follow";
        const _bg = _fs === "follow" ? accent : _fs === "follow_back" ? "#FF9500" : colors.backgroundTertiary;
        const _bc = _fs === "following" ? colors.border : _fs === "follow_back" ? "#FF9500" : accent;
        const _tc = _fs === "following" ? colors.textMuted : "#fff";
        const _label = _fs === "follow" ? "Follow" : _fs === "follow_back" ? "Follow Back" : "Following";
        return (
          <TouchableOpacity
            style={[styles.followBtn, { backgroundColor: _bg, borderColor: _bc }]}
            onPress={handleFollow}
            disabled={localFollow || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={_tc} />
            ) : (
              <Text style={[styles.followBtnText, { color: _tc }]}>{_label}</Text>
            )}
          </TouchableOpacity>
        );
      })()}
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
  const [followersSet, setFollowersSet] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (force = false) => {
    if (!user) { setLoading(false); return; }

    if (
      !force &&
      _cachedResult &&
      _cachedResult.userId === user.id &&
      Date.now() < _cachedResult.expiresAt
    ) {
      setUsers(shuffle(_cachedResult.users).slice(0, maxCards));
      setFollowingSet(new Set(_cachedResult.followingSet));
      setFollowersSet(new Set(_cachedResult.followersSet));
      setDismissed(new Set(_cachedResult.dismissed));
      setLoading(false);
      return;
    }

    setLoading(true);

    const [dis, followRes, followersRes] = await Promise.all([
      loadDismissed(),
      supabase.from("follows").select("following_id").eq("follower_id", user.id),
      supabase.from("follows").select("follower_id").eq("following_id", user.id),
    ]);

    if (!mountedRef.current) return;

    const followingIds = (followRes.data || []).map((f: any) => f.following_id as string);
    const followingSetLocal = new Set(followingIds);
    const excludeIds = new Set([user.id, ...followingIds, ...dis]);
    const userInterests: string[] = profile?.interests || [];

    // ── Signal 1: Friends-of-friends ─────────────────────────────────────────
    // Fetch who the people I follow also follow (2nd degree).
    // Limit to first FOF_FOLLOWING_LIMIT followees to keep query manageable.
    const fofSource = followingIds.slice(0, FOF_FOLLOWING_LIMIT);
    let mutualCountMap = new Map<string, number>();   // userId → how many of my follows follow them
    let mutualSourceMap = new Map<string, string>();  // userId → one follower_id connecting them

    if (fofSource.length > 0) {
      const { data: fofRows } = await supabase
        .from("follows")
        .select("follower_id, following_id")
        .in("follower_id", fofSource)
        .limit(2000);

      if (!mountedRef.current) return;

      for (const row of fofRows || []) {
        if (excludeIds.has(row.following_id)) continue;
        const prev = mutualCountMap.get(row.following_id) || 0;
        mutualCountMap.set(row.following_id, prev + 1);
        if (prev === 0) mutualSourceMap.set(row.following_id, row.follower_id);
      }
    }

    // Resolve handles for the "connecting" people so we can show "@handle follows them"
    const mutualSourceIds = Array.from(new Set(Array.from(mutualSourceMap.values())));
    const handleMap = new Map<string, string>(); // userId → handle

    if (mutualSourceIds.length > 0) {
      const { data: sourceProfiles } = await supabase
        .from("profiles")
        .select("id, handle")
        .in("id", mutualSourceIds);

      if (!mountedRef.current) return;
      for (const p of sourceProfiles || []) handleMap.set(p.id, p.handle);
    }

    // ── Signal 2: Shared interests ────────────────────────────────────────────
    let interestData: any[] = [];
    {
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
      interestData = data || [];
    }

    // ── Signal 3: Friends-of-friends profile fetch ────────────────────────────
    const fofCandidateIds = Array.from(mutualCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([id]) => id);

    let fofProfileData: any[] = [];
    if (fofCandidateIds.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, xp, is_verified, interests, bio")
        .in("id", fofCandidateIds);
      if (!mountedRef.current) return;
      fofProfileData = data || [];
    }

    // ── Merge + score ─────────────────────────────────────────────────────────
    const seenIds = new Set<string>();
    const allCandidates: (SuggestedUser & { score: number })[] = [];

    function buildCandidate(u: any): (SuggestedUser & { score: number }) | null {
      if (excludeIds.has(u.id) || seenIds.has(u.id)) return null;
      seenIds.add(u.id);
      const interests: string[] = u.interests || [];
      const sharedCount = interests.filter((i: string) => userInterests.includes(i)).length;
      const mutualCount = mutualCountMap.get(u.id) || 0;
      const sourceId    = mutualSourceMap.get(u.id);
      const mutualHandle = sourceId ? (handleMap.get(sourceId) || null) : null;
      const score =
        mutualCount * 18 +
        sharedCount * 12 +
        Math.min((u.xp || 0) / 500, 25) +
        (u.is_verified ? 8 : 0);
      return { ...u, interests, sharedCount, mutualCount, mutualHandle, score };
    }

    // Add interest-based candidates first, then fof-only ones
    for (const u of interestData) {
      const c = buildCandidate(u);
      if (c) allCandidates.push(c);
    }
    for (const u of fofProfileData) {
      const c = buildCandidate(u);
      if (c) allCandidates.push(c);
    }

    allCandidates.sort((a, b) => b.score - a.score);

    // Shuffle top pool for variety
    const pool = shuffle(allCandidates.slice(0, Math.min(POOL_SIZE, allCandidates.length)));

    let finalUsers: SuggestedUser[];

    // Fallback to top-XP when no results at all
    if (pool.length === 0) {
      const { data: fallback } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, xp, is_verified, interests, bio")
        .neq("id", user.id)
        .order("xp", { ascending: false })
        .limit(POOL_SIZE);

      if (!mountedRef.current) return;
      finalUsers = shuffle(
        (fallback || [])
          .filter((u: any) => !excludeIds.has(u.id))
          .map((u: any) => ({
            ...u,
            interests: u.interests || [],
            sharedCount: 0,
            mutualCount: 0,
            mutualHandle: null,
          } as SuggestedUser))
      );
    } else {
      finalUsers = pool;
    }

    const followersSetLocal = new Set((followersRes.data || []).map((f: any) => f.follower_id as string));

    _cachedResult = {
      users: finalUsers,
      followingSet: followingSetLocal,
      followersSet: followersSetLocal,
      dismissed: dis,
      userId: user.id,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    setUsers(finalUsers.slice(0, maxCards));
    setFollowingSet(followingSetLocal);
    setFollowersSet(followersSetLocal);
    setDismissed(dis);
    setLoading(false);
  }, [user, profile?.interests, maxCards]);

  useEffect(() => { load(); }, [load]);

  async function handleFollow(targetId: string) {
    if (!user) return;
    setFollowingSet(prev => new Set([...prev, targetId]));
    // Invalidate cache so the next mount re-fetches with updated following list
    if (_cachedResult && _cachedResult.userId === user.id) {
      _cachedResult.expiresAt = 0;
    }
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
    if (_cachedResult && _cachedResult.userId === user?.id) {
      _cachedResult = {
        ..._cachedResult,
        users: _cachedResult.users.filter(u => u.id !== targetId),
        dismissed: next,
      };
    }
    await saveDismissed(next);
  }

  const horizontalScrollActive = useHorizontalScrollLock();

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
            theyFollowMe={followersSet.has(item.id)}
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
    maxWidth: "100%",
  },
  interestBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium", flexShrink: 1 },

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

  skeletonRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16 },
  skeletonCard: {
    width: CARD_WIDTH,
    height: 190,
    borderRadius: 16,
    opacity: 0.4,
  },
});
