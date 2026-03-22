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
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";

const { width } = Dimensions.get("window");

type PostItem = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  is_verified: boolean;
  is_organization_verified: boolean;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  liked: boolean;
  likeCount: number;
  replyCount: number;
  score: number;
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function computeScore(post: {
  likeCount: number;
  replyCount: number;
  view_count: number;
  created_at: string;
  hasLikedAuthorBefore: boolean;
  hasImages: boolean;
}): number {
  const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3600000;
  const recencyDecay = Math.max(0, 1 - ageHours / 168);
  const engagementScore = post.likeCount * 2 + post.replyCount * 3 + Math.min(post.view_count, 50) * 0.1;
  const affinityBonus = post.hasLikedAuthorBefore ? 15 : 0;
  const mediaBonus = post.hasImages ? 3 : 0;
  return recencyDecay * 30 + engagementScore + affinityBonus + mediaBonus;
}

function PostCard({ item, onToggleLike }: { item: PostItem; onToggleLike: (postId: string) => void }) {
  const { colors } = useTheme();
  const allImages = item.images.length > 0 ? item.images : item.image_url ? [item.image_url] : [];
  const imgW = allImages.length === 1 ? width - 48 : (width - 56) / 2;

  function openPost() {
    router.push({ pathname: "/post/[id]", params: { id: item.id } });
  }

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.surface }]} onPress={openPost} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}>
          <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.cardName, { color: colors.text }]}>{item.profile.display_name}</Text>
            {item.is_organization_verified && (
              <Ionicons name="checkmark-circle" size={13} color={Colors.gold} style={{ marginLeft: 4 }} />
            )}
            {!item.is_organization_verified && item.is_verified && (
              <Ionicons name="checkmark-circle" size={13} color={Colors.brand} style={{ marginLeft: 4 }} />
            )}
          </View>
          <Text style={[styles.cardTime, { color: colors.textMuted }]}>
            @{item.profile.handle} · {formatRelative(item.created_at)}
          </Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
      </View>

      <Text style={[styles.cardContent, { color: colors.text }]}>{item.content}</Text>

      {allImages.length > 0 && (
        <View style={styles.images}>
          {allImages.map((uri, i) => (
            <Image
              key={i}
              source={{ uri }}
              style={[styles.img, { width: imgW, height: imgW * 0.75 }]}
              resizeMode="cover"
            />
          ))}
        </View>
      )}

      <View style={[styles.cardFooter, { borderTopColor: colors.separator }]}>
        <TouchableOpacity
          style={styles.action}
          onPress={() => { onToggleLike(item.id); }}
        >
          <Ionicons name={item.liked ? "heart" : "heart-outline"} size={18} color={item.liked ? "#FF3B30" : colors.textMuted} />
          {item.likeCount > 0 && <Text style={[styles.actionText, { color: item.liked ? "#FF3B30" : colors.textMuted }]}>{item.likeCount}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={openPost}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
          {item.replyCount > 0 && <Text style={[styles.actionText, { color: colors.textMuted }]}>{item.replyCount}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.action}>
          <Ionicons name="share-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.viewCount}>
          <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.viewText, { color: colors.textMuted }]}>{item.view_count}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;

  const fetchPosts = useCallback(async (offset: number, isRefresh: boolean) => {
    if (!user) { setLoading(false); setRefreshing(false); return; }
    const { data } = await supabase
      .from("posts")
      .select(`
        id, author_id, content, image_url, created_at, view_count,
        profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified),
        post_images(image_url, display_order)
      `)
      .eq("is_blocked", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (data) {
      if (data.length < PAGE_SIZE) setHasMore(false);
      else setHasMore(true);

      const postIds = data.map((p: any) => p.id);
      const authorIds = [...new Set(data.map((p: any) => p.author_id))];

      const [{ data: likeCounts }, { data: myLikes }, { data: replyCounts }, { data: myAuthorLikes }] = await Promise.all([
        postIds.length > 0
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds)
          : { data: [] },
        postIds.length > 0
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
        postIds.length > 0
          ? supabase.from("post_replies").select("post_id").in("post_id", postIds)
          : { data: [] },
        authorIds.length > 0
          ? supabase.from("post_acknowledgments")
              .select("post_id, posts!inner(author_id)")
              .eq("user_id", user.id)
              .in("posts.author_id", authorIds)
              .limit(200)
          : { data: [] },
      ]);

      const likeMap: Record<string, number> = {};
      for (const l of (likeCounts || [])) { likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1; }

      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));

      const replyMap: Record<string, number> = {};
      for (const r of (replyCounts || [])) { replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1; }

      const likedAuthorSet = new Set<string>();
      for (const al of (myAuthorLikes || [])) {
        const authorId = (al as any).posts?.author_id;
        if (authorId) likedAuthorSet.add(authorId);
      }

      const randomSeed = isRefresh ? Math.random() * 10 : 0;

      const items: PostItem[] = data.map((p: any) => {
        const likeCount = likeMap[p.id] || 0;
        const replyCount = replyMap[p.id] || 0;
        const hasImages = (p.post_images?.length > 0) || !!p.image_url;
        const hasLikedAuthorBefore = likedAuthorSet.has(p.author_id);

        return {
          id: p.id,
          author_id: p.author_id,
          content: p.content || "",
          image_url: p.image_url,
          images: (p.post_images || [])
            .sort((a: any, b: any) => a.display_order - b.display_order)
            .map((i: any) => i.image_url),
          created_at: p.created_at,
          view_count: p.view_count || 0,
          is_verified: p.profiles?.is_verified || false,
          is_organization_verified: p.profiles?.is_organization_verified || false,
          profile: {
            display_name: p.profiles?.display_name || "User",
            handle: p.profiles?.handle || "user",
            avatar_url: p.profiles?.avatar_url || null,
          },
          liked: myLikeSet.has(p.id),
          likeCount,
          replyCount,
          score: computeScore({ likeCount, replyCount, view_count: p.view_count || 0, created_at: p.created_at, hasLikedAuthorBefore, hasImages }) + (Math.random() * randomSeed),
        };
      });

      items.sort((a, b) => b.score - a.score);

      if (isRefresh) {
        setPosts(items);
      } else {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = items.filter((i) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      }
    }
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);
  }, [user]);

  const loadPosts = useCallback(() => fetchPosts(0, true), [fetchPosts]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPosts(posts.length, false);
  }, [fetchPosts, posts.length, loadingMore, hasMore]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  async function toggleLike(postId: string) {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    if (post.liked) {
      const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      if (!error) {
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p)
        );
      }
    } else {
      const { error } = await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
      if (!error) {
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p)
        );
      }
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>Discover</Text>
        <TouchableOpacity
          onPress={() => router.push("/moments/create")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add-circle-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PostCard item={item} onToggleLike={toggleLike} />}
          contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); setHasMore(true); loadPosts(); }}
              tintColor={Colors.brand}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={Colors.brand} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="newspaper-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No posts yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Share what's on your mind
              </Text>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => router.push("/moments/create")}
              >
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
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  card: {
    marginHorizontal: 8,
    borderRadius: 16,
    overflow: "hidden",
    paddingTop: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center" },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardContent: { fontSize: 15, fontFamily: "Inter_400Regular", paddingHorizontal: 14, marginBottom: 10, lineHeight: 22 },
  images: { flexDirection: "row", flexWrap: "wrap", gap: 4, paddingHorizontal: 14, marginBottom: 2 },
  img: { borderRadius: 8 },
  cardFooter: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    gap: 20,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  viewCount: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: "auto" },
  viewText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  createBtn: { backgroundColor: Colors.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
