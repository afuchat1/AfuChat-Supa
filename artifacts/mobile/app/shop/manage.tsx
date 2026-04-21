import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { Shop, ShopProduct, ShopOrder, SHOP_CATEGORIES, PRODUCT_CATEGORIES, ORDER_STATUS_LABELS, ESCROW_STATUS_LABELS, formatShopAcoin, formatShopUGX, PLATFORM_FEE_PCT } from "@/lib/shop";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { notifyOrderShipped } from "@/lib/notifyUser";

type ManageTab = "overview" | "products" | "orders";

export default function ShopManage() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<ManageTab>("overview");
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingShop, setSavingShop] = useState(false);
  const [editShopModal, setEditShopModal] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ShopProduct> | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<"all" | "pending" | "paid" | "processing" | "shipped" | "delivered">("all");

  const [shopForm, setShopForm] = useState({ name: "", description: "", category: "", address: "" });
  const [shopBanner, setShopBanner] = useState<string | null>(null);
  const [shopLogo, setShopLogo] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [shopRes, productsRes, ordersRes] = await Promise.all([
      supabase.from("shops").select("*").eq("seller_id", user.id).single(),
      supabase.from("shop_products").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }),
      supabase.from("shop_orders").select("*, buyer_profile:profiles!shop_orders_buyer_id_fkey(display_name, handle, avatar_url), shop_order_items(*, shop_products(name, images))").eq("seller_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setShop(shopRes.data as Shop);
    if (shopRes.data) {
      setShopForm({ name: shopRes.data.name, description: shopRes.data.description || "", category: shopRes.data.category || "", address: shopRes.data.address || "" });
      setShopBanner(shopRes.data.banner_url || null);
      setShopLogo(shopRes.data.logo_url || null);
    }
    setProducts(productsRes.data || []);
    setOrders(ordersRes.data as any || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Real-time: update order list instantly when a new order arrives or status changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`seller-orders:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shop_orders", filter: `seller_id=eq.${user.id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shop_orders", filter: `seller_id=eq.${user.id}` },
        (payload: any) => {
          // Optimistically update the specific order in state
          setOrders((prev) =>
            prev.map((o) => (o.id === payload.new.id ? { ...o, ...payload.new } : o))
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  async function uploadImage(uri: string, path: string): Promise<string | null> {
    try {
      const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${path}/${Date.now()}.${ext}`;
      if (Platform.OS === "web") {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        const { data, error } = await supabase.storage.from("shop-media").upload(fileName, blob, { contentType: blob.type || "image/jpeg", upsert: true });
        if (error) return null;
        const { data: { publicUrl } } = supabase.storage.from("shop-media").getPublicUrl(fileName);
        return publicUrl;
      } else {
        const formData = new FormData();
        formData.append("file", { uri, name: fileName, type: `image/${ext}` } as any);
        const { data: sessionData } = await supabase.auth.getSession();
        const resp = await fetch(`https://rhnsjqqtdzlkvqazfcbg.supabase.co/storage/v1/object/shop-media/${fileName}`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${sessionData?.session?.access_token}`, "x-upsert": "true" },
          body: formData,
        });
        if (!resp.ok) return null;
        const { data: { publicUrl } } = supabase.storage.from("shop-media").getPublicUrl(fileName);
        return publicUrl;
      }
    } catch { return null; }
  }

  async function pickShopImage(type: "banner" | "logo") {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, allowsEditing: true, aspect: type === "banner" ? [16, 6] : [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    if (type === "banner") setShopBanner(uri);
    else setShopLogo(uri);
  }

  async function saveShop() {
    if (!shopForm.name.trim()) { showAlert("Required", "Shop name is required."); return; }
    if (!user) return;
    setSavingShop(true);

    let bannerUrl = shopBanner;
    let logoUrl = shopLogo;

    if (shopBanner && !shopBanner.startsWith("http")) {
      bannerUrl = await uploadImage(shopBanner, `shops/${user.id}/banner`);
    }
    if (shopLogo && !shopLogo.startsWith("http")) {
      logoUrl = await uploadImage(shopLogo, `shops/${user.id}/logo`);
    }

    const payload = { seller_id: user.id, name: shopForm.name.trim(), description: shopForm.description.trim() || null, category: shopForm.category || null, address: shopForm.address.trim() || null, banner_url: bannerUrl, logo_url: logoUrl, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("shops").upsert(payload, { onConflict: "seller_id" }).select().single();
    setSavingShop(false);
    if (error) { showAlert("Error", error.message); return; }
    setShop(data as Shop);
    setEditShopModal(false);
    showAlert("Saved!", "Your shop has been updated.");
  }

  async function saveProduct() {
    if (!editingProduct?.name?.trim()) { showAlert("Required", "Product name is required."); return; }
    if (!editingProduct?.price_acoin || editingProduct.price_acoin < 1) { showAlert("Required", "Price must be at least 1 ACoin."); return; }
    if (!user || !shop) return;
    setSavingProduct(true);

    let images = editingProduct.images || [];
    const newImages: string[] = [];
    for (const img of images) {
      if (!img.startsWith("http")) {
        const url = await uploadImage(img, `shops/${user.id}/products`);
        if (url) newImages.push(url);
      } else {
        newImages.push(img);
      }
    }

    const payload = {
      shop_id: shop.id,
      seller_id: user.id,
      name: editingProduct.name.trim(),
      description: editingProduct.description?.trim() || null,
      price_acoin: editingProduct.price_acoin,
      images: newImages,
      category: editingProduct.category || "General",
      stock: editingProduct.is_unlimited_stock ? 0 : (editingProduct.stock || 0),
      is_unlimited_stock: editingProduct.is_unlimited_stock ?? false,
      is_available: editingProduct.is_available ?? true,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (editingProduct.id) {
      ({ error } = await supabase.from("shop_products").update(payload).eq("id", editingProduct.id));
    } else {
      const { data, error: e } = await supabase.from("shop_products").insert({ ...payload, sales_count: 0 }).select().single();
      if (!e && data) setProducts((prev) => [data as ShopProduct, ...prev]);
      error = e;
    }

    setSavingProduct(false);
    if (error) { showAlert("Error", error.message); return; }
    setProductModal(false);
    setEditingProduct(null);
    await load();
  }

  async function deleteProduct(id: string) {
    showAlert("Delete Product", "Remove this product from your shop?", [
      { text: "Cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          setDeletingId(id);
          await supabase.from("shop_products").delete().eq("id", id);
          setProducts((prev) => prev.filter((p) => p.id !== id));
          setDeletingId(null);
        },
      },
    ]);
  }

  async function addProductImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    setEditingProduct((prev) => ({ ...prev, images: [...(prev?.images || []), result.assets[0].uri] }));
  }

  async function togglePinToProfile(value: boolean) {
    if (!shop) return;
    await supabase.from("shops").update({ pin_to_profile: value, updated_at: new Date().toISOString() }).eq("id", shop.id);
    setShop((prev) => prev ? { ...prev, pin_to_profile: value } : prev);
  }

  async function updateOrderStatus(orderId: string, status: string) {
    const now = new Date().toISOString();
    const updates: any = { status, updated_at: now };
    if (status === "shipped") updates.seller_confirmed_at = now;
    await supabase.from("shop_orders").update(updates).eq("id", orderId);
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: status as any, ...(status === "shipped" ? { seller_confirmed_at: now } : {}) } : o));
    if (status === "shipped") {
      await supabase.from("shop_order_messages").insert({ order_id: orderId, sender_id: user?.id, message: "📦 Your order has been shipped! Please confirm delivery once you receive it to release payment to me." });
      // Notify buyer that their order has shipped
      const ord = orders.find(o => o.id === orderId);
      if (ord && user && profile) {
        notifyOrderShipped({
          buyerId: ord.buyer_id,
          sellerName: profile.display_name || shop?.name || "The seller",
          sellerUserId: user.id,
          orderId,
        });
      }
    }
  }

  const filteredOrders = orderFilter === "all" ? orders : orders.filter((o) => o.status === orderFilter);
  const thisMonthRevenue = orders.filter((o) => {
    const d = new Date(o.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && (o.status === "paid" || o.status === "delivered");
  }).reduce((s, o) => s + Math.floor(o.total_acoin * (1 - PLATFORM_FEE_PCT / 100)), 0);

  function renderOverview() {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} />}>
        {!shop ? (
          <View style={[styles.setupCard, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 48 }}>🏪</Text>
            <Text style={[styles.setupTitle, { color: colors.text }]}>Set Up Your Shop</Text>
            <Text style={[styles.setupSub, { color: colors.textMuted }]}>Create your AfuChat shop to sell products and earn ACoin from your followers.</Text>
            <TouchableOpacity style={[styles.setupBtn, { backgroundColor: colors.accent }]} onPress={() => setEditShopModal(true)}>
              <Ionicons name="storefront-outline" size={18} color="#fff" />
              <Text style={styles.setupBtnText}>Create Shop</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <LinearGradient colors={[colors.accent + "22", colors.accentDark ? colors.accentDark + "11" : "#0097A722"]} style={[styles.shopOverviewCard, { borderColor: colors.accent + "44" }]}>
              <View style={styles.shopOverviewHeader}>
                {shop.logo_url ? (
                  <Image source={{ uri: shop.logo_url }} style={styles.shopOverviewLogo} />
                ) : (
                  <View style={[styles.shopOverviewLogo, { backgroundColor: colors.accent + "22", alignItems: "center", justifyContent: "center" }]}>
                    <Text style={{ fontSize: 28 }}>🏪</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shopOverviewName, { color: colors.text }]}>{shop.name}</Text>
                  {shop.category && <Text style={[styles.shopOverviewCat, { color: colors.textMuted }]}>{shop.category}</Text>}
                </View>
                <TouchableOpacity onPress={() => setEditShopModal(true)} style={[styles.editShopBtn, { borderColor: colors.accent }]}>
                  <Ionicons name="pencil-outline" size={14} color={colors.accent} />
                  <Text style={[styles.editShopBtnText, { color: colors.accent }]}>Edit</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.overviewStats}>
                {[
                  { label: "Products", value: products.length },
                  { label: "Total Sales", value: shop.total_sales || 0 },
                  { label: "This Month", value: formatShopAcoin(thisMonthRevenue) },
                  { label: "All-Time Revenue", value: formatShopAcoin(shop.total_revenue_acoin || 0) },
                ].map((s) => (
                  <View key={s.label} style={[styles.overviewStat, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.overviewStatVal, { color: colors.text }]}>{s.value}</Text>
                    <Text style={[styles.overviewStatLabel, { color: colors.textMuted }]}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>

            <TouchableOpacity style={[styles.viewShopBtn, { backgroundColor: colors.accent }]} onPress={() => router.push({ pathname: "/shop/[userId]", params: { userId: user!.id } })}>
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text style={styles.viewShopBtnText}>Preview My Store</Text>
            </TouchableOpacity>

            {/* ── Pin to Profile ── */}
            <View style={[styles.quickActions, { backgroundColor: colors.surface, marginBottom: 0 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Pin Store to Profile</Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 2 }}>
                    Show a "Visit Store" button on your public profile page.
                  </Text>
                </View>
                <Switch
                  value={!!shop?.pin_to_profile}
                  onValueChange={togglePinToProfile}
                  trackColor={{ false: colors.border, true: colors.accent + "80" }}
                  thumbColor={shop?.pin_to_profile ? colors.accent : colors.textMuted}
                />
              </View>
              {shop?.pin_to_profile && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                  <Ionicons name="checkmark-circle" size={14} color="#34C759" />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#34C759" }}>
                    Your store is pinned and visible on your public profile.
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.quickActions, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
              {[
                { icon: "add-circle-outline", label: "Add Product", color: "#34C759", action: () => { setEditingProduct({ is_available: true, is_unlimited_stock: false, stock: 10, price_acoin: 50, category: "General", images: [] }); setProductModal(true); } },
                { icon: "list-outline", label: "Manage Products", color: colors.accent, action: () => setTab("products") },
                { icon: "receipt-outline", label: "View Orders", color: "#FF9500", action: () => setTab("orders") },
                { icon: "wallet-outline", label: "My Wallet", color: "#AF52DE", action: () => router.push("/wallet" as any) },
              ].map((a) => (
                <TouchableOpacity key={a.label} style={styles.quickAction} onPress={a.action}>
                  <View style={[styles.quickActionIcon, { backgroundColor: a.color + "18" }]}>
                    <Ionicons name={a.icon as any} size={22} color={a.color} />
                  </View>
                  <Text style={[styles.quickActionLabel, { color: colors.text }]}>{a.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  function renderProducts() {
    return (
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} />}
        ListHeaderComponent={
          <TouchableOpacity
            style={[styles.addProductBtn, { backgroundColor: colors.accent }]}
            onPress={() => { setEditingProduct({ is_available: true, is_unlimited_stock: false, stock: 10, price_acoin: 50, category: "General", images: [] }); setProductModal(true); }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={styles.addProductBtnText}>Add New Product</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 48 }}>📦</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No products yet</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>Add your first product to start selling</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.productRow, { backgroundColor: colors.surface }]}>
            {item.images?.[0] ? (
              <Image source={{ uri: item.images[0] }} style={styles.productRowImg} resizeMode="cover" />
            ) : (
              <View style={[styles.productRowImg, { backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="cube-outline" size={22} color={colors.accent} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.productRowName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.productRowPrice, { color: colors.accent }]}>{formatShopAcoin(item.price_acoin)}</Text>
              <View style={styles.productRowMeta}>
                <View style={[styles.stockBadge, { backgroundColor: (!item.is_unlimited_stock && item.stock <= 0) ? "#FF3B3018" : "#34C75918" }]}>
                  <Text style={[styles.stockBadgeText, { color: (!item.is_unlimited_stock && item.stock <= 0) ? "#FF3B30" : "#34C759" }]}>
                    {item.is_unlimited_stock ? "Unlimited" : item.stock <= 0 ? "Out of stock" : `${item.stock} in stock`}
                  </Text>
                </View>
                <Text style={[styles.soldCount, { color: colors.textMuted }]}>{item.sales_count} sold</Text>
              </View>
            </View>
            <View style={styles.productRowActions}>
              <TouchableOpacity onPress={() => { setEditingProduct(item); setProductModal(true); }} hitSlop={8}>
                <Ionicons name="pencil-outline" size={20} color={colors.accent} />
              </TouchableOpacity>
              {deletingId === item.id
                ? <ActivityIndicator size="small" color="#FF3B30" />
                : <TouchableOpacity onPress={() => deleteProduct(item.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                  </TouchableOpacity>
              }
            </View>
          </View>
        )}
      />
    );
  }

  function renderOrders() {
    return (
      <FlatList
        data={filteredOrders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} />}
        ListHeaderComponent={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 14, gap: 8 }}>
            {(["all", "pending", "paid", "processing", "shipped", "delivered"] as const).map((s) => (
              <TouchableOpacity key={s} style={[styles.orderFilter, { backgroundColor: orderFilter === s ? colors.accent : colors.surface, borderColor: orderFilter === s ? colors.accent : colors.border }]} onPress={() => setOrderFilter(s)}>
                <Text style={[styles.orderFilterText, { color: orderFilter === s ? "#fff" : colors.textMuted }]}>{s === "all" ? "All" : ORDER_STATUS_LABELS[s]?.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 48 }}>📋</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No orders yet</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>Orders from buyers will appear here</Text>
          </View>
        }
        renderItem={({ item: order }) => {
          const status = ORDER_STATUS_LABELS[order.status] || ORDER_STATUS_LABELS.pending;
          const buyer = (order as any).buyer_profile;
          return (
            <View style={[styles.orderCard, { backgroundColor: colors.surface, borderLeftColor: status.color }]}>
              <View style={styles.orderHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.orderId, { color: colors.textMuted }]}>#{order.id.slice(-8).toUpperCase()}</Text>
                  <Text style={[styles.orderBuyer, { color: colors.text }]}>
                    {buyer?.display_name || "Customer"} · @{buyer?.handle || "?"}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: status.color + "20" }]}>
                  <Ionicons name={status.icon as any} size={12} color={status.color} />
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>

              {((order as any).shop_order_items || []).map((item: any) => (
                <Text key={item.id} style={[styles.orderItemLine, { color: colors.textSecondary }]}>
                  {item.quantity}× {item.shop_products?.name || item.snapshot_name || "Product"} — {formatShopAcoin(item.unit_price_acoin * item.quantity)}
                </Text>
              ))}

              <View style={styles.orderFooter}>
                <View>
                  {(order as any).escrow_status === "released"
                    ? <Text style={[styles.orderTotal, { color: "#34C759" }]}>{formatShopAcoin((order as any).escrowed_acoin || Math.floor(order.total_acoin * (1 - PLATFORM_FEE_PCT / 100)))} received</Text>
                    : <Text style={[styles.orderTotal, { color: "#FF9500" }]}>{formatShopAcoin((order as any).escrowed_acoin || Math.floor(order.total_acoin * (1 - PLATFORM_FEE_PCT / 100)))} in escrow</Text>}
                  <Text style={[styles.orderDate, { color: colors.textMuted }]}>{new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <TouchableOpacity
                    style={[styles.processBtn, { backgroundColor: "#5856D6" + "20", paddingHorizontal: 10 }]}
                    onPress={() => router.push(`/shop/order/${order.id}` as any)}
                  >
                    <Ionicons name="chatbubble-outline" size={14} color="#5856D6" />
                  </TouchableOpacity>
                  {order.status === "paid" && (
                    <TouchableOpacity style={[styles.processBtn, { backgroundColor: "#007AFF" }]} onPress={() => updateOrderStatus(order.id, "processing")}>
                      <Text style={styles.processBtnText}>Process</Text>
                    </TouchableOpacity>
                  )}
                  {order.status === "processing" && (
                    <TouchableOpacity style={[styles.processBtn, { backgroundColor: "#AF52DE" }]} onPress={() => updateOrderStatus(order.id, "shipped")}>
                      <Text style={styles.processBtnText}>Ship</Text>
                    </TouchableOpacity>
                  )}
                  {order.status === "shipped" && (order as any).escrow_status === "held" && (
                    <View style={[styles.processBtn, { backgroundColor: "#FF9500" + "20" }]}>
                      <Text style={[styles.processBtnText, { color: "#FF9500" }]}>Awaiting buyer</Text>
                    </View>
                  )}
                </View>
              </View>
              {(order as any).escrow_status === "held" && (
                <View style={{ marginTop: 8, padding: 8, backgroundColor: "#FF9500" + "12", borderRadius: 10, borderWidth: 1, borderColor: "#FF9500" + "25" }}>
                  <Text style={{ color: "#FF9500", fontSize: 11, fontFamily: "Inter_400Regular" }}>
                    🔒 Payment held in escrow — released when buyer confirms delivery
                  </Text>
                </View>
              )}
              {(order as any).escrow_status === "disputed" && (
                <View style={{ marginTop: 8, padding: 8, backgroundColor: "#FF3B30" + "12", borderRadius: 10, borderWidth: 1, borderColor: "#FF3B30" + "25" }}>
                  <Text style={{ color: "#FF3B30", fontSize: 11, fontFamily: "Inter_400Regular" }}>
                    ⚠️ Dispute open — our team is reviewing this order
                  </Text>
                </View>
              )}
            </View>
          );
        }}
      />
    );
  }

  const isOrg = profile?.is_organization_verified;

  if (!isOrg) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Store Manager</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="lock-closed" size={36} color={colors.accent} />
          </View>
          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center" }}>Verified Organizations Only</Text>
          <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", lineHeight: 22 }}>
            Only verified organizations can list and sell products on AfuMarket. Get your account verified to open your store and reach customers across the platform.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 8 }}
            onPress={() => router.push("/shop/apply" as any)}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Apply for Verification</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/store")}>
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.accent }}>Browse Marketplace</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (profile && !profile.is_organization_verified) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Store Manager</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
          <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: colors.accent + "15", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="lock-closed-outline" size={36} color={colors.accent} />
          </View>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center" }}>Verified Orgs Only</Text>
          <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center", lineHeight: 21 }}>
            Only organization-verified accounts can manage a store and list products. Submit a seller application to get started.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 }}
            onPress={() => router.replace("/shop/apply")}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>Apply to Become a Seller</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Store Manager</Text>
        {shop && (
          <TouchableOpacity onPress={() => router.push({ pathname: "/shop/[userId]", params: { userId: user!.id } })} hitSlop={10}>
            <Ionicons name="eye-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {([
          { key: "overview", label: "Overview", icon: "bar-chart-outline" },
          { key: "products", label: "Products", icon: "cube-outline" },
          { key: "orders", label: "Orders", icon: "receipt-outline" },
        ] as const).map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]} onPress={() => setTab(t.key)}>
            <Ionicons name={t.icon} size={15} color={tab === t.key ? colors.accent : colors.textMuted} />
            <Text style={[styles.tabText, { color: tab === t.key ? colors.accent : colors.textMuted }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} size="large" /> : (
        <View style={{ flex: 1 }}>
          {tab === "overview" && renderOverview()}
          {tab === "products" && renderProducts()}
          {tab === "orders" && renderOrders()}
        </View>
      )}

      <Modal visible={editShopModal} transparent animationType="slide" onRequestClose={() => setEditShopModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={[styles.modalSheet, { backgroundColor: colors.surface }]} contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <View style={styles.dragHandle} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>{shop ? "Edit Shop" : "Create Shop"}</Text>

            <TouchableOpacity style={styles.bannerPicker} onPress={() => pickShopImage("banner")}>
              {shopBanner ? <Image source={{ uri: shopBanner }} style={styles.bannerPreview} resizeMode="cover" /> : <View style={[styles.bannerPreview, { backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" }]}><Ionicons name="image-outline" size={32} color={colors.accent} /><Text style={[styles.pickerHint, { color: colors.accent }]}>Tap to add banner</Text></View>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.logoPicker} onPress={() => pickShopImage("logo")}>
              {shopLogo ? <Image source={{ uri: shopLogo }} style={styles.logoPreview} resizeMode="cover" /> : <View style={[styles.logoPreview, { backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" }]}><Text style={{ fontSize: 24 }}>🏪</Text></View>}
              <View style={[styles.logoEditBadge, { backgroundColor: colors.accent }]}><Ionicons name="camera-outline" size={12} color="#fff" /></View>
            </TouchableOpacity>

            {[
              { label: "Shop Name *", key: "name", placeholder: "e.g. Sarah's Boutique", multiline: false },
              { label: "Description", key: "description", placeholder: "What do you sell?", multiline: true },
              { label: "Address / Location", key: "address", placeholder: "e.g. Kampala, Uganda", multiline: false },
            ].map((f) => (
              <View key={f.key}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>{f.label}</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.backgroundTertiary, height: f.multiline ? 80 : 46 }]}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.textMuted}
                  value={(shopForm as any)[f.key]}
                  onChangeText={(v) => setShopForm((p) => ({ ...p, [f.key]: v }))}
                  multiline={f.multiline}
                  textAlignVertical={f.multiline ? "top" : "center"}
                />
              </View>
            ))}

            <Text style={[styles.formLabel, { color: colors.textMuted }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {SHOP_CATEGORIES.map((c) => (
                <TouchableOpacity key={c} style={[styles.catChip, { backgroundColor: shopForm.category === c ? colors.accent : colors.surface, borderColor: shopForm.category === c ? colors.accent : colors.border }]} onPress={() => setShopForm((p) => ({ ...p, category: c }))}>
                  <Text style={[styles.catChipText, { color: shopForm.category === c ? "#fff" : colors.textMuted }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setEditShopModal(false)}>
                <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.accent }]} onPress={saveShop} disabled={savingShop}>
                {savingShop ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>{shop ? "Save Changes" : "Create Shop"}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={productModal} transparent animationType="slide" onRequestClose={() => { setProductModal(false); setEditingProduct(null); }}>
        <View style={styles.modalOverlay}>
          <ScrollView style={[styles.modalSheet, { backgroundColor: colors.surface }]} contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.dragHandle} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editingProduct?.id ? "Edit Product" : "Add Product"}</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(editingProduct?.images || []).map((img, i) => (
                <View key={i} style={{ position: "relative" }}>
                  <Image source={{ uri: img }} style={styles.productImgThumb} resizeMode="cover" />
                  <TouchableOpacity style={styles.removeImgBtn} onPress={() => setEditingProduct((p) => ({ ...p, images: (p?.images || []).filter((_, j) => j !== i) }))}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {(editingProduct?.images?.length || 0) < 5 && (
                <TouchableOpacity style={[styles.addImgBtn, { backgroundColor: colors.backgroundTertiary, borderColor: colors.border }]} onPress={addProductImage}>
                  <Ionicons name="camera-outline" size={22} color={colors.accent} />
                  <Text style={[styles.addImgText, { color: colors.accent }]}>Add Photo</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            {[
              { label: "Product Name *", key: "name", placeholder: "e.g. Wireless Earbuds", multiline: false },
              { label: "Description", key: "description", placeholder: "Describe your product...", multiline: true },
            ].map((f) => (
              <View key={f.key}>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>{f.label}</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.backgroundTertiary, height: f.multiline ? 80 : 46 }]}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.textMuted}
                  value={(editingProduct as any)?.[f.key] || ""}
                  onChangeText={(v) => setEditingProduct((p) => ({ ...p, [f.key]: v }))}
                  multiline={f.multiline}
                  textAlignVertical={f.multiline ? "top" : "center"}
                />
              </View>
            ))}

            <View>
              <Text style={[styles.formLabel, { color: colors.textMuted }]}>Price (ACoin) *</Text>
              <View style={[styles.priceRow, { backgroundColor: colors.backgroundTertiary, borderColor: colors.border }]}>
                <TouchableOpacity onPress={() => setEditingProduct((p) => ({ ...p, price_acoin: Math.max(1, (p?.price_acoin || 1) - 10) }))} hitSlop={10}>
                  <Ionicons name="remove-circle-outline" size={28} color={colors.accent} />
                </TouchableOpacity>
                <TextInput
                  style={[styles.priceInput, { color: colors.text }]}
                  value={String(editingProduct?.price_acoin || "")}
                  onChangeText={(v) => setEditingProduct((p) => ({ ...p, price_acoin: parseInt(v) || 0 }))}
                  keyboardType="number-pad"
                  textAlign="center"
                />
                <Text style={[styles.priceUnit, { color: colors.textMuted }]}>ACoin</Text>
                <TouchableOpacity onPress={() => setEditingProduct((p) => ({ ...p, price_acoin: (p?.price_acoin || 0) + 10 }))} hitSlop={10}>
                  <Ionicons name="add-circle-outline" size={28} color={colors.accent} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.priceHint, { color: colors.textMuted }]}>= {formatShopUGX(editingProduct?.price_acoin || 0)}</Text>
            </View>

            <Text style={[styles.formLabel, { color: colors.textMuted }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {PRODUCT_CATEGORIES.filter((c) => c !== "All").map((c) => (
                <TouchableOpacity key={c} style={[styles.catChip, { backgroundColor: editingProduct?.category === c ? colors.accent : colors.surface, borderColor: editingProduct?.category === c ? colors.accent : colors.border }]} onPress={() => setEditingProduct((p) => ({ ...p, category: c }))}>
                  <Text style={[styles.catChipText, { color: editingProduct?.category === c ? "#fff" : colors.textMuted }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={[styles.stockRow, { backgroundColor: colors.backgroundTertiary, borderRadius: 12, padding: 14 }]}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Unlimited Stock</Text>
              <Switch value={editingProduct?.is_unlimited_stock ?? false} onValueChange={(v) => setEditingProduct((p) => ({ ...p, is_unlimited_stock: v }))} trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
            </View>

            {!editingProduct?.is_unlimited_stock && (
              <View>
                <Text style={[styles.formLabel, { color: colors.textMuted }]}>Stock Quantity</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.backgroundTertiary, height: 46 }]}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  value={String(editingProduct?.stock || "")}
                  onChangeText={(v) => setEditingProduct((p) => ({ ...p, stock: parseInt(v) || 0 }))}
                  keyboardType="number-pad"
                />
              </View>
            )}

            <View style={[styles.stockRow, { backgroundColor: colors.backgroundTertiary, borderRadius: 12, padding: 14 }]}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Available for Sale</Text>
              <Switch value={editingProduct?.is_available ?? true} onValueChange={(v) => setEditingProduct((p) => ({ ...p, is_available: v }))} trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => { setProductModal(false); setEditingProduct(null); }}>
                <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.accent }]} onPress={saveProduct} disabled={savingProduct}>
                {savingProduct ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>{editingProduct?.id ? "Save Changes" : "Add Product"}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold" },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  setupCard: { margin: 16, borderRadius: 20, padding: 32, alignItems: "center", gap: 12 },
  setupTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  setupSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  setupBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 28, marginTop: 8 },
  setupBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  shopOverviewCard: { margin: 14, borderRadius: 20, padding: 18, borderWidth: 1.5, gap: 16 },
  shopOverviewHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  shopOverviewLogo: { width: 54, height: 54, borderRadius: 14 },
  shopOverviewName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  shopOverviewCat: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  editShopBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  editShopBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  overviewStats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  overviewStat: { flex: 1, minWidth: "45%", borderRadius: 12, padding: 12, alignItems: "center" },
  overviewStatVal: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 2 },
  overviewStatLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  viewShopBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 14, borderRadius: 28, paddingVertical: 14, justifyContent: "center" },
  viewShopBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  quickActions: { margin: 14, borderRadius: 16, padding: 16, gap: 4 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 8 },
  quickAction: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  quickActionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  addProductBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 28, paddingVertical: 14, justifyContent: "center", marginBottom: 4 },
  addProductBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  productRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14 },
  productRowImg: { width: 60, height: 60, borderRadius: 10 },
  productRowName: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 2 },
  productRowPrice: { fontSize: 14, fontFamily: "Inter_700Bold" },
  productRowMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  stockBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  stockBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  soldCount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  productRowActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  emptyBox: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  orderFilter: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  orderFilterText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  orderCard: { marginHorizontal: 14, marginBottom: 10, borderRadius: 14, padding: 14, borderLeftWidth: 4, gap: 8 },
  orderHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  orderId: { fontSize: 11, fontFamily: "Inter_500Medium" },
  orderBuyer: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  orderItemLine: { fontSize: 13, fontFamily: "Inter_400Regular" },
  orderFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  orderTotal: { fontSize: 15, fontFamily: "Inter_700Bold" },
  orderDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  processBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  processBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: { maxHeight: "90%", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 8 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  bannerPicker: { height: 100, borderRadius: 14, overflow: "hidden" },
  bannerPreview: { flex: 1, alignItems: "center", justifyContent: "center" },
  pickerHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  logoPicker: { width: 70, height: 70, position: "relative" },
  logoPreview: { width: 70, height: 70, borderRadius: 18 },
  logoEditBadge: { position: "absolute", bottom: -4, right: -4, backgroundColor: Colors.brand, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  formLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, letterSpacing: 0.2 },
  formInput: { borderRadius: 12, paddingHorizontal: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  catChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  priceRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  priceInput: { flex: 1, fontSize: 26, fontFamily: "Inter_700Bold", padding: 0 },
  priceUnit: { fontSize: 13, fontFamily: "Inter_500Medium" },
  priceHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" },
  stockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  productImgThumb: { width: 80, height: 80, borderRadius: 10 },
  removeImgBtn: { position: "absolute", top: -6, right: -6, backgroundColor: "#FF3B30", width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  addImgBtn: { width: 80, height: 80, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4 },
  addImgText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  saveBtn: { flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
