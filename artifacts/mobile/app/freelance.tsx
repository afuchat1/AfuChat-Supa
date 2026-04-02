import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { transferAcoin } from "@/lib/monetize";
import { showAlert } from "@/lib/alert";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";

const { width: SCREEN_W } = Dimensions.get("window");
const CACHE_KEY_LISTINGS = "afu_freelance_listings";
const CACHE_KEY_ORDERS = "afu_freelance_orders";
const CACHE_TTL = 5 * 60 * 1000;

type Listing = {
  id: string;
  title: string;
  description: string;
  price: number;
  delivery_days: number;
  category: string;
  emoji: string;
  seller_id: string;
  seller_name: string;
  seller_handle: string;
  seller_avatar: string | null;
  orders_count: number;
  rating: number;
  review_count: number;
  tags: string[];
  requirements: string;
  is_active: boolean;
  created_at: string;
};

type Order = {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_emoji: string;
  buyer_id: string;
  buyer_name: string;
  buyer_handle: string;
  buyer_avatar: string | null;
  seller_id: string;
  seller_name: string;
  seller_handle: string;
  seller_avatar: string | null;
  price_paid: number;
  status: string;
  buyer_note: string;
  delivery_message: string;
  revision_count: number;
  max_revisions: number;
  cancel_reason: string | null;
  created_at: string;
  completed_at: string | null;
};

type Review = {
  id: string;
  rating: number;
  comment: string;
  reviewer_name: string;
  reviewer_handle: string;
  reviewer_avatar: string | null;
  created_at: string;
};

const CATS: { key: string; icon: string; label: string }[] = [
  { key: "All", icon: "apps", label: "All" },
  { key: "Design", icon: "color-palette", label: "Design" },
  { key: "Dev", icon: "code-slash", label: "Dev" },
  { key: "Writing", icon: "document-text", label: "Writing" },
  { key: "Marketing", icon: "megaphone", label: "Marketing" },
  { key: "Video", icon: "videocam", label: "Video" },
  { key: "Music", icon: "musical-notes", label: "Music" },
  { key: "AI", icon: "sparkles", label: "AI" },
  { key: "Business", icon: "briefcase", label: "Business" },
  { key: "Other", icon: "ellipsis-horizontal", label: "Other" },
];

const STATUS_META: Record<string, { color: string; icon: string; label: string }> = {
  pending: { color: "#FF9500", icon: "hourglass", label: "Pending" },
  in_progress: { color: "#007AFF", icon: "construct", label: "In Progress" },
  delivered: { color: "#5856D6", icon: "cube", label: "Delivered" },
  revision: { color: "#FF6B35", icon: "refresh", label: "Revision" },
  completed: { color: "#34C759", icon: "checkmark-circle", label: "Completed" },
  cancelled: { color: "#FF3B30", icon: "close-circle", label: "Cancelled" },
  disputed: { color: "#FF2D55", icon: "warning", label: "Disputed" },
};

