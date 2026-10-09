import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image as RNImage,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { safeRouter } from "@/lib/navUtils";
import { supabase } from "@/lib/supabase";
import { formatShopAcoin, addToCart, getOrCreateCart } from "@/lib/shop";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import { MarketplaceCardSkeleton } from "@/components/ui/Skeleton";

const CATEGORIES = [
  "All", "Electronics", "Fashion", "Food & Drink", "Beauty",
  "Home & Garden", "Sports", "Books", "Art & Crafts", "Services",
  "Digital Goods", "Other",
];

const CAT_ICONS: Record<string, string> = {
  "All": "grid-outline",
  "Electronics": "hardware-chip-outline",
  "Fashion": "shirt-outline",
  "Food & Drink": "fast-food-outline",
  "Beauty": "flower-outline",
  "Home & Garden": "home-outline",
  "Sports": "football-outline",
  "Books": "book-outline",
  "Art & Crafts": "color-palette-outline",
  "Services": "briefcase-outline",
  "Digital Goods": "cloud-download-outline",
  "Other": "ellipsis-horizontal-outline",
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
  shop_id: string;
  seller_id: string;
  shops: {
    id: string;
    name: string;
    logo_url: string | null;
    rating: number;
    total_sales: number;
    category: string | null;
    profiles: {
      display_name: string;
      handle: string;
      avatar_url: string | null;
      is_verified: boolean;
      is_organization_verified: boolean;
    } | null;
  } | null;
};

type Shop = {
  id: string;
  name: string;
  logo_url: string | null;
  category: string | null;
  rating: number;
  total_sales: number;
  seller_id: string;
  profiles: {
    display_name: string;
    handle: string;
    avatar_url: string | null;
    is_organization_verified: boolean;
  } | null;
};

type Screen = "browse" | "product" | "apply-seller";

const PAGE = 20;

