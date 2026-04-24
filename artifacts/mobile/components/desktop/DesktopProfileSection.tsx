import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useDesktopDetail } from "@/context/DesktopDetailContext";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { RichText } from "@/components/ui/RichText";
import { showAlert } from "@/lib/alert";
import { sharePost } from "@/lib/share";
import {
  DesktopBadge,
  DesktopButton,
  DesktopEmptyState,
  DesktopLoadingState,
  DesktopPanel,
  DesktopSectionShell,
  useDesktopTheme,
  useHover,
} from "./ui";

const BRAND = "#00BCD4";

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
  danger?: boolean;
};

function StatBadge({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  const t = useDesktopTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Text
        style={{
          fontSize: 17,
          fontFamily: "Inter_700Bold",
          color: t.text,
          letterSpacing: -0.2,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 11.5,
          fontFamily: "Inter_500Medium",
          color: t.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function NavLinkRow({ link, isLast }: { link: NavLink; isLast?: boolean }) {
  const t = useDesktopTheme();
  const [hovered, hp] = useHover();
  return (
    <TouchableOpacity
      onPress={link.onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 11,
        backgroundColor: hovered ? t.rowHover : "transparent",
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: t.border,
      }}
      {...(hp as any)}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: link.danger ? t.danger + "14" : t.accent + "14",
        }}
      >
        <Ionicons
          name={link.icon}
          size={15}
          color={link.danger ? t.danger : t.accent}
        />
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 13.5,
          fontFamily: "Inter_500Medium",
          color: link.danger ? t.danger : t.text,
        }}
      >
        {link.label}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={t.textMuted} />
    </TouchableOpacity>
  );
}

