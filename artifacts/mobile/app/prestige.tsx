import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { ListRowSkeleton } from "@/components/ui/Skeleton";

type RichUser = { id: string; display_name: string; handle: string; acoin: number; avatar_url: string | null };

type Purchase = { id: string; good_id: string; good_name: string; good_emoji: string; acoin_cost: number; tier_required: string; equipped: boolean; created_at: string };

type PrestigeTx = { id: string; amount: number; label: string; icon: string; color: string; created_at: string; metadata?: Record<string, any> };

const STATUS_GOODS = [
  { id: "sg1", name: "Crown Aura", emoji: "👑", description: "An animated crown that floats above your avatar in all chats", acoin: 50000, tier: "legend" },
  { id: "sg2", name: "Obsidian Frame", emoji: "⬛", description: "Dark chromatic border with void particle effects", acoin: 20000, tier: "obsidian" },
  { id: "sg3", name: "Diamond Halo", emoji: "💎", description: "Ice-blue halo ring visible on your profile and in conversations", acoin: 8000, tier: "diamond" },
  { id: "sg4", name: "Gold Nameplate", emoji: "🥇", description: "Your name displays in gold in every conversation", acoin: 2500, tier: "gold" },
  { id: "sg5", name: "Verified Star", emoji: "⭐", description: "A gold star badge next to your name", acoin: 1500, tier: "silver" },
  { id: "sg6", name: "Founder's Seal", emoji: "🔏", description: "One-time exclusive for early believers. Lifetime status.", acoin: 100000, tier: "legend" },
  { id: "sg7", name: "Royalty Title", emoji: "🎖️", description: "Custom title shown on your profile — 'Royalty of AfuChat'", acoin: 30000, tier: "obsidian" },
  { id: "sg8", name: "Status Glow", emoji: "✨", description: "Soft glow effect on all your messages based on your prestige color", acoin: 3000, tier: "gold" },
];

const TIER_ID_ORDER = ["bronze", "silver", "gold", "diamond", "obsidian", "legend"];

function tierIndex(id: string) { return TIER_ID_ORDER.indexOf(id); }

