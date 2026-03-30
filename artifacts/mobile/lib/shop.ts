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

export type EscrowStatus = "held" | "released" | "disputed" | "refunded";

export type ShopOrder = {
  id: string;
  buyer_id: string;
  seller_id: string;
  shop_id: string;
  total_acoin: number;
  escrowed_acoin: number;
  status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  escrow_status: EscrowStatus;
  delivery_note?: string;
  dispute_reason?: string;
  buyer_confirmed_at?: string;
  seller_confirmed_at?: string;
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

export type OrderMessage = {
  id: string;
  order_id: string;
  sender_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
  sender?: { display_name: string; handle: string; avatar_url?: string };
};

export type ShopReview = {
  id: string;
  order_id: string;
  reviewer_id: string;
  shop_id: string;
  product_id?: string;
  rating: number;
  review_text?: string;
  images?: string[];
  created_at: string;
  reviewer?: { display_name: string; handle: string; avatar_url?: string };
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
  paid:       { label: "Paid",       color: "#007AFF", icon: "card-outline" },
  processing: { label: "Processing", color: "#007AFF", icon: "refresh-outline" },
  shipped:    { label: "Shipped",    color: "#AF52DE", icon: "airplane-outline" },
  delivered:  { label: "Delivered",  color: "#34C759", icon: "checkmark-done-outline" },
  cancelled:  { label: "Cancelled",  color: "#FF3B30", icon: "close-circle-outline" },
  refunded:   { label: "Refunded",   color: "#8E8E93", icon: "return-down-back-outline" },
};

export const ESCROW_STATUS_LABELS: Record<EscrowStatus, { label: string; color: string; icon: string; desc: string }> = {
  held:     { label: "In Escrow",  color: "#FF9500", icon: "lock-closed-outline", desc: "Funds are held safely until you confirm delivery" },
  released: { label: "Released",   color: "#34C759", icon: "checkmark-circle",    desc: "Funds have been released to the seller" },
  disputed: { label: "Disputed",   color: "#FF3B30", icon: "alert-circle-outline", desc: "This order is under review by our team" },
  refunded: { label: "Refunded",   color: "#8E8E93", icon: "return-down-back-outline", desc: "Funds have been returned to you" },
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

  const { error: deductErr, data: deductData } = await supabase
    .from("profiles")
    .update({ acoin: buyerAcoin - totalAcoin })
    .eq("id", buyerId)
    .eq("acoin", buyerAcoin)
    .select("acoin")
    .single();

  if (deductErr || !deductData) {
    return { success: false, error: "Payment failed — balance may have changed. Please try again." };
  }

  const { data: order, error: orderErr } = await supabase
    .from("shop_orders")
    .insert({
      buyer_id: buyerId,
      seller_id: sellerId,
      shop_id: shopId,
      total_acoin: totalAcoin,
      escrowed_acoin: sellerReceives,
      status: "paid",
      escrow_status: "held",
      delivery_note: deliveryNote || null,
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    await supabase.from("profiles").update({ acoin: buyerAcoin }).eq("id", buyerId);
    return { success: false, error: "Failed to create order — your balance has been restored." };
  }

  await supabase.from("shop_order_items").insert(
    items.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      quantity: i.qty,
      unit_price_acoin: i.unitPrice,
      snapshot_name: i.name,
      snapshot_image: i.image || null,
    }))
  );

  for (const i of items) {
    const { data: prod } = await supabase.from("shop_products").select("sales_count, stock, is_unlimited_stock").eq("id", i.productId).single();
    if (prod) {
      const updates: any = { sales_count: (prod.sales_count || 0) + i.qty };
      if (!prod.is_unlimited_stock) updates.stock = Math.max(0, (prod.stock || 0) - i.qty);
      await supabase.from("shop_products").update(updates).eq("id", i.productId);
    }
  }

  await supabase.from("acoin_transactions").insert([
    {
      user_id: buyerId,
      amount: -totalAcoin,
      transaction_type: "shop_purchase_escrow",
      metadata: { order_id: order.id, shop_id: shopId, note: "Held in escrow until delivery confirmed" },
    },
  ]);

  await supabase.from("shopping_cart").delete().eq("user_id", buyerId).in("product_id", items.map((i) => i.productId));

  await supabase.from("shop_order_messages").insert({
    order_id: order.id,
    sender_id: buyerId,
    message: `Order placed for ${items.length} item${items.length > 1 ? "s" : ""}. Payment of ${totalAcoin} AC is held in escrow. Seller will receive ${sellerReceives} AC upon delivery confirmation.`,
  });

  return { success: true, orderId: order.id };
}

