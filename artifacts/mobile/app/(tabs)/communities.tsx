import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { CachedImage } from "@/components/ui/CachedImage";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import { showAlert } from "@/lib/alert";
import { isOnline } from "@/lib/offlineStore";
import { safeRouter } from "@/lib/navUtils";
import * as Haptics from "@/lib/haptics";
import { queryCacheReadSync, queryCacheFetch, queryCacheWrite, queryCacheInvalidate } from "@/lib/storage/queryCache";
import { useThrottledFocusEffect } from "@/lib/hooks/useThrottledFocusEffect";
import { prefetchAvatars } from "@/lib/storage/imagePrefetcher";
import Colors from "@/constants/colors";

const BRAND = Colors.brand;
const PURPLE = "#8B5CF6";

// 3-minute stale window — communities don't change that fast
const CACHE_TTL_MS = 3 * 60 * 1000;
const GROUPS_KEY = "communities:groups";
const CHANNELS_KEY = "communities:channels";

type Group = {
  id: string;
  name: string;
  handle: string | null;
  description: string | null;
  avatar_url: string | null;
  member_count: number;
  am_member: boolean;
};

type Channel = {
  id: string;
  name: string;
  handle: string | null;
  description: string | null;
  avatar_url: string | null;
  subscriber_count: number;
  is_verified: boolean;
  am_subscriber: boolean;
};

type CommunityTab = "groups" | "channels";

