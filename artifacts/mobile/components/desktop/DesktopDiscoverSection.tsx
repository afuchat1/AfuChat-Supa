import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import Colors from "@/constants/colors";

const BRAND = "#00BCD4";

type Post = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  author: {
    id: string;
    display_name: string;
    handle: string;
    avatar_url: string | null;
    is_verified: boolean;
    is_organization_verified: boolean;
  } | null;
  liked_by_me: boolean;
};

type SuggestedUser = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified: boolean;
};

type TrendingTopic = { tag: string; count: number };

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function PostCard({ post, colors, isDark, onLike }: { post: Post; colors: any; isDark: boolean; onLike: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const hoverProps = Platform.OS === "web" ? {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  } : {};

  const images = post.images?.length > 0 ? post.images : (post.image_url ? [post.image_url] : []);

  return (
    <View
      style={[
        styles.postCard,
        { backgroundColor: isDark ? "#161619" : "#ffffff", borderColor: colors.border },
        hovered && { borderColor: colors.accent + "40" },
      ]}
      {...(hoverProps as any)}
    >
      {/* Author row */}
      <View style={styles.postAuthor}>
        <TouchableOpacity
          onPress={() => post.author && router.push({ pathname: "/contact/[id]", params: { id: post.author.id } })}
          activeOpacity={0.8}
          style={styles.authorLeft}
        >
          <Avatar uri={post.author?.avatar_url || null} name={post.author?.display_name || "?"} size={38} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>
                {post.author?.display_name || "Unknown"}
              </Text>
              {post.author?.is_verified && (
                <VerifiedBadge
                  isVerified={post.author.is_verified}
                  isOrganizationVerified={post.author.is_organization_verified}
                  size={13}
                />
              )}
            </View>
            <Text style={[styles.authorHandle, { color: colors.textMuted }]}>
              @{post.author?.handle} · {timeAgo(post.created_at)}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } } as any)}
          hitSlop={8}
        >
          <Ionicons name="arrow-forward-circle-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {post.content ? (
        <Text style={[styles.postContent, { color: colors.text }]} numberOfLines={8}>
          {post.content}
        </Text>
      ) : null}

      {/* Images */}
      {images.length === 1 && (
        <Image
          source={{ uri: images[0] }}
          style={[styles.postImageSingle, { borderColor: colors.border }]}
          resizeMode="cover"
        />
      )}
      {images.length > 1 && (
        <View style={styles.imageGrid}>
          {images.slice(0, 4).map((img, i) => (
            <Image key={i} source={{ uri: img }} style={styles.postImageGrid} resizeMode="cover" />
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={[styles.postActions, { borderTopColor: colors.border }]}>
        <TouchableOpacity onPress={() => onLike(post.id)} style={styles.actionBtn}>
          <Ionicons
            name={post.liked_by_me ? "heart" : "heart-outline"}
            size={17}
            color={post.liked_by_me ? "#FF3B30" : colors.textMuted}
          />
          <Text style={[styles.actionCount, { color: colors.textMuted }]}>
            {post.like_count > 0 ? post.like_count : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } } as any)}
          style={styles.actionBtn}
        >
          <Ionicons name="chatbubble-outline" size={17} color={colors.textMuted} />
          <Text style={[styles.actionCount, { color: colors.textMuted }]}>
            {post.comment_count > 0 ? post.comment_count : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="share-social-outline" size={17} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="bookmark-outline" size={17} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SidebarCard({ title, children, colors }: { title: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={[styles.sideCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sideCardTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

export function DesktopDiscoverSection() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [trending, setTrending] = useState<TrendingTopic[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  const loadPosts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("posts")
      .select(`id, author_id, content, image_url, images, created_at, view_count, like_count, comment_count,
        profiles!posts_author_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified)`)
      .eq("is_blocked", false)
      .in("visibility", ["public", "everyone"])
      .order("created_at", { ascending: false })
      .limit(30);

    if (!data) { setLoading(false); setRefreshing(false); return; }

    const postIds = data.map((p: any) => p.id);
    const { data: likes } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", user.id)
      .in("post_id", postIds);

    const likedSet = new Set((likes || []).map((l: any) => l.post_id));

    setPosts(data.map((p: any) => ({
      ...p,
      images: p.images || [],
      author: p.profiles,
      liked_by_me: likedSet.has(p.id),
    })));
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  const loadSidebar = useCallback(async () => {
    if (!user) return;
    const [usersRes, postsRes, followsRes] = await Promise.all([
      supabase.from("profiles")
        .select("id, display_name, handle, avatar_url, is_verified")
        .neq("id", user.id)
        .order("follower_count", { ascending: false })
        .limit(5),
      supabase.from("posts").select("content").eq("is_blocked", false).order("view_count", { ascending: false }).limit(150),
      supabase.from("follows").select("following_id").eq("follower_id", user.id),
    ]);

    setSuggestedUsers(usersRes.data || []);
    setFollowingIds(new Set((followsRes.data || []).map((f: any) => f.following_id)));

    const tagMap: Record<string, number> = {};
    const re = /#(\w+)/g;
    for (const row of postsRes.data || []) {
      let m; re.lastIndex = 0;
      while ((m = re.exec(row.content || "")) !== null) {
        const t = m[1].toLowerCase();
        tagMap[t] = (tagMap[t] || 0) + 1;
      }
    }
    setTrending(
      Object.entries(tagMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([tag, count]) => ({ tag, count }))
    );
  }, [user]);

  useEffect(() => { loadPosts(); loadSidebar(); }, [loadPosts, loadSidebar]);

  async function handleLike(postId: string) {
    if (!user) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (post.liked_by_me) {
      await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked_by_me: false, like_count: p.like_count - 1 } : p));
    } else {
      await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked_by_me: true, like_count: p.like_count + 1 } : p));
    }
  }

  async function handleFollow(userId: string) {
    if (!user) return;
    if (followingIds.has(userId)) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", userId);
      setFollowingIds((prev) => { const s = new Set(prev); s.delete(userId); return s; });
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: userId });
      setFollowingIds((prev) => new Set([...prev, userId]));
    }
  }

  return (
    <View style={styles.root}>
      {/* Left sidebar */}
      <View style={[styles.sidebar, { backgroundColor: isDark ? "#0c0c0f" : "#f5f6f8", borderRightColor: colors.border }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, gap: 14 }}>
          {/* Create post */}
          <TouchableOpacity
            style={[styles.createPostBtn, { backgroundColor: colors.accent }]}
            onPress={() => router.push("/moments/create" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={17} color="#fff" />
            <Text style={styles.createPostBtnText}>Create Post</Text>
          </TouchableOpacity>

          {/* Trending */}
          {trending.length > 0 && (
            <SidebarCard title="Trending" colors={colors}>
              {trending.map((t) => (
                <View key={t.tag} style={[styles.trendRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.trendTag, { color: colors.text }]}>#{t.tag}</Text>
                  <Text style={[styles.trendCount, { color: colors.textMuted }]}>{t.count} posts</Text>
                </View>
              ))}
            </SidebarCard>
          )}

          {/* Who to follow */}
          {suggestedUsers.length > 0 && (
            <SidebarCard title="Who to Follow" colors={colors}>
              {suggestedUsers.map((u) => (
                <View key={u.id} style={styles.suggUser}>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: "/contact/[id]", params: { id: u.id } })}
                    style={styles.suggLeft}
                    activeOpacity={0.8}
                  >
                    <Avatar uri={u.avatar_url} name={u.display_name} size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Text style={[styles.suggName, { color: colors.text }]} numberOfLines={1}>
                          {u.display_name}
                        </Text>
                        {u.is_verified && (
                          <Ionicons name="checkmark-circle" size={12} color={BRAND} />
                        )}
                      </View>
                      <Text style={[styles.suggHandle, { color: colors.textMuted }]} numberOfLines={1}>
                        @{u.handle}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleFollow(u.id)}
                    style={[
                      styles.followBtn,
                      followingIds.has(u.id)
                        ? { backgroundColor: colors.surface, borderColor: colors.border }
                        : { backgroundColor: colors.accent },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.followBtnText,
                      { color: followingIds.has(u.id) ? colors.text : "#fff" }
                    ]}>
                      {followingIds.has(u.id) ? "Following" : "Follow"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </SidebarCard>
          )}

          <Text style={[styles.footer, { color: colors.textMuted }]}>
            © {new Date().getFullYear()} AfuChat · Entebbe, Uganda
          </Text>
        </ScrollView>
      </View>

      {/* Main feed */}
      <View style={[styles.feedArea, { backgroundColor: isDark ? "#0f0f12" : "#f8f9fc" }]}>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                colors={colors}
                isDark={isDark}
                onLike={handleLike}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.feedList}
            onRefresh={() => { setRefreshing(true); loadPosts(); }}
            refreshing={refreshing}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
                <Ionicons name="newspaper-outline" size={48} color={colors.textMuted} />
                <Text style={[{ fontSize: 16, fontFamily: "Inter_500Medium", color: colors.textMuted }]}>
                  No posts yet
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", overflow: "hidden" },
  sidebar: {
    width: 280,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  createPostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 24,
  },
  createPostBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  sideCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 0,
  },
  sideCardTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  trendRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trendTag: { fontSize: 13, fontFamily: "Inter_700Bold" },
  trendCount: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  suggUser: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  suggLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  suggName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  suggHandle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
    flexShrink: 0,
  },
  followBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  footer: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  feedArea: { flex: 1, overflow: "hidden" },
  feedList: { maxWidth: 680, alignSelf: "center", width: "100%" as any, paddingVertical: 16, paddingHorizontal: 20, gap: 12 },
  postCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  postAuthor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authorLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  authorHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  postContent: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  postImageSingle: {
    width: "100%" as any,
    height: 320,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  postImageGrid: {
    width: "48%" as any,
    height: 160,
    borderRadius: 8,
    flexGrow: 1,
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
