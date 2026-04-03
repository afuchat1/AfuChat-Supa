import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useDesktopDetail } from "@/context/DesktopDetailContext";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { RichText } from "@/components/ui/RichText";
import { DesktopRightPanel } from "@/components/DesktopRightPanel";
import { sharePost } from "@/lib/share";

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
  reply_count: number;
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
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function LoginPrompt({ visible, onClose, colors }: { visible: boolean; onClose: () => void; colors: any }) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={loginStyles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={[loginStyles.card, { backgroundColor: colors.card }]}>
          <Ionicons name="person-circle-outline" size={52} color={colors.accent} style={{ marginBottom: 10 }} />
          <Text style={[loginStyles.title, { color: colors.text }]}>Sign in to interact</Text>
          <Text style={[loginStyles.sub, { color: colors.textMuted }]}>
            Create an account or log in to like, comment and join the conversation.
          </Text>
          <TouchableOpacity
            style={[loginStyles.loginBtn, { backgroundColor: colors.accent }]}
            onPress={() => { onClose(); router.push("/(auth)/login" as any); }}
          >
            <Text style={loginStyles.loginBtnText}>Log in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[loginStyles.registerBtn, { borderColor: colors.accent }]}
            onPress={() => { onClose(); router.push("/(auth)/register" as any); }}
          >
            <Text style={[loginStyles.registerBtnText, { color: colors.accent }]}>Create account</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const loginStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: 340,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  loginBtn: {
    width: "100%" as any,
    paddingVertical: 13,
    borderRadius: 24,
    alignItems: "center",
    marginTop: 6,
  },
  loginBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  registerBtn: {
    width: "100%" as any,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
    borderWidth: 1.5,
  },
  registerBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

