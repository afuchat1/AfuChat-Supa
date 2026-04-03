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
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { showAlert } from "@/lib/alert";
import Colors from "@/constants/colors";

const BRAND = "#00BCD4";
const GOLD = "#D4A853";

type Post = {
  id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  like_count: number;
  comment_count: number;
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

function PostGrid({ posts, colors, isDark }: { posts: Post[]; colors: any; isDark: boolean }) {
  if (posts.length === 0) {
    return (
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
    );
  }

  return (
    <View style={styles.postGrid}>
      {posts.map((p) => {
        const img = p.images?.[0] || p.image_url;
        return (
          <TouchableOpacity
            key={p.id}
            onPress={() => router.push({ pathname: "/post/[id]", params: { id: p.id } } as any)}
            style={[styles.postGridItem, { backgroundColor: isDark ? "#1a1a1e" : "#f0f0f5", borderColor: colors.border }]}
            activeOpacity={0.8}
          >
            {img ? (
              <Image source={{ uri: img }} style={styles.postGridImage} resizeMode="cover" />
            ) : (
              <View style={[styles.postGridText, { backgroundColor: isDark ? "#1a1a1e" : "#f5f5f8" }]}>
                <Text style={[styles.postGridContent, { color: colors.text }]} numberOfLines={6}>
                  {p.content}
                </Text>
              </View>
            )}
            <View style={[styles.postGridOverlay, { backgroundColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.25)" }]}>
              <View style={styles.postStat}>
                <Ionicons name="heart" size={12} color="#fff" />
                <Text style={styles.postStatText}>{p.like_count}</Text>
              </View>
              <View style={styles.postStat}>
                <Ionicons name="chatbubble" size={12} color="#fff" />
                <Text style={styles.postStatText}>{p.comment_count}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function DesktopProfileSection() {
  const { colors, isDark } = useTheme();
  const { user, profile, signOut } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [followStats, setFollowStats] = useState({ followers: 0, following: 0 });

  const loadData = useCallback(async () => {
    if (!user) return;
    const [postsRes, followersRes, followingRes] = await Promise.all([
      supabase.from("posts")
        .select("id, content, image_url, images, created_at, like_count, comment_count")
        .eq("author_id", user.id)
        .eq("is_blocked", false)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", user.id),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id),
    ]);
    setPosts((postsRes.data || []).map((p: any) => ({ ...p, images: p.images || [] })));
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
      <View style={[styles.postsPanel, { backgroundColor: isDark ? "#0f0f12" : "#f8f9fc" }]}>
        <View style={[styles.postsHeader, { borderBottomColor: colors.border }]}>
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
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.postsScroll}>
            <PostGrid posts={posts} colors={colors} isDark={isDark} />
          </ScrollView>
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
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
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
  postsScroll: { padding: 20, paddingBottom: 40 },
  postGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  postGridItem: {
    width: "31%" as any,
    minWidth: 140,
    flexGrow: 1,
    height: 180,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  postGridImage: { width: "100%" as any, height: "100%" as any },
  postGridText: { flex: 1, padding: 12 },
  postGridContent: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  postGridOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    padding: 8,
  },
  postStat: { flexDirection: "row", alignItems: "center", gap: 3 },
  postStatText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
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
