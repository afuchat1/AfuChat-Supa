/**
 * /freelance/[id]  — Deep-link landing screen for a single freelance listing.
 *
 * Entry points:
 *   • afuchat://freelance/<uuid>          (custom scheme – native)
 *   • https://afuchat.com/freelance/<uuid> (universal link – native + web)
 *
 * The screen is a fully-functional standalone page: it fetches the listing,
 * shows the complete detail view, and lets signed-in users place an order.
 * Sharing a listing from inside the AfuFreelance mini app generates this URL.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { transferAcoin } from "@/lib/monetize";
import { showAlert } from "@/lib/alert";
import { safeRouter } from "@/lib/navUtils";
import Colors from "@/constants/colors";

// ── Types ─────────────────────────────────────────────────────────────────────

type Seller = {
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  is_verified: boolean;
};

type Gig = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  delivery_days: number;
  category: string | null;
  emoji: string;
  seller_id: string;
  orders_count: number;
  rating: number;
  review_count: number;
  tags: string[];
  requirements: string | null;
  is_active: boolean;
  created_at: string;
  seller: Seller | null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEL =
  "id,title,description,price,delivery_days,category,emoji,seller_id," +
  "orders_count,rating,review_count,tags,requirements,is_active,created_at," +
  "seller:profiles!freelance_listings_seller_id_fkey(display_name,handle,avatar_url,is_verified)";

function Stars({ n }: { n: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={n >= i ? "star" : n >= i - 0.5 ? "star-half" : "star"}
          size={12}
          color="#FBBF24"
        />
      ))}
    </View>
  );
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function freelanceUrl(id: string): string {
  return `https://afuchat.com/freelance/${id}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FreelanceListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, accent } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [gig, setGig]         = useState<Gig | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [placing, setPlacing] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadGig = useCallback(async () => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from("freelance_listings")
      .select(SEL)
      .eq("id", id)
      .single();

    if (error || !data) {
      setNotFound(true);
    } else {
      const g = data as any;
      setGig({
        id: g.id, title: g.title, description: g.description ?? null,
        price: g.price ?? 0, delivery_days: g.delivery_days ?? 3,
        category: g.category ?? "Other", emoji: g.emoji ?? "💼",
        seller_id: g.seller_id, orders_count: g.orders_count ?? 0,
        rating: Number(g.rating) ?? 0, review_count: g.review_count ?? 0,
        tags: g.tags ?? [], requirements: g.requirements ?? null,
        is_active: g.is_active ?? true, created_at: g.created_at,
        seller: g.seller ?? null,
      });

      // Load reviews in parallel
      supabase
        .from("freelance_reviews")
        .select(
          "id,rating,comment,created_at," +
          "reviewer:profiles!freelance_reviews_reviewer_id_fkey(display_name,handle,avatar_url)"
        )
        .eq("listing_id", id)
        .order("created_at", { ascending: false })
        .limit(20)
        .then(({ data: rv }) => {
          if (rv) {
            setReviews(
              rv.map((r: any) => ({
                id: r.id, rating: r.rating, comment: r.comment,
                created_at: r.created_at,
                reviewer_name: r.reviewer?.display_name ?? "User",
                reviewer_handle: r.reviewer?.handle ?? "user",
                reviewer_avatar: r.reviewer?.avatar_url ?? null,
              }))
            );
          }
        });
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { loadGig(); }, [loadGig]);

  // ── Share ─────────────────────────────────────────────────────────────────

  async function handleShare() {
    if (!gig) return;
    const url = freelanceUrl(gig.id);
    try {
      await Share.share({
        message: `Check out "${gig.title}" on AfuFreelance 💼\n${url}`,
        url,
        title: gig.title,
      });
    } catch { /* user cancelled */ }
  }

  // ── Order ─────────────────────────────────────────────────────────────────

  async function placeOrder() {
    if (!user || !profile || !gig) {
      showAlert("Sign In Required", "Sign in to place an order.");
      return;
    }
    if (gig.seller_id === user.id) {
      showAlert("Oops", "You can't order your own service.");
      return;
    }
    if ((profile.acoin ?? 0) < gig.price) {
      showAlert(
        "Not enough ACoin",
        `Need ${gig.price} ACoin, you have ${profile.acoin ?? 0}.`,
        [
          { text: "Top Up", onPress: () => safeRouter.push("/app/afupay?section=topup" as any) },
          { text: "Cancel" },
        ]
      );
      return;
    }
    showAlert(
      "Confirm Order",
      `Pay ${gig.price} ACoin to @${gig.seller?.handle}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Pay ${gig.price} ACoin`,
          onPress: async () => {
            setPlacing(true);
            const res = await transferAcoin({
              buyerId: user.id,
              sellerId: gig.seller_id,
              buyerCurrentAcoin: profile.acoin ?? 0,
              amount: gig.price,
              transactionType: "monetize_freelance",
              metadata: { listing_id: gig.id },
            });
            if (res.success) {
              await supabase.from("freelance_orders").insert({
                listing_id: gig.id, buyer_id: user.id,
                seller_id: gig.seller_id, price_paid: gig.price,
                status: "pending", max_revisions: 1,
              });
              showAlert("Ordered! 🎉", "Your order has been placed. The seller will start soon.");
            } else {
              showAlert("Payment failed", res.error ?? "Something went wrong.");
            }
            setPlacing(false);
          },
        },
      ]
    );
  }

  // ── Loading / Not found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <SafeHeader title="Loading…" onBack={() => router.back()} colors={colors} insets={insets} />
        <View style={st.center}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </View>
    );
  }

  if (notFound || !gig) {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <SafeHeader title="Not Found" onBack={() => router.back()} colors={colors} insets={insets} />
        <View style={st.center}>
          <Ionicons name="briefcase" size={56} color={colors.textMuted} />
          <Text style={[st.notFoundTitle, { color: colors.text }]}>Listing not found</Text>
          <Text style={[st.notFoundSub, { color: colors.textMuted }]}>
            This service may have been removed or the link is incorrect.
          </Text>
          <TouchableOpacity
            style={[st.browseBtn, { backgroundColor: accent }]}
            onPress={() => safeRouter.push("/app/afufreelance" as any)}
          >
            <Text style={st.browseBtnText}>Browse Services</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const own = gig.seller_id === user?.id;

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <SafeHeader
        title={gig.title}
        onBack={() => router.back()}
        onShare={handleShare}
        colors={colors}
        insets={insets}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: own ? 24 : 110 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={[st.heroCard, { backgroundColor: colors.surface }]}>
          <View style={[st.heroEmoji, { backgroundColor: accent + "15" }]}>
            <Text style={{ fontSize: 48 }}>{gig.emoji}</Text>
          </View>
          <Text style={[st.heroTitle, { color: colors.text }]}>{gig.title}</Text>
          {gig.category ? (
            <View style={[st.catChip, { backgroundColor: accent + "15" }]}>
              <Text style={[st.catChipText, { color: accent }]}>{gig.category}</Text>
            </View>
          ) : null}

          <View style={st.statsRow}>
            {[
              { icon: "star",  val: gig.rating > 0 ? gig.rating.toFixed(1) : "New", sub: `${gig.review_count} reviews`, c: "#FBBF24" },
              { icon: "cart",  val: String(gig.orders_count), sub: "orders", c: accent },
              { icon: "time",  val: `${gig.delivery_days}d`, sub: "delivery", c: "#8B5CF6" },
            ].map((s, i) => (
              <View key={i} style={st.statItem}>
                <Ionicons name={s.icon as any} size={16} color={s.c} />
                <Text style={[st.statVal, { color: colors.text }]}>{s.val}</Text>
                <Text style={[st.statSub, { color: colors.textMuted }]}>{s.sub}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Seller */}
        {gig.seller && (
          <Section head="Seller" colors={colors}>
            <TouchableOpacity
              style={st.sellerRow}
              onPress={() =>
                safeRouter.push({ pathname: "/contact/[id]", params: { id: gig.seller_id } } as any)
              }
              activeOpacity={0.75}
            >
              {gig.seller.avatar_url ? (
                <Image source={{ uri: gig.seller.avatar_url }} style={st.avatar} />
              ) : (
                <View style={[st.avatarFallback, { backgroundColor: accent + "22" }]}>
                  <Ionicons name="person" size={20} color={accent} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={[st.sellerName, { color: colors.text }]}>
                    {gig.seller.display_name ?? `@${gig.seller.handle}`}
                  </Text>
                  {gig.seller.is_verified && (
                    <Ionicons name="checkmark-circle" size={14} color={accent} />
                  )}
                </View>
                <Text style={[st.sellerHandle, { color: colors.textMuted }]}>
                  @{gig.seller.handle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Section>
        )}

        {/* Description */}
        {gig.description ? (
          <Section head="About this service" colors={colors}>
            <Text style={[st.body, { color: colors.text }]}>{gig.description}</Text>
          </Section>
        ) : null}

        {/* Tags */}
        {gig.tags.length > 0 && (
          <Section head="Tags" colors={colors}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              {gig.tags.map((tag, i) => (
                <View key={i} style={[st.tagChip, { backgroundColor: accent + "12" }]}>
                  <Text style={[st.tagText, { color: accent }]}>{tag}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Requirements */}
        {gig.requirements ? (
          <Section head="What the seller needs from you" colors={colors}>
            <Text style={[st.body, { color: colors.text }]}>{gig.requirements}</Text>
          </Section>
        ) : null}

        {/* Reviews */}
        <Section head={`Reviews (${reviews.length})`} colors={colors}>
          {reviews.length === 0 ? (
            <Text style={[st.body, { color: colors.textMuted }]}>No reviews yet.</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={[st.reviewRow, { borderTopColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Stars n={r.rating} />
                  <Text style={[st.reviewHandle, { color: colors.text }]}>
                    @{r.reviewer_handle}
                  </Text>
                  <Text style={[st.statSub, { color: colors.textMuted }]}>
                    {timeAgo(r.created_at)}
                  </Text>
                </View>
                {r.comment ? (
                  <Text style={[st.body, { color: colors.textSecondary }]}>{r.comment}</Text>
                ) : null}
              </View>
            ))
          )}
        </Section>
      </ScrollView>

      {/* Order bar — hidden for own listings */}
      {!own && (
        <View
          style={[
            st.actionBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <View>
            <Text style={[st.actionPrice, { color: accent }]}>
              {gig.price.toLocaleString()} ACoin
            </Text>
            <Text style={[st.statSub, { color: colors.textMuted }]}>
              {gig.delivery_days}-day delivery
            </Text>
          </View>
          <Pressable
            style={[st.orderBtn, { backgroundColor: accent, opacity: placing ? 0.65 : 1 }]}
            onPress={placeOrder}
            disabled={placing}
          >
            {placing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="flash" size={16} color="#fff" />
                <Text style={st.orderBtnText}>Order Now</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SafeHeader({
  title,
  onBack,
  onShare,
  colors,
  insets,
}: {
  title: string;
  onBack: () => void;
  onShare?: () => void;
  colors: any;
  insets: any;
}) {
  return (
    <View
      style={[
        st.header,
        {
          paddingTop: insets.top + 6,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <TouchableOpacity onPress={onBack} style={st.headerBtn} hitSlop={10}>
        <Ionicons
          name="arrow-back"
          size={26}
          color={colors.accent ?? Colors.brand}
        />
      </TouchableOpacity>

      <Text style={[st.headerTitle, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>

      {onShare ? (
        <TouchableOpacity onPress={onShare} style={st.headerBtn} hitSlop={10}>
          <Ionicons name="share" size={22} color={colors.accent ?? Colors.brand} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  );
}

function Section({
  head,
  children,
  colors,
}: {
  head: string;
  children: React.ReactNode;
  colors: any;
}) {
  return (
    <View style={[st.section, { backgroundColor: colors.surface }]}>
      <Text style={[st.sectionHead, { color: colors.textSecondary }]}>{head}</Text>
      {children}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:        { flex: 1 },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  header:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingBottom: 10 },
  headerBtn:   { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center", letterSpacing: -0.2 },

  heroCard:    { margin: 14, borderRadius: 18, padding: 20, alignItems: "center", gap: 10 },
  heroEmoji:   { width: 88, height: 88, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  heroTitle:   { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  catChip:     { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  catChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statsRow:    { flexDirection: "row", gap: 24, marginTop: 4 },
  statItem:    { alignItems: "center", gap: 2 },
  statVal:     { fontSize: 15, fontFamily: "Inter_700Bold" },
  statSub:     { fontSize: 11, fontFamily: "Inter_400Regular" },

  section:     { marginHorizontal: 14, marginBottom: 10, borderRadius: 14, padding: 16, gap: 8 },
  sectionHead: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  body:        { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },

  sellerRow:       { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar:          { width: 44, height: 44, borderRadius: 22 },
  avatarFallback:  { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sellerName:      { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sellerHandle:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  tagChip:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tagText:   { fontSize: 12, fontFamily: "Inter_500Medium" },

  reviewRow:    { paddingTop: 10, marginTop: 6 },
  reviewHandle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  actionBar:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12 },
  actionPrice: { fontSize: 20, fontFamily: "Inter_700Bold" },
  orderBtn:    { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  orderBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },

  notFoundTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  notFoundSub:   { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  browseBtn:     { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  browseBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
