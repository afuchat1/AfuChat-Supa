import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image as RNImage,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { LinearGradient } from "@/components/ui/SafeGradient";
import Colors from "@/constants/colors";
import { transferAcoin } from "@/lib/monetize";
import { showAlert } from "@/lib/alert";
import { useSuperApp } from "@/lib/superapp/SuperAppContext";
import { FreelanceCardSkeleton } from "@/components/ui/Skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────
type Seller = { display_name: string | null; handle: string | null; avatar_url: string | null; is_verified: boolean };
type Gig = {
  id: string; title: string; description: string | null; price: number;
  delivery_days: number; category: string | null; emoji: string; seller_id: string;
  orders_count: number; rating: number; review_count: number; tags: string[];
  requirements: string | null; is_active: boolean; created_at: string; seller: Seller | null;
};
type Review = { id: string; rating: number; comment: string; reviewer_name: string; reviewer_handle: string; reviewer_avatar: string | null; created_at: string };
type Screen = "browse" | "detail" | "post-gig";

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ["All", "Design", "Dev", "Writing", "Marketing", "Video", "Music", "AI", "Business", "Other"];
const CAT_ICONS: Record<string, string> = {
  All: "apps-outline", Design: "color-palette-outline", Dev: "code-slash-outline",
  Writing: "document-text-outline", Marketing: "megaphone-outline", Video: "videocam-outline",
  Music: "musical-notes-outline", AI: "hardware-chip-outline", Business: "briefcase-outline", Other: "ellipsis-horizontal-outline",
};

const SEL = "id,title,description,price,delivery_days,category,emoji,seller_id,orders_count,rating,review_count,tags,requirements,is_active,created_at,seller:profiles!freelance_listings_seller_id_fkey(display_name,handle,avatar_url,is_verified)";

function ago(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "now"; if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function Stars({ n }: { n: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <Ionicons key={i} name={n >= i ? "star" : n >= i - 0.5 ? "star-half" : "star-outline"} size={12} color="#FBBF24" />
      ))}
    </View>
  );
}

function toListing(l: any): Gig {
  return {
    id: l.id, title: l.title, description: l.description || null, price: l.price || 0,
    delivery_days: l.delivery_days || 3, category: l.category || "Other", emoji: l.emoji || "💼",
    seller_id: l.seller_id, orders_count: l.orders_count || 0, rating: Number(l.rating) || 0,
    review_count: l.review_count || 0, tags: l.tags || [], requirements: l.requirements || null,
    is_active: l.is_active ?? true, created_at: l.created_at, seller: l.seller || null,
  };
}

