import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
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
import { AvatarViewer } from "@/components/ui/AvatarViewer";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { notifyNewFollow } from "@/lib/notifyUser";
import { shareProfile } from "@/lib/share";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import { PrestigeBadge } from "@/components/ui/PrestigeBadge";
import { RichText } from "@/components/ui/RichText";
import { encodeId } from "@/lib/shortId";

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_GAP = 2;
const GRID_COLS = 3;
const THUMB = (SCREEN_W - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

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

type TabKey = "posts" | "photos" | "videos";

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

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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
  const [hasShop, setHasShop] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [showBadgeInfo, setShowBadgeInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("posts");
  const tabAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!profile?.handle) return;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.history.replaceState(null, "", `/@${profile.handle}`);
    }
  }, [profile?.handle]);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, is_business_mode, xp, current_grade, website_url, country, created_at, last_seen, show_online_status, acoin")
      .eq("id", id)
      .single()
      .then(({ data }) => { setProfile(data as Profile); setLoading(false); });

    supabase.from("shops").select("id, pin_to_profile").eq("seller_id", id).eq("is_active", true).eq("pin_to_profile", true).maybeSingle().then(({ data }) => setHasShop(!!data));

    if (user) {
      supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", id).maybeSingle().then(({ data }) => setIsFollowing(!!data));
      supabase.from("blocked_users").select("id").eq("blocker_id", user.id).eq("blocked_id", id).maybeSingle().then(({ data }) => setIsBlocked(!!data));
    }
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", id).then(({ count }) => setFollowerCount(count || 0));
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", id).then(({ count }) => setFollowingCount(count || 0));
    if (user) {
      supabase.rpc("get_mutual_followers_count", { user_a: user.id, user_b: id }).then(({ data }) => setMutualCount(data || 0)).catch(() => {});
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
      .limit(40);

    if (data && data.length > 0) {
      const postIds = data.map((p: any) => p.id);
      const [likesRes, repliesRes] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
        supabase.from("post_replies").select("post_id").in("post_id", postIds),
      ]);
      const likeMap: Record<string, number> = {};
      const replyMap: Record<string, number> = {};
      (likesRes.data || []).forEach((l: any) => { likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1; });
      (repliesRes.data || []).forEach((r: any) => { replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1; });
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
        likeCount: likeMap[p.id] || 0,
        replyCount: replyMap[p.id] || 0,
      })));
    } else {
      setPosts([]);
    }
    setPostsLoading(false);
  }, [id]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`contact-posts:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts", filter: `author_id=eq.${id}` }, loadPosts)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts", filter: `author_id=eq.${id}` }, loadPosts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, loadPosts]);

  function switchTab(tab: TabKey) {
    const idx = (["posts", "photos", "videos"] as TabKey[]).indexOf(tab);
    setActiveTab(tab);
    Animated.spring(tabAnim, { toValue: idx, useNativeDriver: false, tension: 280, friction: 32 }).start();
  }

  async function sendWave() {
    if (!user || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { data: chatId } = await supabase.rpc("get_or_create_direct_chat", { other_user_id: id });
    if (chatId) {
      await supabase.from("messages").insert({ chat_id: chatId, sender_id: user.id, encrypted_content: "👋 Waved at you!" });
      showAlert("Wave Sent!", `You waved at ${profile?.display_name || "them"} 👋`);
    }
  }

  async function startChat() {
    if (!id) return;
    if (!user) { router.push("/(auth)/login"); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { data: chatId, error } = await supabase.rpc("get_or_create_direct_chat", { other_user_id: id });
    if (error || !chatId) { showAlert("Error", "Could not start conversation. Please try again."); return; }
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
      notifyNewFollow({ targetUserId: id as string, followerName: myProfile?.display_name || "Someone", followerUserId: user.id });
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
          if (isFollowing) { await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", id); setIsFollowing(false); }
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
    if (error) showAlert("Error", "Could not submit report.");
    else showAlert("Reported", "Thank you. Our team will review it.");
  }

  if (loading) {
    return <View style={[st.root, { backgroundColor: colors.background }]}><ProfileSkeleton /></View>;
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

  const photoPosts = posts.filter((p) => {
    const imgs = p.post_images?.length > 0 ? p.post_images : p.image_url ? [{ image_url: p.image_url }] : [];
    return imgs.length > 0 && p.post_type !== "video";
  });
  const videoPosts = posts.filter((p) => p.post_type === "video" && p.video_url);
  const textPosts = posts.filter((p) => p.post_type !== "video" || !p.video_url);

  const TABS: { key: TabKey; label: string; icon: string; count: number }[] = [
    { key: "posts", label: "Posts", icon: "grid-outline", count: textPosts.length },
    { key: "photos", label: "Photos", icon: "images-outline", count: photoPosts.length },
    { key: "videos", label: "Videos", icon: "videocam-outline", count: videoPosts.length },
  ];

  const indicatorLeft = tabAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ["0%", "33.333%", "66.667%"],
  });

  const headerNode = (
    <>
      {/* ── Cover / Header bar ─────────────────────────────── */}
      <View style={[st.coverArea, { paddingTop: insets.top, backgroundColor: colors.accent + "22" }]}>
        <View style={[st.topBar, { paddingTop: 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={[st.circleBtn, { backgroundColor: colors.surface + "CC" }]}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {profile?.handle && (
              <TouchableOpacity style={[st.circleBtn, { backgroundColor: colors.surface + "CC" }]} onPress={() => shareProfile({ handle: profile.handle, displayName: profile.display_name, bio: profile.bio })}>
                <Ionicons name="share-outline" size={20} color={colors.text} />
              </TouchableOpacity>
            )}
            {!isOwnProfile && (
              <TouchableOpacity style={[st.circleBtn, { backgroundColor: colors.surface + "CC" }]} onPress={reportUser}>
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* ── Identity card ──────────────────────────────────── */}
      <View style={[st.identityCard, { backgroundColor: colors.surface }]}>
        {/* Avatar — pulled up over cover */}
        <View style={st.avatarFloat}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => setAvatarOpen(true)} style={[st.avatarRing, { borderColor: colors.accent }]}>
            <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={86} />
            {onlineStatus?.isOnline && <View style={st.onlineDot} />}
          </TouchableOpacity>
        </View>

        <View style={st.identityBody}>
          {/* Name + badges */}
          <TouchableOpacity style={st.nameRow} activeOpacity={0.8} onPress={() => (profile?.is_verified || profile?.is_organization_verified) && setShowBadgeInfo(!showBadgeInfo)}>
            <Text style={[st.displayName, { color: colors.text }]}>{profile?.display_name}</Text>
            <VerifiedBadge isVerified={profile?.is_verified} isOrganizationVerified={profile?.is_organization_verified} size={20} />
          </TouchableOpacity>

          <View style={st.subRow}>
            <Text style={[st.handle, { color: colors.textSecondary }]}>@{profile?.handle}</Text>
            <PrestigeBadge acoin={profile?.acoin || 0} size="sm" showLabel />
          </View>

          {onlineStatus && !onlineStatus.isOnline && (
            <Text style={[st.onlineLabel, { color: colors.textMuted }]}>{onlineStatus.text}</Text>
          )}

          {(profile?.is_organization_verified || profile?.is_verified) && (
            <View style={[st.verifiedPill, { backgroundColor: profile?.is_organization_verified ? "#D4A853" : colors.accent }]}>
              <Ionicons name={profile?.is_organization_verified ? "shield-checkmark" : "checkmark-circle"} size={12} color="#fff" />
              <Text style={st.verifiedPillText}>{profile?.is_organization_verified ? "Verified Business" : "Verified"}</Text>
            </View>
          )}

          {showBadgeInfo && (
            <View style={[st.badgeCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              {profile?.is_organization_verified ? (
                <>
                  <View style={st.badgeRow}><Ionicons name="shield-checkmark" size={14} color={Colors.gold} /><Text style={[st.badgeText, { color: colors.textSecondary }]}>Verified Business Account</Text></View>
                  <View style={st.badgeRow}><Ionicons name="briefcase" size={14} color={Colors.gold} /><Text style={[st.badgeText, { color: colors.textSecondary }]}>Official Business Profile</Text></View>
                  <View style={st.badgeRow}><Ionicons name="checkmark-done" size={14} color={Colors.gold} /><Text style={[st.badgeText, { color: colors.textSecondary }]}>Identity Confirmed by AfuChat</Text></View>
                </>
              ) : (
                <>
                  <View style={st.badgeRow}><Ionicons name="checkmark-circle" size={14} color={colors.accent} /><Text style={[st.badgeText, { color: colors.textSecondary }]}>Verified Account</Text></View>
                  <View style={st.badgeRow}><Ionicons name="diamond" size={14} color={colors.accent} /><Text style={[st.badgeText, { color: colors.textSecondary }]}>Premium Subscription</Text></View>
                </>
              )}
            </View>
          )}

          {!!profile?.bio && (
            <Text style={[st.bio, { color: colors.text }]}>{profile.bio}</Text>
          )}

          {/* Meta chips */}
          <View style={st.metaRow}>
            {profile?.country && (
              <View style={[st.metaChip, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                <Text style={[st.metaChipText, { color: colors.textSecondary }]}>{profile.country}</Text>
              </View>
            )}
            <View style={[st.metaChip, { backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
              <Text style={[st.metaChipText, { color: colors.textSecondary }]}>Joined {formatJoinDate(profile?.created_at || null)}</Text>
            </View>
            {profile?.website_url && (
              <View style={[st.metaChip, { backgroundColor: colors.accent + "12" }]}>
                <Ionicons name="link-outline" size={12} color={colors.accent} />
                <Text style={[st.metaChipText, { color: colors.accent }]} numberOfLines={1}>{profile.website_url.replace(/^https?:\/\//, "")}</Text>
              </View>
            )}
          </View>

          {/* Stats */}
          <View style={[st.statsRow, { backgroundColor: colors.backgroundSecondary }]}>
            <TouchableOpacity style={st.statCell} activeOpacity={0.6} onPress={() => router.push({ pathname: "/followers", params: { userId: id, type: "followers", ownerHandle: profile?.handle } })}>
              <Text style={[st.statNum, { color: colors.text }]}>{fmtNum(followerCount)}</Text>
              <Text style={[st.statLabel, { color: colors.textMuted }]}>Followers</Text>
            </TouchableOpacity>
            <View style={[st.statSep, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={st.statCell} activeOpacity={0.6} onPress={() => router.push({ pathname: "/followers", params: { userId: id, type: "following", ownerHandle: profile?.handle } })}>
              <Text style={[st.statNum, { color: colors.text }]}>{fmtNum(followingCount)}</Text>
              <Text style={[st.statLabel, { color: colors.textMuted }]}>Following</Text>
            </TouchableOpacity>
            {mutualCount > 0 && (
              <>
                <View style={[st.statSep, { backgroundColor: colors.border }]} />
                <View style={st.statCell}>
                  <Text style={[st.statNum, { color: colors.text }]}>{mutualCount}</Text>
                  <Text style={[st.statLabel, { color: colors.textMuted }]}>Mutual</Text>
                </View>
              </>
            )}
            <View style={[st.statSep, { backgroundColor: colors.border }]} />
            <View style={st.statCell}>
              <Text style={[st.statNum, { color: "#FFD60A" }]}>{fmtNum(profile?.xp || 0)}</Text>
              <Text style={[st.statLabel, { color: colors.textMuted }]}>{profile?.current_grade || "Nexa"}</Text>
            </View>
          </View>

          {/* CTA buttons */}
          {!isOwnProfile && (
            <View style={st.ctaRow}>
              <TouchableOpacity
                style={[st.ctaFollow, { backgroundColor: isFollowing ? "transparent" : colors.accent, borderColor: colors.accent, borderWidth: isFollowing ? 1.5 : 0 }]}
                onPress={toggleFollow}
                activeOpacity={0.75}
              >
                <Ionicons name={isFollowing ? "checkmark" : "person-add-outline"} size={15} color={isFollowing ? colors.accent : "#fff"} />
                <Text style={[st.ctaFollowText, { color: isFollowing ? colors.accent : "#fff" }]}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.ctaMessage, { backgroundColor: colors.accent + "14", borderColor: colors.accent + "30", borderWidth: 1 }]} onPress={startChat} activeOpacity={0.75}>
                <Ionicons name="chatbubble-outline" size={15} color={colors.accent} />
                <Text style={[st.ctaMessageText, { color: colors.accent }]}>Message</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.ctaIcon, { backgroundColor: colors.backgroundSecondary }]} onPress={sendWave} activeOpacity={0.75}>
                <Text style={{ fontSize: 20 }}>👋</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* ── Quick-action pills ─────────────────────────────── */}
      {!isOwnProfile && (
        <View style={[st.pillBar, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={[st.pill, { backgroundColor: colors.accent + "14" }]} onPress={startChat}>
            <Ionicons name="chatbubble" size={17} color={colors.accent} />
            <Text style={[st.pillLabel, { color: colors.accent }]}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.pill, { backgroundColor: "#FF6B0014" }]} onPress={sendWave}>
            <Text style={{ fontSize: 17 }}>👋</Text>
            <Text style={[st.pillLabel, { color: "#FF6B00" }]}>Wave</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.pill, { backgroundColor: "#AF52DE14" }]} onPress={() => router.push({ pathname: "/gifts", params: { userId: profile?.id, userName: profile?.display_name } })}>
            <Ionicons name="gift" size={17} color="#AF52DE" />
            <Text style={[st.pillLabel, { color: "#AF52DE" }]}>Gift</Text>
          </TouchableOpacity>
          {hasShop && (
            <TouchableOpacity style={[st.pill, { backgroundColor: "#FF950014" }]} onPress={() => router.push({ pathname: "/shop/[userId]", params: { userId: profile?.id || "" } })}>
              <Ionicons name="storefront" size={17} color="#FF9500" />
              <Text style={[st.pillLabel, { color: "#FF9500" }]}>Store</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[st.pill, { backgroundColor: isBlocked ? "#FF3B3014" : colors.backgroundSecondary }]} onPress={toggleBlock}>
            <Ionicons name={isBlocked ? "ban" : "ban-outline"} size={17} color="#FF3B30" />
            <Text style={[st.pillLabel, { color: "#FF3B30" }]}>{isBlocked ? "Blocked" : "Block"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Tab bar ────────────────────────────────────────── */}
      <View style={[st.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {TABS.map((t, idx) => {
          const active = activeTab === t.key;
          return (
            <TouchableOpacity key={t.key} style={st.tabBtn} onPress={() => switchTab(t.key)} activeOpacity={0.7}>
              <Ionicons name={t.icon as any} size={18} color={active ? colors.accent : colors.textMuted} />
              <Text style={[st.tabBtnText, { color: active ? colors.accent : colors.textMuted }]}>{t.label}</Text>
              {t.count > 0 && (
                <View style={[st.tabBadge, { backgroundColor: active ? colors.accent : colors.backgroundSecondary }]}>
                  <Text style={[st.tabBadgeText, { color: active ? "#fff" : colors.textMuted }]}>{t.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        <Animated.View style={[st.tabIndicator, { backgroundColor: colors.accent, left: indicatorLeft }]} />
      </View>
    </>
  );

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
      {activeTab === "posts" && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          {headerNode}
          <PostsTab posts={textPosts} loading={postsLoading} profile={profile} colors={colors} />
        </ScrollView>
      )}

      {activeTab === "photos" && (
        <FlatList
          ListHeaderComponent={<>{headerNode}</>}
          data={photoPosts}
          keyExtractor={(p) => p.id}
          numColumns={GRID_COLS}
          columnWrapperStyle={{ gap: GRID_GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            postsLoading ? (
              <View style={st.emptyWrap}><ActivityIndicator color={colors.accent} /></View>
            ) : (
              <View style={st.emptyWrap}>
                <Ionicons name="images-outline" size={44} color={colors.textMuted} />
                <Text style={[st.emptyTitle, { color: colors.text }]}>No photos yet</Text>
                <Text style={[st.emptySub, { color: colors.textMuted }]}>{profile?.display_name} hasn't shared any photos.</Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const imgs = item.post_images?.length > 0
              ? item.post_images.map((i: any) => i.image_url)
              : item.image_url ? [item.image_url] : [];
            return (
              <TouchableOpacity
                style={{ width: THUMB, height: THUMB }}
                onPress={() => router.push({ pathname: "/p/[id]", params: { id: encodeId(item.id) } })}
                activeOpacity={0.82}
              >
                <Image source={{ uri: imgs[0] }} style={{ width: THUMB, height: THUMB }} resizeMode="cover" />
                {imgs.length > 1 && (
                  <View style={st.multiImgBadge}>
                    <Ionicons name="copy-outline" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {activeTab === "videos" && (
        <FlatList
          ListHeaderComponent={<>{headerNode}</>}
          data={videoPosts}
          keyExtractor={(p) => p.id}
          numColumns={GRID_COLS}
          columnWrapperStyle={{ gap: GRID_GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            postsLoading ? (
              <View style={st.emptyWrap}><ActivityIndicator color={colors.accent} /></View>
            ) : (
              <View style={st.emptyWrap}>
                <Ionicons name="videocam-outline" size={44} color={colors.textMuted} />
                <Text style={[st.emptyTitle, { color: colors.text }]}>No videos yet</Text>
                <Text style={[st.emptySub, { color: colors.textMuted }]}>{profile?.display_name} hasn't shared any videos.</Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ width: THUMB, height: THUMB * 1.35, backgroundColor: "#111" }}
              onPress={() => router.push({ pathname: "/video/[id]", params: { id: item.id } })}
              activeOpacity={0.82}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={{ width: THUMB, height: THUMB * 1.35 }} resizeMode="cover" />
              ) : null}
              <View style={st.videoThumbOverlay}>
                <View style={st.playCircle}>
                  <Ionicons name="play" size={16} color="#fff" />
                </View>
                {item.view_count > 0 && (
                  <View style={st.viewCountBadge}>
                    <Ionicons name="eye-outline" size={10} color="rgba(255,255,255,0.85)" />
                    <Text style={st.viewCountText}>{fmtNum(item.view_count)}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <AvatarViewer visible={avatarOpen} uri={profile?.avatar_url} name={profile?.display_name || undefined} onClose={() => setAvatarOpen(false)} />
    </View>
  );
}

function PostsTab({ posts, loading, profile, colors }: { posts: UserPost[]; loading: boolean; profile: Profile | null; colors: any }) {
  if (loading) {
    return <View style={{ padding: 32, alignItems: "center" }}><ActivityIndicator color={colors.accent} /></View>;
  }
  if (posts.length === 0) {
    return (
      <View style={st.emptyWrap}>
        <Ionicons name="document-text-outline" size={44} color={colors.textMuted} />
        <Text style={[st.emptyTitle, { color: colors.text }]}>No posts yet</Text>
        <Text style={[st.emptySub, { color: colors.textMuted }]}>{profile?.display_name} hasn't shared anything yet.</Text>
      </View>
    );
  }
  return (
    <View style={[st.postsList, { backgroundColor: colors.surface }]}>
      {posts.map((p, idx) => {
        const isArticle = p.post_type === "article";
        const isVideo = p.post_type === "video" && p.video_url;
        const images = p.post_images?.length > 0 ? p.post_images.map((i: any) => i.image_url) : p.image_url ? [p.image_url] : [];

        return (
          <TouchableOpacity
            key={p.id}
            style={[st.postCard, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            onPress={() => {
              if (isArticle) router.push({ pathname: "/article/[id]", params: { id: p.id } });
              else if (isVideo) router.push({ pathname: "/video/[id]", params: { id: p.id } });
              else router.push({ pathname: "/p/[id]", params: { id: encodeId(p.id) } });
            }}
            activeOpacity={0.7}
          >
            {isArticle ? (
              <View style={[st.articleCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.accent + "20" }]}>
                {images.length > 0 && <Image source={{ uri: images[0] }} style={st.articleCover} resizeMode="cover" />}
                <View style={{ padding: 14, gap: 6 }}>
                  <View style={[st.typeBadge, { backgroundColor: colors.accent + "15" }]}>
                    <Ionicons name="document-text" size={11} color={colors.accent} />
                    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.accent }}>Article</Text>
                  </View>
                  {p.article_title ? <Text style={[st.articleTitle, { color: colors.text }]} numberOfLines={2}>{p.article_title}</Text> : null}
                  {!!p.content && <RichText style={{ color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 }} numberOfLines={2}>{p.content}</RichText>}
                </View>
              </View>
            ) : (
              <>
                {isVideo && (
                  <View style={[st.typeBadge, { backgroundColor: colors.backgroundSecondary, alignSelf: "flex-start", marginBottom: 8 }]}>
                    <Ionicons name="videocam" size={11} color={colors.textMuted} />
                    <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.textMuted }}>Video</Text>
                  </View>
                )}
                {!!p.content && <RichText style={[st.postContent, { color: colors.text }]} numberOfLines={4}>{p.content}</RichText>}
                {isVideo ? (
                  <View style={[st.postThumb, { backgroundColor: "#111", overflow: "hidden" }]}>
                    {p.image_url && <Image source={{ uri: p.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
                    <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: p.image_url ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.6)" }]}>
                      <View style={st.playCircleLg}>
                        <Ionicons name="play" size={26} color="#fff" />
                      </View>
                    </View>
                  </View>
                ) : images.length === 1 ? (
                  <Image source={{ uri: images[0] }} style={st.postThumb} resizeMode="cover" />
                ) : images.length > 1 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    {images.map((url: string, i: number) => (
                      <Image key={i} source={{ uri: url }} style={st.postThumbSm} resizeMode="cover" />
                    ))}
                  </ScrollView>
                ) : null}
              </>
            )}
            <View style={st.postMeta}>
              <Text style={[st.postTime, { color: colors.textMuted }]}>{timeAgo(p.created_at)}</Text>
              <View style={st.postStats}>
                <Ionicons name="heart-outline" size={13} color={colors.textMuted} />
                <Text style={[st.postStatNum, { color: colors.textMuted }]}>{fmtNum(p.likeCount)}</Text>
                <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} style={{ marginLeft: 10 }} />
                <Text style={[st.postStatNum, { color: colors.textMuted }]}>{fmtNum(p.replyCount)}</Text>
                {p.view_count > 0 && (
                  <>
                    <Ionicons name="eye-outline" size={13} color={colors.textMuted} style={{ marginLeft: 10 }} />
                    <Text style={[st.postStatNum, { color: colors.textMuted }]}>{fmtNum(p.view_count)}</Text>
                  </>
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },

  coverArea: { height: 100, justifyContent: "flex-start" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14 },
  circleBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  identityCard: { marginHorizontal: 14, marginTop: -36, borderRadius: 24, paddingBottom: 22, paddingHorizontal: 20, elevation: 3, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  avatarFloat: { alignItems: "center", marginTop: -44, marginBottom: 12 },
  avatarRing: { borderWidth: 3, borderRadius: 50, padding: 2 },
  onlineDot: { position: "absolute", bottom: 5, right: 5, width: 15, height: 15, borderRadius: 8, backgroundColor: "#34C759", borderWidth: 2.5, borderColor: "#fff" },

  identityBody: { alignItems: "center", gap: 5 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  displayName: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  handle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  onlineLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },

  verifiedPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16 },
  verifiedPillText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  badgeCard: { width: "100%", borderRadius: 14, padding: 14, gap: 8, marginTop: 4, borderWidth: 1 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badgeText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  bio: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21, paddingHorizontal: 6 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 4 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  metaChipText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  statsRow: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingVertical: 12, width: "100%", marginTop: 12 },
  statCell: { flex: 1, alignItems: "center" },
  statNum: { fontSize: 17, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 },
  statSep: { width: StyleSheet.hairlineWidth, height: 26 },

  ctaRow: { flexDirection: "row", gap: 8, marginTop: 14, width: "100%" },
  ctaFollow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 13 },
  ctaFollowText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  ctaMessage: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 13 },
  ctaMessageText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  ctaIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },

  pillBar: { flexDirection: "row", justifyContent: "space-around", marginHorizontal: 14, marginTop: 10, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 22 },
  pillLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  tabBar: { flexDirection: "row", marginHorizontal: 14, marginTop: 10, borderRadius: 16, borderBottomWidth: 0, overflow: "hidden", position: "relative" },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 13 },
  tabBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, minWidth: 20, alignItems: "center" },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  tabIndicator: { position: "absolute", bottom: 0, width: "33.333%", height: 2.5, borderTopLeftRadius: 2, borderTopRightRadius: 2 },

  postsList: { marginHorizontal: 14, marginTop: 10, borderRadius: 20, overflow: "hidden", marginBottom: 4 },
  postCard: { paddingVertical: 16, paddingHorizontal: 18 },
  postContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 10 },
  postThumb: { width: "100%", height: 190, borderRadius: 14, marginBottom: 10 },
  postThumbSm: { width: 130, height: 130, borderRadius: 12, marginRight: 8 },
  postMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  postTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  postStats: { flexDirection: "row", alignItems: "center", gap: 3 },
  postStatNum: { fontSize: 12, fontFamily: "Inter_500Medium" },

  articleCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 8 },
  articleCover: { width: "100%", height: 140 },
  articleTitle: { fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },

  multiImgBadge: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 6, padding: 3 },
  videoThumbOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.38)" },
  playCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  playCircleLg: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  viewCountBadge: { position: "absolute", bottom: 5, left: 5, flexDirection: "row", alignItems: "center", gap: 2 },
  viewCountText: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontFamily: "Inter_600SemiBold" },

  emptyWrap: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
