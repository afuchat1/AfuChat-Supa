import React, { useEffect, useState, useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Modal,
  FlatList,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { AdminSkeleton } from "@/components/ui/Skeleton";

const BRAND = "#34A853";
const GOLD = "#D4A853";
type Stats = {
  totalUsers: number;
  totalPosts: number;
  totalChats: number;
  totalMessages: number;
  premiumUsers: number;
  verifiedUsers: number;
  totalNexa: number;
  totalAcoin: number;
  totalStories: number;
  totalReferrals: number;
  totalChannels: number;
  pendingDeletions: number;
};

type UserRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_admin: boolean;
  is_organization_verified: boolean;
  xp: number;
  acoin: number;
  current_grade: string;
  country: string | null;
  created_at: string;
};

type PostRow = {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_handle: string;
  is_blocked: boolean;
  view_count: number;
  created_at: string;
};

type SubPlan = {
  id: string;
  name: string;
  description: string;
  acoin_price: number;
  duration_days: number;
  tier: string;
  is_active: boolean;
};

type CurrencySettings = {
  id: string;
  nexa_to_acoin_rate: number;
  conversion_fee_percent: number;
  p2p_fee_percent: number;
};

const TABS = [
  { id: "overview", label: "Overview", icon: "stats-chart" as const },
  { id: "lookup", label: "ID Lookup", icon: "finger-print" as const },
  { id: "users", label: "Users", icon: "people" as const },
  { id: "content", label: "Content", icon: "document-text" as const },
  { id: "referrals", label: "Referrals", icon: "git-network" as const },
  { id: "subs", label: "Plans", icon: "diamond" as const },
  { id: "currency", label: "Currency", icon: "cash" as const },
  { id: "reports", label: "Reports", icon: "shield" as const },
];

