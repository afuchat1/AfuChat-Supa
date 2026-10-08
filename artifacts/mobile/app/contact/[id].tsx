import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import {
  getAfuChatContactProfile,
  getAfuChatFollowRecords,
  getAfuChatFollowStatuses,
  getAfuChatFollowSummary,
  getAfuChatProfilePosts,
  setAfuChatFollow,
  type AfuChatContactProfile,
} from "@/lib/afuchatApi";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import RoyaltyBadge from "@/components/ui/RoyaltyBadge";
import { ProfileNotFoundView } from "@/app/profile-not-found";
import { ProfilePrivateView } from "@/app/profile-private";
import { ContactProfileSkeleton } from "@/components/ui/Skeleton";
import { getProfileCache, setProfileCache } from "@/lib/profileCache";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { showAlert } from "@/lib/alert";
import { showToast } from "@/lib/toast";
import * as Haptics from "@/lib/haptics";
import { getPrestigeTier } from "@/lib/prestige";
import { LinearGradient } from "@/components/ui/SafeGradient";

// ─── Types ────────────────────────────────────────────────────────────────────

type FullProfile = AfuChatContactProfile;

type Counts = { followers: number; following: number; posts: number };
type GridPost = { id: string; image_url: string | null; article_cover_url: string | null; video_url: string | null; post_type: string | null; content?: string | null; article_title?: string | null };
type MutualUser = { id: string; handle: string; avatar_url: string | null };
type ExpandUser = { id: string; display_name: string; handle: string; avatar_url: string | null; bio: string | null; is_verified: boolean; is_organization_verified: boolean; acoin: number };
type TabId = "posts" | "articles" | "videos";

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get("window");
const BANNER_H   = 100;
const AVATAR_SIZE = 80;
const AVATAR_OFFSET = 16; // how far avatar sticks below banner
const CELL = Math.floor((SW - 3) / 3);

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

