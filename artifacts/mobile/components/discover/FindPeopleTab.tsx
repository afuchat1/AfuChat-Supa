import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { navigateToKnownProfile } from "@/lib/navigateToProfile";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Skeleton } from "@/components/ui/Skeleton";
import * as Haptics from "@/lib/haptics";

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
const INITIAL_VISIBLE_COUNT = 20;
const LOAD_MORE_COUNT = 12;
const MAX_MUTUAL_AVATARS = 3;

function interleavePeople(recommended: Person[], discovery: Person[]): Person[] {
  const mixed: Person[] = [];
  let recommendationIndex = 0;
  let discoveryIndex = 0;

  while (recommendationIndex < recommended.length || discoveryIndex < discovery.length) {
    if (recommendationIndex < recommended.length) {
      mixed.push(recommended[recommendationIndex]);
      recommendationIndex += 1;
    }
    if (discoveryIndex < discovery.length) {
      mixed.push(discovery[discoveryIndex]);
      discoveryIndex += 1;
    }
  }

  return mixed;
}

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
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const lastRevealAtRef = useRef(0);

  const loadRecommendations = useCallback(async (manualRefresh = false) => {
    if (!userId) return;
    const requestId = ++loadRequestRef.current;
    if (manualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      let dismissedIds = new Set<string>();
      try {
        const rawDismissed = await AsyncStorage.getItem(DISMISSED_KEY);
        const parsed = rawDismissed ? JSON.parse(rawDismissed) : [];
        if (Array.isArray(parsed)) {
          dismissedIds = new Set(parsed.filter((id): id is string => typeof id === "string"));
        }
      } catch (storageError) {
        console.warn("[find-people] Could not load dismissed suggestions", storageError);
      }
      if (requestId !== loadRequestRef.current) return;
      setDismissed(dismissedIds);

      const [
        { data: followingRows, error: followingError },
        { data: followerRows, error: followerError },
      ] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", userId),
        supabase.from("follows").select("follower_id").eq("following_id", userId),
      ]);
      if (followingError) throw followingError;
      if (followerError) throw followerError;

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

      const candidateIds = Array.from(mutualCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, MAX_RECOMMENDATIONS)
        .map(([id]) => id);

      const mutualProfileIds = Array.from(new Set(
        candidateIds.flatMap((id) => mutualIdsByCandidate.get(id) ?? []),
      ));
      const profileSelection = "id, display_name, handle, avatar_url, banner_url, bio, is_verified, is_organization_verified, last_seen";
      const [recommendationResult, mutualResult, discoveryResult] = await Promise.all([
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
        supabase
          .from("profiles")
          .select(`${profileSelection}, follower_count`)
          .eq("onboarding_completed", true)
          .eq("is_banned", false)
          .eq("account_deleted", false)
          .not("handle", "is", null)
          .not("display_name", "is", null)
          .not("avatar_url", "is", null)
          .order("follower_count", { ascending: false })
          .limit(MAX_RECOMMENDATIONS * 2),
      ]);
      if (recommendationResult.error) throw recommendationResult.error;

      const discoveryError = discoveryResult.error;
      if (discoveryError) {
        console.warn("[find-people] Could not load general discovery suggestions", discoveryError);
        setError("Some suggestions could not be loaded.");
      }

      const mutualProfileById = new Map<string, MutualPerson>(
        (mutualResult.data ?? []).map((profile: any) => [profile.id, profile]),
      );
      const [
        recommendedPeople,
        discoveryPeople,
      ] = (() => {
        const profilesById = new Map(
          (recommendationResult.data ?? []).map((profile: any) => [profile.id, profile]),
        );
        const theyFollowMe = new Set((followerRows ?? []).map((row: any) => row.follower_id as string));
        const recommended: Person[] = candidateIds.flatMap((id): Person[] => {
          const person: any = profilesById.get(id);
          if (!person?.handle || !person?.display_name || !person?.avatar_url) return [];
          const mutualPeople = (mutualIdsByCandidate.get(id) ?? [])
            .map((mutualId) => mutualProfileById.get(mutualId))
            .filter((mutual): mutual is MutualPerson => !!mutual)
            .sort((a, b) => a.display_name.localeCompare(b.display_name));
          return [{
            id: person.id as string,
            display_name: person.display_name.trim() as string,
            handle: person.handle.trim() as string,
            avatar_url: person.avatar_url as string,
            banner_url: (person.banner_url || null) as string | null,
            bio: (person.bio?.trim() || null) as string | null,
            is_verified: !!person.is_verified,
            is_organization_verified: !!person.is_organization_verified,
            last_seen: (person.last_seen || null) as string | null,
            is_following: false,
            is_following_me: theyFollowMe.has(person.id),
            mutualPeople,
            mutualCount: mutualCounts.get(id) ?? mutualPeople.length,
          }];
        });

        const recommendedIds = new Set(recommended.map((person) => person.id));
        const discovery: Person[] = (discoveryResult.data ?? [])
          .filter((person: any) =>
            person.handle &&
            person.display_name &&
            person.avatar_url &&
            !alreadyFollowing.has(person.id) &&
            !dismissedIds.has(person.id) &&
            !recommendedIds.has(person.id),
          )
          .slice(0, MAX_RECOMMENDATIONS)
          .map((person: any) => ({
            id: person.id,
            display_name: person.display_name.trim(),
            handle: person.handle.trim(),
            avatar_url: person.avatar_url,
            banner_url: person.banner_url || null,
            bio: person.bio?.trim() || null,
            is_verified: !!person.is_verified,
            is_organization_verified: !!person.is_organization_verified,
            last_seen: person.last_seen || null,
            is_following: false,
            is_following_me: theyFollowMe.has(person.id),
            mutualPeople: [],
            mutualCount: 0,
          }));
        return [recommended, discovery] as const;
      })();

      if (requestId !== loadRequestRef.current) return;
      setPeople(interleavePeople(recommendedPeople, discoveryPeople));
      setVisibleCount(INITIAL_VISIBLE_COUNT);
    } catch (loadError) {
      if (requestId === loadRequestRef.current) {
        console.warn("[find-people] Could not load suggestions", loadError);
        setError("Couldn’t load suggestions.");
      }
    } finally {
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
    setPeople((current) => current.filter((person) => person.id !== personId));
    const nextDismissed = new Set(dismissed);
    nextDismissed.add(personId);
    setDismissed(nextDismissed);
    try {
      await AsyncStorage.setItem(
        DISMISSED_KEY,
        JSON.stringify(Array.from(nextDismissed).slice(-200)),
      );
    } catch {}
  }, [dismissed]);

  const connect = useCallback(async (person: Person) => {
    if (!user) return router.push("/(auth)/login" as any);
    if (person.is_following || followBusy === person.id) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowBusy(person.id);
    setPeople((current) => current.map((item) => item.id === person.id
      ? { ...item, is_following: true }
      : item));
    try {
      const { error: followError } = await supabase.from("follows").upsert({
        follower_id: user.id,
        following_id: person.id,
      }, { onConflict: "follower_id,following_id" });
      if (followError) throw followError;
    } catch {
      setPeople((current) => current.map((item) => item.id === person.id
        ? { ...item, is_following: false }
        : item));
      setError("Couldn’t connect right now. Try again.");
    } finally {
      setFollowBusy(null);
    }
  }, [followBusy, user]);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (visibleCount >= people.length) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const remainingDistance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (remainingDistance > 420 || Date.now() - lastRevealAtRef.current < 350) return;
    lastRevealAtRef.current = Date.now();
    setVisibleCount((current) =>
      current >= people.length
        ? current
        : Math.min(current + LOAD_MORE_COUNT, people.length),
    );
  }, [people.length, visibleCount]);

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

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 112 }]}
      showsVerticalScrollIndicator={false}
      onScroll={handleListScroll}
      scrollEventThrottle={200}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { void loadRecommendations(true); }}
          tintColor={accent}
        />
      }
    >
      {loading && !hasResults ? (
        <View style={styles.grid}>
          {[0, 1].map((row) => (
            <View key={row} style={styles.gridRow}>
              {[0, 1].map((column) => (
                <View key={column} style={[styles.card, { width: cardWidth, backgroundColor: colors.surface }]}>
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
                const buttonLabel = connected ? "Following" : person.is_following_me ? "Follow back" : "Connect";
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
                    style={[styles.card, { width: cardWidth, backgroundColor: colors.surface }]}
                  >
                    <View style={[styles.banner, { height: bannerHeight, backgroundColor: colors.inputBg }]}>
                      {person.banner_url ? (
                        <ExpoImage
                          source={{ uri: person.banner_url }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          cachePolicy="memory-disk"
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

                    <View style={styles.mutualRow}>
                      <View style={styles.mutualAvatars}>
                        {mutualPeople.length ? mutualPeople.map((mutual, index) => (
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
                        )) : (
                          <View style={[styles.mutualSuggestedIcon, { backgroundColor: accent + "14" }]}>
                            <Ionicons name="sparkles-outline" size={14} color={accent} />
                          </View>
                        )}
                      </View>
                      <Text style={[styles.mutualCopy, { color: colors.textMuted }]} numberOfLines={2}>
                        {person.mutualCount > 0 ? (
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
                        ) : t("Suggested for you")}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.connectButton,
                        {
                          borderColor: accent,
                          backgroundColor: connected ? accent : "transparent",
                        },
                      ]}
                      onPress={() => void connect(person)}
                      disabled={followBusy === person.id || connected}
                      accessibilityRole="button"
                      accessibilityLabel={`${buttonLabel} ${person.display_name}`}
                    >
                      {followBusy === person.id ? (
                        <ActivityIndicator size="small" color={connected ? "#fff" : accent} />
                      ) : (
                        <Text style={[styles.connectText, { color: connected ? "#fff" : accent }]}>
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
  card: { overflow: "hidden", borderRadius: 16, paddingBottom: 12 },
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
  mutualSuggestedIcon: { width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  mutualCopy: { flex: 1, minHeight: 26, fontSize: 10, lineHeight: 13 },
  mutualName: { fontFamily: "Inter_600SemiBold" },
  moreHint: { paddingVertical: 14, textAlign: "center", fontSize: 11, fontFamily: "Inter_500Medium" },
  connectButton: { minHeight: 38, borderWidth: 1.4, borderRadius: 20, marginHorizontal: 12, alignItems: "center", justifyContent: "center" },
  connectText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  skeletonBody: { alignItems: "center", paddingHorizontal: 12, marginTop: -34 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 38, gap: 11 },
  emptyCopy: { fontSize: 12, lineHeight: 18, textAlign: "center", maxWidth: 270 },
  emptyAction: { minHeight: 34, borderWidth: 1, borderRadius: 17, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  emptyActionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});