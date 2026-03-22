import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { Separator } from "@/components/ui/Separator";
import Colors from "@/constants/colors";

type StoryUser = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  hasUnseen: boolean;
};

type ChatItem = {
  id: string;
  name: string | null;
  is_group: boolean;
  is_channel: boolean;
  other_display_name: string;
  other_avatar: string | null;
  other_id: string;
  last_message: string;
  last_message_at: string;
  is_pinned: boolean;
  is_archived: boolean;
  avatar_url: string | null;
};

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ChatRow({ item }: { item: ChatItem }) {
  const { colors } = useTheme();
  const displayName = item.is_group || item.is_channel ? item.name : item.other_display_name;
  const avatar = item.is_group || item.is_channel ? item.avatar_url : item.other_avatar;

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.surface }]}
      onPress={() => {
        Haptics.selectionAsync();
        router.push({ pathname: "/chat/[id]", params: { id: item.id } });
      }}
      activeOpacity={0.7}
    >
      <Avatar uri={avatar} name={displayName || "Chat"} size={50} />
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <View style={styles.nameRow}>
            {item.is_pinned && (
              <Ionicons name="pin" size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
            )}
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {displayName || "Chat"}
            </Text>
            {item.is_channel && (
              <Ionicons name="megaphone" size={12} color={Colors.brand} style={{ marginLeft: 4 }} />
            )}
          </View>
          <Text style={[styles.time, { color: colors.textMuted }]}>
            {item.last_message_at ? formatTime(item.last_message_at) : ""}
          </Text>
        </View>
        <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.last_message || "No messages yet"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function StoriesBar({ userId, colors }: { userId: string; colors: any }) {
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);

  useEffect(() => {
    const now = new Date().toISOString();
    supabase
      .from("stories")
      .select("user_id, profiles!stories_user_id_fkey(display_name, avatar_url)")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!data) return;
        const seen = new Set<string>();
        const users: StoryUser[] = [];
        for (const s of data as any[]) {
          if (seen.has(s.user_id)) continue;
          seen.add(s.user_id);
          users.push({
            userId: s.user_id,
            displayName: s.profiles?.display_name || "User",
            avatarUrl: s.profiles?.avatar_url || null,
            hasUnseen: s.user_id !== userId,
          });
        }
        setStoryUsers(users);
      });
  }, [userId]);

  if (storyUsers.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={storyBarStyles.list}>
      <TouchableOpacity style={storyBarStyles.item} onPress={() => router.push("/stories/create")}>
        <View style={[storyBarStyles.addCircle, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="add" size={28} color={Colors.brand} />
        </View>
        <Text style={[storyBarStyles.name, { color: colors.textSecondary }]} numberOfLines={1}>My Story</Text>
      </TouchableOpacity>
      {storyUsers.map((u) => (
        <TouchableOpacity
          key={u.userId}
          style={storyBarStyles.item}
          onPress={() => router.push({ pathname: "/stories/view", params: { userId: u.userId } })}
        >
          <View style={[storyBarStyles.ring, u.hasUnseen && storyBarStyles.ringActive]}>
            <Avatar uri={u.avatarUrl} name={u.displayName} size={52} />
          </View>
          <Text style={[storyBarStyles.name, { color: colors.textSecondary }]} numberOfLines={1}>{u.displayName}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const storyBarStyles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingVertical: 10, gap: 14 },
  item: { alignItems: "center", width: 68 },
  addCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.brand, borderStyle: "dashed" },
  ring: { borderRadius: 30, padding: 2, borderWidth: 2, borderColor: "transparent" },
  ringActive: { borderColor: Colors.brand },
  name: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" },
});

export default function ChatsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const loadChats = useCallback(async () => {
    if (!user) return;

    const { data: memberRows } = await supabase
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", user.id);

    if (!memberRows || memberRows.length === 0) {
      setChats([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const chatIds = memberRows.map((m: any) => m.chat_id);

    const { data: chatRows } = await supabase
      .from("chats")
      .select(`
        id, name, is_group, is_channel, is_pinned, is_archived, avatar_url, updated_at,
        chat_members(user_id, profiles(id, display_name, avatar_url))
      `)
      .in("id", chatIds)
      .eq("is_archived", false)
      .order("updated_at", { ascending: false });

    if (chatRows) {
      const lastMsgPromises = chatRows.map(async (c: any) => {
        const { data: msgs } = await supabase
          .from("messages")
          .select("encrypted_content, sent_at")
          .eq("chat_id", c.id)
          .order("sent_at", { ascending: false })
          .limit(1);
        return {
          chatId: c.id,
          lastMessage: msgs?.[0]?.encrypted_content || "",
          lastMessageAt: msgs?.[0]?.sent_at || c.updated_at,
        };
      });
      const lastMsgs = await Promise.all(lastMsgPromises);
      const lastMsgMap = Object.fromEntries(lastMsgs.map((m) => [m.chatId, m]));

      const items: ChatItem[] = chatRows.map((c: any) => {
        const others = (c.chat_members || []).filter((m: any) => m.user_id !== user.id);
        const other = others[0]?.profiles;
        const lm = lastMsgMap[c.id];
        return {
          id: c.id,
          name: c.name,
          is_group: !!c.is_group,
          is_channel: !!c.is_channel,
          other_display_name: other?.display_name || "Unknown",
          other_avatar: other?.avatar_url || null,
          other_id: other?.id || "",
          last_message: lm?.lastMessage || "",
          last_message_at: lm?.lastMessageAt || "",
          is_pinned: !!c.is_pinned,
          is_archived: !!c.is_archived,
          avatar_url: c.avatar_url,
        };
      });

      items.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });

      setChats(items);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadChats(); }, [loadChats]);

  const filtered = search
    ? chats.filter((c) => {
        const name = c.is_group || c.is_channel ? c.name : c.other_display_name;
        return name?.toLowerCase().includes(search.toLowerCase());
      })
    : chats;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>Chats</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.push("/group/create")}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="people-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/contacts")}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="create-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.surface }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No chats yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Start a conversation from Contacts
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatRow item={item} />}
          ItemSeparatorComponent={() => <Separator indent={74} />}
          ListHeaderComponent={user ? <StoriesBar userId={user.id} colors={colors} /> : null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadChats(); }}
              tintColor={Colors.brand}
            />
          }
          contentContainerStyle={{ paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerActions: { flexDirection: "row", gap: 16 },
  headerBtn: {},
  searchWrap: { paddingHorizontal: 12, paddingVertical: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 36 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowContent: { flex: 1 },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  nameRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  preview: { fontSize: 14, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
