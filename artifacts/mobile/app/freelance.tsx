import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { transferAcoin } from "@/lib/monetize";
import { showAlert } from "@/lib/alert";

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

const CATEGORIES = ["All", "Design", "Writing", "Dev", "Marketing", "Video", "Music", "AI", "Business", "Other"];
const SORT_OPTIONS = ["Popular", "Newest", "Price: Low", "Price: High", "Top Rated"];
const STATUS_COLORS: Record<string, string> = {
  pending: "#FF9500",
  in_progress: "#007AFF",
  delivered: "#5856D6",
  revision: "#FF6B35",
  completed: "#34C759",
  cancelled: "#FF3B30",
  disputed: "#FF2D55",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  delivered: "Delivered",
  revision: "Revision",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

function StarRating({ rating, size = 14, color = "#FFD60A" }: { rating: number; size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons key={s} name={rating >= s ? "star" : rating >= s - 0.5 ? "star-half" : "star-outline"} size={size} color={color} />
      ))}
    </View>
  );
}

function StatBox({ label, value, icon, color, accent }: { label: string; value: string | number; icon: string; color: string; accent: string }) {
  return (
    <View style={[st.statBox, { backgroundColor: accent + "10" }]}>
      <Ionicons name={icon as any} size={18} color={accent} />
      <Text style={[st.statVal, { color }]}>{value}</Text>
      <Text style={[st.statLabel, { color: color + "88" }]}>{label}</Text>
    </View>
  );
}

