import { supabase } from "./supabase";

export type Shop = {
  id: string;
  seller_id: string;
  name: string;
  description?: string;
  banner_url?: string;
  logo_url?: string;
  category?: string;
  address?: string;
  is_active: boolean;
  pin_to_profile: boolean;
  total_sales: number;
  total_revenue_acoin: number;
  rating: number;
  review_count: number;
  created_at: string;
  updated_at: string;
  profiles?: {
    display_name: string;
    handle: string;
    avatar_url?: string;
    is_verified: boolean;
    is_organization_verified: boolean;
  };
};

export type ShopProduct = {
  id: string;
  shop_id: string;
  seller_id: string;
  name: string;
  description?: string;
  price_acoin: number;
  images: string[];
  category: string;
  stock: number;
  is_unlimited_stock: boolean;
  is_available: boolean;
  sales_count: number;
  created_at: string;
  updated_at: string;
};

export type ShopOrder = {
  id: string;
  buyer_id: string;
  seller_id: string;
  shop_id: string;
  total_acoin: number;
  status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  delivery_note?: string;
  created_at: string;
  updated_at: string;
  buyer_profile?: { display_name: string; handle: string; avatar_url?: string };
  seller_profile?: { display_name: string; handle: string; avatar_url?: string };
  shop?: { name: string; logo_url?: string };
  items?: ShopOrderItem[];
};

export type ShopOrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price_acoin: number;
  snapshot_name?: string;
  snapshot_image?: string;
  product?: ShopProduct;
};

export type CartItem = {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  product?: ShopProduct & { shop?: { name: string; seller_id: string; logo_url?: string } };
};

export const PRODUCT_CATEGORIES = [
  "All", "Electronics", "Fashion", "Food & Drink", "Beauty", "Home & Garden",
  "Sports", "Books", "Toys", "Art & Crafts", "Services", "Digital Goods", "Other"
];

export const SHOP_CATEGORIES = [
  "General", "Electronics", "Fashion & Apparel", "Food & Beverage",
  "Beauty & Wellness", "Home & Living", "Sports & Outdoors",
  "Books & Education", "Art & Crafts", "Digital Services", "Other"
];

export const ORDER_STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  pending:    { label: "Pending",    color: "#FF9500", icon: "time-outline" },
  paid:       { label: "Paid",       color: "#34C759", icon: "checkmark-circle-outline" },
  processing: { label: "Processing", color: "#007AFF", icon: "refresh-outline" },
  shipped:    { label: "Shipped",    color: "#AF52DE", icon: "airplane-outline" },
  delivered:  { label: "Delivered",  color: "#34C759", icon: "checkmark-done-outline" },
  cancelled:  { label: "Cancelled",  color: "#FF3B30", icon: "close-circle-outline" },
  refunded:   { label: "Refunded",   color: "#8E8E93", icon: "return-down-back-outline" },
};

export const ACOIN_TO_UGX = 100;
export const PLATFORM_FEE_PCT = 5;

export function formatShopAcoin(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M 🪙`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K 🪙`;
  return `${n} 🪙`;
}

export function formatShopUGX(acoin: number): string {
  const ugx = acoin * ACOIN_TO_UGX;
  if (ugx >= 1000000) return `UGX ${(ugx / 1000000).toFixed(1)}M`;
  if (ugx >= 1000) return `UGX ${(ugx / 1000).toFixed(0)}K`;
  return `UGX ${ugx.toLocaleString()}`;
}

export async function getOrCreateCart(userId: string): Promise<CartItem[]> {
  const { data } = await supabase
    .from("shopping_cart")
    .select("id, user_id, product_id, quantity, shop_products!shopping_cart_product_id_fkey(id, name, price_acoin, images, stock, is_unlimited_stock, is_available, seller_id, shop_id, shops!shop_products_shop_id_fkey(name, seller_id, logo_url))")
    .eq("user_id", userId);
  return (data || []) as CartItem[];
}

