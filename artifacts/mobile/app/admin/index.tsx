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
  Dimensions,
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

const BRAND = "#00C2CB";
const GOLD = "#D4A853";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
  activeTab: { backgroundColor: "#00C2CB15" },
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
});
