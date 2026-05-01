import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect, router, useFocusEffect, useNavigation, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { Avatar } from "@/components/ui/Avatar";
import { StoryRing } from "@/components/ui/StoryRing";
import { Separator } from "@/components/ui/Separator";
import Colors from "@/constants/colors";
import { ChatRowSkeleton } from "@/components/ui/Skeleton";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { cacheConversations, getCachedConversations, isOnline } from "@/lib/offlineStore";
import { addOnlineListener } from "@/lib/offlineSync";
import { wasChatRecentlyVisited, clearChatVisited } from "@/lib/chatVisited";
import { showAlert, confirmAlert } from "@/lib/alert";

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
  other_last_seen: string | null;
  other_show_online: boolean;
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

function isUserOnline(lastSeen: string | null, showOnline: boolean): boolean {
  if (!showOnline || !lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

function ChatRow({
  item,
  onPress,
  onAction,
  isActive,
}: {
  item: ChatItem;
  onPress: () => void;
  onAction?: (
    action: "togglePin" | "toggleArchive" | "delete" | "open",
    item: ChatItem,
  ) => void;
  isActive?: boolean;
}) {
  const { colors } = useTheme();
  // Lazy import to avoid touching native paths.
  const { useContextMenu, ContextMenu } =
    require("@/components/desktop/ContextMenu") as typeof import("@/components/desktop/ContextMenu");
  const { bind, menuProps } = useContextMenu([
    [
      {
        key: "open",
        label: "Open chat",
        icon: "open-outline",
        onSelect: () => onAction?.("open", item),
      },
      {
        key: "pin",
        label: item.is_pinned ? "Unpin chat" : "Pin chat",
        icon: item.is_pinned ? "pin" : "pin-outline",
        onSelect: () => onAction?.("togglePin", item),
      },
      {
        key: "archive",
        label: item.is_archived ? "Unarchive" : "Archive",
        icon: item.is_archived ? "archive" : "archive-outline",
        onSelect: () => onAction?.("toggleArchive", item),
      },
    ],
    [
      {
        key: "delete",
        label: "Delete chat",
        icon: "trash-outline",
        destructive: true,
        onSelect: () => onAction?.("delete", item),
      },
    ],
  ]);
  const displayName = item.is_group || item.is_channel ? item.name : item.other_display_name;
  const avatar = item.is_group || item.is_channel ? item.avatar_url : item.other_avatar;
  const hasUnread = item.unread_count > 0 && !wasChatRecentlyVisited(item.id);
  const isOnlineDot = !item.is_group && !item.is_channel && isUserOnline(item.other_last_seen, item.other_show_online);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (hasUnread) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.28, duration: 650, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulse.setValue(1);
    }
  }, [hasUnread]);

  return (
    <View {...bind}>
      <ContextMenu {...menuProps} />
    <TouchableOpacity
      style={[styles.row, { backgroundColor: isActive ? colors.backgroundSecondary : colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={{ position: "relative" }}>
        <Avatar uri={avatar} name={displayName || "Chat"} size={50} />
        {isOnlineDot && (
          <View style={[styles.onlineDot, { borderColor: colors.surface }]} />
        )}
      </View>
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
              <Ionicons name="megaphone" size={12} color={colors.accent} style={{ marginLeft: 4 }} />
            )}
          </View>
          <View style={styles.rowTopRight}>
            <Text style={[styles.time, { color: hasUnread ? colors.accent : colors.textMuted }]}>
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
            <Animated.View style={[styles.unreadBadge, { backgroundColor: colors.accent, transform: [{ scale: pulse }] }]}>
              <Text style={styles.unreadBadgeText}>
                {item.unread_count > 99 ? "99+" : item.unread_count}
              </Text>
            </Animated.View>
          )}
        </View>
      </View>
    </TouchableOpacity>
    </View>
  );
}

