import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { FreelanceCardSkeleton } from "@/components/ui/Skeleton";
import Colors from "@/constants/colors";
import { transferAcoin } from "@/lib/monetize";
import { showAlert } from "@/lib/alert";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";

const { width: SW } = Dimensions.get("window");
const CARD_W = (SW - 48) / 2;
const CACHE_KEY_LISTINGS = "afu_freelance_listings";
const CACHE_KEY_ORDERS = "afu_freelance_orders";
const CACHE_TTL = 5 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────
type Listing = {
  id: string; title: string; description: string; price: number;
  delivery_days: number; category: string; emoji: string; seller_id: string;
  seller_name: string; seller_handle: string; seller_avatar: string | null;
  orders_count: number; rating: number; review_count: number;
  tags: string[]; requirements: string; is_active: boolean; created_at: string;
};
type Order = {
  id: string; listing_id: string; listing_title: string; listing_emoji: string;
  buyer_id: string; buyer_name: string; buyer_handle: string; buyer_avatar: string | null;
  seller_id: string; seller_name: string; seller_handle: string; seller_avatar: string | null;
  price_paid: number; status: string; buyer_note: string; delivery_message: string;
  revision_count: number; max_revisions: number; cancel_reason: string | null;
  created_at: string; completed_at: string | null;
};
type Review = {
  id: string; rating: number; comment: string;
  reviewer_name: string; reviewer_handle: string; reviewer_avatar: string | null; created_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const CATS: { key: string; icon: string; label: string; color: string }[] = [
  { key: "All",       icon: "apps",             label: "All",       color: "#00BCD4" },
  { key: "Design",    icon: "color-palette",    label: "Design",    color: "#FF6B35" },
  { key: "Dev",       icon: "code-slash",       label: "Dev",       color: "#5856D6" },
  { key: "Writing",   icon: "document-text",    label: "Writing",   color: "#007AFF" },
  { key: "Marketing", icon: "megaphone",        label: "Marketing", color: "#FF9500" },
  { key: "Video",     icon: "videocam",         label: "Video",     color: "#FF2D55" },
  { key: "Music",     icon: "musical-notes",    label: "Music",     color: "#AF52DE" },
  { key: "AI",        icon: "sparkles",         label: "AI",        color: "#34C759" },
  { key: "Business",  icon: "briefcase",        label: "Business",  color: "#D4A853" },
  { key: "Other",     icon: "ellipsis-horizontal", label: "Other",  color: "#8E8E93" },
];

const STATUS_META: Record<string, { color: string; icon: string; label: string; bg: string }> = {
  pending:     { color: "#FF9500", icon: "hourglass",        label: "Pending",     bg: "#FF950018" },
  in_progress: { color: "#007AFF", icon: "construct",        label: "In Progress", bg: "#007AFF18" },
  delivered:   { color: "#5856D6", icon: "cube",             label: "Delivered",   bg: "#5856D618" },
  revision:    { color: "#FF6B35", icon: "refresh",          label: "Revision",    bg: "#FF6B3518" },
  completed:   { color: "#34C759", icon: "checkmark-circle", label: "Completed",   bg: "#34C75918" },
  cancelled:   { color: "#FF3B30", icon: "close-circle",     label: "Cancelled",   bg: "#FF3B3018" },
  disputed:    { color: "#FF2D55", icon: "warning",          label: "Disputed",    bg: "#FF2D5518" },
};

const ORDER_STEPS = ["pending", "in_progress", "delivered", "completed"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function elapsed(d: string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function cacheData(key: string, data: any) {
  try { await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
async function getCached<T>(key: string): Promise<{ data: T; stale: boolean } | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { data: parsed.data, stale: Date.now() - parsed.ts > CACHE_TTL };
  } catch { return null; }
}

const SELECT_LISTING = `id, title, description, price, delivery_days, category, emoji, seller_id, orders_count, rating, review_count, tags, requirements, is_active, created_at, profiles!freelance_listings_seller_id_fkey(display_name, handle, avatar_url)`;

function mapListing(l: any): Listing {
  return {
    id: l.id, title: l.title, description: l.description, price: l.price,
    delivery_days: l.delivery_days || 3, category: l.category || "Other", emoji: l.emoji || "💼",
    seller_id: l.seller_id, seller_name: l.profiles?.display_name || "Seller",
    seller_handle: l.profiles?.handle || "seller", seller_avatar: l.profiles?.avatar_url || null,
    orders_count: l.orders_count || 0, rating: Number(l.rating) || 5, review_count: l.review_count || 0,
    tags: l.tags || [], requirements: l.requirements || "", is_active: l.is_active, created_at: l.created_at,
  };
}
function mapOrder(o: any): Order {
  return {
    id: o.id, listing_id: o.listing_id, listing_title: o.listing?.title || "Service",
    listing_emoji: o.listing?.emoji || "💼",
    buyer_id: o.buyer_id, buyer_name: o.buyer?.display_name || "Buyer",
    buyer_handle: o.buyer?.handle || "user", buyer_avatar: o.buyer?.avatar_url || null,
    seller_id: o.seller_id, seller_name: o.seller?.display_name || "Seller",
    seller_handle: o.seller?.handle || "user", seller_avatar: o.seller?.avatar_url || null,
    price_paid: o.price_paid, status: o.status, buyer_note: o.buyer_note || "",
    delivery_message: o.delivery_message || "", revision_count: o.revision_count || 0,
    max_revisions: o.max_revisions || 1, cancel_reason: o.cancel_reason,
    created_at: o.created_at, completed_at: o.completed_at,
  };
}

// ─── Small reusable UI ────────────────────────────────────────────────────────
function Stars({ n, size = 12 }: { n: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons key={s} name={n >= s ? "star" : n >= s - 0.5 ? "star-half" : "star-outline"} size={size} color="#FFD60A" />
      ))}
    </View>
  );
}

function Avatar({ uri, name, size = 36 }: { uri: string | null; name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#00BCD420", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.38, color: "#00BCD4", fontWeight: "700" }}>{initials || "?"}</Text>
    </View>
  );
}