export async function confirmDelivery(params: {
  orderId: string;
  buyerId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { orderId, buyerId } = params;

  const { data: order, error: fetchErr } = await supabase
    .from("shop_orders")
    .select("id, buyer_id, seller_id, shop_id, total_acoin, escrowed_acoin, status, escrow_status")
    .eq("id", orderId)
    .eq("buyer_id", buyerId)
    .single();

  if (fetchErr || !order) return { success: false, error: "Order not found" };
  if (order.buyer_id !== buyerId) return { success: false, error: "Unauthorized" };
  if (order.escrow_status === "released") return { success: false, error: "Funds already released" };
  if (order.escrow_status === "refunded") return { success: false, error: "Order was refunded" };
  if (order.escrow_status === "disputed") return { success: false, error: "Order is under dispute review" };

  const sellerReceives = order.escrowed_acoin || 0;
  if (sellerReceives <= 0) return { success: false, error: "Invalid escrow amount" };

  const { data: sellerProfile, error: sellerErr } = await supabase
    .from("profiles")
    .select("acoin")
    .eq("id", order.seller_id)
    .single();

  if (sellerErr || !sellerProfile) return { success: false, error: "Seller profile not found" };

  const { error: creditErr } = await supabase
    .from("profiles")
    .update({ acoin: (sellerProfile.acoin || 0) + sellerReceives })
    .eq("id", order.seller_id);

  if (creditErr) return { success: false, error: "Failed to credit seller — please contact support" };

  const now = new Date().toISOString();
  await supabase.from("shop_orders").update({
    status: "delivered",
    escrow_status: "released",
    buyer_confirmed_at: now,
    updated_at: now,
  }).eq("id", orderId);

  const { data: shop } = await supabase.from("shops").select("total_sales, total_revenue_acoin").eq("id", order.shop_id).single();
  if (shop) {
    await supabase.from("shops").update({
      total_revenue_acoin: (shop.total_revenue_acoin || 0) + sellerReceives,
      updated_at: now,
    }).eq("id", order.shop_id);
  }

  await supabase.from("acoin_transactions").insert([
    {
      user_id: order.seller_id,
      amount: sellerReceives,
      transaction_type: "shop_sale_released",
      metadata: { order_id: orderId, shop_id: order.shop_id, note: "Escrow released after buyer confirmed delivery" },
    },
  ]);

  await supabase.from("shop_order_messages").insert({
    order_id: orderId,
    sender_id: buyerId,
    message: "✅ Delivery confirmed. Funds have been released to the seller. Thank you for your purchase!",
  });

  return { success: true };
}

export async function raiseDispute(params: {
  orderId: string;
  buyerId: string;
  reason: string;
}): Promise<{ success: boolean; error?: string }> {
  const { orderId, buyerId, reason } = params;

  const { data: order, error: fetchErr } = await supabase
    .from("shop_orders")
    .select("id, buyer_id, escrow_status")
    .eq("id", orderId)
    .eq("buyer_id", buyerId)
    .single();

  if (fetchErr || !order) return { success: false, error: "Order not found" };
  if (order.buyer_id !== buyerId) return { success: false, error: "Unauthorized" };
  if (order.escrow_status === "released") return { success: false, error: "Funds already released — dispute cannot be raised" };
  if (order.escrow_status === "refunded") return { success: false, error: "Order already refunded" };
  if (order.escrow_status === "disputed") return { success: false, error: "Dispute already open" };

  await supabase.from("shop_orders").update({
    escrow_status: "disputed",
    dispute_reason: reason,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId);

  await supabase.from("shop_order_messages").insert({
    order_id: orderId,
    sender_id: buyerId,
    message: `⚠️ Dispute raised: ${reason}\n\nOur support team will review this within 24 hours.`,
  });

  return { success: true };
}

export async function refundOrder(params: {
  orderId: string;
  buyerId: string;
  totalAcoin: number;
}): Promise<{ success: boolean; error?: string }> {
  const { orderId, buyerId, totalAcoin } = params;

  const { data: buyerProfile } = await supabase.from("profiles").select("acoin").eq("id", buyerId).single();
  if (!buyerProfile) return { success: false, error: "Buyer not found" };

  await supabase.from("profiles").update({ acoin: (buyerProfile.acoin || 0) + totalAcoin }).eq("id", buyerId);

  await supabase.from("shop_orders").update({
    status: "refunded",
    escrow_status: "refunded",
    updated_at: new Date().toISOString(),
  }).eq("id", orderId);

  await supabase.from("acoin_transactions").insert([
    {
      user_id: buyerId,
      amount: totalAcoin,
      transaction_type: "shop_refund",
      metadata: { order_id: orderId, note: "Order refunded" },
    },
  ]);

  await supabase.from("shop_order_messages").insert({
    order_id: orderId,
    sender_id: buyerId,
    message: `💰 Refund of ${totalAcoin} AC has been processed to your account.`,
  });

  return { success: true };
}

export async function sendOrderMessage(params: {
  orderId: string;
  senderId: string;
  message: string;
}): Promise<{ success: boolean; error?: string }> {
  const { orderId, senderId, message } = params;
  const { error } = await supabase.from("shop_order_messages").insert({
    order_id: orderId,
    sender_id: senderId,
    message: message.trim(),
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getOrderMessages(orderId: string): Promise<OrderMessage[]> {
  const { data } = await supabase
    .from("shop_order_messages")
    .select("*, sender:profiles!shop_order_messages_sender_id_fkey(display_name, handle, avatar_url)")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  return (data || []) as OrderMessage[];
}

export async function markMessagesRead(orderId: string, viewerId: string): Promise<void> {
  await supabase
    .from("shop_order_messages")
    .update({ is_read: true })
    .eq("order_id", orderId)
    .neq("sender_id", viewerId)
    .eq("is_read", false);
}

export async function submitReview(params: {
  orderId: string;
  reviewerId: string;
  shopId: string;
  productId?: string;
  rating: number;
  reviewText?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { orderId, reviewerId, shopId, productId, rating, reviewText } = params;

  if (rating < 1 || rating > 5) return { success: false, error: "Rating must be between 1 and 5" };

  const { error } = await supabase.from("shop_reviews").insert({
    order_id: orderId,
    reviewer_id: reviewerId,
    shop_id: shopId,
    product_id: productId || null,
    rating,
    review_text: reviewText?.trim() || null,
  });

  if (error) {
    if (error.code === "23505") return { success: false, error: "You already reviewed this item" };
    return { success: false, error: error.message };
  }

  const { data: existing } = await supabase.from("shop_reviews").select("rating").eq("shop_id", shopId);
  if (existing && existing.length > 0) {
    const avg = existing.reduce((s: number, r: any) => s + r.rating, 0) / existing.length;
    await supabase.from("shops").update({
      rating: Math.round(avg * 10) / 10,
      review_count: existing.length,
      updated_at: new Date().toISOString(),
    }).eq("id", shopId);
  }

  return { success: true };
}

export async function getShopReviews(shopId: string, limit = 20): Promise<ShopReview[]> {
  const { data } = await supabase
    .from("shop_reviews")
    .select("*, reviewer:profiles!shop_reviews_reviewer_id_fkey(display_name, handle, avatar_url)")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []) as ShopReview[];
}

export async function getProductReviews(productId: string, limit = 20): Promise<ShopReview[]> {
  const { data } = await supabase
    .from("shop_reviews")
    .select("*, reviewer:profiles!shop_reviews_reviewer_id_fkey(display_name, handle, avatar_url)")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []) as ShopReview[];
}

export async function getBuyerOrders(buyerId: string): Promise<ShopOrder[]> {
  const { data } = await supabase
    .from("shop_orders")
    .select("*, seller_profile:profiles!shop_orders_seller_id_fkey(display_name, handle, avatar_url), shop:shops!shop_orders_shop_id_fkey(name, logo_url), items:shop_order_items(*, product:shop_products(name, images, price_acoin))")
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data || []) as ShopOrder[];
}

export async function getOrderById(orderId: string): Promise<ShopOrder | null> {
  const { data } = await supabase
    .from("shop_orders")
    .select("*, buyer_profile:profiles!shop_orders_buyer_id_fkey(display_name, handle, avatar_url), seller_profile:profiles!shop_orders_seller_id_fkey(display_name, handle, avatar_url), shop:shops!shop_orders_shop_id_fkey(name, logo_url), items:shop_order_items(*, product:shop_products(name, images, price_acoin, description))")
    .eq("id", orderId)
    .single();
  return data as ShopOrder | null;
}
