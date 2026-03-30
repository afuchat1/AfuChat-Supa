import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { ShopProduct, Shop, formatShopAcoin, getOrCreateCart, PRODUCT_CATEGORIES } from "@/lib/shop";
import Colors from "@/constants/colors";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { Avatar } from "@/components/ui/Avatar";
import { PostSkeleton } from "@/components/ui/Skeleton";

type ProductWithShop = ShopProduct & {
  shops: Shop & {
    profiles: {
      display_name: string;
      handle: string;
      avatar_url: string | null;
      is_organization_verified: boolean;
      is_verified: boolean;
    };
  };
};

type FeaturedStore = Shop & {
  profiles: {
    display_name: string;
    handle: string;
    avatar_url: string | null;
    is_organization_verified: boolean;
    is_verified: boolean;
  };
  product_count?: number;
};

const ALL_CATS = ["All", "Fashion", "Electronics", "Beauty", "Home", "Food", "Digital", "Sports", "Art", "Books", "Services", "Other"];

function ProductCard({ item, cardW, onPress }: { item: ProductWithShop; cardW: number; onPress: () => void }) {
  const { colors } = useTheme();
  const img = item.images?.[0];
  const imgH = cardW * 1.1;

  return (
    <TouchableOpacity style={[st.productCard, { width: cardW, backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.93}>
      <View style={[st.imgWrap, { height: imgH }]}>
        {img ? (
          <Image source={{ uri: img }} style={st.productImg} resizeMode="cover" />
        ) : (
          <View style={[st.imgPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="image-outline" size={32} color={colors.textMuted} />
          </View>
        )}
        {(item.is_unlimited_stock === false && item.stock < 5 && item.stock > 0) && (
          <View style={st.stockBadge}>
            <Text style={st.stockBadgeText}>Only {item.stock} left</Text>
          </View>
        )}
        {item.sales_count > 20 && (
          <View style={[st.hotBadge, { backgroundColor: "#FF3B30" }]}>
            <Text style={st.hotBadgeText}>🔥 Hot</Text>
          </View>
        )}
      </View>
      <View style={st.productInfo}>
        <Text style={[st.productName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
        <View style={st.storeRow}>
          <View style={[st.orgDot, { backgroundColor: item.shops?.profiles?.is_organization_verified ? "#00BCD4" : colors.backgroundSecondary }]} />
          <Text style={[st.storeName, { color: colors.textMuted }]} numberOfLines={1}>
            {item.shops?.name || item.shops?.profiles?.display_name || "Store"}
          </Text>
        </View>
        <View style={st.priceRow}>
          <Text style={[st.priceText, { color: Colors.brand }]}>{formatShopAcoin(item.price_acoin)}</Text>
          {item.sales_count > 0 && (
            <Text style={[st.salesText, { color: colors.textMuted }]}>{item.sales_count} sold</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function StoreChip({ store, onPress }: { store: FeaturedStore; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={[st.storeChip, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onPress} activeOpacity={0.85}>
      <Avatar uri={store.profiles?.avatar_url} name={store.name} size={40} />
      <View style={st.storeChipInfo}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={[st.storeChipName, { color: colors.text }]} numberOfLines={1}>{store.name}</Text>
          {store.profiles?.is_organization_verified && (
            <Ionicons name="checkmark-circle" size={13} color={Colors.brand} />
          )}
        </View>
        <Text style={[st.storeChipCategory, { color: colors.textMuted }]}>{store.category || "General"}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MarketplaceScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isOrg = profile?.is_organization_verified;
  const cardW = Math.floor((width - 16 * 2 - 12) / 2);

  const [products, setProducts] = useState<ProductWithShop[]>([]);
  const [stores, setStores] = useState<FeaturedStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE = 20;

  function handleSearchChange(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(text), 350);
  }

  const loadProducts = useCallback(async (offset = 0, isRefresh = false) => {
    if (offset === 0) { isRefresh ? setRefreshing(true) : setLoading(true); }
    else setLoadingMore(true);

    let query = supabase
      .from("shop_products")
      .select("*, shops!shop_products_shop_id_fkey(id, name, logo_url, banner_url, category, rating, total_sales, seller_id, pin_to_profile, profiles!shops_seller_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified))")
      .eq("is_available", true)
      .order("sales_count", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (activeCategory !== "All") {
      const catMap: Record<string, string> = {
        "Fashion": "Fashion", "Electronics": "Electronics", "Beauty": "Beauty", "Home": "Home & Garden",
        "Food": "Food & Drink", "Digital": "Digital Goods", "Sports": "Sports", "Art": "Art & Crafts",
        "Books": "Books", "Services": "Services", "Other": "Other"
      };
      query = query.eq("category", catMap[activeCategory] || activeCategory);
    }
    if (debouncedSearch.trim()) {
      query = query.ilike("name", `%${debouncedSearch.trim()}%`);
    }

    const { data } = await query;
    const rows = (data || []) as ProductWithShop[];

    if (offset === 0) setProducts(rows);
    else setProducts(prev => [...prev, ...rows]);

    setHasMore(rows.length === PAGE);
    setLoading(false); setRefreshing(false); setLoadingMore(false);
  }, [activeCategory, debouncedSearch]);

  const loadStores = useCallback(async () => {
    const { data } = await supabase
      .from("shops")
      .select("*, profiles!shops_seller_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified)")
      .eq("is_active", true)
      .order("total_sales", { ascending: false })
      .limit(12);
    setStores((data || []) as FeaturedStore[]);
  }, []);

  const loadCart = useCallback(async () => {
    if (!user) return;
    const items = await getOrCreateCart(user.id);
    setCartCount(items.reduce((s, i) => s + i.quantity, 0));
  }, [user]);

  useEffect(() => {
    loadProducts(0);
    loadStores();
    loadCart();
  }, [loadProducts, loadStores, loadCart]);

  const onRefresh = useCallback(() => { loadProducts(0, true); loadStores(); loadCart(); }, [loadProducts, loadStores, loadCart]);
  const onEndReached = useCallback(() => { if (!loadingMore && hasMore) loadProducts(products.length); }, [loadingMore, hasMore, products.length, loadProducts]);

  const renderProductItem = useCallback(({ item, index }: { item: ProductWithShop; index: number }) => (
    <View style={{ marginLeft: index % 2 === 0 ? 16 : 6, marginRight: index % 2 !== 0 ? 16 : 6, marginBottom: 12 }}>
      <ProductCard item={item} cardW={cardW} onPress={() => router.push({ pathname: "/shop/product/[id]", params: { id: item.id } })} />
    </View>
  ), [cardW]);

  const headerTopPad = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 12);

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[st.header, { paddingTop: headerTopPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={st.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[st.headerTitle, { color: colors.text }]}>Marketplace</Text>
            <Text style={[st.headerSub, { color: colors.textMuted }]}>Verified Organization Stores</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            {isOrg && (
              <TouchableOpacity style={[st.manageBtn, { backgroundColor: Colors.brand + "18", borderColor: Colors.brand + "40" }]} onPress={() => router.push("/shop/manage")}>
                <Ionicons name="storefront-outline" size={15} color={Colors.brand} />
                <Text style={[st.manageBtnText, { color: Colors.brand }]}>My Store</Text>
              </TouchableOpacity>
            )}
            {user && !isOrg && (
              <TouchableOpacity style={[st.manageBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push("/shop/my-orders" as any)}>
                <Ionicons name="cube-outline" size={15} color={colors.text} />
                <Text style={[st.manageBtnText, { color: colors.text }]}>My Orders</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[st.cartBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push("/shop/cart")}>
              <Ionicons name="cart-outline" size={22} color={colors.text} />
              {cartCount > 0 && (
                <View style={[st.cartBadge, { backgroundColor: Colors.brand }]}>
                  <Text style={st.cartBadgeText}>{cartCount > 9 ? "9+" : cartCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
        {/* Search */}
        <View style={[st.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={[st.searchInput, { color: colors.text }]}
            placeholder="Search products, stores..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(""); setDebouncedSearch(""); }} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.catScroll}>
          {ALL_CATS.map((cat) => {
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
      </View>

      <FlatList
        data={products}
        keyExtractor={(i) => i.id}
        numColumns={2}
        renderItem={renderProductItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* ── Hero Banner ── */}
            {activeCategory === "All" && !debouncedSearch && (
              <LinearGradient
                colors={["#00BCD4", "#0097A7"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={st.hero}
              >
                <View style={st.heroContent}>
                  <Text style={st.heroTag}>AfuMarket</Text>
                  <Text style={st.heroTitle}>Shop from Verified{"\n"}Org Stores</Text>
                  <Text style={st.heroSub}>Secure checkout · ACoins wallet · Trusted sellers</Text>
                  <View style={st.heroFeatures}>
                    {["🔒 Secure", "🪙 ACoins", "✅ Verified"].map((f) => (
                      <View key={f} style={st.heroFeaturePill}>
                        <Text style={st.heroFeatureText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={st.heroIllustration}>
                  <Text style={{ fontSize: 64 }}>🛍️</Text>
                </View>
              </LinearGradient>
            )}

            {/* ── Top Stores ── */}
            {activeCategory === "All" && !debouncedSearch && stores.length > 0 && (
              <View style={st.section}>
                <View style={st.sectionHeader}>
                  <Text style={[st.sectionTitle, { color: colors.text }]}>Top Stores</Text>
                  <TouchableOpacity onPress={() => {}} hitSlop={8}>
                    <Text style={[st.sectionLink, { color: Colors.brand }]}>See all</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                  {stores.map((s) => (
                    <StoreChip key={s.id} store={s} onPress={() => router.push({ pathname: "/shop/[userId]", params: { userId: s.seller_id } })} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Products Header ── */}
            <View style={[st.sectionHeader, { marginTop: 8, paddingHorizontal: 16 }]}>
              <Text style={[st.sectionTitle, { color: colors.text }]}>
                {debouncedSearch ? `Results for "${debouncedSearch}"` : activeCategory === "All" ? "All Products" : activeCategory}
              </Text>
              {products.length > 0 && (
                <Text style={[st.productCount, { color: colors.textMuted }]}>{products.length}+ items</Text>
              )}
            </View>

            {loading && (
              <View style={{ paddingHorizontal: 16 }}>
                {[0, 1, 2].map((i) => <PostSkeleton key={i} />)}
              </View>
            )}

            {!loading && products.length === 0 && (
              <View style={st.emptyWrap}>
                <Text style={{ fontSize: 48 }}>🛒</Text>
                <Text style={[st.emptyTitle, { color: colors.text }]}>No products found</Text>
                <Text style={[st.emptyText, { color: colors.textMuted }]}>
                  {debouncedSearch ? "Try a different search term." : "Products from verified organizations will appear here."}
                </Text>
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={Colors.brand} style={{ margin: 20 }} />
          ) : !hasMore && products.length > 0 ? (
            <Text style={[st.endText, { color: colors.textMuted }]}>You've seen everything ✨</Text>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      />

      {/* ── Seller action bar for non-org users ── */}
      {!isOrg && user && (
        <TouchableOpacity
          style={[st.sellerBar, { backgroundColor: Colors.brand + "12", borderTopColor: Colors.brand + "30" }]}
          onPress={() => router.push("/shop/apply")}
          activeOpacity={0.85}
        >
          <View style={[st.sellerBarIcon, { backgroundColor: Colors.brand + "20" }]}>
            <Ionicons name="storefront-outline" size={18} color={Colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.sellerBarTitle, { color: Colors.brand }]}>Want to sell on AfuMarket?</Text>
            <Text style={[st.sellerBarSub, { color: colors.textMuted }]}>Submit your business details to get verified</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.brand} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  manageBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cartBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  catScroll: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  catChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  hero: {
    margin: 16,
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  heroContent: { flex: 1 },
  heroTag: { fontSize: 11, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.8)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 28, marginBottom: 6 },
  heroSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.85)", marginBottom: 12 },
  heroFeatures: { flexDirection: "row", gap: 6 },
  heroFeaturePill: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  heroFeatureText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  heroIllustration: { paddingLeft: 8 },
  section: { marginBottom: 8 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sectionLink: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  productCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  storeChip: {
    width: 160,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  storeChipInfo: { flex: 1 },
  storeChipName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  storeChipCategory: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  productCard: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  imgWrap: { width: "100%", position: "relative" },
  productImg: { width: "100%", height: "100%" },
  imgPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  stockBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(255,59,48,0.9)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stockBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" },
  hotBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hotBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" },
  productInfo: { padding: 10 },
  productName: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18, marginBottom: 4 },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  orgDot: { width: 7, height: 7, borderRadius: 3.5 },
  storeName: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  priceText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  salesText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  emptyWrap: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  endText: { textAlign: "center", fontSize: 13, fontFamily: "Inter_400Regular", padding: 20 },
  sellerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  sellerBarIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sellerBarTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  sellerBarSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
});
