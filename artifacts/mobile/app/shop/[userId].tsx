import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { Shop, ShopProduct, PRODUCT_CATEGORIES, addToCart, getOrCreateCart, formatShopAcoin, formatShopUGX } from "@/lib/shop";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

export default function ShopStorefront() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [addingId, setAddingId] = useState<string | null>(null);

  const cardW = Math.floor((width - 36) / 2);

  const load = useCallback(async () => {
    if (!userId) return;
    const [shopRes, productsRes] = await Promise.all([
      supabase.from("shops")
        .select("*, profiles!shops_seller_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified)")
        .eq("seller_id", userId).single(),
      supabase.from("shop_products")
        .select("*")
        .eq("seller_id", userId)
        .eq("is_available", true)
        .order("created_at", { ascending: false }),
    ]);
    setShop(shopRes.data as Shop);
    setProducts(productsRes.data || []);
    setLoading(false);
  }, [userId]);

  const loadCart = useCallback(async () => {
    if (!user) return;
    const items = await getOrCreateCart(user.id);
    setCartCount(items.reduce((s, i) => s + i.quantity, 0));
  }, [user]);

  useEffect(() => { load(); loadCart(); }, [load, loadCart]);

  async function handleAddToCart(product: ShopProduct) {
    if (!user) { router.push("/(auth)/login" as any); return; }
    if (product.seller_id === user.id) { showAlert("Oops", "You can't buy your own products."); return; }
    const available = product.is_unlimited_stock || product.stock > 0;
    if (!available) { showAlert("Out of Stock", "This product is currently unavailable."); return; }
    setAddingId(product.id);
    await addToCart(user.id, product.id);
    setCartCount((c) => c + 1);
    setAddingId(null);
    showAlert("Added to Cart", `${product.name} added to your cart`);
  }

  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category || "Other")))];
  const filtered = activeCategory === "All" ? products : products.filter((p) => p.category === activeCategory);

  const renderProduct = ({ item }: { item: ShopProduct }) => {
    const img = item.images?.[0];
    const outOfStock = !item.is_unlimited_stock && item.stock <= 0;
    return (
      <TouchableOpacity
        style={[styles.productCard, { width: cardW, backgroundColor: colors.surface }]}
        onPress={() => router.push({ pathname: "/shop/product/[id]", params: { id: item.id } })}
        activeOpacity={0.9}
      >
        <View style={styles.productImgWrap}>
          {img ? (
            <Image source={{ uri: img }} style={styles.productImg} resizeMode="cover" />
          ) : (
            <View style={[styles.productImg, { backgroundColor: Colors.brand + "18", alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="cube-outline" size={36} color={Colors.brand} />
            </View>
          )}
          {outOfStock && (
            <View style={styles.outOfStockBadge}>
              <Text style={styles.outOfStockText}>Out of Stock</Text>
            </View>
          )}
          {item.sales_count > 0 && (
            <View style={styles.soldBadge}>
              <Text style={styles.soldBadgeText}>{item.sales_count}+ sold</Text>
            </View>
          )}
        </View>
        <View style={styles.productInfo}>
          <Text style={[styles.productName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
          <Text style={[styles.productPrice, { color: Colors.brand }]}>{formatShopAcoin(item.price_acoin)}</Text>
          <Text style={[styles.productPriceUGX, { color: colors.textMuted }]}>{formatShopUGX(item.price_acoin)}</Text>
          <TouchableOpacity
            style={[styles.addCartBtn, { backgroundColor: outOfStock ? colors.backgroundTertiary : Colors.brand }]}
            onPress={() => handleAddToCart(item)}
            disabled={outOfStock || addingId === item.id}
          >
            {addingId === item.id
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="cart-outline" size={16} color={outOfStock ? colors.textMuted : "#fff"} />}
            <Text style={[styles.addCartBtnText, { color: outOfStock ? colors.textMuted : "#fff" }]}>
              {outOfStock ? "Unavailable" : "Add to Cart"}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ActivityIndicator color={Colors.brand} style={{ marginTop: 60 }} size="large" />
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.noShop}>
          <Text style={{ fontSize: 64 }}>🏪</Text>
          <Text style={[styles.noShopTitle, { color: colors.text }]}>No shop yet</Text>
          <Text style={[styles.noShopSub, { color: colors.textMuted }]}>This user hasn't set up their shop</Text>
          {userId === user?.id && (
            <TouchableOpacity style={[styles.setupBtn, { backgroundColor: Colors.brand }]} onPress={() => router.push("/shop/manage" as any)}>
              <Text style={styles.setupBtnText}>Set Up My Shop</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: "transparent", borderBottomColor: "transparent" }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {userId === user?.id && (
          <TouchableOpacity onPress={() => router.push("/shop/manage" as any)} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="settings-outline" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => router.push("/shop/cart" as any)} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="cart-outline" size={22} color="#fff" />
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={renderProduct}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 80, gap: 0 }}
        columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); await loadCart(); setRefreshing(false); }} tintColor={Colors.brand} />}
        ListHeaderComponent={
          <>
            <View style={styles.heroBanner}>
              {shop.banner_url ? (
                <Image source={{ uri: shop.banner_url }} style={styles.bannerImg} resizeMode="cover" />
              ) : (
                <LinearGradient colors={[Colors.brand, Colors.brandDark || "#0097A7"]} style={styles.bannerImg} />
              )}
              <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={styles.bannerGradient} />
              <View style={styles.bannerContent}>
                {shop.logo_url || shop.profiles?.avatar_url ? (
                  <Image source={{ uri: shop.logo_url || shop.profiles?.avatar_url }} style={styles.shopLogo} />
                ) : (
                  <View style={[styles.shopLogo, { backgroundColor: Colors.brand, alignItems: "center", justifyContent: "center" }]}>
                    <Text style={{ fontSize: 28 }}>🏪</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.shopNameRow}>
                    <Text style={styles.shopName} numberOfLines={1}>{shop.name}</Text>
                    {(shop.profiles?.is_organization_verified || shop.profiles?.is_verified) && (
                      <Ionicons name="checkmark-circle" size={16} color={Colors.brand} />
                    )}
                  </View>
                  {shop.category && <Text style={styles.shopCategory}>{shop.category}</Text>}
                </View>
              </View>
            </View>

            <View style={[styles.shopStats, { backgroundColor: colors.surface }]}>
              {[
                { label: "Products", value: products.length },
                { label: "Sales", value: shop.total_sales || 0 },
                { label: "Rating", value: shop.review_count > 0 ? `${shop.rating.toFixed(1)}⭐` : "New" },
              ].map((s, i) => (
                <React.Fragment key={s.label}>
                  {i > 0 && <View style={[styles.statDivider, { backgroundColor: colors.border }]} />}
                  <View style={styles.statItem}>
                    <Text style={[styles.statVal, { color: colors.text }]}>{s.value}</Text>
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>

            {shop.description ? (
              <View style={[styles.descCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.descText, { color: colors.textSecondary }]}>{shop.description}</Text>
              </View>
            ) : null}

            {userId !== user?.id && (
              <TouchableOpacity
                style={[styles.msgSellerBtn, { borderColor: Colors.brand }]}
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: userId } })}
              >
                <Ionicons name="chatbubble-outline" size={16} color={Colors.brand} />
                <Text style={[styles.msgSellerText, { color: Colors.brand }]}>Message Seller</Text>
              </TouchableOpacity>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12, gap: 8, paddingHorizontal: 0 }}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, { backgroundColor: activeCategory === cat ? Colors.brand : colors.surface, borderColor: activeCategory === cat ? Colors.brand : colors.border }]}
                  onPress={() => setActiveCategory(cat)}
                >
                  <Text style={[styles.catChipText, { color: activeCategory === cat ? "#fff" : colors.textMuted }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filtered.length === 0 && (
              <View style={styles.emptyProducts}>
                <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No products in this category</Text>
              </View>
            )}
          </>
        }
      />

      {cartCount > 0 && (
        <TouchableOpacity style={[styles.cartFab, { backgroundColor: Colors.brand }]} onPress={() => router.push("/shop/cart" as any)}>
          <Ionicons name="cart" size={22} color="#fff" />
          <Text style={styles.cartFabText}>View Cart ({cartCount})</Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  cartBadge: { position: "absolute", top: -4, right: -4, backgroundColor: "#FF3B30", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  cartBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
  heroBanner: { height: 220, position: "relative", marginBottom: 0 },
  bannerImg: { ...StyleSheet.absoluteFillObject },
  bannerGradient: { ...StyleSheet.absoluteFillObject },
  bannerContent: { position: "absolute", bottom: 16, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  shopLogo: { width: 56, height: 56, borderRadius: 14, borderWidth: 2, borderColor: "#fff" },
  shopNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  shopName: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", flex: 1 },
  shopCategory: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  shopStats: { flexDirection: "row", paddingVertical: 16, paddingHorizontal: 12 },
  statItem: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 2 },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 8 },
  descCard: { padding: 14, marginHorizontal: 12, marginTop: 10, borderRadius: 12 },
  descText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  msgSellerBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginTop: 10, borderWidth: 1.5, borderRadius: 24, paddingVertical: 10, justifyContent: "center" },
  msgSellerText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  catChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  catChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  productCard: { borderRadius: 16, overflow: "hidden", elevation: 1, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  productImgWrap: { position: "relative", width: "100%", aspectRatio: 1 },
  productImg: { width: "100%", height: "100%" },
  outOfStockBadge: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  outOfStockText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  soldBadge: { position: "absolute", bottom: 6, left: 6, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  soldBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_500Medium" },
  productInfo: { padding: 10, gap: 3 },
  productName: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  productPrice: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 2 },
  productPriceUGX: { fontSize: 11, fontFamily: "Inter_400Regular" },
  addCartBtn: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, justifyContent: "center" },
  addCartBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyProducts: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_500Medium" },
  noShop: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  noShopTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  noShopSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  setupBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24, marginTop: 8 },
  setupBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  cartFab: { position: "absolute", bottom: 24, left: 20, right: 20, borderRadius: 30, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, elevation: 6, shadowColor: Colors.brand, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  cartFabText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },
});
