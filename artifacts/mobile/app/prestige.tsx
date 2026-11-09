import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { navigateToProfile } from "@/lib/navigateToProfile";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { PRESTIGE_TIERS, getPrestigeTier, getNextPrestigeTier, prestigeProgress } from "@/lib/prestige";
import { Avatar } from "@/components/ui/Avatar";
import { invalidateUserEffects } from "@/hooks/useUserEffects";
import { ListRowSkeleton } from "@/components/ui/Skeleton";

const { width: SCREEN_W } = Dimensions.get("window");

type RichUser = { id: string; display_name: string; handle: string; acoin: number; avatar_url: string | null };
type Purchase = { id: string; good_id: string; good_name: string; good_emoji: string; acoin_cost: number; tier_required: string; equipped: boolean; created_at: string };

const TIER_ID_ORDER = ["bronze", "silver", "gold", "diamond", "obsidian", "legend"];
function tierIndex(id: string) { return TIER_ID_ORDER.indexOf(id); }

function fmtAcoin(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

// ── Status Goods — grouped by category with WHERE the effect appears ──────────
const SHOP_CATEGORIES = [
  {
    id: "avatar",
    label: "Avatar Effects",
    emoji: "🪞",
    subtitle: "Visible on your profile photo everywhere",
    items: [
      { id: "sg2", name: "Obsidian Void Ring",  emoji: "⬛", where: "Avatar ring in chats & profile",  description: "Your avatar pulses with a dark void aura in every conversation.", acoin: 20000, tier: "obsidian" },
      { id: "sg3", name: "Diamond Halo",         emoji: "💎", where: "Avatar ring in chats & profile",  description: "Ice-blue shimmer ring visible to everyone who sees your avatar.", acoin: 8000,  tier: "diamond" },
      { id: "sg1", name: "Crown Aura",            emoji: "👑", where: "Avatar ring in chats & profile",  description: "An animated gold crown floats above your avatar in every chat.", acoin: 50000, tier: "legend" },
    ],
  },
  {
    id: "name",
    label: "Name Effects",
    emoji: "✍️",
    subtitle: "Changes how your name appears in chats and posts",
    items: [
      { id: "sg4", name: "Gold Nameplate",  emoji: "🥇", where: "Your name in every chat & comment", description: "Your display name renders in gold wherever it appears on AfuChat.", acoin: 2500,  tier: "gold" },
      { id: "sg5", name: "Verified Star",   emoji: "⭐", where: "Next to your name everywhere",       description: "A gold star badge appears beside your name on posts and in DMs.", acoin: 1500,  tier: "silver" },
      { id: "sg7", name: "Royalty Title",   emoji: "🎖️", where: "Under your name on your profile", description: "Shows 'Royalty of AfuChat' as a custom title on your profile page.", acoin: 30000, tier: "obsidian" },
    ],
  },
  {
    id: "messages",
    label: "Message Effects",
    emoji: "💬",
    subtitle: "Shows up on every message you send",
    items: [
      { id: "sg8", name: "Status Glow",    emoji: "💎", where: "On every message bubble you send",  description: "A soft prestige-colored glow frames all your chat messages.", acoin: 3000,  tier: "gold" },
    ],
  },
  {
    id: "exclusive",
    label: "Exclusive",
    emoji: "🔒",
    subtitle: "One-time or limited items for true believers",
    items: [
      { id: "sg6", name: "Founder's Seal", emoji: "🔏", where: "Profile badge. Lifetime status", description: "Exclusive for early AfuChat believers. Proves you were here first. Never sold again.", acoin: 100000, tier: "legend" },
    ],
  },
];

const ALL_GOODS = SHOP_CATEGORIES.flatMap((c) => c.items);

type Tab = "overview" | "shop" | "ranks" | "history";

export default function PrestigeScreen() {
  const { user, profile, refreshProfile, equippedGoods } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [richList,         setRichList]         = useState<RichUser[]>([]);
  const [nearYou,          setNearYou]           = useState<RichUser[]>([]);
  const [myRank,           setMyRank]            = useState<number | null>(null);
  const [totalUsers,       setTotalUsers]        = useState<number>(0);
  const [loadingList,      setLoadingList]       = useState(true);
  const [purchases,        setPurchases]         = useState<Purchase[]>([]);
  const [transactions,     setTransactions]      = useState<any[]>([]);
  const [purchasing,       setPurchasing]        = useState<string | null>(null);
  const [refreshing,       setRefreshing]        = useState(false);
  const [activeTab,        setActiveTab]         = useState<Tab>("overview");
  const [profileStats,     setProfileStats]      = useState<{ posts: number; messages: number; friends: number; stories: number; reactions: number } | null>(null);

  const acoin    = profile?.acoin || 0;
  const tier     = getPrestigeTier(acoin);
  const nextTier = getNextPrestigeTier(acoin);
  const progress = prestigeProgress(acoin);

  const ownedIds    = new Set(purchases.map((p) => p.good_id));
  const equippedIds = new Set(purchases.filter((p) => p.equipped).map((p) => p.good_id));


  const loadData = useCallback(async () => {
    if (!user) return;

    const [richRes, aheadRes, totalRes, purchaseRes, txRes, statsRes, followsRes] = await Promise.all([
      supabase.from("profiles").select("id, display_name, handle, acoin, avatar_url").order("acoin", { ascending: false }).limit(50),
      supabase.from("profiles").select("id", { count: "exact", head: true }).gt("acoin", acoin),
      supabase.from("profiles").select("id", { count: "exact", head: true }).gt("acoin", 0),
      supabase.from("status_goods_purchases").select("id, good_id, good_name, good_emoji, acoin_cost, tier_required, equipped, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("acoin_transactions").select("id, amount, transaction_type, created_at, metadata").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", user.id),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id),
    ]);

    const rank = (aheadRes.count ?? 0) + 1;
    if (richRes.data) setRichList(richRes.data as RichUser[]);
    setMyRank(rank);
    setTotalUsers(totalRes.count ?? 0);
    if (purchaseRes.data) setPurchases(purchaseRes.data as Purchase[]);

    if (richRes.data) {
      const nearStart = Math.max(0, rank - 4);
      const nearEnd   = Math.min(richRes.data.length, rank + 3);
      const near = richRes.data.slice(nearStart, nearEnd).filter((u: RichUser) => u.id !== user.id);
      setNearYou(near);
    }

    if (txRes.data) {
      setTransactions(txRes.data.map((t: any) => {
        let label = t.transaction_type.replace(/_/g, " ");
        let icon  = "diamond";
        let color = t.amount > 0 ? "#34C759" : "#FF9500";
        if (t.transaction_type === "status_good_purchase") { label = `${t.metadata?.good_emoji || ""} ${t.metadata?.good_name || "Status Good"}`; icon = "star"; color = "#AF52DE"; }
        else if (t.transaction_type === "conversion")       { label = "Nexa converted to ACoin"; icon = "swap-horizontal"; color = "#FF9500"; }
        else if (t.transaction_type === "topup")            { label = "ACoin Top-Up"; icon = "card"; color = "#34C759"; }
        else if (t.transaction_type === "subscription")     { label = `Premium: ${t.metadata?.plan_name || "Plan"}`; icon = "diamond"; color = "#FF9500"; }
        else if (t.transaction_type === "gift_sent")        { label = `Gift sent: ${t.metadata?.gift_name || ""}`; icon = "gift"; color = "#FF9500"; }
        else if (t.transaction_type === "gift_received")    { label = `Gift received: ${t.metadata?.gift_name || ""}`; icon = "gift"; color = "#34C759"; }
        return { ...t, label, icon, color };
      }));
    }

    setProfileStats({
      posts:     statsRes.count ?? 0,
      messages:  0,
      friends:   followsRes.count ?? 0,
      stories:   0,
      reactions: 0,
    });

    setLoadingList(false);
  }, [user, acoin]);

  useEffect(() => { loadData().finally(() => setRefreshing(false)); }, [loadData]);

  async function purchaseGood(item: typeof ALL_GOODS[0]) {
    if (!user || !profile) return;
    if (ownedIds.has(item.id)) { showAlert("Already Owned", `You already own ${item.emoji} ${item.name}.`); return; }
    if (acoin < item.acoin)    { showAlert("Not Enough ACoin", `You need ${item.acoin.toLocaleString()} AC but have ${acoin.toLocaleString()} AC.\n\nTop up your wallet to purchase this item.`, [{ text: "Top Up", onPress: () => router.push("/app/afupay") }, { text: "Cancel", style: "cancel" }]); return; }
    const tierIdx = tierIndex(tier.id);
    const reqIdx  = tierIndex(item.tier);
    if (tierIdx < reqIdx) {
      const reqTier = PRESTIGE_TIERS.find((t) => t.id === item.tier)!;
      showAlert("Tier Required", `${item.emoji} ${item.name} requires ${reqTier.emoji} ${reqTier.label} tier (${reqTier.minAcoin.toLocaleString()} AC). You need ${(reqTier.minAcoin - acoin).toLocaleString()} more AC.`);
      return;
    }
    showAlert(
      `Buy ${item.emoji} ${item.name}`,
      `Cost: ${item.acoin.toLocaleString()} ACoin\nBalance after: ${(acoin - item.acoin).toLocaleString()} AC\n\n${item.description}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Purchase",
          onPress: async () => {
            setPurchasing(item.id);
            const { data, error } = await supabase.rpc("purchase_status_good", {
              p_user_id: user.id, p_good_id: item.id, p_good_name: item.name,
              p_good_emoji: item.emoji, p_acoin_cost: item.acoin, p_tier_required: item.tier,
            });
            setPurchasing(null);
            if (error) { showAlert("Error", error.message); return; }
            const result = data as { ok: boolean; error?: string };
            if (!result.ok) { showAlert("Purchase Failed", result.error || "Please try again."); return; }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showAlert("Purchased!", `${item.emoji} ${item.name} is now in your collection. Equip it from the Shop tab.`);
            refreshProfile();
            loadData();
          },
        },
      ],
    );
  }

  async function toggleEquip(p: Purchase) {
    const next = !p.equipped;
    const { error } = await supabase.from("status_goods_purchases").update({ equipped: next }).eq("id", p.id);
    if (error) { showAlert("Error", error.message); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPurchases((prev) => prev.map((pp) => pp.id === p.id ? { ...pp, equipped: next } : pp));
    if (user?.id) {
      invalidateUserEffects(user.id);
      refreshProfile();
    }
  }



  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "layers" },
    { id: "shop",     label: "Shop",     icon: "storefront" },
    { id: "ranks",    label: "Ranks",    icon: "trophy" },
    { id: "history",  label: "History",  icon: "receipt" },
  ];

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={tier.color} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
      >

        {/* ── HERO ────────────────────────────────────────────────────────── */}
        <LinearGradient
          colors={[tier.ringColors[0], tier.ringColors[1], isDark ? "#0a0a0a" : "#111"]}
          locations={[0, 0.5, 1]}
          style={[s.hero, { paddingTop: insets.top + 8 }]}
        >
          {/* Nav */}
          <View style={s.heroNav}>
            <TouchableOpacity style={s.navBtn} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={s.navTitle}>Prestige</Text>
            <TouchableOpacity style={s.navBtn} onPress={() => router.push("/app/afupay")} hitSlop={12}>
              <Ionicons name="wallet" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Avatar + tier ring */}
          <View style={s.avatarWrap}>
            <View
              style={[
                s.tierRing,
                {
                  borderColor: tier.color,
                  ...Platform.select({ web: { boxShadow: `0 0 16px ${tier.glowColor}99` } as any, default: { shadowColor: tier.glowColor, shadowOpacity: 0.6 } }),
                },
              ]}
            />
            <Avatar uri={profile?.avatar_url} name={profile?.display_name || "You"} size={84} />
            <View style={[s.tierBadge, { backgroundColor: tier.color }]}>
              <Text style={s.tierBadgeEmoji}>{tier.emoji}</Text>
            </View>
          </View>

          {/* Name + tier */}
          <Text style={s.heroName}>{profile?.display_name || "You"}</Text>
          <View style={[s.tierLabelRow, { backgroundColor: tier.color + "28", borderColor: tier.color + "55" }]}>
            <Text style={[s.tierLabelText, { color: tier.color }]}>{tier.label}</Text>
            <Text style={[s.tierTagline, { color: "rgba(255,255,255,0.7)" }]}> · {tier.tagline}</Text>
          </View>

          {/* Stats row */}
          <View style={s.heroStats}>
            <View style={s.heroStatItem}>
              <Text style={s.heroStatValue}>{fmtAcoin(acoin)}</Text>
              <Text style={s.heroStatLabel}>🪙 ACoin</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStatItem}>
              <Text style={s.heroStatValue}>{myRank != null ? `#${myRank}` : "N/A"}</Text>
              <Text style={s.heroStatLabel}>Rich List</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStatItem}>
              <Text style={s.heroStatValue}>{purchases.length}</Text>
              <Text style={s.heroStatLabel}>Owned Items</Text>
            </View>
          </View>

          {/* Progress to next tier */}
          {nextTier ? (
            <View style={s.progressWrap}>
              <View style={s.progressLabels}>
                <Text style={s.progressFrom}>{tier.emoji} {tier.label}</Text>
                <Text style={s.progressGap}>{(nextTier.minAcoin - acoin).toLocaleString()} AC to go</Text>
                <Text style={s.progressTo}>{nextTier.emoji} {nextTier.label}</Text>
              </View>
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    { width: `${Math.round(progress * 100)}%` as any, backgroundColor: tier.color },
                  ]}
                />
              </View>
              <TouchableOpacity
                style={[s.tierUnlockHint, { borderColor: nextTier.color + "55", backgroundColor: nextTier.color + "14" }]}
                onPress={() => setActiveTab("overview")}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 14 }}>{nextTier.emoji}</Text>
                <Text style={[s.tierUnlockHintText, { color: nextTier.color }]}>
                  Unlock {nextTier.label}: {nextTier.perks[0]?.text}
                </Text>
                <Ionicons name="chevron-forward" size={13} color={nextTier.color} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[s.maxBadge, { backgroundColor: tier.color + "22" }]}>
              <Text style={s.maxText}>👑 Maximum Prestige. You are a Legend</Text>
            </View>
          )}
        </LinearGradient>

        {/* ── Tier Roadmap ────────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.roadmapRow}>
          {PRESTIGE_TIERS.map((t, idx) => {
            const isActive   = t.id === tier.id;
            const isUnlocked = acoin >= t.minAcoin;
            const isLast     = idx === PRESTIGE_TIERS.length - 1;
            return (
              <View key={t.id} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={[s.roadmapChip, {
                  borderColor: isActive ? t.color : isUnlocked ? t.color + "55" : colors.border,
                  backgroundColor: isActive ? t.color + "18" : colors.surface,
                  ...Platform.select({ web: { boxShadow: isActive ? `0 0 8px ${t.glowColor}80` : "none" } as any, default: { shadowColor: isActive ? t.glowColor : "transparent", shadowOpacity: isActive ? 0.5 : 0, shadowRadius: 8, elevation: isActive ? 4 : 0 } }),
                }]}>
                  <Text style={[s.roadmapEmoji, { opacity: isUnlocked ? 1 : 0.35 }]}>{t.emoji}</Text>
                  <Text style={[s.roadmapLabel, { color: isActive ? t.color : isUnlocked ? colors.textSecondary : colors.textMuted }]}>{t.label}</Text>
                  <Text style={[s.roadmapMin, { color: isActive ? t.color + "BB" : colors.textMuted }]}>
                    {t.minAcoin >= 1000 ? `${fmtAcoin(t.minAcoin)} AC` : "Free"}
                  </Text>
                  {isActive && <View style={[s.activeIndicator, { backgroundColor: t.color }]} />}
                  {!isUnlocked && <Ionicons name="lock-closed" size={9} color={colors.textMuted} style={s.roadmapLock} />}
                </View>
                {!isLast && <View style={[s.roadmapLine, { backgroundColor: isUnlocked ? tier.color + "40" : colors.border }]} />}
              </View>
            );
          })}
        </ScrollView>

        {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
        <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[s.tabItem, active && { borderBottomColor: tier.color }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab.id); }}
                activeOpacity={0.7}
              >
                <Ionicons name={tab.icon as any} size={15} color={active ? tier.color : colors.textMuted} />
                <Text style={[s.tabLabel, { color: active ? tier.color : colors.textMuted }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── OVERVIEW ────────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <View style={s.section}>
            <View style={[s.valueCard, { backgroundColor: colors.surface, borderColor: tier.color + "45" }]}>
              <View style={[s.valueIcon, { backgroundColor: tier.color + "18" }]}>
                <Ionicons name="star-outline" size={20} color={tier.color} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[s.valueTitle, { color: colors.text }]}>Make your activity count</Text>
                <Text style={[s.valueBody, { color: colors.textSecondary }]}>
                  ACoin is AfuChat's reward currency. Use it to unlock status goods, show your progress and make your presence your own.
                </Text>
              </View>
            </View>

            {/* Your tier perks */}
            <SectionHeader title={`${tier.emoji} ${tier.label.toUpperCase()} PERKS`} subtitle="Active benefits you have right now" colors={colors} />
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {tier.perks.map((perk, i) => (
                <View key={i}>
                  {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                  <View style={s.perkRow}>
                    <View style={[s.perkIconBox, { backgroundColor: tier.color + "18" }]}>
                      <Ionicons name={perk.icon as any} size={16} color={tier.color} />
                    </View>
                    <Text style={[s.perkText, { color: colors.text }]}>{perk.text}</Text>
                    <Ionicons name="checkmark-circle" size={16} color={tier.color} />
                  </View>
                </View>
              ))}
            </View>

            {/* Next tier preview */}
            {nextTier && (
              <>
                <SectionHeader title={`${nextTier.emoji} ${nextTier.label.toUpperCase()} UNLOCKS`} subtitle={`${(nextTier.minAcoin - acoin).toLocaleString()} AC away`} colors={colors} />
                <View style={[s.card, { backgroundColor: colors.surface, borderColor: nextTier.color + "40" }]}>
                  {nextTier.perks.map((perk, i) => (
                    <View key={i}>
                      {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                      <View style={s.perkRow}>
                        <View style={[s.perkIconBox, { backgroundColor: nextTier.color + "18" }]}>
                          <Ionicons name={perk.icon as any} size={16} color={nextTier.color + "88"} />
                        </View>
                        <Text style={[s.perkText, { color: colors.textMuted }]}>{perk.text}</Text>
                        <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* All tiers at a glance */}
            <SectionHeader title="ALL TIERS" subtitle="Tap a tier to see what it unlocks" colors={colors} />
            {PRESTIGE_TIERS.map((t) => {
              const isActive   = t.id === tier.id;
              const isUnlocked = acoin >= t.minAcoin;
              return (
                <View key={t.id} style={[s.tierRow, { backgroundColor: colors.surface, borderColor: isActive ? t.color + "55" : colors.border, opacity: isUnlocked ? 1 : 0.55 }]}>
                  <View style={[s.tierRowLeft, { backgroundColor: t.color + "18" }]}>
                    <Text style={s.tierRowEmoji}>{t.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[s.tierRowName, { color: isActive ? t.color : colors.text }]}>{t.label}</Text>
                      {isActive && <View style={[s.youPill, { backgroundColor: t.color + "22", borderColor: t.color + "44" }]}><Text style={[s.youText, { color: t.color }]}>You</Text></View>}
                    </View>
                    <Text style={[s.tierRowMin, { color: colors.textMuted }]}>
                      {t.minAcoin === 0 ? "Free to start" : `${t.minAcoin.toLocaleString()} AC`} · {t.perks.length} perks
                    </Text>
                  </View>
                  {isUnlocked
                    ? <Ionicons name="checkmark-circle" size={18} color={t.color} />
                    : <Text style={[s.tierRowNeed, { color: colors.textMuted }]}>+{(t.minAcoin - acoin).toLocaleString()}</Text>
                  }
                </View>
              );
            })}

            {/* How to earn */}
            <SectionHeader title="EARN MORE ACOIN" subtitle="Climb the tiers faster" colors={colors} />
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {[
                { emoji: "💳", label: "Top-Up ACoin",         sub: "Buy AC directly from your wallet",            action: "/app/afupay?section=topup" },
                { emoji: "🔄", label: "Convert Nexa → ACoin", sub: "Turn your XP into spendable ACoins",          action: "/app/afupay?section=exchange" },
                { emoji: "🎁", label: "Send & Receive Gifts", sub: "Gifting earns both sender and receiver AC",    action: "/app/afugifts" },
                { emoji: "💬", label: "Stay Active",           sub: "Daily activity rewards keep your rank up",    action: null },
              ].map((row, i) => (
                <View key={row.label}>
                  {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                  <TouchableOpacity
                    style={s.earnRow}
                    onPress={() => row.action ? router.push(row.action as any) : null}
                    activeOpacity={row.action ? 0.7 : 1}
                  >
                    <Text style={{ fontSize: 26 }}>{row.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.earnLabel, { color: colors.text }]}>{row.label}</Text>
                      <Text style={[s.earnSub, { color: colors.textMuted }]}>{row.sub}</Text>
                    </View>
                    {row.action && <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── SHOP ────────────────────────────────────────────────────────── */}
        {activeTab === "shop" && (
          <View style={s.section}>
            {/* My equipped items */}
            {equippedIds.size > 0 && (
              <>
                <SectionHeader title="EQUIPPED" subtitle="Currently active on your profile" colors={colors} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
                  {purchases.filter((p) => p.equipped).map((p) => {
                    const good = ALL_GOODS.find((g) => g.id === p.good_id);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[s.equippedChip, { backgroundColor: tier.color + "18", borderColor: tier.color + "55" }]}
                        onPress={() => toggleEquip(p)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 18 }}>{p.good_emoji}</Text>
                        <View>
                          <Text style={[s.equippedChipName, { color: tier.color }]}>{p.good_name}</Text>
                          <Text style={[s.equippedChipWhere, { color: colors.textMuted }]}>{good?.where || ""}</Text>
                        </View>
                        <Ionicons name="checkmark-circle" size={15} color={tier.color} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Shop by category */}
            {SHOP_CATEGORIES.map((cat) => {
              const canSeeAny = cat.items.some((item) => tierIndex(tier.id) >= tierIndex(item.tier));
              return (
                <View key={cat.id}>
                  <SectionHeader
                    title={`${cat.emoji} ${cat.label.toUpperCase()}`}
                    subtitle={cat.subtitle}
                    colors={colors}
                  />
                  <View style={{ gap: 10 }}>
                    {cat.items.map((item) => {
                      const itemTier     = PRESTIGE_TIERS.find((t) => t.id === item.tier)!;
                      const owned        = ownedIds.has(item.id);
                      const isEquipped   = equippedIds.has(item.id);
                      const tierUnlocked = tierIndex(tier.id) >= tierIndex(item.tier);
                      const canAfford    = acoin >= item.acoin;
                      const ownedPurchase = purchases.find((p) => p.good_id === item.id);
                      return (
                        <View
                          key={item.id}
                          style={[s.shopCard, {
                            backgroundColor: colors.surface,
                            borderColor: owned ? itemTier.color + "66" : tierUnlocked ? colors.border : colors.border,
                            opacity: tierUnlocked ? 1 : 0.5,
                          }]}
                        >
                          {/* Emoji + info */}
                          <View style={s.shopCardTop}>
                            <View style={[s.shopCardEmojiBox, { backgroundColor: itemTier.color + "18" }]}>
                              <Text style={s.shopCardEmoji}>{item.emoji}</Text>
                            </View>
                            <View style={{ flex: 1, gap: 3 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <Text style={[s.shopCardName, { color: colors.text }]}>{item.name}</Text>
                                {owned && <View style={[s.shopOwnedChip, { backgroundColor: itemTier.color + "22" }]}><Text style={[s.shopOwnedText, { color: itemTier.color }]}>Owned</Text></View>}
                              </View>
                              <View style={[s.whereRow]}>
                                <Ionicons name="eye" size={11} color={colors.textMuted} />
                                <Text style={[s.shopCardWhere, { color: colors.textMuted }]}>{item.where}</Text>
                              </View>
                              <Text style={[s.shopCardDesc, { color: colors.textSecondary }]}>{item.description}</Text>
                            </View>
                          </View>

                          {/* Bottom row */}
                          <View style={s.shopCardBottom}>
                            <View style={[s.tierRequiredChip, { backgroundColor: itemTier.color + "18" }]}>
                              <Text style={[s.tierRequiredText, { color: itemTier.color }]}>{itemTier.emoji} {itemTier.label}+</Text>
                            </View>
                            <Text style={[s.shopCardPrice, { color: Colors.gold }]}>
                              🪙 {fmtAcoin(item.acoin)}
                            </Text>

                            {owned && ownedPurchase ? (
                              <TouchableOpacity
                                style={[s.actionBtn, { backgroundColor: isEquipped ? tier.color : colors.backgroundSecondary, borderColor: isEquipped ? tier.color : colors.border }]}
                                onPress={() => toggleEquip(ownedPurchase)}
                              >
                                {isEquipped
                                  ? <><Ionicons name="checkmark" size={12} color="#fff" /><Text style={[s.actionBtnText, { color: "#fff" }]}>Equipped</Text></>
                                  : <Text style={[s.actionBtnText, { color: colors.textSecondary }]}>Equip</Text>
                                }
                              </TouchableOpacity>
                            ) : !tierUnlocked ? (
                              <View style={[s.actionBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                                <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
                                <Text style={[s.actionBtnText, { color: colors.textMuted }]}>Locked</Text>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={[s.actionBtn, { backgroundColor: canAfford ? tier.color : colors.backgroundSecondary, borderColor: canAfford ? tier.color : colors.border }]}
                                onPress={() => purchaseGood(item)}
                                disabled={purchasing === item.id}
                              >
                                {purchasing === item.id
                                  ? <ActivityIndicator size="small" color={canAfford ? "#fff" : colors.textMuted} />
                                  : <Text style={[s.actionBtnText, { color: canAfford ? "#fff" : colors.textMuted }]}>{canAfford ? "Buy" : "Fund"}</Text>
                                }
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── RANKS ───────────────────────────────────────────────────────── */}
        {activeTab === "ranks" && (
          <View style={s.section}>

            {/* My rank card */}
            {myRank != null && (
              <View style={[s.myRankCard, { backgroundColor: tier.color + "14", borderColor: tier.color + "44" }]}>
                <View style={[s.myRankLeft, { backgroundColor: tier.color + "20" }]}>
                  <Text style={[s.myRankNum, { color: tier.color }]}>#{myRank}</Text>
                  <Text style={[s.myRankTotal, { color: colors.textMuted }]}>of {totalUsers.toLocaleString()}</Text>
                </View>
                <Avatar uri={profile?.avatar_url} name={profile?.display_name || ""} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.myRankName, { color: equippedGoods.has('sg4') ? Colors.gold : colors.text }]}>{profile?.display_name}</Text>
                  <Text style={[s.myRankAcoin, { color: Colors.gold }]}>{fmtAcoin(acoin)} 🪙</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={{ fontSize: 22 }}>{tier.emoji}</Text>
                  <Text style={[s.myRankTierLabel, { color: tier.color }]}>{tier.label}</Text>
                </View>
              </View>
            )}

            {/* Podium — top 3 */}
            {!loadingList && richList.length >= 3 && (
              <View style={s.podiumWrap}>
                <PodiumCard user={richList[1]} rank={2} isMe={richList[1]?.id === user?.id} myTier={tier} colors={colors} onPress={() => navigateToProfile(richList[1].handle, true).catch(() => {})} />
                <PodiumCard user={richList[0]} rank={1} isMe={richList[0]?.id === user?.id} myTier={tier} colors={colors} onPress={() => navigateToProfile(richList[0].handle, true).catch(() => {})} />
                <PodiumCard user={richList[2]} rank={3} isMe={richList[2]?.id === user?.id} myTier={tier} colors={colors} onPress={() => navigateToProfile(richList[2].handle, true).catch(() => {})} />
              </View>
            )}

            {/* Full list */}
            {loadingList ? (
              <View style={{ gap: 8 }}>{[1,2,3,4,5].map((k) => <ListRowSkeleton key={k} />)}</View>
            ) : richList.length === 0 ? (
              <View style={s.empty}>
                <Text style={{ fontSize: 40 }}>🏆</Text>
                <Text style={[s.emptyTitle, { color: colors.text }]}>No users yet</Text>
              </View>
            ) : (
              <>
                <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {richList.slice(3).map((u, idx) => {
                    const uTier = getPrestigeTier(u.acoin || 0);
                    const isMe  = u.id === user?.id;
                    const rank  = idx + 4;
                    return (
                      <View key={u.id}>
                        {idx > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                        <TouchableOpacity
                          style={[s.richRow, isMe && { backgroundColor: tier.color + "0C" }]}
                          onPress={() => navigateToProfile(u.handle, true).catch(() => {})}
                          activeOpacity={0.75}
                        >
                          <Text style={[s.richRank, { color: rank <= 10 ? Colors.gold : colors.textMuted, fontFamily: rank <= 10 ? "Inter_700Bold" : "Inter_400Regular" }]}>#{rank}</Text>
                          <Avatar uri={u.avatar_url} name={u.display_name} size={40} />
                          <View style={{ flex: 1, gap: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                              <Text style={[s.richName, { color: isMe ? tier.color : colors.text }]} numberOfLines={1}>{u.display_name}</Text>
                              {isMe && <View style={[s.youPill, { backgroundColor: tier.color + "22", borderColor: tier.color + "44" }]}><Text style={[s.youText, { color: tier.color }]}>You</Text></View>}
                            </View>
                            <Text style={[s.richHandle, { color: colors.textMuted }]}>@{u.handle}</Text>
                          </View>
                          <View style={{ alignItems: "flex-end", gap: 2 }}>
                            <Text style={{ fontSize: 16 }}>{uTier.emoji}</Text>
                            <Text style={[s.richAcoin, { color: Colors.gold }]}>{fmtAcoin(u.acoin || 0)} 🪙</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>

                {/* Near You */}
                {nearYou.length > 0 && (
                  <>
                    <SectionHeader title="NEAR YOUR RANK" subtitle={`Users close to your position #${myRank}`} colors={colors} />
                    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      {nearYou.map((u, idx) => {
                        const uTier = getPrestigeTier(u.acoin || 0);
                        const uRank = richList.findIndex((r) => r.id === u.id) + 1;
                        const ahead = uRank < (myRank || 0);
                        return (
                          <View key={u.id}>
                            {idx > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                            <TouchableOpacity
                              style={s.richRow}
                              onPress={() => navigateToProfile(u.handle, true).catch(() => {})}
                              activeOpacity={0.75}
                            >
                              <Text style={[s.richRank, { color: colors.textMuted }]}>#{uRank}</Text>
                              <Avatar uri={u.avatar_url} name={u.display_name} size={38} />
                              <View style={{ flex: 1 }}>
                                <Text style={[s.richName, { color: colors.text }]} numberOfLines={1}>{u.display_name}</Text>
                                <Text style={[s.richHandle, { color: colors.textMuted }]}>@{u.handle}</Text>
                              </View>
                              <View style={{ alignItems: "flex-end", gap: 2 }}>
                                <Text style={{ fontSize: 14 }}>{uTier.emoji}</Text>
                                <Text style={[s.richAcoin, { color: ahead ? "#FF3B30" : "#34C759", fontSize: 10 }]}>
                                  {ahead ? `↑ ${((u.acoin || 0) - acoin).toLocaleString()} ahead` : `↓ ${(acoin - (u.acoin || 0)).toLocaleString()} behind`}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* ── HISTORY ─────────────────────────────────────────────────────── */}
        {activeTab === "history" && (
          <View style={s.section}>
            <SectionHeader title="TRANSACTION HISTORY" subtitle={`${transactions.length} transactions`} colors={colors} />
            {transactions.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="receipt" size={44} color={colors.textMuted} />
                <Text style={[s.emptyTitle, { color: colors.text }]}>No transactions yet</Text>
                <Text style={[s.emptySub, { color: colors.textMuted }]}>Purchase Status Goods or top up to see activity here</Text>
                <TouchableOpacity style={[s.emptyBtn, { backgroundColor: tier.color }]} onPress={() => router.push("/app/afupay")}>
                  <Text style={s.emptyBtnText}>Go to Wallet</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {transactions.map((tx, i) => (
                  <View key={tx.id}>
                    {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                    <View style={s.txRow}>
                      <View style={[s.txIcon, { backgroundColor: tx.color + "20" }]}>
                        <Ionicons name={tx.icon as any} size={18} color={tx.color} />
                      </View>
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={[s.txLabel, { color: colors.text }]} numberOfLines={1}>{tx.label}</Text>
                        <Text style={[s.txTime, { color: colors.textMuted }]}>
                          {new Date(tx.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[s.txAmount, { color: tx.amount > 0 ? "#34C759" : "#FF3B30" }]}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
                        </Text>
                        <Text style={[s.txUnit, { color: colors.textMuted }]}>AC</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, colors, style }: { title: string; subtitle?: string; colors: any; style?: any }) {
  return (
    <View style={[{ gap: 1, marginBottom: 2 }, style]}>
      <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      {subtitle && <Text style={[s.sectionSub, { color: colors.textMuted }]}>{subtitle}</Text>}
    </View>
  );
}

const PODIUM_COLORS  = ["#D4A853", "#C0C0C0", "#CD7F32"];
const PODIUM_MEDALS  = ["🥇", "🥈", "🥉"];

function PodiumCard({ user, rank, isMe, myTier, colors, onPress }: { user: RichUser; rank: number; isMe: boolean; myTier: any; colors: any; onPress: () => void }) {
  const uTier  = getPrestigeTier(user.acoin || 0);
  const color  = PODIUM_COLORS[rank - 1];
  const medal  = PODIUM_MEDALS[rank - 1];
  const big    = rank === 1;
  return (
    <TouchableOpacity style={[s.podiumCard, big && s.podiumCardFirst]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[s.podiumMedal, { fontSize: big ? 28 : 22 }]}>{medal}</Text>
      <View style={[s.podiumAvatarWrap, { borderColor: color + "88" }]}>
        <Avatar uri={user.avatar_url} name={user.display_name} size={big ? 54 : 42} />
        <Text style={[s.podiumTierBadge, { fontSize: big ? 16 : 13 }]}>{uTier.emoji}</Text>
      </View>
      <Text style={[s.podiumName, { color: isMe ? myTier.color : colors.text, fontSize: big ? 13 : 11 }]} numberOfLines={1}>{user.display_name}</Text>
      <Text style={[s.podiumAcoin, { color, fontSize: big ? 12 : 10 }]}>
        {fmtAcoin(user.acoin || 0)} 🪙
      </Text>
      <View style={[s.podiumBase, { height: big ? 56 : 40, backgroundColor: color + "20", borderColor: color + "44" }]}>
        <Text style={[s.podiumRank, { color, fontSize: big ? 22 : 18 }]}>#{rank}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  // Hero
  hero: { paddingHorizontal: 20, paddingBottom: 28 },
  heroNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.3 },

  avatarWrap: { alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: 16, position: "relative" },
  tierRing: {
    position: "absolute",
    width: 100, height: 100, borderRadius: 50, borderWidth: 3,
    ...Platform.select({ default: { shadowOffset: { width: 0, height: 0 }, shadowRadius: 16 } }),
  },
  tierBadge: { position: "absolute", bottom: -4, right: -4, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#000" },
  tierBadgeEmoji: { fontSize: 14 },

  heroName: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center", letterSpacing: -0.4 },
  tierLabelRow: { flexDirection: "row", alignSelf: "center", alignItems: "center", paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginTop: 6, marginBottom: 20 },
  tierLabelText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },
  tierTagline: { fontSize: 12, fontFamily: "Inter_400Regular" },

  heroStats: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.22)", borderRadius: 18, padding: 16, marginBottom: 22, gap: 0 },
  heroStatItem: { flex: 1, alignItems: "center", gap: 3 },
  heroStatDivider: { width: 0.5, backgroundColor: "rgba(255,255,255,0.2)" },
  heroStatValue: { fontSize: 19, fontFamily: "Inter_700Bold", color: "#fff" },
  heroStatLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },

  progressWrap: { gap: 8 },
  progressLabels: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressFrom: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.85)" },
  progressGap: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },
  progressTo: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.85)" },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.35)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  tierUnlockHint: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginTop: 2 },
  tierUnlockHintText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },

  maxBadge: { borderRadius: 14, paddingHorizontal: 18, paddingVertical: 10, alignSelf: "center" },
  maxText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFD700", textAlign: "center" },

  // Roadmap
  roadmapRow: { paddingHorizontal: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center" },
  roadmapChip: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, minWidth: 72, gap: 3, position: "relative" },
  roadmapEmoji: { fontSize: 20 },
  roadmapLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  roadmapMin: { fontSize: 9, fontFamily: "Inter_400Regular" },
  roadmapLine: { width: 16, height: 2, marginHorizontal: 2 },
  activeIndicator: { position: "absolute", bottom: -6, width: 6, height: 6, borderRadius: 3 },
  roadmapLock: { position: "absolute", top: 4, right: 4 },

  // Tab bar
  tabRow: { flexDirection: "row", borderBottomWidth: 0.5, backgroundColor: "transparent" },
  tabItem: { flex: 1, flexDirection: "column", alignItems: "center", paddingVertical: 10, gap: 3, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  // Section
  section: { paddingHorizontal: 14, paddingTop: 14, gap: 12 },
  valueCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  valueIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  valueTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  valueBody: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.9 },
  sectionSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  card: { borderRadius: 16, borderWidth: 0.5, overflow: "hidden" },
  sep: { height: 0.5, marginLeft: 16 },

  // Perk rows
  perkRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  perkIconBox: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  perkText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  // Tier rows
  tierRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 0.5 },
  tierRowLeft: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tierRowEmoji: { fontSize: 22 },
  tierRowName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  tierRowMin: { fontSize: 12, fontFamily: "Inter_400Regular" },
  tierRowNeed: { fontSize: 11, fontFamily: "Inter_500Medium" },

  // Earn rows
  earnRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  earnLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  earnSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  // Shop cards
  shopCard: { borderRadius: 16, borderWidth: 0.5, padding: 14, gap: 12 },
  shopCardTop: { flexDirection: "row", gap: 12 },
  shopCardEmojiBox: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  shopCardEmoji: { fontSize: 30 },
  shopCardName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  whereRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  shopCardWhere: { fontSize: 11, fontFamily: "Inter_400Regular" },
  shopCardDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  shopOwnedChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  shopOwnedText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  shopCardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tierRequiredChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  tierRequiredText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  shopCardPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_700Bold" },

  // Equipped chips
  equippedChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  equippedChipName: { fontSize: 12, fontFamily: "Inter_700Bold" },
  equippedChipWhere: { fontSize: 10, fontFamily: "Inter_400Regular" },

  // My rank card
  myRankCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  myRankLeft: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignItems: "center" },
  myRankNum: { fontSize: 22, fontFamily: "Inter_800ExtraBold" },
  myRankTotal: { fontSize: 10, fontFamily: "Inter_400Regular" },
  myRankName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  myRankAcoin: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  myRankTierLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  // Leaderboard
  podiumWrap: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8, paddingTop: 8 },
  podiumCard: { flex: 1, alignItems: "center", gap: 4 },
  podiumCardFirst: { flex: 1.15 },
  podiumMedal: { textAlign: "center" },
  podiumAvatarWrap: { borderWidth: 2, borderRadius: 999, padding: 2, position: "relative" },
  podiumTierBadge: { position: "absolute", bottom: -2, right: -2 },
  podiumName: { fontFamily: "Inter_700Bold", textAlign: "center", width: "100%" },
  podiumAcoin: { fontFamily: "Inter_600SemiBold", textAlign: "center" },
  podiumBase: { width: "100%", borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 6, marginTop: 4 },
  podiumRank: { fontFamily: "Inter_800ExtraBold" },

  richRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  richRank: { width: 32, fontSize: 13, textAlign: "center" },
  richName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  richHandle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  richAcoin: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  youPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, borderWidth: 1 },
  youText: { fontSize: 9, fontFamily: "Inter_700Bold" },

  // Tx history
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  txIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  txTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  txAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  txUnit: { fontSize: 10, fontFamily: "Inter_400Regular" },

  // Empty
  empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 20 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 4 },
  emptyBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});
