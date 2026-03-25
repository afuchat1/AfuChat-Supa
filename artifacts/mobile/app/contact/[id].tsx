import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { notifyNewFollow } from "@/lib/notifyUser";
import { shareProfile } from "@/lib/share";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { ProfileSkeleton, PostSkeleton } from "@/components/ui/Skeleton";

type Profile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  xp: number;
  current_grade: string;
  website_url: string | null;
  country: string | null;
  created_at: string | null;
  last_seen: string | null;
  show_online_status: boolean;
};

type UserPost = {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  view_count: number;
  likeCount: number;
  replyCount: number;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function formatJoinDate(iso: string | null): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function ContactProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user, profile: myProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [showBadgeInfo, setShowBadgeInfo] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, xp, current_grade, website_url, country, created_at, last_seen, show_online_status")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setProfile(data as Profile);
        setLoading(false);
      });

    supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", id).maybeSingle().then(({ data }) => setIsFollowing(!!data));
    supabase.from("blocked_users").select("id").eq("blocker_id", user.id).eq("blocked_id", id).maybeSingle().then(({ data }) => setIsBlocked(!!data));
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", id).then(({ count }) => setFollowerCount(count || 0));
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", id).then(({ count }) => setFollowingCount(count || 0));
  }, [id, user]);

  const loadPosts = useCallback(async () => {
    if (!id) return;
    setPostsLoading(true);
    const { data } = await supabase
      .from("posts")
      .select("id, content, image_url, created_at, view_count")
      .eq("author_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      const postIds = data.map((p: any) => p.id);
      const [likesRes, repliesRes] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
        supabase.from("post_replies").select("post_id").in("post_id", postIds),
      ]);
      const likeCounts: Record<string, number> = {};
      const replyCounts: Record<string, number> = {};
      (likesRes.data || []).forEach((l: any) => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });
      (repliesRes.data || []).forEach((r: any) => { replyCounts[r.post_id] = (replyCounts[r.post_id] || 0) + 1; });
      setPosts(data.map((p: any) => ({ ...p, likeCount: likeCounts[p.id] || 0, replyCount: replyCounts[p.id] || 0 })));
    } else {
      setPosts([]);
    }
    setPostsLoading(false);
  }, [id]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  async function startChat() {
    if (!user || !id) return;
    const { data: myChats } = await supabase.from("chat_members").select("chat_id").eq("user_id", user.id);
    const myIds = (myChats || []).map((m: any) => m.chat_id);
    if (myIds.length > 0) {
      const { data: shared } = await supabase
        .from("chat_members")
        .select("chat_id, chats!inner(id, is_group, is_channel)")
        .eq("user_id", id)
        .in("chat_id", myIds)
        .eq("chats.is_group", false);
      if (shared && shared.length > 0) {
        const directChat = shared.find((s: any) => !s.chats?.is_channel);
        if (directChat) {
          router.push({ pathname: "/chat/[id]", params: { id: directChat.chat_id } });
          return;
        }
      }
    }
    router.push({
      pathname: "/chat/[id]",
      params: {
        id: "new",
        contactId: id as string,
        contactName: profile?.display_name || "",
        contactAvatar: profile?.avatar_url || "",
      },
    });
  }

  async function toggleFollow() {
    if (!user || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", id);
      setIsFollowing(false);
      setFollowerCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: id });
      setIsFollowing(true);
      setFollowerCount((c) => c + 1);
      notifyNewFollow({
        targetUserId: id as string,
        followerName: myProfile?.display_name || "Someone",
        followerUserId: user.id,
      });
      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("follow_user"); } catch (_) {}
    }
  }

  async function toggleBlock() {
    if (!user || !id) return;
    if (isBlocked) {
      await supabase.from("blocked_users").delete().eq("blocker_id", user.id).eq("blocked_id", id);
      setIsBlocked(false);
    } else {
      showAlert("Block User", `Block ${profile?.display_name}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: async () => {
          await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: id });
          setIsBlocked(true);
          if (isFollowing) {
            await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", id);
            setIsFollowing(false);
          }
        }},
      ]);
    }
  }

  function reportUser() {
    if (!user || !id) return;
    showAlert("Report User", "Why are you reporting this user?", [
      { text: "Spam", onPress: () => submitReport("spam") },
      { text: "Harassment", onPress: () => submitReport("harassment") },
      { text: "Inappropriate Content", onPress: () => submitReport("inappropriate") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function submitReport(reason: string) {
    if (!user || !id) return;
    const { error } = await supabase.from("user_reports").insert({ reporter_id: user.id, reported_id: id, reason });
    if (error) showAlert("Error", "Could not submit report.");
    else showAlert("Reported", "Thank you for your report. We'll review it.");
  }

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ProfileSkeleton /></View>;
  }

  const isOwnProfile = user?.id === id;
  const seoTitle = profile ? `${profile.display_name} (@${profile.handle}) - AfuChat` : "Profile - AfuChat";
  const seoDesc = profile?.bio || `Check out ${profile?.display_name || "this user"}'s profile on AfuChat`;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          {profile?.handle ? (
            <TouchableOpacity onPress={() => shareProfile({ handle: profile.handle, displayName: profile.display_name, bio: profile.bio })}>
              <Ionicons name="share-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
          {!isOwnProfile && (
            <TouchableOpacity onPress={reportUser}>
              <Ionicons name="flag-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.profileHeader, { backgroundColor: colors.surface }]}>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={90} />

          <TouchableOpacity style={styles.nameRow} onPress={() => (profile?.is_verified || profile?.is_organization_verified) && setShowBadgeInfo(!showBadgeInfo)}>
            <Text style={[styles.displayName, { color: colors.text }]}>{profile?.display_name}</Text>
            <VerifiedBadge isVerified={profile?.is_verified} isOrganizationVerified={profile?.is_organization_verified} size={20} />
          </TouchableOpacity>

          <Text style={[styles.handle, { color: colors.textSecondary }]}>@{profile?.handle}</Text>

          {profile?.show_online_status && profile?.last_seen && (() => {
            const diff = Date.now() - new Date(profile.last_seen).getTime();
            const isOnline = diff < 2 * 60 * 1000;
            const lastSeenText = isOnline ? "Online" :
              diff < 3600000 ? `Last seen ${Math.floor(diff / 60000)}m ago` :
              diff < 86400000 ? `Last seen ${Math.floor(diff / 3600000)}h ago` :
              `Last seen ${new Date(profile.last_seen).toLocaleDateString()}`;
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOnline ? "#34C759" : colors.textMuted }} />
                <Text style={{ fontSize: 12, color: isOnline ? "#34C759" : colors.textMuted, fontFamily: "Inter_400Regular" }}>{lastSeenText}</Text>
              </View>
            );
          })()}

          {profile?.is_organization_verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#fff" />
              <Text style={styles.verifiedBadgeText}>Verified Business</Text>
            </View>
          )}
          {!profile?.is_organization_verified && profile?.is_verified && (
            <View style={[styles.verifiedBadge, { backgroundColor: Colors.brand }]}>
              <Ionicons name="checkmark-circle" size={14} color="#fff" />
              <Text style={styles.verifiedBadgeText}>Verified</Text>
            </View>
          )}

          {showBadgeInfo && profile?.is_organization_verified && (
            <View style={[styles.badgeInfoCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Text style={[styles.badgeInfoTitle, { color: colors.text }]}>Verification Details</Text>
              <View style={styles.badgeInfoRow}>
                <Ionicons name="shield-checkmark" size={14} color={Colors.gold} />
                <Text style={[styles.badgeInfoText, { color: colors.textSecondary }]}>Verified Business Account</Text>
              </View>
              <View style={styles.badgeInfoRow}>
                <Ionicons name="briefcase" size={14} color={Colors.gold} />
                <Text style={[styles.badgeInfoText, { color: colors.textSecondary }]}>Official Business Profile</Text>
              </View>
              <View style={styles.badgeInfoRow}>
                <Ionicons name="checkmark-done" size={14} color={Colors.gold} />
                <Text style={[styles.badgeInfoText, { color: colors.textSecondary }]}>Identity Confirmed by AfuChat</Text>
              </View>
            </View>
          )}
          {showBadgeInfo && !profile?.is_organization_verified && profile?.is_verified && (
            <View style={[styles.badgeInfoCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Text style={[styles.badgeInfoTitle, { color: colors.text }]}>Verification Details</Text>
              <View style={styles.badgeInfoRow}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.brand} />
                <Text style={[styles.badgeInfoText, { color: colors.textSecondary }]}>Verified Account</Text>
              </View>
              <View style={styles.badgeInfoRow}>
                <Ionicons name="diamond" size={14} color={Colors.brand} />
                <Text style={[styles.badgeInfoText, { color: colors.textSecondary }]}>Premium Subscription Verified</Text>
              </View>
            </View>
          )}

          {profile?.bio ? (
            <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text>
          ) : null}

          <View style={styles.detailsSection}>
            {profile?.country ? (
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={15} color={colors.textMuted} />
                <Text style={[styles.detailText, { color: colors.textSecondary }]}>{profile.country}</Text>
              </View>
            ) : null}
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>Joined {formatJoinDate(profile?.created_at || null)}</Text>
            </View>
            {profile?.website_url ? (
              <View style={styles.detailRow}>
                <Ionicons name="link-outline" size={15} color={colors.textMuted} />
                <Text style={[styles.detailText, { color: Colors.brand }]}>{profile.website_url}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.followStats}>
            <View style={styles.followStat}>
              <Text style={[styles.followNum, { color: colors.text }]}>{followerCount}</Text>
              <Text style={[styles.followLabel, { color: colors.textMuted }]}>Followers</Text>
            </View>
            <View style={[styles.followDivider, { backgroundColor: colors.border }]} />
            <View style={styles.followStat}>
              <Text style={[styles.followNum, { color: colors.text }]}>{followingCount}</Text>
              <Text style={[styles.followLabel, { color: colors.textMuted }]}>Following</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="flash" size={16} color="#FFD60A" />
              <Text style={[styles.infoValue, { color: colors.text }]}>{profile?.xp || 0} Nexa</Text>
            </View>
            <Text style={[styles.infoDot, { color: colors.textMuted }]}>{profile?.current_grade}</Text>
          </View>

          {!isOwnProfile && (
            <View style={styles.profileActions}>
              <TouchableOpacity style={[styles.followBtn, isFollowing && styles.followBtnActive]} onPress={toggleFollow}>
                <Ionicons name={isFollowing ? "checkmark" : "person-add-outline"} size={16} color={isFollowing ? Colors.brand : "#fff"} />
                <Text style={[styles.followBtnText, isFollowing && { color: Colors.brand }]}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.blockBtn, isBlocked && styles.blockBtnActive]} onPress={toggleBlock}>
                <Ionicons name={isBlocked ? "ban" : "ban-outline"} size={16} color={isBlocked ? "#fff" : "#FF3B30"} />
                <Text style={[styles.blockBtnText, isBlocked && { color: "#fff" }]}>
                  {isBlocked ? "Blocked" : "Block"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={[styles.actions, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={startChat}>
            <View style={[styles.actionIcon, { backgroundColor: Colors.brand }]}>
              <Ionicons name="chatbubble" size={22} color="#fff" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <View style={[styles.actionIcon, { backgroundColor: "#007AFF" }]}>
              <Ionicons name="call" size={22} color="#fff" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <View style={[styles.actionIcon, { backgroundColor: "#FF3B30" }]}>
              <Ionicons name="videocam" size={22} color="#fff" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push({ pathname: "/gifts", params: { userId: profile?.id, userName: profile?.display_name } })}>
            <View style={[styles.actionIcon, { backgroundColor: "#FF9500" }]}>
              <Ionicons name="gift" size={22} color="#fff" />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Gift</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.postsSection, { backgroundColor: colors.surface }]}>
          <View style={styles.postsSectionHeader}>
            <Ionicons name="newspaper-outline" size={18} color={Colors.brand} />
            <Text style={[styles.postsSectionTitle, { color: colors.text }]}>Posts</Text>
            <Text style={[styles.postsSectionCount, { color: colors.textMuted }]}>{posts.length}</Text>
          </View>
          {postsLoading ? (
            <View style={{ gap: 8 }}>{[1, 2].map((i) => <PostSkeleton key={i} />)}</View>
          ) : posts.length === 0 ? (
            <Text style={[styles.emptyPosts, { color: colors.textMuted }]}>No posts yet</Text>
          ) : (
            posts.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.postCard, { borderTopColor: colors.border }]}
                onPress={() => router.push({ pathname: "/post/[id]", params: { id: p.id } })}
                activeOpacity={0.7}
              >
                <Text style={[styles.postContent, { color: colors.text }]} numberOfLines={3}>{p.content}</Text>
                {p.image_url && <Image source={{ uri: p.image_url }} style={styles.postThumb} resizeMode="cover" />}
                <View style={styles.postMeta}>
                  <Text style={[styles.postTime, { color: colors.textMuted }]}>{timeAgo(p.created_at)}</Text>
                  <View style={styles.postStats}>
                    <Ionicons name="heart-outline" size={13} color={colors.textMuted} />
                    <Text style={[styles.postStatNum, { color: colors.textMuted }]}>{p.likeCount}</Text>
                    <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} style={{ marginLeft: 10 }} />
                    <Text style={[styles.postStatNum, { color: colors.textMuted }]}>{p.replyCount}</Text>
                    <Ionicons name="eye-outline" size={13} color={colors.textMuted} style={{ marginLeft: 10 }} />
                    <Text style={[styles.postStatNum, { color: colors.textMuted }]}>{p.view_count || 0}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { gap: 12, paddingVertical: 12 },
  profileHeader: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 24, gap: 8 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  displayName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  handle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  goldBadge: { marginLeft: 6 },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#D4A853", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, marginTop: 4 },
  verifiedBadgeText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  badgeInfoCard: { width: "100%", borderRadius: 12, padding: 16, gap: 10, marginTop: 8, borderWidth: 1 },
  badgeInfoTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  badgeInfoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badgeInfoText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  bio: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4, lineHeight: 20 },
  detailsSection: { gap: 6, marginTop: 8, alignItems: "center" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  infoItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium" },
  infoDot: { fontSize: 13, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 20, paddingHorizontal: 16 },
  actionBtn: { alignItems: "center", gap: 8 },
  actionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  followStats: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 0 },
  followStat: { alignItems: "center", paddingHorizontal: 20 },
  followNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  followLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  followDivider: { width: StyleSheet.hairlineWidth, height: 30 },
  profileActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  followBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.brand, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 },
  followBtnActive: { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.brand },
  followBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  blockBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#FF3B30", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24 },
  blockBtnActive: { backgroundColor: "#FF3B30" },
  blockBtnText: { color: "#FF3B30", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  postsSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  postsSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  postsSectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1 },
  postsSectionCount: { fontSize: 14, fontFamily: "Inter_500Medium" },
  emptyPosts: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 24 },
  postCard: { paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  postContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 8 },
  postThumb: { width: "100%", height: 160, borderRadius: 10, marginBottom: 8 },
  postMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  postTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  postStats: { flexDirection: "row", alignItems: "center", gap: 4 },
  postStatNum: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
