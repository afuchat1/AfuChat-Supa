import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useDesktopDetail } from "@/context/DesktopDetailContext";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { DesktopChatView } from "./DesktopChatView";

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

function WhoToFollow({ colors }: { colors: any }) {
  const { user } = useAuth();
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, is_verified")
        .neq("id", user.id)
        .limit(5)
        .order("follower_count", { ascending: false });
      setUsers(data || []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <View style={[panelStyles.card, { backgroundColor: colors.surface }]}>
      <Text style={[panelStyles.cardTitle, { color: colors.text }]}>Who to follow</Text>
      {loading ? (
        <ActivityIndicator color={Colors.brand} style={{ marginVertical: 16 }} />
      ) : (
        users.map((u) => (
          <TouchableOpacity
            key={u.id}
            style={panelStyles.userRow}
            onPress={() => router.push({ pathname: "/profile/[id]", params: { id: u.id } } as any)}
          >
            <Avatar uri={u.avatar_url} name={u.display_name} size={38} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[panelStyles.userName, { color: colors.text }]} numberOfLines={1}>
                  {u.display_name}
                </Text>
                {u.is_verified && (
                  <Ionicons name="checkmark-circle" size={13} color={Colors.brand} />
                )}
              </View>
              <Text style={[panelStyles.userHandle, { color: colors.textMuted }]} numberOfLines={1}>
                @{u.handle}
              </Text>
            </View>
            <TouchableOpacity
              style={[panelStyles.followBtn, { borderColor: Colors.brand }]}
              onPress={() => router.push({ pathname: "/profile/[id]", params: { id: u.id } } as any)}
            >
              <Text style={[panelStyles.followBtnText, { color: Colors.brand }]}>Follow</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

function TrendingTopics({ colors }: { colors: any }) {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("moments")
        .select("hashtags")
        .not("hashtags", "is", null)
        .limit(200);

      if (!data) { setLoading(false); return; }

      const tagMap: Record<string, number> = {};
      for (const row of data) {
        const tags: string[] = row.hashtags || [];
        for (const tag of tags) {
          tagMap[tag] = (tagMap[tag] || 0) + 1;
        }
      }

      const sorted = Object.entries(tagMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([tag, post_count]) => ({ tag, post_count }));

      setTopics(sorted);
      setLoading(false);
    })();
  }, []);

  if (!loading && topics.length === 0) return null;

  return (
    <View style={[panelStyles.card, { backgroundColor: colors.surface }]}>
      <Text style={[panelStyles.cardTitle, { color: colors.text }]}>Trending</Text>
      {loading ? (
        <ActivityIndicator color={Colors.brand} style={{ marginVertical: 16 }} />
      ) : (
        topics.map((t, i) => (
          <TouchableOpacity key={t.tag} style={panelStyles.topicRow}>
            <View style={{ flex: 1 }}>
              <Text style={[panelStyles.topicTag, { color: colors.text }]}>#{t.tag}</Text>
              <Text style={[panelStyles.topicCount, { color: colors.textMuted }]}>
                {t.post_count} post{t.post_count !== 1 ? "s" : ""}
              </Text>
            </View>
            <Ionicons name="trending-up" size={16} color={Colors.brand} />
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

function EmptyConversation({ colors }: { colors: any }) {
  return (
    <View style={panelStyles.emptyConvo}>
      <View style={[panelStyles.emptyIconWrap, { backgroundColor: Colors.brand + "18" }]}>
        <Ionicons name="chatbubbles-outline" size={48} color={Colors.brand} />
      </View>
      <Text style={[panelStyles.emptyTitle, { color: colors.text }]}>Select a conversation</Text>
      <Text style={[panelStyles.emptySub, { color: colors.textMuted }]}>
        Choose a chat from the list to start messaging
      </Text>
    </View>
  );
}

export function DesktopRightPanel({
  activeTab,
  colors,
}: {
  activeTab: string;
  colors: any;
}) {
  const { detail, closeDetail } = useDesktopDetail();
  const { session } = useAuth();

  if (activeTab === "index") {
    if (detail?.type === "chat") {
      return <DesktopChatView chatId={detail.id} onClose={closeDetail} />;
    }
    return <EmptyConversation colors={colors} />;
  }

  if (!session) return null;

  return (
    <ScrollView
      style={[panelStyles.scrollRoot, { backgroundColor: "transparent" }]}
      contentContainerStyle={panelStyles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <TrendingTopics colors={colors} />
      <WhoToFollow colors={colors} />

      <View style={[panelStyles.card, { backgroundColor: colors.surface }]}>
        <Text style={[panelStyles.cardTitle, { color: colors.text }]}>AfuChat</Text>
        <Text style={[panelStyles.legalText, { color: colors.textMuted }]}>
          Terms of Service · Privacy Policy · Cookie Policy · Accessibility · Ads info · More ·
        </Text>
        <Text style={[panelStyles.legalText, { color: colors.textMuted, marginTop: 6 }]}>
          © 2025 AfuChat
        </Text>
      </View>
    </ScrollView>
  );
}

const panelStyles = StyleSheet.create({
  scrollRoot: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 40 },
  card: {
    borderRadius: 18,
    padding: 16,
    gap: 0,
  },
  cardTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 14 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  userName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  followBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.12)",
  },
  topicTag: { fontSize: 14, fontFamily: "Inter_700Bold" },
  topicCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  legalText: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 18 },
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