export default function AfuMarketApp({ initialScreen }: { initialScreen?: Screen }) {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [screen, setScreen] = useState<Screen>("browse");
  const [selected, setSelected] = useState<Product | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const [addingId, setAddingId] = useState<string | null>(null);

  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [debSearch, setDebSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [userShop, setUserShop] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [sellerName, setSellerName] = useState("");
  const [sellerDesc, setSellerDesc] = useState("");
  const [sellerCat, setSellerCat] = useState(CATEGORIES[0]);
  const [sellerSaving, setSellerSaving] = useState(false);

  useEffect(() => {
    if (initialScreen) setScreen(initialScreen);
  }, [initialScreen]);

  const CARD_W = Math.floor((width - 16 * 2 - 12) / 2);

  function onSearchChange(t: string) {
    setSearch(t);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebSearch(t), 350);
  }

  const loadProducts = useCallback(async (offset = 0, isRefresh = false) => {
    if (offset === 0) isRefresh ? setRefreshing(true) : setLoading(true);
    else setLoadingMore(true);
    if (offset === 0) setProductsError(null);
    try {
      let q = supabase
        .from("shop_products")
        .select("id, name, description, price_acoin, images, category, stock, is_unlimited_stock, is_available, sales_count, shop_id, seller_id")
        .eq("is_available", true)
        .order("sales_count", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (cat !== "All") q = q.eq("category", cat);
      if (debSearch.trim()) q = q.ilike("name", `%${debSearch.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      const baseRows = (data ?? []) as unknown as Omit<Product, "shops">[];
      const shopIds = [...new Set(baseRows.map((product) => product.shop_id).filter(Boolean))];
      const { data: shopRows, error: shopError } = shopIds.length
        ? await supabase.from("shops")
          .select("id,name,logo_url,category,rating,total_sales,seller_id,profiles!shops_seller_id_fkey(display_name,handle,avatar_url,is_verified,is_organization_verified)")
          .in("id", shopIds)
        : { data: [], error: null };
      if (shopError) throw shopError;
      const shopsById = new Map((shopRows ?? []).map((shop) => [shop.id, shop]));
      const rows = baseRows.map((product) => ({
        ...product,
        shops: shopsById.get(product.shop_id) ?? null,
      })) as Product[];
      if (offset === 0) setProducts(rows);
      else setProducts((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load AfuMarket products.";
      setProductsError(message);
      if (offset === 0) setProducts([]);
      else showAlert("More products unavailable", message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [cat, debSearch]);

  const loadStores = useCallback(async () => {
    const { data } = await supabase
      .from("shops")
      .select("id, name, logo_url, category, rating, total_sales, seller_id, profiles!shops_seller_id_fkey(display_name, handle, avatar_url, is_organization_verified)")
      .eq("is_active", true)
      .order("total_sales", { ascending: false })
      .limit(10);
    setStores((data || []) as unknown as Shop[]);
  }, []);

  const loadCart = useCallback(async () => {
    if (!user) return;
    try {
      const items = await getOrCreateCart(user.id);
      setCartCount(items.reduce((s, i) => s + i.quantity, 0));
    } catch (_) {}
  }, [user]);

  useEffect(() => {
    loadProducts(0);
    loadStores();
    loadCart();
    if (user) {
      supabase
        .from("shops")
        .select("id, name")
        .eq("seller_id", user.id)
        .maybeSingle()
        .then(({ data }) => setUserShop(data as { id: string; name: string } | null ?? null));
    } else {
      setUserShop(null);
    }
  }, [loadProducts, loadStores, loadCart, user]);

  const onRefresh = useCallback(() => {
    loadProducts(0, true);
    loadStores();
    loadCart();
  }, [loadProducts, loadStores, loadCart]);

  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore) loadProducts(products.length);
  }, [loadingMore, hasMore, products.length, loadProducts]);

  async function handleAddToCart(product: Product) {
    if (!user) { showAlert("Sign In", "Please sign in to add items to your cart."); return; }
    setAddingId(product.id);
    try {
      await addToCart(user.id, product.id, 1);
      setCartCount((c) => c + 1);
      showAlert("Added to Cart", `${product.name} has been added to your cart.`);
    } catch (_) {
      showAlert("Error", "Could not add to cart. Please try again.");
    } finally {
      setAddingId(null);
    }
  }

  async function createSellerShop() {
    if (!user) { showAlert("Sign In", "Please sign in to become a seller."); return; }
    if (!sellerName.trim()) { showAlert("Required", "Please enter your shop name."); return; }
    setSellerSaving(true);
    const { data, error } = await supabase.from("shops").insert({
      seller_id: user.id,
      name: sellerName.trim(),
      description: sellerDesc.trim() || null,
      category: sellerCat,
      is_active: true,
      rating: 0,
      total_sales: 0,
    }).select("id, name").single();
    setSellerSaving(false);
    if (error) { showAlert("Error", error.message); return; }
    setUserShop(data as { id: string; name: string });
    setScreen("browse");
    showAlert("Welcome, Seller!", `Your shop "${sellerName.trim()}" is now live on AfuMarket!`);
  }

  if (screen === "apply-seller") {
    return (
      <View style={[s.root, { backgroundColor: "#0a0a0a" }]}>
        <View style={[s.topBar, { borderBottomColor: "rgba(255,255,255,0.08)", borderBottomWidth: 0.5 }]}>
          <Pressable onPress={() => setScreen("browse")} hitSlop={12} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={[s.topTitle, { color: "#fff" }]}>Become a Seller</Text>
          <View style={{ width: 30 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={[accent, accent + "88"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: 20, gap: 8, alignItems: "center" }}>
            <Ionicons name="storefront" size={40} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" }}>Open Your Store</Text>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" }}>
              Reach thousands of AfuChat users. List your products and get paid via AfuPay escrow.
            </Text>
          </LinearGradient>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[
              { icon: "shield-checkmark", label: "Secure Payments", desc: "AfuPay escrow protection" },
              { icon: "people", label: "Huge Audience", desc: "Reach real buyers" },
              { icon: "trending-up", label: "Analytics", desc: "Track your sales" },
            ].map((f) => (
              <View key={f.label} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 12, gap: 4, alignItems: "center" }}>
                <Ionicons name={f.icon as any} size={20} color={accent} />
                <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" }}>{f.label}</Text>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" }}>{f.desc}</Text>
              </View>
            ))}
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_500Medium" }}>Shop Name *</Text>
            <TextInput
              style={{ backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.12)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: "#fff" }}
              value={sellerName} onChangeText={setSellerName} placeholder="e.g. Tech Hub Store" placeholderTextColor="rgba(255,255,255,0.3)"
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_500Medium" }}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setSellerCat(c)} style={{ borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: sellerCat === c ? accent : "rgba(255,255,255,0.07)", borderWidth: sellerCat === c ? 0 : 0.5, borderColor: "rgba(255,255,255,0.15)" }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: sellerCat === c ? "#fff" : "rgba(255,255,255,0.6)" }}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_500Medium" }}>About your shop (optional)</Text>
            <TextInput
              style={{ backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.12)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: "#fff", height: 90, textAlignVertical: "top" }}
              value={sellerDesc} onChangeText={setSellerDesc} placeholder="What do you sell?" placeholderTextColor="rgba(255,255,255,0.3)" multiline
            />
          </View>
          <Pressable onPress={createSellerShop} disabled={sellerSaving} style={{ backgroundColor: accent, borderRadius: 14, paddingVertical: 15, alignItems: "center", opacity: sellerSaving ? 0.7 : 1 }}>
            {sellerSaving ? <ActivityIndicator size="small" color="#fff" /> : (
              <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Launch My Store</Text>
            )}
          </Pressable>
          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" }}>
            By creating a store you agree to our seller terms. Funds are held in AfuPay escrow until delivery is confirmed.
          </Text>
        </ScrollView>
      </View>
    );
  }

  if (screen === "product" && selected) {
    return (
      <ProductDetail
        product={selected}
        colors={colors}
        accent={accent}
        insets={insets}
        onBack={() => setScreen("browse")}
        onAddToCart={handleAddToCart}
        addingId={addingId}
      />
    );
  }

  const header = (
    <>
      {/* Top bar */}
       <View style={[s.topBar, { borderBottomColor: colors.border, paddingTop: insets.top + 14 }]}>
         <Pressable onPress={() => safeRouter.back("/apps")} hitSlop={10} style={{ width: 34, height: 40, alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="Go back">
           <Ionicons name="arrow-back" size={22} color={colors.text} />
         </Pressable>
         <View style={{ flex: 1 }}>
          <Text style={[s.topTitle, { color: colors.text }]}>AfuMarket</Text>
          <Text style={[s.topSub, { color: colors.textMuted }]}>Shop from verified stores</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
             onPress={() => safeRouter.replace("/app/afumarket?section=orders" as any)}
            style={[s.cartBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="receipt-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          {cartCount > 0 && (
            <View style={[s.cartBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="bag-outline" size={20} color={colors.text} />
              <View style={[s.cartBadge, { backgroundColor: accent }]}>
                <Text style={s.cartBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Search */}
      <View style={[s.searchWrap, { backgroundColor: colors.backgroundSecondary }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={[s.searchInput, { color: colors.text }]}
          placeholder="Search products…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={onSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => { setSearch(""); setDebSearch(""); }}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.catRow}
      >
        {CATEGORIES.map((c) => (
          <Pressable
            key={c}
            onPress={() => setCat(c)}
            style={[
              s.catChip,
              cat === c
                ? { backgroundColor: accent }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
          >
            <Ionicons
              name={(CAT_ICONS[c] || "grid-outline") as any}
              size={13}
              color={cat === c ? "#fff" : colors.textSecondary}
            />
            <Text style={[s.catLabel, { color: cat === c ? "#fff" : colors.textSecondary }]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Featured stores */}
      {stores.length > 0 && cat === "All" && !debSearch && (
        <View style={s.storesSection}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Featured Stores</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storesRow}>
            {stores.map((store) => (
              <View key={store.id} style={[s.storeChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Avatar uri={store.logo_url || store.profiles?.avatar_url} name={store.name} size={38} square />
                <View style={s.storeChipInfo}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Text style={[s.storeName, { color: colors.text }]} numberOfLines={1}>{store.name}</Text>
                    {store.profiles?.is_organization_verified && (
                      <Ionicons name="checkmark-circle" size={12} color={accent} />
                    )}
                  </View>
                  <Text style={[s.storeCat, { color: colors.textMuted }]} numberOfLines={1}>
                    {store.category || "General"}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Become a Seller CTA */}
      {userShop === null && (
        <Pressable
          onPress={() => setScreen("apply-seller")}
          style={[s.sellerCTA, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <LinearGradient colors={[accent + "22", accent + "08"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.sellerCTAGrad}>
            <View style={[s.sellerCTAIcon, { backgroundColor: accent + "22" }]}>
              <Ionicons name="storefront" size={20} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sellerCTATitle, { color: colors.text }]}>Sell on AfuMarket</Text>
              <Text style={[s.sellerCTASub, { color: colors.textMuted }]}>Open your store and reach thousands of buyers</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </LinearGradient>
        </Pressable>
      )}
      {userShop && (
        <View style={[s.sellerCTA, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <LinearGradient colors={["#34C75922", "#34C75908"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.sellerCTAGrad}>
            <View style={[s.sellerCTAIcon, { backgroundColor: "#34C75922" }]}>
              <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sellerCTATitle, { color: colors.text }]}>{userShop.name}</Text>
              <Text style={[s.sellerCTASub, { color: "#34C759" }]}>Your store is live on AfuMarket</Text>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* Products heading */}
      <View style={s.productsHeading}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>
          {debSearch ? `Results for "${debSearch}"` : cat === "All" ? "All Products" : cat}
        </Text>
        {products.length > 0 && (
          <Text style={[s.productCount, { color: colors.textMuted }]}>{products.length}+</Text>
        )}
      </View>
    </>
  );

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        columnWrapperStyle={s.columnWrapper}
        contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 24 }]}
        renderItem={({ item }) => (
          <ProductCard
            item={item}
            cardW={CARD_W}
            accent={accent}
            colors={colors}
            onPress={() => { setSelected(item); setScreen("product"); }}
            onCart={() => handleAddToCart(item)}
            addingId={addingId}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 4 }}>
              {[1,2,3,4,5,6].map(i => <MarketplaceCardSkeleton key={i} />)}
            </View>
          ) : (
            <View style={s.center}>
              <Ionicons name="storefront-outline" size={52} color={colors.textMuted} />
              <Text style={[s.emptyTitle, { color: colors.text }]}>{productsError ? "Products could not be loaded" : "No products found"}</Text>
              <Text style={[s.emptyText, { color: colors.textMuted }]}>
                {productsError || (debSearch ? "Try a different search term" : "Check back soon")}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 4 }}>
              {[1,2].map(i => <MarketplaceCardSkeleton key={i} />)}
            </View>
          ) : null
        }
      />
    </View>
  );
}

function ProductCard({
  item, cardW, accent, colors, onPress, onCart, addingId,
}: {
  item: Product;
  cardW: number;
  accent: string;
  colors: any;
  onPress: () => void;
  onCart: () => void;
  addingId: string | null;
}) {
  const img = item.images?.[0];
  const imgH = Math.floor(cardW * 1.05);
  const isAdding = addingId === item.id;
  const isLowStock = !item.is_unlimited_stock && item.stock > 0 && item.stock < 5;
  const isHot = item.sales_count > 20;

  return (
    <TouchableOpacity
      style={[s.card, { width: cardW, backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={[s.cardImgWrap, { height: imgH }]}>
        {img ? (
          <Image source={{ uri: img }} style={s.cardImg} resizeMode="cover" />
        ) : (
          <View style={[s.cardImgPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="image-outline" size={30} color={colors.textMuted} />
          </View>
        )}
        {isHot && (
          <View style={s.hotBadge}>
            <Text style={s.hotBadgeText}>🔥 Hot</Text>
          </View>
        )}
        {isLowStock && (
          <View style={[s.stockBadge, { backgroundColor: "#FF9500" }]}>
            <Text style={s.stockBadgeText}>Only {item.stock} left</Text>
          </View>
        )}
        {!item.is_unlimited_stock && item.stock === 0 && (
          <View style={[s.stockBadge, { backgroundColor: "#FF3B30" }]}>
            <Text style={s.stockBadgeText}>Out of stock</Text>
          </View>
        )}
      </View>

      <View style={s.cardBody}>
        <Text style={[s.cardName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
        {item.shops && (
          <View style={s.shopRow}>
            <View style={[s.shopDot, { backgroundColor: item.shops.profiles?.is_organization_verified ? accent : colors.backgroundSecondary }]} />
            <Text style={[s.shopName, { color: colors.textMuted }]} numberOfLines={1}>
              {item.shops.name || item.shops.profiles?.display_name || "Store"}
            </Text>
          </View>
        )}
        <View style={s.priceRow}>
          <Text style={[s.priceText, { color: accent }]}>{formatShopAcoin(item.price_acoin)}</Text>
          {item.sales_count > 0 && (
            <Text style={[s.salesText, { color: colors.textMuted }]}>{item.sales_count} sold</Text>
          )}
        </View>

        <TouchableOpacity
          style={[s.cartBtn2, { backgroundColor: item.stock === 0 && !item.is_unlimited_stock ? colors.backgroundSecondary : accent }]}
          onPress={onCart}
          disabled={isAdding || (!item.is_unlimited_stock && item.stock === 0)}
          activeOpacity={0.8}
        >
          {isAdding ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="bag-add-outline" size={13} color="#fff" />
              <Text style={s.cartBtn2Text}>Add</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function ProductDetail({
  product, colors, accent, insets, onBack, onAddToCart, addingId,
}: {
  product: Product;
  colors: any;
  accent: string;
  insets: any;
  onBack: () => void;
  onAddToCart: (p: Product) => void;
  addingId: string | null;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const isAdding = addingId === product.id;
  const outOfStock = !product.is_unlimited_stock && product.stock === 0;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* Image gallery */}
        <View style={[s.detailImgWrap, { backgroundColor: colors.backgroundSecondary }]}>
          {product.images?.length > 0 ? (
            <Image source={{ uri: product.images[imgIdx] }} style={s.detailImg} resizeMode="cover" />
          ) : (
            <View style={[s.detailImgPlaceholder]}>
              <Ionicons name="image-outline" size={64} color={colors.textMuted} />
            </View>
          )}

          {/* Back button */}
          <Pressable style={[s.detailBack, { backgroundColor: colors.surface }]} onPress={onBack}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </Pressable>

          {/* Image thumbnails */}
          {product.images?.length > 1 && (
            <View style={s.thumbRow}>
              {product.images.slice(0, 5).map((uri, i) => (
                <Pressable key={i} onPress={() => setImgIdx(i)} style={[s.thumb, imgIdx === i && { borderColor: accent, borderWidth: 2 }]}>
                  <Image source={{ uri }} style={s.thumbImg} resizeMode="cover" />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={s.detailContent}>
          {/* Name + price */}
          <Text style={[s.detailName, { color: colors.text }]}>{product.name}</Text>
          <View style={s.detailPriceRow}>
            <Text style={[s.detailPrice, { color: accent }]}>{formatShopAcoin(product.price_acoin)}</Text>
            {product.sales_count > 0 && (
              <View style={[s.soldBadge, { backgroundColor: colors.backgroundSecondary }]}>
                <Text style={[s.soldText, { color: colors.textMuted }]}>{product.sales_count} sold</Text>
              </View>
            )}
          </View>

          {/* Stock */}
          {!product.is_unlimited_stock && (
            <View style={[s.stockRow, { backgroundColor: outOfStock ? "#FF3B3015" : "#34C75915" }]}>
              <Ionicons
                name={outOfStock ? "close-circle-outline" : "checkmark-circle-outline"}
                size={14}
                color={outOfStock ? "#FF3B30" : "#34C759"}
              />
              <Text style={[s.stockText, { color: outOfStock ? "#FF3B30" : "#34C759" }]}>
                {outOfStock ? "Out of stock" : `${product.stock} in stock`}
              </Text>
            </View>
          )}

          {/* Shop */}
          {product.shops && (
            <View style={[s.shopCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Avatar
                uri={product.shops.logo_url || product.shops.profiles?.avatar_url}
                name={product.shops.name}
                size={40}
                square
              />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Text style={[s.shopCardName, { color: colors.text }]} numberOfLines={1}>{product.shops.name}</Text>
                  {product.shops.profiles?.is_organization_verified && (
                    <Ionicons name="checkmark-circle" size={14} color={accent} />
                  )}
                </View>
                <Text style={[s.shopCardSub, { color: colors.textMuted }]}>
                  {product.shops.category || "General"} · ⭐ {product.shops.rating?.toFixed(1) || "New"} · {product.shops.total_sales} sales
                </Text>
              </View>
            </View>
          )}

          {/* Category */}
          <View style={[s.categoryTag, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name={(CAT_ICONS[product.category] || "grid-outline") as any} size={13} color={colors.textSecondary} />
            <Text style={[s.categoryText, { color: colors.textSecondary }]}>{product.category}</Text>
          </View>

          {/* Description */}
          {product.description ? (
            <View style={s.descSection}>
              <Text style={[s.descTitle, { color: colors.text }]}>Description</Text>
              <Text style={[s.descText, { color: colors.textSecondary }]}>{product.description}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Add to cart CTA */}
      <View style={[s.detailCTA, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        <View>
          <Text style={[s.ctaPrice, { color: accent }]}>{formatShopAcoin(product.price_acoin)}</Text>
          {!product.is_unlimited_stock && product.stock > 0 && product.stock < 5 && (
            <Text style={[s.ctaStock, { color: "#FF9500" }]}>Only {product.stock} left!</Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.ctaBtn, { backgroundColor: outOfStock ? colors.backgroundSecondary : accent }]}
          onPress={() => !outOfStock && onAddToCart(product)}
          disabled={isAdding || outOfStock}
          activeOpacity={0.85}
        >
          {isAdding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="bag-add-outline" size={18} color="#fff" />
              <Text style={s.ctaBtnText}>{outOfStock ? "Out of Stock" : "Add to Cart"}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    
  },
  topTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  topSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  cartBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, position: "relative",
  },
  cartBadge: {
    position: "absolute", top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
  },
  cartBadgeText: { fontSize: 10, color: "#fff", fontFamily: "Inter_700Bold" },
  searchWrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginVertical: 10,
    borderRadius: 12, paddingHorizontal: 12, height: 40, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  catRow: { paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  catLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  storesSection: { marginBottom: 4 },
  storesRow: { paddingHorizontal: 14, paddingBottom: 10, gap: 10 },
  storeChip: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 12, padding: 8, gap: 8,
    borderWidth: 0.5,
    width: 160,
  },
  storeChipInfo: { flex: 1 },
  storeName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  storeCat: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", paddingHorizontal: 16 },
  productsHeading: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, marginBottom: 10, marginTop: 2,
  },
  productCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  columnWrapper: { paddingHorizontal: 16, justifyContent: "space-between" },
  listContent: { paddingTop: 0 },
  // Product card
  card: { borderRadius: 14, overflow: "hidden", marginBottom: 12 },
  cardImgWrap: { position: "relative" },
  cardImg: { width: "100%", height: "100%" },
  cardImgPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  hotBadge: {
    position: "absolute", top: 8, left: 8,
    backgroundColor: "#FF3B30", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  hotBadgeText: { fontSize: 10, color: "#fff", fontFamily: "Inter_600SemiBold" },
  stockBadge: {
    position: "absolute", bottom: 8, left: 8,
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  stockBadgeText: { fontSize: 10, color: "#fff", fontFamily: "Inter_600SemiBold" },
  cardBody: { padding: 10, gap: 3 },
  cardName: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 17 },
  shopRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  shopDot: { width: 6, height: 6, borderRadius: 3 },
  shopName: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  priceText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  salesText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  cartBtn2: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, marginTop: 6, height: 30, borderRadius: 8,
  },
  cartBtn2Text: { fontSize: 12, color: "#fff", fontFamily: "Inter_600SemiBold" },
  // Empty / loading
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  footerLoader: { paddingVertical: 20, alignItems: "center" },
  // Product detail
  detailImgWrap: { height: 300, position: "relative" },
  detailImg: { width: "100%", height: "100%" },
  detailImgPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  detailBack: {
    position: "absolute", top: 16, left: 16,
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    ...Platform.select({
      web: { boxShadow: "0 2px 4px rgba(0,0,0,0.15)" } as any,
      default: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, elevation: 4 },
    }),
  },
  thumbRow: {
    position: "absolute", bottom: 12, left: 0, right: 0,
    flexDirection: "row", justifyContent: "center", gap: 6,
  },
  thumb: { width: 44, height: 44, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "transparent" },
  thumbImg: { width: "100%", height: "100%" },
  detailContent: { padding: 16, gap: 12 },
  detailName: { fontSize: 20, fontFamily: "Inter_700Bold", lineHeight: 26 },
  detailPriceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailPrice: { fontSize: 22, fontFamily: "Inter_700Bold" },
  soldBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  soldText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10 },
  stockText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  shopCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: 14, borderWidth: 0.5,
  },
  shopCardName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  shopCardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  categoryTag: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  categoryText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  descSection: { gap: 6 },
  descTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  descText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  detailCTA: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 14,
    
  },
  ctaPrice: { fontSize: 18, fontFamily: "Inter_700Bold" },
  ctaStock: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14,
  },
  ctaBtnText: { fontSize: 15, color: "#fff", fontFamily: "Inter_700Bold" },
  sellerCTA: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, borderWidth: 0.5, overflow: "hidden",
  },
  sellerCTAGrad: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  sellerCTAIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  sellerCTATitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sellerCTASub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