function timeAgo(iso: string) {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function StatCard({ title, value, icon, color, colors: themeColors }: { title: string; value: string | number; icon: string; color: string; colors: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={[styles.statValue, { color: themeColors.text }]}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </Text>
      <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>{title}</Text>
    </View>
  );
}

export default function AdminDashboard() {
  const { colors, isDark } = useTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalPosts: 0, totalChats: 0, totalMessages: 0, premiumUsers: 0, verifiedUsers: 0, totalNexa: 0, totalAcoin: 0, totalStories: 0, totalReferrals: 0, totalChannels: 0, pendingDeletions: 0 });
  const [referrals, setReferrals] = useState<any[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [plans, setPlans] = useState<SubPlan[]>([]);
  const [currencySettings, setCurrencySettings] = useState<CurrencySettings | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [postSearch, setPostSearch] = useState("");
  const [balanceModal, setBalanceModal] = useState<UserRow | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupError, setLookupError] = useState("");
  const isAdmin = !!profile?.is_admin;

  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    const [
      { count: totalUsers },
      { count: totalPosts },
      { count: totalChats },
      { count: totalMessages },
      { count: premiumUsers },
      { count: verifiedUsers },
      { count: totalStories },
      { count: totalReferrals },
      { count: totalChannels },
      { count: pendingDeletions },
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("posts").select("*", { count: "exact", head: true }),
      supabase.from("chats").select("*", { count: "exact", head: true }),
      supabase.from("messages").select("*", { count: "exact", head: true }),
      supabase.from("user_subscriptions").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_verified", true),
      supabase.from("stories").select("*", { count: "exact", head: true }),
      supabase.from("referrals").select("*", { count: "exact", head: true }),
      supabase.from("channels").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }).not("scheduled_deletion_at", "is", null),
    ]);

    const { data: nexaData } = await supabase.from("profiles").select("xp, acoin");
    let totalNexa = 0, totalAcoin = 0;
    for (const p of (nexaData || [])) { totalNexa += p.xp || 0; totalAcoin += p.acoin || 0; }

    setStats({
      totalUsers: totalUsers || 0,
      totalPosts: totalPosts || 0,
      totalChats: totalChats || 0,
      totalMessages: totalMessages || 0,
      premiumUsers: premiumUsers || 0,
      verifiedUsers: verifiedUsers || 0,
      totalNexa,
      totalAcoin,
      totalStories: totalStories || 0,
      totalReferrals: totalReferrals || 0,
      totalChannels: totalChannels || 0,
      pendingDeletions: pendingDeletions || 0,
    });
  }, []);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    let query = supabase.from("profiles").select("id, handle, display_name, avatar_url, is_verified, is_admin, is_organization_verified, xp, acoin, current_grade, country, created_at").order("created_at", { ascending: false }).limit(100);
    if (userSearch) query = query.or(`handle.ilike.%${userSearch}%,display_name.ilike.%${userSearch}%`);
    const { data } = await query;
    if (data) setUsers(data);
  }, [userSearch]);

  const loadPosts = useCallback(async () => {
    if (!isAdmin) return;
    let query = supabase.from("posts").select("id, content, author_id, is_blocked, view_count, created_at, profiles!posts_author_id_fkey(display_name, handle)").order("created_at", { ascending: false }).limit(100);
    if (postSearch) query = query.ilike("content", `%${postSearch}%`);
    const { data } = await query;
    if (data) {
      setPosts(data.map((p: any) => ({
        id: p.id,
        content: p.content || "",
        author_id: p.author_id,
        author_name: p.profiles?.display_name || "Unknown",
        author_handle: p.profiles?.handle || "unknown",
        is_blocked: p.is_blocked,
        view_count: p.view_count || 0,
        created_at: p.created_at,
      })));
    }
  }, [postSearch]);

  const loadPlans = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase.from("subscription_plans").select("*").order("acoin_price", { ascending: true });
    if (data) setPlans(data);
  }, []);

  const loadCurrency = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase.from("currency_settings").select("*").limit(1).maybeSingle();
    if (data) setCurrencySettings(data);
  }, []);

  const loadReports = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(50);
    if (data) {
      const userIds = [...new Set(data.flatMap((r: any) => [r.reporter_id, r.reported_id]))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
        const nameMap: Record<string, string> = {};
        for (const p of (profiles || [])) nameMap[p.id] = p.display_name;
        setReports(data.map((r: any) => ({ ...r, reporter_name: nameMap[r.reporter_id] || "Unknown", reported_name: nameMap[r.reported_id] || "Unknown" })));
      } else {
        setReports(data);
      }
    } else {
      setReports([]);
    }
  }, []);

  const loadReferrals = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase
      .from("referrals")
      .select("id, created_at, reward_given, referrer:profiles!referrals_referrer_id_fkey(id, display_name, handle), referred:profiles!referrals_referred_id_fkey(id, display_name, handle)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setReferrals(data);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadStats(), loadUsers(), loadPosts(), loadPlans(), loadCurrency(), loadReports(), loadReferrals()]);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadUsers(); }, [userSearch]);
  useEffect(() => { loadPosts(); }, [postSearch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  if (!isAdmin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="lock-closed" size={48} color={colors.textMuted} />
        <Text style={[styles.noAccess, { color: colors.text }]}>Admin access required</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: BRAND, fontSize: 16, marginTop: 16 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function toggleVerification(userId: string, current: boolean) {
    await supabase.from("profiles").update({ is_verified: !current }).eq("id", userId);
    loadUsers();
    loadStats();
  }

  async function togglePostBlock(postId: string, current: boolean) {
    await supabase.from("posts").update({ is_blocked: !current }).eq("id", postId);
    loadPosts();
  }

  async function deletePost(postId: string) {
    showAlert("Delete Post", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await supabase.from("posts").delete().eq("id", postId);
        loadPosts();
        loadStats();
      }},
    ]);
  }

  async function adjustBalance(userId: string, field: "xp" | "acoin", amount: number) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const newVal = Math.max(0, (field === "xp" ? user.xp : user.acoin) + amount);
    await supabase.from("profiles").update({ [field]: newVal }).eq("id", userId);
    loadUsers();
    loadStats();
    setBalanceModal(null);
  }

  async function updateCurrency(field: string, value: number) {
    if (!currencySettings) return;
    await supabase.from("currency_settings").update({ [field]: value }).eq("id", currencySettings.id);
    loadCurrency();
  }

  const PROFILE_COLS = "id, handle, display_name, avatar_url, bio, phone_number, xp, acoin, current_grade, is_verified, is_private, show_online_status, country, website_url, language, tipping_enabled, is_admin, is_organization_verified, gender, date_of_birth, region, interests, onboarding_completed, scheduled_deletion_at, created_at";

  async function performLookup() {
    let cleanId = lookupId.replace(/\s/g, "").trim();
    if (cleanId.startsWith("@")) cleanId = cleanId.slice(1);
    if (cleanId.length < 3) {
      setLookupError("Enter a valid Afu ID (8 digits) or handle");
      return;
    }
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    try {
      let matchedProfile = null;

      const isNumericId = /^\d{3,8}$/.test(cleanId);
      if (isNumericId) {
        const targetAfuId = cleanId.padStart(8, "0");
        const { data: allProfiles } = await supabase.from("profiles").select(PROFILE_COLS);
        for (const p of (allProfiles || [])) {
          const hex = p.id.replace(/-/g, "").slice(0, 8);
          const num = parseInt(hex, 16) % 100000000;
          const pAfuId = num.toString().padStart(8, "0");
          if (pAfuId === targetAfuId) {
            matchedProfile = { ...p, afu_id: pAfuId };
            break;
          }
        }
      }

      if (!matchedProfile) {
        const { data: byHandle } = await supabase.from("profiles").select(PROFILE_COLS).or(`handle.eq.${cleanId},handle.ilike.${cleanId}`).limit(1);
        if (byHandle && byHandle.length > 0) {
          const p = byHandle[0];
          const hex = p.id.replace(/-/g, "").slice(0, 8);
          const num = parseInt(hex, 16) % 100000000;
          matchedProfile = { ...p, afu_id: num.toString().padStart(8, "0") };
        }
      }

      if (!matchedProfile) {
        setLookupError("No user found with that ID or handle");
        setLookupLoading(false);
        return;
      }

      const userId = matchedProfile.id;
      const [
        { count: followers },
        { count: following },
        { count: posts },
        { count: giftsSent },
        { count: giftsReceived },
        { count: nexaSent },
        { count: nexaReceived },
        { count: acoinTxCount },
        { count: redSent },
        { count: redReceived },
        { data: subData },
        { count: postLikeCount },
        { count: chatCount },
        { count: messageCount },
        { data: followersList },
        { data: followingList },
        { data: recentPosts },
        { data: recentChats },
        { data: likedPosts },
      ] = await Promise.all([
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", userId),
        supabase.from("gift_transactions").select("id", { count: "exact", head: true }).eq("sender_id", userId),
        supabase.from("gift_transactions").select("id", { count: "exact", head: true }).eq("receiver_id", userId),
        supabase.from("xp_transfers").select("id", { count: "exact", head: true }).eq("sender_id", userId),
        supabase.from("xp_transfers").select("id", { count: "exact", head: true }).eq("receiver_id", userId),
        supabase.from("acoin_transactions").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("red_envelopes").select("id", { count: "exact", head: true }).eq("sender_id", userId),
        supabase.from("red_envelope_claims").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("user_subscriptions").select("*, subscription_plans(name, tier)").eq("user_id", userId).eq("is_active", true).maybeSingle(),
        supabase.from("post_likes").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("chats").select("id", { count: "exact", head: true }).or(`user1_id.eq.${userId},user2_id.eq.${userId}`),
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", userId),
        supabase.from("follows").select("follower_id, profiles!follows_follower_id_fkey(handle, display_name, avatar_url)").eq("following_id", userId).order("created_at", { ascending: false }).limit(50),
        supabase.from("follows").select("following_id, profiles!follows_following_id_fkey(handle, display_name, avatar_url)").eq("follower_id", userId).order("created_at", { ascending: false }).limit(50),
        supabase.from("posts").select("id, content, view_count, created_at").eq("author_id", userId).order("created_at", { ascending: false }).limit(20),
        supabase.from("chats").select("id, created_at, user1_id, user2_id").or(`user1_id.eq.${userId},user2_id.eq.${userId}`).order("created_at", { ascending: false }).limit(20),
        supabase.from("post_likes").select("post_id, created_at, posts(content, author_id)").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      ]);

      let email = "\u2014";
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(userId);
        if (authUser?.user?.email) email = authUser.user.email;
      } catch {}

      const createdAt = matchedProfile.created_at ? new Date(matchedProfile.created_at) : new Date();
      const daysOnPlatform = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
      const level = Math.floor(Math.sqrt((matchedProfile.xp || 0) / 100)) + 1;

      setLookupResult({
        ...matchedProfile,
        email,
        level,
        daysOnPlatform,
        followers: followers || 0,
        following: following || 0,
        posts: posts || 0,
        giftsSent: giftsSent || 0,
        giftsReceived: giftsReceived || 0,
        nexaSent: nexaSent || 0,
        nexaReceived: nexaReceived || 0,
        acoinTxCount: acoinTxCount || 0,
        redSent: redSent || 0,
        redReceived: redReceived || 0,
        subscription: subData,
        postLikeCount: postLikeCount || 0,
        chatCount: chatCount || 0,
        messageCount: messageCount || 0,
        followersList: followersList || [],
        followingList: followingList || [],
        recentPosts: recentPosts || [],
        recentChats: recentChats || [],
        likedPosts: likedPosts || [],
      });
    } catch (e) {
      setLookupError("Failed to look up user");
    } finally {
      setLookupLoading(false);
    }
  }

  function LookupRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
    return (
      <View style={[styles.lookupRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.lookupLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.lookupValue, { color: valueColor || colors.text }]} numberOfLines={2}>{value}</Text>
      </View>
    );
  }

  function renderLookup() {
    const u = lookupResult;
    const gradeMap: Record<string, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum", diamond: "Diamond", legend: "Legend" };
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>User ID Lookup</Text>
        <Text style={[{ fontSize: 13, color: colors.textMuted, marginBottom: 8, fontFamily: "Inter_400Regular" }]}>
          Enter an Afu ID number or handle to view complete user data
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, flex: 1 }]}
            placeholder="Afu ID (e.g. 1234 5678) or @handle"
            placeholderTextColor={colors.textMuted}
            value={lookupId}
            onChangeText={setLookupId}
            keyboardType="default"
            autoCapitalize="none"
            onSubmitEditing={performLookup}
          />
          <TouchableOpacity style={[styles.lookupBtn, { opacity: lookupLoading ? 0.5 : 1 }]} onPress={performLookup} disabled={lookupLoading}>
            {lookupLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="search" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
        {lookupError ? (
          <View style={[styles.lookupErrorBox, { backgroundColor: "#FF3B3015" }]}>
            <Ionicons name="alert-circle" size={16} color="#FF3B30" />
            <Text style={{ color: "#FF3B30", fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 }}>{lookupError}</Text>
          </View>
        ) : null}
        {u ? (
          <View style={{ marginTop: 16, gap: 12 }}>
            <View style={[styles.lookupProfileHeader, { backgroundColor: colors.surface }]}>
              <View style={[styles.lookupAvatar, { backgroundColor: BRAND }]}>
                <Text style={styles.userAvatarText}>{(u.display_name || "?").charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.userName, { color: colors.text }]}>{u.display_name}</Text>
                  {u.is_verified && <Ionicons name="checkmark-circle" size={16} color={u.is_organization_verified ? GOLD : BRAND} />}
                  {u.is_admin && <Ionicons name="shield-checkmark" size={16} color={BRAND} />}
                </View>
                <Text style={[styles.userHandle, { color: colors.textSecondary }]}>@{u.handle}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: u.scheduled_deletion_at ? "#FF3B3020" : "#10B98120" }]}>
                <Text style={{ color: u.scheduled_deletion_at ? "#FF3B30" : "#10B981", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {u.scheduled_deletion_at ? "Deleting" : "Active"}
                </Text>
              </View>
            </View>

            <View style={styles.lookupQuickStats}>
              {[
                { label: "Followers", value: u.followers, color: BRAND },
                { label: "Following", value: u.following, color: "#3B82F6" },
                { label: "Posts", value: u.posts, color: "#8B5CF6" },
                { label: "Days", value: u.daysOnPlatform, color: "#10B981" },
              ].map((s) => (
                <View key={s.label} style={[styles.lookupQuickStat, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.statValue, { color: s.color }]}>{s.value.toLocaleString()}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.lookupCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.lookupCardTitle, { color: colors.text }]}>Identity</Text>
              <LookupRow label="Afu ID" value={u.afu_id.slice(0, 4) + " " + u.afu_id.slice(4)} />
              <LookupRow label="User UUID" value={u.id} />
              <LookupRow label="Email" value={u.email || "\u2014"} valueColor={u.email && u.email !== "\u2014" ? BRAND : undefined} />
              <LookupRow label="Name" value={u.display_name || "\u2014"} />
              <LookupRow label="Handle" value={"@" + u.handle} valueColor={BRAND} />
              <LookupRow label="Bio" value={u.bio || "\u2014"} />
              <LookupRow label="Country" value={u.country || "\u2014"} />
              <LookupRow label="Region" value={u.region || "\u2014"} />
              <LookupRow label="Gender" value={u.gender ? u.gender.charAt(0).toUpperCase() + u.gender.slice(1) : "\u2014"} />
              <LookupRow label="Language" value={(u.language || "\u2014").toUpperCase()} />
              <LookupRow label="Website" value={u.website_url || "\u2014"} valueColor={u.website_url ? BRAND : undefined} />
              <LookupRow label="Phone" value={u.phone_number || "\u2014"} />
              <LookupRow label="Joined" value={u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "\u2014"} />
              <LookupRow label="Date of Birth" value={u.date_of_birth || "\u2014"} />
            </View>

            <View style={[styles.lookupCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.lookupCardTitle, { color: colors.text }]}>Rank & Economy</Text>
              <LookupRow label="Grade" value={gradeMap[u.current_grade] || "Explorer"} valueColor={GOLD} />
              <LookupRow label="Level" value={u.level.toString()} />
              <LookupRow label="Nexa (XP)" value={(u.xp || 0).toLocaleString()} valueColor={BRAND} />
              <LookupRow label="ACoin" value={(u.acoin || 0).toLocaleString()} valueColor={GOLD} />
              <LookupRow label="Membership" value={u.subscription ? ((u.subscription as any).subscription_plans?.name || "Premium") : "Standard"} valueColor={u.subscription ? GOLD : undefined} />
              {u.subscription ? <LookupRow label="Plan Tier" value={(u.subscription as any).subscription_plans?.tier || "\u2014"} /> : null}
              <LookupRow label="Tipping" value={u.tipping_enabled ? "Enabled" : "Disabled"} valueColor={u.tipping_enabled ? "#10B981" : "#FF3B30"} />
            </View>

            <View style={[styles.lookupCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.lookupCardTitle, { color: colors.text }]}>Activity Summary</Text>
              <LookupRow label="Posts Created" value={u.posts.toLocaleString()} />
              <LookupRow label="Posts Liked" value={(u.postLikeCount || 0).toLocaleString()} />
              <LookupRow label="Chats" value={(u.chatCount || 0).toLocaleString()} />
              <LookupRow label="Messages Sent" value={(u.messageCount || 0).toLocaleString()} />
              <LookupRow label="Nexa Transfers Sent" value={u.nexaSent.toLocaleString()} />
              <LookupRow label="Nexa Transfers Received" value={u.nexaReceived.toLocaleString()} />
              <LookupRow label="ACoin Transactions" value={u.acoinTxCount.toLocaleString()} />
              <LookupRow label="Gifts Sent" value={u.giftsSent.toLocaleString()} />
              <LookupRow label="Gifts Received" value={u.giftsReceived.toLocaleString()} />
              <LookupRow label="Red Envelopes Sent" value={u.redSent.toLocaleString()} />
              <LookupRow label="Red Envelopes Claimed" value={u.redReceived.toLocaleString()} />
            </View>

            {u.recentPosts && u.recentPosts.length > 0 && (
              <View style={[styles.lookupCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.lookupCardTitle, { color: colors.text }]}>Recent Posts ({u.posts})</Text>
                {u.recentPosts.map((post: any, i: number) => (
                  <View key={post.id} style={[styles.lookupListItem, i < u.recentPosts.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 }} numberOfLines={2}>{post.content || "\u2014"}</Text>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>{timeAgo(post.created_at)}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>{(post.view_count || 0)} views</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {u.likedPosts && u.likedPosts.length > 0 && (
              <View style={[styles.lookupCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.lookupCardTitle, { color: colors.text }]}>Posts Liked ({u.postLikeCount})</Text>
                {u.likedPosts.map((like: any, i: number) => (
                  <View key={like.post_id + i} style={[styles.lookupListItem, i < u.likedPosts.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 }} numberOfLines={2}>{like.posts?.content || "\u2014"}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{timeAgo(like.created_at)}</Text>
                  </View>
                ))}
              </View>
            )}

            {u.recentChats && u.recentChats.length > 0 && (
              <View style={[styles.lookupCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.lookupCardTitle, { color: colors.text }]}>Chats ({u.chatCount})</Text>
                {u.recentChats.map((chat: any, i: number) => {
                  const otherUserId = chat.user1_id === u.id ? chat.user2_id : chat.user1_id;
                  return (
                    <View key={chat.id} style={[styles.lookupListItem, i < u.recentChats.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 12, fontFamily: "Inter_500Medium" }}>Chat with {otherUserId.slice(0, 8)}...</Text>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>{timeAgo(chat.created_at)}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {u.followersList && u.followersList.length > 0 && (
              <View style={[styles.lookupCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.lookupCardTitle, { color: colors.text }]}>Followers ({u.followers})</Text>
                {u.followersList.map((f: any, i: number) => {
                  const p = f.profiles;
                  return (
                    <View key={f.follower_id} style={[styles.lookupListItem, i < u.followersList.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                      <View style={[styles.lookupListAvatar, { backgroundColor: BRAND + "20" }]}>
                        <Text style={{ color: BRAND, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{(p?.display_name || "?")[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_500Medium" }}>{p?.display_name || "\u2014"}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>@{p?.handle || "\u2014"}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {u.followingList && u.followingList.length > 0 && (
              <View style={[styles.lookupCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.lookupCardTitle, { color: colors.text }]}>Following ({u.following})</Text>
                {u.followingList.map((f: any, i: number) => {
                  const p = f.profiles;
                  return (
                    <View key={f.following_id} style={[styles.lookupListItem, i < u.followingList.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                      <View style={[styles.lookupListAvatar, { backgroundColor: "#3B82F620" }]}>
                        <Text style={{ color: "#3B82F6", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{(p?.display_name || "?")[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_500Medium" }}>{p?.display_name || "\u2014"}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>@{p?.handle || "\u2014"}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={[styles.lookupCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.lookupCardTitle, { color: colors.text }]}>Account Status</Text>
              <LookupRow label="Verified" value={u.is_verified ? "Yes" : "No"} valueColor={u.is_verified ? "#10B981" : "#FF3B30"} />
              <LookupRow label="Org Verified" value={u.is_organization_verified ? "Yes" : "No"} valueColor={u.is_organization_verified ? GOLD : colors.textMuted} />
              <LookupRow label="Admin" value={u.is_admin ? "Yes" : "No"} valueColor={u.is_admin ? BRAND : colors.textMuted} />
              <LookupRow label="Private" value={u.is_private ? "Yes" : "No"} />
              <LookupRow label="Online Status" value={u.show_online_status ? "Visible" : "Hidden"} />
              <LookupRow label="Onboarding" value={u.onboarding_completed ? "Completed" : "Incomplete"} valueColor={u.onboarding_completed ? "#10B981" : "#FF9500"} />
              <LookupRow label="Deletion Scheduled" value={u.scheduled_deletion_at ? new Date(u.scheduled_deletion_at).toLocaleDateString() : "No"} valueColor={u.scheduled_deletion_at ? "#FF3B30" : "#10B981"} />
            </View>

            {u.interests && u.interests.length > 0 && (
              <View style={[styles.lookupCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.lookupCardTitle, { color: colors.text }]}>Interests</Text>
                <View style={styles.lookupInterests}>
                  {u.interests.map((interest: string, i: number) => (
                    <View key={i} style={[styles.lookupInterestChip, { backgroundColor: BRAND + "15" }]}>
                      <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_500Medium" }}>{interest}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  }

  function renderOverview() {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Platform Overview</Text>
        <View style={styles.statsGrid}>
          <StatCard title="Users" value={stats.totalUsers} icon="people" color={BRAND} colors={colors} />
          <StatCard title="Posts" value={stats.totalPosts} icon="document-text" color="#3B82F6" colors={colors} />
          <StatCard title="Chats" value={stats.totalChats} icon="chatbubbles" color="#8B5CF6" colors={colors} />
          <StatCard title="Messages" value={stats.totalMessages} icon="mail" color="#10B981" colors={colors} />
        </View>
        <View style={styles.statsGrid}>
          <StatCard title="Premium" value={stats.premiumUsers} icon="diamond" color={GOLD} colors={colors} />
          <StatCard title="Verified" value={stats.verifiedUsers} icon="checkmark-circle" color={GOLD} colors={colors} />
          <StatCard title="Stories" value={stats.totalStories} icon="aperture" color="#EC4899" colors={colors} />
          <StatCard title="Channels" value={stats.totalChannels} icon="megaphone" color="#6366F1" colors={colors} />
        </View>
        <View style={styles.statsGrid}>
          <StatCard title="Nexa" value={stats.totalNexa} icon="flash" color="#EF4444" colors={colors} />
          <StatCard title="ACoin" value={stats.totalAcoin} icon="diamond" color="#F59E0B" colors={colors} />
          <StatCard title="Referrals" value={stats.totalReferrals} icon="git-network" color="#14B8A6" colors={colors} />
          <StatCard title="Pending Del." value={stats.pendingDeletions} icon="trash" color="#FF3B30" colors={colors} />
        </View>
      </View>
    );
  }

  function renderUsers() {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>User Management</Text>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          placeholder="Search users..."
          placeholderTextColor={colors.textMuted}
          value={userSearch}
          onChangeText={setUserSearch}
        />
        {users.map((u) => (
          <View key={u.id} style={[styles.userRow, { backgroundColor: colors.surface }]}>
            <View style={[styles.userAvatar, { backgroundColor: BRAND }]}>
              <Text style={styles.userAvatarText}>{(u.display_name || "?").charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>{u.display_name}</Text>
                {u.is_organization_verified && <Ionicons name="checkmark-circle" size={14} color={GOLD} />}
                {!u.is_organization_verified && u.is_verified && <Ionicons name="checkmark-circle" size={14} color={BRAND} />}
                {u.is_admin && <Ionicons name="shield-checkmark" size={14} color={BRAND} />}
              </View>
              <Text style={[styles.userHandle, { color: colors.textSecondary }]}>@{u.handle}</Text>
              <Text style={[styles.userMeta, { color: colors.textMuted }]}>
                {u.current_grade} | Nexa: {u.xp?.toLocaleString()} | ACoin: {u.acoin?.toLocaleString()}
              </Text>
            </View>
            <View style={styles.userActions}>
              <View style={{ alignItems: "center" }}>
                <Text style={[{ fontSize: 9, color: colors.textMuted }]}>Verified</Text>
                <Switch
                  value={u.is_verified}
                  onValueChange={() => toggleVerification(u.id, u.is_verified)}
                  trackColor={{ true: GOLD, false: colors.border }}
                  thumbColor="#fff"
                />
              </View>
              <TouchableOpacity
                style={[styles.balanceBtn, { borderColor: colors.border }]}
                onPress={() => setBalanceModal(u)}
              >
                <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Balance</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    );
  }

  function renderContent() {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Content Moderation</Text>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          placeholder="Search posts..."
          placeholderTextColor={colors.textMuted}
          value={postSearch}
          onChangeText={setPostSearch}
        />
        {posts.map((p) => (
          <View key={p.id} style={[styles.postRow, { backgroundColor: colors.surface }]}>
            <View style={styles.postHeader}>
              <View>
                <Text style={[styles.postAuthor, { color: colors.text }]}>{p.author_name}</Text>
                <Text style={[styles.postHandle, { color: colors.textMuted }]}>@{p.author_handle} · {timeAgo(p.created_at)}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: p.is_blocked ? "#FF3B3020" : "#10B98120" }]}>
                <Text style={{ color: p.is_blocked ? "#FF3B30" : "#10B981", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {p.is_blocked ? "Blocked" : "Active"}
                </Text>
              </View>
            </View>
            <Text style={[styles.postContent, { color: colors.textSecondary }]} numberOfLines={3}>{p.content}</Text>
            <View style={styles.postActions}>
              <Text style={[{ fontSize: 12, color: colors.textMuted }]}>{p.view_count} views</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: colors.border }]}
                  onPress={() => togglePostBlock(p.id, p.is_blocked)}
                >
                  <Text style={{ color: p.is_blocked ? "#10B981" : "#FF9500", fontSize: 12 }}>
                    {p.is_blocked ? "Unblock" : "Block"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: "#FF3B30", backgroundColor: "#FF3B3010" }]}
                  onPress={() => deletePost(p.id)}
                >
                  <Text style={{ color: "#FF3B30", fontSize: 12 }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
        {posts.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No posts found</Text>
        )}
      </View>
    );
  }

  function renderReferrals() {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Referral Tracking</Text>
        <View style={[styles.referralSummary, { backgroundColor: colors.surface }]}>
          <View style={styles.referralSummaryRow}>
            <View style={styles.referralSummaryItem}>
              <Text style={[styles.referralSummaryValue, { color: BRAND }]}>{stats.totalReferrals}</Text>
              <Text style={[styles.referralSummaryLabel, { color: colors.textMuted }]}>Total Referrals</Text>
            </View>
            <View style={styles.referralSummaryItem}>
              <Text style={[styles.referralSummaryValue, { color: GOLD }]}>{(stats.totalReferrals * 500).toLocaleString()}</Text>
              <Text style={[styles.referralSummaryLabel, { color: colors.textMuted }]}>Nexa Rewarded</Text>
            </View>
          </View>
        </View>
        {referrals.map((r: any) => (
          <View key={r.id} style={[styles.referralRow, { backgroundColor: colors.surface }]}>
            <Ionicons name="git-network" size={18} color="#14B8A6" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.referralText, { color: colors.text }]}>
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>{r.referrer?.display_name || "Unknown"}</Text>
                {" → "}
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>{r.referred?.display_name || "Unknown"}</Text>
              </Text>
              <Text style={[styles.referralMeta, { color: colors.textMuted }]}>
                @{r.referrer?.handle || "?"} referred @{r.referred?.handle || "?"} · {timeAgo(r.created_at)}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: r.reward_given ? "#10B98120" : "#FF950020" }]}>
              <Text style={{ color: r.reward_given ? "#10B981" : "#FF9500", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                {r.reward_given ? "Rewarded" : "Pending"}
              </Text>
            </View>
          </View>
        ))}
        {referrals.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No referrals yet</Text>
        )}
      </View>
    );
  }

  function renderSubscriptions() {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Subscription Plans</Text>
        {plans.map((plan) => (
          <View key={plan.id} style={[styles.planCard, { backgroundColor: colors.surface }]}>
            <View style={styles.planHeader}>
              <View>
                <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
                <Text style={[styles.planTier, { color: colors.textMuted }]}>{plan.tier} · {plan.duration_days} days</Text>
              </View>
              <View style={[styles.priceBadge, { backgroundColor: GOLD + "20" }]}>
                <Ionicons name="diamond" size={14} color={GOLD} />
                <Text style={[styles.priceText, { color: GOLD }]}>{plan.acoin_price}</Text>
              </View>
            </View>
            <Text style={[styles.planDesc, { color: colors.textSecondary }]}>{plan.description}</Text>
            <View style={[styles.planStatus, { backgroundColor: plan.is_active ? "#10B98115" : "#FF3B3015" }]}>
              <Text style={{ color: plan.is_active ? "#10B981" : "#FF3B30", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                {plan.is_active ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>
        ))}
        {plans.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No subscription plans configured</Text>
        )}
      </View>
    );
  }

  function renderCurrency() {
    if (!currencySettings) {
      return (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Currency Settings</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No currency settings found</Text>
        </View>
      );
    }
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Currency Settings</Text>
        <View style={[styles.currencyCard, { backgroundColor: colors.surface }]}>
          <View style={styles.currencyRow}>
            <Text style={[styles.currencyLabel, { color: colors.textSecondary }]}>Nexa → ACoin Rate</Text>
            <Text style={[styles.currencyValue, { color: colors.text }]}>{currencySettings.nexa_to_acoin_rate}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.currencyRow}>
            <Text style={[styles.currencyLabel, { color: colors.textSecondary }]}>Conversion Fee</Text>
            <Text style={[styles.currencyValue, { color: colors.text }]}>{currencySettings.conversion_fee_percent}%</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.currencyRow}>
            <Text style={[styles.currencyLabel, { color: colors.textSecondary }]}>P2P Fee</Text>
            <Text style={[styles.currencyValue, { color: colors.text }]}>{currencySettings.p2p_fee_percent}%</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {[
            { label: "Rate +10", field: "nexa_to_acoin_rate", delta: 10 },
            { label: "Rate -10", field: "nexa_to_acoin_rate", delta: -10 },
            { label: "Conv Fee +1%", field: "conversion_fee_percent", delta: 1 },
            { label: "Conv Fee -1%", field: "conversion_fee_percent", delta: -1 },
          ].map((btn) => (
            <TouchableOpacity
              key={btn.label}
              style={[styles.currencyBtn, { borderColor: colors.border }]}
              onPress={() => {
                const current = (currencySettings as any)[btn.field] || 0;
                updateCurrency(btn.field, Math.max(0, current + btn.delta));
              }}
            >
              <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  function renderReports() {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Moderation Reports</Text>
        {reports.map((r: any) => (
          <View key={r.id} style={[styles.reportCard, { backgroundColor: colors.surface }]}>
            <View style={styles.reportHeader}>
              <Ionicons name="flag" size={16} color="#FF3B30" />
              <Text style={[styles.reportReason, { color: colors.text }]}>{r.reason || "No reason given"}</Text>
            </View>
            <Text style={[styles.reportMeta, { color: colors.textMuted }]}>
              Reporter: {r.reporter_name || "Unknown"} → Reported: {r.reported_name || "Unknown"}
            </Text>
            <View style={styles.reportFooter}>
              <View style={[styles.statusBadge, { backgroundColor: r.status === "resolved" ? "#10B98120" : "#FF950020" }]}>
                <Text style={{ color: r.status === "resolved" ? "#10B981" : "#FF9500", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {r.status || "Pending"}
                </Text>
              </View>
              <Text style={[{ fontSize: 11, color: colors.textMuted }]}>{timeAgo(r.created_at)}</Text>
            </View>
          </View>
        ))}
        {reports.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No reports found</Text>
        )}
      </View>
    );
  }

  const tabContent: Record<string, () => React.ReactNode> = {
    overview: renderOverview,
    lookup: renderLookup,
    users: renderUsers,
    content: renderContent,
    referrals: renderReferrals,
    subs: renderSubscriptions,
    currency: renderCurrency,
    reports: renderReports,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Ionicons name="shield-checkmark" size={20} color={BRAND} />
            <Text style={[styles.headerTitle, { color: colors.text }]}>Admin Dashboard</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.activeTab]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Ionicons
                name={tab.icon as any}
                size={16}
                color={activeTab === tab.id ? BRAND : colors.textMuted}
              />
              <Text style={[styles.tabText, { color: activeTab === tab.id ? BRAND : colors.textMuted }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <AdminSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
          showsVerticalScrollIndicator={false}
        >
          {tabContent[activeTab]?.()}
        </ScrollView>
      )}

      <Modal visible={!!balanceModal} transparent animationType="fade" onRequestClose={() => setBalanceModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Adjust Balance: {balanceModal?.display_name}
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              Nexa: {balanceModal?.xp?.toLocaleString()} | ACoin: {balanceModal?.acoin?.toLocaleString()}
            </Text>
            <View style={styles.modalSection}>
              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Nexa</Text>
              <View style={styles.modalBtnRow}>
                {[100, 500, 1000].map(amt => (
                  <TouchableOpacity key={`xp+${amt}`} style={[styles.modalBtn, { backgroundColor: BRAND + "20" }]}
                    onPress={() => balanceModal && adjustBalance(balanceModal.id, "xp", amt)}>
                    <Text style={{ color: BRAND, fontFamily: "Inter_600SemiBold" }}>+{amt}</Text>
                  </TouchableOpacity>
                ))}
                {[100, 500].map(amt => (
                  <TouchableOpacity key={`xp-${amt}`} style={[styles.modalBtn, { backgroundColor: "#FF3B3020" }]}
                    onPress={() => balanceModal && adjustBalance(balanceModal.id, "xp", -amt)}>
                    <Text style={{ color: "#FF3B30", fontFamily: "Inter_600SemiBold" }}>-{amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.modalSection}>
              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>ACoin</Text>
              <View style={styles.modalBtnRow}>
                {[100, 500, 1000].map(amt => (
                  <TouchableOpacity key={`ac+${amt}`} style={[styles.modalBtn, { backgroundColor: GOLD + "20" }]}
                    onPress={() => balanceModal && adjustBalance(balanceModal.id, "acoin", amt)}>
                    <Text style={{ color: GOLD, fontFamily: "Inter_600SemiBold" }}>+{amt}</Text>
                  </TouchableOpacity>
                ))}
                {[100, 500].map(amt => (
                  <TouchableOpacity key={`ac-${amt}`} style={[styles.modalBtn, { backgroundColor: "#FF3B3020" }]}
                    onPress={() => balanceModal && adjustBalance(balanceModal.id, "acoin", -amt)}>
                    <Text style={{ color: "#FF3B30", fontFamily: "Inter_600SemiBold" }}>-{amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.border }]} onPress={() => setBalanceModal(null)}>
              <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  noAccess: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginTop: 12 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  tabBar: { paddingHorizontal: 12, paddingBottom: 10, gap: 4 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "transparent" },
  activeTab: { backgroundColor: "#34A85315" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  scrollContent: { padding: 16 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  statsGrid: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, padding: 12, borderRadius: 14, alignItems: "center", gap: 6 },
  statIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  searchInput: { height: 44, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, fontFamily: "Inter_400Regular", borderWidth: 1 },
  userRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, gap: 10 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  userAvatarText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  userHandle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  userMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  userActions: { alignItems: "center", gap: 6 },
  balanceBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  postRow: { padding: 14, borderRadius: 14, gap: 8 },
  postHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  postAuthor: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  postHandle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  postContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  postActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  planCard: { padding: 16, borderRadius: 14, gap: 8 },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  planTier: { fontSize: 12, fontFamily: "Inter_400Regular" },
  planDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  planStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, alignSelf: "flex-start" },
  priceBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  priceText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  currencyCard: { borderRadius: 14, overflow: "hidden" },
  currencyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  currencyLabel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  currencyValue: { fontSize: 17, fontFamily: "Inter_700Bold" },
  divider: { height: StyleSheet.hairlineWidth },
  currencyBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  reportCard: { padding: 14, borderRadius: 14, gap: 8 },
  reportHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  reportReason: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  reportMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  reportFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  referralSummary: { borderRadius: 14, padding: 16 },
  referralSummaryRow: { flexDirection: "row", gap: 16 },
  referralSummaryItem: { flex: 1, alignItems: "center", gap: 4 },
  referralSummaryValue: { fontSize: 24, fontFamily: "Inter_700Bold" },
  referralSummaryLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  referralRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, gap: 10 },
  referralText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  referralMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  emptyText: { textAlign: "center", fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 32 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalContent: { width: "100%", borderRadius: 20, padding: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modalSection: { gap: 8 },
  modalLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalBtnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  closeBtn: { alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  lookupBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#34A853", alignItems: "center", justifyContent: "center" },
  lookupErrorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, marginTop: 8 },
  lookupProfileHeader: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, gap: 12 },
  lookupAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  lookupQuickStats: { flexDirection: "row", gap: 8 },
  lookupQuickStat: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", gap: 4 },
  lookupCard: { borderRadius: 14, padding: 16, gap: 0 },
  lookupCardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 8 },
  lookupRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  lookupLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  lookupValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right", maxWidth: "55%" },
  lookupInterests: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 4 },
  lookupInterestChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16 },
  lookupListItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  lookupListAvatar: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center" },
});