const XP_GRADES: { name: string; min: number; max: number; color: string }[] = [
  { name: "Rookie",   min: 0,         max: 500,       color: "#8E8E93" },
  { name: "Starter",  min: 500,       max: 2_000,     color: "#34C759" },
  { name: "Active",   min: 2_000,     max: 8_000,     color: "#007AFF" },
  { name: "Achiever", min: 8_000,     max: 25_000,    color: "#5856D6" },
  { name: "Rising",   min: 25_000,    max: 75_000,    color: "#FF9500" },
  { name: "Elite",    min: 75_000,    max: 200_000,   color: "#FF3B30" },
  { name: "Expert",   min: 200_000,   max: 500_000,   color: "#AF52DE" },
  { name: "Master",   min: 500_000,   max: 1_000_000, color: "#D4A853" },
  { name: "Legend",   min: 1_000_000, max: 2_500_000, color: "#FF9500" },
  { name: "Mythic",   min: 2_500_000, max: Infinity,  color: "#FF2D55" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function joinedLabel(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function xpInfo(xp: number, gradeName: string | null) {
  const g = XP_GRADES.find(g => g.name === gradeName) ?? XP_GRADES[0];
  const progress = g.max === Infinity ? 1 : Math.min(1, Math.max(0, (xp - g.min) / (g.max - g.min)));
  return { grade: g, progress, pct: Math.round(progress * 100) };
}

function lastSeenLabel(ts: string | null, showOnline: boolean) {
  if (!showOnline || !ts) return { text: "", online: false };
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 2 * 60_000)  return { text: "Online now", online: true };
  if (ms < 3_600_000)   return { text: "last seen recently", online: false };
  if (ms < 86_400_000)  return { text: `last seen ${Math.floor(ms / 3_600_000)}h ago`, online: false };
  return { text: `last seen ${Math.floor(ms / 86_400_000)}d ago`, online: false };
}

function hex2rgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ContactScreen() {
  const { id, init_handle } = useLocalSearchParams<{
    id: string; init_name?: string; init_handle?: string;
    init_avatar?: string; init_verified?: string; init_org_verified?: string;
  }>();
  const { colors, accent, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isSelf = user?.id === id;

  // ── State ─────────────────────────────────────────────────────────────────
  const cached = id ? getProfileCache(id) : null;
  const [profile,       setProfile]       = useState<FullProfile | null>(cached as FullProfile | null);
  const [counts,        setCounts]        = useState<Counts>({ followers: 0, following: 0, posts: 0 });
  const [loading,       setLoading]       = useState(true);
  const [notFound,      setNotFound]      = useState(false);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [loadAttempt,   setLoadAttempt]   = useState(0);
  const [isFollowing,   setIsFollowing]   = useState(false);
  const [theyFollowMe,  setTheyFollowMe]  = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [aliases,       setAliases]       = useState<string[]>([]);
  const [mutuals,         setMutuals]         = useState<MutualUser[]>([]);
  const [mutualTotal,     setMutualTotal]     = useState(0);
  const [mutualDismissed, setMutualDismissed] = useState(false);
  const [mutualExpanded,  setMutualExpanded]  = useState(false);
  const [allGridPosts,  setAllGridPosts]  = useState<GridPost[]>([]);
  const [gridLoading,   setGridLoading]   = useState(false);
  const [activeTab,         setActiveTab]         = useState<TabId>("posts");
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [expandedStat,      setExpandedStat]      = useState<"followers" | "following" | null>(null);
  const [expandedUsers,     setExpandedUsers]     = useState<ExpandUser[]>([]);
  const [expandedLoading,   setExpandedLoading]   = useState(false);
  const [expandedFollowIds, setExpandedFollowIds] = useState<Set<string>>(new Set());
  const [expandedToggling,  setExpandedToggling]  = useState<string | null>(null);

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setNotFound(false);
    setLoadError(null);
    setGridLoading(true);
    (async () => {
      const [profileResult, followResult] = await Promise.all([
        getAfuChatContactProfile(id),
        user ? getAfuChatFollowSummary(id) : Promise.resolve({ data: null, error: null }),
      ]);
      if (!profileResult.data) {
        setProfile(null);
        setNotFound(profileResult.error?.code === "404");
        setLoadError(profileResult.error?.code === "404"
          ? null
          : profileResult.error?.message ?? "This profile could not be loaded.");
        setLoading(false);
        setGridLoading(false);
        return;
      }
      if (user && (followResult.error || !followResult.data)) {
        setProfile(null);
        setLoadError(followResult.error?.message ?? "Follow status could not be loaded.");
        setLoading(false);
        setGridLoading(false);
        return;
      }

      const p = profileResult.data;
      const following = followResult.data?.is_following ?? false;
      setProfile(p); setProfileCache(p.id, p as any);
      setCounts({
        followers: followResult.data?.followers_count ?? 0,
        following: followResult.data?.following_count ?? 0,
        posts: 0,
      });
      setIsFollowing(following);
      setTheyFollowMe(followResult.data?.follows_you ?? false);

      if (p.is_private && !isSelf && !following) {
        setAllGridPosts([]);
        setGridLoading(false);
        setLoading(false);
        return;
      }

      const postResult = user
        ? await getAfuChatProfilePosts(id, 90)
        : { data: null, totalCount: null, error: null };
      setCounts((current) => ({ ...current, posts: postResult.totalCount ?? 0 }));
      setAllGridPosts((postResult.data ?? []) as unknown as GridPost[]);
      setGridLoading(false);
      setLoading(false);
    })().catch(() => {
      setProfile(null);
      setNotFound(false);
      setLoadError("This profile could not be loaded right now.");
      setLoading(false);
      setGridLoading(false);
    });
  }, [id, user?.id, loadAttempt]);

  // ── Load aliases + mutuals ────────────────────────────────────────────────
  useEffect(() => {
    if (!id || loading) return;
    setMutualExpanded(false);
    (async () => {
      const dismissed = await AsyncStorage.getItem(`afu_mutuals_dismissed_${id}`).catch(() => null);
      setMutualDismissed(dismissed === "1");

      const { data: aliasData } = await supabase.from("owned_usernames")
        .select("handle").eq("owner_id", id).limit(8);
      setAliases((aliasData ?? []).map((a: any) => a.handle).filter((h: string) => h !== profile?.handle));
      if (user && !isSelf) {
        const list: MutualUser[] = [];
        let offset = 0;
        let pageCount = 0;
        while (list.length < 10 && pageCount < 10) {
          const page = await getAfuChatFollowRecords(id, "followers", 100, offset);
          if (page.error || page.hidden || !page.items?.length) break;
          const statuses = await getAfuChatFollowStatuses(page.items.map((item) => item.profile.id));
          if (statuses.error || !statuses.data) break;
          for (const item of page.items) {
            if (!statuses.data.get(item.profile.id)?.isFollowing) continue;
            const profile = item.profile;
            if (!profile.handle) continue;
            list.push({
              id: profile.id,
              handle: profile.handle,
              avatar_url: profile.avatar_url ?? null,
            });
            if (list.length >= 10) break;
          }
          pageCount += 1;
          if (list.length >= 10 || page.nextOffset === null) break;
          offset = page.nextOffset;
        }
        setMutuals(list);
        setMutualTotal(list.length);
      }
    })().catch(() => {});
  }, [id, loading, user?.id, isSelf, profile?.handle]);

  // ── Derive visible posts for the active tab (instant, no network) ─────────
  const gridPosts = React.useMemo(() => {
    if (activeTab === "videos")   return allGridPosts.filter(p => p.post_type === "video");
    if (activeTab === "articles") return allGridPosts.filter(p => p.post_type === "article");
    return allGridPosts.filter(p => !p.post_type || p.post_type === "post" || p.post_type === "text");
  }, [allGridPosts, activeTab]);


  // ── Follow ────────────────────────────────────────────────────────────────
  const handleFollow = useCallback(async () => {
    if (!user || !id || followLoading || isSelf) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowLoading(true);
    try {
      const { error } = await setAfuChatFollow(id, !isFollowing, user.id);
      if (error) throw new Error(error.message);
      if (isFollowing) {
        setIsFollowing(false); setCounts(c => ({ ...c, followers: Math.max(0, c.followers - 1) }));
      } else {
        setIsFollowing(true); setCounts(c => ({ ...c, followers: c.followers + 1 }));
      }
    } catch { showToast("Could not update follow status", { type: "error" }); }
    finally { setFollowLoading(false); }
  }, [user, id, isFollowing, followLoading, isSelf]);

  // ── Inline followers/following expansion ──────────────────────────────────
  const handleExpandStat = useCallback(async (type: "followers" | "following") => {
    if (expandedStat === type) { setExpandedStat(null); return; }
    setExpandedStat(type);
    setExpandedUsers([]);
    setExpandedLoading(true);
    try {
      const { items, hidden, error } = await getAfuChatFollowRecords(id, type, 6, 0);
      if (error) throw new Error(error.message);
      const profiles = hidden
        ? []
        : (items ?? []).map((item) => item.profile as ExpandUser);

      setExpandedUsers(profiles);

      if (user && profiles.length > 0) {
        const ids = profiles.map((p) => p.id);
        const statuses = await getAfuChatFollowStatuses(ids);
        if (statuses.data) {
          setExpandedFollowIds(new Set(
            [...statuses.data.entries()]
              .filter(([, status]) => status.isFollowing)
              .map(([profileId]) => profileId),
          ));
        }
      }
    } catch {}
    setExpandedLoading(false);
  }, [id, expandedStat, user]);

  const handleExpandFollow = useCallback(async (targetId: string) => {
    if (!user || expandedToggling) return;
    setExpandedToggling(targetId);
    const isNowFollowing = expandedFollowIds.has(targetId);
    const { error } = await setAfuChatFollow(targetId, !isNowFollowing, user.id);
    if (error) {
      showToast("Could not update follow status", { type: "error" });
      setExpandedToggling(null);
      return;
    }
    if (isNowFollowing) {
      setExpandedFollowIds((prev) => { const s = new Set(prev); s.delete(targetId); return s; });
    } else {
      setExpandedFollowIds((prev) => new Set(prev).add(targetId));
    }
    setExpandedToggling(null);
  }, [user, expandedFollowIds, expandedToggling]);

  // ── Message ───────────────────────────────────────────────────────────────
  const handleMessage = useCallback(async () => {
    if (!user || !id) return;
    Haptics.selectionAsync();
    try {
      const { data: chatId, error } = await supabase.rpc("get_or_create_direct_chat", { other_user_id: id });
      if (error || !chatId) throw new Error();
      router.push({ pathname: "/chat/[id]", params: { id: chatId } });
    } catch { showAlert("Error", "Could not start conversation. Please try again."); }
  }, [user, id]);

  // ── Share profile ─────────────────────────────────────────────────────────
  const handleShareProfile = useCallback(async () => {
    const handle  = profile?.handle ?? id;
    const name    = profile?.display_name ?? handle;
    const url     = `https://afuchat.com/@${handle}`;
    try {
      await Share.share({ message: `Check out ${name} on AfuChat!\n${url}`, url, title: name ?? undefined });
    } catch {}
  }, [profile, id]);

  // ── Add to device contacts ────────────────────────────────────────────────
  const handleAddToContacts = useCallback(async () => {
    try {
      const Contacts = require("expo-contacts");
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        showToast("Contacts permission denied", { type: "error" });
        return;
      }
      const displayName = profile?.display_name ?? "";
      const parts       = displayName.trim().split(/\s+/);
      const contact: any = {
        [Contacts.Fields.FirstName]: parts[0] ?? displayName,
        [Contacts.Fields.LastName]:  parts.slice(1).join(" ") || undefined,
        [Contacts.Fields.Note]:      `AfuChat: @${profile?.handle ?? id}`,
        [Contacts.Fields.UrlAddresses]: [
          { label: "AfuChat", url: `https://afuchat.com/@${profile?.handle ?? id}` },
        ],
      };
      await Contacts.addContactAsync(contact);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`${displayName || "Contact"} saved to contacts`, { type: "success" });
    } catch (e: any) {
      showToast("Could not save contact", { type: "error" });
    }
  }, [profile, id]);

  // ── Guard states ──────────────────────────────────────────────────────────
  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.background }}><ContactProfileSkeleton /></View>
  );
  if (loadError && !profile) return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/discover" as any)}
        style={{ position: "absolute", top: insets.top + 8, left: 16, width: 40, height: 40, justifyContent: "center" }}
      >
        <Ionicons name="arrow-back" size={24} color={accent} />
      </TouchableOpacity>
      <Ionicons name="cloud-offline-outline" size={34} color={colors.textMuted} />
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600", marginTop: 12, textAlign: "center" }}>
        {loadError}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => setLoadAttempt((attempt) => attempt + 1)}
        style={{ marginTop: 18, backgroundColor: accent, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22 }}
      >
        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
  if (notFound || !profile) return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <ProfileNotFoundView handle={init_handle ?? id ?? "unknown"} />
    </View>
  );
  if (profile.is_private && !isSelf && !isFollowing) return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <ProfilePrivateView handle={profile.handle} displayName={profile.display_name}
        avatarUrl={profile.avatar_url ?? undefined} profileId={profile.id} />
    </View>
  );

  // ── Derived values ────────────────────────────────────────────────────────
  const prestige = getPrestigeTier(profile.acoin ?? 0);
  const ls = lastSeenLabel(profile.last_seen, profile.show_online_status);

  const followState = isFollowing && theyFollowMe ? "friends"
    : !isFollowing && theyFollowMe ? "follow_back"
    : isFollowing ? "following" : "follow";
  const isFollowFilled = followState === "follow" || followState === "follow_back";
  const followBg    = followState === "follow" ? accent : followState === "follow_back" ? "#FF9500" : "transparent";
  const followBrd   = followState === "friends" ? "#34C759" : followState === "following" ? colors.border : followBg;
  const followTxt   = isFollowFilled ? "#fff" : followState === "friends" ? "#34C759" : colors.text;
  const followLabel = followState === "friends" ? "Friends" : followState === "follow_back" ? "Follow Back"
    : followState === "following" ? "Following" : "Follow";
  const followIcon: any = followState === "friends" ? "heart" : followState === "following" ? "checkmark-circle"
    : "person-add";

  const bannerColor1 = prestige.ringColors[0];
  const bannerColor2 = prestige.ringColors[1];
  const cardBg = colors.card;
  const TABS: { id: TabId; icon: string; label: string }[] = [
    { id: "posts",    icon: "grid",           label: "Posts"    },
    { id: "articles", icon: "document-text",  label: "Articles" },
    { id: "videos",   icon: "videocam",       label: "Videos"   },
  ];

  const isOrg = profile.is_organization_verified || profile.is_business_mode;

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* COVER PHOTO (short + rectangular)                             */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <View style={[s.coverWrap, { height: BANNER_H }]}>
          {profile.banner_url ? (
            <Image source={{ uri: profile.banner_url }}
              style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={[bannerColor1, bannerColor2] as any}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.42)", "transparent"] as any}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={[StyleSheet.absoluteFill, { height: 60 }]}
          />
          {/* Nav row: back (left) + more (right) */}
          <View style={[s.navRow, { top: 6 }]}>
            <TouchableOpacity style={s.navBtn}
              onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/discover" as any)}
              hitSlop={{ top: 8, left: 8, right: 10, bottom: 8 }}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            {!isSelf && (
              <TouchableOpacity style={s.navBtn}
                onPress={() => showAlert(profile.display_name, undefined, [
                  { text: "Report", style: "destructive", onPress: () => {} },
                  { text: "Block",  style: "destructive", onPress: () => {} },
                  { text: "Cancel", style: "cancel" },
                ])}
                hitSlop={{ top: 8, left: 10, right: 8, bottom: 8 }}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* IDENTITY BAND                                                  */}
        {/* Left col: avatar (overlaps banner) + name/handle below        */}
        {/* Right col: action buttons aligned to the right                */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <View style={s.identityBand}>

          {/* ── Left: avatar + name stack ─────────────────────────────── */}
          <View style={s.identityLeft}>
            <TouchableOpacity
              onPress={() => setAvatarModalVisible(true)}
              activeOpacity={0.88}
              style={[s.avatarShell, { borderColor: colors.background, marginTop: -(AVATAR_SIZE / 2 + 4), borderRadius: isOrg ? AVATAR_SIZE * 0.22 + 3 : AVATAR_SIZE / 2 + 3 }]}>
              <Avatar uri={profile.avatar_url} name={profile.display_name}
                size={AVATAR_SIZE} square={isOrg} premium={false} userId={profile.id} />
              {ls.online && <View style={[s.onlineDot, { borderColor: colors.background }]} />}
            </TouchableOpacity>

            {/* Name + verified badge */}
            <View style={s.nameRow}>
              <UserName userId={profile.id} name={profile.display_name} style={[s.displayName, { color: colors.text }]} numberOfLines={1} />
              <VerifiedBadge isVerified={profile.is_verified}
                isOrganizationVerified={profile.is_organization_verified} size={16} />
            </View>

            <RoyaltyBadge userId={profile.id} />

            {/* Handle + online status (only show dot+label when actively online) */}
            <View style={s.handleRow}>
              <Text style={[s.handle, { color: colors.textMuted }]}>@{profile.handle}</Text>
              {ls.online && (
                <>
                  <View style={[s.statusDot, { backgroundColor: "#34C759" }]} />
                  <Text style={[s.statusText, { color: "#34C759" }]}>Online</Text>
                </>
              )}
            </View>

            {/* Prestige pill + inline action icons */}
            <View style={s.pillActionRow}>
              <View style={[s.prestigePill, { backgroundColor: prestige.color + "1A", borderColor: prestige.color + "44" }]}>
                <Text style={s.prestigeEmoji}>{prestige.emoji}</Text>
                <Text style={[s.prestigeText, { color: prestige.color }]}>{prestige.label}</Text>
              </View>

              {!isSelf && user && (
                <>
                  <TouchableOpacity
                    style={[s.pillIconBtn, { backgroundColor: accent + "18" }]}
                    onPress={handleMessage} activeOpacity={0.8}>
                    <Ionicons name="chatbubble" size={17} color={accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.pillIconBtn, { backgroundColor: "#FF2D5518" }]}
                    onPress={() => router.push({ pathname: "/app/afugifts", params: { recipientHandle: profile.handle, recipientName: profile.display_name } } as any)}
                    activeOpacity={0.8}>
                    <Ionicons name="gift" size={17} color="#FF2D55" />
                  </TouchableOpacity>
                  {isOrg && (
                    <TouchableOpacity
                      style={[s.pillIconBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }]}
                      onPress={() => router.push({ pathname: "/app/afumarket", params: { section: "storefront", userId: id } } as any)}
                      activeOpacity={0.8}>
                      <Ionicons name="storefront" size={17} color={colors.text} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[s.pillIconBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }]}
                    onPress={handleShareProfile}
                    activeOpacity={0.8}>
                    <Ionicons name="share" size={17} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.pillIconBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }]}
                    onPress={handleAddToContacts}
                    activeOpacity={0.8}>
                    <Ionicons name="person-add" size={17} color={colors.text} />
                  </TouchableOpacity>
                </>
              )}

              {isSelf && (
                <>
                  <TouchableOpacity
                    style={[s.pillIconBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }]}
                    onPress={handleShareProfile} activeOpacity={0.8}>
                    <Ionicons name="share" size={17} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.pillIconBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }]}
                    onPress={() => router.push("/settings")} activeOpacity={0.8}>
                    <Ionicons name="settings" size={17} color={colors.text} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* ── Right: action buttons ─────────────────────────────────── */}
          <View style={s.identityRight}>
            {/* Follow / Edit */}
            {!isSelf && user && (
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: followBg, borderColor: followBrd }]}
                onPress={handleFollow} activeOpacity={0.85} disabled={followLoading}>
                {followLoading
                  ? <ActivityIndicator size="small" color={followTxt} />
                  : <><Ionicons name={followIcon} size={13} color={followTxt} />
                      <Text style={[s.primaryBtnText, { color: followTxt }]}>{followLabel}</Text></>}
              </TouchableOpacity>
            )}
            {isSelf && (
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: "transparent", borderColor: colors.border }]}
                onPress={() => router.push("/profile/edit")} activeOpacity={0.85}>
                <Ionicons name="create" size={13} color={colors.text} />
                <Text style={[s.primaryBtnText, { color: colors.text }]}>Edit</Text>
              </TouchableOpacity>
            )}

          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* AVATAR FULLSCREEN MODAL                                       */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <Modal
          visible={avatarModalVisible}
          transparent
          animationType="none"
          onRequestClose={() => setAvatarModalVisible(false)}>
          <TouchableOpacity
            style={s.avatarModalBg}
            activeOpacity={1}
            onPress={() => setAvatarModalVisible(false)}>
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={s.avatarModalImg}
                contentFit="contain"
              />
            ) : (
              <View style={[s.avatarModalPlaceholder, { backgroundColor: isDark ? "#333" : "#eee" }]}>
                <Text style={{ fontSize: 64 }}>
                  {profile.display_name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[s.avatarModalClose, { backgroundColor: "rgba(0,0,0,0.6)" }]}
              onPress={() => setAvatarModalVisible(false)}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* STATS CARD                                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <View style={[s.statsCard, { backgroundColor: cardBg, borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)" }]}>
          {[
            { label: "Posts",     value: counts.posts,     expandable: false, onPress: () => router.push({ pathname: "/my-posts", params: { userId: id } } as any) },
            { label: "Followers", value: counts.followers, expandable: true,  onPress: () => handleExpandStat("followers") },
            { label: "Following", value: counts.following, expandable: true,  locked: profile.is_private,
              onPress: () => !profile.is_private && handleExpandStat("following") },
          ].map((stat, i) => {
            const isExpanded = (stat.label === "Followers" && expandedStat === "followers") || (stat.label === "Following" && expandedStat === "following");
            return (
              <React.Fragment key={stat.label}>
                {i > 0 && <View style={[s.statDivider, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)" }]} />}
                <TouchableOpacity style={s.statCell} onPress={stat.onPress} activeOpacity={stat.locked ? 1 : 0.65}>
                  {stat.locked
                    ? <View style={s.lockedStat}>
                        <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
                        <Text style={[s.statNum, { color: colors.textMuted }]}>N/A</Text>
                      </View>
                    : <Text style={[s.statNum, { color: isExpanded ? accent : colors.text }]}>{fmtCount(stat.value)}</Text>}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Text style={[s.statLabel, { color: isExpanded ? accent : colors.textMuted }]}>{stat.label}</Text>
                    {stat.expandable && !stat.locked && (
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={10} color={isExpanded ? accent : colors.textMuted} />
                    )}
                  </View>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* INLINE FOLLOWERS / FOLLOWING PANEL                            */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {expandedStat && (
          <View style={[s.expandPanel, { backgroundColor: cardBg, borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)" }]}>
            {/* Header */}
            <View style={s.expandHeader}>
              <Text style={[s.expandTitle, { color: colors.text }]}>
                {expandedStat === "followers" ? "Followers" : "Following"}
              </Text>
              <Text style={[s.expandCount, { color: colors.textMuted }]}>
                {(expandedStat === "followers" ? counts.followers : counts.following).toLocaleString()}
              </Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/followers", params: { userId: id, type: expandedStat, ownerHandle: profile.handle } } as any)}
                style={[s.expandViewAll, { borderColor: accent + "55" }]}
                activeOpacity={0.7}
              >
                <Text style={[s.expandViewAllText, { color: accent }]}>View all</Text>
                <Ionicons name="chevron-forward" size={12} color={accent} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setExpandedStat(null)}
                style={s.expandClose}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* User cards */}
            {expandedLoading ? (
              <View style={s.expandLoadingRow}>
                {[1,2,3].map(i => (
                  <View key={i} style={s.expandSkeletonCard}>
                    <View style={[s.expandSkeletonAvatar, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]} />
                    <View style={[s.expandSkeletonLine, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", width: 52 }]} />
                    <View style={[s.expandSkeletonLine, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", width: 40, marginTop: 3 }]} />
                  </View>
                ))}
              </View>
            ) : expandedUsers.length === 0 ? (
              <View style={s.expandEmpty}>
                <Ionicons name={expandedStat === "followers" ? "people" : "person-add"} size={28} color={colors.textMuted} />
                <Text style={[s.expandEmptyText, { color: colors.textMuted }]}>
                  {expandedStat === "followers" ? "No followers yet" : "Not following anyone yet"}
                </Text>
              </View>
            ) : (
              <View style={s.expandCardsRow}>
                {expandedUsers.map((eu) => {
                  const isMe = eu.id === user?.id;
                  const amFollowing = expandedFollowIds.has(eu.id);
                  const toggling = expandedToggling === eu.id;
                  return (
                    <TouchableOpacity
                      key={eu.id}
                      style={[s.expandCard, { backgroundColor: colors.surface, borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}
                      activeOpacity={0.75}
                      onPress={() => {
                        setExpandedStat(null);
                        if (isMe) router.push("/(tabs)/me" as any);
                        else router.push({ pathname: "/contact/[id]", params: { id: eu.id } } as any);
                      }}
                    >
                      <Avatar uri={eu.avatar_url} name={eu.display_name} size={44} square={!!eu.is_organization_verified} />
                      <View style={s.expandCardInfo}>
                        <View style={s.expandCardNameRow}>
                          <Text style={[s.expandCardName, { color: colors.text }]} numberOfLines={1}>{eu.display_name}</Text>
                          {eu.is_verified && <Ionicons name="checkmark-circle" size={11} color={accent} />}
                        </View>
                        <Text style={[s.expandCardHandle, { color: colors.textMuted }]} numberOfLines={1}>@{eu.handle}</Text>
                      </View>
                      {!isMe && user && (
                        <TouchableOpacity
                          style={[
                            s.expandFollowBtn,
                            amFollowing
                              ? { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border }
                              : { backgroundColor: accent, borderWidth: 0 },
                          ]}
                          onPress={(e) => { e.stopPropagation?.(); handleExpandFollow(eu.id); }}
                          disabled={toggling}
                          activeOpacity={0.75}
                        >
                          {toggling
                            ? <ActivityIndicator size="small" color={amFollowing ? colors.textMuted : "#fff"} />
                            : <Text style={[s.expandFollowBtnText, { color: amFollowing ? colors.text : "#fff" }]}>
                                {amFollowing ? "Following" : "Follow"}
                              </Text>
                          }
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* BIO                                                            */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {!!profile.bio && (
          <Text style={[s.bio, { color: colors.text }]} numberOfLines={6}>{profile.bio}</Text>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* META CHIPS                                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <View style={s.metaStrip}>
          {profile.created_at && (
            <View style={[s.metaChip, { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)" }]}>
              <Ionicons name="calendar" size={11} color={colors.textMuted} />
              <Text style={[s.metaChipText, { color: colors.textMuted }]}>Joined {joinedLabel(profile.created_at)}</Text>
            </View>
          )}
          {profile.country && (
            <View style={[s.metaChip, { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)" }]}>
              <Ionicons name="location" size={11} color={colors.textMuted} />
              <Text style={[s.metaChipText, { color: colors.textMuted }]}>{profile.country}</Text>
            </View>
          )}
          {!!profile.website_url && (
            <TouchableOpacity style={[s.metaChip, { backgroundColor: accent + "18" }]}
              onPress={() => {
                const url = /^https?:\/\//i.test(profile.website_url!)
                  ? profile.website_url!
                  : `https://${profile.website_url!}`;
                Linking.openURL(url).catch(() => {});
              }}
              activeOpacity={0.75}>
              <Ionicons name="link" size={11} color={accent} />
              <Text style={[s.metaChipText, { color: accent }]} numberOfLines={1}>
                {profile.website_url.replace(/^https?:\/\//, "")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Also known as */}
        {aliases.length > 0 && (
          <View style={s.metaRow}>
            <Ionicons name="at-circle" size={13} color={colors.textMuted} />
            <Text style={[s.metaBodyText, { color: colors.textMuted }]}>
              {"Also known as  "}
              {aliases.map((a, i) => (
                <Text key={a} style={{ color: accent, fontFamily: "Inter_500Medium" }}>
                  @{a}{i < aliases.length - 1 ? "  " : ""}
                </Text>
              ))}
            </Text>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* MUTUAL FOLLOWERS — advanced social-proof card                 */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {!isSelf && mutuals.length > 0 && !mutualDismissed && (
          <View style={[s.mutualsCard, {
            backgroundColor: cardBg,
            borderColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)",
          }]}>
            {/* ── Header row ── */}
            <View style={s.mutualsHeader}>
              {/* Stacked avatars */}
              <View style={s.mutualsAvatars}>
                {mutuals.slice(0, 5).map((m, i) => (
                  <View key={m.id} style={[s.mutualAvatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 10 - i }]}>
                    <Avatar uri={m.avatar_url} name={m.handle} size={28} />
                  </View>
                ))}
                {mutualTotal > 5 && (
                  <View style={[s.mutualMoreBadge, { backgroundColor: accent, marginLeft: -10, zIndex: 0 }]}>
                    <Text style={s.mutualMoreText}>+{mutualTotal - 5}</Text>
                  </View>
                )}
              </View>

              {/* Label */}
              <View style={{ flex: 1, paddingLeft: 10 }}>
                <Text style={[s.mutualsTitle, { color: colors.text }]} numberOfLines={2}>
                  {(() => {
                    const names = mutuals.slice(0, 2).map(m => `@${m.handle}`);
                    if (mutualTotal === 1) return names[0];
                    if (mutualTotal === 2) return `${names[0]} & ${names[1]}`;
                    return `${names.join(", ")} & ${mutualTotal - 2} more`;
                  })()}
                </Text>
                <Text style={[s.mutualsSubtitle, { color: colors.textMuted }]}>
                  {mutualTotal === 1 ? "follows this person too" : `follow this person`}
                </Text>
              </View>

              {/* Controls */}
              <View style={s.mutualsControls}>
                <TouchableOpacity
                  style={[s.mutualsExpandBtn, { backgroundColor: accent + "18" }]}
                  onPress={() => setMutualExpanded(v => !v)}
                  activeOpacity={0.7}>
                  <Ionicons name={mutualExpanded ? "chevron-up" : "chevron-down"} size={13} color={accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.mutualsDismissBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}
                  onPress={async () => {
                    setMutualDismissed(true);
                    await AsyncStorage.setItem(`afu_mutuals_dismissed_${id}`, "1");
                  }}
                  activeOpacity={0.7}>
                  <Ionicons name="close" size={13} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Expanded list ── */}
            {mutualExpanded && (
              <View style={[s.mutualsExpanded, { borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)" }]}>
                {mutuals.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={s.mutualRow}
                    onPress={() => router.push({ pathname: "/contact/[id]", params: { id: m.id } })}
                    activeOpacity={0.7}>
                    <Avatar uri={m.avatar_url} name={m.handle} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.mutualRowName, { color: colors.text }]} numberOfLines={1}>
                        {(m as any).display_name || `@${m.handle}`}
                      </Text>
                      <Text style={[s.mutualRowHandle, { color: colors.textMuted }]}>@{m.handle}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[s.mutualSeeAll, { borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)" }]}
                  onPress={() => router.push({ pathname: "/followers", params: { userId: id, type: "followers", ownerHandle: profile.handle } } as any)}
                  activeOpacity={0.7}>
                  <Text style={[s.mutualSeeAllText, { color: accent }]}>See all followers →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}



        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB BAR                                                          */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <View style={[s.tabBar, { backgroundColor: cardBg, borderTopColor: colors.border, borderBottomColor: colors.border }]}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity key={tab.id} style={s.tabItem} onPress={() => setActiveTab(tab.id)} activeOpacity={0.7}>
                <Ionicons name={tab.icon as any} size={20} color={active ? accent : colors.textMuted} />
                <Text style={[s.tabLabel, { color: active ? accent : colors.textMuted }]}>{tab.label}</Text>
                {active && <View style={[s.tabIndicator, { backgroundColor: accent }]} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* PHOTO GRID                                                       */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {gridLoading ? (
          <View style={s.gridCenter}><ActivityIndicator color={accent} size="large" /></View>
        ) : gridPosts.length === 0 ? (
          <View style={s.gridCenter}>
            <View style={[s.emptyIcon, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }]}>
              <Ionicons name={activeTab === "videos" ? "videocam" : activeTab === "articles" ? "document-text" : "images"}
                size={32} color={colors.textMuted} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.text }]}>
              {activeTab === "videos" ? "No videos yet" : activeTab === "articles" ? "No articles yet" : "No posts yet"}
            </Text>
            <Text style={[s.emptyBody, { color: colors.textMuted }]}>
              {isSelf ? "Share something to get started" : "Nothing posted here yet"}
            </Text>
          </View>
        ) : (
          <View style={s.grid}>
            {gridPosts.map(item => {
              const isVid     = item.post_type === "video";
              const isArticle = item.post_type === "article";
              // pick the best thumbnail for each post type
              const thumb = isArticle
                ? (item.article_cover_url || item.image_url)
                : isVid
                  ? item.image_url          // video poster frame if available
                  : item.image_url;
              const dest = isVid
                ? { pathname: "/video/[id]",   params: { id: item.id } }
                : isArticle
                  ? { pathname: "/article/[id]", params: { id: item.id } }
                  : { pathname: "/post/[id]",    params: { id: item.id } };
              return (
                <TouchableOpacity key={item.id}
                  style={[s.gridCell, { width: CELL, height: CELL }]}
                  activeOpacity={0.88}
                  onPress={() => router.push(dest as any)}>

                  {/* Thumbnail / fallback */}
                  {thumb
                    ? <Image source={{ uri: thumb }} style={{ width: CELL, height: CELL }} contentFit="cover" />
                    : isArticle
                      ? <View style={[s.gridTextCard, { backgroundColor: isDark ? "#1c1c1e" : "#f2f2f7" }]}>
                          <Ionicons name="document-text" size={14} color={accent} style={{ marginBottom: 4 }} />
                          <Text style={[s.gridTextPreview, { color: colors.text, fontFamily: "Inter_600SemiBold" }]} numberOfLines={3}>
                            {item.article_title || item.content || "Article"}
                          </Text>
                        </View>
                      : item.content
                        ? <View style={[s.gridTextCard, { backgroundColor: isDark ? "#1c1c1e" : "#f2f2f7" }]}>
                            <Text style={[s.gridTextPreview, { color: colors.text }]} numberOfLines={4}>
                              {item.content}
                            </Text>
                          </View>
                        : <View style={[s.gridPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                            <Ionicons name="image" size={20} color={colors.textMuted} />
                          </View>}

                  {/* Badges */}
                  {isVid && (
                    <View style={s.videoTag}>
                      <Ionicons name="play-circle" size={20} color="#fff" />
                    </View>
                  )}
                  {isArticle && (
                    <View style={[s.videoTag, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                      <Ionicons name="book" size={14} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardShadow = {};
const cardShadowDark = {};

const s = StyleSheet.create({
  root: { flex: 1 },

  // Cover photo (short + rectangular)
  coverWrap: { width: "100%", overflow: "hidden" },

  // Floating back button inside cover
  navRow: {
    position: "absolute", left: 12, right: 12,
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
  },
  navBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  // Identity band — left avatar col + right action col
  // NOTE: no marginTop here — only the avatarShell gets the negative margin
  identityBand: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 10,
  },
  identityLeft: {
    flex: 1,
    gap: 4,
  },
  identityRight: {
    alignItems: "flex-end",
    justifyContent: "flex-end",
    // push buttons down so they sit below the cover boundary
    paddingTop: (AVATAR_SIZE / 2 + 4) + 6,
    gap: 8,
  },
  avatarShell: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: AVATAR_SIZE / 2 + 3,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: "absolute", bottom: 5, right: 5,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: "#34C759", borderWidth: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  displayName: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.2, flexShrink: 1 },
  prestigePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
  },
  prestigeEmoji: { fontSize: 11 },
  prestigeText: { fontSize: 10.5, fontFamily: "Inter_600SemiBold" },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5,
  },
  primaryBtnText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },

  handleRow: {
    flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap",
  },
  handle: { fontSize: 12.5, fontFamily: "Inter_400Regular" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11.5, fontFamily: "Inter_400Regular" },

  // Avatar fullscreen modal
  avatarModalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarModalImg: {
    width: SW - 32,
    height: SW - 32,
    borderRadius: 16,
  },
  avatarModalPlaceholder: {
    width: SW - 32, height: SW - 32,
    borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  avatarModalClose: {
    position: "absolute", top: 56, right: 16,
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },

  // Stats — flat with hairline borders
  statsCard: {
    flexDirection: "row",
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  statCell: { flex: 1, alignItems: "center", gap: 2 },
  statNum: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: 0.5, marginVertical: 8 },
  lockedStat: { flexDirection: "row", alignItems: "center", gap: 3 },

  // Inline expand panel
  expandPanel: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  expandHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 6,
  },
  expandTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  expandCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  expandViewAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  expandViewAllText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  expandClose: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  expandLoadingRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  expandSkeletonCard: {
    width: 88,
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
  },
  expandSkeletonAvatar: { width: 44, height: 44, borderRadius: 22 },
  expandSkeletonLine: { height: 9, borderRadius: 5 },
  expandEmpty: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  expandEmptyText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  expandCardsRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 8,
    flexWrap: "wrap",
  },
  expandCard: {
    width: 90,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  expandCardInfo: { alignItems: "center", width: "100%", gap: 1 },
  expandCardNameRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  expandCardName: { fontSize: 12, fontFamily: "Inter_600SemiBold", maxWidth: 68, textAlign: "center" },
  expandCardHandle: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  expandFollowBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  expandFollowBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  // Bio + meta
  bio: {
    fontSize: 14, fontFamily: "Inter_400Regular",
    lineHeight: 21, marginHorizontal: 16, marginBottom: 8,
  },
  metaStrip: {
    flexDirection: "row", flexWrap: "wrap", gap: 6,
    marginHorizontal: 16, marginBottom: 6,
  },
  metaChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20,
  },
  metaChipText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaRow: {
    flexDirection: "row", alignItems: "center",
    gap: 5, marginHorizontal: 16, marginBottom: 6, flexWrap: "wrap",
  },
  metaBodyText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },

  // ── Mutual followers — advanced card ───────────────────────────────────────
  mutualsCard: {
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 16, borderWidth: 1,
    overflow: "hidden",
  },
  mutualsHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12,
    gap: 2,
  },
  mutualsAvatars: { flexDirection: "row", alignItems: "center" },
  mutualAvatar: { borderRadius: 14, overflow: "hidden" },
  mutualMoreBadge: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    zIndex: 0,
  },
  mutualMoreText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },
  mutualsTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 17 },
  mutualsSubtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  mutualsControls: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 6 },
  mutualsExpandBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  mutualsDismissBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  mutualsExpanded: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mutualRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  mutualRowName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  mutualRowHandle: { fontSize: 11, fontFamily: "Inter_400Regular" },
  mutualSeeAll: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 11,
    alignItems: "center",
  },
  mutualSeeAllText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Prestige pill + inline action icons (same row, fills full width of identityLeft)
  pillActionRow: {
    flexDirection: "row", alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  pillIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 0.5, borderBottomWidth: 0.5,
    marginTop: 8,
  },
  tabItem: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: 9, gap: 2, position: "relative",
  },
  tabLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  tabIndicator: {
    position: "absolute", bottom: 0,
    left: "15%", right: "15%", height: 2, borderRadius: 2,
  },

  // Grid
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: { overflow: "hidden", borderWidth: 0.5, borderColor: "rgba(128,128,128,0.18)" },
  gridPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  gridTextCard: {
    flex: 1, padding: 8, justifyContent: "center", alignItems: "flex-start",
  },
  gridTextPreview: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  videoTag: {
    position: "absolute", inset: 0, alignItems: "center", justifyContent: "center",
  } as any,
  multiTag: {
    position: "absolute", top: 6, right: 6,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 4,
    padding: 3,
  },

  // Empty state
  gridCenter: {
    alignItems: "center", paddingTop: 48, paddingBottom: 32, gap: 10,
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyBody: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