function ProfilePostCard({
  post,
  onOpen,
  onLike,
  panelWidth,
  profile,
}: {
  post: Post;
  onOpen: (id: string) => void;
  onLike: (id: string) => void;
  panelWidth: number;
  profile: any;
}) {
  const t = useDesktopTheme();
  const [hovered, hp] = useHover();
  const allImages =
    post.images?.length > 0
      ? post.images
      : post.image_url
        ? [post.image_url]
        : [];
  const innerW = Math.max(360, panelWidth - 36);
  const multiImgW = (innerW - 6) / 2;

  return (
    <TouchableOpacity
      onPress={() => onOpen(post.id)}
      activeOpacity={0.97}
      style={{
        backgroundColor: hovered ? t.rowHover : "transparent",
        borderBottomColor: t.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
        overflow: "hidden",
      }}
      {...(hp as any)}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <Avatar
          uri={profile?.avatar_url || null}
          name={profile?.display_name || "Me"}
          size={40}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.cardName, { color: t.text }]}
              numberOfLines={1}
            >
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
          <Text
            style={[styles.cardMeta, { color: t.textMuted }]}
            numberOfLines={1}
          >
            @{profile?.handle || "me"} · {timeAgo(post.created_at)}
          </Text>
        </View>
        <TouchableOpacity hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={t.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {(post.content || "").trim().length > 0 && (
        <RichText
          style={[styles.cardContent, { color: t.text }]}
          linkColor={t.accent}
        >
          {post.content}
        </RichText>
      )}

      {/* Images */}
      {allImages.length > 0 && (
        <View
          style={[
            styles.images,
            allImages.length > 1 && {
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              paddingHorizontal: 18,
              paddingBottom: 12,
            },
            allImages.length === 1 && { paddingBottom: 12 },
          ]}
        >
          {allImages.map((uri, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.9}
              onPress={(e) => {
                e.stopPropagation?.();
                onOpen(post.id);
              }}
            >
              <Image
                source={{ uri }}
                style={{
                  width: allImages.length === 1 ? innerW : multiImgW,
                  height:
                    allImages.length === 1
                      ? Math.round(innerW * 0.56)
                      : Math.round(multiImgW * 0.75),
                  borderRadius: 10,
                  marginLeft: allImages.length === 1 ? 18 : 0,
                  backgroundColor: t.chipBg,
                }}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={[styles.cardFooter, { borderTopColor: t.border }]}>
        <TouchableOpacity
          style={styles.action}
          onPress={(e) => {
            e.stopPropagation?.();
            onLike(post.id);
          }}
        >
          <Ionicons
            name={post.liked_by_me ? "heart" : "heart-outline"}
            size={18}
            color={post.liked_by_me ? "#FF3B30" : t.textMuted}
          />
          {post.like_count > 0 && (
            <Text
              style={[
                styles.actionText,
                { color: post.liked_by_me ? "#FF3B30" : t.textMuted },
              ]}
            >
              {post.like_count}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={(e) => {
            e.stopPropagation?.();
            onOpen(post.id);
          }}
        >
          <Ionicons name="chatbubble-outline" size={17} color={t.textMuted} />
          {post.reply_count > 0 && (
            <Text style={[styles.actionText, { color: t.textMuted }]}>
              {post.reply_count}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.action}
          onPress={(e) => {
            e.stopPropagation?.();
            sharePost({
              postId: post.id,
              authorName: profile?.display_name || "User",
              content: post.content,
            });
          }}
        >
          <Ionicons name="arrow-redo-outline" size={17} color={t.textMuted} />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {post.view_count > 0 && (
          <View style={styles.viewCount}>
            <Ionicons name="eye-outline" size={14} color={t.textMuted} />
            <Text style={[styles.viewText, { color: t.textMuted }]}>
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

export function DesktopProfileSection() {
  const t = useDesktopTheme();
  const { user, profile, signOut } = useAuth();
  const { openDetail } = useDesktopDetail();
  const [panelWidth, setPanelWidth] = useState(560);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [followStats, setFollowStats] = useState({
    followers: 0,
    following: 0,
  });

  const loadData = useCallback(async () => {
    if (!user) return;
    const [postsRes, followersRes, followingRes] = await Promise.all([
      supabase
        .from("posts")
        .select(
          "id, content, image_url, created_at, view_count, post_images(image_url, display_order)",
        )
        .eq("author_id", user.id)
        .eq("is_blocked", false)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_id", user.id),
      supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_id", user.id),
    ]);

    const rawPosts = postsRes.data || [];
    const postIds = rawPosts.map((p: any) => p.id);

    const [{ data: likeCounts }, { data: replyCounts }, { data: myLikes }] =
      await Promise.all([
        postIds.length > 0
          ? supabase
              .from("post_acknowledgments")
              .select("post_id")
              .in("post_id", postIds)
          : { data: [] },
        postIds.length > 0
          ? supabase
              .from("post_replies")
              .select("post_id")
              .in("post_id", postIds)
          : { data: [] },
        postIds.length > 0
          ? supabase
              .from("post_acknowledgments")
              .select("post_id")
              .in("post_id", postIds)
              .eq("user_id", user.id)
          : { data: [] },
      ]);

    const likeMap: Record<string, number> = {};
    for (const l of likeCounts || []) {
      likeMap[(l as any).post_id] = (likeMap[(l as any).post_id] || 0) + 1;
    }
    const replyMap: Record<string, number> = {};
    for (const r of replyCounts || []) {
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
      })),
    );
    setFollowStats({
      followers: followersRes.count || 0,
      following: followingRes.count || 0,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      await supabase
        .from("post_acknowledgments")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                liked_by_me: false,
                like_count: Math.max(0, p.like_count - 1),
              }
            : p,
        ),
      );
    } else {
      await supabase
        .from("post_acknowledgments")
        .insert({ post_id: postId, user_id: user.id });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked_by_me: true, like_count: p.like_count + 1 }
            : p,
        ),
      );
    }
  }

  if (!user) {
    return (
      <DesktopSectionShell>
        <DesktopPanel flex={1}>
          <DesktopEmptyState
            icon="person-circle-outline"
            title="Profile"
            subtitle="Sign in to view your profile."
            action={{
              label: "Sign In",
              onPress: () => router.push("/(auth)/login" as any),
            }}
          />
        </DesktopPanel>
      </DesktopSectionShell>
    );
  }

  const navLinks: NavLink[] = [
    {
      icon: "create-outline",
      label: "Edit Profile",
      onPress: () => router.push("/profile/edit" as any),
    },
    {
      icon: "newspaper-outline",
      label: "My Posts",
      onPress: () => router.push("/my-posts" as any),
    },
    {
      icon: "bookmark-outline",
      label: "Saved Posts",
      onPress: () => router.push("/saved-posts" as any),
    },
    {
      icon: "trophy-outline",
      label: "Prestige & ACoin",
      onPress: () => router.push("/prestige" as any),
    },
    {
      icon: "star-outline",
      label: "Premium",
      onPress: () => router.push("/premium" as any),
    },
    {
      icon: "people-outline",
      label: "Followers",
      onPress: () => router.push("/followers" as any),
    },
    {
      icon: "wallet-outline",
      label: "Wallet",
      onPress: () => router.push("/wallet" as any),
    },
    {
      icon: "storefront-outline",
      label: "My Shop",
      onPress: () => router.push("/shop/manage" as any),
    },
    {
      icon: "settings-outline",
      label: "Settings",
      onPress: () => router.push("/settings" as any),
    },
    {
      icon: "shield-outline",
      label: "Privacy",
      onPress: () => router.push("/settings/privacy" as any),
    },
    {
      icon: "log-out-outline",
      label: "Sign Out",
      onPress: handleSignOut,
      danger: true,
    },
  ];

  return (
    <DesktopSectionShell>
      <View style={{ flex: 1, flexDirection: "row", gap: 14 }}>
        {/* Left: profile rail */}
        <DesktopPanel style={{ width: 320 }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
          >
            {/* Avatar */}
            <View style={{ alignItems: "center", gap: 10, paddingTop: 6 }}>
              <View style={{ position: "relative" }}>
                <Avatar
                  uri={profile?.avatar_url || null}
                  name={profile?.display_name || "Me"}
                  size={88}
                />
                <TouchableOpacity
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: t.accent,
                    borderWidth: 2,
                    borderColor: t.panelBg,
                  }}
                  onPress={() => router.push("/profile/edit" as any)}
                >
                  <Ionicons name="camera-outline" size={13} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={{ alignItems: "center", gap: 3 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      fontFamily: "Inter_700Bold",
                      letterSpacing: -0.3,
                      color: t.text,
                    }}
                    numberOfLines={1}
                  >
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
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: "Inter_400Regular",
                    color: t.textMuted,
                  }}
                >
                  @{profile?.handle || "handle"}
                </Text>
              </View>
            </View>

            {/* Bio */}
            {profile?.bio ? (
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Inter_400Regular",
                  lineHeight: 19,
                  color: t.textMuted,
                  textAlign: "center",
                }}
                numberOfLines={4}
              >
                {profile.bio}
              </Text>
            ) : null}

            {/* Stats */}
            <View
              style={{
                flexDirection: "row",
                borderRadius: 12,
                paddingVertical: 14,
                paddingHorizontal: 6,
                backgroundColor: t.panelBgRaised,
                borderColor: t.border,
                borderWidth: StyleSheet.hairlineWidth,
              }}
            >
              <StatBadge value={posts.length} label="Posts" />
              <View
                style={{
                  width: StyleSheet.hairlineWidth,
                  marginVertical: 4,
                  backgroundColor: t.border,
                }}
              />
              <StatBadge
                value={followStats.followers.toLocaleString()}
                label="Followers"
              />
              <View
                style={{
                  width: StyleSheet.hairlineWidth,
                  marginVertical: 4,
                  backgroundColor: t.border,
                }}
              />
              <StatBadge
                value={followStats.following.toLocaleString()}
                label="Following"
              />
            </View>

            {/* ACoin */}
            {profile?.acoin != null && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 11,
                  borderRadius: 12,
                  backgroundColor: t.gold + "15",
                  borderColor: t.gold + "35",
                  borderWidth: 1,
                }}
              >
                <Text style={{ fontSize: 18 }}>🪙</Text>
                <Text
                  style={{
                    fontSize: 14.5,
                    fontFamily: "Inter_700Bold",
                    color: t.gold,
                    letterSpacing: -0.1,
                  }}
                >
                  {(profile.acoin || 0).toLocaleString()} ACoin
                </Text>
              </View>
            )}

            {/* Nav */}
            <View
              style={{
                borderRadius: 12,
                backgroundColor: t.panelBgRaised,
                borderColor: t.border,
                borderWidth: StyleSheet.hairlineWidth,
                overflow: "hidden",
              }}
            >
              {navLinks.map((link, i) => (
                <NavLinkRow
                  key={link.label}
                  link={link}
                  isLast={i === navLinks.length - 1}
                />
              ))}
            </View>
          </ScrollView>
        </DesktopPanel>

        {/* Right: posts */}
        <DesktopPanel flex={1}>
          <View
            onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
            style={{ flex: 1 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 22,
                paddingTop: 16,
                paddingBottom: 12,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: t.border,
                backgroundColor: t.panelHeaderBg,
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 17,
                    fontFamily: "Inter_700Bold",
                    color: t.text,
                    letterSpacing: -0.2,
                  }}
                >
                  My Posts
                </Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontFamily: "Inter_400Regular",
                    color: t.textMuted,
                    marginTop: 2,
                  }}
                >
                  {posts.length} post{posts.length === 1 ? "" : "s"}
                </Text>
              </View>
              <DesktopButton
                label="Create"
                icon="add"
                onPress={() => router.push("/moments/create" as any)}
              />
            </View>

            {loading ? (
              <DesktopLoadingState />
            ) : posts.length === 0 ? (
              <DesktopEmptyState
                icon="images-outline"
                title="No posts yet"
                subtitle="Share your first moment with the world."
                action={{
                  label: "Create Post",
                  icon: "add",
                  onPress: () => router.push("/moments/create" as any),
                }}
              />
            ) : (
              <FlatList
                data={posts}
                keyExtractor={(p) => p.id}
                renderItem={({ item }) => (
                  <ProfilePostCard
                    post={item}
                    onOpen={(id) => openDetail({ type: "post", id })}
                    onLike={handleLike}
                    panelWidth={panelWidth}
                    profile={profile}
                  />
                )}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
              />
            )}
          </View>
        </DesktopPanel>
      </View>
    </DesktopSectionShell>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.1,
  },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardContent: {
    fontSize: 14.5,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 18,
    paddingBottom: 12,
    lineHeight: 22,
  },
  images: {},
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 18,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  viewCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewText: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
