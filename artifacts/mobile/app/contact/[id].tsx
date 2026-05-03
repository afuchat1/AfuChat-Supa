import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
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
import { showAlert } from "@/lib/alert";
import { notifyNewFollow } from "@/lib/notifyUser";
import { shareProfile } from "@/lib/share";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import { PrestigeBadge } from "@/components/ui/PrestigeBadge";
import { RichText } from "@/components/ui/RichText";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { encodeId } from "@/lib/shortId";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { VideoThumbnail } from "@/components/ui/VideoThumbnail";

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_GAP = 6;
const GRID_PADDING = 12;
const GRID_COLS = 3;
const THUMB = (SCREEN_W - GRID_GAP * (GRID_COLS - 1) - GRID_PADDING * 2) / GRID_COLS;
const THUMB_RADIUS = 10;

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

type TabKey = "photos" | "posts" | "videos";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtJoinDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function ContactProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user, profile: myProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useIsDesktop();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [mutualCount, setMutualCount] = useState(0);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [hasShop, setHasShop] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("photos");
  const [lightboxPost, setLightboxPost] = useState<UserPost | null>(null);
  const [lightboxImgIdx, setLightboxImgIdx] = useState(0);

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

    supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", id).in("visibility", ["public", "followers"]).then(({ count }) => setPostCount(count || 0));

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

  function toggleBlock() {
    if (!user || !id) return;
    if (isBlocked) {
      supabase.from("blocked_users").delete().eq("blocker_id", user.id).eq("blocked_id", id).then(() => setIsBlocked(false));
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

  function showOptionsMenu() {
    const options: any[] = [];
    if (profile?.handle) {
      options.push({ text: "Share Profile", onPress: () => shareProfile({ handle: profile.handle, displayName: profile.display_name, bio: profile.bio }) });
    }
    if (!isOwnProfile) {
      options.push({ text: isBlocked ? "Unblock" : "Block", style: isBlocked ? "default" : "destructive", onPress: toggleBlock });
      options.push({ text: "Report", style: "destructive", onPress: reportUser });
    }
    if (hasShop) {
      options.push({ text: "View Store", onPress: () => router.push({ pathname: "/shop/[userId]", params: { userId: profile?.id || "" } }) });
    }
    options.push({ text: "Cancel", style: "cancel" });
    showAlert("Options", undefined, options);
  }

  if (loading) {
    return <View style={[st.root, { backgroundColor: colors.background }]}><ProfileSkeleton /></View>;
  }

  const isOwnProfile = user?.id === id;

  const isOnline = (() => {
    if (!profile?.show_online_status || !profile?.last_seen) return false;
    return Date.now() - new Date(profile.last_seen).getTime() < 2 * 60 * 1000;
  })();

  const xpPct = Math.min(0.96, ((profile?.xp || 0) % 1000) / 1000);

  const photoPosts = posts.filter((p) => {
    const imgs = p.post_images?.length > 0 ? p.post_images : p.image_url ? [{ image_url: p.image_url }] : [];
    return imgs.length > 0 && p.post_type !== "video";
  });
  const videoPosts = posts.filter((p) => p.post_type === "video" && p.video_url);
  const textPosts = posts.filter((p) => p.post_type !== "video" || !p.video_url);

  const TABS: { key: TabKey; icon: string }[] = [
    { key: "photos", icon: "grid-outline" },
    { key: "posts", icon: "document-text-outline" },
    { key: "videos", icon: "film-outline" },
  ];

  const profileHeader = (
    <View style={{ backgroundColor: colors.background }}>
      {/* ── Avatar row + stats ─── */}
      <View style={st.avatarStatsRow}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => setAvatarOpen(true)} style={st.avatarWrap}>
          <View style={[st.avatarRing, { borderColor: colors.text, borderRadius: (profile?.is_organization_verified || profile?.is_business_mode) ? 20 : 50 }]}>
            <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={78} square={!!(profile?.is_organization_verified || profile?.is_business_mode)} />
          </View>
          {isOnline && <View style={[st.onlineDot, { borderColor: colors.background }]} />}
        </TouchableOpacity>

        <View style={st.statsBlock}>
          <TouchableOpacity style={st.statCell} activeOpacity={0.6}>
            <Text style={[st.statNum, { color: colors.text }]}>{fmtNum(postCount)}</Text>
            <Text style={[st.statLabel, { color: colors.textSecondary }]}>Posts</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.statCell} activeOpacity={0.6} onPress={() => router.push({ pathname: "/followers", params: { userId: id, type: "followers", ownerHandle: profile?.handle } })}>
            <Text style={[st.statNum, { color: colors.text }]}>{fmtNum(followerCount)}</Text>
            <Text style={[st.statLabel, { color: colors.textSecondary }]}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.statCell} activeOpacity={0.6} onPress={() => router.push({ pathname: "/followers", params: { userId: id, type: "following", ownerHandle: profile?.handle } })}>
            <Text style={[st.statNum, { color: colors.text }]}>{fmtNum(followingCount)}</Text>
            <Text style={[st.statLabel, { color: colors.textSecondary }]}>Following</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Name + badges ─── */}
      <View style={st.nameBadgeRow}>
        <Text style={[st.displayName, { color: colors.text, flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">{profile?.display_name}</Text>
        <VerifiedBadge isVerified={profile?.is_verified} isOrganizationVerified={profile?.is_organization_verified} size={16} />
        <PrestigeBadge acoin={profile?.acoin || 0} size="sm" showLabel />
      </View>

      {/* ── Bio ─── */}
      {!!profile?.bio && (
        <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
          <ExpandableText
            text={profile.bio}
            translate
            maxLines={3}
            style={{ fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, color: colors.textSecondary }}
          />
        </View>
      )}

      {/* ── Meta chips ─── */}
      <View style={st.metaRow}>
        {profile?.created_at && (
          <View style={st.metaChip}>
            <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
            <Text style={[st.metaChipText, { color: colors.textMuted }]}>Joined {fmtJoinDate(profile.created_at)}</Text>
          </View>
        )}
        {profile?.country && (
          <View style={st.metaChip}>
            <Ionicons name="location-outline" size={11} color={colors.textMuted} />
            <Text style={[st.metaChipText, { color: colors.textMuted }]}>{profile.country}</Text>
          </View>
        )}
        {profile?.website_url && (
          <TouchableOpacity
            style={st.metaChip}
            activeOpacity={0.65}
            onPress={() => {
              const url = profile.website_url!.startsWith("http")
                ? profile.website_url!
                : `https://${profile.website_url}`;
              Linking.openURL(url).catch(() => {});
            }}
          >
            <Ionicons name="link-outline" size={11} color={colors.accent} />
            <Text style={[st.metaChipText, { color: colors.accent, textDecorationLine: "underline" }]} numberOfLines={1}>
              {profile.website_url.replace(/^https?:\/\//, "")}
            </Text>
          </TouchableOpacity>
        )}
        {mutualCount > 0 && (
          <View style={st.metaChip}>
            <Ionicons name="people-outline" size={11} color={colors.textMuted} />
            <Text style={[st.metaChipText, { color: colors.textMuted }]}>{mutualCount} mutual</Text>
          </View>
        )}
      </View>

      {/* ── CTA row ─── */}
      {!isOwnProfile && (
        <View style={st.ctaRow}>
          <TouchableOpacity
            style={[st.ctaFollow, { backgroundColor: isFollowing ? "transparent" : colors.accent, borderColor: colors.accent, borderWidth: isFollowing ? 1.5 : 0 }]}
            onPress={toggleFollow}
            activeOpacity={0.75}
          >
            <Ionicons name={isFollowing ? "checkmark" : "person-add-outline"} size={14} color={isFollowing ? colors.accent : "#fff"} />
            <Text style={[st.ctaFollowText, { color: isFollowing ? colors.accent : "#fff" }]}>
              {isFollowing ? "Following" : "Follow"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.ctaMessage, { borderColor: colors.accent }]}
            onPress={startChat}
            activeOpacity={0.75}
          >
            <Ionicons name="chatbubble-outline" size={14} color={colors.accent} />
            <Text style={[st.ctaMessageText, { color: colors.accent }]}>Message</Text>
          </TouchableOpacity>

        </View>
      )}

      {/* ── XP strip ─── */}
      <View style={[st.xpStrip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
        <Ionicons name="flash" size={13} color="#F59E0B" />
        <Text style={[st.xpLabel, { color: colors.text }]}>
          {profile?.current_grade || "Nexa"} · {fmtNum(profile?.xp || 0)} XP
        </Text>
        <View style={[st.xpTrack, { backgroundColor: colors.border }]}>
          <View style={[st.xpFill, { width: `${Math.round(xpPct * 100)}%` as any }]} />
        </View>
        <Text style={[st.xpPct, { color: colors.textMuted }]}>{Math.round(xpPct * 100)}%</Text>
      </View>

      {/* ── Tab bar ─── */}
      <View style={[st.tabBar, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[
                st.tabBtn,
                active
                  ? { borderTopColor: colors.accent, borderTopWidth: 1.5 }
                  : { backgroundColor: colors.accent, borderTopLeftRadius: 33, borderBottomRightRadius: 33 },
              ]}
              onPress={() => setActiveTab(t.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={t.icon as any}
                size={21}
                color={active ? colors.accent : "rgba(255,255,255,0.9)"}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>

      {/* ── Fixed nav bar ─── */}
      <View style={[st.navBar, { paddingTop: insets.top, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={st.navBtn} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <Text style={[st.navTitle, { color: colors.text }]} numberOfLines={1}>
          {profile?.handle ? `@${profile.handle}` : profile?.display_name || ""}
        </Text>

        <TouchableOpacity style={st.navBtn} onPress={showOptionsMenu} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── Photos tab (default) ─── */}
      {activeTab === "photos" && (
        <FlatList
          ListHeaderComponent={profileHeader}
          data={photoPosts}
          keyExtractor={(p) => p.id}
          numColumns={GRID_COLS}
          columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: GRID_PADDING }}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: GRID_GAP }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            postsLoading ? (
              <View style={st.emptyWrap}><ActivityIndicator color={colors.accent} /></View>
            ) : (
              <View style={st.emptyWrap}>
                <Ionicons name="images-outline" size={44} color={colors.textMuted} />
                <Text style={[st.emptyTitle, { color: colors.text }]}>No photos yet</Text>
                <Text style={[st.emptySub, { color: colors.textMuted }]}>
                  {profile?.display_name} hasn't shared any photos.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const imgs = item.post_images?.length > 0
              ? item.post_images.map((i: any) => i.image_url)
              : item.image_url ? [item.image_url] : [];
            return (
              <TouchableOpacity
                style={{ width: THUMB, height: THUMB, borderRadius: THUMB_RADIUS, overflow: "hidden" }}
                onPress={() => { setLightboxPost(item); setLightboxImgIdx(0); }}
                activeOpacity={0.82}
              >
                <Image source={{ uri: imgs[0] }} style={{ width: THUMB, height: THUMB }} resizeMode="cover" />
                {imgs.length > 1 && (
                  <View style={st.multiImgBadge}>
                    <Ionicons name="copy-outline" size={11} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── Posts tab ─── */}
      {activeTab === "posts" && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {profileHeader}
          <PostsTab posts={textPosts} loading={postsLoading} profile={profile} colors={colors} />
        </ScrollView>
      )}

      {/* ── Videos tab ─── */}
      {activeTab === "videos" && (
        <FlatList
          ListHeaderComponent={profileHeader}
          data={videoPosts}
          keyExtractor={(p) => p.id}
          numColumns={GRID_COLS}
          columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: GRID_PADDING }}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: GRID_GAP }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            postsLoading ? (
              <View style={st.emptyWrap}><ActivityIndicator color={colors.accent} /></View>
            ) : (
              <View style={st.emptyWrap}>
                <Ionicons name="film-outline" size={44} color={colors.textMuted} />
                <Text style={[st.emptyTitle, { color: colors.text }]}>No videos yet</Text>
                <Text style={[st.emptySub, { color: colors.textMuted }]}>
                  {profile?.display_name} hasn't posted any videos.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ width: THUMB, height: THUMB * 1.35, backgroundColor: "#111", borderRadius: THUMB_RADIUS, overflow: "hidden" }}
              onPress={() => router.push({ pathname: "/video/[id]", params: { id: item.id } })}
              activeOpacity={0.82}
            >
              <VideoThumbnail
                videoUrl={item.video_url!}
                fallbackImageUrl={item.image_url}
                style={{ width: THUMB, height: THUMB * 1.35 }}
                showDuration={false}
              />
              <View style={st.videoOverlay}>
                <View style={st.playCircle}>
                  <Ionicons name="play" size={14} color="#fff" />
                </View>
              </View>
              {item.view_count > 0 && (
                <View style={st.viewBadge}>
                  <Ionicons name="eye-outline" size={9} color="rgba(255,255,255,0.85)" />
                  <Text style={st.viewBadgeText}>{fmtNum(item.view_count)}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      <AvatarViewer visible={avatarOpen} uri={profile?.avatar_url} name={profile?.display_name || undefined} onClose={() => setAvatarOpen(false)} />

      {/* ── Image lightbox ── */}
      <Modal
        visible={!!lightboxPost}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLightboxPost(null)}
      >
        {(() => {
          if (!lightboxPost) return null;
          const lbImgs = lightboxPost.post_images?.length > 0
            ? lightboxPost.post_images.map((i: any) => i.image_url)
            : lightboxPost.image_url ? [lightboxPost.image_url] : [];
          const hasText = !!lightboxPost.content?.trim();
          return (
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.96)" }}>
              {/* Top bar */}
              <View style={[st.lbTopBar, { paddingTop: insets.top + 8 }]}>
                {lbImgs.length > 1 ? (
                  <Text style={st.lbCounter}>{lightboxImgIdx + 1} / {lbImgs.length}</Text>
                ) : <View />}
                <TouchableOpacity onPress={() => setLightboxPost(null)} style={st.lbCloseBtn} hitSlop={10}>
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Image(s) */}
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                onMomentumScrollEnd={(e) =>
                  setLightboxImgIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
                }
                scrollEnabled={lbImgs.length > 1}
              >
                {lbImgs.map((uri: string, i: number) => (
                  <View key={i} style={{ width: SCREEN_W, flex: 1, justifyContent: "center" }}>
                    <Image
                      source={{ uri }}
                      style={{ width: SCREEN_W, height: SCREEN_W * 1.25 }}
                      resizeMode="contain"
                    />
                  </View>
                ))}
              </ScrollView>

              {/* Dot indicators */}
              {lbImgs.length > 1 && (
                <View style={st.lbDots}>
                  {lbImgs.map((_: string, i: number) => (
                    <View
                      key={i}
                      style={[st.lbDot, { backgroundColor: i === lightboxImgIdx ? "#fff" : "rgba(255,255,255,0.3)" }]}
                    />
                  ))}
                </View>
              )}

              {/* Caption + actions */}
              <View style={[st.lbFooter, { paddingBottom: insets.bottom + 16 }]}>
                {hasText && (
                  <Text style={st.lbCaption} numberOfLines={3}>{lightboxPost.content}</Text>
                )}
                <TouchableOpacity
                  style={st.lbViewBtn}
                  activeOpacity={0.75}
                  onPress={() => {
                    setLightboxPost(null);
                    router.push({ pathname: "/p/[id]", params: { id: encodeId(lightboxPost.id) } });
                  }}
                >
                  <Ionicons name="expand-outline" size={14} color="rgba(255,255,255,0.6)" />
                  <Text style={st.lbViewBtnText}>View full post</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}
      </Modal>
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
        <Text style={[st.emptySub, { color: colors.textMuted }]}>
          {profile?.display_name} hasn't shared anything yet.
        </Text>
      </View>
    );
  }
  return (
    <View>
      {posts.map((p, idx) => {
        const isArticle = p.post_type === "article";
        const isVideo = p.post_type === "video" && p.video_url;
        const images = p.post_images?.length > 0
          ? p.post_images.map((i: any) => i.image_url)
          : p.image_url ? [p.image_url] : [];

        return (
          <TouchableOpacity
            key={p.id}
            style={[
              st.postCard,
              { borderBottomColor: colors.border },
              idx === 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            ]}
            onPress={() => {
              if (isArticle) router.push({ pathname: "/article/[id]", params: { id: p.id } });
              else if (isVideo) { if (!isDesktop) router.push({ pathname: "/video/[id]", params: { id: p.id } }); }
              else router.push({ pathname: "/p/[id]", params: { id: encodeId(p.id) } });
            }}
            activeOpacity={0.75}
          >
            <View style={st.postInner}>
              <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={34} square={!!(profile?.is_organization_verified || profile?.is_business_mode)} />
              <View style={st.postBody}>
                <View style={st.postHeader}>
                  <Text style={[st.postName, { color: colors.text }]}>{profile?.display_name}</Text>
                  <Text style={[st.postTime, { color: colors.textMuted }]}>· {timeAgo(p.created_at)}</Text>
                </View>
                {isArticle && p.article_title && (
                  <Text style={[st.articleTitle, { color: colors.text }]} numberOfLines={2}>{p.article_title}</Text>
                )}
                {!!p.content && (
                  <RichText style={[st.postContent, { color: colors.textSecondary }]} numberOfLines={4}>{p.content}</RichText>
                )}
                {images.length > 0 && (
                  <Image source={{ uri: images[0] }} style={[st.postThumb, { borderColor: colors.border }]} resizeMode="cover" />
                )}
                {isVideo && !images.length && (
                  <View style={[st.postThumb, { backgroundColor: "#111", alignItems: "center", justifyContent: "center" }]}>
                    <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.7)" />
                  </View>
                )}
                <View style={st.postMeta}>
                  <Ionicons name="heart-outline" size={13} color={colors.textMuted} />
                  <Text style={[st.postStatNum, { color: colors.textMuted }]}>{fmtNum(p.likeCount)}</Text>
                  <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} style={{ marginLeft: 12 }} />
                  <Text style={[st.postStatNum, { color: colors.textMuted }]}>{fmtNum(p.replyCount)}</Text>
                </View>
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

  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  navTitle: { flex: 1, textAlign: "center", fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },

  avatarStatsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 16 },
  avatarWrap: { position: "relative" },
  avatarRing: { borderRadius: 50, borderWidth: 2, padding: 2 },
  onlineDot: { position: "absolute", bottom: 4, right: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: "#22C55E", borderWidth: 2 },

  statsBlock: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
  statCell: { alignItems: "center", gap: 2 },
  statNum: { fontSize: 19, fontWeight: "800" },
  statLabel: { fontSize: 11 },

  nameBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, marginBottom: 3 },
  displayName: { fontSize: 15, fontFamily: "Inter_700Bold" },

  bio: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, paddingHorizontal: 16, marginBottom: 6 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaChipText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  ctaRow: { flexDirection: "row", gap: 7, paddingHorizontal: 16, marginBottom: 12 },
  ctaFollow: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 9, borderRadius: 10,
  },
  ctaFollowText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  ctaMessage: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5,
  },
  ctaMessageText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  ctaIcon: {
    width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.5,
  },

  xpStrip: {
    flexDirection: "row", alignItems: "center", gap: 7,
    marginHorizontal: 16, marginBottom: 4,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1,
  },
  xpLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  xpTrack: { flex: 1, height: 5, borderRadius: 99, overflow: "hidden" },
  xpFill: { height: "100%", backgroundColor: "#F59E0B", borderRadius: 99 },
  xpPct: { fontSize: 11, fontFamily: "Inter_500Medium", minWidth: 28, textAlign: "right" },

  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center",
    borderTopWidth: 0, borderTopColor: "transparent",
  },
  tabBtnInactive: {
    backgroundColor: "#00c2cb",
    borderBottomRightRadius: 33,
    borderTopLeftRadius: 33,
  },

  videoOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.3)" },
  playCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  viewBadge: { position: "absolute", bottom: 5, left: 5, flexDirection: "row", alignItems: "center", gap: 2 },
  viewBadgeText: { color: "rgba(255,255,255,0.85)", fontSize: 9, fontFamily: "Inter_600SemiBold" },
  multiImgBadge: { position: "absolute", top: 5, right: 5, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 5, padding: 3 },

  postCard: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14, paddingHorizontal: 16 },
  postInner: { flexDirection: "row", gap: 10 },
  postBody: { flex: 1, gap: 4 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 3 },
  postName: { fontSize: 13, fontFamily: "Inter_700Bold" },
  postTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  articleTitle: { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 20 },
  postContent: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  postThumb: { width: "100%", height: 160, borderRadius: 12, marginTop: 6, borderWidth: StyleSheet.hairlineWidth },
  postMeta: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 3 },
  postStatNum: { fontSize: 12, fontFamily: "Inter_500Medium" },

  emptyWrap: { alignItems: "center", paddingVertical: 52, paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  lbTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  lbCounter: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "500" },
  lbCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  lbDots: { flexDirection: "row", justifyContent: "center", gap: 5, paddingVertical: 10 },
  lbDot: { width: 6, height: 6, borderRadius: 3 },
  lbFooter: { paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  lbCaption: { color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 20 },
  lbViewBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  lbViewBtnText: { color: "rgba(255,255,255,0.45)", fontSize: 13 },
});
