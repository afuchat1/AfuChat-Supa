import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import type {
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { OptimizedImage as ExpoImage } from "@/components/ui/OptimizedImage";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { navigateToKnownProfile } from "@/lib/navigateToProfile";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { beginDataSync, isOnline as hasLiveConnection, onReconnect } from "@/lib/offlineStore";
import { enqueue } from "@/lib/storage/syncQueue";
import {
  getDiscoverPeople,
  saveDiscoverPeople,
} from "@/lib/storage/localDiscoverPeople";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Skeleton } from "@/components/ui/Skeleton";
import * as Haptics from "@/lib/haptics";
import {
  nextProfilePageOffset,
  normalizeInterestList,
  rankPeopleByAffinity,
} from "@/lib/peopleRecommendations";

type Person = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  last_seen: string | null;
  is_following: boolean;
  is_following_me: boolean;
  mutualPeople: MutualPerson[];
  mutualCount: number;
};

type MutualPerson = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
};

const ONLINE_WINDOW = 10 * 60_000;
const DISMISSED_KEY = "suggested_users_dismissed_v1";
const MAX_FOF_SOURCES = 60;
const MAX_RECOMMENDATIONS = 60;
const PROFILE_PAGE_SIZE = MAX_RECOMMENDATIONS * 2;
const MAX_FOF_CANDIDATES = PROFILE_PAGE_SIZE;
const SEEN_RECOMMENDATIONS_LIMIT = 1000;
const RECOMMENDATION_HISTORY_KEY = "find_people_recommendation_history_v1";
const INITIAL_VISIBLE_COUNT = 20;
const LOAD_MORE_COUNT = 12;
const MAX_MUTUAL_AVATARS = 3;
const WEB_PULL_REFRESH_THRESHOLD = 56;
const WEB_PULL_REFRESH_MAX_DISTANCE = 88;

function isOnline(lastSeen: string | null) {
  return !!lastSeen && Date.now() - new Date(lastSeen).getTime() <= ONLINE_WINDOW;
}

function Avatar({ person, accent, size = 70 }: { person: Person; accent: string; size?: number }) {
  return person.avatar_url ? (
    <ExpoImage source={{ uri: person.avatar_url }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} contentFit="cover" cachePolicy="memory-disk" />
  ) : (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: accent + "20" }]}>
      <Text style={[styles.initial, { color: accent, fontSize: size * 0.3 }]}>
        {(person.display_name || person.handle || "?")[0].toUpperCase()}
      </Text>
    </View>
  );
}