function AcoinBadge({ amount, size = "md" }: { amount: number; size?: "sm" | "md" | "lg" }) {
  const fs = size === "sm" ? 12 : size === "lg" ? 22 : 15;
  const es = size === "sm" ? 11 : size === "lg" ? 20 : 14;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <Text style={{ fontSize: es }}>🪙</Text>
      <Text style={{ fontSize: fs, fontWeight: "700", color: Colors.gold }}>{amount.toLocaleString()}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FreelanceScreen() {
  const { colors, isDark } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [connected, setConnected] = useState(isOnline());
  const [tab, setTab] = useState<"explore" | "orders" | "dashboard">("explore");
  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ordering, setOrdering] = useState(false);

  const [viewListing, setViewListing] = useState<Listing | null>(null);
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Listing | null>(null);
  const [orderSub, setOrderSub] = useState<"buying" | "selling">("buying");

  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fPrice, setFPrice] = useState("200");
  const [fDays, setFDays] = useState("3");
  const [fEmoji, setFEmoji] = useState("💼");
  const [fCat, setFCat] = useState("Design");
  const [fReqs, setFReqs] = useState("");
  const [fTags, setFTags] = useState("");
  const [saving, setSaving] = useState(false);

  const [deliveryMsg, setDeliveryMsg] = useState("");
  const [showDeliver, setShowDeliver] = useState(false);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { const unsub = onConnectivityChange(setConnected); return unsub; }, []);

  // ── Data fetching (unchanged logic) ─────────────────────────────────────────
  const fetchListings = useCallback(async () => {
    if (!connected) {
      const cached = await getCached<Listing[]>(CACHE_KEY_LISTINGS);
      if (cached) setListings(cached.data);
      return;
    }
    const [{ data: active }, { data: mine }] = await Promise.all([
      supabase.from("freelance_listings").select(SELECT_LISTING).eq("is_active", true).order("orders_count", { ascending: false }).limit(100),
      user ? supabase.from("freelance_listings").select(SELECT_LISTING).eq("seller_id", user.id).order("created_at", { ascending: false }) : Promise.resolve({ data: null }),
    ]);
    if (active) { const mapped = active.map(mapListing); setListings(mapped); cacheData(CACHE_KEY_LISTINGS, mapped); }
    if (mine) setMyListings(mine.map(mapListing));
  }, [connected, user]);

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    if (!connected) {
      const cached = await getCached<Order[]>(CACHE_KEY_ORDERS);
      if (cached) setOrders(cached.data);
      return;
    }
    const { data } = await supabase
      .from("freelance_orders")
      .select(`id, listing_id, buyer_id, seller_id, price_paid, status, buyer_note, delivery_message, revision_count, max_revisions, cancel_reason, created_at, completed_at, listing:freelance_listings!freelance_orders_listing_id_fkey(title, emoji), buyer:profiles!freelance_orders_buyer_id_fkey(display_name, handle, avatar_url), seller:profiles!freelance_orders_seller_id_fkey(display_name, handle, avatar_url)`)
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order("created_at", { ascending: false }).limit(50);
    if (data) { const mapped = data.map(mapOrder); setOrders(mapped); cacheData(CACHE_KEY_ORDERS, mapped); }
  }, [connected, user]);

  const fetchReviews = useCallback(async (lid: string) => {
    if (!connected) { setReviews([]); return; }
    const { data } = await supabase.from("freelance_reviews")
      .select(`id, rating, comment, created_at, reviewer:profiles!freelance_reviews_reviewer_id_fkey(display_name, handle, avatar_url)`)
      .eq("listing_id", lid).order("created_at", { ascending: false }).limit(20);
    if (data) setReviews(data.map((r: any) => ({
      id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at,
      reviewer_name: r.reviewer?.display_name || "User", reviewer_handle: r.reviewer?.handle || "user",
      reviewer_avatar: r.reviewer?.avatar_url || null,
    })));
  }, [connected]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchListings(), fetchOrders()]);
    setLoading(false);
  }, [fetchListings, fetchOrders]);

  useEffect(() => { loadAll(); }, [loadAll]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadAll(); setRefreshing(false); }, [loadAll]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = cat === "All" ? listings : listings.filter((l) => l.category === cat);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((l) => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.seller_handle.toLowerCase().includes(q) || l.tags.some((t) => t.toLowerCase().includes(q)));
    }
    return r;
  }, [listings, cat, search]);

  const buyOrders = useMemo(() => orders.filter((o) => o.buyer_id === user?.id), [orders, user]);
  const sellOrders = useMemo(() => orders.filter((o) => o.seller_id === user?.id), [orders, user]);
  const activeOrdersCount = useMemo(() => orders.filter((o) => !["completed", "cancelled"].includes(o.status)).length, [orders]);
  const totalEarned = useMemo(() => sellOrders.filter((o) => o.status === "completed").reduce((s, o) => s + o.price_paid, 0), [sellOrders]);
  const featuredListings = useMemo(() => listings.slice(0, 6), [listings]);
  const topRated = useMemo(() => [...listings].sort((a, b) => b.rating - a.rating).slice(0, 6), [listings]);

  // ── Actions (unchanged logic) ────────────────────────────────────────────────
  async function placeOrder(l: Listing) {
    if (!user || !profile) { router.push("/(auth)/login"); return; }
    if (!connected) { showAlert("Offline", "You need an internet connection to place an order."); return; }
    if (l.seller_id === user.id) { showAlert("Oops", "You can't buy your own service."); return; }
    if ((profile.acoin || 0) < l.price) {
      showAlert("Insufficient ACoin", `This service costs ${l.price} ACoin. Your balance: ${profile.acoin || 0}.`, [
        { text: "Top Up", onPress: () => router.push("/wallet/topup") }, { text: "Cancel" },
      ]); return;
    }
    showAlert("Confirm Order", `Pay ${l.price} ACoin to @${l.seller_handle} for\n"${l.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: `Pay ${l.price} ACoin`, onPress: async () => {
        setOrdering(true);
        const res = await transferAcoin({ buyerId: user.id, sellerId: l.seller_id, buyerCurrentAcoin: profile.acoin || 0, amount: l.price, transactionType: "monetize_freelance", metadata: { listing_id: l.id, listing_title: l.title } });
        if (res.success) {
          await supabase.from("freelance_orders").insert({ listing_id: l.id, buyer_id: user.id, seller_id: l.seller_id, price_paid: l.price, status: "pending", max_revisions: 1 });
          await supabase.from("freelance_listings").update({ orders_count: l.orders_count + 1 }).eq("id", l.id);
          refreshProfile(); showAlert("Order Placed! 🎉", "Your order is confirmed. The seller will begin work soon."); setViewListing(null); loadAll();
        } else { showAlert("Payment Failed", res.error || "Could not complete the transaction."); }
        setOrdering(false);
      }},
    ]);
  }

  function resetForm() { setFTitle(""); setFDesc(""); setFPrice("200"); setFDays("3"); setFEmoji("💼"); setFCat("Design"); setFReqs(""); setFTags(""); setEditTarget(null); }

  async function saveListing() {
    if (!user) return;
    if (!connected) { showAlert("Offline", "Connect to the internet to save."); return; }
    if (!fTitle.trim()) { showAlert("Required", "Enter a title for your service."); return; }
    const price = parseInt(fPrice);
    if (!price || price < 1) { showAlert("Invalid", "Set a valid ACoin price."); return; }
    setSaving(true);
    const payload: any = { title: fTitle.trim(), description: fDesc.trim(), price, emoji: fEmoji, category: fCat, delivery_days: parseInt(fDays) || 3, seller_id: user.id, is_active: true, requirements: fReqs.trim(), tags: fTags.split(",").map((t) => t.trim()).filter(Boolean) };
    const { error } = editTarget
      ? await supabase.from("freelance_listings").update(payload).eq("id", editTarget.id)
      : await supabase.from("freelance_listings").insert({ ...payload, orders_count: 0, rating: 5.0, review_count: 0 });
    setSaving(false);
    if (error) { showAlert("Error", error.message); return; }
    showAlert(editTarget ? "Updated!" : "Published! 🚀", editTarget ? "Your service has been updated." : "Your service is now live.");
    resetForm(); setShowCreate(false); loadAll();
  }

  function startEdit(l: Listing) { setEditTarget(l); setFTitle(l.title); setFDesc(l.description); setFPrice(String(l.price)); setFDays(String(l.delivery_days)); setFEmoji(l.emoji); setFCat(l.category); setFReqs(l.requirements); setFTags(l.tags.join(", ")); setShowCreate(true); }

  async function toggleActive(l: Listing) {
    if (!connected) return;
    await supabase.from("freelance_listings").update({ is_active: !l.is_active }).eq("id", l.id); loadAll();
  }

  async function removeListing(l: Listing) {
    showAlert("Delete Service", `Permanently remove "${l.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await supabase.from("freelance_listings").delete().eq("id", l.id); setViewListing(null); loadAll(); } },
    ]);
  }

  async function updateStatus(o: Order, status: string, msg?: string) {
    if (!connected) { showAlert("Offline", "Go online to update orders."); return; }
    setSubmitting(true);
    const upd: any = { status, updated_at: new Date().toISOString() };
    if (msg) upd.delivery_message = msg;
    if (status === "completed") upd.completed_at = new Date().toISOString();
    if (status === "cancelled") upd.cancel_reason = msg || "Cancelled";
    if (status === "revision") upd.revision_count = (o.revision_count || 0) + 1;
    await supabase.from("freelance_orders").update(upd).eq("id", o.id);
    if (status === "cancelled" && o.status === "pending") {
      const { data: bp } = await supabase.from("profiles").select("acoin").eq("id", o.buyer_id).single();
      if (bp) {
        await supabase.from("profiles").update({ acoin: (bp.acoin || 0) + o.price_paid }).eq("id", o.buyer_id);
        await supabase.from("acoin_transactions").insert({ user_id: o.buyer_id, amount: o.price_paid, transaction_type: "freelance_refund", metadata: { order_id: o.id } });
      }
    }
    setSubmitting(false); setViewOrder(null); setShowDeliver(false); setDeliveryMsg(""); loadAll(); refreshProfile();
  }

  async function postReview(o: Order) {
    if (!user || !connected) return;
    setSubmitting(true);
    await supabase.from("freelance_reviews").insert({ order_id: o.id, listing_id: o.listing_id, reviewer_id: user.id, seller_id: o.seller_id, rating: reviewStars, comment: reviewText.trim() });
    const { data: all } = await supabase.from("freelance_reviews").select("rating").eq("listing_id", o.listing_id);
    if (all?.length) {
      const avg = all.reduce((s: number, r: any) => s + r.rating, 0) / all.length;
      await supabase.from("freelance_listings").update({ rating: Math.round(avg * 100) / 100, review_count: all.length }).eq("id", o.listing_id);
    }
    setSubmitting(false); setReviewStars(5); setReviewText(""); setViewOrder(null);
    showAlert("Thank you! ⭐", "Your review has been submitted."); loadAll();
  }

  function openListing(l: Listing) { setReviews([]); setViewListing(l); fetchReviews(l.id); }

  // ── Render ───────────────────────────────────────────────────────────────────
  const bg = colors.backgroundSecondary;
  const surf = colors.surface;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>

      {/* ── Header ── */}
      <LinearGradient
        colors={isDark ? ["#0D2137", "#0A1A2E"] : ["#00BCD4", "#007D8A"]}
        style={[st.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={st.headerTop}>
          <View>
            <Text style={st.headerEyebrow}>AfuChat Marketplace</Text>
            <Text style={st.headerTitle}>Freelance Hub</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <TouchableOpacity style={st.walletChip} onPress={() => router.push("/wallet")}>
              <Text style={{ fontSize: 13 }}>🪙</Text>
              <Text style={st.walletChipText}>{(profile?.acoin || 0).toLocaleString()}</Text>
              <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            {activeOrdersCount > 0 && (
              <View style={st.activeOrdersBubble}>
                <Ionicons name="flash" size={11} color="#FF9500" />
                <Text style={{ fontSize: 11, color: "#FF9500", fontWeight: "700" }}>{activeOrdersCount} active</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Tab Bar ── */}
        <View style={st.tabBar}>
          {([
            { key: "explore",   icon: "compass",   label: "Explore" },
            { key: "orders",    icon: "bag-handle", label: "Orders"  },
            { key: "dashboard", icon: "storefront", label: "Sell"    },
          ] as const).map((t) => (
            <TouchableOpacity key={t.key} style={[st.tabItem, tab === t.key && st.tabActive]} onPress={() => setTab(t.key)} activeOpacity={0.7}>
              <Ionicons name={t.icon as any} size={16} color={tab === t.key ? "#00BCD4" : "rgba(255,255,255,0.55)"} />
              <Text style={[st.tabLabel, tab === t.key && st.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ── Offline Banner ── */}
      {!connected && (
        <View style={st.offlineBanner}>
          <Ionicons name="cloud-offline" size={14} color="#fff" />
          <Text style={st.offlineText}>You're offline · Showing cached data</Text>
        </View>
      )}

      {/* ── Tab Content ── */}
      {loading ? (
        <View style={{ paddingTop: 8 }}>
          {[1,2,3,4].map(i => <FreelanceCardSkeleton key={i} />)}
        </View>
      ) : tab === "explore" ? (
        <ExploreTab
          colors={colors} isDark={isDark} surf={surf} filtered={filtered} featuredListings={featuredListings}
          topRated={topRated} cat={cat} search={search} refreshing={refreshing}
          setCat={setCat} setSearch={setSearch} onRefresh={onRefresh} openListing={openListing}
        />
      ) : tab === "orders" ? (
        <OrdersTab
          colors={colors} surf={surf} buyOrders={buyOrders} sellOrders={sellOrders} orderSub={orderSub}
          setOrderSub={setOrderSub} setViewOrder={setViewOrder} refreshing={refreshing} onRefresh={onRefresh}
          userId={user?.id}
        />
      ) : (
        <DashboardTab
          colors={colors} surf={surf} isDark={isDark} profile={profile} myListings={myListings}
          sellOrders={sellOrders} totalEarned={totalEarned} activeOrdersCount={activeOrdersCount}
          refreshing={refreshing} onRefresh={onRefresh} openListing={openListing}
          startEdit={startEdit} toggleActive={toggleActive} resetForm={resetForm} setShowCreate={setShowCreate}
        />
      )}

      {/* ── Modals ── */}
      <ListingModal
        visible={!!viewListing} listing={viewListing} reviews={reviews} userId={user?.id}
        profile={profile} colors={colors} isDark={isDark} insets={insets} ordering={ordering}
        onClose={() => setViewListing(null)} onOrder={placeOrder} onEdit={startEdit} onDelete={removeListing}
      />
      <OrderModal
        visible={!!viewOrder} order={viewOrder} userId={user?.id} colors={colors} insets={insets}
        submitting={submitting} showDeliver={showDeliver} deliveryMsg={deliveryMsg}
        reviewStars={reviewStars} reviewText={reviewText}
        setReviewStars={setReviewStars} setReviewText={setReviewText} setDeliveryMsg={setDeliveryMsg}
        setShowDeliver={setShowDeliver}
        onClose={() => { setViewOrder(null); setShowDeliver(false); }}
        onUpdateStatus={updateStatus} onPostReview={postReview}
      />
      <CreateModal
        visible={showCreate} editTarget={editTarget} colors={colors} isDark={isDark} insets={insets}
        fTitle={fTitle} fDesc={fDesc} fPrice={fPrice} fDays={fDays} fEmoji={fEmoji} fCat={fCat} fReqs={fReqs} fTags={fTags} saving={saving}
        setFTitle={setFTitle} setFDesc={setFDesc} setFPrice={setFPrice} setFDays={setFDays}
        setFEmoji={setFEmoji} setFCat={setFCat} setFReqs={setFReqs} setFTags={setFTags}
        onClose={() => { setShowCreate(false); resetForm(); }} onSave={saveListing}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPLORE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ExploreTab({ colors, isDark, surf, filtered, featuredListings, topRated, cat, search, refreshing, setCat, setSearch, onRefresh, openListing }: any) {
  return (
    <FlatList
      data={filtered}
      keyExtractor={(i) => i.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
      contentContainerStyle={{ paddingBottom: 40, gap: 12, paddingTop: 12 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          {/* Search */}
          <View style={[st.searchBar, { backgroundColor: surf, marginHorizontal: 16 }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[st.searchInput, { color: colors.text }]}
              placeholder="Search services, skills, sellers…"
              placeholderTextColor={colors.textMuted}
              value={search} onChangeText={setSearch} returnKeyType="search"
            />
            {search ? <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity> : null}
          </View>

          {/* Categories */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {CATS.map((c) => {
              const active = cat === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setCat(c.key)}
                  style={[st.catChip, { backgroundColor: active ? c.color : surf, borderColor: active ? c.color : colors.border }]}
                  activeOpacity={0.7}
                >
                  <Ionicons name={c.icon as any} size={13} color={active ? "#fff" : c.color} />
                  <Text style={[st.catChipText, { color: active ? "#fff" : colors.text }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Featured Banner — only shown on All with no search */}
          {cat === "All" && !search && featuredListings.length > 0 && (
            <View style={{ gap: 10 }}>
              <View style={st.sectionHeader}>
                <Text style={[st.sectionTitle, { color: colors.text }]}>🔥 Trending Now</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                {featuredListings.map((l: Listing) => (
                  <TouchableOpacity key={l.id} style={[st.featuredCard, { backgroundColor: surf }]} onPress={() => openListing(l)} activeOpacity={0.82}>
                    <LinearGradient colors={[colors.accent + "22", colors.accent + "05"]} style={st.featuredGrad}>
                      <Text style={st.featuredEmoji}>{l.emoji}</Text>
                      <View style={st.featuredInfo}>
                        <Text style={[st.featuredTitle, { color: colors.text }]} numberOfLines={2}>{l.title}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <Stars n={l.rating} size={10} />
                          <Text style={{ fontSize: 11, color: colors.textMuted }}>({l.review_count})</Text>
                        </View>
                      </View>
                      <View style={[st.featuredPrice, { backgroundColor: Colors.gold + "18" }]}>
                        <AcoinBadge amount={l.price} size="sm" />
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Top Rated — only on All, no search */}
          {cat === "All" && !search && topRated.length > 0 && (
            <View style={st.sectionHeader}>
              <Text style={[st.sectionTitle, { color: colors.text }]}>⭐ Top Rated</Text>
              <Text style={[st.sectionCount, { color: colors.textMuted }]}>{topRated.length} services</Text>
            </View>
          )}

          {/* Grid header for filtered results */}
          {(cat !== "All" || !!search) && (
            <View style={[st.sectionHeader, { paddingHorizontal: 16 }]}>
              <Text style={[st.sectionTitle, { color: colors.text }]}>{filtered.length} Services</Text>
              {cat !== "All" && (
                <TouchableOpacity onPress={() => setCat("All")} style={[st.clearFilter, { backgroundColor: colors.accent + "14" }]}>
                  <Text style={{ fontSize: 12, color: colors.accent, fontWeight: "600" }}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => <ListingGridCard item={item} colors={colors} openListing={openListing} />}
      ListEmptyComponent={
        <View style={st.emptyWrap}>
          <View style={[st.emptyIcon, { backgroundColor: colors.accent + "12" }]}>
            <Ionicons name="search" size={36} color={colors.accent} />
          </View>
          <Text style={[st.emptyTitle, { color: colors.text }]}>No services found</Text>
          <Text style={[st.emptySub, { color: colors.textMuted }]}>Try a different category or search term</Text>
          <TouchableOpacity onPress={() => { setCat("All"); setSearch(""); }} style={[st.emptyBtn, { backgroundColor: colors.accent }]}>
            <Text style={st.emptyBtnText}>Browse All</Text>
          </TouchableOpacity>
        </View>
      }
    />
  );
}

function ListingGridCard({ item, colors, openListing }: { item: Listing; colors: any; openListing: (l: Listing) => void }) {
  const cat = CATS.find((c) => c.key === item.category);
  return (
    <TouchableOpacity style={[st.gridCard, { backgroundColor: colors.surface, width: CARD_W }]} onPress={() => openListing(item)} activeOpacity={0.78}>
      {/* Emoji hero */}
      <LinearGradient colors={[cat?.color + "22" || "#00BCD422", cat?.color + "06" || "#00BCD406"]} style={st.gridEmojiWrap}>
        <Text style={st.gridEmoji}>{item.emoji}</Text>
        {item.orders_count > 0 && (
          <View style={[st.gridBadge, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: "600" }}>{item.orders_count} sold</Text>
          </View>
        )}
      </LinearGradient>

      {/* Content */}
      <View style={st.gridContent}>
        <Text style={[st.gridTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
          <Avatar uri={item.seller_avatar} name={item.seller_name} size={16} />
          <Text style={[st.gridHandle, { color: colors.textMuted }]} numberOfLines={1}>@{item.seller_handle}</Text>
        </View>
        <View style={st.gridFooter}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons name="star" size={10} color="#FFD60A" />
            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "600" }}>{item.rating.toFixed(1)}</Text>
          </View>
          <View style={[st.gridPricePill, { backgroundColor: Colors.gold + "16" }]}>
            <Text style={{ fontSize: 12 }}>🪙</Text>
            <Text style={[st.gridPrice, { color: Colors.gold }]}>{item.price}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
          <Ionicons name="time-outline" size={10} color={colors.textMuted} />
          <Text style={{ fontSize: 10, color: colors.textMuted }}>{item.delivery_days}d delivery</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function OrdersTab({ colors, surf, buyOrders, sellOrders, orderSub, setOrderSub, setViewOrder, refreshing, onRefresh, userId }: any) {
  const list: Order[] = orderSub === "buying" ? buyOrders : sellOrders;

  return (
    <View style={{ flex: 1 }}>
      {/* Sub-tabs */}
      <View style={[st.subTabRow, { backgroundColor: surf, borderBottomColor: colors.border }]}>
        {(["buying", "selling"] as const).map((s) => {
          const count = s === "buying" ? buyOrders.length : sellOrders.length;
          const active = orderSub === s;
          return (
            <TouchableOpacity key={s} style={[st.subTab, active && { borderBottomColor: colors.accent, borderBottomWidth: 2.5 }]} onPress={() => setOrderSub(s)} activeOpacity={0.7}>
              <Text style={[st.subTabText, { color: active ? colors.accent : colors.textMuted }]}>
                {s === "buying" ? "My Purchases" : "My Sales"}
              </Text>
              {count > 0 && (
                <View style={[st.subTabBadge, { backgroundColor: active ? colors.accent : colors.border }]}>
                  <Text style={{ fontSize: 11, color: active ? "#fff" : colors.textMuted, fontWeight: "700" }}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderItem={({ item }) => <OrderCard item={item} colors={colors} userId={userId} onPress={() => setViewOrder(item)} />}
        ListEmptyComponent={
          <View style={st.emptyWrap}>
            <View style={[st.emptyIcon, { backgroundColor: colors.accent + "12" }]}>
              <Ionicons name={orderSub === "buying" ? "bag-handle" : "cube"} size={36} color={colors.accent} />
            </View>
            <Text style={[st.emptyTitle, { color: colors.text }]}>No {orderSub === "buying" ? "purchases" : "sales"} yet</Text>
            <Text style={[st.emptySub, { color: colors.textMuted }]}>
              {orderSub === "buying" ? "Explore the marketplace to hire talent" : "List a service to start earning"}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function OrderCard({ item, colors, userId, onPress }: { item: Order; colors: any; userId?: string; onPress: () => void }) {
  const isSeller = item.seller_id === userId;
  const sm = STATUS_META[item.status] || STATUS_META.pending;
  const other = isSeller
    ? { name: item.buyer_name, handle: item.buyer_handle, avatar: item.buyer_avatar }
    : { name: item.seller_name, handle: item.seller_handle, avatar: item.seller_avatar };
  const stepIdx = ORDER_STEPS.indexOf(item.status);

  return (
    <TouchableOpacity style={[st.orderCard, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.78}>
      {/* Top row */}
      <View style={st.ocTop}>
        <View style={[st.ocEmojiWrap, { backgroundColor: sm.bg }]}>
          <Text style={st.ocEmoji}>{item.listing_emoji}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[st.ocTitle, { color: colors.text }]} numberOfLines={2}>{item.listing_title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Avatar uri={other.avatar} name={other.name} size={16} />
            <Text style={[st.ocRole, { color: colors.textMuted }]}>{isSeller ? "Buyer" : "Seller"}: @{other.handle}</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={[st.statusPill, { backgroundColor: sm.bg }]}>
            <Ionicons name={sm.icon as any} size={10} color={sm.color} />
            <Text style={[st.statusPillText, { color: sm.color }]}>{sm.label}</Text>
          </View>
          <AcoinBadge amount={item.price_paid} size="sm" />
        </View>
      </View>

      {/* Progress bar — only for non-terminal orders */}
      {!["completed", "cancelled", "disputed"].includes(item.status) && (
        <View style={[st.progressWrap, { borderTopColor: colors.border }]}>
          {ORDER_STEPS.map((step, i) => {
            const done = i <= stepIdx;
            return (
              <View key={step} style={{ flex: 1, alignItems: "center" }}>
                <View style={[st.progressDot, { backgroundColor: done ? colors.accent : colors.border }]}>
                  {done && <Ionicons name="checkmark" size={9} color="#fff" />}
                </View>
                {i < ORDER_STEPS.length - 1 && (
                  <View style={[st.progressLine, { backgroundColor: i < stepIdx ? colors.accent : colors.border, position: "absolute", left: "50%", top: 7 }]} />
                )}
              </View>
            );
          })}
        </View>
      )}

      <View style={[st.ocBottom, { borderTopColor: colors.border }]}>
        <Text style={[st.ocTime, { color: colors.textMuted }]}>{elapsed(item.created_at)}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: "500" }}>View details</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardTab({ colors, surf, isDark, profile, myListings, sellOrders, totalEarned, activeOrdersCount, refreshing, onRefresh, openListing, startEdit, toggleActive, resetForm, setShowCreate }: any) {
  const completedCount = sellOrders.filter((o: Order) => o.status === "completed").length;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 60, gap: 16 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Stats banner */}
      <LinearGradient colors={isDark ? ["#0D2137", "#0A1A2E"] : ["#004E5C", "#00717F"]} style={st.dashBanner}>
        <Text style={st.dashBannerTitle}>Seller Dashboard</Text>
        <Text style={st.dashBannerSub}>@{profile?.handle || "you"}</Text>
        <View style={st.dashStats}>
          {[
            { icon: "cash",              label: "Earned",   value: `${totalEarned.toLocaleString()}`, accent: Colors.gold },
            { icon: "flash",             label: "Active",   value: `${activeOrdersCount}`,            accent: "#00E5FF" },
            { icon: "storefront",        label: "Services", value: `${myListings.length}`,            accent: "#A78BFA" },
            { icon: "checkmark-circle",  label: "Done",     value: `${completedCount}`,              accent: "#34C759" },
          ].map((s, i) => (
            <View key={i} style={st.dashStat}>
              <View style={[st.dashStatIcon, { backgroundColor: s.accent + "22" }]}>
                <Ionicons name={s.icon as any} size={18} color={s.accent} />
              </View>
              <Text style={[st.dashStatVal, { color: "#fff" }]}>{s.value}</Text>
              <Text style={st.dashStatLbl}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* My Services section */}
      <View style={{ paddingHorizontal: 16 }}>
        <View style={st.sectionHeader}>
          <Text style={[st.sectionTitle, { color: colors.text }]}>My Services</Text>
          <TouchableOpacity style={[st.newServiceBtn, { backgroundColor: colors.accent }]} onPress={() => { resetForm(); setShowCreate(true); }} activeOpacity={0.8}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>New Service</Text>
          </TouchableOpacity>
        </View>

        {myListings.length === 0 ? (
          <View style={[st.emptyCard, { backgroundColor: surf }]}>
            <Text style={{ fontSize: 48, marginBottom: 8 }}>💼</Text>
            <Text style={[st.emptyTitle, { color: colors.text }]}>No services yet</Text>
            <Text style={[st.emptySub, { color: colors.textMuted, marginBottom: 16 }]}>Start earning by offering your skills to the community</Text>
            <TouchableOpacity style={[st.emptyBtn, { backgroundColor: colors.accent }]} onPress={() => { resetForm(); setShowCreate(true); }}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={st.emptyBtnText}>Create First Service</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {myListings.map((l: Listing) => (
              <TouchableOpacity key={l.id} style={[st.myServiceCard, { backgroundColor: surf }]} onPress={() => openListing(l)} activeOpacity={0.78}>
                <View style={st.mscTop}>
                  <View style={[st.mscEmoji, { backgroundColor: colors.accent + "12" }]}>
                    <Text style={{ fontSize: 22 }}>{l.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[st.mscTitle, { color: colors.text }]} numberOfLines={1}>{l.title}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Ionicons name="cart" size={11} color={colors.textMuted} />
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>{l.orders_count} orders</Text>
                      </View>
                      <Stars n={l.rating} size={10} />
                      <Text style={{ fontSize: 11, color: colors.textMuted }}>{l.rating.toFixed(1)}</Text>
                    </View>
                    {!l.is_active && (
                      <View style={[st.pausedBadge, { backgroundColor: "#FF950015" }]}>
                        <Ionicons name="pause-circle" size={11} color="#FF9500" />
                        <Text style={{ fontSize: 11, color: "#FF9500", fontWeight: "600" }}>Paused</Text>
                      </View>
                    )}
                  </View>
                  <AcoinBadge amount={l.price} size="sm" />
                </View>

                <View style={[st.mscActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity style={[st.mscBtn, { backgroundColor: colors.accent + "12" }]} onPress={() => startEdit(l)}>
                    <Ionicons name="create-outline" size={13} color={colors.accent} />
                    <Text style={[st.mscBtnText, { color: colors.accent }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.mscBtn, { backgroundColor: l.is_active ? "#FF950014" : "#34C75914" }]} onPress={() => toggleActive(l)}>
                    <Ionicons name={l.is_active ? "pause-circle-outline" : "play-circle-outline"} size={13} color={l.is_active ? "#FF9500" : "#34C759"} />
                    <Text style={[st.mscBtnText, { color: l.is_active ? "#FF9500" : "#34C759" }]}>{l.is_active ? "Pause" : "Activate"}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LISTING MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function ListingModal({ visible, listing, reviews, userId, profile, colors, isDark, insets, ordering, onClose, onOrder, onEdit, onDelete }: any) {
  if (!visible || !listing) return null;
  const l: Listing = listing;
  const own = l.seller_id === userId;
  const cat = CATS.find((c) => c.key === l.category);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[st.modal, { backgroundColor: colors.backgroundSecondary }]}>
        {/* Nav */}
        <View style={[st.modalNav, { backgroundColor: colors.surface, paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={st.navBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[st.modalNavTitle, { color: colors.text }]} numberOfLines={1}>{l.title}</Text>
          {own
            ? <TouchableOpacity onPress={() => { onClose(); onEdit(l); }} hitSlop={12} style={st.navBtn}><Ionicons name="create-outline" size={20} color={colors.accent} /></TouchableOpacity>
            : <View style={{ width: 36 }} />}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
          {/* Hero */}
          <LinearGradient colors={[cat?.color + "22" || "#00BCD422", "transparent"]} style={st.listingHero}>
            <View style={st.listingHeroEmoji}>
              <Text style={{ fontSize: 60 }}>{l.emoji}</Text>
            </View>
            <Text style={[st.listingHeroTitle, { color: colors.text }]}>{l.title}</Text>
            <TouchableOpacity style={st.sellerRow} onPress={() => router.push({ pathname: "/contact/[id]", params: { id: l.seller_id } })} activeOpacity={0.7}>
              <Avatar uri={l.seller_avatar} name={l.seller_name} size={28} />
              <View>
                <Text style={[st.sellerName, { color: colors.text }]}>{l.seller_name}</Text>
                <Text style={[st.sellerHandle, { color: colors.textMuted }]}>@{l.seller_handle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginLeft: "auto" }} />
            </TouchableOpacity>

            {/* Stats row */}
            <View style={[st.listingStats, { backgroundColor: colors.surface }]}>
              {[
                { icon: "star",   val: l.rating.toFixed(1), sub: `${l.review_count} reviews`, color: "#FFD60A" },
                { icon: "cart",   val: `${l.orders_count}`,  sub: "orders",                    color: colors.accent },
                { icon: "time",   val: `${l.delivery_days}d`, sub: "delivery",                 color: "#5856D6" },
              ].map((s, i) => (
                <View key={i} style={[st.listingStatItem, i < 2 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border }]}>
                  <Ionicons name={s.icon as any} size={16} color={s.color} />
                  <Text style={[st.listingStatVal, { color: colors.text }]}>{s.val}</Text>
                  <Text style={[st.listingStatSub, { color: colors.textMuted }]}>{s.sub}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>

          {/* Description */}
          <View style={[st.section, { backgroundColor: colors.surface }]}>
            <Text style={[st.secTitle, { color: colors.text }]}>About This Service</Text>
            <Text style={[st.secBody, { color: colors.textSecondary }]}>{l.description || "No description provided."}</Text>
          </View>

          {/* Tags */}
          {l.tags.length > 0 && (
            <View style={[st.section, { backgroundColor: colors.surface }]}>
              <Text style={[st.secTitle, { color: colors.text }]}>Tags</Text>
              <View style={st.tagWrap}>
                {l.tags.map((t: string, i: number) => (
                  <View key={i} style={[st.tag, { backgroundColor: colors.accent + "12" }]}>
                    <Text style={[st.tagText, { color: colors.accent }]}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Requirements */}
          {!!l.requirements && (
            <View style={[st.section, { backgroundColor: colors.surface }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Ionicons name="information-circle" size={18} color={colors.accent} />
                <Text style={[st.secTitle, { color: colors.text, marginBottom: 0 }]}>What I Need From You</Text>
              </View>
              <Text style={[st.secBody, { color: colors.textSecondary }]}>{l.requirements}</Text>
            </View>
          )}

          {/* Reviews */}
          <View style={[st.section, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Ionicons name="star" size={16} color="#FFD60A" />
              <Text style={[st.secTitle, { color: colors.text, marginBottom: 0 }]}>Reviews ({reviews.length})</Text>
            </View>
            {reviews.length === 0 ? (
              <Text style={[st.secBody, { color: colors.textMuted }]}>No reviews yet. Be the first!</Text>
            ) : (
              reviews.map((r: Review) => (
                <View key={r.id} style={[st.reviewItem, { borderTopColor: colors.border }]}>
                  <View style={st.reviewHead}>
                    <Avatar uri={r.reviewer_avatar} name={r.reviewer_name} size={28} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[st.reviewUser, { color: colors.text }]}>@{r.reviewer_handle}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Stars n={r.rating} size={11} />
                        <Text style={[st.reviewTime, { color: colors.textMuted }]}>{elapsed(r.created_at)}</Text>
                      </View>
                    </View>
                  </View>
                  {r.comment ? <Text style={[st.secBody, { color: colors.textSecondary, marginTop: 6 }]}>{r.comment}</Text> : null}
                </View>
              ))
            )}
          </View>

          {/* Danger zone for own listing */}
          {own && (
            <View style={[st.section, { backgroundColor: colors.surface }]}>
              <TouchableOpacity style={st.destructBtn} onPress={() => onDelete(l)}>
                <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                <Text style={{ color: "#FF3B30", fontWeight: "600", fontSize: 14 }}>Delete Service</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Buy CTA */}
        {!own && (
          <View style={[st.stickyFooter, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            <View>
              <AcoinBadge amount={l.price} size="lg" />
              <Text style={[st.footerSub, { color: colors.textMuted }]}>{l.delivery_days}-day delivery</Text>
            </View>
            <TouchableOpacity style={[st.orderBtn, { backgroundColor: colors.accent }]} onPress={() => onOrder(l)} disabled={ordering} activeOpacity={0.85}>
              {ordering
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="flash" size={18} color="#fff" />
                    <Text style={st.orderBtnText}>Order Now</Text>
                  </>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDER MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function OrderModal({ visible, order, userId, colors, insets, submitting, showDeliver, deliveryMsg, reviewStars, reviewText, setReviewStars, setReviewText, setDeliveryMsg, setShowDeliver, onClose, onUpdateStatus, onPostReview }: any) {
  if (!visible || !order) return null;
  const o: Order = order;
  const isSeller = o.seller_id === userId;
  const sm = STATUS_META[o.status] || STATUS_META.pending;
  const stepIdx = ORDER_STEPS.indexOf(o.status);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[st.modal, { backgroundColor: colors.backgroundSecondary }]}>
          {/* Nav */}
          <View style={[st.modalNav, { backgroundColor: colors.surface, paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={st.navBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[st.modalNavTitle, { color: colors.text }]}>Order Details</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>
            {/* Hero */}
            <View style={[st.section, { backgroundColor: colors.surface, alignItems: "center" }]}>
              <View style={[st.ocEmojiWrap, { backgroundColor: sm.bg, width: 64, height: 64, borderRadius: 20 }]}>
                <Text style={{ fontSize: 32 }}>{o.listing_emoji}</Text>
              </View>
              <Text style={[st.listingHeroTitle, { color: colors.text, fontSize: 18, marginTop: 10, textAlign: "center" }]}>{o.listing_title}</Text>
              <View style={[st.statusPill, { backgroundColor: sm.bg, marginTop: 10, paddingHorizontal: 14, paddingVertical: 6 }]}>
                <Ionicons name={sm.icon as any} size={13} color={sm.color} />
                <Text style={[st.statusPillText, { color: sm.color, fontSize: 13 }]}>{sm.label}</Text>
              </View>
            </View>

            {/* Progress stepper */}
            {!["cancelled", "disputed"].includes(o.status) && (
              <View style={[st.section, { backgroundColor: colors.surface }]}>
                <Text style={[st.secTitle, { color: colors.text }]}>Progress</Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {ORDER_STEPS.map((step, i) => {
                    const done = i <= stepIdx;
                    return (
                      <React.Fragment key={step}>
                        <View style={{ alignItems: "center", gap: 4 }}>
                          <View style={[st.stepDot, { backgroundColor: done ? colors.accent : colors.border, borderColor: done ? colors.accent : colors.border }]}>
                            {done && <Ionicons name="checkmark" size={11} color="#fff" />}
                          </View>
                          <Text style={{ fontSize: 9, color: done ? colors.accent : colors.textMuted, fontWeight: done ? "700" : "400", textAlign: "center" }}>
                            {STATUS_META[step]?.label || step}
                          </Text>
                        </View>
                        {i < ORDER_STEPS.length - 1 && (
                          <View style={[st.stepLine, { backgroundColor: i < stepIdx ? colors.accent : colors.border }]} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Info rows */}
            <View style={[st.section, { backgroundColor: colors.surface }]}>
              {[
                { label: "Amount",    val: null,              acoin: o.price_paid },
                { label: "Seller",    val: `@${o.seller_handle}`, link: o.seller_id },
                { label: "Buyer",     val: `@${o.buyer_handle}`,  link: o.buyer_id  },
                { label: "Ordered",   val: new Date(o.created_at).toLocaleDateString() },
                ...(o.completed_at ? [{ label: "Completed", val: new Date(o.completed_at).toLocaleDateString() }] : []),
                { label: "Revisions", val: `${o.revision_count} / ${o.max_revisions}` },
              ].map((r: any, i) => (
                <View key={i} style={[st.infoRow, { borderBottomColor: colors.border }]}>
                  <Text style={[st.infoLabel, { color: colors.textMuted }]}>{r.label}</Text>
                  {r.acoin != null
                    ? <AcoinBadge amount={r.acoin} size="sm" />
                    : r.link
                      ? <TouchableOpacity onPress={() => { onClose(); router.push({ pathname: "/contact/[id]", params: { id: r.link } }); }}>
                          <Text style={[st.infoVal, { color: colors.accent }]}>{r.val}</Text>
                        </TouchableOpacity>
                      : <Text style={[st.infoVal, { color: colors.text }]}>{r.val}</Text>}
                </View>
              ))}
            </View>

            {o.buyer_note ? (
              <View style={[st.section, { backgroundColor: colors.surface }]}>
                <Text style={[st.secTitle, { color: colors.text }]}>Buyer Note</Text>
                <Text style={[st.secBody, { color: colors.textSecondary }]}>{o.buyer_note}</Text>
              </View>
            ) : null}

            {o.delivery_message ? (
              <View style={[st.section, { backgroundColor: colors.surface }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Ionicons name="cube" size={16} color="#5856D6" />
                  <Text style={[st.secTitle, { color: colors.text, marginBottom: 0 }]}>Delivery</Text>
                </View>
                <Text style={[st.secBody, { color: colors.textSecondary }]}>{o.delivery_message}</Text>
              </View>
            ) : null}

            {o.cancel_reason ? (
              <View style={[st.section, { backgroundColor: "#FF3B3010" }]}>
                <Text style={[st.secTitle, { color: "#FF3B30" }]}>Cancellation Reason</Text>
                <Text style={[st.secBody, { color: "#FF3B30" }]}>{o.cancel_reason}</Text>
              </View>
            ) : null}

            {/* Review form */}
            {o.status === "completed" && !isSeller && (
              <View style={[st.section, { backgroundColor: colors.surface }]}>
                <Text style={[st.secTitle, { color: colors.text }]}>Leave a Review</Text>
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <TouchableOpacity key={s} onPress={() => setReviewStars(s)} hitSlop={4}>
                      <Ionicons name={reviewStars >= s ? "star" : "star-outline"} size={32} color="#FFD60A" />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[st.textarea, { backgroundColor: colors.backgroundSecondary, color: colors.text, borderColor: colors.border }]}
                  placeholder="Share your experience with this seller…"
                  placeholderTextColor={colors.textMuted}
                  value={reviewText} onChangeText={setReviewText} multiline
                />
                <TouchableOpacity style={[st.primaryBtn, { backgroundColor: colors.accent }]} onPress={() => onPostReview(o)} disabled={submitting}>
                  {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.primaryBtnText}>Submit Review</Text>}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Action buttons */}
          {!["completed", "cancelled"].includes(o.status) && !showDeliver && (
            <View style={[st.stickyFooter, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 12, gap: 10, flexWrap: "wrap" }]}>
              {isSeller && o.status === "pending" && (
                <>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.accent, flex: 1 }]} onPress={() => onUpdateStatus(o, "in_progress")}>
                    <Ionicons name="play" size={15} color="#fff" />
                    <Text style={st.actionBtnText}>Start Work</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#FF3B3014", flex: 1 }]} onPress={() => onUpdateStatus(o, "cancelled", "Seller declined")}>
                    <Text style={[st.actionBtnTextAlt, { color: "#FF3B30" }]}>Decline</Text>
                  </TouchableOpacity>
                </>
              )}
              {isSeller && (o.status === "in_progress" || o.status === "revision") && (
                <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#5856D6", flex: 1 }]} onPress={() => setShowDeliver(true)}>
                  <Ionicons name="cube" size={15} color="#fff" />
                  <Text style={st.actionBtnText}>Deliver Work</Text>
                </TouchableOpacity>
              )}
              {!isSeller && o.status === "delivered" && (
                <>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#34C759", flex: 1 }]} onPress={() => onUpdateStatus(o, "completed")}>
                    <Ionicons name="checkmark-circle" size={15} color="#fff" />
                    <Text style={st.actionBtnText}>Accept</Text>
                  </TouchableOpacity>
                  {o.revision_count < o.max_revisions && (
                    <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#FF6B3514", flex: 1 }]} onPress={() => onUpdateStatus(o, "revision")}>
                      <Text style={[st.actionBtnTextAlt, { color: "#FF6B35" }]}>Request Revision</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {!isSeller && o.status === "pending" && (
                <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#FF3B3014", flex: 1 }]} onPress={() => onUpdateStatus(o, "cancelled", "Buyer cancelled")}>
                  <Text style={[st.actionBtnTextAlt, { color: "#FF3B30" }]}>Cancel & Refund</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Delivery form */}
          {showDeliver && (
            <View style={[st.deliverSheet, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
              <Text style={[st.secTitle, { color: colors.text }]}>Delivery Message</Text>
              <TextInput
                style={[st.textarea, { backgroundColor: colors.backgroundSecondary, color: colors.text, borderColor: colors.border }]}
                placeholder="Describe what you're delivering and any relevant links…"
                placeholderTextColor={colors.textMuted}
                value={deliveryMsg} onChangeText={setDeliveryMsg} multiline
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.border, flex: 1 }]} onPress={() => setShowDeliver(false)}>
                  <Text style={[st.actionBtnTextAlt, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#5856D6", flex: 1 }]} onPress={() => onUpdateStatus(o, "delivered", deliveryMsg)} disabled={submitting}>
                  {submitting ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="send" size={14} color="#fff" /><Text style={st.actionBtnText}>Send Delivery</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE / EDIT MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function CreateModal({ visible, editTarget, colors, isDark, insets, fTitle, fDesc, fPrice, fDays, fEmoji, fCat, fReqs, fTags, saving, setFTitle, setFDesc, setFPrice, setFDays, setFEmoji, setFCat, setFReqs, setFTags, onClose, onSave }: any) {
  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</Text>
        {children}
      </View>
    );
  }
  function Input({ value, onChangeText, placeholder, numeric, maxLength, multiline, style: extraStyle }: any) {
    return (
      <TextInput
        style={[st.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }, extraStyle]}
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={colors.textMuted} keyboardType={numeric ? "numeric" : "default"}
        maxLength={maxLength} multiline={multiline}
      />
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[st.modal, { backgroundColor: colors.backgroundSecondary }]}>
          {/* Nav */}
          <View style={[st.modalNav, { backgroundColor: colors.surface, paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={st.navBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[st.modalNavTitle, { color: colors.text }]}>{editTarget ? "Edit Service" : "New Service"}</Text>
            <TouchableOpacity onPress={onSave} disabled={saving} style={[st.navSaveBtn, { backgroundColor: colors.accent }]}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>{editTarget ? "Save" : "Publish"}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Icon + Title */}
            <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-end" }}>
              <Field label="Icon">
                <View style={[st.emojiInput, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput style={[{ fontSize: 28, textAlign: "center" }]} value={fEmoji} onChangeText={setFEmoji} maxLength={4} />
                </View>
              </Field>
              <View style={{ flex: 1 }}>
                <Field label="Service Title">
                  <Input value={fTitle} onChangeText={setFTitle} placeholder="e.g. I will design your logo" maxLength={100} />
                </Field>
              </View>
            </View>

            {/* Category */}
            <Field label="Category">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {CATS.filter((c) => c.key !== "All").map((c) => (
                  <TouchableOpacity
                    key={c.key}
                    style={[st.catChip, { backgroundColor: fCat === c.key ? c.color : colors.surface, borderColor: fCat === c.key ? c.color : colors.border }]}
                    onPress={() => setFCat(c.key)}
                  >
                    <Ionicons name={c.icon as any} size={13} color={fCat === c.key ? "#fff" : c.color} />
                    <Text style={[st.catChipText, { color: fCat === c.key ? "#fff" : colors.text }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Field>

            {/* Price & Days */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Price (ACoin)">
                  <View style={[st.input, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 6 }]}>
                    <Text style={{ fontSize: 16 }}>🪙</Text>
                    <TextInput style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: "600" }} value={fPrice} onChangeText={setFPrice} placeholder="200" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                  </View>
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Delivery (days)">
                  <View style={[st.input, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 6 }]}>
                    <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                    <TextInput style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: "600" }} value={fDays} onChangeText={setFDays} placeholder="3" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                  </View>
                </Field>
              </View>
            </View>

            {/* Description */}
            <Field label="Description">
              <Input value={fDesc} onChangeText={setFDesc} placeholder="Describe what you'll deliver in detail…" multiline style={{ minHeight: 110, textAlignVertical: "top" }} />
            </Field>

            {/* Requirements */}
            <Field label="What you need from buyers">
              <Input value={fReqs} onChangeText={setFReqs} placeholder="List what info you need to start…" multiline style={{ minHeight: 80, textAlignVertical: "top" }} />
            </Field>

            {/* Tags */}
            <Field label="Tags (comma-separated)">
              <Input value={fTags} onChangeText={setFTags} placeholder="logo, branding, figma" />
            </Field>

            {/* Publish button */}
            <TouchableOpacity style={[st.primaryBtn, { backgroundColor: colors.accent }]} onPress={onSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Ionicons name={editTarget ? "save-outline" : "rocket-outline"} size={18} color="#fff" /><Text style={st.primaryBtnText}>{editTarget ? "Save Changes" : "Publish Service"}</Text></>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  // Header
  header: { paddingHorizontal: 20, paddingBottom: 0, gap: 16 },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerEyebrow: { fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" },
  headerTitle: { fontSize: 24, color: "#fff", fontWeight: "800", letterSpacing: -0.5 },
  walletChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  walletChipText: { fontSize: 13, color: "#fff", fontWeight: "700" },
  activeOrdersBubble: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,149,0,0.15)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },

  // Tab bar
  tabBar: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 16, padding: 4, marginBottom: 12 },
  tabItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 13 },
  tabActive: { backgroundColor: "#fff" },
  tabLabel: { fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: "600" },
  tabLabelActive: { color: "#00BCD4" },

  // Offline
  offlineBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FF9500", paddingHorizontal: 16, paddingVertical: 8 },
  offlineText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  // Section headers
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  sectionCount: { fontSize: 13 },
  clearFilter: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },

  // Search
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  searchInput: { flex: 1, fontSize: 15 },

  // Category chips
  catChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  catChipText: { fontSize: 12, fontWeight: "600" },

  // Featured cards
  featuredCard: { width: 200, borderRadius: 16, overflow: "hidden" },
  featuredGrad: { padding: 14, gap: 8 },
  featuredEmoji: { fontSize: 32 },
  featuredInfo: { gap: 2 },
  featuredTitle: { fontSize: 14, fontWeight: "700", lineHeight: 19 },
  featuredPrice: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, alignSelf: "flex-start", marginTop: 4 },

  // Grid cards
  gridCard: { borderRadius: 16, overflow: "hidden", marginBottom: 4 },
  gridEmojiWrap: { paddingVertical: 20, alignItems: "center", justifyContent: "center", position: "relative" },
  gridEmoji: { fontSize: 34 },
  gridBadge: { position: "absolute", bottom: 6, right: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  gridContent: { padding: 12 },
  gridTitle: { fontSize: 13, fontWeight: "700", lineHeight: 18 },
  gridHandle: { fontSize: 11 },
  gridFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  gridPricePill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  gridPrice: { fontSize: 12, fontWeight: "700" },

  // Order cards
  orderCard: { borderRadius: 16, overflow: "hidden" },
  ocTop: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  ocEmojiWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  ocEmoji: { fontSize: 22 },
  ocTitle: { fontSize: 14, fontWeight: "700", flex: 1 },
  ocRole: { fontSize: 12 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  progressWrap: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, position: "relative" },
  progressDot: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  progressLine: { height: 2, flex: 1, position: "absolute", top: 21, left: "50%", right: 0, width: "100%" },
  ocBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  ocTime: { fontSize: 12 },

  // Sub-tabs (orders)
  subTabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  subTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14 },
  subTabText: { fontSize: 14, fontWeight: "600" },
  subTabBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },

  // Dashboard
  dashBanner: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24, gap: 4 },
  dashBannerTitle: { fontSize: 20, color: "#fff", fontWeight: "800" },
  dashBannerSub: { fontSize: 13, color: "rgba(255,255,255,0.6)" },
  dashStats: { flexDirection: "row", marginTop: 16, gap: 10 },
  dashStat: { flex: 1, alignItems: "center", gap: 6 },
  dashStatIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dashStatVal: { fontSize: 18, fontWeight: "800" },
  dashStatLbl: { fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: "600" },

  newServiceBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },

  myServiceCard: { borderRadius: 16, overflow: "hidden" },
  mscTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  mscEmoji: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  mscTitle: { fontSize: 15, fontWeight: "700" },
  pausedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: "flex-start" },
  mscActions: { flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  mscBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 12 },
  mscBtnText: { fontSize: 13, fontWeight: "700" },

  // Modals
  modal: { flex: 1 },
  modalNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  modalNavTitle: { fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  navBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  navSaveBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12 },

  // Listing modal
  listingHero: { padding: 24, alignItems: "center", gap: 10 },
  listingHeroEmoji: { width: 100, height: 100, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  listingHeroTitle: { fontSize: 22, fontWeight: "800", textAlign: "center", lineHeight: 28 },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.04)", width: "100%" },
  sellerName: { fontSize: 14, fontWeight: "700" },
  sellerHandle: { fontSize: 12 },
  listingStats: { flexDirection: "row", borderRadius: 16, marginTop: 6, width: "100%", overflow: "hidden" },
  listingStatItem: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 4 },
  listingStatVal: { fontSize: 16, fontWeight: "800" },
  listingStatSub: { fontSize: 11 },

  // Sections
  section: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 16 },
  secTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  secBody: { fontSize: 14, lineHeight: 22 },

  // Tags
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  tagText: { fontSize: 12, fontWeight: "600" },

  // Reviews
  reviewItem: { paddingTop: 14, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  reviewUser: { fontSize: 13, fontWeight: "700" },
  reviewTime: { fontSize: 11 },

  // Order info rows
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  infoLabel: { fontSize: 13 },
  infoVal: { fontSize: 14, fontWeight: "600" },

  // Progress stepper
  stepDot: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  stepLine: { flex: 1, height: 2, marginHorizontal: 4 },

  // Sticky footer / actions
  stickyFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  footerSub: { fontSize: 12, marginTop: 3 },
  orderBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
  orderBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14 },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  actionBtnTextAlt: { fontSize: 14, fontWeight: "700" },

  deliverSheet: { padding: 16, gap: 12, borderTopWidth: StyleSheet.hairlineWidth },

  // Forms
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  emojiInput: { width: 70, height: 54, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  textarea: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1, lineHeight: 21 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 16, marginTop: 8 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  // Destructive
  destructBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },

  // Empty states
  emptyWrap: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32, gap: 10 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  emptyCard: { borderRadius: 20, padding: 28, alignItems: "center", gap: 6 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 14 },
  emptyBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