export default function PrestigeScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [richList, setRichList] = useState<RichUser[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [aheadCount, setAheadCount] = useState<number | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [transactions, setTransactions] = useState<PrestigeTx[]>([]);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<"status" | "history" | "rich">("status");

  const acoin = profile?.acoin || 0;
  const tier = getPrestigeTier(acoin);
  const nextTier = getNextPrestigeTier(acoin);
  const progress = prestigeProgress(acoin);

  const loadData = useCallback(async () => {
    if (!user) return;

    const [richRes, aheadRes, purchaseRes, txRes] = await Promise.all([
      supabase.from("profiles").select("id, display_name, handle, acoin, avatar_url").order("acoin", { ascending: false }).limit(20),
      supabase.from("profiles").select("id", { count: "exact", head: true }).gt("acoin", acoin),
      supabase.from("status_goods_purchases").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("acoin_transactions").select("id, amount, transaction_type, created_at, metadata").eq("user_id", user.id).in("transaction_type", ["status_good_purchase", "conversion", "topup", "subscription"]).order("created_at", { ascending: false }).limit(20),
    ]);

    if (richRes.data) setRichList(richRes.data as RichUser[]);
    setAheadCount(aheadRes.count || 0);
    if (purchaseRes.data) setPurchases(purchaseRes.data as Purchase[]);

    const txList: PrestigeTx[] = (txRes.data || []).map((t: any) => {
      const isPositive = t.amount > 0;
      let label = t.transaction_type.replace(/_/g, " ");
      let icon = "diamond";
      let color = isPositive ? "#34C759" : "#FF9500";

      if (t.transaction_type === "status_good_purchase") {
        label = `Purchased ${t.metadata?.good_emoji || ""} ${t.metadata?.good_name || "Status Good"}`;
        icon = "star";
        color = "#AF52DE";
      } else if (t.transaction_type === "conversion") {
        label = "Nexa → ACoin";
        icon = "swap-horizontal";
        color = "#FF9500";
      } else if (t.transaction_type === "topup") {
        label = "ACoin Top-Up";
        icon = "card";
        color = "#34C759";
      } else if (t.transaction_type === "subscription") {
        label = `Premium ${t.metadata?.plan_name || ""}`;
        icon = "diamond";
        color = "#FF9500";
      }

      return { id: t.id, amount: t.amount, label, icon, color, created_at: t.created_at, metadata: t.metadata };
    });
    setTransactions(txList);
    setLoadingList(false);
    setRefreshing(false);
  }, [user, acoin]);

  useEffect(() => { loadData(); }, [loadData]);

  const ownedIds = new Set(purchases.map((p) => p.good_id));
  const equippedIds = new Set(purchases.filter((p) => p.equipped).map((p) => p.good_id));

  async function purchaseGood(item: typeof STATUS_GOODS[0]) {
    if (!user || !profile) return;
    if (ownedIds.has(item.id)) {
      showAlert("Already Owned", `You already own ${item.emoji} ${item.name}.`);
      return;
    }
    if (acoin < item.acoin) {
      showAlert("Insufficient ACoin", `You need ${item.acoin.toLocaleString()} ACoin but only have ${acoin.toLocaleString()}.`);
      return;
    }

    showAlert(
      "Purchase Status Good",
      `Buy ${item.emoji} ${item.name} for ${item.acoin.toLocaleString()} ACoin?\n\nYour balance: ${acoin.toLocaleString()} ACoin\nAfter purchase: ${(acoin - item.acoin).toLocaleString()} ACoin`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Purchase",
          onPress: async () => {
            setPurchasing(item.id);

            const { data, error } = await supabase.rpc("purchase_status_good", {
              p_user_id: user.id,
              p_good_id: item.id,
              p_good_name: item.name,
              p_good_emoji: item.emoji,
              p_acoin_cost: item.acoin,
              p_tier_required: item.tier,
            });

            if (error) {
              showAlert("Error", error.message);
              setPurchasing(null);
              return;
            }

            const result = data as { ok: boolean; error?: string; new_balance?: number };
            if (!result.ok) {
              showAlert("Error", result.error || "Purchase failed.");
              setPurchasing(null);
              return;
            }

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
    const newEquipped = !p.equipped;
    const { error } = await supabase
      .from("status_goods_purchases")
      .update({ equipped: newEquipped })
      .eq("id", p.id);

    if (error) {
      showAlert("Error", error.message);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPurchases((prev) =>
      prev.map((pp) => (pp.id === p.id ? { ...pp, equipped: newEquipped } : pp))
    );
  }

  const ownedGoods = purchases.length;
  const totalGoods = STATUS_GOODS.length;

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Prestige Status</Text>
        <TouchableOpacity onPress={() => router.push("/wallet")} hitSlop={12}>
          <Ionicons name="wallet-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={[1]}
        keyExtractor={() => "main"}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={colors.accent} />}
        renderItem={() => (
          <View style={{ paddingBottom: insets.bottom + 40 }}>

            <LinearGradient
              colors={[tier.ringColors[0] + "33", tier.ringColors[1] + "11"]}
              style={[s.tierCard, { borderColor: tier.color + "44" }]}
            >
              <View style={s.tierTopRow}>
                <Text style={s.tierEmoji}>{tier.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.tierLabel, { color: tier.color }]}>{tier.label}</Text>
                  <Text style={[s.tierDesc, { color: colors.textSecondary }]}>{tier.description}</Text>
                </View>
                <View style={[s.acoinBadge, { backgroundColor: Colors.gold + "22" }]}>
                  <Text style={[s.acoinText, { color: Colors.gold }]}>{acoin.toLocaleString()} ACoin</Text>
                </View>
              </View>

              <View style={s.statsRow}>
                <View style={[s.statBox, { backgroundColor: "rgba(0,0,0,0.12)" }]}>
                  <Text style={[s.statValue, { color: "#fff" }]}>{ownedGoods}/{totalGoods}</Text>
                  <Text style={[s.statLabel, { color: "rgba(255,255,255,0.7)" }]}>Goods Owned</Text>
                </View>
                <View style={[s.statBox, { backgroundColor: "rgba(0,0,0,0.12)" }]}>
                  <Text style={[s.statValue, { color: "#fff" }]}>#{aheadCount != null ? aheadCount + 1 : "—"}</Text>
                  <Text style={[s.statLabel, { color: "rgba(255,255,255,0.7)" }]}>Rank</Text>
                </View>
                <View style={[s.statBox, { backgroundColor: "rgba(0,0,0,0.12)" }]}>
                  <Text style={[s.statValue, { color: "#fff" }]}>{equippedIds.size}</Text>
                  <Text style={[s.statLabel, { color: "rgba(255,255,255,0.7)" }]}>Equipped</Text>
                </View>
              </View>

              {nextTier && (
                <View style={{ marginTop: 14 }}>
                  <View style={s.progressLabelRow}>
                    <Text style={[s.progressLabel, { color: colors.textSecondary }]}>
                      Progress to {nextTier.emoji} {nextTier.label}
                    </Text>
                    <Text style={[s.progressLabel, { color: tier.color }]}>
                      {acoin.toLocaleString()} / {nextTier.minAcoin.toLocaleString()}
                    </Text>
                  </View>
                  <View style={[s.progressTrack, { backgroundColor: colors.backgroundTertiary }]}>
                    <View style={[s.progressFill, { width: `${progress * 100}%`, backgroundColor: tier.color }]} />
                  </View>
                  <Text style={[s.gapText, { color: colors.textMuted }]}>
                    {(nextTier.minAcoin - acoin).toLocaleString()} more ACoin needed
                  </Text>
                </View>
              )}

              {!nextTier && (
                <View style={[s.maxBadge, { backgroundColor: "#FFD700" + "22" }]}>
                  <Text style={[s.maxText, { color: "#FFD700" }]}>👑 Maximum Prestige Achieved</Text>
                </View>
              )}
            </LinearGradient>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, marginBottom: 14 }}>
              {PRESTIGE_TIERS.map((t) => {
                const isActive = t.id === tier.id;
                const isUnlocked = acoin >= t.minAcoin;
                return (
                  <View
                    key={t.id}
                    style={[s.tierChip, { borderColor: isActive ? t.color : colors.border, backgroundColor: isActive ? t.color + "22" : colors.surface }]}
                  >
                    <Text style={s.tierChipEmoji}>{t.emoji}</Text>
                    <Text style={[s.tierChipLabel, { color: isActive ? t.color : isUnlocked ? colors.textSecondary : colors.textMuted }]}>
                      {t.label}
                    </Text>
                    <Text style={[s.tierChipMin, { color: colors.textMuted }]}>
                      {t.minAcoin >= 1000 ? `${t.minAcoin / 1000}K` : t.minAcoin}
                    </Text>
                    {isActive && <View style={[s.activeIndicator, { backgroundColor: t.color }]} />}
                  </View>
                );
              })}
            </ScrollView>

            <View style={s.sectionTabs}>
              {(["status", "history", "rich"] as const).map((tab) => (
                <TouchableOpacity key={tab} style={[s.sTab, activeSection === tab && { backgroundColor: colors.accent }]} onPress={() => setActiveSection(tab)}>
                  <Text style={[s.sTabText, activeSection === tab && { color: "#fff" }]}>
                    {tab === "status" ? "Status Goods" : tab === "history" ? "Transactions" : "Rich List"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {activeSection === "status" && (
              <View style={{ paddingHorizontal: 16, gap: 10 }}>
                {purchases.length > 0 && (
                  <>
                    <Text style={[s.sectionSubTitle, { color: colors.text }]}>My Collection</Text>
                    {purchases.map((p) => {
                      const good = STATUS_GOODS.find((g) => g.id === p.good_id);
                      return (
                        <View key={p.id} style={[s.ownedCard, { backgroundColor: colors.surface, borderColor: p.equipped ? colors.accent + "55" : colors.border }]}>
                          <Text style={s.goodEmoji}>{p.good_emoji}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.goodName, { color: colors.text }]}>{p.good_name}</Text>
                            <Text style={[s.goodDesc, { color: colors.textMuted }]}>
                              {good?.description || "Status good"}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[s.equipBtn, { backgroundColor: p.equipped ? colors.accent : colors.backgroundTertiary }]}
                            onPress={() => toggleEquip(p)}
                          >
                            <Text style={[s.equipBtnText, { color: p.equipped ? "#fff" : colors.textSecondary }]}>
                              {p.equipped ? "Equipped" : "Equip"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                    <View style={[s.divider, { backgroundColor: colors.border }]} />
                    <Text style={[s.sectionSubTitle, { color: colors.text }]}>Shop</Text>
                  </>
                )}

                {STATUS_GOODS.map((item) => {
                  const itemTier = PRESTIGE_TIERS.find((t) => t.id === item.tier)!;
                  const canAfford = acoin >= item.acoin;
                  const tierUnlocked = tierIndex(tier.id) >= tierIndex(item.tier);
                  const owned = ownedIds.has(item.id);

                  return (
                    <View
                      key={item.id}
                      style={[s.goodCard, { backgroundColor: colors.surface, borderColor: owned ? "#34C759" + "44" : tierUnlocked ? itemTier.color + "33" : colors.border, opacity: tierUnlocked ? 1 : 0.5 }]}
                    >
                      <Text style={s.goodEmoji}>{item.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={s.goodTopRow}>
                          <Text style={[s.goodName, { color: colors.text }]}>{item.name}</Text>
                          <View style={[s.tierReqBadge, { backgroundColor: itemTier.color + "22" }]}>
                            <Text style={[s.tierReqText, { color: itemTier.color }]}>{itemTier.emoji} {itemTier.label}+</Text>
                          </View>
                        </View>
                        <Text style={[s.goodDesc, { color: colors.textSecondary }]}>{item.description}</Text>
                        <View style={s.goodFooter}>
                          <Text style={[s.goodPrice, { color: Colors.gold }]}>{item.acoin.toLocaleString()} ACoin</Text>
                          {owned && <Text style={[s.ownedBadge, { color: "#34C759" }]}>✓ Owned</Text>}
                          {!tierUnlocked && (
                            <Text style={[s.goodLocked, { color: colors.textMuted }]}>Reach {itemTier.label} to unlock</Text>
                          )}
                        </View>
                      </View>
                      {tierUnlocked && !owned && (
                        <TouchableOpacity
                          style={[s.goodBtn, { backgroundColor: canAfford ? colors.accent : colors.backgroundTertiary }]}
                          onPress={() => purchaseGood(item)}
                          disabled={purchasing === item.id}
                        >
                          {purchasing === item.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={[s.goodBtnText, { color: canAfford ? "#fff" : colors.textMuted }]}>
                              {canAfford ? "Buy" : "Fund"}
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                      {owned && (
                        <View style={[s.goodBtn, { backgroundColor: "#34C759" + "22" }]}>
                          <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                        </View>
                      )}
                      {!tierUnlocked && (
                        <View style={[s.goodBtn, { backgroundColor: colors.backgroundTertiary }]}>
                          <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {activeSection === "history" && (
              <View style={{ paddingHorizontal: 16 }}>
                {transactions.length === 0 ? (
                  <View style={s.emptyBox}>
                    <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
                    <Text style={[s.emptyText, { color: colors.textMuted }]}>No transactions yet</Text>
                    <Text style={[s.emptySubText, { color: colors.textMuted }]}>Purchase Status Goods or convert Nexa to see activity here</Text>
                  </View>
                ) : (
                  transactions.map((tx) => (
                    <View key={tx.id} style={[s.txRow, { backgroundColor: colors.surface }]}>
                      <View style={[s.txIcon, { backgroundColor: tx.color + "20" }]}>
                        <Ionicons name={tx.icon as any} size={18} color={tx.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.txLabel, { color: colors.text }]} numberOfLines={1}>{tx.label}</Text>
                        <Text style={[s.txTime, { color: colors.textMuted }]}>{new Date(tx.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
                      </View>
                      <Text style={[s.txAmount, { color: tx.amount > 0 ? "#34C759" : "#FF3B30" }]}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}

            {activeSection === "rich" && (
              <View style={{ paddingHorizontal: 16 }}>
                {loadingList ? (
                  <View style={{ padding: 8, gap: 8 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View>
                ) : (
                  <View style={[s.richListCard, { backgroundColor: colors.surface }]}>
                    {richList.map((u, idx) => {
                      const uTier = getPrestigeTier(u.acoin || 0);
                      const isMe = u.handle === profile?.handle;
                      return (
                        <TouchableOpacity
                          key={u.handle}
                          style={[s.richRow, idx < richList.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
                          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: u.id } })}
                        >
                          <Text style={[s.richRank, { color: idx < 3 ? Colors.gold : colors.textMuted }]}>
                            #{idx + 1}
                          </Text>
                          <Text style={{ fontSize: 18 }}>{uTier.emoji}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.richName, { color: isMe ? colors.accent : colors.text }]}>
                              {u.display_name} {isMe ? "(You)" : ""}
                            </Text>
                            <Text style={[s.richHandle, { color: colors.textMuted }]}>@{u.handle}</Text>
                          </View>
                          <Text style={[s.richAcoin, { color: Colors.gold }]}>{(u.acoin || 0).toLocaleString()} 🪙</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {richList.length === 0 && (
                      <Text style={[s.emptyText, { color: colors.textMuted, paddingVertical: 30 }]}>No users yet</Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  tierCard: { margin: 16, borderRadius: 20, padding: 18, borderWidth: 1.5 },
  tierTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  tierEmoji: { fontSize: 42 },
  tierLabel: { fontSize: 22, fontFamily: "Inter_700Bold" },
  tierDesc: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  acoinBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  acoinText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  statBox: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  progressLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  progressLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  gapText: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  maxBadge: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: "flex-start" },
  maxText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  tierChip: { borderRadius: 14, borderWidth: 1.5, padding: 12, alignItems: "center", minWidth: 80, position: "relative" },
  tierChipEmoji: { fontSize: 24, marginBottom: 4 },
  tierChipLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tierChipMin: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  activeIndicator: { position: "absolute", bottom: 6, width: 20, height: 3, borderRadius: 2 },
  sectionTabs: { flexDirection: "row", marginHorizontal: 16, marginBottom: 14, gap: 8 },
  sTab: { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: "center" },
  sTabText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#888" },
  sectionSubTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4, marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  ownedCard: { borderRadius: 14, padding: 14, flexDirection: "row", gap: 12, alignItems: "center", borderWidth: 1.5 },
  equipBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  equipBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  goodCard: { borderRadius: 14, padding: 14, flexDirection: "row", gap: 12, alignItems: "center", borderWidth: 1 },
  goodEmoji: { fontSize: 30, width: 44, textAlign: "center" },
  goodTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  goodName: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  tierReqBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  tierReqText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  goodDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginBottom: 6 },
  goodFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
  goodPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },
  goodLocked: { fontSize: 11, fontFamily: "Inter_400Regular" },
  ownedBadge: { fontSize: 12, fontFamily: "Inter_700Bold" },
  goodBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignItems: "center", justifyContent: "center", minWidth: 48 },
  goodBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { textAlign: "center", fontSize: 15, fontFamily: "Inter_500Medium" },
  emptySubText: { textAlign: "center", fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 30 },
  txRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12, borderRadius: 12, marginBottom: 6 },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  txLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  txTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  richListCard: { borderRadius: 16, overflow: "hidden" },
  richRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  richRank: { fontSize: 13, fontFamily: "Inter_700Bold", width: 28 },
  richName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  richHandle: { fontSize: 11, fontFamily: "Inter_400Regular" },
  richAcoin: { fontSize: 13, fontFamily: "Inter_700Bold" },
});