export default function FindPeopleTab() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const userId = user?.id;
  const [people, setPeople] = useState<Person[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [pullDistance, setPullDistance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const lastRevealAtRef = useRef(0);
  const pullStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const scrollOffsetYRef = useRef(0);

  const loadRecommendations = useCallback(async (manualRefresh = false) => {
    if (!userId) return;
    const requestId = ++loadRequestRef.current;
    const historyKey = `${RECOMMENDATION_HISTORY_KEY}:${userId}`;
    const dismissedKey = `${DISMISSED_KEY}:${userId}`;
    let hasSavedPeople = false;
    let finishDataSync: (() => void) | null = null;
    if (manualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const savedPeople = await getDiscoverPeople(userId);
      if (requestId !== loadRequestRef.current) return;
      if (savedPeople.length > 0) {
        hasSavedPeople = true;
        setPeople(savedPeople as Person[]);
        setVisibleCount(INITIAL_VISIBLE_COUNT);
        setLoading(false);
      }

      let dismissedIds = new Set<string>();
      let history = {
        seenIds: [] as string[],
        interestOffset: 0,
        discoveryOffset: 0,
      };
      try {
        const [rawDismissed, rawHistory] = await Promise.all([
          AsyncStorage.getItem(dismissedKey),
          AsyncStorage.getItem(historyKey),
        ]);
        const parsed = rawDismissed ? JSON.parse(rawDismissed) : [];
        if (Array.isArray(parsed)) {
          dismissedIds = new Set(parsed.filter((id): id is string => typeof id === "string"));
        }
        const parsedHistory = rawHistory ? JSON.parse(rawHistory) : null;
        if (parsedHistory && typeof parsedHistory === "object") {
          history = {
            seenIds: Array.isArray(parsedHistory.seenIds)
              ? parsedHistory.seenIds.filter((id: unknown): id is string => typeof id === "string")
              : [],
            interestOffset: Number.isSafeInteger(parsedHistory.interestOffset) && parsedHistory.interestOffset >= 0
              ? parsedHistory.interestOffset
              : 0,
            discoveryOffset: Number.isSafeInteger(parsedHistory.discoveryOffset) && parsedHistory.discoveryOffset >= 0
              ? parsedHistory.discoveryOffset
              : 0,
          };
        }
      } catch (storageError) {
        console.warn("[find-people] Could not load recommendation history", storageError);
      }
      if (requestId !== loadRequestRef.current) return;
      setDismissed(dismissedIds);

      finishDataSync = beginDataSync();
      const [
        { data: followingRows, error: followingError },
        { data: followerRows, error: followerError },
        { data: viewerProfile, error: viewerProfileError },
      ] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", userId),
        supabase.from("follows").select("follower_id").eq("following_id", userId),
        supabase.from("profiles").select("interests").eq("id", userId).maybeSingle(),
      ]);
      if (followingError) throw followingError;
      if (followerError) throw followerError;
      if (viewerProfileError) {
        console.warn("[find-people] Could not load your interests", viewerProfileError);
        setError("Some suggestions could not be personalized.");
      }

      const viewerInterests = normalizeInterestList(viewerProfile?.interests);
      const followingIds = (followingRows ?? [])
        .map((row: any) => row.following_id as string)
        .sort();
      const alreadyFollowing = new Set([userId, ...followingIds]);

      const sourceIds = followingIds.slice(0, MAX_FOF_SOURCES);
      const connectionResult = sourceIds.length
        ? await supabase
          .from("follows")
          .select("follower_id, following_id")
          .in("follower_id", sourceIds)
          .limit(2000)
        : { data: [] as any[], error: null };
      if (connectionResult.error) throw connectionResult.error;

      const mutualCounts = new Map<string, number>();
      const mutualIdsByCandidate = new Map<string, string[]>();
      for (const edge of connectionResult.data ?? []) {
        const candidateId = edge.following_id as string;
        if (alreadyFollowing.has(candidateId) || dismissedIds.has(candidateId)) continue;
        mutualCounts.set(candidateId, (mutualCounts.get(candidateId) ?? 0) + 1);
        const mutualIds = mutualIdsByCandidate.get(candidateId) ?? [];
        mutualIds.push(edge.follower_id as string);
        mutualIdsByCandidate.set(candidateId, mutualIds);
      }

      const seenIds = new Set(history.seenIds);
      const candidateIds = Array.from(mutualCounts.entries())
        .filter(([id]) => !alreadyFollowing.has(id) && !dismissedIds.has(id))
        .map(([id, mutualCount]) => ({
          id,
          mutualCount,
          tieBreak: Math.random(),
        }))
        .sort((a, b) => {
          const aSeen = seenIds.has(a.id);
          const bSeen = seenIds.has(b.id);
          if (aSeen !== bSeen) return aSeen ? 1 : -1;
          return b.mutualCount - a.mutualCount || a.tieBreak - b.tieBreak;
        })
        .slice(0, MAX_FOF_CANDIDATES)
        .map(({ id }) => id);

      const mutualProfileIds = Array.from(new Set(
        candidateIds.flatMap((id) => mutualIdsByCandidate.get(id) ?? []),
      ));
      const profileSelection = "id, display_name, handle, avatar_url, banner_url, bio, is_verified, is_organization_verified, last_seen, interests";
      const fetchProfilePage = async (offset: number, sharedInterests?: string[]) => {
        const queryPage = (start: number) => {
          let query: any = supabase
            .from("profiles")
            .select(profileSelection)
            .eq("onboarding_completed", true)
            .eq("is_banned", false)
            .eq("account_deleted", false)
            .not("handle", "is", null)
            .not("display_name", "is", null)
            .not("avatar_url", "is", null);
          if (sharedInterests?.length) {
            query = query.overlaps("interests", sharedInterests);
          }
          return query
            .order("id", { ascending: true })
            .range(start, start + PROFILE_PAGE_SIZE - 1);
        };

        let currentOffset = offset;
        let result = await queryPage(currentOffset);
        if (!result.error && currentOffset > 0 && !(result.data ?? []).length) {
          currentOffset = 0;
          result = await queryPage(currentOffset);
        }
        const rows = result.data ?? [];
        return {
          data: rows,
          error: result.error,
          nextOffset: nextProfilePageOffset(
            offset,
            rows.length,
            PROFILE_PAGE_SIZE,
            !!result.error,
          ),
        };
      };
      const [recommendationResult, mutualResult, interestPage, discoveryPage] = await Promise.all([
        candidateIds.length
          ? supabase
            .from("profiles")
            .select(profileSelection)
            .in("id", candidateIds)
            .eq("onboarding_completed", true)
            .eq("is_banned", false)
            .eq("account_deleted", false)
            .not("handle", "is", null)
            .not("display_name", "is", null)
            .not("avatar_url", "is", null)
          : Promise.resolve({ data: [] as any[], error: null }),
        mutualProfileIds.length
          ? supabase
            .from("profiles")
            .select("id, display_name, handle, avatar_url")
            .in("id", mutualProfileIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        viewerInterests.length
          ? fetchProfilePage(history.interestOffset, viewerInterests)
          : Promise.resolve({ data: [] as any[], error: null, nextOffset: 0 }),
        fetchProfilePage(history.discoveryOffset),
      ]);
      if (recommendationResult.error) throw recommendationResult.error;

      const partialErrors = [
        interestPage.error,
        discoveryPage.error,
        mutualResult.error,
      ].filter(Boolean);
      if (partialErrors.length) {
        console.warn("[find-people] Some recommendation sources could not be loaded", partialErrors);
        setError("Some suggestions could not be loaded.");
      }

      const mutualProfileById = new Map<string, MutualPerson>(
        (mutualResult.data ?? []).map((profile: any) => [profile.id, profile]),
      );
      const theyFollowMe = new Set((followerRows ?? []).map((row: any) => row.follower_id as string));
      const profilesById = new Map<string, any>();
      for (const profile of [
        ...(recommendationResult.data ?? []),
        ...(interestPage.data ?? []),
        ...(discoveryPage.data ?? []),
      ]) {
        if (
          profile?.id &&
          !alreadyFollowing.has(profile.id) &&
          !dismissedIds.has(profile.id)
        ) {
          profilesById.set(profile.id, profile);
        }
      }

      const candidates = Array.from(profilesById.values()).flatMap((profile: any) => {
        if (!profile.handle || !profile.display_name || !profile.avatar_url) return [];
        const mutualPeople = (mutualIdsByCandidate.get(profile.id) ?? [])
          .map((mutualId) => mutualProfileById.get(mutualId))
          .filter((mutual): mutual is MutualPerson => !!mutual)
          .sort((a, b) => a.display_name.localeCompare(b.display_name));
        const person: Person = {
          id: profile.id as string,
          display_name: profile.display_name.trim() as string,
          handle: profile.handle.trim() as string,
          avatar_url: profile.avatar_url as string,
          banner_url: (profile.banner_url || null) as string | null,
          bio: (profile.bio?.trim() || null) as string | null,
          is_verified: !!profile.is_verified,
          is_organization_verified: !!profile.is_organization_verified,
          last_seen: (profile.last_seen || null) as string | null,
          is_following: false,
          is_following_me: theyFollowMe.has(profile.id),
          mutualPeople,
          mutualCount: mutualCounts.get(profile.id) ?? 0,
        };
        return [{
          id: person.id,
          value: person,
          interests: profile.interests,
          mutualCount: person.mutualCount,
        }];
      });
      const rankedPeople = rankPeopleByAffinity(candidates, viewerInterests, seenIds)
        .slice(0, MAX_RECOMMENDATIONS * 2)
        .map((candidate) => candidate.value);

      if (requestId !== loadRequestRef.current) return;
      const nextHistory = {
        seenIds: Array.from(new Set([
          ...history.seenIds,
          ...rankedPeople.slice(0, INITIAL_VISIBLE_COUNT).map((person) => person.id),
        ]))
          .slice(-SEEN_RECOMMENDATIONS_LIMIT),
        interestOffset: interestPage.error ? history.interestOffset : interestPage.nextOffset,
        discoveryOffset: discoveryPage.error ? history.discoveryOffset : discoveryPage.nextOffset,
      };
      try {
        await AsyncStorage.setItem(historyKey, JSON.stringify(nextHistory));
      } catch (storageError) {
        console.warn("[find-people] Could not save recommendation history", storageError);
      }
      if (requestId !== loadRequestRef.current) return;
      setPeople(rankedPeople);
      setVisibleCount(INITIAL_VISIBLE_COUNT);
      try {
        await saveDiscoverPeople(userId, rankedPeople);
      } catch (storageError) {
        console.warn("[find-people] Could not persist people for offline use", storageError);
      }
    } catch (loadError) {
      if (requestId === loadRequestRef.current) {
        console.warn("[find-people] Could not load suggestions", loadError);
        if (!hasSavedPeople) setError("Couldn’t load suggestions.");
      }
    } finally {
      finishDataSync?.();
      if (requestId === loadRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (userId) void loadRecommendations();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [loadRecommendations, userId]);

  useEffect(() => {
    if (!userId) return;
    return onReconnect(() => {
      void loadRecommendations(true);
    });
  }, [loadRecommendations, userId]);

  useEffect(() => {
    if (!userId || !people.length) return;
    const historyKey = `${RECOMMENDATION_HISTORY_KEY}:${userId}`;
    const shownIds = people
      .slice(0, visibleCount)
      .map((person) => person.id);
    let cancelled = false;

    const saveShownPeople = async () => {
      try {
        const rawHistory = await AsyncStorage.getItem(historyKey);
        const parsedHistory = rawHistory ? JSON.parse(rawHistory) : {};
        const previousIds = Array.isArray(parsedHistory?.seenIds)
          ? parsedHistory.seenIds.filter((id: unknown): id is string => typeof id === "string")
          : [];
        const nextHistory = {
          seenIds: Array.from(new Set([...previousIds, ...shownIds]))
            .slice(-SEEN_RECOMMENDATIONS_LIMIT),
          interestOffset: Number.isSafeInteger(parsedHistory?.interestOffset) && parsedHistory.interestOffset >= 0
            ? parsedHistory.interestOffset
            : 0,
          discoveryOffset: Number.isSafeInteger(parsedHistory?.discoveryOffset) && parsedHistory.discoveryOffset >= 0
            ? parsedHistory.discoveryOffset
            : 0,
        };
        if (!cancelled) await AsyncStorage.setItem(historyKey, JSON.stringify(nextHistory));
      } catch (storageError) {
        console.warn("[find-people] Could not record shown recommendations", storageError);
      }
    };
    void saveShownPeople();
    return () => {
      cancelled = true;
    };
  }, [people, visibleCount, userId]);

  useEffect(() => {
    if (!userId) return;
    const heartbeat = () => {
      supabase.rpc("update_last_seen").then(() => {}, () => {});
    };
    heartbeat();
    const heartbeatTimer = setInterval(heartbeat, 60_000);
    return () => {
      clearInterval(heartbeatTimer);
    };
  }, [userId]);

  const dismissPerson = useCallback(async (personId: string) => {
    void Haptics.selectionAsync();
    const nextPeople = people.filter((person) => person.id !== personId);
    setPeople(nextPeople);
    if (userId) {
      try {
        await saveDiscoverPeople(userId, nextPeople);
      } catch {}
    }
    const nextDismissed = new Set(dismissed);
    nextDismissed.add(personId);
    setDismissed(nextDismissed);
    try {
      await AsyncStorage.setItem(
        `${DISMISSED_KEY}:${userId}`,
        JSON.stringify(Array.from(nextDismissed).slice(-200)),
      );
    } catch {}
  }, [dismissed, people, userId]);

  const connect = useCallback(async (person: Person) => {
    if (!user) return router.push("/(auth)/login" as any);
    if (person.is_following || followBusy === person.id) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowBusy(person.id);
    const nextPeople = people.map((item) => item.id === person.id
      ? { ...item, is_following: true }
      : item);
    try {
      if (!hasLiveConnection()) {
        await enqueue("follow_user", {
          follower_id: user.id,
          following_id: person.id,
        });
      } else {
        const { error: followError } = await supabase.from("follows").upsert({
          follower_id: user.id,
          following_id: person.id,
        }, { onConflict: "follower_id,following_id" });
        if (followError) {
          if (hasLiveConnection()) throw followError;
          await enqueue("follow_user", {
            follower_id: user.id,
            following_id: person.id,
          });
        }
      }
      setPeople(nextPeople);
      await saveDiscoverPeople(user.id, nextPeople);
    } catch {
      setError("Couldn’t follow right now. Try again.");
    } finally {
      setFollowBusy(null);
    }
  }, [followBusy, people, user]);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scrollOffsetYRef.current = Math.max(0, contentOffset.y);
    if (visibleCount >= people.length) return;
    const remainingDistance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (remainingDistance > 420 || Date.now() - lastRevealAtRef.current < 350) return;
    lastRevealAtRef.current = Date.now();
    setVisibleCount((current) =>
      current >= people.length
        ? current
        : Math.min(current + LOAD_MORE_COUNT, people.length),
    );
  }, [people.length, visibleCount]);

  const handleWebTouchStart = useCallback((event: GestureResponderEvent) => {
    if (
      Platform.OS !== "web" ||
      loading ||
      refreshing ||
      scrollOffsetYRef.current > 1
    ) return;
    pullStartYRef.current = event.nativeEvent.pageY;
    pullDistanceRef.current = 0;
    setPullDistance(0);
  }, [loading, refreshing]);

  const handleWebTouchMove = useCallback((event: GestureResponderEvent) => {
    const startY = pullStartYRef.current;
    if (Platform.OS !== "web" || startY === null || scrollOffsetYRef.current > 1) return;
    const distance = Math.max(0, event.nativeEvent.pageY - startY);
    const nextPullDistance = Math.min(
      WEB_PULL_REFRESH_MAX_DISTANCE,
      Math.round(distance * 0.55),
    );
    pullDistanceRef.current = nextPullDistance;
    setPullDistance(nextPullDistance);
    if (distance > 8) event.preventDefault();
  }, []);

  const handleWebTouchEnd = useCallback(() => {
    const shouldRefresh =
      Platform.OS === "web" &&
      pullDistanceRef.current >= WEB_PULL_REFRESH_THRESHOLD &&
      !refreshing &&
      !loading;
    pullStartYRef.current = null;
    pullDistanceRef.current = 0;
    setPullDistance(0);
    if (shouldRefresh) void loadRecommendations(true);
  }, [loadRecommendations, loading, refreshing]);

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: accent }]}
          onPress={() => router.push("/(auth)/login" as any)}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cardWidth = Math.floor((width - 36) / 2);
  const bannerHeight = Math.min(112, Math.max(88, cardWidth * 0.52));
  const gridRows: Person[][] = [];
  const visiblePeople = people.slice(0, visibleCount);
  for (let index = 0; index < visiblePeople.length; index += 2) {
    gridRows.push(visiblePeople.slice(index, index + 2));
  }
  const hasResults = people.length > 0;
  const pullIndicatorHeight = refreshing
    ? 48
    : Math.min(WEB_PULL_REFRESH_MAX_DISTANCE, pullDistance);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 112 }]}
      showsVerticalScrollIndicator={false}
      onScroll={handleListScroll}
      scrollEventThrottle={200}
      onTouchStart={Platform.OS === "web" ? handleWebTouchStart : undefined}
      onTouchMove={Platform.OS === "web" ? handleWebTouchMove : undefined}
      onTouchEnd={Platform.OS === "web" ? handleWebTouchEnd : undefined}
      onTouchCancel={Platform.OS === "web" ? handleWebTouchEnd : undefined}
      refreshControl={Platform.OS !== "web" ? (
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { void loadRecommendations(true); }}
          tintColor={accent}
        />
      ) : undefined}
    >
      {Platform.OS === "web" && (pullDistance > 0 || refreshing) && (
        <View
          style={[
            styles.webPullIndicator,
            {
              height: pullIndicatorHeight,
              opacity: pullDistance >= 28 || refreshing ? 1 : 0,
            },
          ]}
          accessibilityLiveRegion="polite"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={accent} />
          ) : pullDistance >= 28 ? (
            <Ionicons name="arrow-down" size={16} color={accent} />
          ) : null}
          {(pullDistance >= 28 || refreshing) && (
            <Text style={[styles.webPullCopy, { color: colors.textMuted }]}>
              {refreshing
                ? t("Refreshing")
                : pullDistance >= WEB_PULL_REFRESH_THRESHOLD
                  ? t("Release to refresh")
                  : t("Pull down to refresh")}
            </Text>
          )}
        </View>
      )}
      {Platform.OS === "web" && (
        <View style={styles.webRefreshRow}>
          <TouchableOpacity
            style={[
              styles.webRefreshButton,
              { borderColor: colors.border, backgroundColor: colors.surface },
              (refreshing || loading) && styles.disabledButton,
            ]}
            onPress={() => void loadRecommendations(true)}
            disabled={refreshing || loading}
            accessibilityRole="button"
            accessibilityLabel={t("Refresh suggestions")}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={accent} />
            ) : (
              <Ionicons name="refresh-outline" size={14} color={accent} />
            )}
            <Text style={[styles.webRefreshLabel, { color: colors.text }]}>
              {t("Refresh suggestions")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {loading && !hasResults ? (
        <View style={styles.grid}>
          {[0, 1].map((row) => (
            <View key={row} style={styles.gridRow}>
              {[0, 1].map((column) => (
                <View key={column} style={[styles.card, { width: cardWidth, backgroundColor: colors.cardSurface, borderColor: colors.border }]}>
                  <Skeleton width="100%" height={bannerHeight} borderRadius={0} />
                  <View style={styles.skeletonBody}>
                    <Skeleton width={66} height={66} borderRadius={33} />
                    <Skeleton width="78%" height={15} borderRadius={7} style={{ marginTop: 8 }} />
                    <Skeleton width="56%" height={11} borderRadius={5} style={{ marginTop: 6 }} />
                    <Skeleton width="100%" height={30} borderRadius={7} style={{ marginTop: 10 }} />
                    <Skeleton width="100%" height={36} borderRadius={18} style={{ marginTop: 10 }} />
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : error && !hasResults ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.emptyAction, { borderColor: accent }]}
            onPress={() => void loadRecommendations()}
            accessibilityRole="button"
          >
            <Text style={[styles.emptyActionText, { color: accent }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !hasResults ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>No suggestions yet</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {gridRows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.gridRow}>
              {row.map((person) => {
                const connected = person.is_following;
                const buttonLabel = connected ? "Following" : person.is_following_me ? "Follow back" : "Follow";
                const mutualPeople = person.mutualPeople.slice(0, MAX_MUTUAL_AVATARS);
                const mutualNames = mutualPeople.map((mutual) =>
                  mutual.display_name?.trim() || (mutual.handle ? `@${mutual.handle}` : ""),
                ).filter(Boolean);
                const otherCount = Math.max(0, person.mutualCount - mutualNames.length);
                const joinedNames = mutualNames.length < 2
                  ? mutualNames[0] ?? ""
                  : mutualNames.length === 2
                    ? `${mutualNames[0]} ${t("and")} ${mutualNames[1]}`
                    : otherCount > 0
                      ? mutualNames.join(", ")
                      : `${mutualNames[0]}, ${mutualNames[1]} ${t("and")} ${mutualNames[2]}`;
                return (
                  <View
                    key={person.id}
                    style={[styles.card, { width: cardWidth, backgroundColor: colors.cardSurface, borderColor: colors.border }]}
                  >
                    <View style={[styles.banner, { height: bannerHeight, backgroundColor: colors.inputBg }]}>
                      {person.banner_url ? (
                        <ExpoImage
                          source={{ uri: person.banner_url }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          cachePolicy="memory"
                        />
                      ) : (
                        <View style={[styles.bannerFallback, { backgroundColor: accent + "18" }]}>
                          <Ionicons name="people-outline" size={26} color={accent + "88"} />
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.dismissButton}
                        onPress={() => void dismissPerson(person.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Dismiss ${person.display_name}`}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      >
                        <Ionicons name="close" size={18} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={styles.profileBody}
                      onPress={() => navigateToKnownProfile(person)}
                      activeOpacity={0.82}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${person.display_name}'s profile`}
                    >
                      <View style={[styles.avatarFrame, { backgroundColor: colors.surface }]}>
                        <Avatar person={person} accent={accent} size={68} />
                        {isOnline(person.last_seen) && (
                          <View style={[styles.onlineDot, { backgroundColor: colors.online, borderColor: colors.surface }]} />
                        )}
                      </View>
                      <View style={styles.cardNameRow}>
                        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                          {person.display_name}
                        </Text>
                        {(person.is_verified || person.is_organization_verified) && (
                          <Ionicons name="checkmark-circle" size={15} color={accent} />
                        )}
                      </View>
                      <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
                        @{person.handle}
                      </Text>
                      {!!person.bio && (
                        <Text style={[styles.bio, { color: colors.textMuted }]} numberOfLines={2}>
                          {person.bio}
                        </Text>
                      )}
                    </TouchableOpacity>

                    {person.mutualCount > 0 && (
                      <View style={styles.mutualRow}>
                        <View style={styles.mutualAvatars}>
                          {mutualPeople.map((mutual, index) => (
                            <View
                              key={mutual.id}
                              style={[
                                styles.mutualAvatarFrame,
                                {
                                  backgroundColor: colors.inputBg,
                                  borderColor: colors.surface,
                                  marginLeft: index ? -8 : 0,
                                },
                              ]}
                            >
                              {mutual.avatar_url ? (
                                <ExpoImage
                                  source={{ uri: mutual.avatar_url }}
                                  style={styles.mutualAvatarImage}
                                  contentFit="cover"
                                  cachePolicy="memory-disk"
                                />
                              ) : (
                                <View style={[styles.mutualAvatarFallback, { backgroundColor: colors.inputBg }]}>
                                  <Text style={[styles.mutualInitial, { color: colors.textMuted }]}>
                                    {(mutual.display_name || mutual.handle || "?")[0].toUpperCase()}
                                  </Text>
                                </View>
                              )}
                            </View>
                          ))}
                        </View>
                        <Text style={[styles.mutualCopy, { color: colors.textMuted }]} numberOfLines={2}>
                          <>
                            {t("Followed by")}{" "}
                            <Text style={[styles.mutualName, { color: colors.text }]}>
                              {joinedNames || t("{{count}} people", { count: person.mutualCount })}
                            </Text>
                            {otherCount > 0 && (
                              <>
                                {" "}{t("and")}{" "}
                                <Text style={[styles.mutualName, { color: colors.text }]}>
                                  {t(otherCount === 1 ? "{{count}} other" : "{{count}} others", { count: otherCount })}
                                </Text>
                              </>
                            )}
                          </>
                        </Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.connectButton,
                        {
                          borderColor: connected ? colors.border : accent,
                          backgroundColor: connected ? colors.inputBg : accent,
                        },
                      ]}
                      onPress={() => void connect(person)}
                      disabled={followBusy === person.id || connected}
                      accessibilityRole="button"
                      accessibilityLabel={`${buttonLabel} ${person.display_name}`}
                    >
                      {followBusy === person.id ? (
                        <ActivityIndicator size="small" color={connected ? colors.textMuted : "#fff"} />
                      ) : (
                        <Text style={[styles.connectText, { color: connected ? colors.textMuted : "#fff" }]}>
                          {buttonLabel}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
              {row.length === 1 && <View style={{ width: cardWidth }} />}
            </View>
          ))}
        </View>
      )}
      {hasResults && visibleCount < people.length && (
        <Text style={[styles.moreHint, { color: colors.textMuted }]}>{t("Keep scrolling to see more")}</Text>
      )}
      {!!error && hasResults && <Text style={[styles.inlineError, { color: colors.textMuted }]}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: "100%", paddingHorizontal: 0 },
  pageContent: { flexGrow: 1, paddingTop: 8 },
  inlineError: { fontSize: 12, marginTop: 8, marginBottom: 4, paddingHorizontal: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  primaryButton: { minHeight: 42, borderRadius: 21, paddingHorizontal: 22, justifyContent: "center" },
  primaryButtonText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  grid: { gap: 10, paddingHorizontal: 12, paddingBottom: 8 },
  gridRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  card: { overflow: "hidden", borderWidth: 1, borderRadius: 16, paddingBottom: 12 },
  banner: { width: "100%", alignItems: "center", justifyContent: "center" },
  bannerFallback: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  dismissButton: { position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.62)" },
  profileBody: { alignItems: "center", paddingHorizontal: 10, marginTop: -34 },
  avatarFrame: { padding: 3, borderRadius: 40, marginBottom: 8 },
  avatar: { alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: "Inter_700Bold" },
  onlineDot: { position: "absolute", right: 3, bottom: 4, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  cardNameRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  cardName: { flexShrink: 1, fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "center" },
  handle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  bio: { width: "100%", minHeight: 32, fontSize: 11, lineHeight: 15, textAlign: "center", marginTop: 7 },
  mutualRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 10, marginTop: 8, marginBottom: 8 },
  mutualAvatars: { minWidth: 26, flexDirection: "row", alignItems: "center" },
  mutualAvatarFrame: { width: 27, height: 27, borderRadius: 14, borderWidth: 2, overflow: "hidden" },
  mutualAvatarImage: { width: "100%", height: "100%" },
  mutualAvatarFallback: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  mutualInitial: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  mutualCopy: { flex: 1, minHeight: 26, fontSize: 10, lineHeight: 13 },
  mutualName: { fontFamily: "Inter_600SemiBold" },
  moreHint: { paddingVertical: 14, textAlign: "center", fontSize: 11, fontFamily: "Inter_500Medium" },
  webPullIndicator: { alignItems: "center", justifyContent: "center", gap: 5, overflow: "hidden" },
  webPullCopy: { fontSize: 11, fontFamily: "Inter_500Medium" },
  webRefreshRow: { alignItems: "flex-end", marginHorizontal: 8, marginBottom: 8 },
  webRefreshButton: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 17 },
  webRefreshLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  disabledButton: { opacity: 0.55 },
  connectButton: { minHeight: 40, borderWidth: 1.4, borderRadius: 20, marginHorizontal: 12, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  connectText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  skeletonBody: { alignItems: "center", paddingHorizontal: 12, marginTop: -34 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 38, gap: 11 },
  emptyCopy: { fontSize: 12, lineHeight: 18, textAlign: "center", maxWidth: 270 },
  emptyAction: { minHeight: 34, borderWidth: 1, borderRadius: 17, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  emptyActionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});