import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { StoryRing } from "@/components/ui/StoryRing";
import { Separator } from "@/components/ui/Separator";
import Colors from "@/constants/colors";
import { ChatRowSkeleton } from "@/components/ui/Skeleton";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { cacheConversations, getCachedConversations, isOnline } from "@/lib/offlineStore";
import { addOnlineListener } from "@/lib/offlineSync";

type Contact = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
};

type StoryUser = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  hasUnseen: boolean;
  storyCount: number;
  seenCount: number;
  latestAt: string;
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
  unread_count: number;
  is_verified: boolean;
  is_organization_verified: boolean;
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
  const hasUnread = item.unread_count > 0;

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
            <Text
              style={[styles.name, { color: colors.text, fontFamily: hasUnread ? "Inter_700Bold" : "Inter_600SemiBold" }]}
              numberOfLines={1}
            >
              {displayName || "Chat"}
            </Text>
            {!item.is_group && (
              <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={14} />
            )}
            {item.is_channel && (
              <Ionicons name="megaphone" size={12} color={Colors.brand} style={{ marginLeft: 4 }} />
            )}
          </View>
          <View style={styles.rowTopRight}>
            <Text style={[styles.time, { color: hasUnread ? Colors.brand : colors.textMuted }]}>
              {item.last_message_at ? formatTime(item.last_message_at) : ""}
            </Text>
          </View>
        </View>
        <View style={styles.rowBottom}>
          <Text
            style={[styles.preview, { color: hasUnread ? colors.text : colors.textSecondary, fontFamily: hasUnread ? "Inter_500Medium" : "Inter_400Regular", flex: 1 }]}
            numberOfLines={1}
          >
            {item.last_message || "No messages yet"}
          </Text>
          {hasUnread && (
            <View style={[styles.unreadBadge, { backgroundColor: Colors.brand }]}>
              <Text style={styles.unreadBadgeText}>
                {item.unread_count > 99 ? "99+" : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function StoriesBar({ userId, colors }: { userId: string; colors: any }) {
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);

  const loadStories = useCallback(async () => {
    const now = new Date().toISOString();
    const { data: storiesData } = await supabase
      .from("stories")
      .select("id, user_id, created_at, profiles!stories_user_id_fkey(display_name, avatar_url)")
      .gt("expires_at", now)
      .order("created_at", { ascending: true })
      .limit(100);

    if (!storiesData || storiesData.length === 0) {
      setStoryUsers([]);
      return;
    }

    const storyIds = storiesData.map((s: any) => s.id);
    const { data: viewsData } = await supabase
      .from("story_views")
      .select("story_id")
      .eq("viewer_id", userId)
      .in("story_id", storyIds);

    const viewedSet = new Set((viewsData || []).map((v: any) => v.story_id));

    const userMap = new Map<string, StoryUser>();
    for (const s of storiesData as any[]) {
      const existing = userMap.get(s.user_id);
      const isSeen = viewedSet.has(s.id);
      if (existing) {
        existing.storyCount += 1;
        if (isSeen) existing.seenCount += 1;
        if (!isSeen) existing.hasUnseen = true;
        if (s.created_at > existing.latestAt) existing.latestAt = s.created_at;
      } else {
        userMap.set(s.user_id, {
          userId: s.user_id,
          displayName: s.profiles?.display_name || "User",
          avatarUrl: s.profiles?.avatar_url || null,
          hasUnseen: !isSeen,
          storyCount: 1,
          seenCount: isSeen ? 1 : 0,
          latestAt: s.created_at,
        });
      }
    }

    const users = Array.from(userMap.values());
    users.sort((a, b) => {
      if (a.hasUnseen && !b.hasUnseen) return -1;
      if (!a.hasUnseen && b.hasUnseen) return 1;
      return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
    });

    setStoryUsers(users);
  }, [userId]);

  useFocusEffect(useCallback(() => { loadStories(); }, [loadStories]));

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
          <StoryRing size={52} storyCount={u.storyCount} seenCount={u.seenCount}>
            <Avatar uri={u.avatarUrl} name={u.displayName} size={52} />
          </StoryRing>
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
  name: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" },
});

function ContactPickerModal({ visible, onClose, userId, colors }: { visible: boolean; onClose: () => void; userId: string; colors: any }) {
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (visible) {
      setSearch("");
      setContacts([]);
      setLoading(true);
      loadContacts();
    }
  }, [visible]);

  async function loadContacts() {
    const { data } = await supabase
      .from("follows")
      .select("following_id, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified)")
      .eq("follower_id", userId);
    const list = (data || [])
      .map((f: any) => f.profiles)
      .filter(Boolean)
      .sort((a: Contact, b: Contact) => a.display_name.localeCompare(b.display_name));
    setContacts(list);
    setLoading(false);
  }

  async function selectContact(contact: Contact) {
    Haptics.selectionAsync();
    const { data: myChats } = await supabase
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", userId);
    const myIds = (myChats || []).map((m: any) => m.chat_id);
    if (myIds.length > 0) {
      const { data: shared } = await supabase
        .from("chat_members")
        .select("chat_id, chats!inner(id, is_group, is_channel)")
        .eq("user_id", contact.id)
        .in("chat_id", myIds)
        .eq("chats.is_group", false);
      if (shared && shared.length > 0) {
        const directChat = shared.find((s: any) => !s.chats?.is_channel);
        if (directChat) {
          onClose();
          router.push({ pathname: "/chat/[id]", params: { id: directChat.chat_id } });
          return;
        }
      }
    }
    onClose();
    router.push({
      pathname: "/chat/[id]",
      params: {
        id: "new",
        contactId: contact.id,
        contactName: contact.display_name,
        contactAvatar: contact.avatar_url || "",
      },
    });
  }

  const filtered = search
    ? contacts.filter(
        (c) =>
          c.display_name.toLowerCase().includes(search.toLowerCase()) ||
          c.handle.toLowerCase().includes(search.toLowerCase())
      )
    : contacts;

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[pickerStyles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
        <View style={[pickerStyles.pickerHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[pickerStyles.pickerTitle, { color: colors.text }]}>New Message</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={[pickerStyles.searchWrap, { backgroundColor: colors.surface }]}>
          <View style={[pickerStyles.searchBox, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[pickerStyles.searchInput, { color: colors.text }]}
              placeholder="Search Contacts"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <>
              <View style={[pickerStyles.actionGroup, { backgroundColor: colors.surface }]}>
                <TouchableOpacity
                  style={pickerStyles.actionRow}
                  onPress={() => { onClose(); router.push("/group/create"); }}
                  activeOpacity={0.7}
                >
                  <View style={[pickerStyles.actionIcon, { backgroundColor: "#007AFF" }]}>
                    <Ionicons name="people" size={20} color="#fff" />
                  </View>
                  <Text style={[pickerStyles.actionLabel, { color: colors.text }]}>New Group</Text>
                </TouchableOpacity>
                <Separator indent={58} />
                <TouchableOpacity
                  style={pickerStyles.actionRow}
                  onPress={() => { onClose(); router.push("/channel/intro" as any); }}
                  activeOpacity={0.7}
                >
                  <View style={[pickerStyles.actionIcon, { backgroundColor: "#34C759" }]}>
                    <Ionicons name="megaphone" size={20} color="#fff" />
                  </View>
                  <Text style={[pickerStyles.actionLabel, { color: colors.text }]}>New Channel</Text>
                </TouchableOpacity>
              </View>

              {!loading && filtered.length > 0 && (
                <View style={pickerStyles.sectionLabel}>
                  <Text style={[pickerStyles.sectionLabelText, { color: Colors.brand }]}>
                    Sorted by name
                  </Text>
                </View>
              )}

              {loading && (
                <View style={pickerStyles.center}>
                  <ActivityIndicator color={Colors.brand} />
                </View>
              )}

              {!loading && filtered.length === 0 && (
                <View style={pickerStyles.center}>
                  <Text style={[pickerStyles.emptyText, { color: colors.textMuted }]}>
                    {search ? "No contacts found" : "No contacts yet"}
                  </Text>
                </View>
              )}
            </>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[pickerStyles.contactRow, { backgroundColor: colors.surface }]}
              onPress={() => selectContact(item)}
              activeOpacity={0.7}
            >
              <Avatar uri={item.avatar_url} name={item.display_name} size={46} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={[pickerStyles.contactName, { color: colors.text }]}>{item.display_name}</Text>
                  <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={14} />
                </View>
                <Text style={[pickerStyles.contactHandle, { color: colors.textSecondary }]}>@{item.handle}</Text>
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <Separator indent={70} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        />
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  root: { flex: 1 },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  searchWrap: { paddingHorizontal: 12, paddingVertical: 8 },
  searchBox: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 10, height: 40, gap: 6 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 40 },
  actionGroup: { marginTop: 8, marginBottom: 8 },
  actionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 14 },
  actionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  sectionLabel: { paddingHorizontal: 16, paddingVertical: 8 },
  sectionLabelText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  contactRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  contactName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  contactHandle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  center: { paddingVertical: 40, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});

