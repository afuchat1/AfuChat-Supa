import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
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
import { Shop, ShopProduct, ShopReview, PRODUCT_CATEGORIES, addToCart, getOrCreateCart, formatShopAcoin, getShopReviews } from "@/lib/shop";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { Avatar } from "@/components/ui/Avatar";

const CATS = ["All", "Fashion", "Electronics", "Beauty", "Home", "Food", "Digital", "Sports", "Art", "Books", "Services", "Other"];

function ProductCard({ item, cardW, onPress, onAddCart, adding }: { item: ShopProduct; cardW: number; onPress: () => void; onAddCart: () => void; adding: boolean }) {
  const { colors } = useTheme();
  const img = item.images?.[0];
  const imgH = cardW * 1.0;

  return (
    <TouchableOpacity style={[st.card, { width: cardW, backgroundColor: colors.background }]} onPress={onPress} activeOpacity={0.93}>
      <View style={[st.imgWrap, { height: imgH }]}>
        {img ? (
          <Image source={{ uri: img }} style={st.cardImg} resizeMode="cover" />
        ) : (
          <View style={[st.imgPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="image-outline" size={28} color={colors.textMuted} />
          </View>
        )}
        {!item.is_unlimited_stock && item.stock < 5 && item.stock > 0 && (
          <View style={st.stockBadge}><Text style={st.stockBadgeText}>Only {item.stock} left</Text></View>
        )}
      </View>
      <View style={st.cardInfo}>
        <Text style={[st.cardName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
        <Text style={[st.cardPrice, { color: Colors.brand }]}>{formatShopAcoin(item.price_acoin)}</Text>
        <TouchableOpacity
          style={[st.addBtn, { backgroundColor: Colors.brand, opacity: adding ? 0.6 : 1 }]}
          onPress={onAddCart}
          disabled={adding || (!item.is_unlimited_stock && item.stock === 0)}
        >
          {adding ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={st.addBtnText}>{!item.is_unlimited_stock && item.stock === 0 ? "Sold Out" : "Add to Cart"}</Text>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function StoreStorefront() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [shop, setShop] = useState<(Shop & { profiles?: any }) | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ShopReview[]>([]);

  const cardW = Math.floor((width - 16 * 2 - 10) / 2);

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
        .order("sales_count", { ascending: false }),
    ]);
    setShop(shopRes.data as any);
    setProducts(productsRes.data || []);
    setLoading(false); setRefreshing(false);
    if (shopRes.data?.id) {
      const revs = await getShopReviews(shopRes.data.id, 10);
      setReviews(revs);
    }
  }, [userId]);

  const loadCart = useCallback(async () => {
    if (!user) return;
    const items = await getOrCreateCart(user.id);
    setCartCount(items.reduce((s, i) => s + i.quantity, 0));
  }, [user]);

  useEffect(() => { load(); loadCart(); }, [load, loadCart]);

  const filteredProducts = activeCategory === "All" ? products : products.filter(p => {
    const catMap: Record<string, string[]> = {
      "Fashion": ["Fashion"], "Electronics": ["Electronics"], "Beauty": ["Beauty"],
      "Home": ["Home & Garden"], "Food": ["Food & Drink"], "Digital": ["Digital Goods"],
      "Sports": ["Sports"], "Art": ["Art & Crafts"], "Books": ["Books"], "Services": ["Services"],
    };
    return (catMap[activeCategory] || [activeCategory]).includes(p.category);
  });

  async function handleAddToCart(product: ShopProduct) {
    if (!user) { router.push("/auth/login"); return; }
    setAddingId(product.id);
    await addToCart(user.id, product.id, 1);
    setCartCount(c => c + 1);
    setAddingId(null);
    showAlert("Added", `${product.name} added to your cart.`);
  }

  const seller = shop?.profiles;
  const headerH = 200;

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Floating back + cart */}
      <View style={[st.floatBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity style={[st.floatBtn, { backgroundColor: "rgba(0,0,0,0.35)" }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[st.floatBtn, { backgroundColor: "rgba(0,0,0,0.35)" }]} onPress={() => router.push("/shop/cart")}>
          <Ionicons name="cart-outline" size={20} color="#fff" />
          {cartCount > 0 && (
            <View style={[st.cartBadge, { backgroundColor: Colors.brand }]}>
              <Text style={st.cartBadgeText}>{cartCount > 9 ? "9+" : cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.loadingWrap}><ActivityIndicator color={Colors.brand} size="large" /></View>
      ) : !shop ? (
        <View style={st.loadingWrap}>
          <Text style={[st.notFoundText, { color: colors.textMuted }]}>Store not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={[st.backBtn, { backgroundColor: Colors.brand }]}>
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(i) => i.id}
          numColumns={2}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.brand} />}
          renderItem={({ item, index }) => (
            <View style={{ marginLeft: index % 2 === 0 ? 16 : 5, marginRight: index % 2 !== 0 ? 16 : 5, marginBottom: 10 }}>
              <ProductCard
                item={item}
                cardW={cardW}
                onPress={() => router.push({ pathname: "/shop/product/[id]", params: { id: item.id } })}
                onAddCart={() => handleAddToCart(item)}
                adding={addingId === item.id}
              />
            </View>
          )}
          ListHeaderComponent={
            <View>
              {/* Banner */}
              <View style={[st.banner, { height: headerH }]}>
                {shop.banner_url ? (
                  <Image source={{ uri: shop.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <LinearGradient colors={["#00BCD4", "#0097A7"]} style={StyleSheet.absoluteFill} />
                )}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.25)" }]} />
              </View>

              {/* Store info card */}
              <View style={[st.infoCard, { backgroundColor: colors.surface }]}>
                <View style={st.infoRow}>
                  <View style={[st.logoWrap, { borderColor: colors.background }]}>
                    <Avatar uri={shop.logo_url || seller?.avatar_url} name={shop.name} size={64} />
                  </View>
                  <View style={{ flex: 1, paddingTop: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={[st.shopName, { color: colors.text }]}>{shop.name}</Text>
                      {seller?.is_organization_verified && (
                        <View style={[st.orgBadge, { backgroundColor: Colors.brand + "18" }]}>
                          <Ionicons name="checkmark-circle" size={12} color={Colors.brand} />
                          <Text style={[st.orgBadgeText, { color: Colors.brand }]}>Verified Org</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[st.shopCategory, { color: colors.textMuted }]}>{shop.category || "General Store"}</Text>
                    {shop.rating > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 }}>
                        {[1,2,3,4,5].map(s => (
                          <Ionicons key={s} name={s <= Math.round(shop.rating) ? "star" : "star-outline"} size={12} color="#FF9500" />
                        ))}
                        <Text style={[st.ratingText, { color: colors.textMuted }]}>{shop.rating.toFixed(1)}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Stats */}
                <View style={[st.statsRow, { borderTopColor: colors.border }]}>
                  {[
                    { label: "Products", value: products.length.toString() },
                    { label: "Sales", value: shop.total_sales.toString() },
                    { label: "Reviews", value: shop.review_count.toString() },
                  ].map((s) => (
                    <View key={s.label} style={st.statItem}>
                      <Text style={[st.statValue, { color: colors.text }]}>{s.value}</Text>
                      <Text style={[st.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
                    </View>
                  ))}
                </View>

                {shop.description ? (
                  <Text style={[st.shopDesc, { color: colors.textSecondary, borderTopColor: colors.border }]}>{shop.description}</Text>
                ) : null}

                {/* Address if available */}
                {shop.address ? (
                  <View style={[st.addressRow, { borderTopColor: colors.border }]}>
                    <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                    <Text style={[st.addressText, { color: colors.textMuted }]}>{shop.address}</Text>
                  </View>
                ) : null}
              </View>

              {/* Category filter */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.catScroll}>
                {CATS.map((cat) => {
                  const active = activeCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setActiveCategory(cat)}
                      style={[st.catChip, {
                        backgroundColor: active ? Colors.brand : colors.surface,
                        borderColor: active ? Colors.brand : colors.border,
                      }]}
                    >
                      <Text style={[st.catChipText, { color: active ? "#fff" : colors.textSecondary }]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={[st.productsHeader, { borderBottomColor: colors.border }]}>
                <Text style={[st.productsTitle, { color: colors.text }]}>
                  {activeCategory === "All" ? "All Products" : activeCategory}
                </Text>
                <Text style={[st.productsCount, { color: colors.textMuted }]}>{filteredProducts.length} items</Text>
              </View>

              {filteredProducts.length === 0 && (
                <View style={st.emptyWrap}>
                  <Text style={{ fontSize: 40 }}>🛒</Text>
                  <Text style={[st.emptyText, { color: colors.textMuted }]}>No products in this category.</Text>
                </View>
              )}
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          ListFooterComponent={
            reviews.length > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 12 }}>
                <Text style={[{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text }]}>Customer Reviews</Text>
                {reviews.map((r) => (
                  <View key={r.id} style={[{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 8 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Avatar uri={r.reviewer?.avatar_url} size={34} name={r.reviewer?.display_name || "?"} />
                      <View style={{ flex: 1 }}>
                        <Text style={[{ color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13 }]}>{r.reviewer?.display_name || "Customer"}</Text>
                        <Text style={[{ color: colors.textMuted, fontSize: 11 }]}>{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 2 }}>
                        {[1,2,3,4,5].map(s => (
                          <Ionicons key={s} name={s <= r.rating ? "star" : "star-outline"} size={13} color={s <= r.rating ? "#D4A853" : "#ccc"} />
                        ))}
                      </View>
                    </View>
                    {r.review_text ? (
                      <Text style={[{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }]}>{r.review_text}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  backBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  floatBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 20,
  },
  floatBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  cartBadge: { position: "absolute", top: -3, right: -3, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cartBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  banner: { width: "100%", position: "relative" },
  infoCard: { marginHorizontal: 16, marginTop: -24, borderRadius: 20, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  infoRow: { flexDirection: "row", gap: 14, marginBottom: 14 },
  logoWrap: { marginTop: -36, borderWidth: 3, borderRadius: 38, overflow: "hidden" },
  shopName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  shopCategory: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  orgBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  orgBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  ratingText: { fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: 2 },
  statsRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginBottom: 8 },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  shopDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, paddingTop: 10, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingTop: 10, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  addressText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  catScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  catChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  productsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
  productsTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  productsCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  card: { borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  imgWrap: { width: "100%", position: "relative" },
  cardImg: { width: "100%", height: "100%" },
  imgPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  stockBadge: { position: "absolute", bottom: 6, left: 6, backgroundColor: "rgba(255,59,48,0.9)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  stockBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" },
  cardInfo: { padding: 10, gap: 6 },
  cardName: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  cardPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
  addBtn: { borderRadius: 10, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  addBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
