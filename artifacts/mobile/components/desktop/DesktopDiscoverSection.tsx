import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useDesktopDetail } from "@/context/DesktopDetailContext";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { DesktopRightPanel } from "@/components/DesktopRightPanel";
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

function PostCard({
  post,
  colors,
  isDark,
  onLike,
  onOpen,
}: {
  post: Post;
  colors: any;
  isDark: boolean;
  onLike: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps =
    Platform.OS === "web"
      ? {
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
        }
      : {};

  const images =
    post.images?.length > 0
      ? post.images
      : post.image_url
      ? [post.image_url]
      : [];

  return (
    <TouchableOpacity
      onPress={() => onOpen(post.id)}
      activeOpacity={0.92}
      style={[
        styles.postCard,
        {
          backgroundColor: isDark ? "#161619" : "#ffffff",
          borderColor: hovered ? colors.accent + "50" : colors.border,
        },
      ]}
      {...(hoverProps as any)}
    >
      {/* Author row */}
      <View style={styles.postHeader}>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            post.author &&
              router.push({
                pathname: "/contact/[id]",
                params: { id: post.author.id },
              });
          }}
          activeOpacity={0.8}
          style={styles.authorRow}
        >
          <Avatar
            uri={post.author?.avatar_url || null}
            name={post.author?.display_name || "?"}
            size={40}
          />
          <View style={{ flex: 1 }}>
            <View style={styles.authorNameRow}>
              <Text
                style={[styles.authorName, { color: colors.text }]}
                numberOfLines={1}
              >
                {post.author?.display_name || "Unknown"}
              </Text>
              {post.author?.is_verified && (
                <VerifiedBadge
                  isVerified={post.author.is_verified}
                  isOrganizationVerified={post.author.is_organization_verified}
                  size={14}
                />
              )}
            </View>
            <Text style={[styles.authorMeta, { color: colors.textMuted }]}>
              @{post.author?.handle} · {timeAgo(post.created_at)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {post.content ? (
        <Text style={[styles.postContent, { color: colors.text }]}>
          {post.content}
        </Text>
      ) : null}

      {/* Single image */}
      {images.length === 1 && (
        <Image
          source={{ uri: images[0] }}
          style={[styles.postImageSingle, { borderColor: colors.border }]}
          resizeMode="cover"
        />
      )}

      {/* Image grid */}
      {images.length > 1 && (
        <View style={styles.imageGrid}>
          {images.slice(0, 4).map((img, i) => (
            <Image
              key={i}
              source={{ uri: img }}
              style={styles.postImageGrid}
              resizeMode="cover"
            />
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={[styles.postActions, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            onLike(post.id);
          }}
          style={styles.actionBtn}
        >
          <Ionicons
            name={post.liked_by_me ? "heart" : "heart-outline"}
            size={18}
            color={post.liked_by_me ? "#FF3B30" : colors.textMuted}
          />
          {post.like_count > 0 && (
            <Text style={[styles.actionCount, { color: colors.textMuted }]}>
              {post.like_count}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onOpen(post.id)}
          style={styles.actionBtn}
        >
          <Ionicons
            name="chatbubble-outline"
            size={18}
            color={colors.textMuted}
          />
          {post.comment_count > 0 && (
            <Text style={[styles.actionCount, { color: colors.textMuted }]}>
              {post.comment_count}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons
            name="share-social-outline"
            size={18}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {post.view_count > 0 && (
          <View style={[styles.actionBtn, { marginLeft: "auto" as any }]}>
            <Ionicons name="eye-outline" size={15} color={colors.textMuted} />
            <Text style={[styles.actionCount, { color: colors.textMuted }]}>
              {post.view_count >= 1000
                ? `${(post.view_count / 1000).toFixed(1)}k`
                : post.view_count}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function DesktopDiscoverSection() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { openDetail } = useDesktopDetail();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPosts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("posts")
      .select(
        `id, author_id, content, image_url, images, created_at, view_count, like_count, comment_count,
        profiles!posts_author_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified)`
      )
      .eq("is_blocked", false)
      .in("visibility", ["public", "everyone"])
      .order("created_at", { ascending: false })
      .limit(30);

    if (!data) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const postIds = data.map((p: any) => p.id);
    const { data: likes } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", user.id)
      .in("post_id", postIds);

    const likedSet = new Set((likes || []).map((l: any) => l.post_id));

    setPosts(
      data.map((p: any) => ({
        ...p,
        images: p.images || [],
        author: p.profiles,
        liked_by_me: likedSet.has(p.id),
      }))
    );
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  async function handleLike(postId: string) {
    if (!user) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (post.liked_by_me) {
      await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked_by_me: false, like_count: p.like_count - 1 }
            : p
        )
      );
    } else {
      await supabase
        .from("post_likes")
        .insert({ post_id: postId, user_id: user.id });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked_by_me: true, like_count: p.like_count + 1 }
            : p
        )
      );
    }
  }

  function handleOpenPost(postId: string) {
    openDetail({ type: "post", id: postId });
  }

  return (
    <View style={styles.root}>
      {/* Main feed */}
      <View
        style={[
          styles.feedArea,
          { backgroundColor: isDark ? "#0f0f12" : "#f8f9fc" },
        ]}
      >
        {/* Create post button */}
        <View
          style={[
            styles.feedHeader,
            { borderBottomColor: colors.border, backgroundColor: isDark ? "#0f0f12" : "#f8f9fc" },
          ]}
        >
          <Text style={[styles.feedTitle, { color: colors.text }]}>Discover</Text>
          <TouchableOpacity
            onPress={() => router.push("/moments/create" as any)}
            style={[styles.createBtn, { backgroundColor: colors.accent }]}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.createBtnText}>Post</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centered}>
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
                onOpen={handleOpenPost}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.feedList}
            onRefresh={() => {
              setRefreshing(true);
              loadPosts();
            }}
            refreshing={refreshing}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons
                  name="newspaper-outline"
                  size={48}
                  color={colors.textMuted}
                />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No posts yet
                </Text>
                <Text
                  style={[styles.emptySubtext, { color: colors.textMuted }]}
                >
                  Follow people to see their posts here
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* Right panel — shows post detail or trending/who-to-follow */}
      <View
        style={[
          styles.rightPanel,
          {
            backgroundColor: isDark ? "#0c0c0f" : "#f5f6f8",
            borderLeftColor: colors.border,
          },
        ]}
      >
        <DesktopRightPanel activeTab="discover" colors={colors} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", overflow: "hidden" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  feedArea: { flex: 1, overflow: "hidden", flexDirection: "column" },
  feedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  feedTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  feedList: {
    maxWidth: 680,
    alignSelf: "center" as any,
    width: "100%" as any,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
  },

  postCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  authorRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authorNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  authorName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  authorMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  postContent: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 23,
  },
  postImageSingle: {
    width: "100%" as any,
    height: 300,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  postImageGrid: {
    width: "48.5%" as any,
    height: 160,
    borderRadius: 10,
    flexGrow: 1,
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  rightPanel: {
    width: 320,
    flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },

  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    gap: 10,
  },
  emptyText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
