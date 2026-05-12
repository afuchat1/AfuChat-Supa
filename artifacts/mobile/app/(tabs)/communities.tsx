import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { showAlert } from "@/lib/alert";
import { isOnline } from "@/lib/offlineStore";
import * as Haptics from "@/lib/haptics";

const BRAND = "#00BCD4";
const PURPLE = "#8B5CF6";

type Group = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  member_count: number;
  am_member: boolean;
};

type Channel = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  subscriber_count: number;
  is_verified: boolean;
  am_subscriber: boolean;
  owner: { display_name: string; handle: string } | null;
};

type CommunityTab = "groups" | "channels";

export default function CommunitiesScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<CommunityTab>("groups");
  const [groups, setGroups] = useState<Group[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;

    const [
      { data: groupsData },
      { data: channelsData },
      { data: myMemberships },
      { data: mySubscriptions },
    ] = await Promise.all([
      supabase
        .from("chats")
        .select("id, name, description, avatar_url, is_group, is_channel, is_public, chat_members(count)")
        .eq("is_group", true)
        .eq("is_public", true)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("channels")
        .select(
          "id, name, description, avatar_url, subscriber_count, is_verified, is_public, profiles!channels_owner_id_fkey(display_name, handle)"
        )
        .eq("is_public", true)
        .order("subscriber_count", { ascending: false })
        .limit(60),
      supabase.from("chat_members").select("chat_id").eq("user_id", user.id),
      supabase.from("channel_subscriptions").select("channel_id").eq("user_id", user.id),
    ]);

    const memberSet = new Set(((myMemberships || []) as any[]).map((m) => m.chat_id));
    const subSet = new Set(((mySubscriptions || []) as any[]).map((s) => s.channel_id));

    setGroups(
      (groupsData || []).map((c: any) => {
        const countArr = c.chat_members;
        const member_count =
          Array.isArray(countArr) && countArr[0]?.count != null
            ? Number(countArr[0].count)
            : 0;
        return {
          id: c.id,
          name: c.name || "Unnamed",
          description: c.description || null,
          avatar_url: c.avatar_url || null,
          member_count,
          am_member: memberSet.has(c.id),
        };
      })
    );

    setChannels(
      (channelsData || []).map((c: any) => ({
        id: c.id,
        name: c.name || "Unnamed",
        description: c.description || null,
        avatar_url: c.avatar_url || null,
        subscriber_count: c.subscriber_count ?? 0,
        is_verified: !!(c as any).is_verified,
        am_subscriber: subSet.has(c.id),
        owner: c.profiles
          ? { display_name: c.profiles.display_name, handle: c.profiles.handle }
          : null,
      }))
    );

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function refresh() { setRefreshing(true); await load(); }

  async function joinOrOpenGroup(item: Group) {
    if (!user) return;
    if (item.am_member) {
      router.push({ pathname: "/chat/[id]", params: { id: item.id } });
      return;
    }
    if (!isOnline()) { showAlert("No internet", "An internet connection is required to join."); return; }
    setJoiningId(item.id);
    await supabase.from("chat_members").insert({ chat_id: item.id, user_id: user.id, is_admin: false });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setGroups((prev) =>
      prev.map((g) => g.id === item.id ? { ...g, am_member: true, member_count: g.member_count + 1 } : g)
    );
    setJoiningId(null);
    router.push({ pathname: "/chat/[id]", params: { id: item.id } });
  }

  async function subscribeOrOpenChannel(item: Channel) {
    if (!user) return;
    if (item.am_subscriber) {
      router.push({ pathname: "/channel/[id]", params: { id: item.id } } as any);
      return;
    }
    if (!isOnline()) { showAlert("No internet", "An internet connection is required to subscribe."); return; }
    setJoiningId(item.id);
    await supabase
      .from("channel_subscriptions")
      .upsert({ channel_id: item.id, user_id: user.id }, { onConflict: "channel_id,user_id" });
    await supabase.rpc("increment_channel_subscriber", { p_channel_id: item.id });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setChannels((prev) =>
      prev.map((c) =>
        c.id === item.id
          ? { ...c, am_subscriber: true, subscriber_count: c.subscriber_count + 1 }
          : c
      )
    );
    setJoiningId(null);
    router.push({ pathname: "/channel/[id]", params: { id: item.id } } as any);
  }

  function GroupCard({ item, index }: { item: Group; index: number }) {
    const isJoining = joiningId === item.id;
    return (
      <Animated.View entering={FadeInDown.delay(index * 30).duration(220)}>
        <TouchableOpacity
          style={[ss.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => joinOrOpenGroup(item)}
          activeOpacity={0.75}
        >
          <View style={ss.cardAvatarWrap}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={ss.cardAvatar} />
            ) : (
              <View style={[ss.cardAvatarPlaceholder, { backgroundColor: BRAND + "22" }]}>
                <Ionicons name="people" size={26} color={BRAND} />
              </View>
            )}
          </View>
          <View style={ss.cardBody}>
            <Text style={[ss.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            {item.description ? (
              <Text style={[ss.cardDesc, { color: colors.textMuted }]} numberOfLines={2}>{item.description}</Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Ionicons name="people-outline" size={12} color={BRAND} />
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
      </Animated.View>
    );
  }

  function ChannelCard({ item, index }: { item: Channel; index: number }) {
    const isJoining = joiningId === item.id;
    return (
      <Animated.View entering={FadeInDown.delay(index * 30).duration(220)}>
        <TouchableOpacity
          style={[ss.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.push({ pathname: "/channel/[id]", params: { id: item.id } } as any)}
          activeOpacity={0.75}
        >
          <View style={ss.cardAvatarWrap}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={ss.cardAvatar} />
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
            {item.owner && (
              <Text style={[ss.cardMeta, { color: colors.textMuted, marginBottom: 2 }]} numberOfLines={1}>
                by @{item.owner.handle}
              </Text>
            )}
            {item.description ? (
              <Text style={[ss.cardDesc, { color: colors.textMuted }]} numberOfLines={1}>{item.description}</Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <Ionicons name="people-outline" size={12} color={PURPLE} />
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
                {item.am_subscriber ? "Open" : "Follow"}
              </Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
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
              router.push(activeTab === "groups" ? ("/group/create" as any) : ("/channel/intro" as any))
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
        <View style={ss.center}>
          <ActivityIndicator color={activeTab === "groups" ? BRAND : PURPLE} />
        </View>
      ) : listData.length === 0 ? (
        <View style={ss.empty}>
          <View style={[ss.emptyIcon, { backgroundColor: colors.surface }]}>
            <Ionicons
              name={activeTab === "groups" ? "people-outline" : "megaphone-outline"}
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
              router.push(activeTab === "groups" ? ("/group/create" as any) : ("/channel/intro" as any))
            }
          >
            <Text style={ss.emptyBtnText}>
              Create {activeTab === "groups" ? "Group" : "Channel"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) =>
            activeTab === "groups" ? (
              <GroupCard item={item as Group} index={index} />
            ) : (
              <ChannelCard item={item as Channel} index={index} />
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

  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
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
    borderWidth: StyleSheet.hairlineWidth,
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
