import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { ShopProduct, Shop, addToCart, getOrCreateCart, placeOrder, formatShopAcoin, formatShopUGX, PLATFORM_FEE_PCT } from "@/lib/shop";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [product, setProduct] = useState<ShopProduct & { shop?: Shop & { profiles?: any } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [imgIndex, setImgIndex] = useState(0);
  const [addingCart, setAddingCart] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderDone, setOrderDone] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("shop_products")
      .select("*, shops!shop_products_shop_id_fkey(*, profiles!shops_seller_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified))")
      .eq("id", id).single();
    setProduct(data as any);
    setLoading(false);
  }, [id]);

  const loadCart = useCallback(async () => {
    if (!user) return;
    const items = await getOrCreateCart(user.id);
    setCartCount(items.reduce((s, i) => s + i.quantity, 0));
  }, [user]);

  useEffect(() => { load(); loadCart(); }, [load, loadCart]);

  async function handleAddToCart() {
    if (!user) { router.push("/(auth)/login" as any); return; }
    if (!product) return;
    if (product.seller_id === user.id) { showAlert("Oops", "You can't buy your own products."); return; }
    setAddingCart(true);
    await addToCart(user.id, product.id, qty);
    setCartCount((c) => c + qty);
    setAddingCart(false);
    showAlert("Added to Cart!", `${product.name} ×${qty} added to your cart.`);
  }

  async function handleBuyNow() {
    if (!user) { router.push("/(auth)/login" as any); return; }
    if (!product) return;
    if (product.seller_id === user.id) { showAlert("Oops", "You can't buy your own products."); return; }
    setShowCheckout(true);
  }

  async function confirmPurchase() {
    if (!user || !product || !product.shop) return;
    const totalAcoin = product.price_acoin * qty;
    const buyerBalance = profile?.acoin || 0;
    if (buyerBalance < totalAcoin) {
      showAlert("Insufficient Balance", `You need ${formatShopAcoin(totalAcoin)} but have ${formatShopAcoin(buyerBalance)}. Top up your AfuPay wallet.`);
      return;
    }
    setBuyingNow(true);
    const result = await placeOrder({
      buyerId: user.id,
      buyerAcoin: buyerBalance,
      shopId: product.shop_id,
      sellerId: product.seller_id,
      items: [{ productId: product.id, qty, unitPrice: product.price_acoin, name: product.name, image: product.images?.[0] }],
      deliveryNote,
    });
    setBuyingNow(false);
    if (result.success) {
      setShowCheckout(false);
      setOrderDone(result.orderId || "");
      await refreshProfile?.();
    } else {
      showAlert("Payment Failed", result.error || "Could not complete purchase.");
    }
  }

  const images = product?.images?.length ? product.images : [];
  const outOfStock = product ? (!product.is_unlimited_stock && product.stock <= 0) : false;
  const maxQty = product?.is_unlimited_stock ? 99 : (product?.stock || 0);
  const totalAcoin = (product?.price_acoin || 0) * qty;
  const fee = Math.ceil(totalAcoin * PLATFORM_FEE_PCT / 100);

  if (loading || !product) {
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

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{product.name}</Text>
        <TouchableOpacity onPress={() => router.push("/shop/cart" as any)} hitSlop={10}>
          <Ionicons name="cart-outline" size={24} color={colors.text} />
          {cartCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={styles.gallery}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setImgIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
            {images.length > 0 ? images.map((img, i) => (
              <Image key={i} source={{ uri: img }} style={[styles.galleryImg, { width }]} resizeMode="contain" />
            )) : (
              <View style={[styles.galleryImg, { width, backgroundColor: Colors.brand + "18", alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="cube-outline" size={72} color={Colors.brand} />
              </View>
            )}
          </ScrollView>
          {images.length > 1 && (
            <View style={styles.imgDots}>
              {images.map((_, i) => (
                <View key={i} style={[styles.imgDot, { backgroundColor: i === imgIndex ? Colors.brand : "rgba(255,255,255,0.5)" }]} />
              ))}
            </View>
          )}
        </View>

        <View style={{ padding: 16, gap: 14 }}>
          <View>
            <Text style={[styles.productName, { color: colors.text }]}>{product.name}</Text>
            <View style={styles.priceRow}>
              <Text style={[styles.priceAcoin, { color: Colors.brand }]}>{formatShopAcoin(product.price_acoin)}</Text>
              <Text style={[styles.priceUGX, { color: colors.textMuted }]}>{formatShopUGX(product.price_acoin)}</Text>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Ionicons name="pricetag-outline" size={11} color={colors.textMuted} />
                <Text style={[styles.metaChipText, { color: colors.textMuted }]}>{product.category || "General"}</Text>
              </View>
              {product.sales_count > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="trending-up-outline" size={11} color={Colors.brand} />
                  <Text style={[styles.metaChipText, { color: Colors.brand }]}>{product.sales_count}+ sold</Text>
                </View>
              )}
              <View style={[styles.metaChip, { backgroundColor: outOfStock ? "#FF3B3018" : "#34C75918" }]}>
                <Text style={[styles.metaChipText, { color: outOfStock ? "#FF3B30" : "#34C759" }]}>
                  {outOfStock ? "Out of Stock" : product.is_unlimited_stock ? "In Stock" : `${product.stock} left`}
                </Text>
              </View>
            </View>
          </View>

          {product.description ? (
            <View style={[styles.descCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.descTitle, { color: colors.text }]}>Description</Text>
              <Text style={[styles.descText, { color: colors.textSecondary }]}>{product.description}</Text>
            </View>
          ) : null}

          <View style={[styles.qtyCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.qtyLabel, { color: colors.text }]}>Quantity</Text>
            <View style={styles.qtyControls}>
              <TouchableOpacity style={[styles.qtyBtn, { borderColor: colors.border }]} onPress={() => setQty((q) => Math.max(1, q - 1))}>
                <Ionicons name="remove" size={18} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.qtyValue, { color: colors.text }]}>{qty}</Text>
              <TouchableOpacity style={[styles.qtyBtn, { borderColor: colors.border }]} onPress={() => setQty((q) => Math.min(maxQty || 99, q + 1))} disabled={outOfStock}>
                <Ionicons name="add" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {product.shop && (
            <TouchableOpacity
              style={[styles.sellerCard, { backgroundColor: colors.surface }]}
              onPress={() => router.push({ pathname: "/shop/[userId]", params: { userId: product.seller_id } })}
              activeOpacity={0.85}
            >
              {product.shop.logo_url || product.shop.profiles?.avatar_url ? (
                <Image source={{ uri: product.shop.logo_url || product.shop.profiles?.avatar_url }} style={styles.sellerAvatar} />
              ) : (
                <View style={[styles.sellerAvatar, { backgroundColor: Colors.brand + "22", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ fontSize: 20 }}>🏪</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.sellerName, { color: colors.text }]}>{product.shop.name}</Text>
                <Text style={[styles.sellerHandle, { color: colors.textMuted }]}>@{product.shop.profiles?.handle} · {product.shop.total_sales || 0} sales</Text>
              </View>
              <View style={[styles.visitBtn, { backgroundColor: Colors.brand + "18" }]}>
                <Text style={[styles.visitBtnText, { color: Colors.brand }]}>Visit Shop</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.footerTotal}>
          <Text style={[styles.footerTotalLabel, { color: colors.textMuted }]}>Total</Text>
          <Text style={[styles.footerTotalValue, { color: Colors.brand }]}>{formatShopAcoin(totalAcoin)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.cartBtn, { borderColor: Colors.brand }]}
          onPress={handleAddToCart}
          disabled={outOfStock || addingCart}
        >
          {addingCart ? <ActivityIndicator size="small" color={Colors.brand} /> : <Ionicons name="cart-outline" size={20} color={Colors.brand} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.buyBtn, { backgroundColor: outOfStock ? colors.backgroundTertiary : Colors.brand }]}
          onPress={handleBuyNow}
          disabled={outOfStock}
        >
          <Text style={[styles.buyBtnText, { color: outOfStock ? colors.textMuted : "#fff" }]}>
            {outOfStock ? "Unavailable" : "Buy Now"}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showCheckout} transparent animationType="slide" onRequestClose={() => setShowCheckout(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.dragHandle} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Confirm Order</Text>
            <View style={[styles.checkoutProduct, { backgroundColor: colors.backgroundSecondary }]}>
              {product.images?.[0] ? (
                <Image source={{ uri: product.images[0] }} style={styles.checkoutThumb} resizeMode="cover" />
              ) : (
                <View style={[styles.checkoutThumb, { backgroundColor: Colors.brand + "18", alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="cube-outline" size={22} color={Colors.brand} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.checkoutProductName, { color: colors.text }]} numberOfLines={2}>{product.name}</Text>
                <Text style={[styles.checkoutProductMeta, { color: colors.textMuted }]}>Qty: {qty}</Text>
              </View>
              <Text style={[styles.checkoutItemTotal, { color: Colors.brand }]}>{formatShopAcoin(totalAcoin)}</Text>
            </View>

            <View style={[styles.checkoutBreakdown, { borderColor: colors.border }]}>
              {[
                { label: "Subtotal", value: formatShopAcoin(totalAcoin) },
                { label: `Platform fee (${PLATFORM_FEE_PCT}%)`, value: `-${formatShopAcoin(fee)}`, color: "#FF9500" },
                { label: "Seller receives", value: formatShopAcoin(totalAcoin - fee), color: "#34C759" },
              ].map((r) => (
                <View key={r.label} style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.textMuted }]}>{r.label}</Text>
                  <Text style={[styles.breakdownValue, { color: r.color || colors.text }]}>{r.value}</Text>
                </View>
              ))}
              <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>You Pay</Text>
                <Text style={[styles.totalValue, { color: Colors.brand }]}>{formatShopAcoin(totalAcoin)}</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>AfuPay Balance</Text>
                <Text style={[styles.balanceValue, { color: (profile?.acoin || 0) >= totalAcoin ? "#34C759" : "#FF3B30" }]}>
                  {formatShopAcoin(profile?.acoin || 0)}
                </Text>
              </View>
            </View>

            <TextInput
              style={[styles.noteInput, { backgroundColor: colors.backgroundTertiary, color: colors.text, borderColor: colors.border }]}
              placeholder="Delivery note (optional)..."
              placeholderTextColor={colors.textMuted}
              value={deliveryNote}
              onChangeText={setDeliveryNote}
              multiline
              maxLength={200}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowCheckout(false)}>
                <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: (profile?.acoin || 0) >= totalAcoin ? Colors.brand : colors.backgroundTertiary }]}
                onPress={confirmPurchase}
                disabled={buyingNow || (profile?.acoin || 0) < totalAcoin}
              >
                {buyingNow ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Ionicons name="wallet-outline" size={16} color="#fff" />
                    <Text style={styles.confirmText}>Pay with AfuPay</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!orderDone} transparent animationType="fade" onRequestClose={() => setOrderDone(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.successSheet, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 72 }}>🎉</Text>
            <Text style={[styles.successTitle, { color: colors.text }]}>Order Placed!</Text>
            <Text style={[styles.successSub, { color: colors.textMuted }]}>
              Your order has been placed successfully. The seller will process it shortly.
            </Text>
            <TouchableOpacity style={[styles.successBtn, { backgroundColor: Colors.brand }]} onPress={() => { setOrderDone(null); router.push({ pathname: "/shop/[userId]", params: { userId: product?.seller_id || "" } }); }}>
              <Text style={styles.successBtnText}>Continue Shopping</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOrderDone(null)}>
              <Text style={[styles.successDismiss, { color: colors.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cartBadge: { position: "absolute", top: -4, right: -4, backgroundColor: "#FF3B30", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  cartBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
  gallery: { backgroundColor: "#000", height: 320, position: "relative" },
  galleryImg: { height: 320 },
  imgDots: { position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  imgDot: { width: 6, height: 6, borderRadius: 3 },
  productName: { fontSize: 20, fontFamily: "Inter_700Bold", lineHeight: 26 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 },
  priceAcoin: { fontSize: 26, fontFamily: "Inter_700Bold" },
  priceUGX: { fontSize: 14, fontFamily: "Inter_400Regular" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: "rgba(142,142,142,0.1)" },
  metaChipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  descCard: { borderRadius: 14, padding: 14, gap: 6 },
  descTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  descText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  qtyCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, padding: 14 },
  qtyLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 16 },
  qtyBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  qtyValue: { fontSize: 20, fontFamily: "Inter_700Bold", minWidth: 32, textAlign: "center" },
  sellerCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 14 },
  sellerAvatar: { width: 46, height: 46, borderRadius: 14 },
  sellerName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sellerHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  visitBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  visitBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  footer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  footerTotal: { flex: 1 },
  footerTotalLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  footerTotalValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  cartBtn: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  buyBtn: { flex: 2, borderRadius: 25, paddingVertical: 14, alignItems: "center" },
  buyBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  checkoutProduct: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 12 },
  checkoutThumb: { width: 56, height: 56, borderRadius: 10 },
  checkoutProductName: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  checkoutProductMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  checkoutItemTotal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  checkoutBreakdown: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 10 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  breakdownValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 4 },
  totalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  totalValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  balanceRow: { flexDirection: "row", justifyContent: "space-between" },
  balanceLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  balanceValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
  noteInput: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 60 },
  modalBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  confirmBtn: { flex: 2, borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  confirmText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  successSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 32, alignItems: "center", gap: 14 },
  successTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  successSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  successBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 28, marginTop: 8 },
  successBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  successDismiss: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
});
