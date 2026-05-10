import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { supabase } from "@/lib/supabase";
import { ShopOrder, ORDER_STATUS_LABELS, ESCROW_STATUS_LABELS, getBuyerOrders, formatShopAcoin } from "@/lib/shop";
const BRAND = "#00BCD4";
const GOLD = "#D4A853";

type OrderFilter = "all" | "active" | "delivered" | "disputed" | "refunded";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function OrderCard({ order, onPress }: { order: ShopOrder; onPress: () => void }) {
  const { colors } = useTheme();
  const statusMeta = ORDER_STATUS_LABELS[order.status] || ORDER_STATUS_LABELS.pending;
  const escrowMeta = ESCROW_STATUS_LABELS[order.escrow_status] || ESCROW_STATUS_LABELS.held;
  const shopLogo = order.shop?.logo_url;
  const shopName = order.shop?.name || "Unknown Shop";
  const firstItem = order.items?.[0];
  const img = firstItem?.product?.images?.[0] || firstItem?.snapshot_image;
  const extraItems = (order.items?.length || 0) - 1;

  return (
    <TouchableOpacity
      style={[st.orderCard, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={st.orderCardTop}>
        <View style={st.shopRow}>
          {shopLogo
            ? <Image source={{ uri: shopLogo }} style={st.shopLogo} />
            : (
              <LinearGradient colors={[BRAND, "#0097A7"]} style={[st.shopLogo, { alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="storefront" size={12} color="#fff" />
              </LinearGradient>
            )}
          <Text style={[st.shopName, { color: colors.text }]} numberOfLines={1}>{shopName}</Text>
          <View style={[st.statusPill, { backgroundColor: statusMeta.color + "18" }]}>
            <Ionicons name={statusMeta.icon as any} size={11} color={statusMeta.color} />
            <Text style={[st.statusPillText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
          </View>
        </View>
        <Text style={[st.orderTime, { color: colors.textMuted }]}>{timeAgo(order.created_at)}</Text>
      </View>

      <View style={st.orderItemsRow}>
        {img
          ? <Image source={{ uri: img }} style={st.itemThumb} resizeMode="cover" />
          : (
            <View style={[st.itemThumb, { backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
            </View>
          )}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[st.itemName, { color: colors.text }]} numberOfLines={1}>
            {firstItem?.snapshot_name || firstItem?.product?.name || "Item"}
          </Text>
          {extraItems > 0 && (
            <Text style={[st.extraItems, { color: colors.textMuted }]}>+{extraItems} more item{extraItems > 1 ? "s" : ""}</Text>
          )}
          <Text style={[st.orderTotal, { color: BRAND }]}>{formatShopAcoin(order.total_acoin)}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={[st.escrowBadge, { backgroundColor: escrowMeta.color + "15", borderColor: escrowMeta.color + "30" }]}>
            <Ionicons name={escrowMeta.icon as any} size={10} color={escrowMeta.color} />
            <Text style={[st.escrowBadgeText, { color: escrowMeta.color }]}>{escrowMeta.label}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </View>

      {order.escrow_status === "held" && (order.status === "shipped" || order.status === "delivered") && (
        <View style={[st.actionBanner, { backgroundColor: "#FF9500" + "12", borderColor: "#FF9500" + "30" }]}>
          <Ionicons name="lock-closed-outline" size={14} color="#FF9500" />
          <Text style={{ color: "#FF9500", fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 }}>
            Item shipped — open to confirm receipt and release payment
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#FF9500" />
        </View>
      )}

      {order.escrow_status === "disputed" && (
        <View style={[st.actionBanner, { backgroundColor: "#FF3B30" + "12", borderColor: "#FF3B30" + "30" }]}>
          <Ionicons name="alert-circle-outline" size={14} color="#FF3B30" />
          <Text style={{ color: "#FF3B30", fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 }}>
            Dispute open — our team is reviewing this order
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function MyOrdersScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<OrderFilter>("all");

  const load = useCallback(async () => {
    if (!user) return;
    const data = await getBuyerOrders(user.id);
    setOrders(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Real-time: re-fetch when any of this buyer's orders are updated
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`buyer-orders:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shop_orders", filter: `buyer_id=eq.${user.id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shop_orders", filter: `buyer_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const FILTERS: { id: OrderFilter; label: string }[] = [
    { id: "all",       label: "All" },
    { id: "active",    label: "Active" },
    { id: "delivered", label: "Delivered" },
    { id: "disputed",  label: "Disputed" },
    { id: "refunded",  label: "Refunded" },
  ];

  const filtered = orders.filter(o => {
    if (filter === "all") return true;
    if (filter === "active") return !["delivered", "cancelled", "refunded"].includes(o.status);
    if (filter === "delivered") return o.status === "delivered" && o.escrow_status === "released";
    if (filter === "disputed") return o.escrow_status === "disputed";
    if (filter === "refunded") return o.escrow_status === "refunded";
    return true;
  });

  const activeCount = orders.filter(o => !["delivered", "cancelled", "refunded"].includes(o.status)).length;
  const totalSpent = orders.filter(o => o.escrow_status === "released").reduce((s, o) => s + o.total_acoin, 0);

  if (loading) {
    return (
      <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
        <GlassHeader title="My Orders" />
        <ActivityIndicator color={BRAND} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader
        title="My Orders"
        right={
          <TouchableOpacity onPress={() => router.push("/store" as any)} hitSlop={8}>
            <Ionicons name="storefront-outline" size={20} color={BRAND} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* Stats row */}
        <View style={st.statsRow}>
          <View style={[st.statCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="cube-outline" size={20} color={BRAND} />
            <Text style={[st.statVal, { color: colors.text }]}>{orders.length}</Text>
            <Text style={[st.statLabel, { color: colors.textMuted }]}>Total Orders</Text>
          </View>
          <View style={[st.statCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="time-outline" size={20} color="#FF9500" />
            <Text style={[st.statVal, { color: colors.text }]}>{activeCount}</Text>
            <Text style={[st.statLabel, { color: colors.textMuted }]}>Active</Text>
          </View>
          <View style={[st.statCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="wallet-outline" size={20} color={GOLD} />
            <Text style={[st.statVal, { color: colors.text }]}>{formatShopAcoin(totalSpent)}</Text>
            <Text style={[st.statLabel, { color: colors.textMuted }]}>Spent</Text>
          </View>
        </View>

        {/* Escrow info card */}
        <View style={[st.escrowInfo, { backgroundColor: BRAND + "10", borderColor: BRAND + "25" }]}>
          <Ionicons name="shield-checkmark-outline" size={22} color={BRAND} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: BRAND, fontFamily: "Inter_700Bold", fontSize: 13 }}>AfuPay Escrow Protection</Text>
            <Text style={{ color: BRAND, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 }}>
              Your payment is held securely until you confirm you received the item. Only then is money released to the seller.
            </Text>
          </View>
        </View>

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filtersRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[st.filterTab, filter === f.id && { backgroundColor: BRAND }]}
              onPress={() => { setFilter(f.id); Haptics.selectionAsync(); }}
              activeOpacity={0.8}
            >
              <Text style={[st.filterTabText, { color: filter === f.id ? "#fff" : colors.textSecondary }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Orders list */}
        {filtered.length === 0 ? (
          <View style={st.emptyWrap}>
            <LinearGradient colors={[BRAND + "20", BRAND + "06"]} style={st.emptyIcon}>
              <Ionicons name="cube-outline" size={36} color={BRAND} />
            </LinearGradient>
            <Text style={[st.emptyTitle, { color: colors.text }]}>
              {filter === "all" ? "No orders yet" : `No ${filter} orders`}
            </Text>
            <Text style={[st.emptySub, { color: colors.textSecondary }]}>
              {filter === "all" ? "Browse the marketplace and make your first purchase" : "Nothing here yet"}
            </Text>
            {filter === "all" && (
              <TouchableOpacity style={[st.shopNowBtn, { backgroundColor: BRAND }]} onPress={() => router.push("/store" as any)}>
                <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Browse Marketplace</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ paddingTop: 8 }}>
            {filtered.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                onPress={() => { Haptics.selectionAsync(); router.push(`/shop/order/${order.id}` as any); }}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  shopBtn: { marginLeft: "auto", padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", flex: 1 },
  statsRow: { flexDirection: "row", gap: 10, padding: 16 },
  statCard: {
    flex: 1, alignItems: "center", gap: 6, paddingVertical: 16,
    borderRadius: 18, shadowColor: "#000", shadowOpacity: 0.05,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  statVal: { fontSize: 17, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  escrowInfo: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    marginHorizontal: 16, marginBottom: 4, padding: 14,
    borderRadius: 16, borderWidth: 1,
  },
  filtersRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterTab: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, backgroundColor: "rgba(128,128,128,0.1)",
  },
  filterTabText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  orderCard: {
    marginHorizontal: 16, marginBottom: 12, borderRadius: 18,
    padding: 16, gap: 12,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  orderCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shopRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  shopLogo: { width: 24, height: 24, borderRadius: 7 },
  shopName: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  statusPillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  orderTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  orderItemsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  itemThumb: { width: 56, height: 56, borderRadius: 14 },
  itemName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  extraItems: { fontSize: 11, fontFamily: "Inter_400Regular" },
  orderTotal: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 2 },
  escrowBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1,
  },
  escrowBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  actionBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderRadius: 12, borderWidth: 1,
  },
  emptyWrap: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32, gap: 10 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  shopNowBtn: { marginTop: 16, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 16 },
});