function StoriesBar({ userId, colors }: { userId: string; colors: any }) {
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);

  const loadStories = useCallback(async () => {
    const now = new Date().toISOString();
    const { data: storiesData } = await supabase
      .from("stories")
      .select("id, user_id, caption, privacy, created_at, profiles!stories_user_id_fkey(display_name, avatar_url)")
      .gt("expires_at", now)
      .order("created_at", { ascending: true })
      .limit(100);

    if (!storiesData || storiesData.length === 0) {
      setStoryUsers([]);
      return;
    }

    const filtered = storiesData.filter((s: any) => {
      const p = s.privacy || "everyone";
      if (p === "only_me" && s.user_id !== userId) return false;
      if (p === "close_friends" && s.user_id !== userId) return false;
      return true;
    });

    if (filtered.length === 0) {
      setStoryUsers([]);
      return;
    }

    const storyIds = filtered.map((s: any) => s.id);
    const { data: viewsData } = await supabase
      .from("story_views")
      .select("story_id")
      .eq("viewer_id", userId)
      .in("story_id", storyIds);

    const viewedSet = new Set((viewsData || []).map((v: any) => v.story_id));

    const userMap = new Map<string, StoryUser>();
    for (const s of filtered as any[]) {
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

  useEffect(() => {
    const channel = supabase
      .channel("stories-bar-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stories" }, () => {
        loadStories();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadStories]);

  if (storyUsers.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={storyBarStyles.list}>
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

type ChatTabKey = "all" | "unread" | "personal" | "groups" | "channels";

/**
 * The chats screen. By default this renders as a full-page route (chats tab).
 * When mounted with `panelMode`, it renders as a fixed-width 360px column
 * suitable for a WhatsApp/Telegram-style master-detail layout (the chat list
 * stays sticky on the left, the chat conversation is rendered to its right).
 *
 * `DesktopShell` mounts `<ChatsListPanel />` (which is `<ChatsScreen panelMode />`)
 * for any `/chat/[id]` route so the chats list is persistent while a chat is
 * open. On the chats tab itself, `panelMode` is false and the list takes the
 * full route width as usual.
 */
function ChatsScreen({ panelMode = false }: { panelMode?: boolean } = {}) {
  const { colors } = useTheme();
  const { user, profile, linkedAccounts, switchAccount } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isDesktop } = useIsDesktop();
  const pathname = usePathname() || "/";
  const activeChatMatch = pathname.match(/^\/chat\/([^/]+)/);
  const activeChatId = activeChatMatch ? activeChatMatch[1] : null;

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [tabFilter, setTabFilter] = useState<ChatTabKey>("all");

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

  const loadChats = useCallback(async (background = false) => {
    if (!user) return;

    if (!background) {
      const cached = await getCachedConversations();
      if (cached.length > 0) {
        setChats(cached);
        setLoading(false);
      }
    }

    if (!isOnline()) {
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

    const [chatResult, lastMsgsResult, unreadMsgsResult] = await Promise.all([
      supabase
        .from("chats")
        .select(`
          id, name, is_group, is_channel, is_pinned, is_archived, avatar_url, updated_at,
          chat_members(user_id, profiles(id, display_name, avatar_url, is_verified, is_organization_verified, last_seen, show_online_status))
        `)
        .in("id", chatIds)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false }),
      supabase
        .from("messages")
        .select("chat_id, encrypted_content, sent_at, attachment_type")
        .in("chat_id", chatIds)
        .order("sent_at", { ascending: false })
        .limit(chatIds.length * 3),
      supabase
        .from("messages")
        .select("id, chat_id")
        .in("chat_id", chatIds)
        .neq("sender_id", user.id)
        .order("sent_at", { ascending: false })
        .limit(500),
    ]);

    const chatRows = chatResult.data;
    if (!chatRows) { setLoading(false); setRefreshing(false); return; }

    const lastMsgMap: Record<string, { lastMessage: string; lastMessageAt: string }> = {};
    for (const m of (lastMsgsResult.data || [])) {
      if (!lastMsgMap[m.chat_id]) {
        let preview = m.encrypted_content || "";
        if (m.attachment_type === "story_reply") {
          preview = preview ? `📸 ${preview}` : "📸 Replied to a story";
        }
        lastMsgMap[m.chat_id] = { lastMessage: preview, lastMessageAt: m.sent_at };
      }
    }

    const unreadMsgRows = unreadMsgsResult.data || [];
    const unreadMsgIds = unreadMsgRows.map((m: any) => m.id);
    let readSet = new Set<string>();
    if (unreadMsgIds.length > 0) {
      const batchSize = 200;
      const readPromises = [];
      for (let i = 0; i < unreadMsgIds.length; i += batchSize) {
        readPromises.push(
          supabase
            .from("message_status")
            .select("message_id")
            .eq("user_id", user.id)
            .not("read_at", "is", null)
            .in("message_id", unreadMsgIds.slice(i, i + batchSize))
        );
      }
      const readResults = await Promise.all(readPromises);
      for (const { data: readRows } of readResults) {
        for (const r of (readRows || [])) {
          readSet.add(r.message_id);
        }
      }
    }

    const unreadMap: Record<string, number> = {};
    for (const msg of unreadMsgRows) {
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
        last_message_at: lm?.lastMessageAt || c.updated_at || "",
        is_pinned: !!c.is_pinned,
        is_archived: !!c.is_archived,
        avatar_url: c.avatar_url,
        unread_count: unreadMap[c.id] || 0,
        is_verified: !!other?.is_verified,
        is_organization_verified: !!other?.is_organization_verified,
        other_last_seen: other?.last_seen || null,
        other_show_online: other?.show_online_status !== false,
      };
    });

    items.forEach((item) => {
      if (item.unread_count === 0) clearChatVisited(item.id);
    });

    items.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });

    setChats(items);
    cacheConversations(items);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadChats(); }, [loadChats]);
  useFocusEffect(useCallback(() => { loadChats(true); }, [loadChats]));

  // Right-click context-menu actions on chat list rows.
  const handleChatAction = useCallback(
    async (
      action: "togglePin" | "toggleArchive" | "delete" | "open",
      item: ChatItem,
    ) => {
      if (action === "open") {
        Haptics.selectionAsync();
        router.push({ pathname: "/chat/[id]", params: { id: item.id } });
        return;
      }
      if (action === "togglePin") {
        const next = !item.is_pinned;
        setChats((prev) =>
          prev.map((c) => (c.id === item.id ? { ...c, is_pinned: next } : c)),
        );
        const { error } = await supabase
          .from("chats")
          .update({ is_pinned: next })
          .eq("id", item.id);
        if (error) {
          showAlert("Couldn't update pin", error.message);
          loadChats(true);
        }
        return;
      }
      if (action === "toggleArchive") {
        const next = !item.is_archived;
        // Archived chats are filtered out of the list (loadChats uses
        // is_archived=false), so just remove locally for instant feedback.
        setChats((prev) =>
          next ? prev.filter((c) => c.id !== item.id) : prev,
        );
        const { error } = await supabase
          .from("chats")
          .update({ is_archived: next })
          .eq("id", item.id);
        if (error) {
          showAlert("Couldn't archive chat", error.message);
          loadChats(true);
        }
        return;
      }
      if (action === "delete") {
        const ok = await confirmAlert(
          "Delete chat?",
          "This will permanently delete this conversation for everyone.",
          { confirmText: "Delete", destructive: true },
        );
        if (!ok) return;
        setChats((prev) => prev.filter((c) => c.id !== item.id));
        const { error } = await supabase
          .from("chats")
          .delete()
          .eq("id", item.id);
        if (error) {
          showAlert("Couldn't delete chat", error.message);
          loadChats(true);
        }
        return;
      }
    },
    [loadChats],
  );

  useEffect(() => {
    if (!user) return;
    import("../../lib/rewardXp").then(({ rewardXp }) => rewardXp("daily_login")).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // Listen for new chats being created (new chat_member rows for this user)
    const memberChannel = supabase
      .channel(`chatlist-member-inserts:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_members", filter: `user_id=eq.${user.id}` },
        () => loadChats(true)
      )
      .subscribe();
    return () => { supabase.removeChannel(memberChannel); };
  }, [user, loadChats]);

  useEffect(() => {
    if (!user) return;
    return addOnlineListener(() => loadChats());
  }, [user, loadChats]);

  // Periodic background refresh — ensures the list stays current even if
  // a realtime event is missed or the channel briefly disconnects
  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(() => loadChats(true), 15000);
      return () => clearInterval(interval);
    }, [loadChats])
  );

  const chatIdsKey = chats.map((c) => c.id).sort().join(",");

  useEffect(() => {
    if (!user || !chatIdsKey) return;

    const chatIds = chatIdsKey.split(",");

    // Subscribe to new messages in each known chat
    const msgChannel = supabase.channel(`chatlist-messages:${user.id}`);
    chatIds.forEach((chatId) => {
      msgChannel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        () => loadChats(true)
      );
    });
    msgChannel.subscribe();

    // Also subscribe to chat-level updates (pinning, archiving, name changes)
    // We filter client-side since Supabase realtime doesn't support IN filters
    const chatChannel = supabase
      .channel(`chatlist-chats:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chats" },
        (payload: any) => {
          if (chatIds.includes(payload.new?.id)) {
            loadChats(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(chatChannel);
    };
  }, [user, chatIdsKey, loadChats]);

  const tabFiltered = chats.filter((c) => {
    if (tabFilter === "unread") return c.unread_count > 0;
    if (tabFilter === "personal") return !c.is_group && !c.is_channel;
    if (tabFilter === "groups") return c.is_group && !c.is_channel;
    if (tabFilter === "channels") return c.is_channel;
    return true;
  });

  const filtered = search
    ? tabFiltered.filter((c) => {
        const name = c.is_group || c.is_channel ? c.name : c.other_display_name;
        return name?.toLowerCase().includes(search.toLowerCase());
      })
    : tabFiltered;

  const totalUnread = chats.reduce((sum, c) => sum + c.unread_count, 0);
  const personalUnread = chats.filter((c) => !c.is_group && !c.is_channel).reduce((sum, c) => sum + c.unread_count, 0);
  const groupsUnread = chats.filter((c) => c.is_group && !c.is_channel).reduce((sum, c) => sum + c.unread_count, 0);
  const channelsUnread = chats.filter((c) => c.is_channel).reduce((sum, c) => sum + c.unread_count, 0);

  const TABS: { key: ChatTabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: "all", label: "All chats", icon: "chatbubbles-outline", count: totalUnread },
    { key: "unread", label: "Unread", icon: "mail-unread-outline", count: totalUnread },
    { key: "personal", label: "Personal", icon: "person-outline", count: personalUnread },
    { key: "groups", label: "Groups", icon: "people-outline", count: groupsUnread },
    { key: "channels", label: "Channels", icon: "megaphone-outline", count: channelsUnread },
  ];

  useEffect(() => {
    if (panelMode) return;
    navigation.setOptions({
      tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? "99+" : totalUnread) : undefined,
    });
  }, [navigation, totalUnread, panelMode]);

  if (!user) {
    if (panelMode) {
      // Inside the desktop master-detail panel — keep the layout intact and
      // show a tasteful "sign in" placeholder instead of redirecting.
      return (
        <View style={[styles.root, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24 }]}>
          <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12 }]}>Sign in to chat</Text>
        </View>
      );
    }
    // Chats are private — gate behind auth. Send anyone hitting the chats
    // tab without a session straight to the login screen.
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          width: panelMode ? 360 : undefined,
          borderRightWidth: panelMode ? StyleSheet.hairlineWidth : 0,
          borderRightColor: colors.border,
        },
      ]}
    >
      <OfflineBanner />
      {panelMode ? (
        <View style={[styles.panelHeader, { backgroundColor: colors.background }]}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Chats</Text>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/contacts")}
            style={[styles.panelHeaderBtn, { backgroundColor: colors.backgroundSecondary }]}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      ) : (
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.background },
        ]}
      >
        {/* Account avatar stack — left side */}
        {(() => {
          const others = linkedAccounts.filter(a => a.userId !== user?.id);
          const currentFallback = { userId: user?.id || "", displayName: profile?.display_name || "", avatarUrl: profile?.avatar_url || null };
          const currentStored = linkedAccounts.find(a => a.userId === user?.id);
          const current = currentStored || currentFallback;
          // Others first (behind), current last (on top). Max 3 total.
          const displayList = [...others, current].slice(-3);
          const extra = linkedAccounts.length > 3 ? linkedAccounts.length - 3 : 0;
          return (
            <TouchableOpacity
              style={styles.accountStack}
              onPress={() => router.push("/linked-accounts")}
              activeOpacity={0.75}
            >
              {displayList.map((acc, i) => {
                const isActive = acc.userId === user?.id;
                const isSwitching = switchingId === acc.userId;
                return (
                  <TouchableOpacity
                    key={acc.userId}
                    style={[
                      styles.stackAvatarWrap,
                      {
                        marginLeft: i === 0 ? 0 : -10,
                        zIndex: i + 1,
                        borderColor: colors.surface,
                        borderWidth: 1.5,
                        borderRadius: 18,
                      },
                    ]}
                    onPress={async (e) => {
                      e.stopPropagation();
                      if (isActive) {
                        router.push("/linked-accounts");
                        return;
                      }
                      setSwitchingId(acc.userId);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      await switchAccount(acc.userId);
                      setSwitchingId(null);
                    }}
                    activeOpacity={0.75}
                    disabled={isSwitching}
                  >
                    {isSwitching ? (
                      <View style={[styles.stackAvatar, { backgroundColor: colors.inputBg, alignItems: "center", justifyContent: "center" }]}>
                        <ActivityIndicator size="small" color={colors.accent} />
                      </View>
                    ) : (
                      <Avatar uri={acc.avatarUrl} name={acc.displayName} size={30} />
                    )}
                  </TouchableOpacity>
                );
              })}
              {extra > 0 && (
                <View style={[styles.stackAvatarWrap, styles.stackExtra, { marginLeft: -10, backgroundColor: colors.inputBg, borderColor: colors.surface, zIndex: 10 }]}>
                  <Text style={[styles.stackExtraText, { color: colors.textMuted }]}>+{extra}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })()}

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
      )}

      <View style={[styles.searchWrap, { backgroundColor: colors.background }]}>
        <View style={[
          styles.searchBox,
          { backgroundColor: colors.backgroundSecondary },
        ]}>
          <Ionicons
            name="search-outline"
            size={19}
            color={colors.textMuted}
          />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search conversations…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <View style={[styles.clearBtn, { backgroundColor: colors.textMuted + "28" }]}>
                <Ionicons name="close" size={13} color={colors.textMuted} />
              </View>
            </Pressable>
          ) : (
            <View style={[styles.kbdHint, { borderColor: colors.border }]}>
              <Ionicons name="mic-outline" size={14} color={colors.textMuted} />
            </View>
          )}
        </View>
      </View>

      <View style={[styles.body, isDesktop && styles.bodyRow]}>
        {isDesktop && (
          <View style={styles.rail}>
            {TABS.map((tab) => {
              const active = tabFilter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={styles.railTab}
                  onPress={() => setTabFilter(tab.key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.railIconWrap}>
                    <Ionicons
                      name={tab.icon}
                      size={22}
                      color={active ? colors.text : colors.textMuted}
                    />
                    {tab.count > 0 && (
                      <View style={[styles.railBadge, { backgroundColor: "#FF3B30" }]}>
                        <Text style={[styles.railBadgeText, { color: "#fff" }]}>
                          {tab.count > 99 ? "99+" : tab.count}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.railLabel,
                      {
                        color: active ? colors.text : colors.textMuted,
                        fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <ChatRowSkeleton key={i} />)}</View>
          ) : filtered.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {tabFilter === "all" ? "No chats yet" : `No ${TABS.find(t => t.key === tabFilter)?.label.toLowerCase()}`}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {tabFilter === "all" ? "Start a conversation from Contacts" : "Try another filter"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ChatRow
                  item={item}
                  isActive={panelMode && item.id === activeChatId}
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push({ pathname: "/chat/[id]", params: { id: item.id } });
                  }}
                  onAction={handleChatAction}
                />
              )}
              ItemSeparatorComponent={() => <Separator indent={74} />}
              ListHeaderComponent={user && tabFilter === "all" && !search ? <StoriesBar userId={user.id} colors={colors} /> : null}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => { setRefreshing(true); loadChats(); }}
                  tintColor={colors.accent}
                />
              }
              contentContainerStyle={{ paddingBottom: insets.bottom + 52 + 80 + 50 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>

      {user && panelMode && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.accent, bottom: 24, right: 24 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(tabs)/contacts"); }}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {user && !panelMode && (
        <>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: colors.accent, bottom: insets.bottom + 52 + 16 }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(tabs)/contacts"); }}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={24} color="#fff" />
          </TouchableOpacity>

          {Platform.OS !== "web" && (
            <TouchableOpacity
              style={[styles.cameraFab, { bottom: insets.bottom + 52 + 16 + 54 + 12 }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/stories/camera"); }}
              activeOpacity={0.7}
            >
              <Ionicons name="camera" size={20} color={colors.accent} />
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

/**
 * Default route export — the chats screen as it appears at /(tabs).
 *
 * On mobile we render the full chats list. On desktop we render a tiny
 * stub: `DesktopShell` mounts the persistent `ChatsListPanel` on the left
 * and the `ChatHomePlaceholder` empty state on the right, so this route
 * just needs to occupy the slot and not render its own duplicate list.
 */
export default function ChatsRoute() {
  const { isDesktop } = useIsDesktop();
  // On desktop the shell takes over rendering for the chats home; return
  // an empty fragment to avoid mounting the chats screen twice.
  if (isDesktop) return <View style={{ flex: 1 }} />;
  return <ChatsScreen />;
}

/**
 * Named export used by `DesktopShell` to render the chats list as a sticky
 * 360px column on the left of any /(tabs) or /chat/* route. Includes its
 * own data fetching, search, filter rail, and active-chat highlighting.
 */
export function ChatsListPanel() {
  return <ChatsScreen panelMode />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  body: { flex: 1 },
  bodyRow: { flexDirection: "row" },
  rail: {
    width: 88,
    paddingTop: 4,
    paddingHorizontal: 4,
    gap: 2,
  },
  railTab: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    gap: 4,
  },
  railIconWrap: {
    width: 36,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  railLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
    textAlign: "center",
  },
  railBadge: {
    position: "absolute",
    top: -4,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  railBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  panelTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  panelHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
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
  searchWrap: { paddingHorizontal: 14, paddingVertical: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 40,
    gap: 9,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 40, letterSpacing: 0.1 },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  kbdHint: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
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
  onlineDot: { position: "absolute", bottom: 1, right: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: "#34C759", borderWidth: 2 },
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
  cameraFab: {
    position: "absolute",
    right: 24,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  accountStack: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
  },
  stackAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  stackAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: "hidden",
  },
  stackExtra: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  stackExtraText: { fontSize: 10, fontFamily: "Inter_700Bold" },
});
