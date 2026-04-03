import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
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
import { showAlert } from "@/lib/alert";
import { sharePost } from "@/lib/share";
import Colors from "@/constants/colors";

const BRAND = "#00BCD4";
const GOLD = "#D4A853";

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

type Post = {
  id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  like_count: number;
  reply_count: number;
  liked_by_me: boolean;
};

type NavLink = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  color?: string;
};

function StatBadge({ value, label, colors }: { value: number | string; label: string; colors: any }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function ProfilePostCard({
  post,
  colors,
  onOpen,
  onLike,
  panelWidth,
  profile,
}: {
  post: Post;
  colors: any;
  onOpen: (id: string) => void;
  onLike: (id: string) => void;
  panelWidth: number;
  profile: any;
}) {
  const allImages = post.images?.length > 0 ? post.images : post.image_url ? [post.image_url] : [];
  const multiImgW = (panelWidth - 36) / 2;

  return (
    <TouchableOpacity
      onPress={() => onOpen(post.id)}
      activeOpacity={0.97}
      style={[styles.card, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <Avatar uri={profile?.avatar_url || null} name={profile?.display_name || "Me"} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
              {profile?.display_name || "Me"}
            </Text>
            {profile?.is_verified && (
              <VerifiedBadge
                isVerified={!!profile.is_verified}
                isOrganizationVerified={!!profile.is_organization_verified}
                size={13}
              />
            )}
          </View>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
            @{profile?.handle || "me"} · {timeAgo(post.created_at)}
          </Text>
        </View>
        <TouchableOpacity hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {(post.content || "").trim().length > 0 && (
        <RichText style={[styles.cardContent, { color: colors.text }]} linkColor={BRAND}>
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
                  width: allImages.length === 1 ? panelWidth : multiImgW,
                  height: allImages.length === 1 ? Math.round(panelWidth * 0.56) : Math.round(multiImgW * 0.75),
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
          onPress={(e) => { e.stopPropagation?.(); onLike(post.id); }}
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

        <TouchableOpacity style={styles.action} onPress={(e) => { e.stopPropagation?.(); onOpen(post.id); }}>
          <Ionicons name="chatbubble-outline" size={17} color={colors.textMuted} />
          {post.reply_count > 0 && (
            <Text style={[styles.actionText, { color: colors.textMuted }]}>{post.reply_count}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={(e) => {
            e.stopPropagation?.();
            sharePost({ postId: post.id, authorName: profile?.display_name || "User", content: post.content });
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

export function DesktopProfileSection() {
  const { colors, isDark } = useTheme();
  const { user, profile, signOut } = useAuth();
  const { openDetail } = useDesktopDetail();
  const [panelWidth, setPanelWidth] = useState(500);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [followStats, setFollowStats] = useState({ followers: 0, following: 0 });

  const loadData = useCallback(async () => {
    if (!user) return;
    const [postsRes, followersRes, followingRes] = await Promise.all([
      supabase.from("posts")
        .select("id, content, image_url, created_at, view_count, post_images(image_url, display_order)")
        .eq("author_id", user.id)
        .eq("is_blocked", false)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", user.id),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id),
    ]);

    const rawPosts = postsRes.data || [];
    const postIds = rawPosts.map((p: any) => p.id);

    const [{ data: likeCounts }, { data: replyCounts }, { data: myLikes }] = await Promise.all([
      postIds.length > 0
        ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds)
        : { data: [] },
      postIds.length > 0
        ? supabase.from("post_replies").select("post_id").in("post_id", postIds)
        : { data: [] },
      postIds.length > 0
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
      rawPosts.map((p: any) => ({
        id: p.id,
        content: p.content || "",
        image_url: p.image_url,
        images: (p.post_images || [])
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .map((i: any) => i.image_url),
        created_at: p.created_at,
        view_count: p.view_count || 0,
        like_count: likeMap[p.id] || 0,
        reply_count: replyMap[p.id] || 0,
        liked_by_me: likedSet.has(p.id),
      }))
    );
    setFollowStats({ followers: followersRes.count || 0, following: followingRes.count || 0 });
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSignOut() {
    showAlert("Sign out?", "You'll need to log back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  async function handleLike(postId: string) {
    if (!user) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (post.liked_by_me) {
      await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked_by_me: false, like_count: Math.max(0, p.like_count - 1) } : p));
    } else {
      await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked_by_me: true, like_count: p.like_count + 1 } : p));
    }
  }

  const navLinks: NavLink[] = [
    { icon: "create-outline",      label: "Edit Profile",      onPress: () => router.push("/profile/edit" as any) },
    { icon: "newspaper-outline",   label: "My Posts",          onPress: () => router.push("/my-posts" as any) },
    { icon: "bookmark-outline",    label: "Saved Posts",       onPress: () => router.push("/saved-posts" as any) },
    { icon: "trophy-outline",      label: "Prestige & ACoin",  onPress: () => router.push("/prestige" as any) },
    { icon: "star-outline",        label: "Premium",           onPress: () => router.push("/premium" as any) },
    { icon: "people-outline",      label: "Followers",         onPress: () => router.push("/followers" as any) },
    { icon: "wallet-outline",      label: "Wallet",            onPress: () => router.push("/wallet" as any) },
    { icon: "storefront-outline",  label: "My Shop",           onPress: () => router.push("/shop/manage" as any) },
    { icon: "settings-outline",    label: "Settings",          onPress: () => router.push("/settings" as any) },
    { icon: "shield-outline",      label: "Privacy",           onPress: () => router.push("/settings/privacy" as any) },
    { icon: "log-out-outline",     label: "Sign Out",          onPress: handleSignOut, color: "#FF4444" },
  ];

  return (
    <View style={styles.root}>
      {/* Left panel: profile info + nav */}
      <View style={[styles.profilePanel, { backgroundColor: isDark ? "#0c0c0f" : "#f5f6f8", borderRightColor: colors.border }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.profilePanelContent}>
          {/* Avatar + name */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrap}>
              <Avatar uri={profile?.avatar_url || null} name={profile?.display_name || "Me"} size={80} />
              <TouchableOpacity
                style={[styles.editAvatarBtn, { backgroundColor: colors.accent }]}
                onPress={() => router.push("/profile/edit" as any)}
              >
                <Ionicons name="camera-outline" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.nameSection}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
                  {profile?.display_name || "Display Name"}
                </Text>
                {profile?.is_verified && (
                  <VerifiedBadge
                    isVerified={!!profile.is_verified}
                    isOrganizationVerified={!!profile.is_organization_verified}
                    size={16}
                  />
                )}
              </View>
              <Text style={[styles.handle, { color: colors.textMuted }]}>@{profile?.handle || "handle"}</Text>
            </View>
          </View>

          {/* Bio */}
          {profile?.bio && (
            <Text style={[styles.bio, { color: colors.textMuted }]} numberOfLines={4}>
              {profile.bio}
            </Text>
          )}

          {/* Stats */}
          <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <StatBadge value={posts.length} label="Posts" colors={colors} />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <StatBadge value={followStats.followers.toLocaleString()} label="Followers" colors={colors} />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <StatBadge value={followStats.following.toLocaleString()} label="Following" colors={colors} />
          </View>

          {/* ACoin badge */}
          {profile?.acoin != null && (
            <View style={[styles.acoinBadge, { backgroundColor: GOLD + "15", borderColor: GOLD + "30" }]}>
              <Text style={{ fontSize: 18 }}>🪙</Text>
              <Text style={[styles.acoinText, { color: GOLD }]}>
                {(profile.acoin || 0).toLocaleString()} ACoin
              </Text>
            </View>
          )}

          {/* Nav links */}
          <View style={[styles.navCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {navLinks.map((link, i) => (
              <TouchableOpacity
                key={link.label}
                onPress={link.onPress}
                style={[
                  styles.navLink,
                  i < navLinks.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
                activeOpacity={0.75}
              >
                <Ionicons name={link.icon} size={18} color={link.color || colors.accent} />
                <Text style={[styles.navLinkLabel, { color: link.color || colors.text }]}>{link.label}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Right panel: posts */}
      <View
        style={[styles.postsPanel, { backgroundColor: colors.background }]}
        onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
      >
        <View style={[styles.postsHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.postsHeaderTitle, { color: colors.text }]}>My Posts</Text>
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.accent }]}
            onPress={() => router.push("/moments/create" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.createBtnText}>Create</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <ProfilePostCard
                post={item}
                colors={colors}
                onOpen={(id) => openDetail({ type: "post", id })}
                onLike={handleLike}
                panelWidth={panelWidth}
                profile={profile}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.feedList}
            ListEmptyComponent={
              <View style={styles.emptyPosts}>
                <Ionicons name="images-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyPostsText, { color: colors.textMuted }]}>No posts yet</Text>
                <TouchableOpacity
                  style={[styles.createPostBtn, { backgroundColor: colors.accent }]}
                  onPress={() => router.push("/moments/create" as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.createPostBtnText}>Create Post</Text>
                </TouchableOpacity>
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
  profilePanel: {
    width: 300,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  profilePanelContent: { padding: 16, gap: 14, paddingBottom: 32 },
  avatarSection: { alignItems: "center", gap: 10, paddingVertical: 8 },
  avatarWrap: { position: "relative" },
  editAvatarBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  nameSection: { alignItems: "center", gap: 3 },
  displayName: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  bio: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, textAlign: "center" },
  statsRow: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 17, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  acoinBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  acoinText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  navCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  navLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  navLinkLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  postsPanel: { flex: 1, overflow: "hidden" },
  postsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  postsHeaderTitle: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
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

  emptyPosts: { alignItems: "center", paddingTop: 60, gap: 14 },
  emptyPostsText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  createPostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 24,
  },
  createPostBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
