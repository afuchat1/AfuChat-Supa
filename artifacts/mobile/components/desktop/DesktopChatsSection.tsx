import React, { useCallback, useEffect, useState } from "react";
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
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

type Filter = "all" | "unread" | "groups";

function useWaColors(isDark: boolean) {
  return isDark
    ? {
        bg: "#111b21",
        surface: "#202c33",
        input: "#2a3942",
        text: "#e9edef",
        muted: "#8696a0",
        border: "#222f35",
        brand: "#00BCD4",
        rowHover: "#2a3942",
        rowSelected: "rgba(0,188,212,0.12)",
        selectedBar: "#00BCD4",
        unreadBg: "#00BCD4",
        filterActive: "#00BCD4",
        filterActiveTxt: "#fff",
        filterInactive: "transparent",
        filterInactiveBorder: "#2a3942",
        filterInactiveTxt: "#8696a0",
        welcomeBg: "#0b1014",
      }
    : {
        bg: "#f0f2f5",
        surface: "#ffffff",
        input: "#f0f2f5",
        text: "#111b21",
        muted: "#667781",
        border: "#d1d7db",
        brand: "#00a884",
        rowHover: "#f5f6f6",
        rowSelected: "rgba(0,168,132,0.08)",
        selectedBar: "#00a884",
        unreadBg: "#25d366",
        filterActive: "#25d366",
        filterActiveTxt: "#111b21",
        filterInactive: "transparent",
        filterInactiveBorder: "#d1d7db",
        filterInactiveTxt: "#667781",
        welcomeBg: "#f0f2f5",
      };
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "groups", label: "Groups" },
];