function elapsed(d: string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d`;
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

export default function FreelanceScreen() {
  const { colors, isDark } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [connected, setConnected] = useState(isOnline());
  const [tab, setTab] = useState<"explore" | "orders" | "seller">("explore");
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
  const activeCount = useMemo(() => orders.filter((o) => !["completed", "cancelled"].includes(o.status)).length, [orders]);
  const earned = useMemo(() => sellOrders.filter((o) => o.status === "completed").reduce((s, o) => s + o.price_paid, 0), [sellOrders]);

  async function placeOrder(l: Listing) {
    if (!user || !profile) { router.push("/(auth)/login"); return; }
    if (!connected) { showAlert("Offline", "You need an internet connection to place an order."); return; }
    if (l.seller_id === user.id) { showAlert("Oops", "You can't buy your own service."); return; }
    if ((profile.acoin || 0) < l.price) {
      showAlert("Insufficient ACoin", `This service costs ${l.price} ACoin. Your balance: ${profile.acoin || 0}.`, [
        { text: "Top Up", onPress: () => router.push("/wallet/topup") }, { text: "Cancel" },
      ]); return;
    }
    showAlert("Confirm Purchase", `Pay ${l.price} ACoin to @${l.seller_handle} for "${l.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: `Pay ${l.price} ACoin`, onPress: async () => {
        setOrdering(true);
        const res = await transferAcoin({ buyerId: user.id, sellerId: l.seller_id, buyerCurrentAcoin: profile.acoin || 0, amount: l.price, transactionType: "monetize_freelance", metadata: { listing_id: l.id, listing_title: l.title } });
        if (res.success) {
          await supabase.from("freelance_orders").insert({ listing_id: l.id, buyer_id: user.id, seller_id: l.seller_id, price_paid: l.price, status: "pending", max_revisions: 1 });
          await supabase.from("freelance_listings").update({ orders_count: l.orders_count + 1 }).eq("id", l.id);
          refreshProfile();
          showAlert("Order Placed!", "Your order has been placed. The seller will begin work soon.");
          setViewListing(null);
          loadAll();
        } else {
          showAlert("Payment Failed", res.error || "Could not complete the transaction.");
        }
        setOrdering(false);
      }},
    ]);
  }

  function resetForm() {
    setFTitle(""); setFDesc(""); setFPrice("200"); setFDays("3"); setFEmoji("💼"); setFCat("Design"); setFReqs(""); setFTags(""); setEditTarget(null);
  }

  async function saveListing() {
    if (!user) return;
    if (!connected) { showAlert("Offline", "Connect to the internet to save."); return; }
    if (!fTitle.trim()) { showAlert("Required", "Enter a title for your service."); return; }
    const price = parseInt(fPrice);
    if (!price || price < 1) { showAlert("Invalid", "Set a valid ACoin price."); return; }
    setSaving(true);
    const payload: any = { title: fTitle.trim(), description: fDesc.trim(), price, emoji: fEmoji, category: fCat, delivery_days: parseInt(fDays) || 3, seller_id: user.id, is_active: true, requirements: fReqs.trim(), tags: fTags.split(",").map((t) => t.trim()).filter(Boolean) };
    const { error } = editTarget ? await supabase.from("freelance_listings").update(payload).eq("id", editTarget.id) : await supabase.from("freelance_listings").insert({ ...payload, orders_count: 0, rating: 5.0, review_count: 0 });
    setSaving(false);
    if (error) { showAlert("Error", error.message); return; }
    showAlert(editTarget ? "Saved" : "Published!", editTarget ? "Your service has been updated." : "Your service is now live.");
    resetForm(); setShowCreate(false); loadAll();
  }

  function startEdit(l: Listing) {
    setEditTarget(l); setFTitle(l.title); setFDesc(l.description); setFPrice(String(l.price)); setFDays(String(l.delivery_days)); setFEmoji(l.emoji); setFCat(l.category); setFReqs(l.requirements); setFTags(l.tags.join(", ")); setShowCreate(true);
  }

  async function toggleActive(l: Listing) {
    if (!connected) return;
    await supabase.from("freelance_listings").update({ is_active: !l.is_active }).eq("id", l.id);
    loadAll();
  }

  async function removeListing(l: Listing) {
    showAlert("Delete Service", `Permanently remove "${l.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await supabase.from("freelance_listings").delete().eq("id", l.id); setViewListing(null); loadAll();
      }},
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
    showAlert("Thank you!", "Your review has been submitted."); loadAll();
  }

  function openListing(l: Listing) { setViewListing(l); fetchReviews(l.id); }

  const OfflineBanner = () => !connected ? (
    <View style={[st.offlineBanner, { backgroundColor: "#FF9500" }]}>
      <Ionicons name="cloud-offline" size={14} color="#fff" />
      <Text style={st.offlineText}>You're offline · Showing cached data</Text>
    </View>
  ) : null;

  const UserChip = ({ avatar, name, handle, id }: { avatar: string | null; name: string; handle: string; id: string }) => (
    <TouchableOpacity style={st.userChip} onPress={() => router.push({ pathname: "/contact/[id]", params: { id } })} activeOpacity={0.7}>
      {avatar ? <Image source={{ uri: avatar }} style={st.chipAvatar} /> : (
        <View style={[st.chipAvatar, { backgroundColor: colors.accent + "20", justifyContent: "center", alignItems: "center" }]}>
          <Ionicons name="person" size={10} color={colors.accent} />
        </View>
      )}
      <Text style={[st.chipHandle, { color: colors.accent }]} numberOfLines={1}>@{handle}</Text>
    </TouchableOpacity>
  );

  const Stars = ({ n, size = 12 }: { n: number; size?: number }) => (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((s) => <Ionicons key={s} name={n >= s ? "star" : n >= s - 0.5 ? "star-half" : "star-outline"} size={size} color="#FFD60A" />)}
    </View>
  );

  const ListingCard = ({ item }: { item: Listing }) => (
    <TouchableOpacity style={[st.listingCard, { backgroundColor: colors.surface }]} onPress={() => openListing(item)} activeOpacity={0.7}>
      <View style={st.lcRow}>
        <View style={[st.emojiCircle, { backgroundColor: colors.accent + "12" }]}>
          <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[st.lcTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
          <UserChip avatar={item.seller_avatar} name={item.seller_name} handle={item.seller_handle} id={item.seller_id} />
        </View>
      </View>
      <Text style={[st.lcDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description || "No description"}</Text>
      <View style={[st.lcDivider, { backgroundColor: colors.border }]} />
      <View style={st.lcFooter}>
        <View style={st.lcMeta}>
          <Stars n={item.rating} />
          <Text style={[st.lcMetaText, { color: colors.textMuted }]}>{item.rating.toFixed(1)}</Text>
        </View>
        <View style={st.lcMeta}>
          <Ionicons name="time-outline" size={12} color={colors.textMuted} />
          <Text style={[st.lcMetaText, { color: colors.textMuted }]}>{item.delivery_days}d</Text>
        </View>
        <View style={st.lcMeta}>
          <Ionicons name="cart-outline" size={12} color={colors.textMuted} />
          <Text style={[st.lcMetaText, { color: colors.textMuted }]}>{item.orders_count}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={[st.priceTag, { backgroundColor: Colors.gold + "18" }]}>
          <Text style={[st.priceVal, { color: Colors.gold }]}>{item.price}</Text>
          <Text style={{ fontSize: 11 }}>🪙</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const OrderCard = ({ item }: { item: Order }) => {
    const me = item.seller_id === user?.id;
    const sm = STATUS_META[item.status] || STATUS_META.pending;
    const other = me ? { name: item.buyer_name, handle: item.buyer_handle, avatar: item.buyer_avatar, id: item.buyer_id } : { name: item.seller_name, handle: item.seller_handle, avatar: item.seller_avatar, id: item.seller_id };
    return (
      <TouchableOpacity style={[st.orderCard, { backgroundColor: colors.surface }]} onPress={() => setViewOrder(item)} activeOpacity={0.7}>
        <View style={st.ocTop}>
          <View style={[st.emojiCircle, { backgroundColor: sm.color + "12", width: 40, height: 40 }]}>
            <Text style={{ fontSize: 18 }}>{item.listing_emoji}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[st.ocTitle, { color: colors.text }]} numberOfLines={1}>{item.listing_title}</Text>
            <Text style={[st.ocSub, { color: colors.textMuted }]}>{me ? "Buyer" : "Seller"}: @{other.handle}</Text>
          </View>
          <View>
            <View style={[st.statusChip, { backgroundColor: sm.color + "14" }]}>
              <Ionicons name={sm.icon as any} size={11} color={sm.color} />
              <Text style={[st.statusLabel, { color: sm.color }]}>{sm.label}</Text>
            </View>
            <Text style={[st.ocTime, { color: colors.textMuted }]}>{elapsed(item.created_at)}</Text>
          </View>
        </View>
        <View style={[st.ocBottom, { borderTopColor: colors.border }]}>
          <Text style={[st.ocPrice, { color: Colors.gold }]}>{item.price_paid} ACoin</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    );
  };

  const ExploreTab = () => (
    <>
      <View style={[st.searchBar, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput style={[st.searchInput, { color: colors.text }]} placeholder="Search services, sellers, tags..." placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} returnKeyType="search" />
        {search ? <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.catRow}>
        {CATS.map((c) => {
          const active = cat === c.key;
          return (
            <TouchableOpacity key={c.key} onPress={() => setCat(c.key)} style={[st.catPill, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }]} activeOpacity={0.7}>
              <Ionicons name={c.icon as any} size={14} color={active ? "#fff" : colors.textMuted} />
              <Text style={[st.catPillText, { color: active ? "#fff" : colors.textMuted }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ListingCard item={item} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={st.emptyWrap}>
            <View style={[st.emptyIcon, { backgroundColor: colors.accent + "10" }]}>
              <Ionicons name={search ? "search" : "storefront"} size={36} color={colors.accent} />
            </View>
            <Text style={[st.emptyTitle, { color: colors.text }]}>{search ? "No results" : "Marketplace is empty"}</Text>
            <Text style={[st.emptySub, { color: colors.textMuted }]}>{search ? "Try different keywords" : "Be the first to list a service!"}</Text>
            {!search && (
              <TouchableOpacity style={[st.emptyBtn, { backgroundColor: colors.accent }]} onPress={() => { resetForm(); setShowCreate(true); }}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={st.emptyBtnText}>Create Service</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </>
  );

  const OrdersTab = () => {
    const list = orderSub === "buying" ? buyOrders : sellOrders;
    return (
      <>
        <View style={[st.subTabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          {(["buying", "selling"] as const).map((s) => (
            <TouchableOpacity key={s} style={[st.subTab, orderSub === s && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]} onPress={() => setOrderSub(s)}>
              <Text style={[st.subTabText, { color: orderSub === s ? colors.accent : colors.textMuted }]}>
                {s === "buying" ? `Purchases (${buyOrders.length})` : `Sales (${sellOrders.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <FlatList
          data={list}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <OrderCard item={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 10 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={st.emptyWrap}>
              <View style={[st.emptyIcon, { backgroundColor: colors.accent + "10" }]}>
                <Ionicons name={orderSub === "buying" ? "bag-handle" : "cube"} size={36} color={colors.accent} />
              </View>
              <Text style={[st.emptyTitle, { color: colors.text }]}>No {orderSub === "buying" ? "purchases" : "sales"} yet</Text>
              <Text style={[st.emptySub, { color: colors.textMuted }]}>{orderSub === "buying" ? "Explore services to get started" : "List a service to receive orders"}</Text>
            </View>
          }
        />
      </>
    );
  };

  const SellerTab = () => (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
      <View style={st.statsGrid}>
        {[
          { icon: "wallet", label: "Earned", value: `${earned}`, bg: Colors.gold },
          { icon: "flash", label: "Active", value: `${activeCount}`, bg: colors.accent },
          { icon: "storefront", label: "Services", value: `${myListings.length}`, bg: "#5856D6" },
          { icon: "checkmark-done-circle", label: "Done", value: `${sellOrders.filter((o) => o.status === "completed").length}`, bg: "#34C759" },
        ].map((s, i) => (
          <View key={i} style={[st.statCard, { backgroundColor: colors.surface }]}>
            <View style={[st.statIconWrap, { backgroundColor: s.bg + "14" }]}>
              <Ionicons name={s.icon as any} size={18} color={s.bg} />
            </View>
            <Text style={[st.statValue, { color: colors.text }]}>{s.value}</Text>
            <Text style={[st.statLbl, { color: colors.textMuted }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={st.sectionHeader}>
        <Text style={[st.sectionTitle, { color: colors.text }]}>My Services</Text>
        <TouchableOpacity style={[st.newBtn, { backgroundColor: colors.accent }]} onPress={() => { resetForm(); setShowCreate(true); }}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>New</Text>
        </TouchableOpacity>
      </View>

      {myListings.length === 0 ? (
        <View style={[st.emptyCard, { backgroundColor: colors.surface }]}>
          <Text style={{ fontSize: 36 }}>💼</Text>
          <Text style={[st.emptyTitle, { color: colors.text, fontSize: 16 }]}>No services yet</Text>
          <Text style={[st.emptySub, { color: colors.textMuted, fontSize: 13 }]}>Start earning by offering your skills</Text>
          <TouchableOpacity style={[st.emptyBtn, { backgroundColor: colors.accent, marginTop: 8 }]} onPress={() => { resetForm(); setShowCreate(true); }}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={st.emptyBtnText}>Create Service</Text>
          </TouchableOpacity>
        </View>
      ) : myListings.map((l) => (
        <View key={l.id} style={[st.myServiceCard, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={st.mscTop} onPress={() => openListing(l)} activeOpacity={0.7}>
            <Text style={{ fontSize: 22 }}>{l.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[st.mscTitle, { color: colors.text }]} numberOfLines={1}>{l.title}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[st.lcMetaText, { color: colors.textMuted }]}>{l.orders_count} orders</Text>
                <Text style={[st.lcMetaText, { color: colors.textMuted }]}>·</Text>
                <Stars n={l.rating} size={10} />
                <Text style={[st.lcMetaText, { color: colors.textMuted }]}>{l.rating.toFixed(1)}</Text>
              </View>
            </View>
            <Text style={[st.priceVal, { color: Colors.gold }]}>{l.price} 🪙</Text>
          </TouchableOpacity>
          {!l.is_active && (
            <View style={[st.pausedBanner, { backgroundColor: "#FF950010" }]}>
              <Ionicons name="pause-circle" size={13} color="#FF9500" />
              <Text style={{ fontSize: 12, color: "#FF9500", fontWeight: "500" }}>Paused</Text>
            </View>
          )}
          <View style={[st.mscActions, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={[st.mscBtn, { backgroundColor: colors.accent + "10" }]} onPress={() => startEdit(l)}>
              <Ionicons name="create-outline" size={14} color={colors.accent} />
              <Text style={[st.mscBtnText, { color: colors.accent }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.mscBtn, { backgroundColor: l.is_active ? "#FF950010" : "#34C75910" }]} onPress={() => toggleActive(l)}>
              <Ionicons name={l.is_active ? "pause-circle-outline" : "play-circle-outline"} size={14} color={l.is_active ? "#FF9500" : "#34C759"} />
              <Text style={[st.mscBtnText, { color: l.is_active ? "#FF9500" : "#34C759" }]}>{l.is_active ? "Pause" : "Activate"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );

  const ListingModal = () => {
    if (!viewListing) return null;
    const l = viewListing;
    const own = l.seller_id === user?.id;
    return (
      <Modal visible animationType="slide" onRequestClose={() => setViewListing(null)}>
        <View style={[st.modal, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
          <View style={[st.modalNav, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setViewListing(null)} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></TouchableOpacity>
            <Text style={[st.modalNavTitle, { color: colors.text }]} numberOfLines={1}>{l.title}</Text>
            {own ? <TouchableOpacity onPress={() => { setViewListing(null); startEdit(l); }} hitSlop={12}><Ionicons name="create-outline" size={20} color={colors.accent} /></TouchableOpacity> : <View style={{ width: 22 }} />}
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
            <View style={[st.heroCard, { backgroundColor: colors.surface }]}>
              <View style={[st.heroBadge, { backgroundColor: colors.accent + "10" }]}>
                <Text style={{ fontSize: 44 }}>{l.emoji}</Text>
              </View>
              <Text style={[st.heroTitle, { color: colors.text }]}>{l.title}</Text>
              <UserChip avatar={l.seller_avatar} name={l.seller_name} handle={l.seller_handle} id={l.seller_id} />
              <View style={st.heroStats}>
                {[
                  { icon: "star", val: l.rating.toFixed(1), sub: `${l.review_count} reviews`, color: "#FFD60A" },
                  { icon: "cart", val: `${l.orders_count}`, sub: "orders", color: colors.accent },
                  { icon: "time", val: `${l.delivery_days}d`, sub: "delivery", color: "#5856D6" },
                ].map((s, i) => (
                  <View key={i} style={st.heroStatItem}>
                    <Ionicons name={s.icon as any} size={16} color={s.color} />
                    <Text style={[st.heroStatVal, { color: colors.text }]}>{s.val}</Text>
                    <Text style={[st.heroStatSub, { color: colors.textMuted }]}>{s.sub}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[st.section, { backgroundColor: colors.surface }]}>
              <Text style={[st.secTitle, { color: colors.text }]}>About</Text>
              <Text style={[st.secBody, { color: colors.textSecondary }]}>{l.description || "No description provided."}</Text>
            </View>

            {l.tags.length > 0 && (
              <View style={[st.section, { backgroundColor: colors.surface }]}>
                <Text style={[st.secTitle, { color: colors.text }]}>Tags</Text>
                <View style={st.tagWrap}>
                  {l.tags.map((t, i) => <View key={i} style={[st.tag, { backgroundColor: colors.accent + "12" }]}><Text style={[st.tagText, { color: colors.accent }]}>{t}</Text></View>)}
                </View>
              </View>
            )}

            {l.requirements ? (
              <View style={[st.section, { backgroundColor: colors.surface }]}>
                <Text style={[st.secTitle, { color: colors.text }]}>What the seller needs</Text>
                <Text style={[st.secBody, { color: colors.textSecondary }]}>{l.requirements}</Text>
              </View>
            ) : null}

            <View style={[st.section, { backgroundColor: colors.surface }]}>
              <Text style={[st.secTitle, { color: colors.text }]}>Reviews ({reviews.length})</Text>
              {reviews.length === 0 ? (
                <Text style={[st.secBody, { color: colors.textMuted }]}>No reviews yet.</Text>
              ) : reviews.map((r) => (
                <View key={r.id} style={[st.reviewItem, { borderTopColor: colors.border }]}>
                  <View style={st.reviewHead}>
                    <Stars n={r.rating} size={11} />
                    <Text style={[st.reviewUser, { color: colors.text }]}>@{r.reviewer_handle}</Text>
                    <Text style={[st.reviewTime, { color: colors.textMuted }]}>{elapsed(r.created_at)}</Text>
                  </View>
                  {r.comment ? <Text style={[st.secBody, { color: colors.textSecondary, marginTop: 4 }]}>{r.comment}</Text> : null}
                </View>
              ))}
            </View>

            {own && (
              <View style={[st.section, { backgroundColor: colors.surface }]}>
                <TouchableOpacity style={[st.destructBtn]} onPress={() => removeListing(l)}>
                  <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                  <Text style={{ color: "#FF3B30", fontWeight: "600", fontSize: 14 }}>Delete Service</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {!own && (
            <View style={[st.stickyFooter, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
              <View>
                <Text style={[st.footerPriceBig, { color: Colors.gold }]}>{l.price} ACoin</Text>
                <Text style={[st.footerSub, { color: colors.textMuted }]}>{l.delivery_days}-day delivery</Text>
              </View>
              <TouchableOpacity style={[st.buyBtn, { backgroundColor: colors.accent }]} onPress={() => placeOrder(l)} disabled={ordering}>
                {ordering ? <ActivityIndicator color="#fff" size="small" /> : <>
                  <Ionicons name="flash" size={16} color="#fff" />
                  <Text style={st.buyBtnText}>Order Now</Text>
                </>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    );
  };

  const OrderModal = () => {
    if (!viewOrder) return null;
    const o = viewOrder;
    const me = o.seller_id === user?.id;
    const sm = STATUS_META[o.status] || STATUS_META.pending;
    return (
      <Modal visible animationType="slide" onRequestClose={() => { setViewOrder(null); setShowDeliver(false); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[st.modal, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
            <View style={[st.modalNav, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => { setViewOrder(null); setShowDeliver(false); }} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></TouchableOpacity>
              <Text style={[st.modalNavTitle, { color: colors.text }]}>Order</Text>
              <View style={{ width: 22 }} />
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
              <View style={[st.heroCard, { backgroundColor: colors.surface, alignItems: "center" }]}>
                <Text style={{ fontSize: 36 }}>{o.listing_emoji}</Text>
                <Text style={[st.heroTitle, { color: colors.text, fontSize: 18, marginTop: 6 }]}>{o.listing_title}</Text>
                <View style={[st.statusChip, { backgroundColor: sm.color + "14", marginTop: 10 }]}>
                  <Ionicons name={sm.icon as any} size={13} color={sm.color} />
                  <Text style={[st.statusLabel, { color: sm.color, fontSize: 13 }]}>{sm.label}</Text>
                </View>
              </View>

              <View style={[st.section, { backgroundColor: colors.surface }]}>
                {[
                  { label: "Amount", val: `${o.price_paid} ACoin`, color: Colors.gold },
                  { label: "Seller", val: `@${o.seller_handle}`, color: colors.accent, link: o.seller_id },
                  { label: "Buyer", val: `@${o.buyer_handle}`, color: colors.accent, link: o.buyer_id },
                  { label: "Ordered", val: new Date(o.created_at).toLocaleDateString() },
                  ...(o.completed_at ? [{ label: "Completed", val: new Date(o.completed_at).toLocaleDateString() }] : []),
                  { label: "Revisions", val: `${o.revision_count} / ${o.max_revisions}` },
                ].map((r, i) => (
                  <View key={i} style={[st.infoRow, { borderBottomColor: colors.border }]}>
                    <Text style={[st.infoLabel, { color: colors.textMuted }]}>{r.label}</Text>
                    {(r as any).link ? (
                      <TouchableOpacity onPress={() => { setViewOrder(null); router.push({ pathname: "/contact/[id]", params: { id: (r as any).link } }); }}>
                        <Text style={[st.infoVal, { color: r.color || colors.text }]}>{r.val}</Text>
                      </TouchableOpacity>
                    ) : <Text style={[st.infoVal, { color: r.color || colors.text }]}>{r.val}</Text>}
                  </View>
                ))}
              </View>

              {o.buyer_note ? <View style={[st.section, { backgroundColor: colors.surface }]}><Text style={[st.secTitle, { color: colors.text }]}>Buyer Note</Text><Text style={[st.secBody, { color: colors.textSecondary }]}>{o.buyer_note}</Text></View> : null}
              {o.delivery_message ? <View style={[st.section, { backgroundColor: colors.surface }]}><Text style={[st.secTitle, { color: colors.text }]}>Delivery</Text><Text style={[st.secBody, { color: colors.textSecondary }]}>{o.delivery_message}</Text></View> : null}
              {o.cancel_reason ? <View style={[st.section, { backgroundColor: colors.surface }]}><Text style={[st.secTitle, { color: colors.text }]}>Reason</Text><Text style={[st.secBody, { color: "#FF3B30" }]}>{o.cancel_reason}</Text></View> : null}

              {o.status === "completed" && !me && (
                <View style={[st.section, { backgroundColor: colors.surface }]}>
                  <Text style={[st.secTitle, { color: colors.text }]}>Leave a Review</Text>
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <TouchableOpacity key={s} onPress={() => setReviewStars(s)} hitSlop={4}>
                        <Ionicons name={reviewStars >= s ? "star" : "star-outline"} size={30} color="#FFD60A" />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput style={[st.textarea, { backgroundColor: colors.backgroundSecondary, color: colors.text, borderColor: colors.border }]} placeholder="Share your experience..." placeholderTextColor={colors.textMuted} value={reviewText} onChangeText={setReviewText} multiline />
                  <TouchableOpacity style={[st.primaryBtn, { backgroundColor: colors.accent }]} onPress={() => postReview(o)} disabled={submitting}>
                    {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.primaryBtnText}>Submit Review</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            {!["completed", "cancelled"].includes(o.status) && !showDeliver && (
              <View style={[st.stickyFooter, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 12, gap: 8 }]}>
                {me && o.status === "pending" && <>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.accent, flex: 1 }]} onPress={() => updateStatus(o, "in_progress")}><Ionicons name="play" size={15} color="#fff" /><Text style={st.actionBtnText}>Start Work</Text></TouchableOpacity>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#FF3B3015", flex: 1 }]} onPress={() => updateStatus(o, "cancelled", "Seller declined")}><Text style={[st.actionBtnTextAlt, { color: "#FF3B30" }]}>Decline</Text></TouchableOpacity>
                </>}
                {me && (o.status === "in_progress" || o.status === "revision") && (
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#5856D6", flex: 1 }]} onPress={() => setShowDeliver(true)}><Ionicons name="cube" size={15} color="#fff" /><Text style={st.actionBtnText}>Deliver</Text></TouchableOpacity>
                )}
                {!me && o.status === "delivered" && <>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#34C759", flex: 1 }]} onPress={() => updateStatus(o, "completed")}><Ionicons name="checkmark-circle" size={15} color="#fff" /><Text style={st.actionBtnText}>Accept</Text></TouchableOpacity>
                  {o.revision_count < o.max_revisions && <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#FF6B3515", flex: 1 }]} onPress={() => updateStatus(o, "revision")}><Text style={[st.actionBtnTextAlt, { color: "#FF6B35" }]}>Revise</Text></TouchableOpacity>}
                </>}
                {!me && o.status === "pending" && (
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#FF3B3015", flex: 1 }]} onPress={() => updateStatus(o, "cancelled", "Buyer cancelled")}><Text style={[st.actionBtnTextAlt, { color: "#FF3B30" }]}>Cancel (Refund)</Text></TouchableOpacity>
                )}
              </View>
            )}

            {showDeliver && (
              <View style={[st.deliverSheet, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
                <Text style={[st.secTitle, { color: colors.text }]}>Delivery Message</Text>
                <TextInput style={[st.textarea, { backgroundColor: colors.backgroundSecondary, color: colors.text, borderColor: colors.border }]} placeholder="Describe what you're delivering..." placeholderTextColor={colors.textMuted} value={deliveryMsg} onChangeText={setDeliveryMsg} multiline />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.backgroundSecondary, flex: 1 }]} onPress={() => setShowDeliver(false)}><Text style={[st.actionBtnTextAlt, { color: colors.text }]}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#5856D6", flex: 1 }]} onPress={() => updateStatus(o, "delivered", deliveryMsg)} disabled={submitting}>{submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.actionBtnText}>Send</Text>}</TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const CreateModal = () => (
    <Modal visible={showCreate} animationType="slide" onRequestClose={() => { setShowCreate(false); resetForm(); }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[st.modal, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
          <View style={[st.modalNav, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setShowCreate(false); resetForm(); }} hitSlop={12}><Ionicons name="close" size={22} color={colors.text} /></TouchableOpacity>
            <Text style={[st.modalNavTitle, { color: colors.text }]}>{editTarget ? "Edit Service" : "New Service"}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ width: 80 }}>
                <Text style={[st.formLabel, { color: colors.textSecondary }]}>Icon</Text>
                <View style={[st.formField, { backgroundColor: colors.surface }]}>
                  <TextInput style={[st.formInput, { color: colors.text, textAlign: "center", fontSize: 22 }]} value={fEmoji} onChangeText={setFEmoji} maxLength={4} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.formLabel, { color: colors.textSecondary }]}>Title</Text>
                <View style={[st.formField, { backgroundColor: colors.surface }]}>
                  <TextInput style={[st.formInput, { color: colors.text }]} placeholder="e.g. I will design your logo" placeholderTextColor={colors.textMuted} value={fTitle} onChangeText={setFTitle} maxLength={100} />
                </View>
              </View>
            </View>

            <View>
              <Text style={[st.formLabel, { color: colors.textSecondary }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {CATS.filter((c) => c.key !== "All").map((c) => (
                  <TouchableOpacity key={c.key} style={[st.catPill, { backgroundColor: fCat === c.key ? colors.accent : colors.surface, borderColor: fCat === c.key ? colors.accent : colors.border }]} onPress={() => setFCat(c.key)}>
                    <Ionicons name={c.icon as any} size={13} color={fCat === c.key ? "#fff" : colors.textMuted} />
                    <Text style={[st.catPillText, { color: fCat === c.key ? "#fff" : colors.textMuted }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[st.formLabel, { color: colors.textSecondary }]}>Price (ACoin)</Text>
                <View style={[st.formField, { backgroundColor: colors.surface }]}>
                  <TextInput style={[st.formInput, { color: colors.text }]} placeholder="200" placeholderTextColor={colors.textMuted} value={fPrice} onChangeText={setFPrice} keyboardType="numeric" />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.formLabel, { color: colors.textSecondary }]}>Delivery (days)</Text>
                <View style={[st.formField, { backgroundColor: colors.surface }]}>
                  <TextInput style={[st.formInput, { color: colors.text }]} placeholder="3" placeholderTextColor={colors.textMuted} value={fDays} onChangeText={setFDays} keyboardType="numeric" />
                </View>
              </View>
            </View>

            <View>
              <Text style={[st.formLabel, { color: colors.textSecondary }]}>Description</Text>
              <TextInput style={[st.textarea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, minHeight: 110 }]} placeholder="Tell buyers exactly what they'll get..." placeholderTextColor={colors.textMuted} value={fDesc} onChangeText={setFDesc} multiline />
            </View>

            <View>
              <Text style={[st.formLabel, { color: colors.textSecondary }]}>Requirements from buyer</Text>
              <TextInput style={[st.textarea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]} placeholder="What info do you need to get started?" placeholderTextColor={colors.textMuted} value={fReqs} onChangeText={setFReqs} multiline />
            </View>

            <View>
              <Text style={[st.formLabel, { color: colors.textSecondary }]}>Tags (comma-separated)</Text>
              <View style={[st.formField, { backgroundColor: colors.surface }]}>
                <TextInput style={[st.formInput, { color: colors.text }]} placeholder="logo, branding, design" placeholderTextColor={colors.textMuted} value={fTags} onChangeText={setFTags} />
              </View>
            </View>

            <TouchableOpacity style={[st.primaryBtn, { backgroundColor: colors.accent, opacity: saving ? 0.7 : 1 }]} onPress={saveListing} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.primaryBtnText}>{editTarget ? "Save Changes" : "Publish Service"}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[st.nav, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={st.navCenter}>
          <Text style={[st.navTitle, { color: colors.text }]}>Freelance</Text>
          <Text style={[st.navSub, { color: colors.textMuted }]}>@afuchat</Text>
        </View>
        <TouchableOpacity onPress={() => { resetForm(); setShowCreate(true); }} hitSlop={12}>
          <Ionicons name="add-circle" size={24} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <OfflineBanner />

      <View style={[st.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {([
          { k: "explore" as const, icon: "compass-outline", label: "Explore" },
          { k: "orders" as const, icon: "receipt-outline", label: "Orders" },
          { k: "seller" as const, icon: "analytics-outline", label: "Seller" },
        ]).map((t) => {
          const active = tab === t.k;
          return (
            <TouchableOpacity key={t.k} style={st.tabItem} onPress={() => setTab(t.k)}>
              <Ionicons name={(active ? t.icon.replace("-outline", "") : t.icon) as any} size={20} color={active ? colors.accent : colors.textMuted} />
              <Text style={[st.tabLabel, { color: active ? colors.accent : colors.textMuted }]}>{t.label}</Text>
              {active && <View style={[st.tabDot, { backgroundColor: colors.accent }]} />}
              {t.k === "orders" && activeCount > 0 && (
                <View style={[st.badge, { backgroundColor: colors.accent }]}>
                  <Text style={st.badgeText}>{activeCount > 9 ? "9+" : activeCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[st.loadingText, { color: colors.textMuted }]}>Loading marketplace...</Text>
        </View>
      ) : tab === "explore" ? <ExploreTab /> : tab === "orders" ? <OrdersTab /> : <SellerTab />}

      <ListingModal />
      <OrderModal />
      <CreateModal />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  nav: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  navCenter: { flex: 1, alignItems: "center" },
  navTitle: { fontSize: 17, fontWeight: "700" },
  navSub: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  offlineBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6 },
  offlineText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 2 },
  tabLabel: { fontSize: 11, fontWeight: "600" },
  tabDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  badge: { position: "absolute", top: 2, right: "20%", minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 12, marginBottom: 4, paddingHorizontal: 14, height: 44, borderRadius: 22, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  catRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  catPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  catPillText: { fontSize: 12, fontWeight: "600" },
  listingCard: { borderRadius: 16, padding: 14, gap: 8 },
  lcRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  emojiCircle: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  lcTitle: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  lcDesc: { fontSize: 13, lineHeight: 18 },
  lcDivider: { height: StyleSheet.hairlineWidth },
  lcFooter: { flexDirection: "row", alignItems: "center", gap: 12 },
  lcMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  lcMetaText: { fontSize: 11 },
  priceTag: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  priceVal: { fontSize: 14, fontWeight: "700" },
  userChip: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  chipAvatar: { width: 16, height: 16, borderRadius: 8 },
  chipHandle: { fontSize: 12, fontWeight: "500" },
  orderCard: { borderRadius: 14, overflow: "hidden" },
  ocTop: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  ocTitle: { fontSize: 14, fontWeight: "700" },
  ocSub: { fontSize: 12 },
  ocTime: { fontSize: 10, textAlign: "right", marginTop: 4 },
  ocBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  ocPrice: { fontSize: 14, fontWeight: "700" },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, alignSelf: "flex-end" },
  statusLabel: { fontSize: 11, fontWeight: "600" },
  subTabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  subTab: { flex: 1, paddingVertical: 11, alignItems: "center" },
  subTabText: { fontSize: 13, fontWeight: "600" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: (SCREEN_W - 42) / 2, borderRadius: 14, padding: 14, alignItems: "center", gap: 6 },
  statIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 22, fontWeight: "700" },
  statLbl: { fontSize: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  myServiceCard: { borderRadius: 14, overflow: "hidden" },
  mscTop: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  mscTitle: { fontSize: 14, fontWeight: "700" },
  pausedBanner: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 5 },
  mscActions: { flexDirection: "row", gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  mscBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  mscBtnText: { fontSize: 12, fontWeight: "600" },
  emptyCard: { borderRadius: 16, padding: 24, alignItems: "center", gap: 6 },
  emptyWrap: { alignItems: "center", paddingVertical: 60, gap: 10, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, marginTop: 6 },
  emptyBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  modal: { flex: 1 },
  modalNav: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  modalNavTitle: { flex: 1, fontSize: 16, fontWeight: "700", textAlign: "center" },
  heroCard: { padding: 24, alignItems: "center", gap: 8 },
  heroBadge: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  heroStats: { flexDirection: "row", gap: 24, marginTop: 12 },
  heroStatItem: { alignItems: "center", gap: 2 },
  heroStatVal: { fontSize: 16, fontWeight: "700" },
  heroStatSub: { fontSize: 11 },
  section: { padding: 16, marginTop: 8 },
  secTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  secBody: { fontSize: 14, lineHeight: 21 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  tagText: { fontSize: 12, fontWeight: "500" },
  reviewItem: { paddingTop: 10, marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  reviewUser: { fontSize: 12, fontWeight: "600" },
  reviewTime: { fontSize: 11 },
  destructBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: "#FF3B3010" },
  stickyFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerPriceBig: { fontSize: 22, fontWeight: "700" },
  footerSub: { fontSize: 12, marginTop: 1 },
  buyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  buyBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12 },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  actionBtnTextAlt: { fontSize: 14, fontWeight: "600" },
  deliverSheet: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  infoLabel: { fontSize: 13 },
  infoVal: { fontSize: 13, fontWeight: "600" },
  formLabel: { fontSize: 13, fontWeight: "500", marginBottom: 6 },
  formField: { borderRadius: 12, paddingHorizontal: 14, height: 48, justifyContent: "center" },
  formInput: { fontSize: 15, flex: 1 },
  textarea: { borderRadius: 12, padding: 14, fontSize: 14, minHeight: 72, textAlignVertical: "top", borderWidth: 1 },
  primaryBtn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14 },
});