export async function addToCart(userId: string, productId: string, qty = 1): Promise<void> {
  const { data: existing } = await supabase
    .from("shopping_cart")
    .select("id, quantity")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .single();

  if (existing) {
    await supabase.from("shopping_cart").update({ quantity: existing.quantity + qty, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await supabase.from("shopping_cart").insert({ user_id: userId, product_id: productId, quantity: qty });
  }
}

export async function removeFromCart(userId: string, productId: string): Promise<void> {
  await supabase.from("shopping_cart").delete().eq("user_id", userId).eq("product_id", productId);
}

export async function updateCartQty(userId: string, productId: string, qty: number): Promise<void> {
  if (qty <= 0) { await removeFromCart(userId, productId); return; }
  await supabase.from("shopping_cart").update({ quantity: qty }).eq("user_id", userId).eq("product_id", productId);
}

export async function placeOrder(params: {
  buyerId: string;
  buyerAcoin: number;
  shopId: string;
  sellerId: string;
  items: { productId: string; qty: number; unitPrice: number; name: string; image?: string }[];
  deliveryNote?: string;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const { buyerId, buyerAcoin, shopId, sellerId, items, deliveryNote } = params;
  const totalAcoin = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const fee = Math.ceil(totalAcoin * PLATFORM_FEE_PCT / 100);
  const sellerReceives = totalAcoin - fee;

  if (buyerAcoin < totalAcoin) return { success: false, error: "Insufficient AfuPay balance" };
  if (totalAcoin <= 0) return { success: false, error: "Cart is empty" };

  // Deduct from buyer
  const { error: deductErr } = await supabase
    .from("profiles").update({ acoin: buyerAcoin - totalAcoin }).eq("id", buyerId);
  if (deductErr) return { success: false, error: deductErr.message };

  // Credit seller
  const { data: sellerData } = await supabase.from("profiles").select("acoin").eq("id", sellerId).single();
  await supabase.from("profiles").update({ acoin: (sellerData?.acoin || 0) + sellerReceives }).eq("id", sellerId);

  // Create order
  const { data: order, error: orderErr } = await supabase
    .from("shop_orders")
    .insert({ buyer_id: buyerId, seller_id: sellerId, shop_id: shopId, total_acoin: totalAcoin, status: "paid", delivery_note: deliveryNote || null })
    .select("id").single();

  if (orderErr || !order) {
    // Refund buyer on failure
    await supabase.from("profiles").update({ acoin: buyerAcoin }).eq("id", buyerId);
    return { success: false, error: "Failed to create order" };
  }

  // Insert order items
  await supabase.from("shop_order_items").insert(
    items.map((i) => ({ order_id: order.id, product_id: i.productId, quantity: i.qty, unit_price_acoin: i.unitPrice, snapshot_name: i.name, snapshot_image: i.image || null }))
  );

  // Update product sales counts
  for (const i of items) {
    const { data: prod } = await supabase.from("shop_products").select("sales_count, stock, is_unlimited_stock").eq("id", i.productId).single();
    if (prod) {
      const updates: any = { sales_count: (prod.sales_count || 0) + i.qty };
      if (!prod.is_unlimited_stock) updates.stock = Math.max(0, (prod.stock || 0) - i.qty);
      await supabase.from("shop_products").update(updates).eq("id", i.productId);
    }
  }

  // Update shop stats
  const { data: shop } = await supabase.from("shops").select("total_sales, total_revenue_acoin").eq("id", shopId).single();
  if (shop) {
    await supabase.from("shops").update({
      total_sales: (shop.total_sales || 0) + items.reduce((s, i) => s + i.qty, 0),
      total_revenue_acoin: (shop.total_revenue_acoin || 0) + sellerReceives,
      updated_at: new Date().toISOString(),
    }).eq("id", shopId);
  }

  // Log transactions
  await supabase.from("acoin_transactions").insert([
    { user_id: buyerId, amount: -totalAcoin, transaction_type: "shop_purchase", metadata: { order_id: order.id, shop_id: shopId } },
    { user_id: sellerId, amount: sellerReceives, transaction_type: "shop_sale", metadata: { order_id: order.id, shop_id: shopId } },
  ]);

  // Clear buyer's cart items for this shop
  await supabase.from("shopping_cart").delete().eq("user_id", buyerId).in("product_id", items.map((i) => i.productId));

  return { success: true, orderId: order.id };
}
