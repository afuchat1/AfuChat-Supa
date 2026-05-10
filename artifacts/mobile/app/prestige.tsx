import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { PRESTIGE_TIERS, getPrestigeTier, getNextPrestigeTier, prestigeProgress } from "@/lib/prestige";
import { Avatar } from "@/components/ui/Avatar";
import { ListRowSkeleton } from "@/components/ui/Skeleton";

type RichUser = { id: string; display_name: string; handle: string; acoin: number; avatar_url: string | null };
type Purchase = { id: string; good_id: string; good_name: string; good_emoji: string; acoin_cost: number; tier_required: string; equipped: boolean; created_at: string };
type PrestigeTx = { id: string; amount: number; label: string; icon: string; color: string; created_at: string; metadata?: Record<string, any> };

const STATUS_GOODS = [
  { id: "sg1", name: "Crown Aura",     emoji: "👑", description: "An animated crown that floats above your avatar in all chats", acoin: 50000, tier: "legend" },
  { id: "sg2", name: "Obsidian Frame", emoji: "⬛", description: "Dark chromatic border with void particle effects",              acoin: 20000, tier: "obsidian" },
  { id: "sg3", name: "Diamond Halo",   emoji: "💎", description: "Ice-blue halo ring visible on your profile and in conversations", acoin: 8000, tier: "diamond" },
  { id: "sg4", name: "Gold Nameplate", emoji: "🥇", description: "Your name displays in gold in every conversation",              acoin: 2500, tier: "gold" },
  { id: "sg5", name: "Verified Star",  emoji: "⭐", description: "A gold star badge next to your name",                           acoin: 1500, tier: "silver" },
  { id: "sg6", name: "Founder's Seal", emoji: "🔏", description: "One-time exclusive for early believers. Lifetime status.",      acoin: 100000, tier: "legend" },
  { id: "sg7", name: "Royalty Title",  emoji: "🎖️", description: "Custom title — 'Royalty of AfuChat' shown on your profile",   acoin: 30000, tier: "obsidian" },
  { id: "sg8", name: "Status Glow",    emoji: "✨", description: "Soft glow effect on all your messages based on your prestige color", acoin: 3000, tier: "gold" },
];

const TIER_ID_ORDER = ["bronze", "silver", "gold", "diamond", "obsidian", "legend"];
function tierIndex(id: string) { return TIER_ID_ORDER.indexOf(id); }

type Tab = "status" | "history" | "rich";

