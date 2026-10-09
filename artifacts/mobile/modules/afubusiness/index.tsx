import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image as RNImage,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { safeRouter } from "@/lib/navUtils";
import { supabase } from "@/lib/supabase";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { GlassCard } from "@/components/ui/GlassCard";
import { ContactRowSkeleton, ListRowSkeleton, MarketplaceCardSkeleton } from "@/components/ui/Skeleton";
import { showAlert } from "@/lib/alert";
import {
  getAfuChatFollowRecords,
  getAfuChatFollowSummary,
  getAfuChatProfilePosts,
} from "@/lib/afuchatApi";

type Screen =
  | "home"
  | "analytics"
  | "products"
  | "add-product"
  | "edit-product"
  | "orders"
  | "order-detail"
  | "audience"
  | "edit-profile"
  | "shop-setup";

type Shop = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  category: string | null;
  rating: number;
  total_sales: number;
  is_active: boolean;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price_acoin: number;
  images: string[];
  category: string;
  stock: number;
  is_unlimited_stock: boolean;
  is_available: boolean;
  sales_count: number;
};

type ShopOrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price_acoin: number;
  snapshot_name: string | null;
  snapshot_image: string | null;
};

type ShopOrder = {
  id: string;
  status: string;
  total_acoin: number;
  created_at: string;
  escrow_status: string | null;
  buyer_profile: { display_name: string | null; handle: string | null; avatar_url: string | null } | null;
  items: ShopOrderItem[];
};

type Follower = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  is_verified: boolean;
};

type Analytics = {
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  activeProducts: number;
  totalProducts: number;
};

const CATEGORIES = [
  "Electronics", "Fashion", "Food & Drink", "Beauty",
  "Home & Garden", "Sports", "Books", "Art & Crafts",
  "Services", "Digital Goods", "Other",
];

const ESCROW_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  pending:          { bg: "#FF950018", fg: "#FF9500", label: "Pending" },
  paid:             { bg: "#1018D818", fg: "#1018D8", label: "Paid" },
  processing:       { bg: "#AF52DE18", fg: "#AF52DE", label: "Processing" },
  shipped:          { bg: "#5856D618", fg: "#5856D6", label: "Shipped" },
  delivered:        { bg: "#34C75918", fg: "#34C759", label: "Delivered" },
  refunded:         { bg: "#FF950018", fg: "#FF9500", label: "Refunded" },
  cancelled:        { bg: "#8E8E9318", fg: "#8E8E93", label: "Cancelled" },
};

function statusInfo(status: string) {
  return ESCROW_COLORS[status] ?? { bg: "#8E8E9318", fg: "#8E8E93", label: status };
}

const TOOLS = [
  { icon: "bar-chart" as const,   label: "Analytics", color: "#007AFF", screen: "analytics" as Screen },
  { icon: "pricetag"  as const,   label: "Products",  color: "#FF3B30", screen: "products"  as Screen },
  { icon: "receipt"   as const,   label: "Orders",    color: "#1018D8", screen: "orders"    as Screen },
  { icon: "people"    as const,   label: "Audience",  color: "#34C759", screen: "audience"  as Screen },
];

