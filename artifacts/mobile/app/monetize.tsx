import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withSpring } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { MONETIZE_FEATURES, formatAcoin, transferAcoin } from "@/lib/monetize";
import { PremiumGate } from "@/components/ui/PremiumGate";
import { isOnline } from "@/lib/offlineStore";

const ACOIN_TO_UGX = 100;
const GOLD = "#D4A853";

type Tab = "dashboard" | "features" | "market";
type CreatorSettings = Record<string, { enabled: boolean; price: number }>;

type DayEarning = { day: string; label: string; acoin: number };

function formatUGX(n: number): string {
  if (n >= 1000000) return `UGX ${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `UGX ${(n / 1000).toFixed(1)}K`;
  return `UGX ${n.toLocaleString()}`;
}

function getLastNDays(n: number): DayEarning[] {
  return Array.from({ length: n }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return {
      day: d.toISOString().split("T")[0],
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      acoin: 0,
    };
  });
}

function BarChart({ data, color }: { data: DayEarning[]; color: string }) {
  const max = Math.max(...data.map((d) => d.acoin), 1);
  const { width } = useWindowDimensions();
  const barW = Math.floor((width - 60) / data.length) - 8;

  return (
    <View style={chartStyles.root}>
      <View style={chartStyles.bars}>
        {data.map((d, i) => {
          const pct = d.acoin / max;
          const h = useSharedValue(0);
          useEffect(() => { h.value = withDelay(i * 60, withSpring(pct, { damping: 15, stiffness: 120 })); }, [pct]);
          const animStyle = useAnimatedStyle(() => ({ height: `${Math.max(h.value * 100, 4)}%` as any }));
          return (
            <View key={d.day} style={[chartStyles.barCol, { width: barW }]}>
              <Text style={chartStyles.barVal}>{d.acoin > 0 ? formatAcoin(d.acoin) : ""}</Text>
              <View style={chartStyles.barTrack}>
                <Animated.View style={[chartStyles.barFill, { backgroundColor: color }, animStyle]} />
              </View>
              <Text style={chartStyles.barLabel}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  root: { height: 120, paddingHorizontal: 4 },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  barCol: { alignItems: "center", gap: 4 },
  barVal: { fontSize: 8, fontFamily: "Inter_500Medium", color: GOLD, height: 12 },
  barTrack: { flex: 1, width: "100%", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden", justifyContent: "flex-end" },
  barFill: { borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
});

const CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  messaging: { label: "Messaging", icon: "chatbubble-outline", color: "#00BCD4" },
  profile: { label: "Profile", icon: "person-outline", color: "#FF9500" },
  content: { label: "Content", icon: "play-circle-outline", color: "#FF2D55" },
  marketplace: { label: "Marketplace", icon: "storefront-outline", color: "#FFD60A" },
  community: { label: "Community", icon: "people-outline", color: "#BF5AF2" },
};

const FEATURE_ROUTES: Record<string, string> = {
  paid_communities: "/paid-communities",
  digital_events: "/digital-events",
  freelance: "/freelance",
  username_market: "/username-market",
};

export default function MonetizeScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>("dashboard");
  const [settings, setSettings] = useState<CreatorSettings>({});
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [totalEarned, setTotalEarned] = useState(0);
  const [earningsByFeature, setEarningsByFeature] = useState<Record<string, number>>({});
  const [weekData, setWeekData] = useState<DayEarning[]>(getLastNDays(7));
  const [totalViews, setTotalViews] = useState(0);
  const [totalLikes, setTotalLikes] = useState(0);
  const [marketListings, setMarketListings] = useState<any[]>([]);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [editingFeature, setEditingFeature] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editEnabled, setEditEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    setLoadingSettings(true);
    const { data } = await supabase
      .from("creator_monetize_settings")
      .select("feature_id, enabled, price")
      .eq("user_id", user.id);

    const map: CreatorSettings = {};
    for (const f of MONETIZE_FEATURES) map[f.id] = { enabled: false, price: 50 };
    for (const row of (data || [])) map[row.feature_id] = { enabled: row.enabled, price: row.price };
    setSettings(map);
    setLoadingSettings(false);
  }, [user]);

  const loadEarnings = useCallback(async () => {
    if (!user) return;
    const [{ data: txData }, { data: creatorData }] = await Promise.all([
      supabase.from("acoin_transactions").select("transaction_type, amount, created_at").eq("user_id", user.id).gt("amount", 0),
      supabase.from("creator_earnings").select("amount_ugx, views_count, likes_count, earned_date").eq("user_id", user.id).order("earned_date", { ascending: false }).limit(30),
    ]);

    const byFeature: Record<string, number> = {};
    const days = getLastNDays(7);

    for (const tx of (txData || [])) {
      if (tx.transaction_type?.startsWith("monetize_")) {
        const key = tx.transaction_type.replace("monetize_", "");
        byFeature[key] = (byFeature[key] || 0) + tx.amount;
        const txDay = tx.created_at?.split("T")[0];
        const dayEntry = days.find((d) => d.day === txDay);
        if (dayEntry) dayEntry.acoin += tx.amount;
      }
    }

    let total = Object.values(byFeature).reduce((a, b) => a + b, 0);
    let views = 0, likes = 0;

    for (const row of (creatorData || [])) {
      const ac = Math.floor((row.amount_ugx || 0) / ACOIN_TO_UGX);
      if (ac > 0) {
        byFeature["post_engagement"] = (byFeature["post_engagement"] || 0) + ac;
        total += ac;
        const dayEntry = days.find((d) => d.day === row.earned_date);
        if (dayEntry) dayEntry.acoin += ac;
      }
      views += row.views_count || 0;
      likes += row.likes_count || 0;
    }

    setTotalEarned(total);
    setEarningsByFeature(byFeature);
    setWeekData(days);
    setTotalViews(views);
    setTotalLikes(likes);
  }, [user]);

  const loadMarket = useCallback(async () => {
    setLoadingMarket(true);
    const { data } = await supabase
      .from("creator_monetize_settings")
      .select("feature_id, price, user_id, profiles!creator_monetize_settings_user_id_fkey(display_name, handle, avatar_url, is_verified)")
      .eq("enabled", true)
      .neq("user_id", user?.id || "")
      .order("price", { ascending: false })
      .limit(50);
    setMarketListings(data || []);
    setLoadingMarket(false);
  }, [user]);

  useEffect(() => {
    loadSettings();
    loadEarnings();
    refreshProfile?.();
  }, [loadSettings, loadEarnings]);

  useEffect(() => {
    if (tab === "market") loadMarket();
  }, [tab]);

  async function saveSetting(featureId: string, enabled: boolean, price: number) {
    if (!isOnline()) {
      showAlert("No internet", "Saving monetization settings requires an internet connection.");
      return;
    }
    if (!user) return;
    setSavingId(featureId);
    await supabase.from("creator_monetize_settings").upsert(
      { user_id: user.id, feature_id: featureId, enabled, price: Math.max(1, price) },
      { onConflict: "user_id,feature_id" }
    );
    setSettings((prev) => ({ ...prev, [featureId]: { enabled, price } }));
    setSavingId(null);
    setEditingFeature(null);
  }

  function openEdit(featureId: string) {
    const cur = settings[featureId] || { enabled: false, price: 50 };
    setEditingFeature(featureId);
    setEditPrice(String(cur.price));
    setEditEnabled(cur.enabled);
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadSettings(), loadEarnings(), refreshProfile?.()]);
    if (tab === "market") await loadMarket();
    setRefreshing(false);
  }

  const activeFeatures = Object.values(settings).filter((s) => s.enabled).length;
  const acoinBalance = profile?.acoin || 0;
  const categories = Array.from(new Set(MONETIZE_FEATURES.map((f) => f.category)));
  const hasEarnings = Object.keys(earningsByFeature).length > 0;

  function renderDashboard() {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        <LinearGradient
          colors={["#1a1a2e", "#16213e", "#0f3460"]}
          style={styles.heroCard}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Total ACoin Earned</Text>
              <Text style={styles.heroValue}>{formatAcoin(totalEarned)} 🪙</Text>
            </View>
            <View style={styles.heroCoin}>
              <Text style={{ fontSize: 40 }}>🪙</Text>
            </View>
          </View>

          <BarChart data={weekData} color={GOLD} />

          <View style={styles.heroStats}>
            {[
              { label: "Balance", value: `${formatAcoin(acoinBalance)} 🪙` },
              { label: "Active", value: `${activeFeatures}/${MONETIZE_FEATURES.length}` },
              { label: "Views", value: totalViews > 0 ? formatAcoin(totalViews) : "—" },
            ].map((s) => (
              <View key={s.label} style={styles.heroStat}>
                <Text style={styles.heroStatVal}>{s.value}</Text>
                <Text style={styles.heroStatLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>


        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Earnings Breakdown</Text>
          {hasEarnings ? (
            <>
              {MONETIZE_FEATURES.filter((f) => earningsByFeature[f.id] > 0).map((f) => (
                <View key={f.id} style={[styles.earningRow, { backgroundColor: colors.surface }]}>
                  <View style={[styles.earningIcon, { backgroundColor: f.color + "20" }]}>
                    <Text style={{ fontSize: 18 }}>{f.emoji}</Text>
                  </View>
                  <Text style={[styles.earningLabel, { color: colors.text, flex: 1 }]}>{f.title}</Text>
                  <View>
                    <Text style={[styles.earningAcoin, { color: GOLD }]}>+{formatAcoin(earningsByFeature[f.id])} 🪙</Text>
                  </View>
                </View>
              ))}
              {earningsByFeature["post_engagement"] > 0 && !MONETIZE_FEATURES.find((f) => f.id === "post_engagement") && (
                <View style={[styles.earningRow, { backgroundColor: colors.surface }]}>
                  <View style={[styles.earningIcon, { backgroundColor: "#34C75920" }]}>
                    <Text style={{ fontSize: 18 }}>📊</Text>
                  </View>
                  <Text style={[styles.earningLabel, { color: colors.text, flex: 1 }]}>Post Engagement</Text>
                  <View>
                    <Text style={[styles.earningAcoin, { color: GOLD }]}>+{formatAcoin(earningsByFeature["post_engagement"])} 🪙</Text>
                  </View>
                </View>
              )}
              {(totalViews > 0 || totalLikes > 0) && (
                <View style={[styles.engagementRow, { backgroundColor: colors.surface }]}>
                  {totalViews > 0 && (
                    <View style={styles.engItem}>
                      <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
                      <Text style={[styles.engVal, { color: colors.text }]}>{totalViews.toLocaleString()}</Text>
                      <Text style={[styles.engLabel, { color: colors.textMuted }]}>Post Views</Text>
                    </View>
                  )}
                  {totalViews > 0 && totalLikes > 0 && <View style={[styles.engDivider, { backgroundColor: colors.border }]} />}
                  {totalLikes > 0 && (
                    <View style={styles.engItem}>
                      <Ionicons name="heart-outline" size={18} color="#FF2D55" />
                      <Text style={[styles.engVal, { color: colors.text }]}>{totalLikes.toLocaleString()}</Text>
                      <Text style={[styles.engLabel, { color: colors.textMuted }]}>Post Likes</Text>
                    </View>
                  )}
                </View>
              )}
            </>
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: colors.surface }]}>
              <Text style={{ fontSize: 40 }}>💸</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No earnings yet</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>Enable monetization features to start earning ACoin from your audience.</Text>
              <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.accent }]} onPress={() => setTab("features")}>
                <Text style={styles.emptyBtnText}>Set Up Features</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Launch</Text>
          {[
            { label: "Paid Communities", emoji: "🏰", route: "/paid-communities" },
            { label: "Digital Events", emoji: "🎫", route: "/digital-events" },
            { label: "Freelance Market", emoji: "💼", route: "/freelance" },
            { label: "Username Market", emoji: "🏷️", route: "/username-market" },
          ].map((item) => (
            <TouchableOpacity key={item.route} style={[styles.quickLink, { backgroundColor: colors.surface }]} onPress={() => router.push(item.route as any)}>
              <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
              <Text style={[styles.quickLinkText, { color: colors.text }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderFeatures() {
    if (loadingSettings) return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 60, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={[styles.infoBanner, { backgroundColor: colors.accent + "14" }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
          <Text style={[styles.infoBannerText, { color: colors.accent }]}>
            {activeFeatures} of {MONETIZE_FEATURES.length} features active · Earnings paid out in ACoin
          </Text>
        </View>

        {categories.map((cat) => {
          const catDef = CATEGORY_LABELS[cat];
          const catFeatures = MONETIZE_FEATURES.filter((f) => f.category === cat);
          return (
            <View key={cat} style={styles.catSection}>
              <View style={styles.catHeader}>
                <View style={[styles.catIconWrap, { backgroundColor: catDef.color + "20" }]}>
                  <Ionicons name={catDef.icon as any} size={14} color={catDef.color} />
                </View>
                <Text style={[styles.catTitle, { color: colors.textMuted }]}>{catDef.label.toUpperCase()}</Text>
              </View>
              <View style={[styles.catCard, { backgroundColor: colors.surface }]}>
                {catFeatures.map((feature, fi) => {
                  const s = settings[feature.id] || { enabled: false, price: 50 };
                  const isMarket = !!FEATURE_ROUTES[feature.id];
                  const earnings = earningsByFeature[feature.id] || 0;
                  return (
                    <View key={feature.id}>
                      {fi > 0 && <View style={[styles.featureSep, { backgroundColor: colors.border }]} />}
                      <TouchableOpacity
                        style={styles.featureRow}
                        onPress={() => isMarket ? router.push(FEATURE_ROUTES[feature.id] as any) : openEdit(feature.id)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.featureEmojiBg, { backgroundColor: feature.color + "18" }]}>
                          <Text style={{ fontSize: 20 }}>{feature.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.featureNameRow}>
                            <Text style={[styles.featureName, { color: colors.text }]}>{feature.title}</Text>
                            {earnings > 0 && (
                              <View style={[styles.earningsMini, { backgroundColor: GOLD + "20" }]}>
                                <Text style={[styles.earningsMiniText, { color: GOLD }]}>+{formatAcoin(earnings)} 🪙</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.featureDesc, { color: colors.textMuted }]}>{feature.description}</Text>
                          {s.enabled && !isMarket && (
                            <Text style={[styles.featurePrice, { color: feature.color }]}>{s.price} ACoin per interaction</Text>
                          )}
                        </View>
                        {savingId === feature.id ? (
                          <ActivityIndicator size="small" color={colors.accent} />
                        ) : isMarket ? (
                          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                        ) : (
                          <Switch
                            value={s.enabled}
                            onValueChange={(val) => val ? openEdit(feature.id) : saveSetting(feature.id, false, s.price)}
                            trackColor={{ false: colors.backgroundTertiary, true: feature.color }}
                            thumbColor="#fff"
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  }

  function renderMarket() {
    if (loadingMarket) return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
    if (marketListings.length === 0) {
      return (
        <View style={styles.emptyFull}>
          <Text style={{ fontSize: 48 }}>🛒</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Market is empty</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Be the first creator to enable monetization features</Text>
          <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.accent }]} onPress={() => setTab("features")}>
            <Text style={styles.emptyBtnText}>Enable Features</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <FlatList
        data={marketListings}
        keyExtractor={(item, i) => `${item.user_id}-${item.feature_id}-${i}`}
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: insets.bottom + 60 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderItem={({ item }) => {
          const feature = MONETIZE_FEATURES.find((f) => f.id === item.feature_id);
          if (!feature) return null;
          const p = item.profiles;
          return (
            <TouchableOpacity
              style={[styles.marketCard, { backgroundColor: colors.surface, borderColor: feature.color + "33" }]}
              onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.user_id } })}
              activeOpacity={0.88}
            >
              {p?.avatar_url ? (
                <Image source={{ uri: p.avatar_url }} style={styles.marketAvatar} />
              ) : (
                <View style={[styles.marketAvatar, { backgroundColor: feature.color + "22", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ fontSize: 18 }}>{feature.emoji}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.marketNameRow}>
                  <Text style={[styles.marketName, { color: colors.text }]} numberOfLines={1}>
                    {p?.display_name || `@${p?.handle || "creator"}`}
                  </Text>
                  {p?.is_verified && <Ionicons name="checkmark-circle" size={13} color={colors.accent} />}
                </View>
                <Text style={[styles.marketFeature, { color: colors.textMuted }]}>
                  {feature.emoji} {feature.title}
                </Text>
              </View>
              <View style={[styles.marketPricePill, { backgroundColor: feature.color + "20" }]}>
                <Text style={[styles.marketPrice, { color: feature.color }]}>{item.price} 🪙</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  }

  return (
    <PremiumGate
      tier="silver"
      title="Monetize Your Content"
      description="Monetization tools are available for Silver members and above. Upgrade to earn from your audience."
    >
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Creator Studio</Text>
        <TouchableOpacity onPress={() => router.push("/wallet" as any)} hitSlop={10}>
          <View style={[styles.balancePill, { backgroundColor: GOLD + "20" }]}>
            <Text style={[styles.balancePillText, { color: GOLD }]}>{formatAcoin(acoinBalance)} 🪙</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {([
          { key: "dashboard", label: "Dashboard", icon: "stats-chart-outline" },
          { key: "features", label: "Features", icon: "toggle-outline" },
          { key: "market", label: "Market", icon: "storefront-outline" },
        ] as const).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons name={t.icon} size={15} color={tab === t.key ? colors.accent : colors.textMuted} />
            <Text style={[styles.tabText, { color: tab === t.key ? colors.accent : colors.textMuted }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1, paddingHorizontal: tab === "market" ? 0 : 14, paddingTop: tab === "market" ? 0 : 8 }}>
        {tab === "dashboard" && renderDashboard()}
        {tab === "features" && renderFeatures()}
        {tab === "market" && renderMarket()}
      </View>

      <Modal visible={!!editingFeature} transparent animationType="slide" onRequestClose={() => setEditingFeature(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.dragHandle} />
            {editingFeature && (() => {
              const feature = MONETIZE_FEATURES.find((f) => f.id === editingFeature)!;
              if (!feature) return null;
              return (
                <>
                  <View style={styles.modalHead}>
                    <View style={[styles.modalEmojiBg, { backgroundColor: feature.color + "20" }]}>
                      <Text style={{ fontSize: 28 }}>{feature.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalTitle, { color: colors.text }]}>{feature.title}</Text>
                      <Text style={[styles.modalDesc, { color: colors.textMuted }]}>{feature.description}</Text>
                    </View>
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Price per interaction</Text>
                  <View style={[styles.priceRow, { backgroundColor: colors.backgroundTertiary }]}>
                    <TouchableOpacity onPress={() => setEditPrice((p) => String(Math.max(1, parseInt(p) - 10)))} hitSlop={10}>
                      <Ionicons name="remove-circle-outline" size={28} color={feature.color} />
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.priceInput, { color: colors.text }]}
                      value={editPrice}
                      onChangeText={setEditPrice}
                      keyboardType="number-pad"
                      textAlign="center"
                    />
                    <Text style={[styles.priceUnit, { color: colors.textMuted }]}>ACoin</Text>
                    <TouchableOpacity onPress={() => setEditPrice((p) => String(parseInt(p) + 10))} hitSlop={10}>
                      <Ionicons name="add-circle-outline" size={28} color={feature.color} />
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.enableRow, { borderColor: colors.border }]}>
                    <View>
                      <Text style={[styles.enableLabel, { color: colors.text }]}>Activate this feature</Text>
                      <Text style={[styles.enableSub, { color: colors.textMuted }]}>Start charging your audience now</Text>
                    </View>
                    <Switch
                      value={editEnabled}
                      onValueChange={setEditEnabled}
                      trackColor={{ false: colors.backgroundTertiary, true: feature.color }}
                      thumbColor="#fff"
                    />
                  </View>

                  <View style={styles.modalBtns}>
                    <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setEditingFeature(null)}>
                      <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: feature.color }]}
                      onPress={() => saveSetting(editingFeature, editEnabled, parseInt(editPrice) || 50)}
                    >
                      {savingId === editingFeature ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
    </PremiumGate>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  balancePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  balancePillText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  heroCard: { borderRadius: 20, padding: 20, marginBottom: 14, gap: 16 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)", marginBottom: 4 },
  heroValue: { fontSize: 36, fontFamily: "Inter_700Bold", color: GOLD },
  heroCoin: { alignItems: "center", justifyContent: "center" },
  heroStats: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 14, gap: 0 },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatVal: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff", marginBottom: 2 },
  heroStatLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)" },
  withdrawCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 16, borderWidth: 1.5, marginBottom: 14 },
  withdrawIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  withdrawTitle: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 2 },
  withdrawAmount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  withdrawBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  withdrawBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 },
  earningRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, marginBottom: 6 },
  earningIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  earningLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  earningAcoin: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "right" },
  engagementRow: { flexDirection: "row", borderRadius: 14, padding: 16, marginBottom: 6 },
  engItem: { flex: 1, alignItems: "center", gap: 4 },
  engVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  engLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  engDivider: { width: StyleSheet.hairlineWidth, marginVertical: 8 },
  emptyBox: { borderRadius: 16, padding: 28, alignItems: "center", gap: 10 },
  emptyFull: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 4 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  quickLink: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 16, gap: 14, marginBottom: 8 },
  quickLinkText: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, marginBottom: 14 },
  infoBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  catSection: { marginBottom: 16 },
  catHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  catIconWrap: { width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  catTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  catCard: { borderRadius: 16, overflow: "hidden" },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  featureSep: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
  featureEmojiBg: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featureNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  featureName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  earningsMini: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  earningsMiniText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  featureDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  featurePrice: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 3 },
  marketCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14, borderWidth: 1 },
  marketAvatar: { width: 46, height: 46, borderRadius: 23 },
  marketNameRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 },
  marketName: { fontSize: 14, fontFamily: "Inter_700Bold", flex: 1 },
  marketFeature: { fontSize: 12, fontFamily: "Inter_400Regular" },
  marketPricePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  marketPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 4 },
  modalHead: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  modalEmojiBg: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 3 },
  modalDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  priceRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  priceInput: { flex: 1, fontSize: 28, fontFamily: "Inter_700Bold", padding: 0 },
  priceUnit: { fontSize: 13, fontFamily: "Inter_500Medium" },
  priceHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  enableRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14 },
  enableLabel: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 2 },
  enableSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  modalBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  saveBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