export default function ChatsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const fetchUnreadCount = useCallback(() => {
    if (!user) return;
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .then(({ count }) => setUnreadNotifCount(count || 0));
  }, [user]);

  useFocusEffect(useCallback(() => { fetchUnreadCount(); }, [fetchUnreadCount]));

  useEffect(() => {
    if (!user) return;

    const notifChannel = supabase
      .channel(`notif-badge:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => fetchUnreadCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(notifChannel); };
  }, [user, fetchUnreadCount]);

  const loadChats = useCallback(async () => {
    if (!user) return;

    if (!isOnline()) {
      const cached = await getCachedConversations();
      if (cached.length > 0) setChats(cached);
      setLoading(false);
      setRefreshing(false);
      return;
    }

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
        chat_members(user_id, profiles(id, display_name, avatar_url, is_verified, is_organization_verified))
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

      const unreadMsgsPromise = supabase
        .from("messages")
        .select("id, chat_id")
        .in("chat_id", chatIds)
        .neq("sender_id", user.id)
        .order("sent_at", { ascending: false })
        .limit(500);

      const [lastMsgs, { data: unreadMsgRows }] = await Promise.all([
        Promise.all(lastMsgPromises),
        unreadMsgsPromise,
      ]);

      const lastMsgMap = Object.fromEntries(lastMsgs.map((m) => [m.chatId, m]));

      const unreadMsgIds = (unreadMsgRows || []).map((m: any) => m.id);
      let readSet = new Set<string>();
      if (unreadMsgIds.length > 0) {
        const { data: readRows } = await supabase
          .from("message_status")
          .select("message_id")
          .eq("user_id", user.id)
          .not("read_at", "is", null)
          .in("message_id", unreadMsgIds);
        readSet = new Set((readRows || []).map((r: any) => r.message_id));
      }

      const unreadMap: Record<string, number> = {};
      for (const msg of (unreadMsgRows || [])) {
        if (!readSet.has(msg.id)) {
          unreadMap[msg.chat_id] = (unreadMap[msg.chat_id] || 0) + 1;
        }
      }

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
          unread_count: unreadMap[c.id] || 0,
          is_verified: !!other?.is_verified,
          is_organization_verified: !!other?.is_organization_verified,
        };
      });

      items.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });

      setChats(items);
      cacheConversations(items);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadChats(); }, [loadChats]);
  useFocusEffect(useCallback(() => { loadChats(); }, [loadChats]));

  useEffect(() => {
    if (!user) return;
    import("../../lib/rewardXp").then(({ rewardXp }) => rewardXp("daily_login")).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const memberChannel = supabase
      .channel(`chatlist-member-inserts:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_members", filter: `user_id=eq.${user.id}` },
        () => loadChats()
      )
      .subscribe();
    return () => { supabase.removeChannel(memberChannel); };
  }, [user, loadChats]);

  useEffect(() => {
    if (!user) return;
    return addOnlineListener(() => loadChats());
  }, [user, loadChats]);

  const chatIdsKey = chats.map((c) => c.id).sort().join(",");

  useEffect(() => {
    if (!user || !chatIdsKey) return;

    const chatIds = chatIdsKey.split(",");
    const channel = supabase.channel(`chatlist-messages:${user.id}`);

    chatIds.forEach((chatId) => {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        () => loadChats()
      );
    });

    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, chatIdsKey, loadChats]);

  const filtered = search
    ? chats.filter((c) => {
        const name = c.is_group || c.is_channel ? c.name : c.other_display_name;
        return name?.toLowerCase().includes(search.toLowerCase());
      })
    : chats;

  const totalUnread = chats.reduce((sum, c) => sum + c.unread_count, 0);

  useEffect(() => {
    navigation.setOptions({
      tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? "99+" : totalUnread) : undefined,
    });
  }, [navigation, totalUnread]);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <OfflineBanner />
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text, textAlign: "center", flex: 1 }]}>AfuChat</Text>
        <TouchableOpacity onPress={() => router.push("/notifications")} style={styles.headerIcon}>
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
          {unreadNotifCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{unreadNotifCount > 99 ? "99+" : unreadNotifCount}</Text>
            </View>
          )}
        </TouchableOpacity>
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
        <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <ChatRowSkeleton key={i} />)}</View>
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
          contentContainerStyle={{ paddingBottom: insets.bottom + 52 + 80 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: Colors.brand, bottom: insets.bottom + 52 + 16 }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowContactPicker(true); }}
        activeOpacity={0.85}
      >
        <Ionicons name="create-outline" size={24} color="#fff" />
      </TouchableOpacity>

      {user && (
        <ContactPickerModal
          visible={showContactPicker}
          onClose={() => setShowContactPicker(false)}
          userId={user.id}
          colors={colors}
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
  headerIcon: { padding: 4, position: "relative" },
  notifBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#FF3B30",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notifBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  searchWrap: { paddingHorizontal: 12, paddingVertical: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
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
  rowTopRight: { alignItems: "flex-end" },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 6 },
  preview: { fontSize: 14, fontFamily: "Inter_400Regular" },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", lineHeight: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  fab: {
    position: "absolute",
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
