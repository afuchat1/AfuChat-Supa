import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import ReAnimated, { useSharedValue, useAnimatedStyle, withDelay, withSpring } from "react-native-reanimated";
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
import { Avatar } from "@/components/ui/Avatar";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import * as Haptics from "@/lib/haptics";

const { width: SCREEN_W } = Dimensions.get("window");
const GOLD = "#D4A853";
const ACOIN_TO_UGX = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "dashboard" | "features" | "market";
type CreatorSettings = Record<string, { enabled: boolean; price: number }>;
type DayEarning = { day: string; label: string; acoin: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLastNDays(n: number): DayEarning[] {
  return Array.from({ length: n }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return { day: d.toISOString().split("T")[0], label: d.toLocaleDateString("en-US", { weekday: "short" }), acoin: 0 };
  });
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function BarChart({ data, color }: { data: DayEarning[]; color: string }) {
  const max = Math.max(...data.map((d) => d.acoin), 1);
  const barW = Math.floor((SCREEN_W - 80) / data.length) - 6;

  return (
    <View style={ch.root}>
      <View style={ch.bars}>
        {data.map((d, i) => {
          const pct = d.acoin / max;
          const h = useSharedValue(0);
          useEffect(() => { h.value = withDelay(i * 55, withSpring(pct, { damping: 14, stiffness: 110 })); }, [pct]);
          const animStyle = useAnimatedStyle(() => ({ height: `${Math.max(h.value * 100, 4)}%` as any }));
          return (
            <View key={d.day} style={[ch.col, { width: barW }]}>
              <Text style={ch.val}>{d.acoin > 0 ? formatAcoin(d.acoin) : ""}</Text>
              <View style={ch.track}>
                <ReAnimated.View style={[ch.fill, { backgroundColor: color }, animStyle]} />
              </View>
              <Text style={ch.lbl}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
const ch = StyleSheet.create({
  root: { height: 110, paddingHorizontal: 4 },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  col: { alignItems: "center", gap: 3 },
  val: { fontSize: 8, fontFamily: "Inter_500Medium", color: GOLD, height: 11 },
  track: { flex: 1, width: "100%", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden", justifyContent: "flex-end" },
  fill: { borderRadius: 4, minHeight: 4 },
  lbl: { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
});

// ─── Category defs ────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  messaging:   { label: "Messaging",   icon: "chatbubble-outline",   color: "#00BCD4" },
  profile:     { label: "Profile",     icon: "person-outline",       color: "#FF9500" },
  content:     { label: "Content",     icon: "play-circle-outline",  color: "#FF2D55" },
  marketplace: { label: "Marketplace", icon: "storefront-outline",   color: "#FFD60A" },
  community:   { label: "Community",   icon: "people-outline",       color: "#BF5AF2" },
};

const FEATURE_ROUTES: Record<string, string> = {
  paid_communities: "/paid-communities",
  digital_events:   "/digital-events",
  freelance:        "/freelance",
  username_market:  "/username-market",
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MonetizeScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const pillX = useRef(new Animated.Value(0)).current;

  const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
    { key: "dashboard", label: "Dashboard", icon: "stats-chart-outline" },
    { key: "features",  label: "Features",  icon: "toggle-outline" },
    { key: "market",    label: "Market",    icon: "storefront-outline" },
  ];
  const tabW = (SCREEN_W - 32) / TABS.length;

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

  // ── Data fetching ─────────────────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    if (!user) return;
    setLoadingSettings(true);
    const { data } = await supabase.from("creator_monetize_settings").select("feature_id, enabled, price").eq("user_id", user.id);
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
        const dayEntry = days.find((d) => d.day === tx.created_at?.split("T")[0]);
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

  useEffect(() => { loadSettings(); loadEarnings(); refreshProfile?.(); }, [loadSettings, loadEarnings]);
  useEffect(() => { if (tab === "market") loadMarket(); }, [tab]);

  // ── Actions ───────────────────────────────────────────────────────────────

  function switchTab(t: Tab) {
    const idx = TABS.findIndex((x) => x.key === t);
    Animated.spring(pillX, { toValue: idx * tabW, useNativeDriver: true, damping: 20, stiffness: 180 }).start();
    setTab(t);
    Haptics.selectionAsync();
  }

  async function saveSetting(featureId: string, enabled: boolean, price: number) {
    if (!isOnline()) { showAlert("No internet", "Saving monetization settings requires an internet connection."); return; }
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadSettings(), loadEarnings(), refreshProfile?.()]);
    if (tab === "market") await loadMarket();
    setRefreshing(false);
  }

  const activeFeatures = Object.values(settings).filter((s) => s.enabled).length;
  const acoinBalance   = profile?.acoin || 0;
  const categories     = Array.from(new Set(MONETIZE_FEATURES.map((f) => f.category)));
  const hasEarnings    = Object.keys(earningsByFeature).length > 0;

  // ── Dashboard ─────────────────────────────────────────────────────────────

  function renderDashboard() {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={cs.dashScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        {/* Hero earnings card */}
        <LinearGradient colors={["#1a1a2e", "#16213e", "#0f3460"]} style={cs.heroGrad}>
          <View style={cs.heroTop}>
            <View>
              <Text style={cs.heroLabel}>Total ACoin Earned</Text>
              <Text style={cs.heroValue}>{formatAcoin(totalEarned)} 🪙</Text>
            </View>
            <View style={[cs.acoinPill, { backgroundColor: GOLD + "22" }]}>
              <Text style={[cs.acoinPillText, { color: GOLD }]}>Balance: {formatAcoin(acoinBalance)} 🪙</Text>
            </View>
          </View>

          <BarChart data={weekData} color={GOLD} />

          <View style={cs.heroStats}>
            {[
              { label: "Active Features", value: `${activeFeatures}/${MONETIZE_FEATURES.length}` },
              { label: "Post Views",      value: totalViews > 0 ? formatAcoin(totalViews) : "—" },
              { label: "Post Likes",      value: totalLikes > 0 ? formatAcoin(totalLikes) : "—" },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 && <View style={cs.heroStatDiv} />}
                <View style={cs.heroStat}>
                  <Text style={cs.heroStatVal}>{s.value}</Text>
                  <Text style={cs.heroStatLabel}>{s.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </LinearGradient>

        {/* Earnings breakdown */}
        <Text style={[cs.sectionTitle, { color: colors.text }]}>Earnings Breakdown</Text>
        {hasEarnings ? (
          <View style={[cs.floatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {MONETIZE_FEATURES.filter((f) => earningsByFeature[f.id] > 0).map((f, i, arr) => (
              <View key={f.id}>
                {i > 0 && <View style={[cs.sep, { backgroundColor: colors.border }]} />}
                <View style={cs.earningRow}>
                  <View style={[cs.earningIcon, { backgroundColor: f.color + "20" }]}>
                    <Text style={{ fontSize: 18 }}>{f.emoji}</Text>
                  </View>
                  <Text style={[cs.earningLabel, { color: colors.text }]}>{f.title}</Text>
                  <Text style={[cs.earningAmt, { color: GOLD }]}>+{formatAcoin(earningsByFeature[f.id])} 🪙</Text>
                </View>
              </View>
            ))}
            {earningsByFeature["post_engagement"] > 0 && !MONETIZE_FEATURES.find((f) => f.id === "post_engagement") && (
              <>
                <View style={[cs.sep, { backgroundColor: colors.border }]} />
                <View style={cs.earningRow}>
                  <View style={[cs.earningIcon, { backgroundColor: "#34C75920" }]}>
                    <Text style={{ fontSize: 18 }}>📊</Text>
                  </View>
                  <Text style={[cs.earningLabel, { color: colors.text }]}>Post Engagement</Text>
                  <Text style={[cs.earningAmt, { color: GOLD }]}>+{formatAcoin(earningsByFeature["post_engagement"])} 🪙</Text>
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={[cs.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 44 }}>💸</Text>
            <Text style={[cs.emptyTitle, { color: colors.text }]}>No earnings yet</Text>
            <Text style={[cs.emptySub, { color: colors.textMuted }]}>Enable monetization features to start earning ACoin from your audience.</Text>
            <TouchableOpacity style={[cs.emptyBtn, { backgroundColor: colors.accent }]} onPress={() => switchTab("features")}>
              <Text style={cs.emptyBtnText}>Set Up Features</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick launch */}
        <Text style={[cs.sectionTitle, { color: colors.text }]}>Quick Launch</Text>
        <View style={[cs.floatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { label: "Paid Communities", emoji: "🏰", route: "/paid-communities" },
            { label: "Digital Events",   emoji: "🎫", route: "/digital-events" },
            { label: "Freelance Market", emoji: "💼", route: "/freelance" },
            { label: "Username Market",  emoji: "🏷️", route: "/username-market" },
          ].map((item, i, arr) => (
            <View key={item.route}>
              {i > 0 && <View style={[cs.sep, { backgroundColor: colors.border }]} />}
              <TouchableOpacity style={cs.quickRow} onPress={() => router.push(item.route as any)} activeOpacity={0.75}>
                <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
                <Text style={[cs.quickLabel, { color: colors.text }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  // ── Features ──────────────────────────────────────────────────────────────

  function renderFeatures() {
    if (loadingSettings) {
      return (
        <View style={{ padding: 16, gap: 10, marginTop: 4 }}>
          {[1,2,3,4,5].map((i) => <ListRowSkeleton key={i} />)}
        </View>
      );
    }
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={cs.featScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Info banner */}
        <View style={[cs.infoBanner, { backgroundColor: colors.accent + "14" }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
          <Text style={[cs.infoBannerText, { color: colors.accent }]}>
            {activeFeatures} of {MONETIZE_FEATURES.length} features active · Earnings paid out in ACoin
          </Text>
        </View>

        {categories.map((cat) => {
          const meta = CATEGORY_META[cat];
          const catFeatures = MONETIZE_FEATURES.filter((f) => f.category === cat);
          return (
            <View key={cat} style={{ gap: 6 }}>
              <View style={cs.catHeader}>
                <View style={[cs.catIconWrap, { backgroundColor: meta.color + "20" }]}>
                  <Ionicons name={meta.icon as any} size={13} color={meta.color} />
                </View>
                <Text style={[cs.catLabel, { color: colors.textMuted }]}>{meta.label.toUpperCase()}</Text>
              </View>
              <View style={[cs.floatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {catFeatures.map((feature, fi) => {
                  const s = settings[feature.id] || { enabled: false, price: 50 };
                  const isMarket = !!FEATURE_ROUTES[feature.id];
                  const earnings = earningsByFeature[feature.id] || 0;
                  return (
                    <View key={feature.id}>
                      {fi > 0 && <View style={[cs.sep, { backgroundColor: colors.border, marginLeft: 70 }]} />}
                      <TouchableOpacity
                        style={cs.featRow}
                        onPress={() => isMarket ? router.push(FEATURE_ROUTES[feature.id] as any) : openEdit(feature.id)}
                        activeOpacity={0.8}
                      >
                        <View style={[cs.featEmoji, { backgroundColor: feature.color + "18" }]}>
                          <Text style={{ fontSize: 20 }}>{feature.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 }}>
                            <Text style={[cs.featName, { color: colors.text }]}>{feature.title}</Text>
                            {earnings > 0 && (
                              <View style={[cs.earningsMini, { backgroundColor: GOLD + "20" }]}>
                                <Text style={[cs.earningsMiniText, { color: GOLD }]}>+{formatAcoin(earnings)}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[cs.featDesc, { color: colors.textMuted }]}>{feature.description}</Text>
                          {s.enabled && !isMarket && (
                            <Text style={[cs.featPrice, { color: feature.color }]}>{s.price} ACoin / interaction</Text>
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

  // ── Market ────────────────────────────────────────────────────────────────

  function renderMarket() {
    if (loadingMarket) {
      return (
        <View style={{ padding: 16, gap: 10, marginTop: 4 }}>
          {[1,2,3,4].map((i) => <ListRowSkeleton key={i} />)}
        </View>
      );
    }
    if (marketListings.length === 0) {
      return (
        <View style={cs.emptyFull}>
          <Text style={{ fontSize: 52 }}>🛒</Text>
          <Text style={[cs.emptyTitle, { color: colors.text }]}>Market is empty</Text>
          <Text style={[cs.emptySub, { color: colors.textMuted }]}>Be the first creator to enable monetization features</Text>
          <TouchableOpacity style={[cs.emptyBtn, { backgroundColor: colors.accent }]} onPress={() => switchTab("features")}>
            <Text style={cs.emptyBtnText}>Enable Features</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <FlatList
        data={marketListings}
        keyExtractor={(item, i) => `${item.user_id}-${item.feature_id}-${i}`}
        contentContainerStyle={cs.marketList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderItem={({ item }) => {
          const feature = MONETIZE_FEATURES.find((f) => f.id === item.feature_id);
          if (!feature) return null;
          const p = item.profiles;
          return (
            <TouchableOpacity
              style={[cs.marketCard, { backgroundColor: colors.surface, borderColor: feature.color + "33" }]}
              onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.user_id } })}
              activeOpacity={0.85}
            >
              <Avatar uri={p?.avatar_url} name={p?.display_name || p?.handle} size={46} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 }}>
                  <Text style={[cs.marketName, { color: colors.text }]} numberOfLines={1}>{p?.display_name || `@${p?.handle || "creator"}`}</Text>
                  {p?.is_verified && <Ionicons name="checkmark-circle" size={13} color={colors.accent} />}
                </View>
                <Text style={[cs.marketFeature, { color: colors.textMuted }]}>{feature.emoji} {feature.title}</Text>
              </View>
              <View style={[cs.marketPill, { backgroundColor: feature.color + "20" }]}>
                <Text style={[cs.marketPrice, { color: feature.color }]}>{item.price} 🪙</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  }

  // ── Edit modal ────────────────────────────────────────────────────────────

  const editFeatureDef = editingFeature ? MONETIZE_FEATURES.find((f) => f.id === editingFeature) : null;

  return (
    <PremiumGate tier="silver" title="Monetize Your Content" description="Monetization tools are available for Silver members and above. Upgrade to earn from your audience.">
      <View style={[cs.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <View style={[cs.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={cs.headerBack}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[cs.headerTitle, { color: colors.text }]}>Creator Studio</Text>
          <TouchableOpacity onPress={() => router.push("/wallet" as any)} hitSlop={10}>
            <View style={[cs.walletPill, { backgroundColor: GOLD + "20" }]}>
              <Text style={[cs.walletText, { color: GOLD }]}>{formatAcoin(acoinBalance)} 🪙</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Animated pill tab bar ─────────────────────────────────── */}
        <View style={[cs.tabBarWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={[cs.tabBar, { backgroundColor: colors.backgroundSecondary }]}>
            <Animated.View
              style={[cs.tabPill, {
                width: tabW - 6,
                backgroundColor: GOLD,
                transform: [{ translateX: Animated.add(pillX, new Animated.Value(3)) }],
              }]}
            />
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <TouchableOpacity key={t.key} style={[cs.tab, { width: tabW }]} onPress={() => switchTab(t.key)} activeOpacity={0.75}>
                  <Ionicons name={t.icon} size={14} color={active ? "#fff" : colors.textMuted} />
                  <Text style={[cs.tabLabel, { color: active ? "#fff" : colors.textMuted }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Content ─────────────────────────────────────────────────── */}
        <View style={{ flex: 1, paddingHorizontal: tab === "market" ? 0 : 14, paddingTop: tab === "market" ? 0 : 8 }}>
          {tab === "dashboard" && renderDashboard()}
          {tab === "features"  && renderFeatures()}
          {tab === "market"    && renderMarket()}
        </View>

        {/* ── Feature edit sheet ───────────────────────────────────────── */}
        <Modal visible={!!editingFeature} transparent animationType="slide" onRequestClose={() => setEditingFeature(null)}>
          <View style={cs.modalOverlay}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEditingFeature(null)} />
            <View style={[cs.modalSheet, { backgroundColor: colors.surface }]}>
              <View style={[cs.dragHandle, { backgroundColor: colors.border }]} />

              {editFeatureDef && (
                <>
                  {/* Feature identity */}
                  <View style={cs.modalHead}>
                    <View style={[cs.modalEmoji, { backgroundColor: editFeatureDef.color + "20" }]}>
                      <Text style={{ fontSize: 28 }}>{editFeatureDef.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[cs.modalTitle, { color: colors.text }]}>{editFeatureDef.title}</Text>
                      <Text style={[cs.modalDesc, { color: colors.textMuted }]}>{editFeatureDef.description}</Text>
                    </View>
                  </View>

                  {/* Price stepper — floating input style */}
                  <Text style={[cs.inputLabel, { color: colors.textMuted }]}>Price per interaction</Text>
                  <View style={[cs.priceStepper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                    <TouchableOpacity
                      style={[cs.stepBtn, { backgroundColor: editFeatureDef.color + "18" }]}
                      onPress={() => setEditPrice((p) => String(Math.max(1, parseInt(p || "0") - 10)))}
                      hitSlop={10}
                    >
                      <Ionicons name="remove" size={20} color={editFeatureDef.color} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <TextInput
                        style={[cs.priceInput, { color: colors.text }]}
                        value={editPrice}
                        onChangeText={setEditPrice}
                        keyboardType="number-pad"
                        textAlign="center"
                      />
                      <Text style={[cs.priceUnit, { color: colors.textMuted }]}>ACoin</Text>
                    </View>
                    <TouchableOpacity
                      style={[cs.stepBtn, { backgroundColor: editFeatureDef.color + "18" }]}
                      onPress={() => setEditPrice((p) => String(parseInt(p || "0") + 10))}
                      hitSlop={10}
                    >
                      <Ionicons name="add" size={20} color={editFeatureDef.color} />
                    </TouchableOpacity>
                  </View>

                  {/* Enable toggle */}
                  <View style={[cs.enableRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[cs.enableLabel, { color: colors.text }]}>Activate feature</Text>
                      <Text style={[cs.enableSub, { color: colors.textMuted }]}>Start charging your audience now</Text>
                    </View>
                    <Switch
                      value={editEnabled}
                      onValueChange={setEditEnabled}
                      trackColor={{ false: colors.backgroundTertiary, true: editFeatureDef.color }}
                      thumbColor="#fff"
                    />
                  </View>

                  {/* Buttons */}
                  <View style={cs.modalBtns}>
                    <TouchableOpacity style={[cs.cancelBtn, { borderColor: colors.border }]} onPress={() => setEditingFeature(null)}>
                      <Text style={[cs.cancelText, { color: colors.text }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[cs.saveBtn, { backgroundColor: editFeatureDef.color }]}
                      onPress={() => saveSetting(editingFeature!, editEnabled, parseInt(editPrice) || 50)}
                    >
                      {savingId === editingFeature
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={cs.saveBtnText}>Save</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

      </View>
    </PremiumGate>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  headerBack: { padding: 6 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_700Bold" },
  walletPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  walletText: { fontSize: 13, fontFamily: "Inter_700Bold" },

  tabBarWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBar: { flexDirection: "row", borderRadius: 14, padding: 3, position: "relative", overflow: "hidden" },
  tabPill: { position: "absolute", top: 3, bottom: 3, borderRadius: 11, zIndex: 0 },
  tab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, zIndex: 1 },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Float card (shared)
  floatCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 4,
  },
  sep: { height: StyleSheet.hairlineWidth },

  // Dashboard
  dashScroll: { gap: 14, paddingBottom: 60 },
  heroGrad: { borderRadius: 20, padding: 20, gap: 16 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)", marginBottom: 4 },
  heroValue: { fontSize: 34, fontFamily: "Inter_700Bold", color: GOLD },
  acoinPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  acoinPillText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  heroStats: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.12)", paddingTop: 14 },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatDiv: { width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.12)", marginVertical: 2 },
  heroStatVal: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff", marginBottom: 2 },
  heroStatLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)" },

  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },

  earningRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  earningIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  earningLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  earningAmt: { fontSize: 14, fontFamily: "Inter_700Bold" },

  emptyCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 32, alignItems: "center", gap: 10 },
  emptyFull: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 4 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },

  quickRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  quickLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // Features
  featScroll: { gap: 10, paddingBottom: 60 },
  infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 14 },
  infoBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  catHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  catIconWrap: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  catLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  featRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  featEmoji: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  featDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  featPrice: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 3 },
  earningsMini: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  earningsMiniText: { fontSize: 10, fontFamily: "Inter_700Bold" },

  // Market
  marketList: { padding: 14, gap: 10, paddingBottom: 60 },
  marketCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 14, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  marketName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  marketFeature: { fontSize: 12, fontFamily: "Inter_400Regular" },
  marketPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  marketPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },

  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 20,
  },
  dragHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  modalHead: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  modalEmoji: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 3 },
  modalDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  inputLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },
  priceStepper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  stepBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  priceInput: { fontSize: 30, fontFamily: "Inter_700Bold", padding: 0 },
  priceUnit: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },

  enableRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  enableLabel: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 2 },
  enableSub: { fontSize: 12, fontFamily: "Inter_400Regular" },

  modalBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  saveBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
