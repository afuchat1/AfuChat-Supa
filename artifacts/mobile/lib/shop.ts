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
  items: ShopOrderItem[];
};

export type ShopOrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price_acoin: number;
  snapshot_name?: string;
  snapshot_image?: string;
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

export const ACOIN_TO_USD = 0.01;
export const PLATFORM_FEE_PCT = 5;

export function formatShopAcoin(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M 🪙`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K 🪙`;
  return `${n} 🪙`;
}

export function formatShopUSD(acoin: number): string {
  const usd = acoin * ACOIN_TO_USD;
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(3)}`;
}

export const formatShopUGX = formatShopUSD;

export async function getOrCreateCart(userId: string): Promise<CartItem[]> {
  const { data, error } = await supabase
    .from("shopping_cart")
    .select("id, user_id, product_id, quantity")
    .eq("user_id", userId);
  if (error) throw error;
  const cartRows = (data ?? []) as CartItem[];
  const productIds = [...new Set(cartRows.map((item) => item.product_id))];
  if (productIds.length === 0) return [];

  const { data: productRows, error: productError } = await supabase
    .from("shop_products")
    .select("id,shop_id,seller_id,name,description,price_acoin,images,category,stock,is_unlimited_stock,is_available,sales_count,created_at,updated_at")
    .in("id", productIds);
  if (productError) throw productError;
  const products = (productRows ?? []) as ShopProduct[];
  const shopIds = [...new Set(products.map((product) => product.shop_id))];
  const { data: shopRows, error: shopError } = shopIds.length
    ? await supabase.from("shops").select("id,name,seller_id,logo_url").in("id", shopIds)
    : { data: [], error: null };
  if (shopError) throw shopError;

  const shopsById = new Map((shopRows ?? []).map((shop) => [shop.id, shop]));
  const productsById = new Map(products.map((product) => {
    const shop = shopsById.get(product.shop_id);
    return [product.id, { ...product, shop: shop ? {
      name: shop.name,
      seller_id: shop.seller_id,
      logo_url: shop.logo_url,
    } : undefined }] as const;
  }));
  return cartRows.map((item) => ({ ...item, product: productsById.get(item.product_id) }));
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

export const SHOP_PAYMENTS_UNAVAILABLE_ERROR =
  "Shop payments are temporarily unavailable because a secure ACoin transaction service is not available. No balance or order status was changed.";

export async function placeOrder(_params: {
  buyerId: string;
  buyerAcoin: number;
  shopId: string;
  sellerId: string;
  items: { productId: string; qty: number; unitPrice: number; name: string; image?: string }[];
  deliveryNote?: string;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  return { success: false, error: SHOP_PAYMENTS_UNAVAILABLE_ERROR };
}

export async function confirmDelivery(_params: {
  orderId: string;
  buyerId: string;
}): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: SHOP_PAYMENTS_UNAVAILABLE_ERROR };
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
  if (order.escrow_status === "released") return { success: false, error: "Funds already released. A dispute cannot be raised" };
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

export async function refundOrder(_params: {
  orderId: string;
  buyerId: string;
  totalAcoin: number;
}): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: SHOP_PAYMENTS_UNAVAILABLE_ERROR };
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

export async function getShopProductWithDetails(productId: string): Promise<(ShopProduct & { shops: (Shop & { profiles?: Shop["profiles"] }) | null }) | null> {
  const { data: product, error: productError } = await supabase
    .from("shop_products")
    .select("*")
    .eq("id", productId)
    .maybeSingle();
  if (productError) throw productError;
  if (!product) return null;

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("*, profiles!shops_seller_id_fkey(id,display_name,handle,avatar_url,is_verified,is_organization_verified)")
    .eq("id", product.shop_id)
    .maybeSingle();
  if (shopError) throw shopError;
  return { ...product, shops: shop } as unknown as ShopProduct & {
    shops: (Shop & { profiles?: Shop["profiles"] }) | null;
  };
}

async function hydrateShopOrders(rows: Record<string, any>[]): Promise<ShopOrder[]> {
  if (rows.length === 0) return [];
  const orderIds = rows.map((order) => order.id as string);
  const shopIds = [...new Set(rows.map((order) => order.shop_id as string).filter(Boolean))];
  const [itemsResult, shopsResult] = await Promise.all([
    supabase
      .from("shop_order_items")
      .select("id,order_id,product_id,quantity,unit_price_acoin,snapshot_name,snapshot_image")
      .in("order_id", orderIds),
    shopIds.length
      ? supabase.from("shops").select("id,name,logo_url").in("id", shopIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (shopsResult.error) throw shopsResult.error;

  const itemsByOrder = new Map<string, ShopOrderItem[]>();
  for (const item of (itemsResult.data ?? []) as ShopOrderItem[]) {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrder.set(item.order_id, current);
  }
  const shopsById = new Map((shopsResult.data ?? []).map((shop) => [shop.id, shop]));
  return rows.map((order) => ({
    ...order,
    shop: shopsById.get(order.shop_id),
    items: itemsByOrder.get(order.id) ?? [],
  })) as ShopOrder[];
}

export async function getBuyerOrders(buyerId: string): Promise<ShopOrder[]> {
  const { data, error } = await supabase
    .from("shop_orders")
    .select("*, seller_profile:profiles!shop_orders_seller_id_fkey(display_name, handle, avatar_url)")
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return hydrateShopOrders((data ?? []) as unknown as Record<string, any>[]);
}

export async function getSellerOrders(sellerId: string): Promise<ShopOrder[]> {
  const { data, error } = await supabase
    .from("shop_orders")
    .select("*, buyer_profile:profiles!shop_orders_buyer_id_fkey(display_name, handle, avatar_url)")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return hydrateShopOrders((data ?? []) as unknown as Record<string, any>[]);
}

export async function getOrderById(orderId: string): Promise<ShopOrder | null> {
  const { data, error } = await supabase
    .from("shop_orders")
    .select("*, buyer_profile:profiles!shop_orders_buyer_id_fkey(display_name, handle, avatar_url), seller_profile:profiles!shop_orders_seller_id_fkey(display_name, handle, avatar_url)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [order] = await hydrateShopOrders([data as unknown as Record<string, any>]);
  return order ?? null;
}
