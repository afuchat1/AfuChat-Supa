import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { navigateToProfile } from "@/lib/navigateToProfile";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
    const channel = supabase
      .channel(`find-presence-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void loadPeople(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "chats" }, () => void loadPeople(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "channels" }, () => void loadPeople(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_members" }, () => void loadPeople(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_subscriptions" }, () => void loadPeople(true))
      .subscribe();
    return () => {
      clearInterval(heartbeatTimer);
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, flex: 1 }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people, groups, and channels"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={[styles.refreshButton, { backgroundColor: accent + "14" }]} onPress={() => { setRefreshing(true); void loadPeople(); }} accessibilityLabel="Refresh live users">
          <Ionicons name="refresh" size={20} color={accent} />
        </TouchableOpacity>
      </View>

      {(visibleGroups.length > 0 || visibleChannels.length > 0) && (
        <View style={styles.communitiesSection}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Communities</Text>
            <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>Public spaces to join</Text>
          </View>
          {visibleGroups.length > 0 && (
            <>
              <Text style={[styles.communityType, { color: colors.textMuted }]}>Groups</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.communityRail}>
                {visibleGroups.map((group) => (
                  <View key={group.id} style={[styles.communityCard, { backgroundColor: colors.surface }]}>
                    <TouchableOpacity onPress={() => void joinGroup(group)} activeOpacity={0.75}>
                      {group.avatar_url ? (
                        <ExpoImage source={{ uri: group.avatar_url }} style={styles.communityAvatar} contentFit="cover" cachePolicy="memory-disk" />
                      ) : (
                        <View style={[styles.communityAvatar, styles.communityPlaceholder, { backgroundColor: accent + "18" }]}>
                          <Ionicons name="people" size={25} color={accent} />
                        </View>
                      )}
                      <Text style={[styles.communityName, { color: colors.text }]} numberOfLines={1}>{group.name}</Text>
                      <Text style={[styles.communityDescription, { color: colors.textMuted }]} numberOfLines={2}>
                        {group.description || "Public group"}
                      </Text>
                      <Text style={[styles.communityMeta, { color: accent }]}>
                        {group.member_count.toLocaleString()} members
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.communityAction, { backgroundColor: group.is_member ? colors.inputBg : accent }]}
                      onPress={() => void joinGroup(group)}
                      disabled={joiningId === group.id}
                    >
                      {joiningId === group.id
                        ? <ActivityIndicator size="small" color={group.is_member ? colors.textMuted : "#fff"} />
                        : <Text style={{ color: group.is_member ? colors.textMuted : "#fff", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{group.is_member ? "Open" : "Join"}</Text>}
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </>
          )}
          {visibleChannels.length > 0 && (
            <>
              <Text style={[styles.communityType, { color: colors.textMuted }]}>Channels</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.communityRail}>
                {visibleChannels.map((channel) => (
                  <View key={channel.id} style={[styles.communityCard, { backgroundColor: colors.surface }]}>
                    <TouchableOpacity onPress={() => openChannel(channel)} activeOpacity={0.75}>
                      {channel.avatar_url ? (
                        <ExpoImage source={{ uri: channel.avatar_url }} style={styles.communityAvatar} contentFit="cover" cachePolicy="memory-disk" />
                      ) : (
                        <View style={[styles.communityAvatar, styles.communityPlaceholder, { backgroundColor: "#8B5CF618" }]}>
                          <Ionicons name="megaphone" size={25} color="#8B5CF6" />
                        </View>
                      )}
                      <View style={styles.communityNameRow}>
                        <Text style={[styles.communityName, { color: colors.text, flex: 1 }]} numberOfLines={1}>{channel.name}</Text>
                        {channel.is_verified && <Ionicons name="checkmark-circle" size={14} color="#8B5CF6" />}
                      </View>
                      {channel.handle ? (
                        <Text style={[styles.communityMeta, { color: colors.textMuted }]} numberOfLines={1}>@{channel.handle}</Text>
                      ) : null}
                      <Text style={[styles.communityDescription, { color: colors.textMuted }]} numberOfLines={2}>
                        {channel.description || "Public channel"}
                      </Text>
                      <Text style={[styles.communityMeta, { color: "#8B5CF6" }]}>
                        {channel.subscriber_count.toLocaleString()} subscribers
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.communityAction, { backgroundColor: channel.is_subscriber ? colors.inputBg : "#8B5CF6" }]}
                      onPress={() => openChannel(channel)}
                    >
                      <Text style={{ color: channel.is_subscriber ? colors.textMuted : "#fff", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{channel.is_subscriber ? "Open" : "View"}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      )}

      <View style={styles.filterRow}>
        {([["all", "Everyone"], ["online", "Online now"], ["recent", "Active today"]] as const).map(([value, label]) => (
          <TouchableOpacity key={value} onPress={() => setFilter(value)} style={[styles.filterChip, { backgroundColor: filter === value ? accent : colors.surface }]}>
            {value === "online" && <View style={[styles.tinyDot, { backgroundColor: filter === value ? "#fff" : "#36C96F" }]} />}
            <Text style={[styles.filterText, { color: filter === value ? "#fff" : colors.textMuted }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 10 }]}>People</Text>
      {loading && people.length === 0 ? <View style={styles.center}><ActivityIndicator color={accent} /></View> : error && people.length === 0 ? (
        <View style={styles.center}><Ionicons name="cloud-offline-outline" size={30} color={colors.textMuted} /><Text style={[styles.subtitle, { color: colors.textMuted }]}>{error}</Text><TouchableOpacity onPress={() => void loadPeople()}><Text style={{ color: accent, fontFamily: "Inter_600SemiBold" }}>Try again</Text></TouchableOpacity></View>
      ) : (
        <FlatList
          data={visiblePeople}
          keyExtractor={(item) => item.id}
          style={styles.peopleList}
          contentContainerStyle={visiblePeople.length
            ? [styles.list, { paddingBottom: insets.bottom + 112 }]
            : [styles.emptyList, { paddingBottom: insets.bottom + 112 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadPeople(); }} tintColor={accent} />}
          renderItem={({ item }) => (
            <View style={[styles.personCard, { backgroundColor: colors.surface }]}>
              <TouchableOpacity style={styles.personIdentity} onPress={() => navigateToProfile(item.handle, true).catch(() => {})} activeOpacity={0.75}>
                <View><Avatar person={item} accent={accent} />{isOnline(item.last_seen) && <View style={[styles.onlineDot, { backgroundColor: "#36C96F", borderColor: colors.surface }]} />}</View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}><Text style={[styles.personName, { color: colors.text }]} numberOfLines={1}>{item.display_name}</Text>{(item.is_verified || item.is_organization_verified) && <Ionicons name="checkmark-circle" size={15} color={accent} />}</View>
                  <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>@{item.handle} · {item.follower_count} followers</Text>
                  <Text style={[styles.activity, { color: isOnline(item.last_seen) ? "#36C96F" : colors.textMuted }]}>{relativeSeen(item.last_seen)}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.followButton, { borderColor: item.is_following ? colors.border : accent, backgroundColor: item.is_following ? "transparent" : accent }]} onPress={() => void toggleFollow(item)} disabled={followBusy === item.id}>
                {followBusy === item.id ? <ActivityIndicator size="small" color={item.is_following ? accent : "#fff"} /> : <Text style={{ color: item.is_following ? accent : "#fff", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{item.is_following && item.is_following_me ? "Friend" : item.is_following ? "Following" : item.is_following_me ? "Follow back" : "Follow"}</Text>}
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<View style={styles.center}><Ionicons name={filter === "online" ? "radio-outline" : "people-outline"} size={34} color={colors.textMuted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No users match this view</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>{query ? "Try a different name or username." : "Check back soon. People will appear here as they come online."}</Text></View>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  peopleList: { flex: 1, minHeight: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 320 },
  primaryButton: { minHeight: 46, borderRadius: 23, paddingHorizontal: 24, justifyContent: "center" },
  primaryButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 14, paddingBottom: 10 },
  refreshButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  searchBox: { height: 46, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  communitiesSection: { paddingBottom: 10 },
  sectionHeading: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 9 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sectionCaption: { fontSize: 12, fontFamily: "Inter_400Regular" },
  communityType: { fontSize: 12, fontFamily: "Inter_700Bold", marginBottom: 7, marginTop: 4 },
  communityRail: { gap: 10, paddingBottom: 8 },
  communityCard: { width: 190, minHeight: 214, borderRadius: 17, padding: 12 },
  communityAvatar: { width: 58, height: 58, borderRadius: 16, marginBottom: 9 },
  communityPlaceholder: { alignItems: "center", justifyContent: "center" },
  communityNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  communityName: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 3 },
  communityDescription: { fontSize: 11, lineHeight: 16, minHeight: 32 },
  communityMeta: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 5 },
  communityAction: { height: 31, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 10 },
  filterRow: { flexDirection: "row", gap: 8, paddingVertical: 14 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  filterText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tinyDot: { width: 6, height: 6, borderRadius: 3 },
  list: { paddingBottom: 24, gap: 10 },
  emptyList: { flexGrow: 1 },
  personCard: { borderRadius: 17, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  personIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  initial: { fontSize: 20, fontFamily: "Inter_700Bold" },
  onlineDot: { position: "absolute", right: 0, bottom: 1, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  personName: { maxWidth: "88%", fontSize: 14, fontFamily: "Inter_700Bold" },
  handle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  activity: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 3 },
  followButton: { minWidth: 78, height: 33, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
});