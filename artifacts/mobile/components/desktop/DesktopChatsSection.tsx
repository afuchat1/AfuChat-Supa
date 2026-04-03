import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { DesktopChatView } from "@/components/DesktopChatView";
import Colors from "@/constants/colors";

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

type Filter = "all" | "groups" | "channels";

const FILTER_LABELS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "groups", label: "Groups" },
  { key: "channels", label: "Channels" },
];

function ChatRow({
  item,
  isSelected,
  onPress,
  colors,
  isDark,
}: {
  item: ChatItem;
  isSelected: boolean;
  onPress: () => void;
  colors: any;
  isDark: boolean;
}) {
  const displayName = item.is_group || item.is_channel ? item.name : item.other_display_name;
  const avatar = item.is_group || item.is_channel ? item.avatar_url : item.other_avatar;
  const hasUnread = item.unread_count > 0;
  const [hovered, setHovered] = useState(false);

  const hoverProps =
    Platform.OS === "web"
      ? {
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
        }
      : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.chatRow,
        isSelected && { backgroundColor: colors.accent + "18" },
        !isSelected && hovered && { backgroundColor: colors.backgroundSecondary + "70" },
      ]}
      {...(hoverProps as any)}
    >
      {isSelected && <View style={[styles.selectedBar, { backgroundColor: colors.accent }]} />}
      <View style={{ position: "relative" }}>
        <Avatar uri={avatar} name={displayName || "Chat"} size={44} />
        {item.is_channel && (
          <View style={[styles.channelBadge, { backgroundColor: colors.accent }]}>
            <Ionicons name="megaphone" size={9} color="#fff" />
          </View>
        )}
      </View>
      <View style={styles.chatInfo}>
        <View style={styles.chatTop}>
          <View style={styles.chatNameRow}>
            <Text
              style={[
                styles.chatName,
                { color: isSelected ? colors.accent : colors.text },
                hasUnread && { fontFamily: "Inter_700Bold" },
              ]}
              numberOfLines={1}
            >
              {displayName || "Chat"}
            </Text>
            {!item.is_group && !item.is_channel && (
              <VerifiedBadge
                isVerified={item.is_verified}
                isOrganizationVerified={item.is_organization_verified}
                size={12}
              />
            )}
          </View>
          <Text style={[styles.chatTime, { color: hasUnread ? colors.accent : colors.textMuted }]}>
            {item.last_message_at ? formatTime(item.last_message_at) : ""}
          </Text>
        </View>
        <View style={styles.chatBottom}>
          <Text
            style={[
              styles.chatPreview,
              { color: hasUnread ? colors.text : colors.textMuted },
              hasUnread && { fontFamily: "Inter_500Medium" },
            ]}
            numberOfLines={1}
          >
            {item.last_message || "No messages yet"}
          </Text>
          {hasUnread && (
            <View style={[styles.unreadDot, { backgroundColor: colors.accent }]}>
              <Text style={styles.unreadText}>
                {item.unread_count > 99 ? "99+" : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ChatListEmpty({ colors }: { colors: any }) {
  return (
    <View style={styles.emptyList}>
      <Ionicons name="chatbubbles-outline" size={44} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No conversations</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        Start a chat to get going
      </Text>
      <TouchableOpacity
        style={[styles.newChatBtn, { backgroundColor: colors.accent }]}
        onPress={() => router.push("/group/create" as any)}
        activeOpacity={0.85}
      >
        <Ionicons name="create-outline" size={16} color="#fff" />
        <Text style={styles.newChatBtnText}>New Chat</Text>
      </TouchableOpacity>
    </View>
  );
}

function WelcomePane({ colors, isDark }: { colors: any; isDark: boolean }) {
  return (
    <View style={[styles.welcomePane, { backgroundColor: isDark ? "#0d0d10" : "#f8f9fc" }]}>
      <View style={[styles.welcomeIconWrap, { backgroundColor: colors.accent + "15" }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={56} color={colors.accent} />
      </View>
      <Text style={[styles.welcomeTitle, { color: colors.text }]}>Welcome to AfuChat</Text>
      <Text style={[styles.welcomeSub, { color: colors.textMuted }]}>
        Select a conversation to start messaging, or create a new chat.
      </Text>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        <TouchableOpacity
          style={[styles.welcomeBtn, { backgroundColor: colors.accent }]}
          onPress={() => router.push("/group/create" as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={15} color="#fff" />
          <Text style={styles.welcomeBtnText}>New Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.welcomeBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          onPress={() => router.push("/channel/create" as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="megaphone-outline" size={15} color={colors.accent} />
          <Text style={[styles.welcomeBtnText, { color: colors.accent }]}>New Channel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function DesktopChatsSection() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const loadChats = useCallback(async () => {
    if (!user) return;
    const { data: memberRows } = await supabase
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", user.id);

    if (!memberRows || memberRows.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }

    const chatIds = memberRows.map((m: any) => m.chat_id);

    const [chatResult, lastMsgsResult] = await Promise.all([
      supabase
        .from("chats")
        .select(`id, name, is_group, is_channel, avatar_url, updated_at,
          chat_members(user_id, profiles(id, display_name, avatar_url, is_verified, is_organization_verified))`)
        .in("id", chatIds)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false }),
      supabase
        .from("messages")
        .select("chat_id, encrypted_content, sent_at, attachment_type")
        .in("chat_id", chatIds)
        .order("sent_at", { ascending: false })
        .limit(chatIds.length * 2),
    ]);

    const chatRows = chatResult.data || [];
    const lastMsgMap: Record<string, { msg: string; at: string }> = {};
    for (const m of lastMsgsResult.data || []) {
      if (!lastMsgMap[m.chat_id]) {
        let preview = m.encrypted_content || "";
        if (m.attachment_type === "story_reply") preview = preview ? `📸 ${preview}` : "📸 Replied";
        lastMsgMap[m.chat_id] = { msg: preview, at: m.sent_at };
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
        last_message: lm?.msg || "",
        last_message_at: lm?.at || c.updated_at || "",
        avatar_url: c.avatar_url,
        unread_count: 0,
        is_verified: !!other?.is_verified,
        is_organization_verified: !!other?.is_organization_verified,
      };
    });

    setChats(items);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadChats(); }, [loadChats]);

  useEffect(() => {
    if (!user) return;
    const chan = supabase
      .channel(`desktop-chats-list:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        loadChats();
      })
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [user, loadChats]);

  const filtered = chats.filter((c) => {
    if (filter === "groups" && !c.is_group) return false;
    if (filter === "channels" && !c.is_channel) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (c.is_group || c.is_channel ? c.name : c.other_display_name) || "";
      if (!name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <View style={styles.root}>
      {/* Left panel: chat list */}
      <View
        style={[
          styles.listPanel,
          { backgroundColor: isDark ? "#0c0c0f" : "#f5f6f8", borderRightColor: colors.border },
        ]}
      >
        {/* Header */}
        <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Messages</Text>
          <TouchableOpacity
            style={[styles.composeBtn, { backgroundColor: colors.accent + "18" }]}
            onPress={() => router.push("/group/create" as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={17} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[styles.searchWrap, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="search-outline" size={15} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search conversations…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {FILTER_LABELS.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterChip,
                filter === f.key
                  ? { backgroundColor: colors.accent, borderColor: colors.accent }
                  : { backgroundColor: "transparent", borderColor: colors.border },
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: filter === f.key ? "#fff" : colors.textMuted },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chat list */}
        {loading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <ChatRow
                item={item}
                isSelected={selectedChatId === item.id}
                onPress={() => setSelectedChatId(item.id)}
                colors={colors}
                isDark={isDark}
              />
            )}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<ChatListEmpty colors={colors} />}
            contentContainerStyle={filtered.length === 0 ? { flex: 1 } : undefined}
          />
        )}
      </View>

      {/* Right panel: selected chat */}
      <View style={[styles.chatPane, { backgroundColor: isDark ? "#0f0f12" : "#ffffff" }]}>
        {selectedChatId ? (
          <DesktopChatView
            chatId={selectedChatId}
            onClose={() => setSelectedChatId(null)}
          />
        ) : (
          <WelcomePane colors={colors} isDark={isDark} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  listPanel: {
    width: 300,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    flexDirection: "column",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  composeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: "relative",
    overflow: "hidden",
  },
  selectedBar: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
  },
  channelBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  chatInfo: {
    flex: 1,
    minWidth: 0,
  },
  chatTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  chatNameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  chatName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  chatTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flexShrink: 0,
  },
  chatBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  chatPreview: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  unreadDot: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyList: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    marginTop: 8,
  },
  newChatBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  chatPane: {
    flex: 1,
    overflow: "hidden",
  },
  welcomePane: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
    gap: 14,
  },
  welcomeIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  welcomeTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  welcomeSub: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  welcomeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 24,
  },
  welcomeBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
