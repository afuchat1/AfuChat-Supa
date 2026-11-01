import React, { useCallback, useEffect, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { navigateToKnownProfile } from "@/lib/navigateToProfile";
import { useAuth } from "@/context/AuthContext";
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
  mutualName: string | null;
  mutualAvatar: string | null;
};
const ONLINE_WINDOW = 10 * 60_000;
const DISMISSED_KEY = "suggested_users_dismissed_v1";
const MAX_FOF_SOURCES = 60;
const MAX_RECOMMENDATIONS = 60;

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [people, setPeople] = useState<Person[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);

  const loadRecommendations = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      let dismissedIds = new Set<string>();
      try {
        const rawDismissed = await AsyncStorage.getItem(DISMISSED_KEY);
        dismissedIds = new Set(rawDismissed ? JSON.parse(rawDismissed) : []);
      } catch {}
      setDismissed(dismissedIds);

      const [
        { data: followingRows, error: followingError },
        { data: followerRows, error: followerError },
      ] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", user.id),
        supabase.from("follows").select("follower_id").eq("following_id", user.id),
      ]);
      if (followingError) throw followingError;
      if (followerError) throw followerError;

      const followingIds = (followingRows ?? []).map((row: any) => row.following_id as string);
      const alreadyFollowing = new Set([user.id, ...followingIds]);
      if (followingIds.length === 0) {
        setPeople([]);
        return;
      }

      const sourceIds = followingIds.slice(0, MAX_FOF_SOURCES);
      const { data: connectionEdges, error: connectionError } = await supabase
        .from("follows")
        .select("follower_id, following_id")
        .in("follower_id", sourceIds)
        .limit(2000);
      if (connectionError) throw connectionError;

      const mutualCounts = new Map<string, number>();
      const sourceForCandidate = new Map<string, string>();
      for (const edge of connectionEdges ?? []) {
        const candidateId = edge.following_id as string;
        if (alreadyFollowing.has(candidateId) || dismissedIds.has(candidateId)) continue;
        mutualCounts.set(candidateId, (mutualCounts.get(candidateId) ?? 0) + 1);
        if (!sourceForCandidate.has(candidateId)) {
          sourceForCandidate.set(candidateId, edge.follower_id as string);
        }
      }

      const candidateIds = Array.from(mutualCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_RECOMMENDATIONS)
        .map(([id]) => id);
      if (candidateIds.length === 0) {
        setPeople([]);
        return;
      }

      const mutualProfileIds = Array.from(new Set(candidateIds.map((id) => sourceForCandidate.get(id)).filter(Boolean))) as string[];
      const [
        { data: profileRows, error: profileError },
        { data: mutualProfiles },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, handle, avatar_url, banner_url, bio, is_verified, is_organization_verified, last_seen")
          .in("id", candidateIds)
          .eq("onboarding_completed", true)
          .eq("is_banned", false)
          .eq("account_deleted", false)
          .not("handle", "is", null)
          .not("display_name", "is", null)
          .not("avatar_url", "is", null),
        mutualProfileIds.length
          ? supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", mutualProfileIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (profileError) throw profileError;

      const mutualProfileById = new Map((mutualProfiles ?? []).map((profile: any) => [profile.id, profile]));
      const theyFollowMe = new Set((followerRows ?? []).map((row: any) => row.follower_id as string));
      const recommendations = (profileRows ?? [])
        .filter((person: any) => person.handle && person.display_name && person.avatar_url)
        .map((person: any): Person => {
          const source = mutualProfileById.get(sourceForCandidate.get(person.id) || "");
          return {
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
            mutualName: source?.display_name || (source?.handle ? `@${source.handle}` : null),
            mutualAvatar: source?.avatar_url || null,
          };
        });
      setPeople(shuffle(recommendations));
    } catch {
      setError("Couldn’t load suggestions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadRecommendations();
  }, [loadRecommendations, user]);

  useEffect(() => {
    if (!user) return;
    // Keep the current user's activity timestamp fresh while discovery is open.
    const heartbeat = () => {
      supabase.rpc("update_last_seen").then(() => {}, () => {});
    };
    heartbeat();
    const heartbeatTimer = setInterval(heartbeat, 60_000);
    const pollTimer = setInterval(() => void loadRecommendations(true), 60_000);
    const channelName = `find-network-${user.id}`;
    const channelTopic = `realtime:${channelName}`;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;
    let cancelled = false;

    const setupChannel = async () => {
      const staleChannels = supabase
        .getChannels()
        .filter((existing) => existing.topic === channelTopic);
      await Promise.all(
        staleChannels.map((staleChannel) =>
          supabase.removeChannel(staleChannel).catch(() => "error"),
        ),
      );
      if (cancelled) return;

      const nextChannel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void loadRecommendations(true))
        .on("postgres_changes", { event: "*", schema: "public", table: "follows" }, (payload) => {
          if ((payload.new as any)?.follower_id === user.id || (payload.old as any)?.follower_id === user.id) return;
          void loadRecommendations(true);
        });

      if (cancelled) {
        await supabase.removeChannel(nextChannel).catch(() => {});
        return;
      }
      channel = nextChannel;
      channel.subscribe();
    };
    void setupChannel();

    return () => {
      cancelled = true;
      clearInterval(heartbeatTimer);
      clearInterval(pollTimer);
      if (channel) {
        void supabase.removeChannel(channel).catch(() => {});
        channel = null;
      }
    };
  }, [loadRecommendations, user]);

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
  for (let index = 0; index < people.length; index += 2) {
    gridRows.push(people.slice(index, index + 2));
  }
  const hasResults = people.length > 0;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 112 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); void loadRecommendations(); }}
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
                      {person.mutualAvatar ? (
                        <ExpoImage
                          source={{ uri: person.mutualAvatar }}
                          style={styles.mutualAvatar}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View style={[styles.mutualAvatarFallback, { backgroundColor: colors.inputBg }]}>
                          <Ionicons name="people" size={13} color={colors.textMuted} />
                        </View>
                      )}
                      <Text style={[styles.mutualCopy, { color: colors.textMuted }]} numberOfLines={2}>
                        Followed by <Text style={[styles.mutualName, { color: colors.text }]}>{person.mutualName || "your connection"}</Text>
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
  mutualRow: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 7, marginHorizontal: 10, marginTop: 8, marginBottom: 8 },
  mutualAvatar: { width: 26, height: 26, borderRadius: 13 },
  mutualAvatarFallback: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  mutualCopy: { flex: 1, fontSize: 10, lineHeight: 13 },
  mutualName: { fontFamily: "Inter_600SemiBold" },
  connectButton: { minHeight: 38, borderWidth: 1.4, borderRadius: 20, marginHorizontal: 12, alignItems: "center", justifyContent: "center" },
  connectText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  skeletonBody: { alignItems: "center", paddingHorizontal: 12, marginTop: -34 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 38, gap: 11 },
  emptyCopy: { fontSize: 12, lineHeight: 18, textAlign: "center", maxWidth: 270 },
  emptyAction: { minHeight: 34, borderWidth: 1, borderRadius: 17, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  emptyActionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});