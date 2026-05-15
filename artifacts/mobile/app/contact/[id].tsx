import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useOpenLink } from "@/lib/useOpenLink";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarViewer } from "@/components/ui/AvatarViewer";
import { showAlert } from "@/lib/alert";
import { notifyNewFollow } from "@/lib/notifyUser";
import { shareProfile } from "@/lib/share";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { ProfileSkeleton, PostSkeleton } from "@/components/ui/Skeleton";
import { PrestigeBadge } from "@/components/ui/PrestigeBadge";
import { RichText } from "@/components/ui/RichText";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { encodeId } from "@/lib/shortId";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { VideoThumbnail } from "@/components/ui/VideoThumbnail";
import * as Clipboard from "expo-clipboard";
import * as Contacts from "expo-contacts";
import { getProfileCache, setProfileCache } from "@/lib/profileCache";
import { getPhonebookName } from "@/lib/storage/localContacts";

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
  const params = useLocalSearchParams<{
    id: string;
    init_name?: string;
    init_handle?: string;
    init_avatar?: string;
    init_verified?: string;
    init_org_verified?: string;
  }>();
  const { id } = params;
  const { colors } = useTheme();
  const openLink = useOpenLink();
  const { user, profile: myProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useIsDesktop();

  // Build an initial profile snapshot from route params or the in-memory cache
  // so we can render the header immediately without waiting for a network round-trip.
  const initialProfile = useMemo<Profile | null>(() => {
    if (!id) return null;
    const cached = getProfileCache(id);
    if (cached) {
      return {
        id: cached.id,
        display_name: cached.display_name,
        handle: cached.handle,
        avatar_url: cached.avatar_url ?? null,
        bio: cached.bio ?? null,
        is_verified: cached.is_verified ?? false,
        is_organization_verified: cached.is_organization_verified ?? false,
        is_business_mode: cached.is_business_mode ?? false,
        xp: cached.xp ?? 0,
        current_grade: cached.current_grade ?? "",
        website_url: cached.website_url ?? null,
        country: cached.country ?? null,
        created_at: cached.created_at ?? null,
        last_seen: cached.last_seen ?? null,
        show_online_status: cached.show_online_status ?? false,
        acoin: cached.acoin ?? 0,
      } as Profile;
    }
    if (params.init_name) {
      return {
        id: id as string,
        display_name: params.init_name,
        handle: params.init_handle ?? "",
        avatar_url: params.init_avatar ?? null,
        bio: null,
        is_verified: params.init_verified === "1",
        is_organization_verified: params.init_org_verified === "1",
        is_business_mode: false,
        xp: 0,
        current_grade: "",
        website_url: null,
        country: null,
        created_at: null,
        last_seen: null,
        show_online_status: false,
        acoin: 0,
      } as Profile;
    }
    return null;
  }, [id]);

  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [loading, setLoading] = useState(!initialProfile);
  const [phonebookName, setPhonebookName] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [theyFollowMe, setTheyFollowMe] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [mutualCount, setMutualCount] = useState(0);
  const [alsoFollowPreviews, setAlsoFollowPreviews] = useState<{ id: string; display_name: string; handle: string; avatar_url: string | null }[]>([]);
  const [alsoFollowCount, setAlsoFollowCount] = useState(0);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [hasShop, setHasShop] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("photos");
  const [lightboxPost, setLightboxPost] = useState<UserPost | null>(null);
  const [lightboxImgIdx, setLightboxImgIdx] = useState(0);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [ownedUsernames, setOwnedUsernames] = useState<string[]>([]);

  type PurchaseInfo = {
    handle: string;
    price: number | null;
    purchasedAt: string;
    sellerHandle: string | null;
  };
  const [purchasePopup, setPurchasePopup] = useState<PurchaseInfo | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  function fmtDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  async function showHandlePurchase(handle: string) {
    setPurchaseLoading(true);
    // Query both tables in parallel — listing gives price/seller, owned_usernames gives fallback date
    const [{ data: listing }, { data: owned }] = await Promise.all([
      supabase
        .from("username_listings")
        .select("price, created_at, profiles!username_listings_seller_id_fkey(handle)")
        .eq("username", handle)
        .not("sold_to_id", "is", null)
        .maybeSingle(),
      supabase
        .from("owned_usernames")
        .select("acquired_at")
        .eq("handle", handle)
        .maybeSingle(),
    ]);
    setPurchaseLoading(false);
    if (!listing && !owned) return;
    setPurchasePopup({
      handle,
      price: listing ? ((listing as any).price ?? null) : null,
      purchasedAt: listing
        ? ((listing as any).created_at ?? "")
        : ((owned as any)?.acquired_at ?? ""),
      sellerHandle: listing ? ((listing as any).profiles?.handle ?? null) : null,
    });
  }

  // Load phone-book name for this user (native only).
  useEffect(() => {
    if (!id || Platform.OS === "web") return;
    getPhonebookName(id as string).then(setPhonebookName).catch(() => {});
  }, [id]);

  // Non-logged-in users should see the public profile page, not this screen.
  // Redirect them to /@handle once we know the handle (and there's no session).
  useEffect(() => {
    if (!profile?.handle || user) return;
    router.replace(`/@${profile.handle}` as any);
  }, [profile?.handle, user]);

  // On web, replace the URL with the pretty /@handle format for logged-in users.
  useEffect(() => {
    if (!profile?.handle || !user) return;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.history.replaceState(null, "", `/@${profile.handle}`);
    }
  }, [profile?.handle, user]);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, is_business_mode, xp, current_grade, website_url, country, created_at, last_seen, show_online_status, acoin")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data as Profile);
          setProfileCache(id as string, data as any);
        }
        setLoading(false);
      });

    supabase.from("shops").select("id, pin_to_profile").eq("seller_id", id).eq("is_active", true).eq("pin_to_profile", true).maybeSingle().then(({ data }) => setHasShop(!!data));

    // Load owned usernames that are NOT the primary handle (these are marketplace purchases)
    supabase.from("owned_usernames").select("handle, is_primary").eq("owner_id", id).eq("is_primary", false).order("acquired_at", { ascending: true }).then(({ data: aliases }) => {
      if (aliases && aliases.length > 0) setOwnedUsernames(aliases.map((a: any) => a.handle));
    });

    supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", id).in("visibility", ["public", "followers"]).then(({ count }) => setPostCount(count || 0));

    if (user) {
      supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", id).maybeSingle().then(({ data }) => setIsFollowing(!!data));
      supabase.from("follows").select("id").eq("follower_id", id).eq("following_id", user.id).maybeSingle().then(({ data }) => setTheyFollowMe(!!data));
      supabase.from("blocked_users").select("id").eq("blocker_id", user.id).eq("blocked_id", id).maybeSingle().then(({ data }) => setIsBlocked(!!data));
    }
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", id).then(({ count }) => setFollowerCount(count || 0));
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", id).then(({ count }) => setFollowingCount(count || 0));
    if (user) {
      supabase.rpc("get_mutual_followers_count", { user_a: user.id, user_b: id }).then(({ data }) => setMutualCount(data || 0), () => {});

      // Fetch "people I follow who also follow this profile" for the social-proof banner
      (async () => {
        try {
          // Step 1: get up to 500 follower IDs of the target profile (excluding myself)
          const { data: profileFollowers } = await supabase
            .from("follows")
            .select("follower_id")
            .eq("following_id", id)
            .neq("follower_id", user.id)
            .limit(500);
          if (!profileFollowers || profileFollowers.length === 0) return;
          const followerIds = profileFollowers.map((f: any) => f.follower_id);
          // Step 2: from those, find who I follow, and grab their profiles
          const { data: overlap } = await supabase
            .from("follows")
            .select("following_id, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url)")
            .eq("follower_id", user.id)
            .in("following_id", followerIds)
            .limit(4);
          if (!overlap || overlap.length === 0) return;
          const previews = overlap
            .map((row: any) => row.profiles)
            .filter(Boolean)
            .slice(0, 3) as { id: string; display_name: string; handle: string; avatar_url: string | null }[];
          setAlsoFollowPreviews(previews);
          setAlsoFollowCount(overlap.length);
        } catch (_) {}
      })();
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

  async function saveToDevice() {
    if (Platform.OS === "web" || !profile) return;
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        showAlert("Permission needed", "Allow contacts access to save this person to your phone.");
        return;
      }
      await Contacts.presentContactPickerAsync();
    } catch {
      showAlert("Error", "Could not open contacts. Please try again.");
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
    setOptionsVisible(true);
  }

  function copyProfileLink() {
    const url = profile?.handle
      ? `https://afuchat.com/@${profile.handle}`
      : `https://afuchat.com/contact/${id}`;
    Clipboard.setStringAsync(url).then(() => {
      showAlert("Copied", "Profile link copied to clipboard.");
    }, () => {});
    setOptionsVisible(false);
  }

  function toggleMute() {
    setIsMuted((prev) => !prev);
    setOptionsVisible(false);
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
      {/* Show phone-book name when the user has this person saved differently */}
      {!!phonebookName && phonebookName !== profile?.display_name && (
        <Text style={[st.savedAsLabel, { color: colors.textMuted }]}>
          Saved as "{phonebookName}"
        </Text>
      )}

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
              openLink(url);
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

      {/* ── Owned usernames (marketplace purchases) ─── */}
      {ownedUsernames.length > 0 && (
        <View style={st.ownedUsernamesRow}>
          <Ionicons name="at-circle-outline" size={13} color={colors.textMuted} />
          <Text style={[st.ownedUsernamesLabel, { color: colors.textMuted }]}>Also known as:</Text>
          <View style={st.ownedUsernamesList}>
            {ownedUsernames.map((h) => (
              <TouchableOpacity
                key={h}
                style={[st.ownedUsernamePill, { backgroundColor: colors.backgroundSecondary }]}
                onPress={() => showHandlePurchase(h)}
                hitSlop={4}
              >
                {purchaseLoading ? (
                  <ActivityIndicator size={10} color={colors.textMuted} style={{ marginRight: 2 }} />
                ) : null}
                <Text style={[st.ownedUsernamePillText, { color: colors.textSecondary }]}>@{h}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── "Also followed by people you follow" social-proof banner ─── */}
      {!isOwnProfile && alsoFollowPreviews.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: alsoFollowPreviews[0].id } } as any)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginHorizontal: 16,
            marginBottom: 12,
            backgroundColor: colors.backgroundSecondary,
            borderRadius: 12,
            paddingVertical: 9,
            paddingHorizontal: 12,
          }}
        >
          {/* Overlapping mini-avatars */}
          <View style={{ flexDirection: "row", width: alsoFollowPreviews.length * 20 + 10 }}>
            {alsoFollowPreviews.map((p, i) => (
              <View
                key={p.id}
                style={{
                  position: "absolute",
                  left: i * 20,
                  zIndex: alsoFollowPreviews.length - i,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: colors.background,
                  overflow: "hidden",
                  backgroundColor: colors.border,
                }}
              >
                {p.avatar_url ? (
                  <Image source={{ uri: p.avatar_url }} style={{ width: 28, height: 28 }} />
                ) : (
                  <View style={{ width: 28, height: 28, backgroundColor: colors.accent + "33", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: colors.accent, fontSize: 11, fontFamily: "Inter_700Bold" }}>{(p.display_name || "?")[0].toUpperCase()}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
          {/* Label */}
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary, lineHeight: 17 }} numberOfLines={2}>
            {(() => {
              const names = alsoFollowPreviews.map(p => `@${p.handle || p.display_name}`);
              const extra = alsoFollowCount - alsoFollowPreviews.length;
              if (names.length === 1 && extra === 0) return `${names[0]} you follow also follows this account`;
              if (extra === 0) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} you follow also follow this account`;
              return `${names.join(", ")} and ${extra} other${extra !== 1 ? "s" : ""} you follow also follow this account`;
            })()}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* ── CTA row ─── */}
      {!isOwnProfile && (
        <View style={st.ctaRow}>
          {(() => {
            const _fs = isFollowing && theyFollowMe ? "friends" : !isFollowing && theyFollowMe ? "follow_back" : isFollowing ? "following" : "follow";
            const _bg = _fs === "follow" ? colors.accent : _fs === "follow_back" ? "#FF9500" : "transparent";
            const _bw = _fs === "following" || _fs === "friends" ? 1.5 : 0;
            const _bc = _fs === "friends" ? "#34C759" : colors.accent;
            const _tc = _fs === "follow" || _fs === "follow_back" ? "#fff" : _fs === "friends" ? "#34C759" : colors.accent;
            const _label = _fs === "follow" ? "Follow" : _fs === "follow_back" ? "Follow Back" : _fs === "following" ? "Following" : "Friends";
            const _icon: any = _fs === "follow" ? "person-add-outline" : _fs === "follow_back" ? "person-add" : _fs === "following" ? "checkmark" : "heart";
            return (
              <TouchableOpacity
                style={[st.ctaFollow, { backgroundColor: _bg, borderColor: _bc, borderWidth: _bw }]}
                onPress={toggleFollow}
                activeOpacity={0.75}
              >
                <Ionicons name={_icon} size={14} color={_tc} />
                <Text style={[st.ctaFollowText, { color: _tc }]}>{_label}</Text>
              </TouchableOpacity>
            );
          })()}

          <TouchableOpacity
            style={[st.ctaMessage, { borderColor: colors.accent }]}
            onPress={startChat}
            activeOpacity={0.75}
          >
            <Ionicons name="chatbubble-outline" size={14} color={colors.accent} />
            <Text style={[st.ctaMessageText, { color: colors.accent }]}>Message</Text>
          </TouchableOpacity>

          {Platform.OS !== "web" && (
            <TouchableOpacity
              style={[st.ctaMessage, { borderColor: colors.border }]}
              onPress={saveToDevice}
              activeOpacity={0.75}
            >
              <Ionicons name="person-add-outline" size={14} color={colors.textSecondary} />
              <Text style={[st.ctaMessageText, { color: colors.textSecondary }]}>Save</Text>
            </TouchableOpacity>
          )}

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

      <GlassHeader
        title={profile?.handle ? `@${profile.handle}` : profile?.display_name || ""}
        right={
          <TouchableOpacity onPress={showOptionsMenu} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </TouchableOpacity>
        }
      />

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
              <View style={{ padding: 12, gap: 10 }}>{[1,2,3].map(i => <PostSkeleton key={i} />)}</View>
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
          <PostsTab posts={textPosts} loading={postsLoading} profile={profile} colors={colors} isDesktop={isDesktop} />
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
              <View style={{ padding: 12, gap: 10 }}>{[1,2,3].map(i => <PostSkeleton key={i} />)}</View>
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

      {/* ── Username Purchase Details Modal ── */}
      <Modal
        visible={!!purchasePopup}
        transparent
        animationType="fade"
        onRequestClose={() => setPurchasePopup(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}
          activeOpacity={1}
          onPress={() => setPurchasePopup(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: "82%",
              backgroundColor: colors.surface,
              borderRadius: 22,
              padding: 24,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              gap: 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.text }}>Username Details</Text>
              <TouchableOpacity onPress={() => setPurchasePopup(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <View style={{ backgroundColor: colors.accent + "18", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 }}>
                <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: colors.accent }}>
                  @{purchasePopup?.handle}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
                <Ionicons name="storefront-outline" size={13} color="#34C759" />
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#34C759" }}>
                  Purchased from Marketplace
                </Text>
              </View>
            </View>

            <View style={{ gap: 12, backgroundColor: colors.backgroundSecondary, borderRadius: 14, padding: 14 }}>
              {purchasePopup?.price !== null && purchasePopup?.price !== undefined ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Ionicons name="cash-outline" size={16} color={colors.icon} />
                      <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>Price Paid</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFD60A" }}>
                      🪙 {purchasePopup.price.toLocaleString()} ACoin
                    </Text>
                  </View>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                </>
              ) : null}

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Ionicons name="calendar-outline" size={16} color={colors.icon} />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>
                    {purchasePopup?.price !== null ? "Purchased On" : "Owned Since"}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }}>
                  {purchasePopup ? fmtDate(purchasePopup.purchasedAt) : "—"}
                </Text>
              </View>

              {purchasePopup?.sellerHandle ? (
                <>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Ionicons name="person-outline" size={16} color={colors.icon} />
                      <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>Sold By</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }}>
                      @{purchasePopup.sellerHandle}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>

            <TouchableOpacity
              onPress={() => setPurchasePopup(null)}
              style={{ backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Options bottom sheet ── */}
      <Modal
        visible={optionsVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setOptionsVisible(false)}
      >
        <TouchableOpacity
          style={st.optionsBackdrop}
          activeOpacity={1}
          onPress={() => setOptionsVisible(false)}
        />
        <View style={[st.optionsSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 8 }]}>
          {/* Handle bar */}
          <View style={[st.optionsHandle, { backgroundColor: colors.border }]} />

          {/* Profile pill at top */}
          <View style={[st.optionsProfilePill, { borderBottomColor: colors.border }]}>
            <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={[st.optionsPillName, { color: colors.text }]} numberOfLines={1}>{profile?.display_name}</Text>
              {profile?.handle ? <Text style={[st.optionsPillHandle, { color: colors.textMuted }]} numberOfLines={1}>@{profile.handle}</Text> : null}
            </View>
          </View>

          {/* Option rows */}
          {profile?.handle ? (
            <TouchableOpacity
              style={[st.optionRow, { borderBottomColor: colors.border }]}
              onPress={() => {
                setOptionsVisible(false);
                shareProfile({ handle: profile.handle, displayName: profile.display_name, bio: profile.bio });
              }}
              activeOpacity={0.65}
            >
              <View style={[st.optionIconWrap, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="share-social-outline" size={19} color={colors.text} />
              </View>
              <Text style={[st.optionLabel, { color: colors.text }]}>Share Profile</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[st.optionRow, { borderBottomColor: colors.border }]}
            onPress={copyProfileLink}
            activeOpacity={0.65}
          >
            <View style={[st.optionIconWrap, { backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="link-outline" size={19} color={colors.text} />
            </View>
            <Text style={[st.optionLabel, { color: colors.text }]}>Copy Profile Link</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {!isOwnProfile && (
            <TouchableOpacity
              style={[st.optionRow, { borderBottomColor: colors.border }]}
              onPress={() => { setOptionsVisible(false); startChat(); }}
              activeOpacity={0.65}
            >
              <View style={[st.optionIconWrap, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="chatbubble-outline" size={19} color={colors.text} />
              </View>
              <Text style={[st.optionLabel, { color: colors.text }]}>Message</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {hasShop && (
            <TouchableOpacity
              style={[st.optionRow, { borderBottomColor: colors.border }]}
              onPress={() => { setOptionsVisible(false); router.push({ pathname: "/shop/[userId]", params: { userId: profile?.id || "" } }); }}
              activeOpacity={0.65}
            >
              <View style={[st.optionIconWrap, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="storefront-outline" size={19} color={colors.text} />
              </View>
              <Text style={[st.optionLabel, { color: colors.text }]}>View Store</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {!isOwnProfile && (
            <TouchableOpacity
              style={[st.optionRow, { borderBottomColor: colors.border }]}
              onPress={toggleMute}
              activeOpacity={0.65}
            >
              <View style={[st.optionIconWrap, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name={isMuted ? "notifications-outline" : "notifications-off-outline"} size={19} color={colors.text} />
              </View>
              <Text style={[st.optionLabel, { color: colors.text }]}>{isMuted ? "Unmute Notifications" : "Mute Notifications"}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {!isOwnProfile && isFollowing && (
            <TouchableOpacity
              style={[st.optionRow, { borderBottomColor: colors.border }]}
              onPress={() => {
                setOptionsVisible(false);
                router.push({ pathname: "/contact/[id]", params: { id } });
              }}
              activeOpacity={0.65}
            >
              <View style={[st.optionIconWrap, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="people-outline" size={19} color={colors.text} />
              </View>
              <Text style={[st.optionLabel, { color: colors.text }]}>View Mutual Followers</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {!isOwnProfile && (
            <TouchableOpacity
              style={[st.optionRow, { borderBottomColor: colors.border }]}
              onPress={() => { setOptionsVisible(false); toggleBlock(); }}
              activeOpacity={0.65}
            >
              <View style={[st.optionIconWrap, { backgroundColor: isBlocked ? "#FEE2E2" : colors.backgroundSecondary }]}>
                <Ionicons name={isBlocked ? "checkmark-circle-outline" : "ban-outline"} size={19} color={isBlocked ? "#EF4444" : "#EF4444"} />
              </View>
              <Text style={[st.optionLabel, { color: "#EF4444" }]}>{isBlocked ? "Unblock" : "Block"}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {!isOwnProfile && (
            <TouchableOpacity
              style={[st.optionRow, { borderBottomColor: colors.border }]}
              onPress={() => { setOptionsVisible(false); reportUser(); }}
              activeOpacity={0.65}
            >
              <View style={[st.optionIconWrap, { backgroundColor: "#F59E0B20" }]}>
                <Ionicons name="flag-outline" size={19} color="#F59E0B" />
              </View>
              <Text style={[st.optionLabel, { color: "#F59E0B" }]}>Report</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {/* Cancel pill */}
          <TouchableOpacity
            style={[st.optionsCancelBtn, { backgroundColor: colors.backgroundSecondary }]}
            onPress={() => setOptionsVisible(false)}
            activeOpacity={0.7}
          >
            <Text style={[st.optionsCancelText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

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

function PostsTab({ posts, loading, profile, colors, isDesktop }: { posts: UserPost[]; loading: boolean; profile: Profile | null; colors: any; isDesktop: boolean }) {
  if (loading) {
    return <View style={{ padding: 12, gap: 10 }}>{[1,2,3,4].map(i => <PostSkeleton key={i} />)}</View>;
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
  avatarRing: { borderRadius: 50 },
  onlineDot: { position: "absolute", bottom: 4, right: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: "#22C55E", borderWidth: 2 },

  statsBlock: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
  statCell: { alignItems: "center", gap: 2 },
  statNum: { fontSize: 19, fontWeight: "800" },
  statLabel: { fontSize: 11 },

  nameBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, marginBottom: 3 },
  displayName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  savedAsLabel: { fontSize: 12, fontFamily: "Inter_400Regular", paddingHorizontal: 16, marginBottom: 4 },

  bio: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, paddingHorizontal: 16, marginBottom: 6 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaChipText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  ownedUsernamesRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, paddingHorizontal: 16, marginBottom: 10 },
  ownedUsernamesLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  ownedUsernamesList: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  ownedUsernamePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  ownedUsernamePillText: { fontSize: 11, fontFamily: "Inter_500Medium" },

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

  optionsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  optionsSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    ...Platform.select({
      web: { boxShadow: "0 -3px 12px rgba(0,0,0,0.12)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 16 },
    }),
  },
  optionsHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  optionsProfilePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  optionsPillName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  optionsPillHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },

  optionsCancelBtn: {
    marginHorizontal: 18,
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  optionsCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