export default function AfuFreelanceApp({ initialScreen }: { initialScreen?: Screen }) {
  const { colors, accent } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { navigateOutside } = useSuperApp();

  const [screen, setScreen] = useState<Screen>("browse");
  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGig, setSelectedGig] = useState<Gig | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [placing, setPlacing] = useState(false);

  // Post Gig form
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fPrice, setFPrice] = useState("200");
  const [fDays, setFDays] = useState("3");
  const [fCat, setFCat] = useState("Design");
  const [fEmoji, setFEmoji] = useState("💼");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (initialScreen) setScreen(initialScreen);
  }, [initialScreen]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("freelance_listings").select(SEL).eq("is_active", true)
      .order("orders_count", { ascending: false }).limit(60);
    if (cat !== "All") q = q.eq("category", cat);
    const { data } = await q;
    setGigs(data ? data.map(toListing) : []);
    setLoading(false);
  }, [cat]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, [load]);

  async function loadReviews(gigId: string) {
    try {
      const { data } = await supabase.from("freelance_reviews")
        .select("id,rating,comment,created_at,reviewer:profiles!freelance_reviews_reviewer_id_fkey(display_name,handle,avatar_url)")
        .eq("listing_id", gigId).order("created_at", { ascending: false }).limit(20);
      if (data) setReviews(data.map((r: any) => ({
        id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at,
        reviewer_name: r.reviewer?.display_name || "User", reviewer_handle: r.reviewer?.handle || "user",
        reviewer_avatar: r.reviewer?.avatar_url || null,
      })));
    } catch { setReviews([]); }
  }

  function openGig(gig: Gig) {
    setSelectedGig(gig);
    setReviews([]);
    loadReviews(gig.id);
    setScreen("detail");
  }

  async function placeOrder() {
    if (!user || !profile || !selectedGig) return;
    if (selectedGig.seller_id === user.id) { showAlert("Oops", "You can't order your own service."); return; }
    if ((profile.acoin || 0) < selectedGig.price) {
      showAlert("Not enough ACoin", `Need ${selectedGig.price} ACoin, you have ${profile.acoin || 0}.`, [
        { text: "Top Up", onPress: () => navigateOutside("/app/afupay?section=topup") }, { text: "Cancel" },
      ]); return;
    }
    showAlert("Confirm Order", `Pay ${selectedGig.price} ACoin to @${selectedGig.seller?.handle}?`, [
      { text: "Cancel", style: "cancel" },
      { text: `Pay ${selectedGig.price} ACoin`, onPress: async () => {
        setPlacing(true);
        const res = await transferAcoin({
          buyerId: user.id, sellerId: selectedGig.seller_id,
          buyerCurrentAcoin: profile.acoin || 0, amount: selectedGig.price,
          transactionType: "monetize_freelance", metadata: { listing_id: selectedGig.id },
        });
        if (res.success) {
          await supabase.from("freelance_orders").insert({ listing_id: selectedGig.id, buyer_id: user.id, seller_id: selectedGig.seller_id, price_paid: selectedGig.price, status: "pending", max_revisions: 1 });
          showAlert("Ordered!", "Your order has been placed. The seller will start soon.");
          setScreen("browse"); load();
        } else showAlert("Failed", res.error || "Payment failed.");
        setPlacing(false);
      }},
    ]);
  }

  async function shareGig(gig: Gig) {
    const url = `https://afuchat.com/freelance/${gig.id}`;
    try {
      await Share.share({
        message: `Check out "${gig.title}" on AfuFreelance 💼\n${url}`,
        url,
        title: gig.title,
      });
    } catch { /* user cancelled */ }
  }

  async function submitGig() {
    if (!user || !fTitle.trim()) return;
    const price = parseInt(fPrice); if (!price || price < 1) { showAlert("Invalid", "Enter a valid price."); return; }
    setPosting(true);
    const { error } = await supabase.from("freelance_listings").insert({
      title: fTitle.trim(), description: fDesc.trim() || null, price, emoji: fEmoji,
      category: fCat, delivery_days: parseInt(fDays) || 3, seller_id: user.id,
      is_active: true, orders_count: 0, rating: 0, review_count: 0,
    });
    setPosting(false);
    if (error) { showAlert("Error", error.message); return; }
    showAlert("Published!", "Your service is now live.");
    setFTitle(""); setFDesc(""); setFPrice("200"); setFDays("3"); setFEmoji("💼");
    setScreen("browse"); load();
  }

  const filtered = cat === "All" && !search.trim() ? gigs
    : gigs.filter(g => {
        if (search.trim() && !g.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      });

  // ─── Post Gig screen ────────────────────────────────────────────────────────
  if (screen === "post-gig") {
    return (
      <KeyboardAvoidingView style={[s.root, { backgroundColor: colors.background }]} behavior="height">
        <View style={[s.subHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => setScreen("browse")} hitSlop={12} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[s.subTitle, { color: colors.text }]}>Create a service</Text>
          <View style={{ width: 34 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <View style={[s.formIntro, { backgroundColor: colors.inputBg }]}>
            <View style={[s.formIntroIcon, { backgroundColor: accent + "18" }]}>
              <Ionicons name="bulb-outline" size={22} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.formIntroTitle, { color: colors.text }]}>Share what you do best</Text>
              <Text style={[s.formIntroCopy, { color: colors.textMuted }]}>Set a clear offer and let the right people find you.</Text>
            </View>
          </View>
          {/* Emoji + Title */}
          <View style={[s.formSection, { backgroundColor: colors.inputBg }]}>
            <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ width: 72 }}>
              <Text style={[s.label, { color: colors.textSecondary }]}>Icon</Text>
              <View style={[s.fieldBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput style={[s.fieldInput, { color: colors.text, textAlign: "center", fontSize: 22 }]} value={fEmoji} onChangeText={setFEmoji} maxLength={4} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.textSecondary }]}>Title *</Text>
              <View style={[s.fieldBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput style={[s.fieldInput, { color: colors.text }]} placeholder="e.g. I will design your logo" placeholderTextColor={colors.textMuted} value={fTitle} onChangeText={setFTitle} maxLength={100} />
              </View>
            </View>
            </View>
          </View>

          {/* Category */}
          <View style={[s.formSection, { backgroundColor: colors.inputBg }]}>
            <Text style={[s.label, { color: colors.textSecondary }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6 }}>
              {CATEGORIES.filter(c => c !== "All").map(c => (
                <TouchableOpacity key={c} style={[s.catPill, { backgroundColor: fCat === c ? accent : colors.surface, borderColor: fCat === c ? accent : colors.border }]} onPress={() => setFCat(c)} activeOpacity={0.8}>
                  <Text style={[s.catPillText, { color: fCat === c ? "#fff" : colors.textMuted }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Price + Days */}
          <View style={[s.formSection, { backgroundColor: colors.inputBg, flexDirection: "row", gap: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.textSecondary }]}>Price (ACoin)</Text>
              <View style={[s.fieldBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput style={[s.fieldInput, { color: colors.text }]} placeholder="200" placeholderTextColor={colors.textMuted} value={fPrice} onChangeText={setFPrice} keyboardType="numeric" />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.textSecondary }]}>Delivery (days)</Text>
              <View style={[s.fieldBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput style={[s.fieldInput, { color: colors.text }]} placeholder="3" placeholderTextColor={colors.textMuted} value={fDays} onChangeText={setFDays} keyboardType="numeric" />
              </View>
            </View>
          </View>

          {/* Description */}
          <View style={[s.formSection, { backgroundColor: colors.inputBg }]}>
            <Text style={[s.label, { color: colors.textSecondary }]}>Description</Text>
            <TextInput style={[s.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} placeholder="What will the buyer receive?" placeholderTextColor={colors.textMuted} value={fDesc} onChangeText={setFDesc} multiline numberOfLines={5} />
          </View>

          <Pressable style={[s.submitBtn, { backgroundColor: accent, opacity: posting || !fTitle.trim() ? 0.6 : 1 }]} onPress={submitGig} disabled={posting || !fTitle.trim()}>
            {posting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.submitBtnText}>Publish Service</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ─── Gig Detail screen ──────────────────────────────────────────────────────
  if (screen === "detail" && selectedGig) {
    const g = selectedGig;
    const own = g.seller_id === user?.id;
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.subHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => setScreen("browse")} hitSlop={12} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[s.subTitle, { color: colors.text }]} numberOfLines={1}>{g.title}</Text>
          <Pressable onPress={() => shareGig(g)} hitSlop={12} style={s.backBtn}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <LinearGradient colors={[accent + "20", colors.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroCard}>
            <View style={[s.heroEmoji, { backgroundColor: accent + "15" }]}>
              <Text style={{ fontSize: 44 }}>{g.emoji}</Text>
            </View>
            <Text style={[s.heroTitle, { color: colors.text }]}>{g.title}</Text>
            {g.category && (
              <View style={[s.catChip, { backgroundColor: accent + "15" }]}>
                <Text style={[s.catChipText, { color: accent }]}>{g.category}</Text>
              </View>
            )}
            <View style={s.heroStats}>
              {[
                { icon: "star", val: g.rating > 0 ? g.rating.toFixed(1) : "New", sub: `${g.review_count} reviews`, c: "#FBBF24" },
                { icon: "cart", val: `${g.orders_count}`, sub: "orders", c: accent },
                { icon: "time", val: `${g.delivery_days}d`, sub: "delivery", c: "#8B5CF6" },
              ].map((st, i) => (
                <View key={i} style={s.heroStatItem}>
                  <Ionicons name={st.icon as any} size={16} color={st.c} />
                  <Text style={[s.heroStatVal, { color: colors.text }]}>{st.val}</Text>
                  <Text style={[s.heroStatSub, { color: colors.textMuted }]}>{st.sub}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>

          {/* Seller */}
          {g.seller && (
            <View style={[s.sec, { backgroundColor: colors.inputBg }]}>
              <Text style={[s.secHead, { color: colors.textSecondary }]}>Seller</Text>
              <TouchableOpacity style={s.sellerRow}
                onPress={() => navigateOutside("/contact/[id]", { id: g.seller_id })}>
                {g.seller.avatar_url
                  ? <Image source={{ uri: g.seller.avatar_url }} style={s.sellerAvatar} />
                  : <View style={[s.sellerAvatarFallback, { backgroundColor: accent + "22" }]}><Ionicons name="person" size={20} color={accent} /></View>}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={[s.sellerName, { color: colors.text }]}>{g.seller.display_name ?? `@${g.seller.handle}`}</Text>
                    {g.seller.is_verified && <Ionicons name="checkmark-circle" size={14} color={accent} />}
                  </View>
                  <Text style={[s.sellerHandle, { color: colors.textMuted }]}>@{g.seller.handle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Description */}
          {g.description && (
            <View style={[s.sec, { backgroundColor: colors.inputBg }]}>
              <Text style={[s.secHead, { color: colors.textSecondary }]}>About this service</Text>
              <Text style={[s.secBody, { color: colors.text }]}>{g.description}</Text>
            </View>
          )}

          {/* Tags */}
          {g.tags.length > 0 && (
            <View style={[s.sec, { backgroundColor: colors.inputBg }]}>
              <Text style={[s.secHead, { color: colors.textSecondary }]}>Tags</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {g.tags.map((t, i) => (
                  <View key={i} style={[s.tagChip, { backgroundColor: accent + "12" }]}>
                    <Text style={[s.tagText, { color: accent }]}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Requirements */}
          {g.requirements && (
            <View style={[s.sec, { backgroundColor: colors.inputBg }]}>
              <Text style={[s.secHead, { color: colors.textSecondary }]}>What the seller needs</Text>
              <Text style={[s.secBody, { color: colors.text }]}>{g.requirements}</Text>
            </View>
          )}

          {/* Reviews */}
          <View style={[s.sec, { backgroundColor: colors.inputBg }]}>
            <Text style={[s.secHead, { color: colors.textSecondary }]}>Reviews ({reviews.length})</Text>
            {reviews.length === 0
              ? <Text style={[s.secBody, { color: colors.textMuted }]}>No reviews yet.</Text>
              : reviews.map(r => (
                <View key={r.id} style={[s.reviewRow, { borderTopColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Stars n={r.rating} />
                    <Text style={[s.reviewHandle, { color: colors.text }]}>@{r.reviewer_handle}</Text>
                    <Text style={[s.heroStatSub, { color: colors.textMuted }]}>{ago(r.created_at)}</Text>
                  </View>
                  {r.comment ? <Text style={[s.secBody, { color: colors.textSecondary }]}>{r.comment}</Text> : null}
                </View>
              ))}
          </View>
        </ScrollView>

        {/* Action bar */}
        {!own && (
          <View style={[s.actionBar, { backgroundColor: colors.inputBg, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
            <View>
              <Text style={[s.actionPrice, { color: accent }]}>{g.price.toLocaleString()} ACoin</Text>
              <Text style={[s.heroStatSub, { color: colors.textMuted }]}>{g.delivery_days}-day delivery</Text>
            </View>
            <Pressable style={[s.orderBtn, { backgroundColor: accent }]} onPress={placeOrder} disabled={placing}>
              {placing
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="flash" size={16} color="#fff" /><Text style={s.orderBtnText}>Order Now</Text></>}
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  // ─── Browse screen ──────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={[accent, Colors.brandDark]} style={[s.hero, { paddingTop: insets.top + 18 }]}>
        <View style={s.heroGlowOne} pointerEvents="none" />
        <View style={s.heroGlowTwo} pointerEvents="none" />
        <View style={s.heroTopRow}>
          <View style={s.heroBrand}>
            <View style={s.heroBrandIcon}>
              <Ionicons name="briefcase" size={18} color="#fff" />
            </View>
            <View>
              <Text style={s.heroEyebrow}>AFUCHAT MARKETPLACE</Text>
              <Text style={s.heroH1}>AfuFreelance</Text>
            </View>
          </View>
          <View style={s.livePill}>
            <View style={s.liveDot} />
            <Text style={s.livePillText}>Open now</Text>
          </View>
        </View>
        <Text style={s.heroHeadline}>Turn your next idea into momentum.</Text>
        <Text style={s.heroH2}>Hire talent · Find work · Earn ACoin</Text>
        <TouchableOpacity style={s.heroPostBtn} onPress={() => setScreen("post-gig")} activeOpacity={0.82}>
          <Ionicons name="add" size={17} color={accent} />
          <Text style={[s.heroPostBtnText, { color: accent }]}>Post a service</Text>
          <Ionicons name="arrow-forward" size={15} color={accent} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Search */}
      <View style={[s.searchWrap, { backgroundColor: colors.inputBg }]}>
        <View style={[s.searchIcon, { backgroundColor: accent + "16" }]}>
          <Ionicons name="search-outline" size={17} color={accent} />
        </View>
        <View style={s.searchContent}>
          <Text style={[s.searchLabel, { color: colors.textMuted }]}>FIND A SERVICE</Text>
          <TextInput style={[s.searchInput, { color: colors.text }]} placeholder="Search services…" placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} returnKeyType="search" />
        </View>
        {!!search && <Pressable onPress={() => setSearch("")} hitSlop={8}><Ionicons name="close-circle" size={17} color={colors.textMuted} /></Pressable>}
      </View>

      {/* Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
        {CATEGORIES.map(c => (
          <TouchableOpacity key={c} style={[s.catPill, { backgroundColor: cat === c ? accent : colors.inputBg, borderColor: cat === c ? accent : colors.border }]} onPress={() => setCat(c)} activeOpacity={0.8}>
            <Ionicons name={(CAT_ICONS[c] || "grid-outline") as any} size={13} color={cat === c ? "#fff" : colors.textMuted} />
            <Text style={[s.catPillText, { color: cat === c ? "#fff" : colors.textMuted }]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ padding: 14, gap: 10 }}>
          {[1,2,3,4].map(i => <FreelanceCardSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={g => g.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 14 }}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 40, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          ListHeaderComponent={
            <View style={s.listHeader}>
              <View>
                <Text style={[s.listTitle, { color: colors.text }]}>Explore services</Text>
                <Text style={[s.listSubtitle, { color: colors.textMuted }]}>Skilled people, ready to help</Text>
              </View>
              <View style={[s.resultPill, { backgroundColor: accent + "14" }]}>
                <Text style={[s.resultCount, { color: accent }]}>{filtered.length}</Text>
                <Text style={[s.resultLabel, { color: accent }]}>available</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={s.center}>
              <View style={[s.emptyIcon, { backgroundColor: accent + "14" }]}>
                <Ionicons name="briefcase-outline" size={34} color={accent} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.text }]}>No services yet</Text>
              <Text style={[s.heroStatSub, { color: colors.textMuted, textAlign: "center" }]}>Be the first to post in this category</Text>
              <TouchableOpacity style={[s.postBtn, { backgroundColor: accent, marginTop: 8 }]} onPress={() => setScreen("post-gig")} activeOpacity={0.82}>
                <Ionicons name="add" size={15} color="#fff" />
                <Text style={s.postBtnText}>Post a Gig</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={[s.gigCard, { backgroundColor: colors.inputBg }]}
              onPress={() => openGig(item)} activeOpacity={0.86}>
              <LinearGradient colors={[accent + "32", accent + "08"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.gigVisual}>
                <View style={[s.gigEmoji, { backgroundColor: accent + "12" }]}>
                  <Text style={{ fontSize: 30 }}>{item.emoji}</Text>
                </View>
                {item.category ? (
                  <View style={s.gigCategoryBadge}>
                    <Text style={s.gigCategoryText}>{item.category}</Text>
                  </View>
                ) : null}
              </LinearGradient>
              <View style={s.gigBody}>
                {/* seller */}
                <View style={s.gigSellerRow}>
                  {item.seller?.avatar_url
                    ? <Image source={{ uri: item.seller.avatar_url }} style={s.gigAvatar} />
                    : <View style={[s.gigAvatar, { backgroundColor: accent + "22", alignItems: "center", justifyContent: "center" }]}><Ionicons name="person" size={9} color={accent} /></View>}
                  <Text style={[s.gigSeller, { color: colors.textMuted }]} numberOfLines={1}>@{item.seller?.handle ?? "seller"}</Text>
                  {item.seller?.is_verified && <Ionicons name="checkmark-circle" size={11} color={accent} />}
                </View>
                <Text style={[s.gigTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                {item.rating > 0 && (
                  <View style={s.gigRating}>
                    <Ionicons name="star" size={11} color="#FBBF24" />
                    <Text style={[s.gigSeller, { color: colors.textMuted }]}>{item.rating.toFixed(1)}</Text>
                    <Text style={[s.gigReviews, { color: colors.textMuted }]}>({item.review_count})</Text>
                  </View>
                )}
                <View style={s.gigBottomRow}>
                  <View>
                    <Text style={[s.gigFrom, { color: colors.textMuted }]}>Starting at</Text>
                    <Text style={[s.gigPrice, { color: accent }]}>{item.price} <Text style={s.gigPriceUnit}>ACoin</Text></Text>
                  </View>
                  <View style={[s.gigArrow, { backgroundColor: accent + "14" }]}>
                    <Ionicons name="arrow-up-right-box" size={16} color={accent} />
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },

  hero: { margin: 14, borderRadius: 24, padding: 18, overflow: "hidden" },
  heroGlowOne: { position: "absolute", width: 220, height: 220, borderRadius: 110, right: -82, top: -128, backgroundColor: "rgba(255,255,255,0.10)" },
  heroGlowTwo: { position: "absolute", width: 150, height: 150, borderRadius: 75, left: -88, bottom: -96, backgroundColor: "rgba(255,255,255,0.07)" },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroBrandIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" },
  heroEyebrow: { color: "rgba(255,255,255,0.58)", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.1 },
  heroH1: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.4, marginTop: 1 },
  heroHeadline: { color: "#fff", fontSize: 22, lineHeight: 27, fontFamily: "Inter_700Bold", letterSpacing: -0.7, marginTop: 24, maxWidth: 290 },
  heroH2: { color: "rgba(255,255,255,0.64)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 5 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.13)" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#72F2A0" },
  livePillText: { color: "rgba(255,255,255,0.84)", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  heroPostBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 7, marginTop: 18, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 13, backgroundColor: "#fff" },
  heroPostBtnText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  postBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  postBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },

  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginBottom: 4, paddingHorizontal: 10, height: 64, borderRadius: 18, gap: 10 },
  searchIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  searchContent: { flex: 1, justifyContent: "center" },
  searchLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.9, marginBottom: 2 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  catRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  catPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  catPillText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2 },
  listTitle: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  listSubtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  resultPill: { alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  resultCount: { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 16 },
  resultLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold" },

  gigCard: { flex: 1, borderRadius: 18, overflow: "hidden" },
  gigVisual: { height: 118, alignItems: "center", justifyContent: "center", position: "relative" },
  gigEmoji: { width: 70, height: 70, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  gigCategoryBadge: { position: "absolute", top: 11, right: 11, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: "rgba(255,255,255,0.76)" },
  gigCategoryText: { color: "#202020", fontSize: 9, fontFamily: "Inter_700Bold" },
  gigBody: { padding: 12, gap: 5 },
  gigSellerRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  gigAvatar: { width: 17, height: 17, borderRadius: 9 },
  gigSeller: { flex: 1, fontSize: 10.5, fontFamily: "Inter_500Medium" },
  gigTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18, minHeight: 36 },
  gigRating: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  gigReviews: { fontSize: 10, fontFamily: "Inter_400Regular" },
  gigBottomRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 5 },
  gigFrom: { fontSize: 9, fontFamily: "Inter_400Regular", marginBottom: 1 },
  gigPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
  gigPriceUnit: { fontSize: 10, fontFamily: "Inter_500Medium" },
  gigArrow: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },

  subHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  backBtn: { padding: 4, width: 34 },
  subTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  formIntro: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, padding: 14 },
  formIntroIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  formIntroTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  formIntroCopy: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, marginTop: 3 },
  formSection: { borderRadius: 16, padding: 13, gap: 2 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 5 },
  fieldBox: { borderRadius: 12, paddingHorizontal: 14, height: 48, justifyContent: "center", borderWidth: 0.5 },
  fieldInput: { fontSize: 15, fontFamily: "Inter_400Regular" },
  textarea: { borderRadius: 12, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 110, textAlignVertical: "top", borderWidth: 0.5 },
  submitBtn: { borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center" },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  heroCard: { padding: 24, alignItems: "center", gap: 8, marginTop: 8, marginHorizontal: 14, borderRadius: 20, overflow: "hidden" },
  heroEmoji: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  catChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  catChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  heroStats: { flexDirection: "row", gap: 28, marginTop: 8 },
  heroStatItem: { alignItems: "center", gap: 2 },
  heroStatVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  heroStatSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sec: { padding: 16, marginTop: 8, gap: 8 },
  secHead: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  secBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sellerAvatar: { width: 44, height: 44, borderRadius: 22 },
  sellerAvatarFallback: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sellerName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sellerHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  tagChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  reviewRow: { paddingTop: 12, marginTop: 12, gap: 4 },
  reviewHandle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  actionBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14 },
  actionPrice: { fontSize: 20, fontFamily: "Inter_700Bold" },
  orderBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14 },
  orderBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  notFoundTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  notFoundSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  browseBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  browseBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