function ChatRow({
  item,
  isSelected,
  onPress,
  wa,
}: {
  item: ChatItem;
  isSelected: boolean;
  onPress: () => void;
  wa: ReturnType<typeof useWaColors>;
}) {
  const displayName = item.is_group || item.is_channel ? item.name : item.other_display_name;
  const avatarUri = item.is_group || item.is_channel ? item.avatar_url : item.other_avatar;
  const hasUnread = item.unread_count > 0;
  const [hovered, setHovered] = useState(false);

  const hoverProps =
    Platform.OS === "web"
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={[
        st.chatRow,
        isSelected && { backgroundColor: wa.rowSelected },
        !isSelected && hovered && { backgroundColor: wa.rowHover },
        { borderBottomColor: wa.border },
      ]}
      {...(hoverProps as any)}
    >
      {isSelected && <View style={[st.selectedBar, { backgroundColor: wa.selectedBar }]} />}
      <View style={{ position: "relative" }}>
        <Avatar uri={avatarUri} name={displayName || "Chat"} size={48} />
        {item.is_channel && (
          <View style={[st.channelBadge, { backgroundColor: wa.brand }]}>
            <Ionicons name="megaphone" size={9} color="#fff" />
          </View>
        )}
      </View>
      <View style={st.chatInfo}>
        <View style={st.chatTop}>
          <View style={st.chatNameRow}>
            <Text
              style={[
                st.chatName,
                { color: isSelected ? wa.brand : wa.text },
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
          <Text style={[st.chatTime, { color: hasUnread ? wa.brand : wa.muted }]}>
            {item.last_message_at ? formatTime(item.last_message_at) : ""}
          </Text>
        </View>
        <View style={st.chatBottom}>
          <Text
            style={[
              st.chatPreview,
              { color: hasUnread ? wa.text : wa.muted },
              hasUnread && { fontFamily: "Inter_500Medium" },
            ]}
            numberOfLines={1}
          >
            {item.last_message || "Tap to open chat"}
          </Text>
          {hasUnread && (
            <View style={[st.unreadBadge, { backgroundColor: wa.unreadBg }]}>
              <Text style={st.unreadText}>
                {item.unread_count > 99 ? "99+" : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function WelcomePane({ wa }: { wa: ReturnType<typeof useWaColors> }) {
  return (
    <View style={[st.welcomePane, { backgroundColor: wa.welcomeBg, borderLeftColor: wa.border }]}>
      <View style={[st.welcomeIconWrap, { backgroundColor: wa.brand + "15" }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={64} color={wa.brand} />
      </View>
      <Text style={[st.welcomeTitle, { color: wa.text }]}>AfuChat for Web</Text>
      <Text style={[st.welcomeSub, { color: wa.muted }]}>
        Send and receive messages without keeping your phone online.{"\n"}
        Select a conversation to start messaging.
      </Text>
      <View style={[st.welcomeDivider, { backgroundColor: wa.border }]} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity
          style={[st.welcomeBtn, { backgroundColor: wa.brand }]}
          onPress={() => router.push("/group/create" as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={16} color="#fff" />
          <Text style={st.welcomeBtnText}>New Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.welcomeBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: wa.brand }]}
          onPress={() => router.push("/channel/create" as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="megaphone-outline" size={16} color={wa.brand} />
          <Text style={[st.welcomeBtnText, { color: wa.brand }]}>New Channel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function DesktopChatsSection() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const wa = useWaColors(isDark);

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
        if (m.attachment_type === "image") preview = "📷 Photo";
        else if (m.attachment_type === "video") preview = "🎥 Video";
        else if (m.attachment_type === "audio") preview = "🎵 Voice message";
        else if (m.attachment_type === "story_reply") preview = preview ? `📸 ${preview}` : "📸 Replied";
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
    if (filter === "unread" && c.unread_count === 0) return false;
    if (filter === "groups" && !c.is_group) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (c.is_group || c.is_channel ? c.name : c.other_display_name) || "";
      if (!name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <View style={[st.root, { backgroundColor: wa.bg }]}>
      <View style={[st.listPanel, { backgroundColor: wa.bg, borderRightColor: wa.border }]}>
        <View style={[st.panelHeader, { backgroundColor: wa.surface }]}>
          <Text style={[st.panelTitle, { color: wa.text }]}>Messages</Text>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <TouchableOpacity
              style={[st.headerBtn, { backgroundColor: wa.input }]}
              onPress={() => router.push("/group/create" as any)}
              hitSlop={8}
            >
              <Ionicons name="create-outline" size={18} color={wa.brand} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.headerBtn, { backgroundColor: wa.input }]}
              hitSlop={8}
            >
              <Ionicons name="ellipsis-vertical" size={18} color={wa.muted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[st.searchRow, { backgroundColor: wa.surface, paddingBottom: 8 }]}>
          <View style={[st.searchWrap, { backgroundColor: wa.input }]}>
            <Ionicons name="search-outline" size={15} color={wa.muted} />
            <TextInput
              style={[st.searchInput, { color: wa.text }]}
              placeholder="Search or start new chat"
              placeholderTextColor={wa.muted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={15} color={wa.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={[st.filterRow, { backgroundColor: wa.surface, borderBottomColor: wa.border }]}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                st.filterChip,
                filter === f.key
                  ? { backgroundColor: wa.filterActive, borderColor: wa.filterActive }
                  : { backgroundColor: wa.filterInactive, borderColor: wa.filterInactiveBorder },
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  st.filterChipText,
                  { color: filter === f.key ? wa.filterActiveTxt : wa.filterInactiveTxt },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={st.loadingCenter}>
            <ActivityIndicator color={wa.brand} />
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
                wa={wa}
              />
            )}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={st.emptyList}>
                <Ionicons name="chatbubbles-outline" size={44} color={wa.muted} />
                <Text style={[st.emptyTitle, { color: wa.text }]}>
                  {search ? "No results found" : "No conversations"}
                </Text>
                <Text style={[st.emptySub, { color: wa.muted }]}>
                  {search ? "Try a different name" : "Start a chat to get going"}
                </Text>
              </View>
            }
          />
        )}
      </View>

      <View style={[st.chatPane, { backgroundColor: wa.welcomeBg }]}>
        {selectedChatId ? (
          <DesktopChatView
            chatId={selectedChatId}
            onClose={() => setSelectedChatId(null)}
          />
        ) : (
          <WelcomePane wa={wa} />
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", overflow: "hidden" },

  listPanel: {
    width: 380,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    flexDirection: "column",
    overflow: "hidden",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  panelTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  searchRow: { paddingHorizontal: 12, paddingTop: 4 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  selectedBar: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
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
  chatInfo: { flex: 1, minWidth: 0 },
  chatTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  chatNameRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  chatName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  chatTime: { fontSize: 11, fontFamily: "Inter_400Regular", flexShrink: 0 },
  chatBottom: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  chatPreview: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },

  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },

  emptyList: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10, paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  chatPane: { flex: 1, overflow: "hidden" },

  welcomePane: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
    gap: 14,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  welcomeIconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  welcomeTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  welcomeSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 340,
  },
  welcomeDivider: { height: 1, width: 200, marginVertical: 4 },
  welcomeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 24,
  },
  welcomeBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