function PostCard({
  post,
  colors,
  onLike,
  onOpen,
  isLoggedIn,
  onAuthRequired,
  feedWidth,
}: {
  post: Post;
  colors: any;
  onLike: (id: string) => void;
  onOpen: (id: string) => void;
  isLoggedIn: boolean;
  onAuthRequired: () => void;
  feedWidth: number;
}) {
  const allImages = post.images?.length > 0 ? post.images : post.image_url ? [post.image_url] : [];
  const multiImgW = (feedWidth - 36) / 2;

  function handleLike() {
    if (!isLoggedIn) { onAuthRequired(); return; }
    onLike(post.id);
  }

  function handleComment() {
    if (!isLoggedIn) { onAuthRequired(); return; }
    onOpen(post.id);
  }

  return (
    <TouchableOpacity
      onPress={() => onOpen(post.id)}
      activeOpacity={0.97}
      style={[styles.card, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            if (!isLoggedIn) { onAuthRequired(); return; }
            post.author && router.push({ pathname: "/contact/[id]", params: { id: post.author.id } });
          }}
          activeOpacity={0.8}
        >
          <Avatar uri={post.author?.avatar_url || null} name={post.author?.display_name || "?"} size={40} />
        </TouchableOpacity>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
              {post.author?.display_name || "User"}
            </Text>
            {post.author?.is_verified && (
              <VerifiedBadge
                isVerified={post.author.is_verified}
                isOrganizationVerified={post.author.is_organization_verified}
                size={13}
              />
            )}
          </View>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
            @{post.author?.handle} · {timeAgo(post.created_at)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation?.(); if (!isLoggedIn) { onAuthRequired(); return; } }}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {(post.content || "").trim().length > 0 && (
        <RichText
          style={[styles.cardContent, { color: colors.text }]}
          linkColor={BRAND}
        >
          {post.content}
        </RichText>
      )}

      {/* Images */}
      {allImages.length > 0 && (
        <View style={[styles.images, allImages.length > 1 && { flexDirection: "row", flexWrap: "wrap", gap: 2 }]}>
          {allImages.map((uri, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.9}
              onPress={(e) => { e.stopPropagation?.(); onOpen(post.id); }}
              style={allImages.length > 1 ? { flex: 1 } : undefined}
            >
              <Image
                source={{ uri }}
                style={{
                  width: allImages.length === 1 ? feedWidth : multiImgW,
                  height: allImages.length === 1 ? Math.round(feedWidth * 0.56) : Math.round(multiImgW * 0.75),
                }}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={styles.action}
          onPress={(e) => { e.stopPropagation?.(); handleLike(); }}
        >
          <Ionicons
            name={post.liked_by_me ? "heart" : "heart-outline"}
            size={18}
            color={post.liked_by_me ? "#FF3B30" : colors.textMuted}
          />
          {post.like_count > 0 && (
            <Text style={[styles.actionText, { color: post.liked_by_me ? "#FF3B30" : colors.textMuted }]}>
              {post.like_count}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={(e) => { e.stopPropagation?.(); handleComment(); }}
        >
          <Ionicons name="chatbubble-outline" size={17} color={colors.textMuted} />
          {post.reply_count > 0 && (
            <Text style={[styles.actionText, { color: colors.textMuted }]}>{post.reply_count}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={(e) => {
            e.stopPropagation?.();
            if (!isLoggedIn) { onAuthRequired(); return; }
            sharePost({ postId: post.id, authorName: post.author?.display_name || "User", content: post.content });
          }}
        >
          <Ionicons name="arrow-redo-outline" size={17} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {post.view_count > 0 && (
          <View style={styles.viewCount}>
            <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.viewText, { color: colors.textMuted }]}>
              {post.view_count >= 1000 ? `${(post.view_count / 1000).toFixed(1)}k` : post.view_count}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function DesktopDiscoverSection() {
  const { colors, isDark } = useTheme();
  const { user, session } = useAuth();
  const { openDetail } = useDesktopDetail();
  const isLoggedIn = !!session;
  const { width: screenW } = useWindowDimensions();
  const feedRef = useRef<View>(null);
  const [feedWidth, setFeedWidth] = useState(600);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select(
          `id, author_id, content, image_url, created_at, view_count,
           profiles!posts_author_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified),
           post_images(image_url, display_order)`
        )
        .eq("is_blocked", false)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error || !data) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const postIds = data.map((p: any) => p.id);

      const [{ data: likeCounts }, { data: replyCounts }, { data: myLikes }] = await Promise.all([
        postIds.length > 0
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds)
          : { data: [] },
        postIds.length > 0
          ? supabase.from("post_replies").select("post_id").in("post_id", postIds)
          : { data: [] },
        postIds.length > 0 && user
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
      ]);

      const likeMap: Record<string, number> = {};
      for (const l of (likeCounts || [])) {
        likeMap[(l as any).post_id] = (likeMap[(l as any).post_id] || 0) + 1;
      }
      const replyMap: Record<string, number> = {};
      for (const r of (replyCounts || [])) {
        replyMap[(r as any).post_id] = (replyMap[(r as any).post_id] || 0) + 1;
      }
      const likedSet = new Set((myLikes || []).map((l: any) => l.post_id));

      setPosts(
        data.map((p: any) => ({
          id: p.id,
          author_id: p.author_id,
          content: p.content || "",
          image_url: p.image_url,
          images: (p.post_images || [])
            .sort((a: any, b: any) => a.display_order - b.display_order)
            .map((i: any) => i.image_url),
          created_at: p.created_at,
          view_count: p.view_count || 0,
          like_count: likeMap[p.id] || 0,
          reply_count: replyMap[p.id] || 0,
          author: p.profiles
            ? {
                id: p.profiles.id,
                display_name: p.profiles.display_name || "User",
                handle: p.profiles.handle || "user",
                avatar_url: p.profiles.avatar_url || null,
                is_verified: p.profiles.is_verified || false,
                is_organization_verified: p.profiles.is_organization_verified || false,
              }
            : null,
          liked_by_me: likedSet.has(p.id),
        }))
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  async function handleLike(postId: string) {
    if (!user) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (post.liked_by_me) {
      await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      setPosts((prev) =>
        prev.map((p) => p.id === postId ? { ...p, liked_by_me: false, like_count: Math.max(0, p.like_count - 1) } : p)
      );
    } else {
      await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
      setPosts((prev) =>
        prev.map((p) => p.id === postId ? { ...p, liked_by_me: true, like_count: p.like_count + 1 } : p)
      );
    }
  }

  function handleOpenPost(postId: string) {
    openDetail({ type: "post", id: postId });
  }

  return (
    <View style={styles.root}>
      <LoginPrompt
        visible={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        colors={colors}
      />

      {/* Main feed */}
      <View
        ref={feedRef}
        style={[styles.feedArea, { backgroundColor: colors.background }]}
        onLayout={(e) => setFeedWidth(e.nativeEvent.layout.width)}
      >
        {/* Header */}
        <View
          style={[
            styles.feedHeader,
            { borderBottomColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <Text style={[styles.feedTitle, { color: colors.text }]}>Discover</Text>
          {isLoggedIn ? (
            <TouchableOpacity
              onPress={() => router.push("/moments/create" as any)}
              style={[styles.createBtn, { backgroundColor: colors.accent }]}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.createBtnText}>Post</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => router.push("/(auth)/login" as any)}
              style={[styles.createBtn, { backgroundColor: colors.accent }]}
              activeOpacity={0.85}
            >
              <Text style={styles.createBtnText}>Sign in</Text>
            </TouchableOpacity>
          )}
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
                onLike={handleLike}
                onOpen={handleOpenPost}
                isLoggedIn={isLoggedIn}
                onAuthRequired={() => setShowLoginPrompt(true)}
                feedWidth={feedWidth}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.feedList}
            onRefresh={() => { setRefreshing(true); loadPosts(); }}
            refreshing={refreshing}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="newspaper-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No posts yet</Text>
                <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                  Be the first to share something
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* Right panel */}
      <View
        style={[
          styles.rightPanel,
          { backgroundColor: isDark ? "#0c0c0f" : "#f5f6f8", borderLeftColor: colors.border },
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
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  feedTitle: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  feedList: { flexGrow: 1 },

  card: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardName: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: -0.1 },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardContent: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 16,
    paddingBottom: 12,
    lineHeight: 23,
  },
  images: { marginBottom: 0 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 18,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  viewCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  rightPanel: {
    width: 320,
    flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },

  emptyState: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