export default function CommunitiesScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<CommunityTab>("groups");

  // ── Initialise from MMKV instantly (no async, no waterfall) ─────────────────
  const [groups, setGroups] = useState<Group[]>(() => {
    return queryCacheReadSync<Group[]>(GROUPS_KEY)?.data ?? [];
  });
  const [channels, setChannels] = useState<Channel[]>(() => {
    return queryCacheReadSync<Channel[]>(CHANNELS_KEY)?.data ?? [];
  });

  // Only show skeleton when truly cold (nothing in cache at all)
  const [loading, setLoading] = useState(() => {
    const hasGroups = (queryCacheReadSync<Group[]>(GROUPS_KEY)?.data?.length ?? 0) > 0;
    const hasChannels = (queryCacheReadSync<Channel[]>(CHANNELS_KEY)?.data?.length ?? 0) > 0;
    return !hasGroups && !hasChannels;
  });
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // ── Network fetch (used by initial load + pull-to-refresh) ──────────────────
  const fetchFromNetwork = useCallback(async (force = false) => {
    if (!user) return;

    // Pull-to-refresh: invalidate cache so queryCacheFetch waits for fresh data
    // instead of returning the stale snapshot and refreshing in background.
    if (force) {
      queryCacheInvalidate(GROUPS_KEY);
      queryCacheInvalidate(CHANNELS_KEY);
    }

    const fetchGroups = async (): Promise<Group[]> => {
      const [
        { data: groupsData },
        { data: myMemberships },
      ] = await Promise.all([
        supabase
          .from("chats")
          .select("id, name, handle, description, avatar_url, is_group, is_channel, is_private, chat_members(count)")
          .eq("is_group", true)
          .eq("is_private", false)
          .order("updated_at", { ascending: false })
          .limit(50),
        supabase.from("chat_members").select("chat_id").eq("user_id", user.id),
      ]);
      const memberSet = new Set(((myMemberships || []) as any[]).map((m) => m.chat_id));
      return (groupsData || []).map((c: any) => {
        const countArr = c.chat_members;
        const member_count =
          Array.isArray(countArr) && countArr[0]?.count != null
            ? Number(countArr[0].count)
            : 0;
        return {
          id: c.id,
          name: c.name || "Unnamed",
          handle: c.handle || null,
          description: c.description || null,
          avatar_url: c.avatar_url || null,
          member_count,
          am_member: memberSet.has(c.id),
        };
      });
    };

    const fetchChannels = async (): Promise<Channel[]> => {
      const [
        { data: channelsData },
        { data: mySubscriptions },
      ] = await Promise.all([
        supabase
          .from("channels")
          .select(
             "id, name, handle, description, avatar_url, subscriber_count, is_verified, is_public"
          )
          .eq("is_public", true)
          .order("subscriber_count", { ascending: false })
          .limit(60),
        supabase.from("channel_subscriptions").select("channel_id").eq("user_id", user.id),
      ]);
      const subSet = new Set(((mySubscriptions || []) as any[]).map((s) => s.channel_id));
      return (channelsData || []).map((c: any) => ({
        id: c.id,
        name: c.name || "Unnamed",
        handle: c.handle || null,
        description: c.description || null,
        avatar_url: c.avatar_url || null,
        subscriber_count: c.subscriber_count ?? 0,
        is_verified: !!(c as any).is_verified,
        am_subscriber: subSet.has(c.id),
      }));
    };

    // Run both fetches in parallel
    try {
      const [freshGroups, freshChannels] = await Promise.all([
        queryCacheFetch<Group[]>(GROUPS_KEY, fetchGroups, { ttlMs: CACHE_TTL_MS }),
        queryCacheFetch<Channel[]>(CHANNELS_KEY, fetchChannels, { ttlMs: CACHE_TTL_MS }),
      ]);

      if (freshGroups.data) {
        setGroups(freshGroups.data);
        prefetchAvatars(freshGroups.data.map((g) => g.avatar_url));
      }
      if (freshChannels.data) {
        setChannels(freshChannels.data);
        prefetchAvatars(freshChannels.data.map((c) => c.avatar_url));
      }
    } catch (_) {
      // Network error — keep showing cached data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // ── Initial load on mount ────────────────────────────────────────────────────
  useEffect(() => {
    // Prefetch avatars for already-cached data immediately
    const cachedGroups = groups;
    const cachedChannels = channels;
    if (cachedGroups.length) prefetchAvatars(cachedGroups.map((g) => g.avatar_url));
    if (cachedChannels.length) prefetchAvatars(cachedChannels.map((c) => c.avatar_url));

    fetchFromNetwork();
  }, [fetchFromNetwork]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Throttled focus refresh — at most once every 3 minutes ──────────────────
  useThrottledFocusEffect(
    useCallback(() => {
      if (isOnline()) fetchFromNetwork();
    }, [fetchFromNetwork]),
    { intervalMs: CACHE_TTL_MS, storageKey: "tfx:communities" },
  );

  // ── Realtime: update membership/subscription state on own changes only ───────
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("communities-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_members", filter: `user_id=eq.${user.id}` }, () => fetchFromNetwork(true))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_members", filter: `user_id=eq.${user.id}` }, () => fetchFromNetwork(true))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "channel_subscriptions", filter: `user_id=eq.${user.id}` }, () => fetchFromNetwork(true))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "channel_subscriptions", filter: `user_id=eq.${user.id}` }, () => fetchFromNetwork(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchFromNetwork]);

  async function refresh() {
    setRefreshing(true);
    await fetchFromNetwork(true);
  }

  async function joinOrOpenGroup(item: Group) {
    if (!user) return;
    if (item.am_member) {
      safeRouter.push({ pathname: "/chat/[id]", params: { id: item.id } });
      return;
    }
    if (!isOnline()) { showAlert("No internet", "An internet connection is required to join."); return; }
    setJoiningId(item.id);
    await supabase.from("chat_members").insert({ chat_id: item.id, user_id: user.id, is_admin: false });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Optimistic update + cache write
    setGroups((prev) => {
      const updated = prev.map((g) => g.id === item.id ? { ...g, am_member: true, member_count: g.member_count + 1 } : g);
      queryCacheWrite(GROUPS_KEY, updated);
      return updated;
    });
    setJoiningId(null);
    safeRouter.push({ pathname: "/chat/[id]", params: { id: item.id } });
  }

  async function subscribeOrOpenChannel(item: Channel) {
    if (!user) return safeRouter.push("/(auth)/login" as any);
    safeRouter.push({ pathname: "/chat/[id]", params: {
      id: item.id,
      isChannel: "true",
      chatName: item.name,
      chatAvatar: item.avatar_url || "",
      channelHandle: item.handle || "",
    } } as any);
  }

  function GroupCard({ item }: { item: Group }) {
    const isJoining = joiningId === item.id;
    return (
      <View>
        <TouchableOpacity
          style={[ss.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => joinOrOpenGroup(item)}
          activeOpacity={0.75}
        >
          <View style={ss.cardAvatarWrap}>
            {item.avatar_url ? (
              <CachedImage
                uri={item.avatar_url}
                cacheType="avatar"
                style={ss.cardAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={[ss.cardAvatarPlaceholder, { backgroundColor: BRAND + "22" }]}>
                <Ionicons name="people" size={26} color={BRAND} />
              </View>
            )}
          </View>
          <View style={ss.cardBody}>
            <Text style={[ss.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            {item.handle ? (
              <Text style={[ss.cardMeta, { color: BRAND, marginBottom: 2 }]} numberOfLines={1}>
                @{item.handle}
              </Text>
            ) : null}
            {item.description ? (
              <Text style={[ss.cardDesc, { color: colors.textMuted }]} numberOfLines={2}>{item.description}</Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Ionicons name="people" size={12} color={BRAND} />
              <Text style={[ss.cardMeta, { color: BRAND }]}>
                {item.member_count.toLocaleString()} members
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[ss.joinBtn, item.am_member ? { backgroundColor: colors.inputBg } : { backgroundColor: BRAND }]}
            onPress={() => joinOrOpenGroup(item)}
            disabled={isJoining}
            activeOpacity={0.8}
          >
            {isJoining ? (
              <ActivityIndicator color={item.am_member ? colors.textMuted : "#fff"} size="small" />
            ) : (
              <Text style={[ss.joinBtnText, { color: item.am_member ? colors.textMuted : "#fff" }]}>
                {item.am_member ? "Open" : "Join"}
              </Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  }

  function ChannelCard({ item }: { item: Channel }) {
    const isJoining = joiningId === item.id;
    return (
      <View>
        <TouchableOpacity
          style={[ss.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => subscribeOrOpenChannel(item)}
          activeOpacity={0.75}
        >
          <View style={ss.cardAvatarWrap}>
            {item.avatar_url ? (
              <CachedImage
                uri={item.avatar_url}
                cacheType="avatar"
                style={ss.cardAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={[ss.cardAvatarPlaceholder, { backgroundColor: PURPLE + "22" }]}>
                <Ionicons name="megaphone" size={26} color={PURPLE} />
              </View>
            )}
          </View>
          <View style={ss.cardBody}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={[ss.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
              {item.is_verified && (
                <Ionicons name="checkmark-circle" size={14} color={PURPLE} />
              )}
            </View>
            {item.handle ? (
              <Text style={[ss.cardMeta, { color: PURPLE, marginBottom: 2 }]} numberOfLines={1}>
                @{item.handle}
              </Text>
            ) : null}
            {item.description ? (
              <Text style={[ss.cardDesc, { color: colors.textMuted }]} numberOfLines={1}>{item.description}</Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <Ionicons name="people" size={12} color={PURPLE} />
              <Text style={[ss.cardMeta, { color: PURPLE }]}>
                {item.subscriber_count.toLocaleString()} subscribers
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              ss.joinBtn,
              item.am_subscriber ? { backgroundColor: colors.inputBg } : { backgroundColor: PURPLE },
            ]}
            onPress={() => subscribeOrOpenChannel(item)}
            disabled={isJoining}
            activeOpacity={0.8}
          >
            {isJoining ? (
              <ActivityIndicator color={item.am_subscriber ? colors.textMuted : "#fff"} size="small" />
            ) : (
              <Text style={[ss.joinBtnText, { color: item.am_subscriber ? colors.textMuted : "#fff" }]}>
                {item.am_subscriber ? "Open" : "View"}
              </Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  }

  const listData = activeTab === "groups" ? groups : channels;

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <GlassHeader
        title="Communities"
        showBack={false}
        right={
          <TouchableOpacity
            style={[ss.createBtn, { backgroundColor: activeTab === "groups" ? colors.accent : PURPLE }]}
            onPress={() =>
              safeRouter.push(activeTab === "groups" ? ("/group/create" as any) : ("/channel/intro" as any))
            }
            hitSlop={8}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={ss.createBtnText}>
              {activeTab === "groups" ? "New Group" : "New Channel"}
            </Text>
          </TouchableOpacity>
        }
      />

      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[ss.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            {(["groups", "channels"] as CommunityTab[]).map((tab) => {
              const isActive = activeTab === tab;
              const label = tab === "groups" ? "Groups" : "Channels";
              const icon = tab === "groups" ? "people" : "megaphone";
              const accentColor = tab === "groups" ? BRAND : PURPLE;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[ss.tab, isActive && { borderBottomColor: accentColor, borderBottomWidth: 2 }]}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={icon} size={16} color={isActive ? accentColor : colors.textMuted} />
                  <Text
                    style={[
                      ss.tabLabel,
                      { color: isActive ? accentColor : colors.textMuted },
                      isActive && { fontFamily: "Inter_600SemiBold" },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading ? (
            <View style={{ padding: 8, gap: 4 }}>
              {[1,2,3,4,5,6].map(i => <ListRowSkeleton key={i} />)}
            </View>
          ) : listData.length === 0 ? (
            <View style={ss.empty}>
              <View style={[ss.emptyIcon, { backgroundColor: colors.surface }]}>
                <Ionicons
                  name={activeTab === "groups" ? "people" : "megaphone"}
                  size={40}
                  color={colors.textMuted}
                />
              </View>
              <Text style={[ss.emptyTitle, { color: colors.text }]}>
                No public {activeTab} yet
              </Text>
              <Text style={[ss.emptySub, { color: colors.textSecondary }]}>
                {activeTab === "groups"
                  ? "Create a public group and toggle visibility so others can discover it here."
                  : "Create a public channel to broadcast to your audience."}
              </Text>
              <TouchableOpacity
                style={[ss.emptyBtn, { backgroundColor: activeTab === "groups" ? BRAND : PURPLE }]}
                onPress={() =>
                  safeRouter.push(activeTab === "groups" ? ("/group/create" as any) : ("/channel/intro" as any))
                }
              >
                <Text style={ss.emptyBtnText}>
                  Create {activeTab === "groups" ? "Group" : "Channel"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={listData as any[]}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) =>
                activeTab === "groups" ? (
                  <GroupCard item={item as Group} />
                ) : (
                  <ChannelCard item={item as Channel} />
                )
              }
              contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: insets.bottom + 90 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refresh}
                  tintColor={activeTab === "groups" ? BRAND : PURPLE}
                />
              }
            />
          )}
        </View>
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  root: { flex: 1 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  createBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  tabBar: { flexDirection: "row" },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  tabLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },

  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 12,
    gap: 12,
  },
  cardAvatarWrap: {},
  cardAvatar: { width: 52, height: 52, borderRadius: 14 },
  cardAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, gap: 1 },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  cardMeta: { fontSize: 12, fontFamily: "Inter_500Medium" },

  joinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    minWidth: 60,
    alignItems: "center",
  },
  joinBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  emptyBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