export default function FreelanceScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [mainTab, setMainTab] = useState<"browse" | "orders" | "dashboard">("browse");
  const [selectedCat, setSelectedCat] = useState("All");
  const [sortBy, setSortBy] = useState("Popular");
  const [searchQuery, setSearchQuery] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ordering, setOrdering] = useState<string | null>(null);

  const [detailListing, setDetailListing] = useState<Listing | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOrderAction, setShowOrderAction] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [orderTab, setOrderTab] = useState<"buying" | "selling">("buying");

  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPrice, setCreatePrice] = useState("200");
  const [createEmoji, setCreateEmoji] = useState("💼");
  const [createCategory, setCreateCategory] = useState("Design");
  const [createDays, setCreateDays] = useState("3");
  const [createRequirements, setCreateRequirements] = useState("");
  const [createTags, setCreateTags] = useState("");
  const [creating, setCreating] = useState(false);

  const [actionMessage, setActionMessage] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  const mapListing = (l: any): Listing => ({
    id: l.id, title: l.title, description: l.description, price: l.price,
    delivery_days: l.delivery_days || 3, category: l.category || "Other", emoji: l.emoji || "💼",
    seller_id: l.seller_id, seller_name: l.profiles?.display_name || "Seller",
    seller_handle: l.profiles?.handle || "seller", seller_avatar: l.profiles?.avatar_url || null,
    orders_count: l.orders_count || 0, rating: l.rating || 5.0,
    review_count: l.review_count || 0, tags: l.tags || [],
    requirements: l.requirements || "", is_active: l.is_active,
    created_at: l.created_at,
  });

  const selectCols = `id, title, description, price, delivery_days, category, emoji, seller_id, orders_count, rating, review_count, tags, requirements, is_active, created_at, profiles!freelance_listings_seller_id_fkey(display_name, handle, avatar_url)`;

  const loadListings = useCallback(async () => {
    const [{ data: activeData }, { data: myData }] = await Promise.all([
      supabase.from("freelance_listings").select(selectCols).eq("is_active", true).order("orders_count", { ascending: false }).limit(100),
      user ? supabase.from("freelance_listings").select(selectCols).eq("seller_id", user.id).order("created_at", { ascending: false }) : Promise.resolve({ data: null }),
    ]);
    if (activeData) setListings(activeData.map(mapListing));
    if (myData) setMyListings(myData.map(mapListing));
  }, [user]);

  const loadOrders = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("freelance_orders")
      .select(`id, listing_id, buyer_id, seller_id, price_paid, status, buyer_note, delivery_message, revision_count, max_revisions, cancel_reason, created_at, completed_at, listing:freelance_listings!freelance_orders_listing_id_fkey(title, emoji), buyer:profiles!freelance_orders_buyer_id_fkey(display_name, handle, avatar_url), seller:profiles!freelance_orders_seller_id_fkey(display_name, handle, avatar_url)`)
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      setOrders(data.map((o: any) => ({
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
      })));
    }
  }, [user]);

  const loadReviews = useCallback(async (listingId: string) => {
    const { data } = await supabase
      .from("freelance_reviews")
      .select(`id, rating, comment, created_at, reviewer:profiles!freelance_reviews_reviewer_id_fkey(display_name, handle, avatar_url)`)
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) {
      setReviews(data.map((r: any) => ({
        id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at,
        reviewer_name: r.reviewer?.display_name || "User",
        reviewer_handle: r.reviewer?.handle || "user",
        reviewer_avatar: r.reviewer?.avatar_url || null,
      })));
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadListings(), loadOrders()]);
    setLoading(false);
  }, [loadListings, loadOrders]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const filtered = useMemo(() => {
    let result = selectedCat === "All" ? listings : listings.filter((l) => l.category === selectedCat);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.seller_handle.toLowerCase().includes(q) || (l.tags || []).some(t => t.toLowerCase().includes(q)));
    }
    switch (sortBy) {
      case "Newest": return [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "Price: Low": return [...result].sort((a, b) => a.price - b.price);
      case "Price: High": return [...result].sort((a, b) => b.price - a.price);
      case "Top Rated": return [...result].sort((a, b) => b.rating - a.rating);
      default: return result;
    }
  }, [listings, selectedCat, searchQuery, sortBy]);

  const buyingOrders = useMemo(() => orders.filter(o => o.buyer_id === user?.id), [orders, user]);
  const sellingOrders = useMemo(() => orders.filter(o => o.seller_id === user?.id), [orders, user]);
  const activeOrders = useMemo(() => orders.filter(o => !["completed", "cancelled"].includes(o.status)), [orders]);

  const totalEarnings = useMemo(() => sellingOrders.filter(o => o.status === "completed").reduce((sum, o) => sum + o.price_paid, 0), [sellingOrders]);

  async function placeOrder(listing: Listing) {
    if (!user || !profile) { router.push("/(auth)/login"); return; }
    if (listing.seller_id === user.id) { showAlert("Own listing", "You can't order your own service"); return; }
    if ((profile.acoin || 0) < listing.price) {
      showAlert("Not enough ACoin", `You need ${listing.price} ACoin but have ${profile.acoin || 0}.`, [
        { text: "Top Up", onPress: () => router.push("/wallet/topup") }, { text: "Cancel" }
      ]); return;
    }

    showAlert("Confirm Order", `Pay ${listing.price} ACoin for "${listing.title}" by @${listing.seller_handle}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: `Pay ${listing.price} ACoin`, onPress: async () => {
          setOrdering(listing.id);
          const result = await transferAcoin({
            buyerId: user.id, sellerId: listing.seller_id,
            buyerCurrentAcoin: profile.acoin || 0, amount: listing.price,
            transactionType: "monetize_freelance",
            metadata: { listing_id: listing.id, listing_title: listing.title },
          });

          if (result.success) {
            await supabase.from("freelance_orders").insert({
              listing_id: listing.id, buyer_id: user.id, seller_id: listing.seller_id,
              price_paid: listing.price, status: "pending", max_revisions: 1,
            });
            await supabase.from("freelance_listings").update({ orders_count: listing.orders_count + 1 }).eq("id", listing.id);
            refreshProfile();
            showAlert("Order Placed!", `Payment of ${listing.price} ACoin sent to @${listing.seller_handle}. Check your orders to track progress.`);
            setDetailListing(null);
            loadAll();
          } else {
            showAlert("Payment Failed", result.error || "Could not complete payment");
          }
          setOrdering(null);
        }
      }
    ]);
  }

  async function createListing() {
    if (!user) return;
    if (!createTitle.trim()) { showAlert("Required", "Enter a service title"); return; }
    const price = parseInt(createPrice);
    if (!price || price < 1) { showAlert("Invalid price", "Enter a valid ACoin price"); return; }

    setCreating(true);
    const payload: any = {
      title: createTitle.trim(), description: createDesc.trim(), price, emoji: createEmoji,
      category: createCategory, delivery_days: parseInt(createDays) || 3,
      seller_id: user.id, is_active: true,
      requirements: createRequirements.trim(),
      tags: createTags.split(",").map(t => t.trim()).filter(Boolean),
    };

    let error;
    if (editingListing) {
      ({ error } = await supabase.from("freelance_listings").update(payload).eq("id", editingListing.id));
    } else {
      payload.orders_count = 0;
      payload.rating = 5.0;
      payload.review_count = 0;
      ({ error } = await supabase.from("freelance_listings").insert(payload));
    }
    setCreating(false);
    if (error) { showAlert("Error", error.message); return; }
    showAlert(editingListing ? "Updated!" : "Listed!", editingListing ? "Your service has been updated." : "Your service is now live in the marketplace.");
    resetCreateForm();
    setShowCreateModal(false);
    loadAll();
  }

  function resetCreateForm() {
    setCreateTitle(""); setCreateDesc(""); setCreatePrice("200"); setCreateDays("3");
    setCreateEmoji("💼"); setCreateCategory("Design"); setCreateRequirements("");
    setCreateTags(""); setEditingListing(null);
  }

  function openEditListing(listing: Listing) {
    setEditingListing(listing);
    setCreateTitle(listing.title);
    setCreateDesc(listing.description);
    setCreatePrice(String(listing.price));
    setCreateDays(String(listing.delivery_days));
    setCreateEmoji(listing.emoji);
    setCreateCategory(listing.category);
    setCreateRequirements(listing.requirements);
    setCreateTags((listing.tags || []).join(", "));
    setShowCreateModal(true);
  }

  async function toggleListingActive(listing: Listing) {
    await supabase.from("freelance_listings").update({ is_active: !listing.is_active }).eq("id", listing.id);
    loadAll();
  }

  async function deleteListing(listing: Listing) {
    showAlert("Delete Service", `Remove "${listing.title}" permanently?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await supabase.from("freelance_listings").delete().eq("id", listing.id);
        setDetailListing(null);
        loadAll();
      }},
    ]);
  }

  async function updateOrderStatus(order: Order, newStatus: string, message?: string) {
    setSubmittingAction(true);
    const update: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (message) update.delivery_message = message;
    if (newStatus === "completed") update.completed_at = new Date().toISOString();
    if (newStatus === "cancelled") update.cancel_reason = message || "Cancelled";
    if (newStatus === "revision") update.revision_count = (order.revision_count || 0) + 1;

    await supabase.from("freelance_orders").update(update).eq("id", order.id);

    if (newStatus === "cancelled" && order.status === "pending") {
      const { data: buyerProfile } = await supabase.from("profiles").select("acoin").eq("id", order.buyer_id).single();
      if (buyerProfile) {
        await supabase.from("profiles").update({ acoin: (buyerProfile.acoin || 0) + order.price_paid }).eq("id", order.buyer_id);
        await supabase.from("acoin_transactions").insert({ user_id: order.buyer_id, amount: order.price_paid, transaction_type: "freelance_refund", metadata: { order_id: order.id } });
      }
    }

    setSubmittingAction(false);
    setDetailOrder(null);
    setShowOrderAction(false);
    setActionMessage("");
    loadAll();
    refreshProfile();
  }

  async function submitReview(order: Order) {
    if (!user) return;
    setSubmittingAction(true);
    await supabase.from("freelance_reviews").insert({
      order_id: order.id, listing_id: order.listing_id,
      reviewer_id: user.id, seller_id: order.seller_id,
      rating: reviewRating, comment: reviewComment.trim(),
    });

    const { data: allReviews } = await supabase.from("freelance_reviews").select("rating").eq("listing_id", order.listing_id);
    if (allReviews && allReviews.length > 0) {
      const avgRating = allReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / allReviews.length;
      await supabase.from("freelance_listings").update({ rating: Math.round(avgRating * 100) / 100, review_count: allReviews.length }).eq("id", order.listing_id);
    }

    setSubmittingAction(false);
    setReviewRating(5);
    setReviewComment("");
    setDetailOrder(null);
    showAlert("Review Submitted!", "Thank you for your feedback.");
    loadAll();
  }

  function openDetail(listing: Listing) {
    setDetailListing(listing);
    loadReviews(listing.id);
  }

  const renderListingCard = ({ item }: { item: Listing }) => (
    <TouchableOpacity style={[st.card, { backgroundColor: colors.surface }]} onPress={() => openDetail(item)} activeOpacity={0.7}>
      <View style={st.cardHeader}>
        <Text style={st.cardEmoji}>{item.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[st.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
          <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.seller_id } })}>
            <Text style={[st.cardSeller, { color: colors.accent }]}>@{item.seller_handle}</Text>
          </TouchableOpacity>
        </View>
        <View style={[st.pricePill, { backgroundColor: Colors.gold + "22" }]}>
          <Text style={[st.priceText, { color: Colors.gold }]}>{item.price} 🪙</Text>
        </View>
      </View>
      <Text style={[st.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description || "No description"}</Text>
      <View style={st.cardFooter}>
        <View style={st.metaItem}>
          <StarRating rating={item.rating} size={11} />
          <Text style={[st.metaText, { color: colors.textMuted }]}>{item.rating.toFixed(1)} ({item.review_count})</Text>
        </View>
        <View style={st.metaItem}>
          <Ionicons name="time-outline" size={12} color={colors.textMuted} />
          <Text style={[st.metaText, { color: colors.textMuted }]}>{item.delivery_days}d</Text>
        </View>
        <View style={st.metaItem}>
          <Ionicons name="bag-check-outline" size={12} color={colors.textMuted} />
          <Text style={[st.metaText, { color: colors.textMuted }]}>{item.orders_count}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={[st.catTag, { backgroundColor: colors.accent + "15" }]}>
          <Text style={[st.catTagText, { color: colors.accent }]}>{item.category}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderOrderCard = ({ item }: { item: Order }) => {
    const isSeller = item.seller_id === user?.id;
    const other = isSeller ? { name: item.buyer_name, handle: item.buyer_handle, avatar: item.buyer_avatar } : { name: item.seller_name, handle: item.seller_handle, avatar: item.seller_avatar };
    const statusColor = STATUS_COLORS[item.status] || colors.textMuted;

    return (
      <TouchableOpacity style={[st.card, { backgroundColor: colors.surface }]} onPress={() => setDetailOrder(item)} activeOpacity={0.7}>
        <View style={st.cardHeader}>
          <Text style={{ fontSize: 24 }}>{item.listing_emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[st.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.listing_title}</Text>
            <Text style={[st.cardSeller, { color: colors.textMuted }]}>{isSeller ? "Buyer" : "Seller"}: @{other.handle}</Text>
          </View>
          <View style={[st.statusPill, { backgroundColor: statusColor + "18" }]}>
            <View style={[st.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[st.statusText, { color: statusColor }]}>{STATUS_LABELS[item.status]}</Text>
          </View>
        </View>
        <View style={st.cardFooter}>
          <Text style={[st.metaText, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
          <View style={{ flex: 1 }} />
          <Text style={[st.priceText, { color: Colors.gold }]}>{item.price_paid} ACoin</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const DetailModal = () => {
    if (!detailListing) return null;
    const item = detailListing;
    const isOwn = item.seller_id === user?.id;

    return (
      <Modal visible animationType="slide" onRequestClose={() => setDetailListing(null)}>
        <View style={[st.modalRoot, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
          <View style={[st.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setDetailListing(null)} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[st.modalTitle, { color: colors.text }]}>Service Details</Text>
            {isOwn ? (
              <TouchableOpacity onPress={() => { setDetailListing(null); openEditListing(item); }} hitSlop={12}>
                <Ionicons name="create-outline" size={22} color={colors.accent} />
              </TouchableOpacity>
            ) : <View style={{ width: 24 }} />}
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            <View style={[st.detailHero, { backgroundColor: colors.surface }]}>
              <Text style={{ fontSize: 48, textAlign: "center", marginBottom: 12 }}>{item.emoji}</Text>
              <Text style={[st.detailTitle, { color: colors.text }]}>{item.title}</Text>
              <TouchableOpacity style={st.sellerRow} onPress={() => { setDetailListing(null); router.push({ pathname: "/contact/[id]", params: { id: item.seller_id } }); }}>
                {item.seller_avatar ? (
                  <Image source={{ uri: item.seller_avatar }} style={st.sellerAvatar} />
                ) : (
                  <View style={[st.sellerAvatar, { backgroundColor: colors.accent + "20", justifyContent: "center", alignItems: "center" }]}>
                    <Ionicons name="person" size={14} color={colors.accent} />
                  </View>
                )}
                <Text style={[st.sellerName, { color: colors.text }]}>{item.seller_name}</Text>
                <Text style={[st.sellerHandle, { color: colors.accent }]}>@{item.seller_handle}</Text>
              </TouchableOpacity>

              <View style={st.detailStats}>
                <View style={st.detailStat}>
                  <StarRating rating={item.rating} size={14} />
                  <Text style={[st.detailStatText, { color: colors.textMuted }]}>{item.rating.toFixed(1)} ({item.review_count} reviews)</Text>
                </View>
                <View style={st.detailStat}>
                  <Ionicons name="bag-check" size={14} color={colors.accent} />
                  <Text style={[st.detailStatText, { color: colors.textMuted }]}>{item.orders_count} orders</Text>
                </View>
                <View style={st.detailStat}>
                  <Ionicons name="time" size={14} color={colors.accent} />
                  <Text style={[st.detailStatText, { color: colors.textMuted }]}>{item.delivery_days} day delivery</Text>
                </View>
              </View>
            </View>

            <View style={[st.detailSection, { backgroundColor: colors.surface }]}>
              <Text style={[st.sectionTitle, { color: colors.text }]}>About This Service</Text>
              <Text style={[st.sectionBody, { color: colors.textSecondary }]}>{item.description || "No description provided."}</Text>
            </View>

            {item.tags && item.tags.length > 0 && (
              <View style={[st.detailSection, { backgroundColor: colors.surface }]}>
                <Text style={[st.sectionTitle, { color: colors.text }]}>Tags</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {item.tags.map((t, i) => (
                    <View key={i} style={[st.tagChip, { backgroundColor: colors.accent + "15" }]}>
                      <Text style={{ fontSize: 12, color: colors.accent }}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {item.requirements ? (
              <View style={[st.detailSection, { backgroundColor: colors.surface }]}>
                <Text style={[st.sectionTitle, { color: colors.text }]}>Requirements</Text>
                <Text style={[st.sectionBody, { color: colors.textSecondary }]}>{item.requirements}</Text>
              </View>
            ) : null}

            <View style={[st.detailSection, { backgroundColor: colors.surface }]}>
              <Text style={[st.sectionTitle, { color: colors.text }]}>Reviews ({reviews.length})</Text>
              {reviews.length === 0 ? (
                <Text style={[st.sectionBody, { color: colors.textMuted }]}>No reviews yet.</Text>
              ) : (
                reviews.map((r) => (
                  <View key={r.id} style={[st.reviewCard, { borderColor: colors.border }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <StarRating rating={r.rating} size={12} />
                      <Text style={[st.metaText, { color: colors.text, fontWeight: "600" }]}>@{r.reviewer_handle}</Text>
                      <Text style={[st.metaText, { color: colors.textMuted }]}>{timeAgo(r.created_at)}</Text>
                    </View>
                    {r.comment ? <Text style={[st.sectionBody, { color: colors.textSecondary }]}>{r.comment}</Text> : null}
                  </View>
                ))
              )}
            </View>

            {isOwn && (
              <View style={[st.detailSection, { backgroundColor: colors.surface }]}>
                <Text style={[st.sectionTitle, { color: colors.text }]}>Manage</Text>
                <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#FF3B30" + "15" }]} onPress={() => deleteListing(item)}>
                  <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                  <Text style={{ color: "#FF3B30", fontWeight: "600", fontSize: 14 }}>Delete Listing</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {!isOwn && (
            <View style={[st.detailFooter, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
              <View>
                <Text style={[st.footerPrice, { color: Colors.gold }]}>{item.price} ACoin</Text>
                <Text style={[st.footerDelivery, { color: colors.textMuted }]}>{item.delivery_days} day delivery</Text>
              </View>
              <TouchableOpacity style={[st.orderBtn, { backgroundColor: colors.accent }]} onPress={() => placeOrder(item)} disabled={ordering === item.id}>
                {ordering === item.id ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="cart" size={18} color="#fff" />
                    <Text style={st.orderBtnText}>Order Now</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    );
  };

  const OrderDetailModal = () => {
    if (!detailOrder) return null;
    const o = detailOrder;
    const isSeller = o.seller_id === user?.id;
    const statusColor = STATUS_COLORS[o.status] || colors.textMuted;

    return (
      <Modal visible animationType="slide" onRequestClose={() => { setDetailOrder(null); setShowOrderAction(false); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[st.modalRoot, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
            <View style={[st.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => { setDetailOrder(null); setShowOrderAction(false); }} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[st.modalTitle, { color: colors.text }]}>Order Details</Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
              <View style={[st.detailHero, { backgroundColor: colors.surface }]}>
                <Text style={{ fontSize: 40, textAlign: "center", marginBottom: 8 }}>{o.listing_emoji}</Text>
                <Text style={[st.detailTitle, { color: colors.text }]}>{o.listing_title}</Text>
                <View style={[st.statusPill, { backgroundColor: statusColor + "18", alignSelf: "center", marginTop: 8 }]}>
                  <View style={[st.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[st.statusText, { color: statusColor }]}>{STATUS_LABELS[o.status]}</Text>
                </View>
              </View>

              <View style={[st.detailSection, { backgroundColor: colors.surface }]}>
                <View style={st.orderInfoRow}>
                  <Text style={[st.orderInfoLabel, { color: colors.textMuted }]}>Amount</Text>
                  <Text style={[st.orderInfoVal, { color: Colors.gold }]}>{o.price_paid} ACoin</Text>
                </View>
                <View style={st.orderInfoRow}>
                  <Text style={[st.orderInfoLabel, { color: colors.textMuted }]}>Seller</Text>
                  <TouchableOpacity onPress={() => { setDetailOrder(null); router.push({ pathname: "/contact/[id]", params: { id: o.seller_id } }); }}>
                    <Text style={[st.orderInfoVal, { color: colors.accent }]}>@{o.seller_handle}</Text>
                  </TouchableOpacity>
                </View>
                <View style={st.orderInfoRow}>
                  <Text style={[st.orderInfoLabel, { color: colors.textMuted }]}>Buyer</Text>
                  <TouchableOpacity onPress={() => { setDetailOrder(null); router.push({ pathname: "/contact/[id]", params: { id: o.buyer_id } }); }}>
                    <Text style={[st.orderInfoVal, { color: colors.accent }]}>@{o.buyer_handle}</Text>
                  </TouchableOpacity>
                </View>
                <View style={st.orderInfoRow}>
                  <Text style={[st.orderInfoLabel, { color: colors.textMuted }]}>Placed</Text>
                  <Text style={[st.orderInfoVal, { color: colors.text }]}>{new Date(o.created_at).toLocaleDateString()}</Text>
                </View>
                {o.completed_at && (
                  <View style={st.orderInfoRow}>
                    <Text style={[st.orderInfoLabel, { color: colors.textMuted }]}>Completed</Text>
                    <Text style={[st.orderInfoVal, { color: colors.text }]}>{new Date(o.completed_at).toLocaleDateString()}</Text>
                  </View>
                )}
                <View style={st.orderInfoRow}>
                  <Text style={[st.orderInfoLabel, { color: colors.textMuted }]}>Revisions</Text>
                  <Text style={[st.orderInfoVal, { color: colors.text }]}>{o.revision_count}/{o.max_revisions}</Text>
                </View>
              </View>

              {o.buyer_note ? (
                <View style={[st.detailSection, { backgroundColor: colors.surface }]}>
                  <Text style={[st.sectionTitle, { color: colors.text }]}>Buyer Note</Text>
                  <Text style={[st.sectionBody, { color: colors.textSecondary }]}>{o.buyer_note}</Text>
                </View>
              ) : null}

              {o.delivery_message ? (
                <View style={[st.detailSection, { backgroundColor: colors.surface }]}>
                  <Text style={[st.sectionTitle, { color: colors.text }]}>Delivery Message</Text>
                  <Text style={[st.sectionBody, { color: colors.textSecondary }]}>{o.delivery_message}</Text>
                </View>
              ) : null}

              {o.cancel_reason ? (
                <View style={[st.detailSection, { backgroundColor: colors.surface }]}>
                  <Text style={[st.sectionTitle, { color: colors.text }]}>Cancellation Reason</Text>
                  <Text style={[st.sectionBody, { color: "#FF3B30" }]}>{o.cancel_reason}</Text>
                </View>
              ) : null}

              {o.status === "completed" && !isSeller && (
                <View style={[st.detailSection, { backgroundColor: colors.surface }]}>
                  <Text style={[st.sectionTitle, { color: colors.text }]}>Leave a Review</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                    {[1, 2, 3, 4, 5].map(s => (
                      <TouchableOpacity key={s} onPress={() => setReviewRating(s)}>
                        <Ionicons name={reviewRating >= s ? "star" : "star-outline"} size={28} color="#FFD60A" />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput style={[st.textArea, { backgroundColor: colors.backgroundSecondary, color: colors.text, borderColor: colors.border }]} placeholder="Write your review..." placeholderTextColor={colors.textMuted} value={reviewComment} onChangeText={setReviewComment} multiline />
                  <TouchableOpacity style={[st.primaryBtn, { backgroundColor: colors.accent }]} onPress={() => submitReview(o)} disabled={submittingAction}>
                    {submittingAction ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryBtnText}>Submit Review</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            {!["completed", "cancelled"].includes(o.status) && (
              <View style={[st.detailFooter, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
                {isSeller && o.status === "pending" && (
                  <>
                    <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.accent, flex: 1 }]} onPress={() => updateOrderStatus(o, "in_progress")}>
                      <Ionicons name="play" size={16} color="#fff" />
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Start Work</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#FF3B30" + "15", flex: 1 }]} onPress={() => updateOrderStatus(o, "cancelled", "Seller declined")}>
                      <Text style={{ color: "#FF3B30", fontWeight: "600", fontSize: 14 }}>Decline</Text>
                    </TouchableOpacity>
                  </>
                )}
                {isSeller && o.status === "in_progress" && (
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#5856D6", flex: 1 }]} onPress={() => { setShowOrderAction(true); }}>
                    <Ionicons name="checkmark-done" size={16} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Deliver</Text>
                  </TouchableOpacity>
                )}
                {isSeller && o.status === "revision" && (
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#5856D6", flex: 1 }]} onPress={() => { setShowOrderAction(true); }}>
                    <Ionicons name="refresh" size={16} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Redeliver</Text>
                  </TouchableOpacity>
                )}
                {!isSeller && o.status === "delivered" && (
                  <>
                    <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#34C759", flex: 1 }]} onPress={() => updateOrderStatus(o, "completed")}>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Accept</Text>
                    </TouchableOpacity>
                    {o.revision_count < o.max_revisions && (
                      <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#FF6B35" + "15", flex: 1 }]} onPress={() => updateOrderStatus(o, "revision")}>
                        <Text style={{ color: "#FF6B35", fontWeight: "600", fontSize: 14 }}>Request Revision</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
                {!isSeller && o.status === "pending" && (
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#FF3B30" + "15", flex: 1 }]} onPress={() => updateOrderStatus(o, "cancelled", "Buyer cancelled")}>
                    <Text style={{ color: "#FF3B30", fontWeight: "600", fontSize: 14 }}>Cancel Order (Refund)</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {showOrderAction && (
              <View style={[st.actionOverlay, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
                <Text style={[st.sectionTitle, { color: colors.text, marginBottom: 8 }]}>Delivery Message</Text>
                <TextInput style={[st.textArea, { backgroundColor: colors.backgroundSecondary, color: colors.text, borderColor: colors.border }]} placeholder="Describe what you delivered..." placeholderTextColor={colors.textMuted} value={actionMessage} onChangeText={setActionMessage} multiline />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.backgroundSecondary, flex: 1 }]} onPress={() => setShowOrderAction(false)}>
                    <Text style={{ color: colors.text, fontWeight: "600" }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#5856D6", flex: 1 }]} onPress={() => updateOrderStatus(detailOrder!, "delivered", actionMessage)} disabled={submittingAction}>
                    {submittingAction ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Send Delivery</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const CreateModal = () => (
    <Modal visible={showCreateModal} animationType="slide" onRequestClose={() => { setShowCreateModal(false); resetCreateForm(); }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[st.modalRoot, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
          <View style={[st.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setShowCreateModal(false); resetCreateForm(); }} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[st.modalTitle, { color: colors.text }]}>{editingListing ? "Edit Service" : "List a Service"}</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
            {[
              { label: "Emoji", val: createEmoji, set: setCreateEmoji, placeholder: "💼", max: 4 },
              { label: "Service Title", val: createTitle, set: setCreateTitle, placeholder: "e.g. I will design your logo", max: 100 },
            ].map((f) => (
              <View key={f.label}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>{f.label}</Text>
                <View style={[st.field, { backgroundColor: colors.surface }]}>
                  <TextInput style={[st.fieldInput, { color: colors.text }]} placeholder={f.placeholder} placeholderTextColor={colors.textMuted} value={f.val} onChangeText={f.set} maxLength={f.max} />
                </View>
              </View>
            ))}

            <View>
              <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {CATEGORIES.filter(c => c !== "All").map(c => (
                  <TouchableOpacity key={c} style={[st.catFilter, { backgroundColor: createCategory === c ? colors.accent : colors.surface, borderColor: createCategory === c ? colors.accent : colors.border }]} onPress={() => setCreateCategory(c)}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: createCategory === c ? "#fff" : colors.textMuted }}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Price (ACoin)</Text>
                <View style={[st.field, { backgroundColor: colors.surface }]}>
                  <TextInput style={[st.fieldInput, { color: colors.text }]} placeholder="200" placeholderTextColor={colors.textMuted} value={createPrice} onChangeText={setCreatePrice} keyboardType="numeric" />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Delivery (days)</Text>
                <View style={[st.field, { backgroundColor: colors.surface }]}>
                  <TextInput style={[st.fieldInput, { color: colors.text }]} placeholder="3" placeholderTextColor={colors.textMuted} value={createDays} onChangeText={setCreateDays} keyboardType="numeric" />
                </View>
              </View>
            </View>

            <View>
              <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Description</Text>
              <TextInput style={[st.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, minHeight: 100 }]} placeholder="Describe your service in detail. What will the buyer get?" placeholderTextColor={colors.textMuted} value={createDesc} onChangeText={setCreateDesc} multiline />
            </View>

            <View>
              <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Requirements (what you need from the buyer)</Text>
              <TextInput style={[st.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]} placeholder="e.g. Brand colors, reference images, company name..." placeholderTextColor={colors.textMuted} value={createRequirements} onChangeText={setCreateRequirements} multiline />
            </View>

            <View>
              <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>Tags (comma-separated)</Text>
              <View style={[st.field, { backgroundColor: colors.surface }]}>
                <TextInput style={[st.fieldInput, { color: colors.text }]} placeholder="logo, branding, design" placeholderTextColor={colors.textMuted} value={createTags} onChangeText={setCreateTags} />
              </View>
            </View>

            <TouchableOpacity style={[st.primaryBtn, { backgroundColor: colors.accent, opacity: creating ? 0.7 : 1 }]} onPress={createListing} disabled={creating}>
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryBtnText}>{editingListing ? "Save Changes" : "List Service"}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const DashboardView = () => (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatBox label="Earnings" value={`${totalEarnings} 🪙`} icon="wallet" color={colors.text} accent={Colors.gold} />
        <StatBox label="Active" value={activeOrders.length} icon="flash" color={colors.text} accent={colors.accent} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatBox label="Listings" value={myListings.length} icon="storefront" color={colors.text} accent="#5856D6" />
        <StatBox label="Completed" value={sellingOrders.filter(o => o.status === "completed").length} icon="checkmark-done-circle" color={colors.text} accent="#34C759" />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <Text style={[st.sectionTitle, { color: colors.text }]}>My Services</Text>
        <TouchableOpacity style={[st.smallBtn, { backgroundColor: colors.accent }]} onPress={() => { resetCreateForm(); setShowCreateModal(true); }}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>New</Text>
        </TouchableOpacity>
      </View>

      {myListings.length === 0 ? (
        <View style={st.emptyState}>
          <Text style={{ fontSize: 40 }}>💼</Text>
          <Text style={[st.emptyTitle, { color: colors.text }]}>No services listed yet</Text>
          <Text style={[st.emptyDesc, { color: colors.textMuted }]}>Create your first service and start earning ACoin</Text>
          <TouchableOpacity style={[st.primaryBtn, { backgroundColor: colors.accent, width: "100%" }]} onPress={() => { resetCreateForm(); setShowCreateModal(true); }}>
            <Text style={st.primaryBtnText}>Create Your First Service</Text>
          </TouchableOpacity>
        </View>
      ) : (
        myListings.map(l => (
          <TouchableOpacity key={l.id} style={[st.card, { backgroundColor: colors.surface }]} onPress={() => openDetail(l)}>
            <View style={st.cardHeader}>
              <Text style={{ fontSize: 22 }}>{l.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[st.cardTitle, { color: colors.text }]} numberOfLines={1}>{l.title}</Text>
                <Text style={[st.metaText, { color: colors.textMuted }]}>{l.orders_count} orders · {l.rating.toFixed(1)} ★</Text>
              </View>
              <Text style={[st.priceText, { color: Colors.gold }]}>{l.price} 🪙</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <TouchableOpacity style={[st.smallBtn, { backgroundColor: colors.accent + "15" }]} onPress={() => openEditListing(l)}>
                <Ionicons name="create-outline" size={14} color={colors.accent} />
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.smallBtn, { backgroundColor: l.is_active ? "#FF950015" : "#34C75915" }]} onPress={() => toggleListingActive(l)}>
                <Ionicons name={l.is_active ? "pause-circle-outline" : "play-circle-outline"} size={14} color={l.is_active ? "#FF9500" : "#34C759"} />
                <Text style={{ color: l.is_active ? "#FF9500" : "#34C759", fontSize: 12, fontWeight: "600" }}>{l.is_active ? "Pause" : "Activate"}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.text }]}>Freelance</Text>
        <TouchableOpacity onPress={() => { resetCreateForm(); setShowCreateModal(true); }} hitSlop={12}>
          <Ionicons name="add-circle-outline" size={24} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={[st.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {([
          { key: "browse" as const, label: "Explore", icon: "compass-outline" },
          { key: "orders" as const, label: "Orders", icon: "receipt-outline" },
          { key: "dashboard" as const, label: "Dashboard", icon: "stats-chart-outline" },
        ]).map((t) => (
          <TouchableOpacity key={t.key} style={[st.tab, mainTab === t.key && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]} onPress={() => setMainTab(t.key)}>
            <Ionicons name={t.icon as any} size={18} color={mainTab === t.key ? colors.accent : colors.textMuted} />
            <Text style={[st.tabText, { color: mainTab === t.key ? colors.accent : colors.textMuted }]}>{t.label}</Text>
            {t.key === "orders" && activeOrders.length > 0 && (
              <View style={[st.badge, { backgroundColor: colors.accent }]}>
                <Text style={st.badgeText}>{activeOrders.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {mainTab === "browse" && (
        <>
          <View style={[st.searchRow, { backgroundColor: colors.surface }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput style={[st.searchInput, { color: colors.text }]} placeholder="Search services..." placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={setSearchQuery} />
            {searchQuery ? <TouchableOpacity onPress={() => setSearchQuery("")}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity> : null}
          </View>
          <View style={{ flexDirection: "row" }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat} style={[st.catFilter, { backgroundColor: selectedCat === cat ? colors.accent : colors.surface, borderColor: selectedCat === cat ? colors.accent : colors.border }]} onPress={() => setSelectedCat(cat)}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: selectedCat === cat ? "#fff" : colors.textMuted }}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 6, gap: 6 }}>
            {SORT_OPTIONS.map((s) => (
              <TouchableOpacity key={s} style={[st.sortChip, { backgroundColor: sortBy === s ? colors.accent + "18" : "transparent" }]} onPress={() => setSortBy(s)}>
                <Text style={{ fontSize: 11, color: sortBy === s ? colors.accent : colors.textMuted }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {mainTab === "orders" && (
        <View style={[st.subTabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={[st.subTab, orderTab === "buying" && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]} onPress={() => setOrderTab("buying")}>
            <Text style={[st.tabText, { color: orderTab === "buying" ? colors.accent : colors.textMuted }]}>Buying ({buyingOrders.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.subTab, orderTab === "selling" && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]} onPress={() => setOrderTab("selling")}>
            <Text style={[st.tabText, { color: orderTab === "selling" ? colors.accent : colors.textMuted }]}>Selling ({sellingOrders.length})</Text>
          </TouchableOpacity>
        </View>
      )}

      {mainTab === "dashboard" ? (
        <DashboardView />
      ) : loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : mainTab === "browse" ? (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderListingCard}
          contentContainerStyle={{ gap: 8, padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={st.emptyState}>
              <Text style={{ fontSize: 48 }}>🔍</Text>
              <Text style={[st.emptyTitle, { color: colors.text }]}>{searchQuery ? "No results found" : "No services yet"}</Text>
              <Text style={[st.emptyDesc, { color: colors.textMuted }]}>{searchQuery ? "Try a different search" : "Be the first to list a service!"}</Text>
              {!searchQuery && (
                <TouchableOpacity style={[st.primaryBtn, { backgroundColor: colors.accent }]} onPress={() => { resetCreateForm(); setShowCreateModal(true); }}>
                  <Text style={st.primaryBtnText}>List a Service</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      ) : (
        <FlatList
          data={orderTab === "buying" ? buyingOrders : sellingOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderCard}
          contentContainerStyle={{ gap: 8, padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={st.emptyState}>
              <Text style={{ fontSize: 48 }}>{orderTab === "buying" ? "🛒" : "📦"}</Text>
              <Text style={[st.emptyTitle, { color: colors.text }]}>No {orderTab === "buying" ? "purchases" : "sales"} yet</Text>
              <Text style={[st.emptyDesc, { color: colors.textMuted }]}>{orderTab === "buying" ? "Browse the marketplace to find services" : "List a service to start receiving orders"}</Text>
            </View>
          }
        />
      )}

      <DetailModal />
      <OrderDetailModal />
      <CreateModal />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5 },
  tabText: { fontSize: 13, fontWeight: "600" },
  subTabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  subTab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  badge: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", marginLeft: 2 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginTop: 10, paddingHorizontal: 12, height: 42, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  catFilter: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  card: { borderRadius: 14, padding: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  cardEmoji: { fontSize: 26 },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardSeller: { fontSize: 12, marginTop: 1 },
  cardDesc: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  catTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  catTagText: { fontSize: 11, fontWeight: "600" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 12 },
  pricePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  priceText: { fontSize: 13, fontWeight: "700" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "600" },
  emptyState: { alignItems: "center", paddingVertical: 50, gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: "700", textAlign: "center" },
  detailHero: { padding: 20, alignItems: "center" },
  detailTitle: { fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sellerAvatar: { width: 28, height: 28, borderRadius: 14 },
  sellerName: { fontSize: 14, fontWeight: "600" },
  sellerHandle: { fontSize: 13 },
  detailStats: { flexDirection: "row", gap: 16, marginTop: 8 },
  detailStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailStatText: { fontSize: 13 },
  detailSection: { padding: 16, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  sectionBody: { fontSize: 14, lineHeight: 21 },
  tagChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  reviewCard: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 10 },
  detailFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footerPrice: { fontSize: 20, fontWeight: "700" },
  footerDelivery: { fontSize: 12, marginTop: 2 },
  orderBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  orderBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  actionOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  orderInfoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#0001" },
  orderInfoLabel: { fontSize: 14 },
  orderInfoVal: { fontSize: 14, fontWeight: "600" },
  fieldLabel: { fontSize: 13, fontWeight: "500", marginBottom: 6 },
  field: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, height: 48 },
  fieldInput: { flex: 1, fontSize: 15 },
  textArea: { borderRadius: 12, padding: 14, fontSize: 14, minHeight: 70, textAlignVertical: "top", borderWidth: 1 },
  primaryBtn: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  statBox: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", gap: 4 },
  statVal: { fontSize: 20, fontWeight: "700" },
  statLabel: { fontSize: 12 },
});
