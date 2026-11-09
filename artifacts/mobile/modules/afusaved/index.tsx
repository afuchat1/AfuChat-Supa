import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image as RNImage,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { safeRouter } from "@/lib/navUtils";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { PostSkeleton } from "@/components/ui/Skeleton";

type SavedPost = {
  id: string;
  post_id: string;
  saved_at: string;
  post: {
    id: string;
    content: string;
    media_url: string | null;
    created_at: string;
    author: { handle: string; display_name: string; avatar_url: string | null; is_verified: boolean } | null;
  } | null;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AfuSavedApp() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("saved_posts")
      .select("id,post_id,saved_at,post:posts(id,content,media_url,created_at,author:profiles(handle,display_name,avatar_url,is_verified))")
      .eq("user_id", user.id)
      .order("saved_at", { ascending: false })
      .limit(50);
    setSaved((data as unknown as SavedPost[]) || []);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function unsave(itemId: string, postId: string) {
    await supabase.from("saved_posts").delete().eq("id", itemId);
    setSaved(prev => prev.filter(s => s.id !== itemId));
  }

  function renderItem({ item }: { item: SavedPost }) {
    const post = item.post;
    if (!post) return null;
    const author = post.author;
    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.cardHeader}>
          {author?.avatar_url ? (
            <Image source={{ uri: author.avatar_url }} style={s.avatar} />
          ) : (
            <View style={[s.avatarFallback, { backgroundColor: Colors.brand + "22" }]}>
              <Ionicons name="person" size={16} color={Colors.brand} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{author?.display_name || "User"}</Text>
              {author?.is_verified && <Ionicons name="checkmark-circle" size={13} color={Colors.brand} />}
            </View>
            <Text style={[s.handle, { color: colors.textMuted }]}>@{author?.handle} · {timeAgo(post.created_at)}</Text>
          </View>
          <TouchableOpacity onPress={() => unsave(item.id, item.post_id)} hitSlop={10}>
            <Ionicons name="bookmark" size={20} color={Colors.brand} />
          </TouchableOpacity>
        </View>
        <Text style={[s.content, { color: colors.text }]} numberOfLines={4}>{post.content}</Text>
        {post.media_url ? (
          <Image source={{ uri: post.media_url }} style={s.media} resizeMode="cover" />
        ) : null}
        <Text style={[s.savedAt, { color: colors.textMuted }]}>Saved {timeAgo(item.saved_at)} ago</Text>
      </View>
    );
  }

  if (loading) return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={{ padding: 12, gap: 8 }}>
        {[1,2,3,4,5,6].map(i => <PostSkeleton key={i} />)}
      </View>
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.headerBar, { borderBottomColor: colors.border, paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => safeRouter.back("/apps")} hitSlop={10} style={{ width: 34, height: 40, alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Saved Posts</Text>
        <Text style={[s.headerCount, { color: colors.textMuted }]}>{saved.length} item{saved.length !== 1 ? "s" : ""}</Text>
      </View>
      {saved.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="bookmark-outline" size={56} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.text }]}>No saved posts</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>Tap the bookmark icon on any post to save it here.</Text>
        </View>
      ) : (
        <FlatList
          data={saved}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  headerBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  card: { borderRadius: 16, borderWidth: 0.5, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  handle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  content: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  media: { width: "100%", height: 180, borderRadius: 10 },
  savedAt: { fontSize: 11, fontFamily: "Inter_400Regular" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