export default function PrestigeScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [richList,      setRichList]      = useState<RichUser[]>([]);
  const [loadingList,   setLoadingList]   = useState(true);
  const [aheadCount,    setAheadCount]    = useState<number | null>(null);
  const [purchases,     setPurchases]     = useState<Purchase[]>([]);
  const [transactions,  setTransactions]  = useState<PrestigeTx[]>([]);
  const [purchasing,    setPurchasing]    = useState<string | null>(null);
  const [refreshing,    setRefreshing]    = useState(false);
  const [activeTab,     setActiveTab]     = useState<Tab>("status");

  const progressAnim = useRef(new Animated.Value(0)).current;

  const acoin    = profile?.acoin || 0;
  const tier     = getPrestigeTier(acoin);
  const nextTier = getNextPrestigeTier(acoin);
  const progress = prestigeProgress(acoin);

  const ownedIds    = new Set(purchases.map((p) => p.good_id));
  const equippedIds = new Set(purchases.filter((p) => p.equipped).map((p) => p.good_id));

  const loadData = useCallback(async () => {
    if (!user) return;
    const [richRes, aheadRes, purchaseRes, txRes] = await Promise.all([
      supabase.from("profiles").select("id, display_name, handle, acoin, avatar_url").order("acoin", { ascending: false }).limit(25),
      supabase.from("profiles").select("id", { count: "exact", head: true }).gt("acoin", acoin),
      supabase.from("status_goods_purchases").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("acoin_transactions").select("id, amount, transaction_type, created_at, metadata").eq("user_id", user.id).in("transaction_type", ["status_good_purchase", "conversion", "topup", "subscription"]).order("created_at", { ascending: false }).limit(30),
    ]);

    if (richRes.data)    setRichList(richRes.data as RichUser[]);
    setAheadCount(aheadRes.count ?? 0);
    if (purchaseRes.data) setPurchases(purchaseRes.data as Purchase[]);

    const txList: PrestigeTx[] = (txRes.data || []).map((t: any) => {
      const isPos = t.amount > 0;
      let label = t.transaction_type.replace(/_/g, " ");
      let icon  = "diamond";
      let color = isPos ? "#34C759" : "#FF9500";
      if (t.transaction_type === "status_good_purchase") {
        label = `Purchased ${t.metadata?.good_emoji || ""} ${t.metadata?.good_name || "Status Good"}`;
        icon = "star"; color = "#AF52DE";
      } else if (t.transaction_type === "conversion") {
        label = "Nexa → ACoin"; icon = "swap-horizontal"; color = "#FF9500";
      } else if (t.transaction_type === "topup") {
        label = "ACoin Top-Up"; icon = "card"; color = "#34C759";
      } else if (t.transaction_type === "subscription") {
        label = `Premium ${t.metadata?.plan_name || ""}`; icon = "diamond"; color = "#FF9500";
      }
      return { id: t.id, amount: t.amount, label, icon, color, created_at: t.created_at, metadata: t.metadata };
    });
    setTransactions(txList);
    setLoadingList(false);
    setRefreshing(false);
  }, [user, acoin]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 1000,
      delay: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  async function purchaseGood(item: typeof STATUS_GOODS[0]) {
    if (!user || !profile) return;
    if (ownedIds.has(item.id)) { showAlert("Already Owned", `You already own ${item.emoji} ${item.name}.`); return; }
    if (acoin < item.acoin)    { showAlert("Insufficient ACoin", `You need ${item.acoin.toLocaleString()} ACoin but only have ${acoin.toLocaleString()}.`); return; }

    showAlert(
      `Buy ${item.emoji} ${item.name}`,
      `${item.acoin.toLocaleString()} ACoin\n\nBalance: ${acoin.toLocaleString()} → ${(acoin - item.acoin).toLocaleString()} ACoin`,
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
            if (error) { showAlert("Error", error.message); setPurchasing(null); return; }
            const result = data as { ok: boolean; error?: string };
            if (!result.ok) { showAlert("Error", result.error || "Purchase failed."); setPurchasing(null); return; }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showAlert("Purchased!", `${item.emoji} ${item.name} is now yours!`);
            setPurchasing(null);
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
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "status",  label: "Status Goods",  icon: "storefront-outline" },
    { id: "history", label: "Transactions",  icon: "receipt-outline" },
    { id: "rich",    label: "Rich List",     icon: "trophy-outline" },
  ];

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={tier.color} />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >

        {/* ── Hero Banner ─────────────────────────────────────────────────── */}
        <LinearGradient
          colors={[tier.ringColors[0] + "EE", tier.ringColors[1] + "CC"]}
          style={[s.hero, { paddingTop: insets.top + 12 }]}
        >
          {/* Back + Wallet row */}
          <View style={s.heroNav}>
            <TouchableOpacity style={s.heroNavBtn} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={s.heroNavBtn} onPress={() => router.push("/wallet")} hitSlop={12}>
              <Ionicons name="wallet-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Tier identity */}
          <View style={s.heroCenter}>
            <Text style={s.heroEmoji}>{tier.emoji}</Text>
            <Text style={s.heroTierLabel}>{tier.label}</Text>
            <Text style={s.heroTierDesc}>{tier.description}</Text>
            <View style={s.heroAcoinPill}>
              <Text style={s.heroAcoinText}>🪙 {acoin.toLocaleString()} ACoin</Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={s.heroStats}>
            {[
              { label: "Rank",     value: aheadCount != null ? `#${aheadCount + 1}` : "—" },
              { label: "Owned",    value: `${purchases.length}/${STATUS_GOODS.length}` },
              { label: "Equipped", value: String(equippedIds.size) },
            ].map((stat, i) => (
              <React.Fragment key={stat.label}>
                {i > 0 && <View style={s.heroStatDivider} />}
                <View style={s.heroStat}>
                  <Text style={s.heroStatValue}>{stat.value}</Text>
                  <Text style={s.heroStatLabel}>{stat.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          {/* Progress to next tier */}
          {nextTier ? (
            <View style={s.heroProgress}>
              <View style={s.heroProgressLabelRow}>
                <Text style={s.heroProgressLabel}>Progress to {nextTier.emoji} {nextTier.label}</Text>
                <Text style={s.heroProgressLabel}>{acoin.toLocaleString()} / {nextTier.minAcoin.toLocaleString()}</Text>
              </View>
              <View style={s.heroProgressTrack}>
                <Animated.View
                  style={[s.heroProgressFill, {
                    width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                    backgroundColor: "#fff",
                  }]}
                />
              </View>
              <Text style={s.heroProgressGap}>
                {(nextTier.minAcoin - acoin).toLocaleString()} ACoin to go
              </Text>
            </View>
          ) : (
            <View style={s.maxBadge}>
              <Text style={s.maxText}>👑 Maximum Prestige Achieved</Text>
            </View>
          )}
        </LinearGradient>

        {/* ── Tier Roadmap ────────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.roadmapRow}
        >
          {PRESTIGE_TIERS.map((t) => {
            const isActive   = t.id === tier.id;
            const isUnlocked = acoin >= t.minAcoin;
            return (
              <View
                key={t.id}
                style={[
                  s.roadmapChip,
                  { borderColor: isActive ? t.color : isUnlocked ? t.color + "55" : colors.border,
                    backgroundColor: isActive ? t.color + "20" : colors.surface },
                ]}
              >
                <Text style={s.roadmapEmoji}>{t.emoji}</Text>
                <Text style={[s.roadmapLabel, { color: isActive ? t.color : isUnlocked ? colors.textSecondary : colors.textMuted }]}>
                  {t.label}
                </Text>
                <Text style={[s.roadmapMin, { color: isActive ? t.color + "CC" : colors.textMuted }]}>
                  {t.minAcoin >= 1000 ? `${t.minAcoin / 1000}K` : t.minAcoin === 0 ? "Free" : t.minAcoin}
                </Text>
                {isActive && (
                  <View style={[s.roadmapActiveDot, { backgroundColor: t.color }]} />
                )}
                {!isUnlocked && (
                  <Ionicons name="lock-closed" size={10} color={colors.textMuted} style={{ marginTop: 2 }} />
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <View style={[s.tabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[s.tab, active && { borderBottomColor: tier.color, borderBottomWidth: 2 }]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.75}
              >
                <Ionicons name={tab.icon as any} size={15} color={active ? tier.color : colors.textMuted} />
                <Text style={[s.tabLabel, { color: active ? tier.color : colors.textMuted }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Status Goods ────────────────────────────────────────────────── */}
        {activeTab === "status" && (
          <View style={s.section}>

            {/* My Collection */}
            {purchases.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { color: colors.textMuted }]}>MY COLLECTION</Text>
                <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {purchases.map((p, i) => {
                    const good = STATUS_GOODS.find((g) => g.id === p.good_id);
                    return (
                      <View key={p.id}>
                        {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                        <View style={s.collectionRow}>
                          <Text style={s.goodEmoji}>{p.good_emoji}</Text>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={[s.goodName, { color: colors.text }]}>{p.good_name}</Text>
                            <Text style={[s.goodDesc, { color: colors.textMuted }]} numberOfLines={1}>
                              {good?.description || "Status good"}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[s.equipBtn, { backgroundColor: p.equipped ? tier.color + "22" : colors.backgroundSecondary, borderColor: p.equipped ? tier.color : colors.border }]}
                            onPress={() => toggleEquip(p)}
                          >
                            {p.equipped && <Ionicons name="checkmark" size={11} color={tier.color} />}
                            <Text style={[s.equipBtnText, { color: p.equipped ? tier.color : colors.textMuted }]}>
                              {p.equipped ? "On" : "Equip"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* Shop */}
            <Text style={[s.sectionTitle, { color: colors.textMuted, marginTop: purchases.length > 0 ? 18 : 0 }]}>SHOP</Text>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {STATUS_GOODS.map((item, i) => {
                const itemTier    = PRESTIGE_TIERS.find((t) => t.id === item.tier)!;
                const canAfford   = acoin >= item.acoin;
                const tierUnlocked = tierIndex(tier.id) >= tierIndex(item.tier);
                const owned       = ownedIds.has(item.id);

                return (
                  <View key={item.id}>
                    {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                    <View style={[s.shopRow, { opacity: tierUnlocked ? 1 : 0.45 }]}>
                      <Text style={s.goodEmoji}>{item.emoji}</Text>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={[s.goodName, { color: colors.text }]}>{item.name}</Text>
                          <View style={[s.tierBadge, { backgroundColor: itemTier.color + "22" }]}>
                            <Text style={[s.tierBadgeText, { color: itemTier.color }]}>
                              {itemTier.emoji} {itemTier.label}+
                            </Text>
                          </View>
                        </View>
                        <Text style={[s.goodDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 }}>
                          <Text style={[s.goodPrice, { color: Colors.gold }]}>🪙 {item.acoin.toLocaleString()}</Text>
                          {owned && <Text style={{ fontSize: 11, color: "#34C759", fontFamily: "Inter_600SemiBold" }}>✓ Owned</Text>}
                          {!tierUnlocked && <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: "Inter_400Regular" }}>Reach {itemTier.label} to unlock</Text>}
                        </View>
                      </View>
                      {owned ? (
                        <View style={[s.shopBtn, { backgroundColor: "#34C759" + "18" }]}>
                          <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                        </View>
                      ) : tierUnlocked ? (
                        <TouchableOpacity
                          style={[s.shopBtn, { backgroundColor: canAfford ? tier.color : colors.backgroundSecondary }]}
                          onPress={() => purchaseGood(item)}
                          disabled={purchasing === item.id}
                        >
                          {purchasing === item.id
                            ? <ActivityIndicator size="small" color={canAfford ? "#fff" : colors.textMuted} />
                            : <Text style={[s.shopBtnText, { color: canAfford ? "#fff" : colors.textMuted }]}>{canAfford ? "Buy" : "Fund"}</Text>
                          }
                        </TouchableOpacity>
                      ) : (
                        <View style={[s.shopBtn, { backgroundColor: colors.backgroundSecondary }]}>
                          <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Perks for current tier */}
            <Text style={[s.sectionTitle, { color: colors.textMuted, marginTop: 18 }]}>YOUR {tier.label.toUpperCase()} PERKS</Text>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {tier.perks.map((perk, i) => (
                <View key={i}>
                  {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                  <View style={s.perkRow}>
                    <View style={[s.perkDot, { backgroundColor: tier.color }]} />
                    <Text style={[s.perkText, { color: colors.text }]}>{perk}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Transactions ────────────────────────────────────────────────── */}
        {activeTab === "history" && (
          <View style={s.section}>
            {transactions.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="receipt-outline" size={44} color={colors.textMuted} />
                <Text style={[s.emptyTitle, { color: colors.text }]}>No transactions yet</Text>
                <Text style={[s.emptySub, { color: colors.textMuted }]}>Purchase Status Goods or convert Nexa to see activity here</Text>
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
                      <View style={{ flex: 1 }}>
                        <Text style={[s.txLabel, { color: colors.text }]} numberOfLines={1}>{tx.label}</Text>
                        <Text style={[s.txTime, { color: colors.textMuted }]}>
                          {new Date(tx.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </Text>
                      </View>
                      <Text style={[s.txAmount, { color: tx.amount > 0 ? "#34C759" : "#FF3B30" }]}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Rich List ───────────────────────────────────────────────────── */}
        {activeTab === "rich" && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textMuted }]}>TOP ACOIN HOLDERS</Text>
            {loadingList ? (
              <View style={{ gap: 8 }}>{[1,2,3,4,5].map((k) => <ListRowSkeleton key={k} />)}</View>
            ) : (
              <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {richList.length === 0 && (
                  <Text style={[s.emptyTitle, { color: colors.textMuted, textAlign: "center", paddingVertical: 32 }]}>No users yet</Text>
                )}
                {richList.map((u, idx) => {
                  const uTier = getPrestigeTier(u.acoin || 0);
                  const isMe  = u.handle === profile?.handle;
                  const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
                  return (
                    <View key={u.handle}>
                      {idx > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                      <TouchableOpacity
                        style={[s.richRow, isMe && { backgroundColor: tier.color + "0A" }]}
                        onPress={() => router.push({ pathname: "/contact/[id]", params: { id: u.id, init_name: u.display_name, init_handle: u.handle, init_avatar: u.avatar_url ?? "" } })}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.richRankText, { color: idx < 3 ? Colors.gold : colors.textMuted, width: 28 }]}>
                          {medal || `#${idx + 1}`}
                        </Text>
                        <Avatar uri={u.avatar_url} name={u.display_name} size={38} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Text style={[s.richName, { color: isMe ? tier.color : colors.text }]} numberOfLines={1}>
                              {u.display_name}
                            </Text>
                            {isMe && <Text style={[s.youLabel, { color: tier.color }]}>You</Text>}
                          </View>
                          <Text style={[s.richHandle, { color: colors.textMuted }]}>@{u.handle}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 2 }}>
                          <Text style={{ fontSize: 16 }}>{uTier.emoji}</Text>
                          <Text style={[s.richAcoin, { color: Colors.gold }]}>{(u.acoin || 0).toLocaleString()} 🪙</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  // Hero
  hero: { paddingHorizontal: 20, paddingBottom: 28 },
  heroNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  heroNavBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.18)", alignItems: "center", justifyContent: "center" },
  heroCenter: { alignItems: "center", gap: 6, marginBottom: 24 },
  heroEmoji: { fontSize: 64 },
  heroTierLabel: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff", marginTop: 4 },
  heroTierDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  heroAcoinPill: { backgroundColor: "rgba(0,0,0,0.22)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  heroAcoinText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },

  heroStats: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 16, padding: 12, marginBottom: 20 },
  heroStat: { flex: 1, alignItems: "center", gap: 2 },
  heroStatDivider: { width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.25)", marginHorizontal: 8 },
  heroStatValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  heroStatLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)" },

  heroProgress: { gap: 6 },
  heroProgressLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  heroProgressLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.8)" },
  heroProgressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.25)", overflow: "hidden" },
  heroProgressFill: { height: "100%", borderRadius: 3 },
  heroProgressGap: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 2 },

  maxBadge: { backgroundColor: "rgba(0,0,0,0.22)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, alignSelf: "center" },
  maxText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFD700" },

  // Roadmap
  roadmapRow: { paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  roadmapChip: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, minWidth: 72, gap: 3, position: "relative" },
  roadmapEmoji: { fontSize: 20 },
  roadmapLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  roadmapMin: { fontSize: 10, fontFamily: "Inter_400Regular" },
  roadmapActiveDot: { position: "absolute", bottom: -5, width: 6, height: 6, borderRadius: 3 },

  // Tabs
  tabBar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: 14 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 11 },
  tabLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  // Section layout
  section: { paddingHorizontal: 14, gap: 8 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.7, marginTop: 4, marginLeft: 2 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 16 },

  // Collection row
  collectionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  goodEmoji: { fontSize: 26, width: 34, textAlign: "center" },
  goodName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  goodDesc: { fontSize: 12, fontFamily: "Inter_400Regular" },
  goodPrice: { fontSize: 12, fontFamily: "Inter_700Bold" },
  equipBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  equipBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Shop row
  shopRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  tierBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  tierBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  shopBtn: { width: 48, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  shopBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },

  // Perks
  perkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  perkDot: { width: 7, height: 7, borderRadius: 3.5 },
  perkText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },

  // Transactions
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  txIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  txLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  txTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },

  // Rich list
  richRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  richRankText: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  richName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  richHandle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  richAcoin: { fontSize: 11, fontFamily: "Inter_700Bold" },
  youLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: "transparent" },

  // Empty
  empty: { alignItems: "center", gap: 10, paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 260 },
});
