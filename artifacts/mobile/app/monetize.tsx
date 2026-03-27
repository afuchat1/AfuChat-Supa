import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { MONETIZE_FEATURES, formatAcoin } from "@/lib/monetize";

type CreatorSettings = Record<string, { enabled: boolean; price: number }>;
type EarningsRow = { transaction_type: string; total: number };

const CATEGORY_LABELS: Record<string, string> = {
  messaging: "💬 Messaging",
  profile: "👤 Profile",
  content: "🎬 Content",
  marketplace: "🛒 Marketplace",
  community: "🏘️ Community",
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
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings" | "market">("dashboard");
  const [settings, setSettings] = useState<CreatorSettings>({});
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [totalEarned, setTotalEarned] = useState(0);
  const [earningsByType, setEarningsByType] = useState<Record<string, number>>({});
  const [editingFeature, setEditingFeature] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editEnabled, setEditEnabled] = useState(false);
  const [marketListings, setMarketListings] = useState<any[]>([]);
  const [loadingMarket, setLoadingMarket] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    setLoadingSettings(true);
    const { data } = await supabase
      .from("creator_monetize_settings")
      .select("feature_id, enabled, price")
      .eq("user_id", user.id);

    const map: CreatorSettings = {};
    for (const f of MONETIZE_FEATURES) {
      map[f.id] = { enabled: false, price: 50 };
    }
    for (const row of (data || [])) {
      map[row.feature_id] = { enabled: row.enabled, price: row.price };
    }
    setSettings(map);
    setLoadingSettings(false);
  }, [user]);

  const loadEarnings = useCallback(async () => {
    if (!user) return;

    // Pull monetize ACoin transactions
    const { data: txData } = await supabase
      .from("acoin_transactions")
      .select("transaction_type, amount")
      .eq("user_id", user.id)
      .gt("amount", 0);

    // Pull creator engagement earnings (from posts, views, likes)
    const { data: creatorData } = await supabase
      .from("creator_earnings")
      .select("amount_ugx, views_count, likes_count, engagement_score, earned_date")
      .eq("user_id", user.id)
      .order("earned_date", { ascending: false })
      .limit(30);

    let total = 0;
    const byType: Record<string, number> = {};

    // Count monetize_ ACoin earnings
    for (const tx of (txData || [])) {
      if (tx.transaction_type?.startsWith("monetize_")) {
        total += tx.amount;
        const key = tx.transaction_type.replace("monetize_", "");
        byType[key] = (byType[key] || 0) + tx.amount;
      }
    }

    // Convert creator UGX earnings to an ACoin equivalent (100 UGX ≈ 1 ACoin)
    const creatorAcoin = (creatorData || []).reduce((sum: number, row: any) => sum + Math.floor((row.amount_ugx || 0) / 100), 0);
    const totalViews = (creatorData || []).reduce((sum: number, row: any) => sum + (row.views_count || 0), 0);
    const totalLikes = (creatorData || []).reduce((sum: number, row: any) => sum + (row.likes_count || 0), 0);

    if (creatorAcoin > 0) {
      byType["post_engagement"] = (byType["post_engagement"] || 0) + creatorAcoin;
      total += creatorAcoin;
    }
    if (totalViews > 0) byType["views"] = totalViews;
    if (totalLikes > 0) byType["likes"] = totalLikes;

    setTotalEarned(total);
    setEarningsByType(byType);
  }, [user]);

  const loadMarket = useCallback(async () => {
    setLoadingMarket(true);
    const { data } = await supabase
      .from("creator_monetize_settings")
      .select("feature_id, price, user_id, profiles!creator_monetize_settings_user_id_fkey(display_name, handle, avatar_url)")
      .eq("enabled", true)
      .neq("user_id", user?.id || "")
      .order("price", { ascending: false })
      .limit(40);
    setMarketListings(data || []);
    setLoadingMarket(false);
  }, [user]);

  useEffect(() => {
    loadSettings();
    loadEarnings();
  }, [loadSettings, loadEarnings]);

  useEffect(() => {
    if (activeTab === "market") loadMarket();
  }, [activeTab, loadMarket]);

  async function saveSetting(featureId: string, enabled: boolean, price: number) {
    if (!user) return;
    setSavingId(featureId);
    await supabase.from("creator_monetize_settings").upsert(
      { user_id: user.id, feature_id: featureId, enabled, price },
      { onConflict: "user_id,feature_id" }
    );
    setSettings((prev) => ({ ...prev, [featureId]: { enabled, price } }));
    setSavingId(null);
    setEditingFeature(null);
  }

  function openEdit(featureId: string) {
    const current = settings[featureId] || { enabled: false, price: 50 };
    setEditingFeature(featureId);
    setEditPrice(String(current.price));
    setEditEnabled(current.enabled);
  }

  const categories = Array.from(new Set(MONETIZE_FEATURES.map((f) => f.category)));

  const totalThisMonth = Object.values(earningsByType).reduce((a, b) => a + b, 0);

  function renderDashboard() {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Total earned */}
        <LinearGradient colors={[Colors.brand + "33", Colors.gold + "11"]} style={[styles.earningsCard, { borderColor: Colors.brand + "44" }]}>
          <Text style={styles.earningsLabel}>Total ACoin Earned</Text>
          <Text style={[styles.earningsValue, { color: Colors.gold }]}>{formatAcoin(totalEarned)} 🪙</Text>
          <Text style={[styles.earningsSub, { color: colors.textMuted }]}>Across all monetization features</Text>
        </LinearGradient>

        {/* Active features count */}
        <View style={styles.statsRow}>
          {[
            { label: "Features On", value: Object.values(settings).filter((s) => s.enabled).length },
            { label: "Balance", value: formatAcoin(profile?.acoin || 0) + " 🪙" },
            { label: "Features", value: MONETIZE_FEATURES.length },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Earnings by feature */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Earnings by Feature</Text>
        {MONETIZE_FEATURES.filter((f) => earningsByType[f.id] > 0).map((f) => (
          <View key={f.id} style={[styles.earningRow, { backgroundColor: colors.surface }]}>
            <Text style={styles.rowEmoji}>{f.emoji}</Text>
            <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>{f.title}</Text>
            <Text style={[styles.rowAmount, { color: Colors.gold }]}>+{earningsByType[f.id]} 🪙</Text>
          </View>
        ))}
        {/* Creator earnings from post engagement */}
        {earningsByType["post_engagement"] > 0 && (
          <View style={[styles.earningRow, { backgroundColor: colors.surface }]}>
            <Text style={styles.rowEmoji}>📊</Text>
            <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>Post Engagement</Text>
            <Text style={[styles.rowAmount, { color: Colors.gold }]}>+{earningsByType["post_engagement"]} 🪙</Text>
          </View>
        )}
        {earningsByType["views"] > 0 && (
          <View style={[styles.earningRow, { backgroundColor: colors.surface }]}>
            <Text style={styles.rowEmoji}>👁️</Text>
            <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>Total Post Views</Text>
            <Text style={[styles.rowAmount, { color: colors.textMuted }]}>{earningsByType["views"].toLocaleString()}</Text>
          </View>
        )}
        {earningsByType["likes"] > 0 && (
          <View style={[styles.earningRow, { backgroundColor: colors.surface }]}>
            <Text style={styles.rowEmoji}>❤️</Text>
            <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>Total Post Likes</Text>
            <Text style={[styles.rowAmount, { color: colors.textMuted }]}>{earningsByType["likes"].toLocaleString()}</Text>
          </View>
        )}
        {Object.values(earningsByType).length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>💸</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No earnings yet</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>Enable features in Settings to start earning</Text>
            <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: Colors.brand }]} onPress={() => setActiveTab("settings")}>
              <Text style={styles.emptyBtnText}>Set Up Monetization</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick links to marketplaces */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Marketplace Screens</Text>
        {[
          { label: "Paid Communities", emoji: "🏰", route: "/paid-communities" },
          { label: "Digital Events", emoji: "🎫", route: "/digital-events" },
          { label: "Freelance Market", emoji: "💼", route: "/freelance" },
          { label: "Username Market", emoji: "🏷️", route: "/username-market" },
        ].map((item) => (
          <TouchableOpacity key={item.route} style={[styles.marketLink, { backgroundColor: colors.surface }]} onPress={() => router.push(item.route as any)}>
            <Text style={{ fontSize: 24 }}>{item.emoji}</Text>
            <Text style={[styles.marketLinkText, { color: colors.text }]}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  function renderSettings() {
    if (loadingSettings) return <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />;
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={[styles.settingsBanner, { color: colors.textSecondary }]}>
          Enable features and set your prices. All payments are in ACoin.
        </Text>
        {categories.map((cat) => (
          <View key={cat}>
            <Text style={[styles.catLabel, { color: colors.textMuted }]}>{CATEGORY_LABELS[cat]}</Text>
            {MONETIZE_FEATURES.filter((f) => f.category === cat).map((feature) => {
              const s = settings[feature.id] || { enabled: false, price: 50 };
              const isMarket = !!FEATURE_ROUTES[feature.id];
              return (
                <TouchableOpacity
                  key={feature.id}
                  style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: s.enabled ? feature.color + "44" : colors.border }]}
                  onPress={() => isMarket ? router.push(FEATURE_ROUTES[feature.id] as any) : openEdit(feature.id)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.featureIconWrap, { backgroundColor: feature.color + "20" }]}>
                    <Text style={styles.featureEmoji}>{feature.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                    <Text style={[styles.featureDesc, { color: colors.textMuted }]}>{feature.description}</Text>
                    {s.enabled && !isMarket && (
                      <View style={[styles.priceBadge, { backgroundColor: Colors.gold + "20" }]}>
                        <Text style={[styles.priceText, { color: Colors.gold }]}>{s.price} ACoin</Text>
                      </View>
                    )}
                  </View>
                  {savingId === feature.id ? (
                    <ActivityIndicator color={Colors.brand} size="small" />
                  ) : isMarket ? (
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  ) : (
                    <Switch
                      value={s.enabled}
                      onValueChange={(val) => saveSetting(feature.id, val, s.price)}
                      trackColor={{ false: colors.backgroundTertiary, true: feature.color + "88" }}
                      thumbColor={s.enabled ? feature.color : colors.textMuted}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    );
  }

  function renderMarket() {
    if (loadingMarket) return <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />;
    return (
      <FlatList
        data={marketListings}
        keyExtractor={(item, i) => `${item.user_id}-${item.feature_id}-${i}`}
        contentContainerStyle={{ paddingBottom: 40, gap: 8 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🛒</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Market is empty</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>Be the first creator to set up monetization</Text>
          </View>
        }
        renderItem={({ item }) => {
          const feature = MONETIZE_FEATURES.find((f) => f.id === item.feature_id);
          if (!feature) return null;
          return (
            <TouchableOpacity
              style={[styles.marketCard, { backgroundColor: colors.surface, borderColor: feature.color + "33" }]}
              onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.user_id } })}
            >
              <View style={[styles.featureIconWrap, { backgroundColor: feature.color + "20" }]}>
                <Text style={styles.featureEmoji}>{feature.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                <Text style={[styles.marketHandle, { color: colors.textMuted }]}>
                  by @{item.profiles?.handle || "creator"}
                </Text>
              </View>
              <View style={[styles.pricePill, { backgroundColor: feature.color + "22" }]}>
                <Text style={[styles.priceText, { color: feature.color }]}>{item.price} 🪙</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Monetize</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>15 ways to earn with AfuChat</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["dashboard", "settings", "market"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: Colors.brand, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? Colors.brand : colors.textMuted }]}>
              {tab === "dashboard" ? "📊 Dashboard" : tab === "settings" ? "⚙️ Settings" : "🛒 Market"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 12 }}>
        {activeTab === "dashboard" && renderDashboard()}
        {activeTab === "settings" && renderSettings()}
        {activeTab === "market" && renderMarket()}
      </View>

      {/* Edit feature modal */}
      <Modal visible={!!editingFeature} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            {editingFeature && (() => {
              const feature = MONETIZE_FEATURES.find((f) => f.id === editingFeature)!;
              return (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalEmoji}>{feature.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalTitle, { color: colors.text }]}>{feature.title}</Text>
                      <Text style={[styles.modalDesc, { color: colors.textMuted }]}>{feature.description}</Text>
                    </View>
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Price (ACoin)</Text>
                  <View style={[styles.priceInput, { backgroundColor: colors.backgroundTertiary }]}>
                    <Ionicons name="wallet-outline" size={18} color={colors.textMuted} />
                    <TextInput
                      style={[styles.priceInputText, { color: colors.text }]}
                      value={editPrice}
                      onChangeText={setEditPrice}
                      keyboardType="number-pad"
                      placeholder="Enter price in ACoin"
                      placeholderTextColor={colors.textMuted}
                    />
                    <Text style={[styles.priceUnit, { color: colors.textMuted }]}>ACoin</Text>
                  </View>

                  <View style={styles.enableRow}>
                    <Text style={[styles.enableLabel, { color: colors.text }]}>Enable this feature</Text>
                    <Switch
                      value={editEnabled}
                      onValueChange={setEditEnabled}
                      trackColor={{ false: colors.backgroundTertiary, true: feature.color + "88" }}
                      thumbColor={editEnabled ? feature.color : colors.textMuted}
                    />
                  </View>

                  <View style={styles.modalBtns}>
                    <TouchableOpacity style={[styles.modalCancel, { borderColor: colors.border }]} onPress={() => setEditingFeature(null)}>
                      <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalSave, { backgroundColor: Colors.brand }]}
                      onPress={() => saveSetting(editingFeature, editEnabled, parseInt(editPrice) || 50)}
                    >
                      <Text style={styles.modalSaveText}>Save Settings</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  earningsCard: { borderRadius: 20, padding: 22, borderWidth: 1.5, alignItems: "center", marginBottom: 14 },
  earningsLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#8E9BAD", marginBottom: 6 },
  earningsValue: { fontSize: 38, fontFamily: "Inter_700Bold", marginBottom: 4 },
  earningsSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center" },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 2 },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10, marginTop: 8 },
  earningRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 14, marginBottom: 6, gap: 10 },
  rowEmoji: { fontSize: 22 },
  rowTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  rowAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  marketLink: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 16, gap: 14, marginBottom: 8 },
  marketLinkText: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  settingsBanner: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 16, lineHeight: 20 },
  catLabel: { fontSize: 13, fontFamily: "Inter_700Bold", marginTop: 16, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  featureCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, gap: 12, marginBottom: 8, borderWidth: 1 },
  featureIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featureEmoji: { fontSize: 24 },
  featureTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  featureDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  priceBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 5 },
  pricePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  priceText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  marketCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, gap: 12, borderWidth: 1 },
  marketHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  modalEmoji: { fontSize: 40 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 3 },
  modalDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  inputLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 8 },
  priceInput: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, height: 52, gap: 10, marginBottom: 16 },
  priceInputText: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold" },
  priceUnit: { fontSize: 13, fontFamily: "Inter_500Medium" },
  enableRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  enableLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  modalBtns: { flexDirection: "row", gap: 12 },
  modalCancel: { flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  modalCancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalSave: { flex: 2, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modalSaveText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
