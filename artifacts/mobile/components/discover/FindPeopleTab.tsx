import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { navigateToKnownProfile } from "@/lib/navigateToProfile";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Skeleton } from "@/components/ui/Skeleton";

type Person = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  follower_count: number;
  is_verified: boolean;
  is_organization_verified: boolean;
  last_seen: string | null;
  is_following: boolean;
  is_following_me: boolean;
};

type Filter = "all" | "online" | "recent";
type DiscoveryType = "all" | "people" | "groups" | "channels";
type PublicGroup = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  member_count: number;
  is_member: boolean;
};
type PublicChannel = {
  id: string;
  name: string;
  handle: string | null;
  description: string | null;
  avatar_url: string | null;
  subscriber_count: number;
  is_verified: boolean;
  is_subscriber: boolean;
};
const ONLINE_WINDOW = 10 * 60_000;
const RECENT_WINDOW = 24 * 60 * 60_000;

function isOnline(lastSeen: string | null) {
  return !!lastSeen && Date.now() - new Date(lastSeen).getTime() <= ONLINE_WINDOW;
}

function relativeSeen(lastSeen: string | null) {
  if (!lastSeen) return "Not active recently";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60_000));
  if (minutes < 1) return "Active now";
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  return "Active recently";
}

function Avatar({ person, accent }: { person: Person; accent: string }) {
  return person.avatar_url ? (
    <ExpoImage source={{ uri: person.avatar_url }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
  ) : (
    <View style={[styles.avatar, { backgroundColor: accent + "20" }]}>
      <Text style={[styles.initial, { color: accent }]}>
        {(person.display_name || person.handle || "?")[0].toUpperCase()}
      </Text>
    </View>
  );
}

export default function FindPeopleTab() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [discoveryType, setDiscoveryType] = useState<DiscoveryType>("all");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  const loadPeople = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      // This is deliberately a live presence query, not a recommendation or
      // history query. last_seen is updated by the session heartbeat.
      const [
        { data, error: profileError },
        { data: follows, error: followError },
        { data: followers, error: followersError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, handle, avatar_url, bio, follower_count, is_verified, is_organization_verified, last_seen")
          .neq("id", user.id)
          .eq("onboarding_completed", true)
          .eq("is_banned", false)
          .eq("account_deleted", false)
          .not("handle", "is", null)
          .not("display_name", "is", null)
          .not("avatar_url", "is", null)
          .not("bio", "is", null)
          .order("last_seen", { ascending: false, nullsFirst: false })
          .limit(100),
        supabase.from("follows").select("following_id").eq("follower_id", user.id),
        supabase.from("follows").select("follower_id").eq("following_id", user.id),
      ]);
      if (profileError) throw profileError;
      if (followError) throw followError;
      if (followersError) throw followersError;

      const [
        { data: groupData, error: groupError },
        { data: memberships, error: membershipError },
        { data: channelData, error: channelError },
        { data: subscriptions, error: subscriptionError },
      ] = await Promise.all([
        supabase
          .from("chats")
          .select("id, name, description, avatar_url, is_group, is_channel, is_public, chat_members(count)")
          .eq("is_group", true)
          .eq("is_public", true)
          .order("updated_at", { ascending: false })
          .limit(30),
        supabase.from("chat_members").select("chat_id").eq("user_id", user.id),
        supabase
          .from("channels")
          .select("id, name, handle, description, avatar_url, subscriber_count, is_verified, is_public")
          .eq("is_public", true)
          .order("subscriber_count", { ascending: false })
          .limit(30),
        supabase.from("channel_subscriptions").select("channel_id").eq("user_id", user.id),
      ]);
      const followed = new Set((follows ?? []).map((row: any) => row.following_id));
      const followingMe = new Set((followers ?? []).map((row: any) => row.follower_id));
      const memberSet = new Set((memberships ?? []).map((row: any) => row.chat_id));
      const subscriptionSet = new Set((subscriptions ?? []).map((row: any) => row.channel_id));
      const completeProfiles = ((data ?? []) as any[]).filter((person) =>
        typeof person.handle === "string" && person.handle.trim().length > 0 &&
        typeof person.display_name === "string" && person.display_name.trim().length > 0 &&
        typeof person.avatar_url === "string" && person.avatar_url.trim().length > 0 &&
        typeof person.bio === "string" && person.bio.trim().length > 0
      );
      const profileIds = completeProfiles.map((person) => person.id);
      const { data: followerRows } = profileIds.length
        ? await supabase.from("follows").select("following_id").in("following_id", profileIds)
        : { data: [] as any[] };
      const followerCounts = new Map<string, number>();
      (followerRows ?? []).forEach((row: any) => {
        followerCounts.set(row.following_id, (followerCounts.get(row.following_id) ?? 0) + 1);
      });
      setPeople(completeProfiles
        .filter((person) =>
          typeof person.handle === "string" && person.handle.trim().length > 0 &&
          typeof person.display_name === "string" && person.display_name.trim().length > 0 &&
          typeof person.avatar_url === "string" && person.avatar_url.trim().length > 0 &&
          typeof person.bio === "string" && person.bio.trim().length > 0
        )
        .map((person) => ({
          id: person.id,
          display_name: person.display_name.trim(),
          handle: person.handle.trim(),
          avatar_url: person.avatar_url,
          bio: person.bio.trim(),
          // Always derive this from relationship rows, never the cached profile counter.
          follower_count: followerCounts.get(person.id) ?? 0,
          is_verified: !!person.is_verified,
          is_organization_verified: !!person.is_organization_verified,
          last_seen: person.last_seen || null,
          is_following: followed.has(person.id),
          is_following_me: followingMe.has(person.id),
        })));
      if (!groupError && !membershipError) {
        setGroups(((groupData ?? []) as any[]).map((group) => ({
          id: group.id,
          name: group.name || "Unnamed group",
          description: group.description || null,
          avatar_url: group.avatar_url || null,
          member_count: Array.isArray(group.chat_members) && group.chat_members[0]?.count != null
            ? Number(group.chat_members[0].count)
            : 0,
          is_member: memberSet.has(group.id),
        })));
      }
      if (!channelError && !subscriptionError) {
        setChannels(((channelData ?? []) as any[]).map((channel) => ({
          id: channel.id,
          name: channel.name || "Unnamed channel",
          handle: channel.handle || null,
          description: channel.description || null,
          avatar_url: channel.avatar_url || null,
          subscriber_count: Number(channel.subscriber_count || 0),
          is_verified: !!channel.is_verified,
          is_subscriber: subscriptionSet.has(channel.id),
        })));
      }
      setLastUpdated(Date.now());
    } catch {
      setError("Live users could not be loaded right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadPeople();
  }, [loadPeople, user]);

  useEffect(() => {
    if (!user) return;
    // Keep the current user eligible for the live feed while this tab is open.
    const heartbeat = () => {
      supabase.rpc("update_last_seen").then(() => {}, () => {});
    };
    heartbeat();
    const heartbeatTimer = setInterval(heartbeat, 60_000);
    const pollTimer = setInterval(() => void loadPeople(true), 30_000);
    const channelName = `find-presence-${user.id}`;
    const channelTopic = `realtime:${channelName}`;
    let channel: import("@supabase/supabase-js").RealtimeChannel | null = null;
    let cancelled = false;

    // Strict Mode and fast route/auth changes can remount this effect while
    // an earlier channel with the same topic is still subscribed. Remove
    // stale channels before adding callbacks to the replacement channel.
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
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void loadPeople(true))
        .on("postgres_changes", { event: "*", schema: "public", table: "chats" }, () => void loadPeople(true))
        .on("postgres_changes", { event: "*", schema: "public", table: "channels" }, () => void loadPeople(true))
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_members" }, () => void loadPeople(true))
        .on("postgres_changes", { event: "*", schema: "public", table: "channel_subscriptions" }, () => void loadPeople(true));

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
  }, [loadPeople, user]);

  const visiblePeople = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people.filter((person) => {
      const matchesQuery = !needle || person.display_name.toLowerCase().includes(needle) || person.handle.toLowerCase().includes(needle);
      const age = person.last_seen ? Date.now() - new Date(person.last_seen).getTime() : Infinity;
      const matchesFilter = filter === "all" || (filter === "online" ? age <= ONLINE_WINDOW : age <= RECENT_WINDOW);
      return matchesQuery && matchesFilter;
    }).sort((a, b) => Number(isOnline(b.last_seen)) - Number(isOnline(a.last_seen)));
  }, [filter, lastUpdated, people, query]);

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups.filter((group) =>
      !needle ||
      group.name.toLowerCase().includes(needle) ||
      (group.description || "").toLowerCase().includes(needle)
    );
  }, [groups, query]);

  const visibleChannels = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return channels.filter((channel) =>
      !needle ||
      channel.name.toLowerCase().includes(needle) ||
      (channel.handle || "").toLowerCase().includes(needle) ||
      (channel.description || "").toLowerCase().includes(needle)
    );
  }, [channels, query]);

  const joinGroup = useCallback(async (group: PublicGroup) => {
    if (!user) return router.push("/(auth)/login" as any);
    if (group.is_member) {
      return router.push({ pathname: "/chat/[id]", params: { id: group.id } } as any);
    }
    setJoiningId(group.id);
    const { error: joinError } = await supabase.from("chat_members").insert({
      chat_id: group.id,
      user_id: user.id,
      is_admin: false,
    });
    if (!joinError) {
      setGroups((current) => current.map((item) => item.id === group.id
        ? { ...item, is_member: true, member_count: item.member_count + 1 }
        : item));
      router.push({ pathname: "/chat/[id]", params: { id: group.id } } as any);
    } else {
      setError("Could not join that group right now.");
    }
    setJoiningId(null);
  }, [user]);

  const openChannel = useCallback((channel: PublicChannel) => {
    if (!user) return router.push("/(auth)/login" as any);
    router.push({
      pathname: "/chat/[id]",
      params: {
        id: channel.id,
        isChannel: "true",
        channelRole: channel.is_subscriber ? "member" : "",
        chatName: channel.name,
      },
    } as any);
  }, [user]);

  const toggleFollow = useCallback(async (person: Person) => {
    if (!user) return router.push("/(auth)/login" as any);
    setFollowBusy(person.id);
    const next = !person.is_following;
    setPeople((current) => current.map((item) => item.id === person.id
      ? { ...item, is_following: next, follower_count: Math.max(0, item.follower_count + (next ? 1 : -1)) }
      : item));
    try {
      const result = next
        ? await supabase.from("follows").insert({ follower_id: user.id, following_id: person.id })
        : await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", person.id);
      if (result.error) throw result.error;
    } catch {
      setPeople((current) => current.map((item) => item.id === person.id
        ? { ...item, is_following: !next, follower_count: Math.max(0, item.follower_count + (next ? -1 : 1)) }
        : item));
    } finally {
      setFollowBusy(null);
    }
  }, [user]);

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <View style={[styles.heroIcon, { backgroundColor: accent + "18" }]}><Ionicons name="radio" size={32} color={accent} /></View>
        <Text style={[styles.title, { color: colors.text }]}>Find your people</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Sign in to see who is active on AfuChat right now.</Text>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: accent }]} onPress={() => router.push("/(auth)/login" as any)}>
          <Text style={styles.primaryButtonText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const showPeople = discoveryType === "all" || discoveryType === "people";
  const showGroups = discoveryType === "all" || discoveryType === "groups";
  const showChannels = discoveryType === "all" || discoveryType === "channels";
  const hasResults =
    (showPeople && visiblePeople.length > 0) ||
    (showGroups && visibleGroups.length > 0) ||
    (showChannels && visibleChannels.length > 0);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 112 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); void loadPeople(); }}
          tintColor={accent}
        />
      }
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.pageHeader}>
        <View style={styles.pageHeading}>
          <Text style={[styles.eyebrow, { color: accent }]}>DISCOVER</Text>
          <Text style={[styles.pageTitle, { color: colors.text }]}>Find your people</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>People, groups and channels</Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => { setRefreshing(true); void loadPeople(); }}
          accessibilityRole="button"
          accessibilityLabel="Refresh discovery"
          testID="discover-refresh"
        >
          <Ionicons name="refresh" size={19} color={accent} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people or places"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
            accessibilityLabel="Search people, groups and channels"
            testID="discover-search"
          />
          {!!query && (
            <TouchableOpacity
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
        accessibilityLabel="Discovery categories"
      >
        {([
          ["all", "All"],
          ["people", "People"],
          ["groups", "Groups"],
          ["channels", "Channels"],
        ] as const).map(([value, label]) => (
          <TouchableOpacity
            key={value}
            onPress={() => setDiscoveryType(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: discoveryType === value }}
            style={[
              styles.categoryChip,
              {
                backgroundColor: discoveryType === value ? accent : colors.surface,
                borderColor: discoveryType === value ? accent : colors.border,
              },
            ]}
          >
            <Text style={[styles.categoryText, { color: discoveryType === value ? "#fff" : colors.textMuted }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {(discoveryType === "all" || discoveryType === "people") && (
        <View style={styles.activityFilters}>
          <Text style={[styles.activityLabel, { color: colors.textMuted }]}>PEOPLE</Text>
          <View style={styles.filterRow}>
            {([
              ["all", "Everyone"],
              ["online", "Online"],
              ["recent", "Today"],
            ] as const).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                onPress={() => setFilter(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === value }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: filter === value ? accent + "14" : "transparent",
                    borderColor: filter === value ? accent + "40" : "transparent",
                  },
                ]}
              >
                {value === "online" && <View style={[styles.tinyDot, { backgroundColor: colors.online }]} />}
                <Text style={[styles.filterText, { color: filter === value ? accent : colors.textMuted }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {loading && people.length === 0 && groups.length === 0 && channels.length === 0 ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardRail}
          accessibilityLabel="Loading discover results"
        >
          {[0, 1, 2, 3].map((item) => (
            <View key={item} style={[styles.personCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.skeletonIdentity}>
                <Skeleton width={48} height={48} borderRadius={24} />
                <View style={{ gap: 8 }}>
                  <Skeleton width={100} height={13} borderRadius={5} />
                  <Skeleton width={76} height={10} borderRadius={4} />
                </View>
              </View>
              <Skeleton width="100%" height={28} borderRadius={8} />
              <Skeleton width={96} height={30} borderRadius={16} />
            </View>
          ))}
        </ScrollView>
      ) : error && people.length === 0 && groups.length === 0 && channels.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.emptyIcon, { backgroundColor: accent + "14" }]}>
            <Ionicons name="cloud-offline-outline" size={22} color={accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Couldn’t load discovery</Text>
          <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.emptyAction, { backgroundColor: accent }]}
            onPress={() => void loadPeople()}
            accessibilityRole="button"
          >
            <Text style={styles.emptyActionText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !hasResults ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="search-outline" size={22} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No matches yet</Text>
          <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>
            {query ? "Try another search." : "New people and public spaces will appear here."}
          </Text>
          {(query || discoveryType !== "all" || filter !== "all") && (
            <TouchableOpacity
              style={[styles.clearFilters, { borderColor: colors.border }]}
              onPress={() => {
                setQuery("");
                setDiscoveryType("all");
                setFilter("all");
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.clearFiltersText, { color: colors.text }]}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          {showPeople && visiblePeople.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>People</Text>
                  <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{visiblePeople.length}</Text>
                </View>
                {discoveryType === "all" && (
                  <TouchableOpacity onPress={() => setDiscoveryType("people")} accessibilityRole="button">
                    <Text style={[styles.seeAll, { color: accent }]}>See all</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRail}>
                {visiblePeople.map((person) => {
                  const online = isOnline(person.last_seen);
                  const followLabel = person.is_following && person.is_following_me
                    ? "Friend"
                    : person.is_following
                      ? "Following"
                      : person.is_following_me
                        ? "Follow back"
                        : "Follow";
                  return (
                    <View key={person.id} style={[styles.personCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <TouchableOpacity
                        style={styles.personIdentity}
                        onPress={() => navigateToKnownProfile(person)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${person.display_name}'s profile`}
                      >
                        <View>
                          <Avatar person={person} accent={accent} />
                          {online && <View style={[styles.onlineDot, { backgroundColor: colors.online, borderColor: colors.surface }]} />}
                        </View>
                        <View style={styles.personDetails}>
                          <View style={styles.personNameRow}>
                            <Text style={[styles.personName, { color: colors.text }]} numberOfLines={1}>{person.display_name}</Text>
                            {(person.is_verified || person.is_organization_verified) && (
                              <Ionicons name="checkmark-circle" size={15} color={accent} />
                            )}
                          </View>
                          <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>@{person.handle}</Text>
                        </View>
                      </TouchableOpacity>
                      <Text style={[styles.personBio, { color: colors.textMuted }]} numberOfLines={2}>
                        {person.bio || "AfuChat member"}
                      </Text>
                      <View style={styles.personFooter}>
                        <Text style={[styles.personActivity, { color: online ? colors.online : colors.textMuted }]} numberOfLines={1}>
                          {relativeSeen(person.last_seen)}
                        </Text>
                        <Text style={[styles.personFollowers, { color: colors.textMuted }]}>
                          {person.follower_count.toLocaleString()} followers
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.personAction,
                          {
                            backgroundColor: person.is_following ? colors.inputBg : accent,
                            borderColor: person.is_following ? colors.border : accent,
                          },
                        ]}
                        onPress={() => void toggleFollow(person)}
                        disabled={followBusy === person.id}
                        accessibilityRole="button"
                      >
                        {followBusy === person.id
                          ? <ActivityIndicator size="small" color={person.is_following ? colors.textMuted : "#fff"} />
                          : <Text style={[styles.actionText, { color: person.is_following ? colors.text : "#fff" }]}>{followLabel}</Text>}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {showGroups && visibleGroups.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Groups</Text>
                  <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{visibleGroups.length}</Text>
                </View>
                {discoveryType === "all" && (
                  <TouchableOpacity onPress={() => setDiscoveryType("groups")} accessibilityRole="button">
                    <Text style={[styles.seeAll, { color: accent }]}>See all</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRail}>
                {visibleGroups.map((group) => (
                  <View key={group.id} style={[styles.communityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TouchableOpacity style={styles.communityMain} onPress={() => void joinGroup(group)} activeOpacity={0.75}>
                      {group.avatar_url
                        ? <ExpoImage source={{ uri: group.avatar_url }} style={styles.communityAvatar} contentFit="cover" cachePolicy="memory-disk" />
                        : <View style={[styles.communityAvatar, styles.communityPlaceholder, { backgroundColor: accent + "16" }]}><Ionicons name="people" size={23} color={accent} /></View>}
                      <Text style={[styles.communityName, { color: colors.text }]} numberOfLines={1}>{group.name}</Text>
                      <Text style={[styles.communityDescription, { color: colors.textMuted }]} numberOfLines={2}>{group.description || "Public group"}</Text>
                      <Text style={[styles.communityMeta, { color: colors.textMuted }]}>{group.member_count.toLocaleString()} members</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.communityAction, { backgroundColor: group.is_member ? colors.inputBg : accent }]}
                      onPress={() => void joinGroup(group)}
                      disabled={joiningId === group.id}
                      accessibilityRole="button"
                    >
                      {joiningId === group.id
                        ? <ActivityIndicator size="small" color={group.is_member ? colors.textMuted : "#fff"} />
                        : <Text style={[styles.actionText, { color: group.is_member ? colors.text : "#fff" }]}>{group.is_member ? "Open" : "Join"}</Text>}
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {showChannels && visibleChannels.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Channels</Text>
                  <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{visibleChannels.length}</Text>
                </View>
                {discoveryType === "all" && (
                  <TouchableOpacity onPress={() => setDiscoveryType("channels")} accessibilityRole="button">
                    <Text style={[styles.seeAll, { color: accent }]}>See all</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRail}>
                {visibleChannels.map((channel) => (
                  <View key={channel.id} style={[styles.communityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TouchableOpacity style={styles.communityMain} onPress={() => openChannel(channel)} activeOpacity={0.75}>
                      {channel.avatar_url
                        ? <ExpoImage source={{ uri: channel.avatar_url }} style={styles.communityAvatar} contentFit="cover" cachePolicy="memory-disk" />
                        : <View style={[styles.communityAvatar, styles.communityPlaceholder, { backgroundColor: accent + "16" }]}><Ionicons name="megaphone" size={22} color={accent} /></View>}
                      <View style={styles.communityNameRow}>
                        <Text style={[styles.communityName, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>{channel.name}</Text>
                        {channel.is_verified && <Ionicons name="checkmark-circle" size={15} color={accent} />}
                      </View>
                      <Text style={[styles.communityMeta, { color: colors.textMuted }]} numberOfLines={1}>
                        {channel.handle ? `@${channel.handle}` : "Public channel"}
                      </Text>
                      <Text style={[styles.communityDescription, { color: colors.textMuted }]} numberOfLines={2}>
                        {channel.description || "Public channel"}
                      </Text>
                      <Text style={[styles.communityMeta, { color: colors.textMuted }]}>
                        {channel.subscriber_count.toLocaleString()} subscribers
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.communityAction, { backgroundColor: channel.is_subscriber ? colors.inputBg : accent }]}
                      onPress={() => openChannel(channel)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.actionText, { color: channel.is_subscriber ? colors.text : "#fff" }]}>
                        {channel.is_subscriber ? "Open" : "View"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </>
      )}
      {!!error && hasResults && <Text style={[styles.inlineError, { color: colors.textMuted }]}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  pageContent: { flexGrow: 1, paddingTop: 20 },
  inlineError: { fontSize: 12, marginTop: 8, marginBottom: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 320 },
  primaryButton: { minHeight: 46, borderRadius: 23, paddingHorizontal: 24, justifyContent: "center" },
  primaryButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  pageHeading: { flex: 1, gap: 3 },
  eyebrow: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  pageTitle: { fontSize: 24, lineHeight: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  refreshButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center", marginLeft: 12 },
  searchBox: { height: 48, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  categoryRow: { gap: 8, paddingVertical: 15, paddingRight: 4 },
  categoryChip: { minHeight: 36, paddingHorizontal: 15, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  categoryText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  activityFilters: { marginBottom: 7 },
  activityLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.9, marginBottom: 5 },
  filterRow: { flexDirection: "row", gap: 6 },
  filterChip: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, borderRadius: 15, borderWidth: 1 },
  filterText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tinyDot: { width: 6, height: 6, borderRadius: 3 },
  section: { marginTop: 18 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  sectionCount: { fontSize: 11, fontFamily: "Inter_500Medium" },
  seeAll: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cardRail: { gap: 10, paddingRight: 4, paddingBottom: 4 },
  personCard: { width: 230, minHeight: 204, borderRadius: 18, borderWidth: 1, padding: 13, justifyContent: "space-between", gap: 11 },
  skeletonIdentity: { flexDirection: "row", alignItems: "center", gap: 10 },
  personIdentity: { flexDirection: "row", alignItems: "center", gap: 11 },
  personDetails: { flex: 1, minWidth: 0 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  initial: { fontSize: 20, fontFamily: "Inter_700Bold" },
  onlineDot: { position: "absolute", right: 0, bottom: 1, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  personNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  personName: { flexShrink: 1, fontSize: 13, fontFamily: "Inter_700Bold" },
  handle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  personBio: { fontSize: 12, lineHeight: 17, minHeight: 34 },
  personFooter: { gap: 3 },
  personActivity: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  personFollowers: { fontSize: 10, fontFamily: "Inter_400Regular" },
  personAction: { height: 34, borderWidth: 1, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  actionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  communityCard: { width: 210, minHeight: 224, borderRadius: 18, borderWidth: 1, padding: 12, justifyContent: "space-between" },
  communityMain: { flex: 1 },
  communityAvatar: { width: 50, height: 50, borderRadius: 15, marginBottom: 10 },
  communityPlaceholder: { alignItems: "center", justifyContent: "center" },
  communityNameRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 },
  communityName: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 4 },
  communityDescription: { fontSize: 11, lineHeight: 16, minHeight: 32 },
  communityMeta: { fontSize: 10, fontFamily: "Inter_600SemiBold", marginTop: 6 },
  communityAction: { height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginTop: 10 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 38, gap: 11 },
  emptyIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyCopy: { fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 270 },
  emptyAction: { minHeight: 36, borderRadius: 18, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  emptyActionText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  clearFilters: { minHeight: 34, borderWidth: 1, borderRadius: 17, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  clearFiltersText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});