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
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import { isOnline } from "@/lib/offlineStore";
import * as Haptics from "@/lib/haptics";

// ─── Types ────────────────────────────────────────────────────────────────────

type Community = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  is_group: boolean;
  is_channel: boolean;
  member_count: number;
  am_member: boolean;
};

type CommunityTab = "groups" | "channels";

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CommunitiesScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<CommunityTab>("groups");
  const [groups, setGroups] = useState<Community[]>([]);
  const [channels, setChannels] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const BRAND = "#00BCD4";
  const PURPLE = "#8B5CF6";

  // ── Load data ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!user) return;

    const [{ data: groupsData }, { data: channelsData }, { data: myMemberships }] =
      await Promise.all([
        supabase
          .from("chats")
          .select("id, name, description, avatar_url, is_group, is_channel, is_public, chat_members(count)")
          .eq("is_group", true)
          .eq("is_public", true)
          .order("updated_at", { ascending: false })
          .limit(50),
        supabase
          .from("chats")
          .select("id, name, description, avatar_url, is_group, is_channel, is_public, chat_members(count)")
          .eq("is_channel", true)
          .eq("is_public", true)
          .order("updated_at", { ascending: false })
          .limit(50),
        supabase
          .from("chat_members")
          .select("chat_id")
          .eq("user_id", user.id),
      ]);

    const memberSet = new Set(
      ((myMemberships || []) as any[]).map((m) => m.chat_id)
    );

    function mapItems(data: any[] | null): Community[] {
      if (!data) return [];
      return data.map((c: any) => {
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
          is_group: !!c.is_group,
          is_channel: !!c.is_channel,
          member_count,
          am_member: memberSet.has(c.id),
        };
      });
    }

    setGroups(mapItems(groupsData));
    setChannels(mapItems(channelsData));
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
  }

  // ── Join / Open ─────────────────────────────────────────────────────────────

  async function joinOrOpen(item: Community) {
    if (!user) return;

    if (item.am_member) {
      router.push({ pathname: "/chat/[id]", params: { id: item.id } });
      return;
    }

    if (!isOnline()) {
      showAlert("No internet", "An internet connection is required to join.");
      return;
    }

    setJoiningId(item.id);
    await supabase
      .from("chat_members")
      .insert({ chat_id: item.id, user_id: user.id, is_admin: false });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Update local state so button reflects membership immediately.
    const updater = (prev: Community[]) =>
      prev.map((c) => (c.id === item.id ? { ...c, am_member: true, member_count: c.member_count + 1 } : c));
    setGroups(updater);
    setChannels(updater);
    setJoiningId(null);

    router.push({ pathname: "/chat/[id]", params: { id: item.id } });
  }

  // ── Community card ──────────────────────────────────────────────────────────

  function CommunityCard({ item, index }: { item: Community; index: number }) {
    const isChannel = item.is_channel;
    const accentColor = isChannel ? PURPLE : BRAND;
    const typeIcon = isChannel ? "megaphone" : "people";
    const countLabel = isChannel ? "subscribers" : "members";
    const isJoining = joiningId === item.id;

    return (
      <Animated.View entering={FadeInDown.delay(index * 30).duration(220)}>
        <TouchableOpacity
          style={[ss.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => joinOrOpen(item)}
          activeOpacity={0.75}
        >
          <View style={ss.cardAvatarWrap}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={ss.cardAvatar} />
            ) : (
              <View style={[ss.cardAvatarPlaceholder, { backgroundColor: accentColor + "22" }]}>
                <Ionicons name={typeIcon} size={26} color={accentColor} />
              </View>
            )}
          </View>

          <View style={ss.cardBody}>
            <Text style={[ss.cardName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.description ? (
              <Text style={[ss.cardDesc, { color: colors.textMuted }]} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Ionicons name="people-outline" size={12} color={accentColor} />
              <Text style={[ss.cardMeta, { color: accentColor }]}>
                {item.member_count.toLocaleString()} {countLabel}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              ss.joinBtn,
              item.am_member
                ? { backgroundColor: colors.inputBg }
                : { backgroundColor: accentColor },
            ]}
            onPress={() => joinOrOpen(item)}
            disabled={isJoining}
            activeOpacity={0.8}
          >
            {isJoining ? (
              <ActivityIndicator color={item.am_member ? colors.textMuted : "#fff"} size="small" />
            ) : (
              <Text
                style={[
                  ss.joinBtnText,
                  { color: item.am_member ? colors.textMuted : "#fff" },
                ]}
              >
                {item.am_member ? "Open" : "Join"}
              </Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const listData = activeTab === "groups" ? groups : channels;

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <GlassHeader
        title="Communities"
        showBack={false}
        right={
          <TouchableOpacity
            style={[ss.createBtn, { backgroundColor: colors.accent }]}
            onPress={() => router.push("/group/create" as any)}
            hitSlop={8}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={ss.createBtnText}>New Group</Text>
          </TouchableOpacity>
        }
      />

      {/* Tab bar */}
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

      {/* Also show channels creation option */}
      {activeTab === "channels" && (
        <TouchableOpacity
          style={[ss.channelCta, { backgroundColor: PURPLE + "12", borderColor: PURPLE + "30" }]}
          onPress={() => router.push("/channel/intro" as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="megaphone-outline" size={18} color={PURPLE} />
          <Text style={[ss.channelCtaText, { color: PURPLE }]}>Create a Channel to broadcast to your audience</Text>
          <Ionicons name="chevron-forward" size={16} color={PURPLE} />
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={ss.center}>
          <ActivityIndicator color={colors.accent} />
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
          renderItem={({ item, index }) => <CommunityCard item={item} index={index} />}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  createBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  tabLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },

  channelCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  channelCtaText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },

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
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  cardMeta: { fontSize: 12, fontFamily: "Inter_500Medium" },

  joinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    minWidth: 58,
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
  emptySub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
