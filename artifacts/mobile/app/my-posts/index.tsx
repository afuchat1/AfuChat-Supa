import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

const { width } = Dimensions.get("window");

type PostItem = {
  id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  likeCount: number;
  replyCount: number;
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function MyPostsScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("posts")
      .select(`id, content, image_url, created_at, view_count, post_images(image_url, display_order)`)
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      const postIds = data.map((p: any) => p.id);
      const [{ data: likes }, { data: replies }] = await Promise.all([
        postIds.length > 0 ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds) : { data: [] },
        postIds.length > 0 ? supabase.from("post_replies").select("post_id").in("post_id", postIds) : { data: [] },
      ]);

      const likeMap: Record<string, number> = {};
      for (const l of (likes || [])) likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1;
      const replyMap: Record<string, number> = {};
      for (const r of (replies || [])) replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1;

      setPosts(data.map((p: any) => ({
        id: p.id,
        content: p.content || "",
        image_url: p.image_url,
        images: (p.post_images || []).sort((a: any, b: any) => a.display_order - b.display_order).map((i: any) => i.image_url),
        created_at: p.created_at,
        view_count: p.view_count || 0,
        likeCount: likeMap[p.id] || 0,
        replyCount: replyMap[p.id] || 0,
      })));
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function deletePost(postId: string) {
    showAlert("Delete Post", "Are you sure you want to delete this post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          await supabase.from("posts").delete().eq("id", postId);
          setPosts((prev) => prev.filter((p) => p.id !== postId));
        },
      },
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Posts</Text>
        <TouchableOpacity onPress={() => router.push("/moments/create")}>
          <Ionicons name="add-circle-outline" size={24} color={Colors.brand} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.brand} /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const allImages = item.images.length > 0 ? item.images : item.image_url ? [item.image_url] : [];
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.surface }]}
                onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
                activeOpacity={0.85}
              >
                <View style={styles.cardHeader}>
                  <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardName, { color: colors.text }]}>{profile?.display_name || "You"}</Text>
                    <Text style={[styles.cardTime, { color: colors.textMuted }]}>{formatRelative(item.created_at)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => deletePost(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <RichText style={[styles.cardContent, { color: colors.text }]} numberOfLines={4}>{item.content}</RichText>

                {allImages.length > 0 && (
                  <View style={styles.images}>
                    {allImages.slice(0, 2).map((uri, i) => (
                      <Image key={i} source={{ uri }} style={styles.img} resizeMode="cover" />
                    ))}
                  </View>
                )}

                <View style={[styles.statsRow, { borderTopColor: colors.separator }]}>
                  <View style={styles.stat}>
                    <Ionicons name="heart-outline" size={16} color={colors.textMuted} />
                    <Text style={[styles.statText, { color: colors.textMuted }]}>{item.likeCount}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} />
                    <Text style={[styles.statText, { color: colors.textMuted }]}>{item.replyCount}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
                    <Text style={[styles.statText, { color: colors.textMuted }]}>{item.view_count}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.brand} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="newspaper-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No posts yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Share your first post!</Text>
              <TouchableOpacity style={styles.createBtn} onPress={() => router.push("/moments/create")}>
                <Text style={styles.createBtnText}>Create Post</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  card: { marginHorizontal: 8, borderRadius: 16, overflow: "hidden", paddingTop: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10, marginBottom: 10 },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardContent: { fontSize: 15, fontFamily: "Inter_400Regular", paddingHorizontal: 14, marginBottom: 10, lineHeight: 22 },
  images: { flexDirection: "row", gap: 4, paddingHorizontal: 14, marginBottom: 4 },
  img: { flex: 1, height: 120, borderRadius: 8 },
  statsRow: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, gap: 20 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  createBtn: { backgroundColor: Colors.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