export default function AfuBusinessApp({ initialScreen }: { initialScreen?: Screen }) {
  const { colors, accent } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>("home");
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  const [followerCount, setFollowerCount] = useState(0);
  const [postCount, setPostCount] = useState(0);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState((profile as any)?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [followers, setFollowers] = useState<Follower[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ShopOrder | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [shopName, setShopName] = useState("");
  const [shopDesc, setShopDesc] = useState("");
  const [shopCat, setShopCat] = useState(CATEGORIES[0]);
  const [shopSaving, setShopSaving] = useState(false);

  const [prodName, setProdName] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [prodPrice, setProdPrice] = useState("");
  const [prodCat, setProdCat] = useState(CATEGORIES[0]);
  const [prodStock, setProdStock] = useState("1");
  const [prodUnlimited, setProdUnlimited] = useState(false);
  const [prodAvailable, setProdAvailable] = useState(true);
  const [prodSaving, setProdSaving] = useState(false);

  useEffect(() => {
    if (initialScreen) setScreen(initialScreen);
  }, [initialScreen]);

  useEffect(() => {
    if (!user) return;
    getAfuChatFollowSummary(user.id).then(({ data, error }) => {
      if (error || !data) {
        showAlert("Audience unavailable", "Could not load your follower count.");
        return;
      }
      setFollowerCount(data.followers_count);
    });
    getAfuChatProfilePosts(user.id, 1).then(({ totalCount, error }) => {
      if (error || totalCount === null) {
        showAlert("Posts unavailable", error?.message ?? "Could not load your post count.");
        return;
      }
      setPostCount(totalCount);
    });
    supabase
      .from("shops")
      .select("id, name, description, logo_url, category, rating, total_sales, is_active")
      .eq("seller_id", user.id)
      .maybeSingle()
      .then(({ data }) => setShop(data as Shop | null ?? null));
  }, [user]);

  const loadProducts = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true); else setListLoading(true);
    const q = shop?.id
      ? supabase.from("shop_products").select("id,name,description,price_acoin,images,category,stock,is_unlimited_stock,is_available,sales_count").eq("shop_id", shop.id).order("created_at", { ascending: false }).limit(50)
      : supabase.from("shop_products").select("id,name,description,price_acoin,images,category,stock,is_unlimited_stock,is_available,sales_count").eq("seller_id", user.id).order("created_at", { ascending: false }).limit(50);
    const { data } = await q;
    setProducts((data as Product[]) ?? []);
    if (isRefresh) setRefreshing(false); else setListLoading(false);
  }, [user, shop]);

  const loadOrders = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true); else setListLoading(true);
    setOrdersError(null);
    try {
      const { data, error } = await supabase
        .from("shop_orders")
        .select("*,buyer_profile:profiles!shop_orders_buyer_id_fkey(display_name,handle,avatar_url)")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      const orderRows = (data ?? []) as unknown as Omit<ShopOrder, "items">[];
      const orderIds = orderRows.map((order) => order.id);
      let itemRows: ShopOrderItem[] = [];
      if (orderIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
          .from("shop_order_items")
          .select("id,order_id,product_id,quantity,unit_price_acoin,snapshot_name,snapshot_image")
          .in("order_id", orderIds);
        if (itemsError) throw itemsError;
        itemRows = (items ?? []) as ShopOrderItem[];
      }

      const itemsByOrder = new Map<string, ShopOrderItem[]>();
      for (const item of itemRows) {
        const items = itemsByOrder.get(item.order_id) ?? [];
        items.push(item);
        itemsByOrder.set(item.order_id, items);
      }
      setOrders(orderRows.map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] })));
    } catch (error) {
      setOrders([]);
      const message = error instanceof Error ? error.message : "Could not load shop orders.";
      setOrdersError(message);
      showAlert("Orders unavailable", message);
    } finally {
      if (isRefresh) setRefreshing(false); else setListLoading(false);
    }
  }, [user]);

  const loadAudience = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true); else setListLoading(true);
    try {
      const result = await getAfuChatFollowRecords(user.id, "followers", 50, 0);
      if (result.error || !result.items) throw result.error ?? new Error("Audience could not be loaded.");
      setFollowers(result.items.map(({ profile }) => ({
        id: profile.id,
        display_name: profile.display_name ?? null,
        handle: profile.handle ?? null,
        avatar_url: profile.avatar_url ?? null,
        is_verified: profile.is_verified === true,
      })));
    } catch {
      showAlert("Audience unavailable", "Could not load your followers. Please try again.");
    } finally {
      if (isRefresh) setRefreshing(false); else setListLoading(false);
    }
  }, [user]);

  const loadAnalytics = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    try {
      const [totalOrders, delivered, pending, totalProducts, activeProducts, revenue] = await Promise.all([
        supabase.from("shop_orders").select("id", { count: "exact", head: true }).eq("seller_id", user.id),
        supabase.from("shop_orders").select("id", { count: "exact", head: true }).eq("seller_id", user.id).eq("status", "delivered"),
        supabase.from("shop_orders").select("id", { count: "exact", head: true }).eq("seller_id", user.id).in("status", ["pending", "paid", "processing", "shipped"]),
        supabase.from("shop_products").select("id", { count: "exact", head: true }).eq("seller_id", user.id),
        supabase.from("shop_products").select("id", { count: "exact", head: true }).eq("seller_id", user.id).eq("is_available", true),
        supabase.from("shop_orders").select("total_acoin").eq("seller_id", user.id).eq("status", "delivered"),
      ]);
      const failed = [totalOrders, delivered, pending, totalProducts, activeProducts, revenue].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const totalRevenue = (revenue.data ?? []).reduce((sum, row) => sum + (row.total_acoin ?? 0), 0);
      setAnalytics({
        totalRevenue,
        totalOrders: totalOrders.count ?? 0,
        completedOrders: delivered.count ?? 0,
        pendingOrders: pending.count ?? 0,
        activeProducts: activeProducts.count ?? 0,
        totalProducts: totalProducts.count ?? 0,
      });
    } catch (error) {
      setAnalytics(null);
      showAlert("Analytics unavailable", error instanceof Error ? error.message : "Could not load shop analytics.");
    } finally {
      setListLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (screen === "products") loadProducts();
    else if (screen === "orders") loadOrders();
    else if (screen === "audience") loadAudience();
    else if (screen === "analytics") loadAnalytics();
  }, [screen]);

  function fmtNum(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  function fmtAcoin(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M AC`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K AC`;
    return `${n} AC`;
  }

  const saveProfile = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setSaveMsg("");
    const { error } = await supabase.from("profiles").update({ display_name: displayName.trim(), bio: bio.trim() }).eq("id", user.id);
    setSaving(false);
    setSaveMsg(error ? "Failed to save." : "Saved!");
    setTimeout(() => setSaveMsg(""), 2500);
  }, [user, displayName, bio]);

  async function createShop() {
    if (!user) return;
    if (!shopName.trim()) { showAlert("Required", "Please enter your shop name."); return; }
    setShopSaving(true);
    const { data, error } = await supabase.from("shops").insert({
      seller_id: user.id,
      name: shopName.trim(),
      description: shopDesc.trim() || null,
      category: shopCat,
      is_active: true,
      rating: 0,
      total_sales: 0,
    }).select().single();
    setShopSaving(false);
    if (error) { showAlert("Error", error.message); return; }
    setShop(data as Shop);
    setScreen("home");
    showAlert("Shop Created!", `${shopName.trim()} is now live on AfuMarket.`);
  }

  function openAddProduct() {
    if (!shop) { showAlert("No Shop", "Set up your shop first."); return; }
    setProdName(""); setProdDesc(""); setProdPrice(""); setProdCat(CATEGORIES[0]);
    setProdStock("1"); setProdUnlimited(false); setProdAvailable(true);
    setSelectedProduct(null);
    setScreen("add-product");
  }

  function openEditProduct(p: Product) {
    setProdName(p.name); setProdDesc(p.description ?? "");
    setProdPrice(String(p.price_acoin)); setProdCat(p.category);
    setProdStock(String(p.stock)); setProdUnlimited(p.is_unlimited_stock);
    setProdAvailable(p.is_available);
    setSelectedProduct(p);
    setScreen("edit-product");
  }

  async function saveProduct() {
    if (!user || !shop) return;
    if (!prodName.trim()) { showAlert("Required", "Enter a product name."); return; }
    const price = parseInt(prodPrice, 10);
    if (isNaN(price) || price < 1) { showAlert("Invalid Price", "Enter a valid price in ACoins."); return; }
    setProdSaving(true);
    const payload = {
      name: prodName.trim(),
      description: prodDesc.trim() || null,
      price_acoin: price,
      category: prodCat,
      stock: prodUnlimited ? 0 : Math.max(0, parseInt(prodStock, 10) || 0),
      is_unlimited_stock: prodUnlimited,
      is_available: prodAvailable,
      shop_id: shop.id,
      seller_id: user.id,
    };
    if (selectedProduct) {
      const { error } = await supabase.from("shop_products").update(payload).eq("id", selectedProduct.id);
      setProdSaving(false);
      if (error) { showAlert("Error", error.message); return; }
      setProducts((prev) => prev.map((p) => p.id === selectedProduct.id ? { ...p, ...payload } : p));
    } else {
      const { data, error } = await supabase.from("shop_products").insert({ ...payload, images: [], sales_count: 0 }).select().single();
      setProdSaving(false);
      if (error) { showAlert("Error", error.message); return; }
      setProducts((prev) => [data as Product, ...prev]);
    }
    setScreen("products");
    showAlert("Saved!", selectedProduct ? "Product updated." : "Product listed on AfuMarket.");
  }

  async function deleteProduct(p: Product) {
    showAlert("Delete Product", `Remove "${p.name}" from your shop?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("shop_products").delete().eq("id", p.id);
          setProducts((prev) => prev.filter((x) => x.id !== p.id));
        },
      },
    ]);
  }

  async function updateOrderStatus(orderId: string, newStatus: string) {
    const { error } = await supabase.from("shop_orders").update({ status: newStatus }).eq("id", orderId);
    if (error) { showAlert("Error", error.message); return; }
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
    if (selectedOrder?.id === orderId) setSelectedOrder((o) => o ? { ...o, status: newStatus } : null);
    showAlert("Updated", `Order status changed to ${statusInfo(newStatus).label}.`);
  }

  function renderHeader(title: string, rightAction?: { label: string; onPress: () => void }) {
    return (
      <View style={[st.subHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => setScreen("home")} hitSlop={12} style={st.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[st.subTitle, { color: colors.text }]}>{title}</Text>
        {rightAction ? (
          <Pressable onPress={rightAction.onPress} style={[st.headerAction, { backgroundColor: accent + "22" }]}>
            <Text style={[st.headerActionText, { color: accent }]}>{rightAction.label}</Text>
          </Pressable>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>
    );
  }

  if (screen === "edit-profile") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHeader("Edit Profile")}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          <View style={st.field}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Display Name</Text>
            <TextInput style={[st.fieldInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} value={displayName} onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor={colors.textMuted} />
          </View>
          <View style={st.field}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Bio</Text>
            <TextInput style={[st.fieldInput, st.bioInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} value={bio} onChangeText={setBio} placeholder="Tell people about your business…" placeholderTextColor={colors.textMuted} multiline numberOfLines={4} />
          </View>
          <Pressable onPress={saveProfile} style={[st.actionBtn, { backgroundColor: accent, opacity: saving ? 0.7 : 1 }]} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.actionBtnText}>Save Changes</Text>}
          </Pressable>
          {saveMsg ? <Text style={[st.saveMsg, { color: saveMsg === "Saved!" ? "#34C759" : "#FF3B30" }]}>{saveMsg}</Text> : null}
        </ScrollView>
      </View>
    );
  }

  if (screen === "shop-setup") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHeader("Create Your Shop")}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
          <View style={[st.infoCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="storefront" size={32} color={accent} />
            <Text style={[st.infoTitle, { color: colors.text }]}>Launch on AfuMarket</Text>
            <Text style={[st.infoText, { color: colors.textMuted }]}>Create your store to start selling to thousands of AfuChat users.</Text>
          </View>
          <View style={st.field}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Shop Name *</Text>
            <TextInput style={[st.fieldInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} value={shopName} onChangeText={setShopName} placeholder="e.g. TechHub Store" placeholderTextColor={colors.textMuted} />
          </View>
          <View style={st.field}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setShopCat(c)} style={[st.catChip, shopCat === c ? { backgroundColor: accent } : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                  <Text style={[st.catChipText, { color: shopCat === c ? "#fff" : colors.textSecondary }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={st.field}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Description</Text>
            <TextInput style={[st.fieldInput, st.bioInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} value={shopDesc} onChangeText={setShopDesc} placeholder="Describe what you sell…" placeholderTextColor={colors.textMuted} multiline numberOfLines={3} />
          </View>
          <Pressable onPress={createShop} style={[st.actionBtn, { backgroundColor: accent, opacity: shopSaving ? 0.7 : 1 }]} disabled={shopSaving}>
            {shopSaving ? <ActivityIndicator size="small" color="#fff" /> : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="storefront" size={16} color="#fff" />
                <Text style={st.actionBtnText}>Create Shop</Text>
              </View>
            )}
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (screen === "analytics") {
    const kpis = analytics ? [
      { label: "Total Revenue", value: fmtAcoin(analytics.totalRevenue), icon: "cash" as const, color: "#34C759" },
      { label: "Total Orders", value: fmtNum(analytics.totalOrders), icon: "receipt" as const, color: "#1018D8" },
      { label: "Completed", value: fmtNum(analytics.completedOrders), icon: "checkmark-circle" as const, color: "#34C759" },
      { label: "Pending", value: fmtNum(analytics.pendingOrders), icon: "time" as const, color: "#FF9500" },
      { label: "Active Products", value: fmtNum(analytics.activeProducts), icon: "pricetag" as const, color: "#AF52DE" },
      { label: "Total Listings", value: fmtNum(analytics.totalProducts), icon: "layers" as const, color: "#FF3B30" },
    ] : [];
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHeader("Analytics")}
        {listLoading ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {[1,2,3].map(i => <View key={i} style={[st.kpiCard, { backgroundColor: colors.surface }]}><ActivityIndicator size="small" color={accent} /></View>)}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 20 }}>
            <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>STORE PERFORMANCE</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {kpis.map((k) => (
                <GlassCard key={k.label} variant="medium" style={[st.kpiCard]}>
                  <View style={[st.kpiIcon, { backgroundColor: k.color + "18" }]}>
                    <Ionicons name={k.icon} size={18} color={k.color} />
                  </View>
                  <Text style={[st.kpiValue, { color: colors.text }]}>{k.value}</Text>
                  <Text style={[st.kpiLabel, { color: colors.textMuted }]}>{k.label}</Text>
                </GlassCard>
              ))}
            </View>
            {shop && (
              <View style={[st.shopStatCard, { backgroundColor: colors.surface }]}>
                <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>SHOP OVERVIEW</Text>
                <View style={{ marginTop: 12, gap: 10 }}>
                  <View style={st.shopStatRow}>
                    <Text style={[st.shopStatLabel, { color: colors.textMuted }]}>Shop Name</Text>
                    <Text style={[st.shopStatVal, { color: colors.text }]}>{shop.name}</Text>
                  </View>
                  <View style={st.shopStatRow}>
                    <Text style={[st.shopStatLabel, { color: colors.textMuted }]}>Category</Text>
                    <Text style={[st.shopStatVal, { color: colors.text }]}>{shop.category ?? "N/A"}</Text>
                  </View>
                  <View style={st.shopStatRow}>
                    <Text style={[st.shopStatLabel, { color: colors.textMuted }]}>Rating</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="star" size={13} color="#FBBF24" />
                      <Text style={[st.shopStatVal, { color: colors.text }]}>{shop.rating.toFixed(1)}</Text>
                    </View>
                  </View>
                  <View style={st.shopStatRow}>
                    <Text style={[st.shopStatLabel, { color: colors.textMuted }]}>Total Sales</Text>
                    <Text style={[st.shopStatVal, { color: colors.text }]}>{fmtNum(shop.total_sales)}</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    );
  }

  if (screen === "products") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHeader("My Products", { label: "+ Add", onPress: openAddProduct })}
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadProducts(true)} tintColor={accent} />}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={
            listLoading ? (
              <View>
                {[1,2,3,4].map(i => <ListRowSkeleton key={i} />)}
              </View>
            ) : (
              <View style={st.center}>
                <Ionicons name="pricetag-outline" size={48} color={colors.textMuted} />
                <Text style={[st.emptyText, { color: colors.textMuted }]}>No products listed yet</Text>
                <Pressable onPress={openAddProduct} style={[st.actionBtn, { backgroundColor: accent, marginTop: 8 }]}>
                  <Text style={st.actionBtnText}>Add Your First Product</Text>
                </Pressable>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable style={[st.productRow, { backgroundColor: colors.surface }]} onPress={() => openEditProduct(item)}>
              <View style={[st.productImg, { backgroundColor: colors.backgroundSecondary }]}>
                {item.images?.[0] ? (
                  <Image source={{ uri: item.images[0] }} style={st.productImgFill} resizeMode="cover" />
                ) : (
                  <Ionicons name="cube-outline" size={22} color={colors.textMuted} />
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[st.productName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
                <Text style={[st.productPrice, { color: accent }]}>{fmtAcoin(item.price_acoin)}</Text>
                <Text style={[{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }]}>
                  {item.is_unlimited_stock ? "Unlimited stock" : `${item.stock} in stock`} • {item.sales_count} sold
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 8 }}>
                <View style={[st.statusBadge, { backgroundColor: item.is_available ? "#34C75918" : "#FF3B3018" }]}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: item.is_available ? "#34C759" : "#FF3B30" }}>
                    {item.is_available ? "Active" : "Paused"}
                  </Text>
                </View>
                <Pressable onPress={() => deleteProduct(item)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      </View>
    );
  }

  if (screen === "add-product" || screen === "edit-product") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHeader(selectedProduct ? "Edit Product" : "Add Product")}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={st.field}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Product Name *</Text>
            <TextInput style={[st.fieldInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} value={prodName} onChangeText={setProdName} placeholder="e.g. Wireless Earbuds" placeholderTextColor={colors.textMuted} />
          </View>
          <View style={st.field}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Description</Text>
            <TextInput style={[st.fieldInput, st.bioInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} value={prodDesc} onChangeText={setProdDesc} placeholder="Describe your product…" placeholderTextColor={colors.textMuted} multiline numberOfLines={4} />
          </View>
          <View style={st.field}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Price (ACoins) *</Text>
            <TextInput style={[st.fieldInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} value={prodPrice} onChangeText={setProdPrice} placeholder="e.g. 1500" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
          </View>
          <View style={st.field}>
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setProdCat(c)} style={[st.catChip, prodCat === c ? { backgroundColor: accent } : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                  <Text style={[st.catChipText, { color: prodCat === c ? "#fff" : colors.textSecondary }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={[st.toggleRow, { backgroundColor: colors.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.text }]}>Unlimited Stock</Text>
              <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted }]}>No stock limit for this product</Text>
            </View>
            <Switch value={prodUnlimited} onValueChange={setProdUnlimited} trackColor={{ true: accent }} thumbColor="#fff" />
          </View>
          {!prodUnlimited && (
            <View style={st.field}>
              <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Stock Quantity</Text>
              <TextInput style={[st.fieldInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} value={prodStock} onChangeText={setProdStock} placeholder="e.g. 10" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
            </View>
          )}
          <View style={[st.toggleRow, { backgroundColor: colors.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.text }]}>Available for Purchase</Text>
              <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted }]}>Visible and buyable on AfuMarket</Text>
            </View>
            <Switch value={prodAvailable} onValueChange={setProdAvailable} trackColor={{ true: accent }} thumbColor="#fff" />
          </View>
          <Pressable onPress={saveProduct} style={[st.actionBtn, { backgroundColor: accent, opacity: prodSaving ? 0.7 : 1, marginTop: 8 }]} disabled={prodSaving}>
            {prodSaving ? <ActivityIndicator size="small" color="#fff" /> : (
              <Text style={st.actionBtnText}>{selectedProduct ? "Update Product" : "List on AfuMarket"}</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (screen === "orders") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHeader("Orders")}
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadOrders(true)} tintColor={accent} />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={
            listLoading ? (
              <View>{[1,2,3,4].map(i => <ListRowSkeleton key={i} />)}</View>
            ) : ordersError ? (
              <View style={st.center}>
                <Ionicons name="alert-circle-outline" size={42} color="#FF3B30" />
                <Text style={[st.emptyText, { color: colors.textMuted }]}>Orders could not be loaded</Text>
              </View>
            ) : (
              <View style={st.center}>
                <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
                <Text style={[st.emptyText, { color: colors.textMuted }]}>No orders yet</Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const s = statusInfo(item.status);
            return (
              <Pressable style={[st.orderRow, { backgroundColor: colors.surface }]} onPress={() => { setSelectedOrder(item); setScreen("order-detail"); }}>
                <View style={[st.orderImg, { backgroundColor: colors.backgroundSecondary }]}>
                  {item.items[0]?.snapshot_image ? (
                    <Image source={{ uri: item.items[0].snapshot_image }} style={st.productImgFill} resizeMode="cover" />
                  ) : (
                    <Ionicons name="cube-outline" size={18} color={colors.textMuted} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[st.productName, { color: colors.text }]} numberOfLines={1}>{item.items[0]?.snapshot_name ?? "Order"}</Text>
                  <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted }]}>
                    {item.buyer_profile?.display_name ?? (item.buyer_profile?.handle ? `@${item.buyer_profile.handle}` : "Customer")} • {item.items.reduce((count, line) => count + line.quantity, 0)} item(s)
                  </Text>
                  <Text style={[{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }]}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Text style={[st.productPrice, { color: accent }]}>{fmtAcoin(item.total_acoin ?? 0)}</Text>
                  <View style={[st.statusBadge, { backgroundColor: s.bg }]}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: s.fg }}>{s.label}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    );
  }

  if (screen === "order-detail" && selectedOrder) {
    const s = statusInfo(selectedOrder.status);
    const canProcess = selectedOrder.status === "paid";
    const canShip = selectedOrder.status === "processing";
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <View style={[st.subHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setScreen("orders")} hitSlop={12} style={st.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[st.subTitle, { color: colors.text }]}>Order Detail</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 20 }}>
          <View style={[{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12 }]}>
            <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>ORDER #{selectedOrder.id.slice(0, 8).toUpperCase()}</Text>
            <View style={[st.statusBadge, { backgroundColor: s.bg, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 }]}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: s.fg }}>{s.label}</Text>
            </View>
            {selectedOrder.items.map((item) => (
              <View key={item.id} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <View style={[st.productImg, { backgroundColor: colors.backgroundSecondary }]}>
                  {item.snapshot_image ? (
                    <Image source={{ uri: item.snapshot_image }} style={st.productImgFill} resizeMode="cover" />
                  ) : (
                    <Ionicons name="cube-outline" size={22} color={colors.textMuted} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.productName, { color: colors.text }]}>{item.snapshot_name ?? "Order item"}</Text>
                  <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12 }}>
                    Qty {item.quantity} · {fmtAcoin(item.unit_price_acoin)} each
                  </Text>
                </View>
              </View>
            ))}
            {selectedOrder.items.length === 0 && (
              <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 13 }}>
                No item details are available for this order.
              </Text>
            )}
            {selectedOrder.items.length > 0 && (
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: accent, fontFamily: "Inter_600SemiBold", fontSize: 14 }]}>Order total: {fmtAcoin(selectedOrder.total_acoin ?? 0)}</Text>
                </View>
              </View>
            )}
          </View>
          <View style={[{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 10 }]}>
            <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>CUSTOMER</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[st.personAvatar, { backgroundColor: accent + "22" }]}>
                {selectedOrder.buyer_profile?.avatar_url ? (
                  <Image source={{ uri: selectedOrder.buyer_profile.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                ) : (
                  <Ionicons name="person" size={18} color={accent} />
                )}
              </View>
              <View>
                <Text style={[{ color: colors.text, fontFamily: "Inter_500Medium", fontSize: 14 }]}>
                  {selectedOrder.buyer_profile?.display_name ?? "Customer"}
                </Text>
                <Text style={[{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12 }]}>
                  @{selectedOrder.buyer_profile?.handle ?? "N/A"}
                </Text>
              </View>
            </View>
            <View style={st.shopStatRow}>
              <Text style={[st.shopStatLabel, { color: colors.textMuted }]}>Quantity</Text>
              <Text style={[st.shopStatVal, { color: colors.text }]}>{selectedOrder.items.reduce((count, item) => count + item.quantity, 0)}</Text>
            </View>
            <View style={st.shopStatRow}>
              <Text style={[st.shopStatLabel, { color: colors.textMuted }]}>Date</Text>
              <Text style={[st.shopStatVal, { color: colors.text }]}>{new Date(selectedOrder.created_at).toLocaleString()}</Text>
            </View>
          </View>
          <View style={[{ backgroundColor: "#1018D812", borderRadius: 14, padding: 14, flexDirection: "row", gap: 10 }]}>
            <Ionicons name="shield-checkmark" size={18} color="#1018D8" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={[{ color: "#1018D8", fontFamily: "Inter_600SemiBold", fontSize: 13 }]}>AfuPay Escrow Protection</Text>
              <Text style={[{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 }]}>
                Funds are held securely by AfuPay and released to you upon confirmed delivery.
              </Text>
            </View>
          </View>
          {canProcess && (
            <Pressable onPress={() => updateOrderStatus(selectedOrder.id, "processing")} style={[st.actionBtn, { backgroundColor: "#AF52DE" }]}>
              <Text style={st.actionBtnText}>Mark as Processing</Text>
            </Pressable>
          )}
          {canShip && (
            <Pressable onPress={() => updateOrderStatus(selectedOrder.id, "shipped")} style={[st.actionBtn, { backgroundColor: accent }]}>
              <Text style={st.actionBtnText}>Mark as Shipped</Text>
            </Pressable>
          )}
          {selectedOrder.status === "disputed" && (
            <View style={[{ backgroundColor: "#FF3B3012", borderRadius: 14, padding: 14 }]}>
              <Text style={[{ color: "#FF3B30", fontFamily: "Inter_600SemiBold", fontSize: 13 }]}>Dispute Active</Text>
              <Text style={[{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 }]}>
                Our team will contact you shortly to resolve this dispute. Please ensure your product was shipped as described.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  if (screen === "audience") {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        {renderHeader(`Audience (${followerCount})`)}
        <FlatList
          data={followers}
          keyExtractor={(f) => f.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAudience(true)} tintColor={accent} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={
            listLoading ? (
              <View style={{ padding: 8 }}>{[1,2,3,4,5].map(i => <ContactRowSkeleton key={i} />)}</View>
            ) : (
              <View style={st.center}>
                <Ionicons name="people-outline" size={48} color={colors.textMuted} />
                <Text style={[st.emptyText, { color: colors.textMuted }]}>No followers yet</Text>
              </View>
            )
          }
          ItemSeparatorComponent={() => <View style={[{ height: 0.5, backgroundColor: colors.border, marginLeft: 72 }]} />}
          renderItem={({ item }) => (
            <View style={[st.personRow, { backgroundColor: colors.surface }]}>
              <View style={[st.personAvatar, { backgroundColor: accent + "22" }]}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                ) : (
                  <Ionicons name="person" size={20} color={accent} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={[st.productName, { color: colors.text }]} numberOfLines={1}>
                    {item.display_name ?? `@${item.handle}`}
                  </Text>
                  {item.is_verified ? <Ionicons name="checkmark-circle" size={13} color={accent} /> : null}
                </View>
                <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted }]}>@{item.handle}</Text>
              </View>
            </View>
          )}
        />
      </View>
    );
  }

  const homStats = [
    { label: "Followers", value: fmtNum(followerCount), icon: "people" as const, color: "#007AFF" },
    { label: "Posts",     value: fmtNum(postCount),     icon: "grid"   as const, color: "#34C759" },
  ];

  return (
    <ScrollView
      style={[st.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[st.homeHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => safeRouter.back("/apps")} hitSlop={10} style={st.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[st.homeTitle, { color: colors.text }]}>AfuBusiness</Text>
        <View style={{ width: 34 }} />
      </View>
      <LinearGradient colors={["#1C1C1E", "#3A3A3C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.profileCard}>
        <View style={st.profileRow}>
          <View style={[st.profileAvatar, { backgroundColor: accent + "33" }]}>
            <Ionicons name="briefcase" size={24} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.profileName} numberOfLines={1}>{profile?.display_name ?? "Your Business"}</Text>
            <Text style={st.profileHandle}>@{profile?.handle ?? "handle"}</Text>
          </View>
          <Pressable onPress={() => setScreen("edit-profile")} style={st.editBtn}>
            <Text style={st.editBtnText}>Edit</Text>
          </Pressable>
        </View>
        {shop ? (
          <View style={[st.shopBadge, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
            <Ionicons name="storefront" size={13} color="#fff" />
            <Text style={st.shopBadgeText}>{shop.name}</Text>
            <View style={[st.liveDot, { backgroundColor: shop.is_active ? "#34C759" : "#8E8E93" }]} />
            <Text style={[st.shopBadgeText, { color: shop.is_active ? "#34C759" : "#8E8E93" }]}>
              {shop.is_active ? "Live" : "Paused"}
            </Text>
          </View>
        ) : shop === null ? (
          <Pressable onPress={() => setScreen("shop-setup")} style={st.verifyBanner}>
            <Ionicons name="storefront-outline" size={14} color="#FFCC00" />
            <Text style={st.verifyText}>Tap to create your AfuMarket shop →</Text>
          </Pressable>
        ) : null}
      </LinearGradient>

      <Text style={[st.sectionLabel, { color: colors.textSecondary, paddingHorizontal: 16 }]}>OVERVIEW</Text>
      <View style={st.statsGrid}>
        {homStats.map((s) => (
          <GlassCard key={s.label} variant="medium" style={st.statCard}>
            <View style={[st.kpiIcon, { backgroundColor: s.color + "18" }]}>
              <Ionicons name={s.icon} size={18} color={s.color} />
            </View>
            <Text style={[st.kpiValue, { color: colors.text }]}>{s.value}</Text>
            <Text style={[st.kpiLabel, { color: colors.textMuted }]}>{s.label}</Text>
          </GlassCard>
        ))}
      </View>

      <Text style={[st.sectionLabel, { color: colors.textSecondary, paddingHorizontal: 16, marginTop: 8 }]}>TOOLS</Text>
      <View style={st.toolsGrid}>
        {TOOLS.map((t) => (
          <Pressable
            key={t.label}
            onPress={() => setScreen(t.screen)}
            style={({ pressed }) => [st.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={[st.toolIcon, { backgroundColor: t.color + "18" }]}>
              <Ionicons name={t.icon} size={22} color={t.color} />
            </View>
            <Text style={[st.toolLabel, { color: colors.text }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  profileCard: { margin: 16, borderRadius: 20, padding: 18, gap: 10 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  profileAvatar: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  profileName: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  profileHandle: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular" },
  editBtn: { borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  verifyBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,204,0,0.12)", borderRadius: 8, padding: 10 },
  verifyText: { color: "#FFCC00", fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  shopBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  shopBadgeText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_500Medium" },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 10 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 10, marginBottom: 8 },
  statCard: { width: "46%", borderRadius: 14, padding: 14, gap: 4, marginHorizontal: 4 },
  kpiCard: { width: "46%", borderRadius: 14, padding: 14, gap: 4, marginHorizontal: 4 },
  kpiIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  kpiValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  kpiLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  toolsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 10 },
  toolCard: { width: "22%", borderRadius: 14, padding: 12, alignItems: "center", gap: 7, marginHorizontal: 4 },
  toolIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toolLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  subHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, gap: 10, borderBottomWidth: 0.5 },
  homeHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderBottomWidth: 0.5 },
  homeTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  backBtn: { padding: 4, width: 34 },
  subTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  headerAction: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  headerActionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 40, marginTop: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  fieldInput: { borderWidth: 0.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  bioInput: { height: 100, textAlignVertical: "top" },
  actionBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  actionBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  saveMsg: { textAlign: "center", fontSize: 13, fontFamily: "Inter_500Medium" },
  catChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  catChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  toggleRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, gap: 12 },
  infoCard: { borderRadius: 16, padding: 20, alignItems: "center", gap: 8 },
  infoTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  productRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14 },
  productImg: { width: 52, height: 52, borderRadius: 10, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  productImgFill: { width: "100%", height: "100%" },
  productName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  productPrice: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14 },
  orderImg: { width: 46, height: 46, borderRadius: 10, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  shopStatCard: { borderRadius: 16, padding: 16 },
  shopStatRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  shopStatLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  shopStatVal: { fontSize: 13, fontFamily: "Inter_500Medium" },
  personRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  personAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
