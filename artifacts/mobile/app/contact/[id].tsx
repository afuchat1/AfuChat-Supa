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
import { PrestigeBadge } from "@/components/ui/PrestigeBadge";

type Profile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  is_business_mode: boolean;
  xp: number;
  current_grade: string;
  website_url: string | null;
  country: string | null;
  created_at: string | null;
  last_seen: string | null;
  show_online_status: boolean;
  acoin: number;
};

type UserPost = {
  id: string;
  content: string;
  image_url: string | null;
  post_type: string;
  video_url: string | null;
  article_title: string | null;
  post_images: { image_url: string; display_order: number }[];
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
  const [mutualCount, setMutualCount] = useState(0);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [showBadgeInfo, setShowBadgeInfo] = useState(false);
  const [hasShop, setHasShop] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, is_business_mode, xp, current_grade, website_url, country, created_at, last_seen, show_online_status, acoin")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setProfile(data as Profile);
        setLoading(false);
      });

    supabase.from("shops").select("id, pin_to_profile").eq("seller_id", id).eq("is_active", true).eq("pin_to_profile", true).maybeSingle().then(({ data }) => setHasShop(!!data));

    if (user) {
      supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", id).maybeSingle().then(({ data }) => setIsFollowing(!!data));
      supabase.from("blocked_users").select("id").eq("blocker_id", user.id).eq("blocked_id", id).maybeSingle().then(({ data }) => setIsBlocked(!!data));
    }
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", id).then(({ count }) => setFollowerCount(count || 0));
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", id).then(({ count }) => setFollowingCount(count || 0));
    if (user) {
      supabase.rpc("get_mutual_followers_count", { user_a: user.id, user_b: id }).then(({ data }) => setMutualCount(data || 0)).then(undefined, () => {});
    }
  }, [id, user]);

  const loadPosts = useCallback(async () => {
    if (!id) return;
    setPostsLoading(true);
    const { data } = await supabase
      .from("posts")
      .select("id, content, image_url, created_at, view_count, visibility, post_type, video_url, article_title, post_images(image_url, display_order)")
      .eq("author_id", id)
      .in("visibility", ["public", "followers"])
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
      setPosts(data.map((p: any) => ({
        id: p.id,
        content: p.content || "",
        image_url: p.image_url,
        post_type: p.post_type || "text",
        video_url: p.video_url || null,
        article_title: p.article_title || null,
        post_images: (p.post_images || []).sort((a: any, b: any) => a.display_order - b.display_order),
        created_at: p.created_at,
        view_count: p.view_count || 0,
        likeCount: likeCounts[p.id] || 0,
        replyCount: replyCounts[p.id] || 0,
      })));
    } else {
      setPosts([]);
    }
    setPostsLoading(false);
  }, [id]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`contact-posts:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts", filter: `author_id=eq.${id}` }, () => {
        loadPosts();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts", filter: `author_id=eq.${id}` }, () => {
        loadPosts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, loadPosts]);

  async function sendWave() {
    if (!user || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const chatData = await supabase.rpc("get_or_create_direct_chat", { other_user_id: id });
    if (chatData.data) {
      await supabase.from("messages").insert({
        chat_id: chatData.data,
        sender_id: user.id,
        encrypted_content: "👋 Waved at you!",
      });
      showAlert("Wave Sent!", `You waved at ${profile?.display_name || "them"} 👋`);
    }
  }

  async function startChat() {
    if (!id) return;
    if (!user) { router.push("/(auth)/login"); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { data: chatId, error } = await supabase.rpc("get_or_create_direct_chat", {
      other_user_id: id,
    });
    if (error || !chatId) {
      showAlert("Error", "Could not start conversation. Please try again.");
      return;
    }
    router.push({ pathname: "/chat/[id]", params: { id: chatId } });
  }

  async function toggleFollow() {
    if (!id) return;
    if (!user) { router.push("/(auth)/login"); return; }
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
    showAlert("Report Account", "Why are you reporting this account?", [
      { text: "Spam", onPress: () => submitReport("Spam") },
      { text: "Harassment", onPress: () => submitReport("Harassment") },
      { text: "Hate Speech", onPress: () => submitReport("Hate speech") },
      { text: "Impersonation", onPress: () => submitReport("Impersonation") },
      { text: "Inappropriate Content", onPress: () => submitReport("Inappropriate content") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function submitReport(reason: string) {
    if (!user || !id) return;
    const { error } = await supabase.from("user_reports").insert({ reporter_id: user.id, reported_user_id: id, reason });
    if (error) showAlert("Error", "Could not submit report. Please try again.");
    else showAlert("Reported", "Thank you for your report. Our team will review it.");
  }

  if (loading) {
    return <View style={[st.center, { backgroundColor: colors.background }]}><ProfileSkeleton /></View>;
  }

  const isOwnProfile = user?.id === id;

  const onlineStatus = (() => {
    if (!profile?.show_online_status || !profile?.last_seen) return null;
    const diff = Date.now() - new Date(profile.last_seen).getTime();
    const isOnline = diff < 2 * 60 * 1000;
    const text = isOnline ? "Online" :
      diff < 3600000 ? `Active ${Math.floor(diff / 60000)}m ago` :
      diff < 86400000 ? `Active ${Math.floor(diff / 3600000)}h ago` :
      `Last seen ${new Date(profile.last_seen).toLocaleDateString()}`;
    return { isOnline, text };
  })();

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[st.header, { paddingTop: insets.top, backgroundColor: "transparent" }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {profile?.handle ? (
            <TouchableOpacity style={st.headerBtn} onPress={() => shareProfile({ handle: profile.handle, displayName: profile.display_name, bio: profile.bio })}>
              <Ionicons name="share-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          ) : null}
          {!isOwnProfile && (
            <TouchableOpacity style={st.headerBtn} onPress={reportUser}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={[st.heroCard, { backgroundColor: colors.surface }]}>
          <View style={st.avatarSection}>
            <View style={st.avatarWrap}>
              <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={96} />
              {onlineStatus?.isOnline && <View style={st.onlineDot} />}
            </View>
          </View>

          <TouchableOpacity style={st.nameRow} activeOpacity={0.8} onPress={() => (profile?.is_verified || profile?.is_organization_verified) && setShowBadgeInfo(!showBadgeInfo)}>
            <Text style={[st.displayName, { color: colors.text }]}>{profile?.display_name}</Text>
            <VerifiedBadge isVerified={profile?.is_verified} isOrganizationVerified={profile?.is_organization_verified} size={20} />
          </TouchableOpacity>

          <View style={st.handleRow}>
            <Text style={[st.handle, { color: colors.textSecondary }]}>@{profile?.handle}</Text>
            <PrestigeBadge acoin={profile?.acoin || 0} size="sm" showLabel />
          </View>

          {onlineStatus && !onlineStatus.isOnline && (
            <Text style={[st.statusText, { color: colors.textMuted }]}>{onlineStatus.text}</Text>
          )}

          {(profile?.is_organization_verified || profile?.is_verified) && (
            <View style={[st.verifiedPill, { backgroundColor: profile?.is_organization_verified ? "#D4A853" : colors.accent }]}>
              <Ionicons name={profile?.is_organization_verified ? "shield-checkmark" : "checkmark-circle"} size={12} color="#fff" />
              <Text style={st.verifiedPillText}>{profile?.is_organization_verified ? "Verified Business" : "Verified"}</Text>
            </View>
          )}

          {showBadgeInfo && (
            <View style={[st.badgeInfoCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Text style={[st.badgeInfoTitle, { color: colors.text }]}>Verification Details</Text>
              {profile?.is_organization_verified ? (
                <>
                  <View style={st.badgeInfoRow}><Ionicons name="shield-checkmark" size={14} color={Colors.gold} /><Text style={[st.badgeInfoText, { color: colors.textSecondary }]}>Verified Business Account</Text></View>
                  <View style={st.badgeInfoRow}><Ionicons name="briefcase" size={14} color={Colors.gold} /><Text style={[st.badgeInfoText, { color: colors.textSecondary }]}>Official Business Profile</Text></View>
                  <View style={st.badgeInfoRow}><Ionicons name="checkmark-done" size={14} color={Colors.gold} /><Text style={[st.badgeInfoText, { color: colors.textSecondary }]}>Identity Confirmed by AfuChat</Text></View>
                </>
              ) : (
                <>
                  <View style={st.badgeInfoRow}><Ionicons name="checkmark-circle" size={14} color={colors.accent} /><Text style={[st.badgeInfoText, { color: colors.textSecondary }]}>Verified Account</Text></View>
                  <View style={st.badgeInfoRow}><Ionicons name="diamond" size={14} color={colors.accent} /><Text style={[st.badgeInfoText, { color: colors.textSecondary }]}>Premium Subscription</Text></View>
                </>
              )}
            </View>
          )}

          {profile?.bio ? (
            <Text style={[st.bio, { color: colors.text }]}>{profile.bio}</Text>
          ) : null}

          <View style={st.metaRow}>
            {profile?.country ? (
              <View style={[st.metaChip, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="location" size={12} color={colors.textMuted} />
                <Text style={[st.metaChipText, { color: colors.textSecondary }]}>{profile.country}</Text>
              </View>
            ) : null}
            <View style={[st.metaChip, { backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="calendar" size={12} color={colors.textMuted} />
              <Text style={[st.metaChipText, { color: colors.textSecondary }]}>Joined {formatJoinDate(profile?.created_at || null)}</Text>
            </View>
            {profile?.website_url ? (
              <View style={[st.metaChip, { backgroundColor: colors.accent + "12" }]}>
                <Ionicons name="link" size={12} color={colors.accent} />
                <Text style={[st.metaChipText, { color: colors.accent }]} numberOfLines={1}>{profile.website_url.replace(/^https?:\/\//, "")}</Text>
              </View>
            ) : null}
          </View>

          <View style={[st.statsBar, { backgroundColor: colors.backgroundSecondary }]}>
            <TouchableOpacity style={st.statBlock} activeOpacity={0.6} onPress={() => router.push({ pathname: "/followers", params: { userId: id, type: "followers", ownerHandle: profile?.handle } })}>
              <Text style={[st.statNum, { color: colors.text }]}>{followerCount.toLocaleString()}</Text>
              <Text style={[st.statLabel, { color: colors.textMuted }]}>Followers</Text>
            </TouchableOpacity>
            <View style={[st.statDiv, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={st.statBlock} activeOpacity={0.6} onPress={() => router.push({ pathname: "/followers", params: { userId: id, type: "following", ownerHandle: profile?.handle } })}>
              <Text style={[st.statNum, { color: colors.text }]}>{followingCount.toLocaleString()}</Text>
              <Text style={[st.statLabel, { color: colors.textMuted }]}>Following</Text>
            </TouchableOpacity>
            {mutualCount > 0 && (
              <>
                <View style={[st.statDiv, { backgroundColor: colors.border }]} />
                <View style={st.statBlock}>
                  <Text style={[st.statNum, { color: colors.text }]}>{mutualCount}</Text>
                  <Text style={[st.statLabel, { color: colors.textMuted }]}>Mutual</Text>
                </View>
              </>
            )}
            <View style={[st.statDiv, { backgroundColor: colors.border }]} />
            <View style={st.statBlock}>
              <Text style={[st.statNum, { color: "#FFD60A" }]}>{(profile?.xp || 0).toLocaleString()}</Text>
              <Text style={[st.statLabel, { color: colors.textMuted }]}>{profile?.current_grade || "Nexa"}</Text>
            </View>
          </View>

          {!isOwnProfile && (
            <View style={st.ctaRow}>
              <TouchableOpacity
                style={[st.primaryCta, { backgroundColor: isFollowing ? "transparent" : colors.accent, borderColor: colors.accent, borderWidth: isFollowing ? 1.5 : 0 }]}
                onPress={toggleFollow}
                activeOpacity={0.7}
              >
                <Ionicons name={isFollowing ? "checkmark" : "person-add-outline"} size={16} color={isFollowing ? colors.accent : "#fff"} />
                <Text style={[st.primaryCtaText, { color: isFollowing ? colors.accent : "#fff" }]}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.secondaryCta, { backgroundColor: colors.accent + "12" }]} onPress={startChat} activeOpacity={0.7}>
                <Ionicons name="chatbubble" size={16} color={colors.accent} />
                <Text style={[st.secondaryCtaText, { color: colors.accent }]}>Message</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.iconCta, { backgroundColor: colors.backgroundSecondary }]} onPress={sendWave} activeOpacity={0.7}>
                <Text style={{ fontSize: 18 }}>👋</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={[st.quickActions, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={st.qAction} onPress={startChat}>
            <View style={[st.qIcon, { backgroundColor: colors.accent }]}>
              <Ionicons name="chatbubble" size={20} color="#fff" />
            </View>
            <Text style={[st.qLabel, { color: colors.text }]}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.qAction}>
            <View style={[st.qIcon, { backgroundColor: "#007AFF" }]}>
              <Ionicons name="call" size={20} color="#fff" />
            </View>
            <Text style={[st.qLabel, { color: colors.text }]}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.qAction} onPress={() => router.push({ pathname: "/gifts", params: { userId: profile?.id, userName: profile?.display_name } })}>
            <View style={[st.qIcon, { backgroundColor: "#AF52DE" }]}>
              <Ionicons name="gift" size={20} color="#fff" />
            </View>
            <Text style={[st.qLabel, { color: colors.text }]}>Gift</Text>
          </TouchableOpacity>
          {hasShop && (
            <TouchableOpacity style={st.qAction} onPress={() => router.push({ pathname: "/shop/[userId]", params: { userId: profile?.id || "" } })}>
              <View style={[st.qIcon, { backgroundColor: "#FF9500" }]}>
                <Ionicons name="storefront" size={20} color="#fff" />
              </View>
              <Text style={[st.qLabel, { color: colors.text }]}>Store</Text>
            </TouchableOpacity>
          )}
          {!isOwnProfile && (
            <TouchableOpacity style={st.qAction} onPress={toggleBlock}>
              <View style={[st.qIcon, { backgroundColor: isBlocked ? "#FF3B30" : colors.backgroundSecondary }]}>
                <Ionicons name={isBlocked ? "ban" : "ban-outline"} size={20} color={isBlocked ? "#fff" : "#FF3B30"} />
              </View>
              <Text style={[st.qLabel, { color: isBlocked ? "#FF3B30" : colors.text }]}>{isBlocked ? "Blocked" : "Block"}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[st.postsSection, { backgroundColor: colors.surface }]}>
          <View style={st.postsSectionHeader}>
            <Ionicons name="newspaper-outline" size={18} color={colors.accent} />
            <Text style={[st.postsSectionTitle, { color: colors.text }]}>Posts</Text>
            <View style={[st.postCountBadge, { backgroundColor: colors.accent + "15" }]}>
              <Text style={[st.postCountText, { color: colors.accent }]}>{posts.length}</Text>
            </View>
          </View>
          {postsLoading ? (
            <View style={{ gap: 8 }}>{[1, 2].map((i) => <PostSkeleton key={i} />)}</View>
          ) : posts.length === 0 ? (
            <View style={st.emptyPostsWrap}>
              <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
              <Text style={[st.emptyPostsTitle, { color: colors.text }]}>No posts yet</Text>
              <Text style={[st.emptyPostsSub, { color: colors.textMuted }]}>{profile?.display_name} hasn't shared anything yet.</Text>
            </View>
          ) : (
            posts.map((p) => {
              const isVideo = p.post_type === "video" && p.video_url;
              const isArticle = p.post_type === "article";
              const images = p.post_images?.length > 0
                ? p.post_images.map((img: any) => img.image_url)
                : p.image_url ? [p.image_url] : [];
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[st.postCard, { borderTopColor: colors.border }]}
                  onPress={() => {
                    if (isArticle) router.push({ pathname: "/article/[id]", params: { id: p.id } });
                    else if (isVideo) router.push({ pathname: "/video/[id]", params: { id: p.id } });
                    else router.push({ pathname: "/post/[id]", params: { id: p.id } });
                  }}
                  activeOpacity={0.65}
                >
                  {isArticle ? (
                    <View style={[st.articleCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.accent + "20" }]}>
                      {images.length > 0 && <Image source={{ uri: images[0] }} style={st.articleCover} resizeMode="cover" />}
                      <View style={{ padding: 14, gap: 6 }}>
                        <View style={[st.articleBadge, { backgroundColor: colors.accent + "15" }]}>
                          <Ionicons name="document-text" size={11} color={colors.accent} />
                          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.accent }}>Article</Text>
                        </View>
                        {p.article_title ? <Text style={[st.articleTitle, { color: colors.text }]} numberOfLines={2}>{p.article_title}</Text> : null}
                        {!!p.content && <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 }} numberOfLines={2}>{p.content}</Text>}
                      </View>
                    </View>
                  ) : (
                    <>
                      {!!p.content && <Text style={[st.postContent, { color: colors.text }]} numberOfLines={3}>{p.content}</Text>}
                      {isVideo ? (
                        <View style={[st.postThumb, { backgroundColor: "#1a1a1d", overflow: "hidden" }]}>
                          {p.image_url ? (
                            <Image source={{ uri: p.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                          ) : null}
                          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: p.image_url ? "rgba(0,0,0,0.32)" : undefined }]}>
                            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
                              <Ionicons name="play" size={24} color="#fff" />
                            </View>
                          </View>
                        </View>
                      ) : images.length === 1 ? (
                        <Image source={{ uri: images[0] }} style={st.postThumb} resizeMode="cover" />
                      ) : images.length > 1 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                          {images.map((url: string, i: number) => (
                            <Image key={i} source={{ uri: url }} style={st.postThumbSmall} resizeMode="cover" />
                          ))}
                        </ScrollView>
                      ) : null}
                    </>
                  )}
                  <View style={st.postMeta}>
                    <Text style={[st.postTime, { color: colors.textMuted }]}>{timeAgo(p.created_at)}</Text>
                    <View style={st.postStats}>
                      <Ionicons name="heart-outline" size={13} color={colors.textMuted} />
                      <Text style={[st.postStatNum, { color: colors.textMuted }]}>{p.likeCount}</Text>
                      <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} style={{ marginLeft: 8 }} />
                      <Text style={[st.postStatNum, { color: colors.textMuted }]}>{p.replyCount}</Text>
                      <Ionicons name="eye-outline" size={13} color={colors.textMuted} style={{ marginLeft: 8 }} />
                      <Text style={[st.postStatNum, { color: colors.textMuted }]}>{p.view_count || 0}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, zIndex: 10 },
  headerBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },

  heroCard: { marginHorizontal: 16, marginTop: 4, borderRadius: 24, paddingTop: 28, paddingBottom: 24, paddingHorizontal: 24, alignItems: "center", gap: 6 },
  avatarSection: { marginBottom: 8 },
  avatarWrap: { position: "relative" },
  onlineDot: { position: "absolute", bottom: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: "#34C759", borderWidth: 3, borderColor: "#fff" },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  displayName: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  handle: { fontSize: 15, fontFamily: "Inter_400Regular" },
  statusText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  verifiedPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, marginTop: 4 },
  verifiedPillText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  badgeInfoCard: { width: "100%", borderRadius: 14, padding: 16, gap: 10, marginTop: 8, borderWidth: 1 },
  badgeInfoTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  badgeInfoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badgeInfoText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  bio: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginTop: 8, paddingHorizontal: 8 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 12 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  metaChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  statsBar: { flexDirection: "row", alignItems: "center", borderRadius: 16, marginTop: 16, paddingVertical: 14, width: "100%" },
  statBlock: { flex: 1, alignItems: "center" },
  statNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 },
  statDiv: { width: StyleSheet.hairlineWidth, height: 28 },

  ctaRow: { flexDirection: "row", gap: 8, marginTop: 16, width: "100%" },
  primaryCta: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 14 },
  primaryCtaText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  secondaryCta: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 14 },
  secondaryCtaText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  iconCta: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },

  quickActions: { flexDirection: "row", justifyContent: "space-around", marginHorizontal: 16, marginTop: 12, borderRadius: 20, paddingVertical: 18, paddingHorizontal: 12 },
  qAction: { alignItems: "center", gap: 6 },
  qIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  qLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },

  postsSection: { marginHorizontal: 16, marginTop: 12, borderRadius: 20, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12 },
  postsSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  postsSectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1 },
  postCountBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  postCountText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  emptyPostsWrap: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyPostsTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyPostsSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  postCard: { paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  articleCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 8 },
  articleCover: { width: "100%", height: 130, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  articleBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  articleTitle: { fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  postContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 10 },
  postThumb: { width: "100%", height: 180, borderRadius: 14, marginBottom: 10, backgroundColor: "#e0e0e0" },
  postThumbSmall: { width: 130, height: 130, borderRadius: 12, marginRight: 8, backgroundColor: "#e0e0e0" },
  postMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  postTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  postStats: { flexDirection: "row", alignItems: "center", gap: 4 },
  postStatNum: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
