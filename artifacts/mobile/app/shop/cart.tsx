import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { CartItem, getOrCreateCart, removeFromCart, updateCartQty, placeOrder, formatShopAcoin, formatShopUGX, PLATFORM_FEE_PCT } from "@/lib/shop";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

export default function CartScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [orderDone, setOrderDone] = useState(false);

  const loadCart = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await getOrCreateCart(user.id);
    setItems(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadCart(); }, [loadCart]);

  async function handleUpdateQty(item: CartItem, newQty: number) {
    setUpdatingId(item.product_id);
    await updateCartQty(user!.id, item.product_id, newQty);
    setItems((prev) => newQty <= 0 ? prev.filter((i) => i.product_id !== item.product_id) : prev.map((i) => i.product_id === item.product_id ? { ...i, quantity: newQty } : i));
    setUpdatingId(null);
  }

  async function handleRemove(item: CartItem) {
    setUpdatingId(item.product_id);
    await removeFromCart(user!.id, item.product_id);
    setItems((prev) => prev.filter((i) => i.product_id !== item.product_id));
    setUpdatingId(null);
  }

  const grouped = items.reduce<Record<string, CartItem[]>>((acc, item) => {
    const shopId = (item.product as any)?.shop_id || "unknown";
    if (!acc[shopId]) acc[shopId] = [];
    acc[shopId].push(item);
    return acc;
  }, {});

  const subtotal = items.reduce((s, i) => s + (i.product?.price_acoin || 0) * i.quantity, 0);
  const fee = Math.ceil(subtotal * PLATFORM_FEE_PCT / 100);
  const total = subtotal;
  const balance = profile?.acoin || 0;
  const canAfford = balance >= total;

  async function handleCheckout() {
    if (!user || items.length === 0) return;
    if (!canAfford) {
      showAlert("Insufficient Balance", `You need ${formatShopAcoin(total)} but have ${formatShopAcoin(balance)}. Top up your AfuPay wallet.`, [
        { text: "Cancel" },
        { text: "Top Up", onPress: () => router.push("/wallet" as any) },
      ]);
      return;
    }

    const shopGroups = Object.entries(grouped);
    if (shopGroups.length > 1) {
      showAlert("Multiple Shops", "You have items from multiple shops. Each will be ordered separately.");
    }

    setConfirming(true);
    let allSuccess = true;

    for (const [shopId, shopItems] of shopGroups) {
      const sellerId = shopItems[0].product?.seller_id || (shopItems[0].product as any)?.shop?.seller_id;
      if (!sellerId) continue;
      const orderItems = shopItems.map((i) => ({
        productId: i.product_id,
        qty: i.quantity,
        unitPrice: i.product?.price_acoin || 0,
        name: i.product?.name || "Product",
        image: i.product?.images?.[0],
      }));
      const result = await placeOrder({
        buyerId: user.id,
        buyerAcoin: balance - (total - shopItems.reduce((s, i) => s + (i.product?.price_acoin || 0) * i.quantity, 0)),
        shopId,
        sellerId,
        items: orderItems,
        deliveryNote,
      });
      if (!result.success) {
        allSuccess = false;
        showAlert("Order Failed", result.error || "Could not place order for one of your shops.");
      }
    }

    setConfirming(false);
    if (allSuccess) {
      setItems([]);
      setOrderDone(true);
      await refreshProfile?.();
    }
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>My Cart</Text>
        </View>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Cart</Text>
        <Text style={[styles.headerCount, { color: colors.textMuted }]}>{items.length} item{items.length !== 1 ? "s" : ""}</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyCart}>
          <Text style={{ fontSize: 72 }}>🛒</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Your cart is empty</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Browse shops and add products to your cart</Text>
          <TouchableOpacity style={[styles.browseBtn, { backgroundColor: colors.accent }]} onPress={() => router.back()}>
            <Text style={styles.browseBtnText}>Start Shopping</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 180 }}>
            {Object.entries(grouped).map(([shopId, shopItems]) => {
              const shop = (shopItems[0].product as any)?.shop;
              return (
                <View key={shopId} style={[styles.shopGroup, { backgroundColor: colors.surface }]}>
                  <TouchableOpacity
                    style={styles.shopGroupHeader}
                    onPress={() => shop?.seller_id && router.push({ pathname: "/shop/[userId]", params: { userId: shop.seller_id } })}
                  >
                    {shop?.logo_url ? (
                      <Image source={{ uri: shop.logo_url }} style={styles.shopGroupLogo} />
                    ) : (
                      <View style={[styles.shopGroupLogo, { backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" }]}>
                        <Text>🏪</Text>
                      </View>
                    )}
                    <Text style={[styles.shopGroupName, { color: colors.text }]}>{shop?.name || "Shop"}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>

                  {shopItems.map((item) => {
                    const prod = item.product;
                    const maxQty = prod?.is_unlimited_stock ? 99 : (prod?.stock || 0) + item.quantity;
                    return (
                      <View key={item.product_id} style={[styles.cartItem, { borderTopColor: colors.border }]}>
                        {prod?.images?.[0] ? (
                          <Image source={{ uri: prod.images[0] }} style={styles.cartItemImg} resizeMode="cover" />
                        ) : (
                          <View style={[styles.cartItemImg, { backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" }]}>
                            <Ionicons name="cube-outline" size={24} color={colors.accent} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cartItemName, { color: colors.text }]} numberOfLines={2}>{prod?.name || "Product"}</Text>
                          <Text style={[styles.cartItemPrice, { color: colors.accent }]}>{formatShopAcoin(prod?.price_acoin || 0)}</Text>
                          <View style={styles.cartItemControls}>
                            <TouchableOpacity
                              style={[styles.qtyBtn, { borderColor: colors.border }]}
                              onPress={() => handleUpdateQty(item, item.quantity - 1)}
                              disabled={updatingId === item.product_id}
                            >
                              <Ionicons name={item.quantity === 1 ? "trash-outline" : "remove"} size={14} color={item.quantity === 1 ? "#FF3B30" : colors.text} />
                            </TouchableOpacity>
                            {updatingId === item.product_id
                              ? <ActivityIndicator size="small" color={colors.accent} style={{ width: 28 }} />
                              : <Text style={[styles.qtyValue, { color: colors.text }]}>{item.quantity}</Text>
                            }
                            <TouchableOpacity
                              style={[styles.qtyBtn, { borderColor: colors.border }]}
                              onPress={() => handleUpdateQty(item, item.quantity + 1)}
                              disabled={updatingId === item.product_id || item.quantity >= maxQty}
                            >
                              <Ionicons name="add" size={14} color={colors.text} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.cartItemRight}>
                          <Text style={[styles.cartItemTotal, { color: colors.text }]}>{formatShopAcoin((prod?.price_acoin || 0) * item.quantity)}</Text>
                          <TouchableOpacity onPress={() => handleRemove(item)} hitSlop={10} style={{ marginTop: 8 }}>
                            <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}

            <View style={[styles.noteCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.noteLabel, { color: colors.text }]}>Delivery Note</Text>
              <TextInput
                style={[styles.noteInput, { color: colors.text, borderColor: colors.border }]}
                placeholder="Add a note for the seller (optional)..."
                placeholderTextColor={colors.textMuted}
                value={deliveryNote}
                onChangeText={setDeliveryNote}
                multiline
                maxLength={200}
              />
            </View>
          </ScrollView>

          <View style={[styles.checkoutPanel, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.summaryRows}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Subtotal ({items.length} items)</Text>
                <Text style={[styles.summaryVal, { color: colors.text }]}>{formatShopAcoin(subtotal)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Platform fee ({PLATFORM_FEE_PCT}%)</Text>
                <Text style={[styles.summaryVal, { color: "#FF9500" }]}>-{formatShopAcoin(fee)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalSummaryRow]}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
                <Text style={[styles.totalVal, { color: colors.accent }]}>{formatShopAcoin(total)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>AfuPay Balance</Text>
                <Text style={[styles.summaryVal, { color: canAfford ? "#34C759" : "#FF3B30" }]}>
                  {formatShopAcoin(balance)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.checkoutBtn, { backgroundColor: items.length === 0 ? colors.backgroundTertiary : colors.accent }]}
              onPress={handleCheckout}
              disabled={confirming || items.length === 0}
            >
              {confirming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="wallet-outline" size={20} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Pay with AfuPay · {formatShopAcoin(total)}</Text>
                </>
              )}
            </TouchableOpacity>
            {!canAfford && items.length > 0 && (
              <TouchableOpacity onPress={() => router.push("/wallet" as any)} style={styles.topUpLink}>
                <Text style={[styles.topUpText, { color: colors.accent }]}>Insufficient balance — Top up wallet</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/terms", params: { section: "marketplace" } } as any)}
              style={{ alignItems: "center", paddingTop: 2 }}
            >
              <Text style={[styles.topUpText, { color: colors.textMuted, fontSize: 11, textDecorationLine: "none" }]}>
                By placing an order you agree to our{" "}
                <Text style={{ color: colors.accent }}>Marketplace Terms</Text>
                {" "}and{" "}
                <Text style={{ color: colors.accent }}
                  onPress={() => router.push({ pathname: "/terms", params: { section: "acoins" } } as any)}
                >
                  AfuPay Terms
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Modal visible={orderDone} transparent animationType="fade" onRequestClose={() => setOrderDone(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.successSheet, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 72 }}>🎉</Text>
            <Text style={[styles.successTitle, { color: colors.text }]}>Order Placed!</Text>
            <Text style={[styles.successSub, { color: colors.textMuted }]}>
              Your order has been placed and the seller will process it shortly.
            </Text>
            <TouchableOpacity style={[styles.successBtn, { backgroundColor: colors.accent }]} onPress={() => { setOrderDone(false); router.back(); }}>
              <Text style={styles.successBtnText}>Continue Shopping</Text>
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
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold" },
  headerCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  emptyCart: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  browseBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28, marginTop: 8 },
  browseBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  shopGroup: { borderRadius: 16, overflow: "hidden" },
  shopGroupHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.06)" },
  shopGroupLogo: { width: 30, height: 30, borderRadius: 8 },
  shopGroupName: { flex: 1, fontSize: 14, fontFamily: "Inter_700Bold" },
  cartItem: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderTopWidth: StyleSheet.hairlineWidth },
  cartItemImg: { width: 72, height: 72, borderRadius: 10 },
  cartItemName: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18, marginBottom: 3 },
  cartItemPrice: { fontSize: 14, fontFamily: "Inter_700Bold" },
  cartItemControls: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  qtyValue: { fontSize: 16, fontFamily: "Inter_700Bold", minWidth: 24, textAlign: "center" },
  cartItemRight: { alignItems: "flex-end" },
  cartItemTotal: { fontSize: 15, fontFamily: "Inter_700Bold" },
  noteCard: { borderRadius: 14, padding: 14, gap: 8 },
  noteLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  noteInput: { borderRadius: 10, borderWidth: 1, padding: 10, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 56 },
  checkoutPanel: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  summaryRows: { gap: 6 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryVal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  totalSummaryRow: { paddingTop: 8, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.1)" },
  totalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  totalVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  checkoutBtn: { borderRadius: 28, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  checkoutBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  topUpLink: { alignItems: "center" },
  topUpText: { fontSize: 13, fontFamily: "Inter_500Medium", textDecorationLine: "underline" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  successSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 32, alignItems: "center", gap: 14 },
  successTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  successSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  successBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 28, marginTop: 8 },
  successBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
