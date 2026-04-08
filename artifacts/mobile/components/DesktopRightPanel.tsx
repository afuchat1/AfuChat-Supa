import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useDesktopDetail } from "@/context/DesktopDetailContext";
import { Avatar } from "@/components/ui/Avatar";
import { supabase } from "@/lib/supabase";
import { DesktopChatView } from "./DesktopChatView";
import { DesktopPostView } from "./DesktopPostView";

type SuggestedUser = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified: boolean;
};

type TrendingTopic = {
  tag: string;
  post_count: number;
};

function SearchBar({ colors }: { colors: any }) {
  const [query, setQuery] = useState("");

  function handleSubmit() {
    if (!query.trim()) return;
    router.push({ pathname: "/(tabs)/search", params: { q: query.trim() } } as any);
  }

  return (
    <View style={[sb.wrap, { backgroundColor: colors.backgroundSecondary || (colors.background === "#000" ? "#202327" : "#eff3f4") }]}>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput
        style={[sb.input, { color: colors.text }]}
        placeholder="Search AfuChat"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        onSubmitEditing={handleSubmit}
      />
    </View>
  );
}

const sb = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});

function WhoToFollow({ colors }: { colors: any }) {
  const { user } = useAuth();
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, is_verified")
        .neq("id", user.id)
        .limit(4)
        .order("follower_count", { ascending: false });
      setUsers(data || []);
      setLoading(false);
    })();
  }, [user]);

  if (!user || (!loading && users.length === 0)) return null;

  return (
    <View style={[rp.card, { backgroundColor: colors.surface }]}>
      <Text style={[rp.sectionTitle, { color: colors.text }]}>Who to follow</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
      ) : (
        users.map((u) => (
          <TouchableOpacity
            key={u.id}
            style={rp.userRow}
            onPress={() => router.push({ pathname: "/contact/[id]", params: { id: u.id } } as any)}
            activeOpacity={0.85}
          >
            <Avatar uri={u.avatar_url} name={u.display_name} size={40} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[rp.userName, { color: colors.text }]} numberOfLines={1}>
                  {u.display_name}
                </Text>
                {u.is_verified && <Ionicons name="checkmark-circle" size={13} color={colors.accent} />}
              </View>
              <Text style={[rp.userHandle, { color: colors.textMuted }]} numberOfLines={1}>
                @{u.handle}
              </Text>
            </View>
            <TouchableOpacity
              style={[rp.followBtn, { borderColor: colors.text }]}
              onPress={() => router.push({ pathname: "/contact/[id]", params: { id: u.id } } as any)}
              activeOpacity={0.75}
            >
              <Text style={[rp.followBtnText, { color: colors.text }]}>Follow</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))
      )}
      <TouchableOpacity style={rp.showMore} onPress={() => {}}>
        <Text style={{ color: colors.accent, fontSize: 14, fontFamily: "Inter_400Regular" }}>
          Show more
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function TrendingTopics({ colors }: { colors: any }) {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("posts")
        .select("content")
        .eq("is_blocked", false)
        .order("view_count", { ascending: false })
        .limit(200);

      if (!data) { setLoading(false); return; }

      const tagMap: Record<string, number> = {};
      const re = /#(\w+)/g;
      for (const row of data) {
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(row.content || "")) !== null) {
          const tag = m[1].toLowerCase();
          tagMap[tag] = (tagMap[tag] || 0) + 1;
        }
      }

      setTopics(
        Object.entries(tagMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([tag, post_count]) => ({ tag, post_count }))
      );
      setLoading(false);
    })();
  }, []);

  if (!loading && topics.length === 0) return null;

  return (
    <View style={[rp.card, { backgroundColor: colors.surface }]}>
      <Text style={[rp.sectionTitle, { color: colors.text }]}>Trends for you</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
      ) : (
        topics.map((t, i) => (
          <TouchableOpacity
            key={t.tag}
            style={[
              rp.topicRow,
              i < topics.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(128,128,128,0.12)" },
            ]}
            activeOpacity={0.75}
          >
            <View style={{ flex: 1 }}>
              <Text style={[rp.topicCategory, { color: colors.textMuted }]}>Trending</Text>
              <Text style={[rp.topicTag, { color: colors.text }]}>#{t.tag}</Text>
              <Text style={[rp.topicCount, { color: colors.textMuted }]}>
                {t.post_count.toLocaleString()} post{t.post_count !== 1 ? "s" : ""}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

function EmptyConversation({ colors }: { colors: any }) {
  return (
    <View style={rp.emptyConvo}>
      <View style={[rp.emptyIconWrap, { backgroundColor: colors.accent + "18" }]}>
        <Ionicons name="chatbubbles-outline" size={48} color={colors.accent} />
      </View>
      <Text style={[rp.emptyTitle, { color: colors.text }]}>Select a conversation</Text>
      <Text style={[rp.emptySub, { color: colors.textMuted }]}>
        Choose a chat from the list to start messaging
      </Text>
    </View>
  );
}

export function DesktopRightPanel({ activeTab, colors }: { activeTab: string; colors: any }) {
  const { detail, closeDetail } = useDesktopDetail();
  const { session } = useAuth();

  if (detail?.type === "post") return <DesktopPostView postId={detail.id} onClose={closeDetail} />;

  if (activeTab === "index") {
    if (detail?.type === "chat") return <DesktopChatView chatId={detail.id} onClose={closeDetail} />;
    return <EmptyConversation colors={colors} />;
  }

  return (
    <ScrollView
      style={[rp.scrollRoot, { backgroundColor: "transparent" }]}
      contentContainerStyle={rp.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <SearchBar colors={colors} />
      <TrendingTopics colors={colors} />
      {session && <WhoToFollow colors={colors} />}

      <Text style={[rp.footer, { color: colors.textMuted }]}>
        Terms · Privacy · Cookies · © 2025 AfuChat
      </Text>
    </ScrollView>
  );
}

const rp = StyleSheet.create({
  scrollRoot: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },

  card: {
    borderRadius: 4,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 19,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  followBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  showMore: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  topicRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topicCategory: { fontSize: 12, fontFamily: "Inter_400Regular" },
  topicTag: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 1 },
  topicCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  footer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as any,
    marginTop: 4,
    lineHeight: 18,
  },
  emptyConvo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
});
