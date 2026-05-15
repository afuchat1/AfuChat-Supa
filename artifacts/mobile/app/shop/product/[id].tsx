import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { ShopProduct, Shop, addToCart, getOrCreateCart, placeOrder, formatShopAcoin, PLATFORM_FEE_PCT } from "@/lib/shop";
import Colors from "@/constants/colors";
import { MarketplaceCardSkeleton } from "@/components/ui/Skeleton";
import { showAlert } from "@/lib/alert";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";

type ProductFull = ShopProduct & {
  shops: Shop & {
    profiles: {
      id: string;
      display_name: string;
      handle: string;
      avatar_url: string | null;
      is_verified: boolean;
      is_organization_verified: boolean;
    };
  };
};

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [product, setProduct] = useState<ProductFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgIndex, setImgIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [addingCart, setAddingCart] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [showCheckout, setShowCheckout] = useState(false);
  const [buying, setBuying] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [orderDone, setOrderDone] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const imgH = width * 0.78;
  const balance = profile?.acoin ?? 0;

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("shop_products")
      .select("*, shops!shop_products_shop_id_fkey(*, profiles!shops_seller_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified))")
      .eq("id", id).single();
    setProduct(data as ProductFull);
    setLoading(false);
  }, [id]);

  const loadCart = useCallback(async () => {
    if (!user) return;
    const items = await getOrCreateCart(user.id);
    setCartCount(items.reduce((s, i) => s + i.quantity, 0));
  }, [user]);

  useEffect(() => { load(); loadCart(); }, [load, loadCart]);

  const images = product ? (product.images?.length > 0 ? product.images : []) : [];
  const shop = product?.shops;
  const seller = shop?.profiles;

  const subtotal = (product?.price_acoin ?? 0) * qty;
  const fee = Math.ceil(subtotal * PLATFORM_FEE_PCT / 100);
  const total = subtotal + fee;
  const canAfford = balance >= total;

  async function handleAddToCart() {
    if (!user) { router.push("/(auth)/login"); return; }
    if (!product) return;
    setAddingCart(true);
    await addToCart(user.id, product.id, qty);
    setCartCount(c => c + qty);
    setAddingCart(false);
    showAlert("Added to cart", `${qty}× ${product.name} added to your cart.`);
  }

  async function handleBuyNow() {
    if (!user) { router.push("/(auth)/login"); return; }
    if (!product || !shop) return;
    if (!canAfford) {
      showAlert("Insufficient balance", `You need ${formatShopAcoin(total)} but have ${formatShopAcoin(balance)}.`);
      return;
    }
    setBuying(true);
    const result = await placeOrder({
      buyerId: user.id,
      buyerAcoin: balance,
      shopId: shop.id,
      sellerId: shop.seller_id,
      items: [{ productId: product.id, qty, unitPrice: product.price_acoin, name: product.name, image: images[0] }],
      deliveryNote: deliveryNote.trim() || undefined,
    });
    setBuying(false);
    if (result.success) {
      await refreshProfile();
      setOrderDone(result.orderId ?? null);
      setShowCheckout(false);
    } else {
      showAlert("Order failed", result.error || "Something went wrong. Please try again.");
    }
  }

  if (loading) {
    return (
      <View style={[st.loadingWrap, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={{ padding: 12, gap: 12 }}>
          {[1,2,3].map(i => <MarketplaceCardSkeleton key={i} />)}
        </View>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[st.loadingWrap, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={[st.notFoundText, { color: colors.textMuted }]}>Product not found.</Text>
        <TouchableOpacity style={[st.backBtnCenter, { backgroundColor: colors.accent }]} onPress={() => router.back()}>
          <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const inStock = product.is_unlimited_stock || product.stock > 0;
  const maxQty = product.is_unlimited_stock ? 99 : product.stock;
  const isOwnListing = !!user && !!seller && user.id === seller.id;

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* ── Back + Cart header ── */}
      <View style={[st.topBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity style={[st.topBarBtn, { backgroundColor: "rgba(0,0,0,0.35)" }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity style={[st.topBarBtn, { backgroundColor: "rgba(0,0,0,0.35)" }]} onPress={() => router.push("/shop/cart")}>
            <Ionicons name="cart-outline" size={20} color="#fff" />
            {cartCount > 0 && (
              <View style={[st.cartBadge, { backgroundColor: colors.accent }]}>
                <Text style={st.cartBadgeText}>{cartCount > 9 ? "9+" : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
        {/* ── Image carousel ── */}
        <View style={[st.imgContainer, { height: imgH }]}>
          {images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setImgIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            >
              {images.map((uri, i) => (
                <Image key={i} source={{ uri }} style={{ width, height: imgH }} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={[st.imgPlaceholder, { height: imgH, backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="image-outline" size={60} color={colors.textMuted} />
              <Text style={[{ color: colors.textMuted, marginTop: 8, fontFamily: "Inter_400Regular" }]}>No image</Text>
            </View>
          )}
          {images.length > 1 && (
            <View style={st.dotRow}>
              {images.map((_, i) => (
                <View key={i} style={[st.dot, { backgroundColor: i === imgIndex ? "#fff" : "rgba(255,255,255,0.5)", width: i === imgIndex ? 18 : 6 }]} />
              ))}
            </View>
          )}
          {!inStock && (
            <View style={st.outOfStockOverlay}>
              <Text style={st.outOfStockText}>Out of Stock</Text>
            </View>
          )}
        </View>

        {/* ── Product info ── */}
        <View style={[st.infoCard, { backgroundColor: colors.surface }]}>
          {/* Price + name */}
          <View style={st.priceRow}>
            <Text style={[st.priceMain, { color: colors.accent }]}>{formatShopAcoin(product.price_acoin)}</Text>
            <Text style={[st.priceUgx, { color: colors.textMuted }]}>≈ UGX {(product.price_acoin * 100).toLocaleString()}</Text>
          </View>
          <Text style={[st.productTitle, { color: colors.text }]}>{product.name}</Text>

          {/* Tags & category */}
          <View style={st.tagsRow}>
            <View style={[st.catTag, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "30" }]}>
              <Text style={[st.catTagText, { color: colors.accent }]}>{product.category}</Text>
            </View>
            {product.sales_count > 0 && (
              <View style={[st.catTag, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="bag-check-outline" size={11} color={colors.textMuted} />
                <Text style={[st.catTagText, { color: colors.textMuted }]}>{product.sales_count} sold</Text>
              </View>
            )}
            {!product.is_unlimited_stock && inStock && product.stock < 10 && (
              <View style={[st.catTag, { backgroundColor: "#FF3B3018", borderColor: "#FF3B3030" }]}>
                <Text style={[st.catTagText, { color: "#FF3B30" }]}>Only {product.stock} left</Text>
              </View>
            )}
          </View>

          {/* Description */}
          {product.description ? (
            <View style={st.descSection}>
              <Text style={[st.descLabel, { color: colors.textSecondary }]}>Product Details</Text>
              <Text style={[st.descText, { color: colors.text }]}>{product.description}</Text>
            </View>
          ) : null}

          {/* Qty selector */}
          <View style={[st.qtySection, { borderTopColor: colors.border }]}>
            <Text style={[st.qtyLabel, { color: colors.textSecondary }]}>Quantity</Text>
            <View style={st.qtyRow}>
              <TouchableOpacity
                style={[st.qtyBtn, { backgroundColor: colors.backgroundSecondary, opacity: qty <= 1 ? 0.4 : 1 }]}
                onPress={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1}
              >
                <Ionicons name="remove" size={18} color={colors.text} />
              </TouchableOpacity>
              <Text style={[st.qtyNum, { color: colors.text }]}>{qty}</Text>
              <TouchableOpacity
                style={[st.qtyBtn, { backgroundColor: colors.backgroundSecondary, opacity: qty >= maxQty ? 0.4 : 1 }]}
                onPress={() => setQty(q => Math.min(maxQty, q + 1))} disabled={qty >= maxQty}
              >
                <Ionicons name="add" size={18} color={colors.text} />
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <Text style={[st.subtotalText, { color: colors.text }]}>
                Subtotal: <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold" }}>{formatShopAcoin(product.price_acoin * qty)}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* ── Store section ── */}
        {shop && seller && (
          <View style={[st.storeCard, { backgroundColor: colors.surface }]}>
            <Text style={[st.storeCardTitle, { color: colors.textSecondary }]}>Sold by</Text>
            <TouchableOpacity
              style={st.storeRow}
              onPress={() => router.push({ pathname: "/shop/[userId]", params: { userId: shop.seller_id } })}
              activeOpacity={0.8}
            >
              <Avatar uri={seller.avatar_url} name={seller.display_name} size={48} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Text style={[st.storeName, { color: colors.text }]}>{shop.name}</Text>
                  {seller.is_organization_verified && (
                    <View style={[st.orgBadge, { backgroundColor: colors.accent + "18" }]}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.accent} />
                      <Text style={[st.orgBadgeText, { color: colors.accent }]}>Verified Org</Text>
                    </View>
                  )}
                </View>
                <Text style={[st.storeHandle, { color: colors.textMuted }]}>@{seller.handle}</Text>
                {shop.rating > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                    {[1,2,3,4,5].map(s => (
                      <Ionicons key={s} name={s <= Math.round(shop.rating) ? "star" : "star-outline"} size={12} color="#FF9500" />
                    ))}
                    <Text style={[st.ratingText, { color: colors.textMuted }]}>{shop.rating.toFixed(1)} · {shop.total_sales} sales</Text>
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Checkout guarantee ── */}
        <View style={[st.guaranteeCard, { backgroundColor: colors.surface }]}>
          {[
            { icon: "shield-checkmark", label: "Buyer Protection", desc: "Full refund if order doesn't arrive" },
            { icon: "wallet-outline", label: "ACoins Wallet", desc: "Secure, instant payment from your wallet" },
            { icon: "refresh-outline", label: "Easy Returns", desc: "Hassle-free return process" },
          ].map((g) => (
            <View key={g.label} style={st.guaranteeRow}>
              <View style={[st.guaranteeIcon, { backgroundColor: colors.accent + "18" }]}>
                <Ionicons name={g.icon as any} size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.guaranteeLabel, { color: colors.text }]}>{g.label}</Text>
                <Text style={[st.guaranteeDesc, { color: colors.textMuted }]}>{g.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Sticky CTA buttons ── */}
      {isOwnListing ? (
        <View style={[st.ctaBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 8, justifyContent: "center", alignItems: "center", gap: 6 }]}>
          <Ionicons name="storefront-outline" size={20} color={colors.textMuted} />
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textMuted }}>This is your listing</Text>
          <TouchableOpacity onPress={() => router.push("/shop/manage" as any)}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: colors.accent }}>Go to Store Manager</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[st.ctaBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity
            style={[st.cartCta, { backgroundColor: colors.surface, borderColor: colors.accent, opacity: !inStock || addingCart ? 0.5 : 1 }]}
            onPress={handleAddToCart}
            disabled={!inStock || addingCart}
          >
            {addingCart ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <>
                <Ionicons name="cart-outline" size={18} color={colors.accent} />
                <Text style={[st.cartCtaText, { color: colors.accent }]}>Add to Cart</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.buyCta, { opacity: !inStock ? 0.5 : 1 }]}
            onPress={() => {
              if (!user) { router.push("/(auth)/login"); return; }
              setShowCheckout(true);
            }}
            disabled={!inStock}
          >
            <LinearGradient colors={["#00BCD4", "#0097A7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.buyCTAGradient}>
              <Ionicons name="flash" size={18} color="#fff" />
              <Text style={st.buyCtaText}>Buy Now</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Order success modal ── */}
      <Modal visible={!!orderDone} transparent animationType="fade">
        <View style={st.successOverlay}>
          <View style={[st.successCard, { backgroundColor: colors.surface }]}>
            <View style={[st.successIcon, { backgroundColor: "#34C75920" }]}>
              <Ionicons name="checkmark-circle" size={56} color="#34C759" />
            </View>
            <Text style={[st.successTitle, { color: colors.text }]}>Order Placed!</Text>
            <Text style={[st.successSub, { color: colors.textMuted }]}>Your order has been placed successfully. The store will process it shortly.</Text>
            <TouchableOpacity style={[st.successBtn, { backgroundColor: colors.accent }]} onPress={() => { setOrderDone(null); router.back(); }}>
              <Text style={st.successBtnText}>Continue Shopping</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Checkout modal ── */}
      <Modal visible={showCheckout} transparent animationType="slide">
        <View style={st.checkoutOverlay}>
          <View style={[st.checkoutCard, { backgroundColor: colors.background }]}>
            {/* Handle */}
            <View style={[st.sheetHandle, { backgroundColor: colors.border }]} />

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[st.checkoutTitle, { color: colors.text }]}>Confirm Order</Text>

              {/* Product summary */}
              <View style={[st.checkoutProduct, { backgroundColor: colors.surface }]}>
                {images[0] && (
                  <Image source={{ uri: images[0] }} style={st.checkoutProductImg} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[st.checkoutProductName, { color: colors.text }]} numberOfLines={2}>{product.name}</Text>
                  <Text style={[st.checkoutProductShop, { color: colors.textMuted }]}>{shop?.name}</Text>
                  <Text style={[st.checkoutProductQty, { color: colors.textSecondary }]}>Qty: {qty}</Text>
                </View>
              </View>

              {/* Fee breakdown */}
              <View style={[st.feeCard, { backgroundColor: colors.surface }]}>
                <Text style={[st.feeTitle, { color: colors.textSecondary }]}>Order Summary</Text>
                <View style={st.feeRow}>
                  <Text style={[st.feeLabel, { color: colors.textMuted }]}>Subtotal ({qty} item{qty > 1 ? "s" : ""})</Text>
                  <Text style={[st.feeValue, { color: colors.text }]}>{formatShopAcoin(subtotal)}</Text>
                </View>
                <View style={st.feeRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={[st.feeLabel, { color: colors.textMuted }]}>Platform fee ({PLATFORM_FEE_PCT}%)</Text>
                    <View style={[st.feeBadge, { backgroundColor: colors.accent + "18" }]}>
                      <Text style={[st.feeBadgeText, { color: colors.accent }]}>AfuMarket</Text>
                    </View>
                  </View>
                  <Text style={[st.feeValue, { color: colors.text }]}>{formatShopAcoin(fee)}</Text>
                </View>
                <View style={[st.feeDivider, { backgroundColor: colors.border }]} />
                <View style={st.feeRow}>
                  <Text style={[st.feeTotalLabel, { color: colors.text }]}>Total</Text>
                  <Text style={[st.feeTotalValue, { color: colors.accent }]}>{formatShopAcoin(total)}</Text>
                </View>
              </View>

              {/* Wallet balance */}
              <View style={[st.walletRow, { backgroundColor: canAfford ? "#34C75910" : "#FF3B3010", borderColor: canAfford ? "#34C75930" : "#FF3B3030" }]}>
                <Ionicons name="wallet-outline" size={18} color={canAfford ? "#34C759" : "#FF3B30"} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.walletLabel, { color: canAfford ? "#34C759" : "#FF3B30" }]}>
                    {canAfford ? "Sufficient balance" : "Insufficient balance"}
                  </Text>
                  <Text style={[st.walletBalance, { color: colors.textMuted }]}>Wallet: {formatShopAcoin(balance)}</Text>
                </View>
                {!canAfford && (
                  <TouchableOpacity onPress={() => { setShowCheckout(false); router.push("/wallet"); }}>
                    <Text style={[st.topUpText, { color: colors.accent }]}>Top Up</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Delivery note */}
              <View style={[st.noteWrap, { borderColor: colors.border }]}>
                <Text style={[st.noteLabel, { color: colors.textSecondary }]}>Order note (optional)</Text>
                <TextInput
                  style={[st.noteInput, { color: colors.text, backgroundColor: colors.inputBg }]}
                  placeholder="Special instructions, delivery address..."
                  placeholderTextColor={colors.textMuted}
                  value={deliveryNote}
                  onChangeText={setDeliveryNote}
                  multiline
                  maxLength={300}
                />
              </View>

              {/* Security note */}
              <View style={st.secureNote}>
                <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} />
                <Text style={[st.secureNoteText, { color: colors.textMuted }]}>
                  Payment is processed securely via AfuChat Wallet. Funds are held in escrow until order is confirmed.
                </Text>
              </View>
            </ScrollView>

            {/* Action buttons */}
            <View style={[st.checkoutActions, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[st.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowCheckout(false)}>
                <Text style={[st.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.confirmBtn, { opacity: !canAfford || buying ? 0.5 : 1 }]}
                onPress={handleBuyNow}
                disabled={!canAfford || buying}
              >
                <LinearGradient colors={["#00BCD4", "#0097A7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.confirmBtnGradient}>
                  {buying ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed" size={16} color="#fff" />
                      <Text style={st.confirmBtnText}>Pay {formatShopAcoin(total)}</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  backBtnCenter: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 10,
  },
  topBarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cartBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  imgContainer: { width: "100%", position: "relative" },
  imgPlaceholder: { width: "100%", alignItems: "center", justifyContent: "center" },
  dotRow: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  dot: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  outOfStockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  outOfStockText: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  infoCard: { marginHorizontal: 16, marginTop: -20, borderRadius: 20, padding: 20, marginBottom: 12, ...Platform.select({ web: { boxShadow: "0 2px 12px rgba(0,0,0,0.08)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 } }) },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 8 },
  priceMain: { fontSize: 28, fontFamily: "Inter_700Bold" },
  priceUgx: { fontSize: 14, fontFamily: "Inter_400Regular" },
  productTitle: { fontSize: 18, fontFamily: "Inter_700Bold", lineHeight: 24, marginBottom: 12 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  catTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: "transparent" },
  catTagText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  descSection: { gap: 6 },
  descLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  descText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  qtySection: { marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  qtyLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  qtyBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  qtyNum: { fontSize: 18, fontFamily: "Inter_700Bold", minWidth: 28, textAlign: "center" },
  subtotalText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  storeCard: { marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 12 },
  storeCardTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  storeName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  storeHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  orgBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  orgBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  ratingText: { fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: 2 },
  guaranteeCard: { marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 12, gap: 14 },
  guaranteeRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  guaranteeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  guaranteeLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  guaranteeDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  ctaBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cartCta: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  cartCtaText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  buyCta: { flex: 1.4, borderRadius: 14, overflow: "hidden" },
  buyCTAGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  buyCtaText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  successOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  successCard: { width: "80%", borderRadius: 24, padding: 28, alignItems: "center", gap: 14 },
  successIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  successBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, marginTop: 4 },
  successBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  checkoutOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  checkoutCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 0 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  checkoutTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 16 },
  checkoutProduct: { flexDirection: "row", gap: 12, borderRadius: 14, padding: 12, marginBottom: 12 },
  checkoutProductImg: { width: 64, height: 64, borderRadius: 10 },
  checkoutProductName: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  checkoutProductShop: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  checkoutProductQty: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  feeCard: { borderRadius: 14, padding: 14, marginBottom: 12, gap: 10 },
  feeTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  feeLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  feeValue: { fontSize: 14, fontFamily: "Inter_500Medium" },
  feeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  feeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  feeDivider: { height: 1, marginVertical: 2 },
  feeTotalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  feeTotalValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  walletRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 12 },
  walletLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  walletBalance: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  topUpText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  noteWrap: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  noteLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  noteInput: { fontSize: 14, fontFamily: "Inter_400Regular", borderRadius: 8, padding: 10, minHeight: 72, textAlignVertical: "top" },
  secureNote: { flexDirection: "row", gap: 6, alignItems: "flex-start", marginBottom: 12 },
  secureNoteText: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, flex: 1 },
  checkoutActions: { flexDirection: "row", gap: 12, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  confirmBtn: { flex: 2, borderRadius: 14, overflow: "hidden" },
  confirmBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  confirmBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});
