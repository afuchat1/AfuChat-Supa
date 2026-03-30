import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { MarketplaceCardSkeleton } from "@/components/ui/Skeleton";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";

type MarketplaceListing = {
  id: string;
  seller_id: string;
  user_gift_id: string;
  gift_id: string;
  asking_price: number;
  status: string;
  listed_at: string;
  seller_name: string;
  seller_avatar: string | null;
  seller_is_verified: boolean;
  seller_is_organization_verified: boolean;
  gift: {
    id: string;
    name: string;
    emoji: string;
    rarity: string;
    image_url: string | null;
    base_xp_cost: number;
    description: string | null;
  };
};

const rarityColors: Record<string, string> = {
  rare: "#007AFF",
  epic: "#AF52DE",
  legendary: "#FF9500",
};

const rarityBgColors: Record<string, string> = {
  rare: "rgba(0,122,255,0.08)",
  epic: "rgba(175,82,222,0.08)",
  legendary: "rgba(255,149,0,0.08)",
};

const MARKETPLACE_FEE_PERCENT = 5;

function GiftImage({ uri, emoji, size }: { uri: string | null; emoji: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return <Text style={{ fontSize: size * 0.6 }}>{emoji}</Text>;
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size }}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

export default function GiftMarketplaceScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [buying, setBuying] = useState(false);
  const [filterRarity, setFilterRarity] = useState<string>("all");

  const loadListings = useCallback(async () => {
    let query = supabase
      .from("gift_marketplace")
      .select("id, seller_id, user_gift_id, gift_id, asking_price, status, listed_at, gifts(id, name, emoji, rarity, image_url, base_xp_cost, description)")
      .eq("status", "listed")
      .order("listed_at", { ascending: false });

    if (filterRarity !== "all") {
      query = query.eq("gifts.rarity", filterRarity);
    }

    const { data } = await query;

    if (data) {
      const sellerIds = [...new Set(data.map((l: any) => l.seller_id))];
      let sellerMap: Record<string, { name: string; avatar: string | null; is_verified: boolean; is_organization_verified: boolean }> = {};

      if (sellerIds.length > 0) {
        const { data: sellers } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, is_verified, is_organization_verified")
          .in("id", sellerIds);

        if (sellers) {
          sellers.forEach((s: any) => {
            sellerMap[s.id] = { name: s.display_name || "Anonymous", avatar: s.avatar_url, is_verified: !!s.is_verified, is_organization_verified: !!s.is_organization_verified };
          });
        }
      }

      const mapped = data
        .filter((l: any) => l.gifts)
        .map((l: any) => ({
          ...l,
          gift: l.gifts,
          seller_name: sellerMap[l.seller_id]?.name || "Anonymous",
          seller_avatar: sellerMap[l.seller_id]?.avatar || null,
          seller_is_verified: sellerMap[l.seller_id]?.is_verified || false,
          seller_is_organization_verified: sellerMap[l.seller_id]?.is_organization_verified || false,
        }));

      if (filterRarity !== "all") {
        setListings(mapped.filter((l: MarketplaceListing) => l.gift.rarity === filterRarity));
      } else {
        setListings(mapped);
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, [filterRarity]);

  useEffect(() => { loadListings(); }, [loadListings]);

  async function handleBuy() {
    if (!selectedListing || !user || !profile) return;
    if (selectedListing.seller_id === user.id) {
      showAlert("Oops", "You can't buy your own listing.");
      return;
    }

    const totalCost = selectedListing.asking_price;
    if ((profile.acoin || 0) < totalCost) {
      showAlert("Insufficient ACoin", `You need ${totalCost} ACoin but only have ${profile.acoin || 0}.`);
      return;
    }

    setBuying(true);

    try {
      const { data: claimed, error: claimErr } = await supabase
        .from("gift_marketplace")
        .update({ status: "sold", buyer_id: user.id, sold_at: new Date().toISOString() })
        .eq("id", selectedListing.id)
        .eq("status", "listed")
        .select("id, seller_id, user_gift_id");

      if (claimErr || !claimed || claimed.length === 0) {
        showAlert("Unavailable", "This gift has already been sold or removed.");
        setBuying(false);
        setSelectedListing(null);
        loadListings();
        return;
      }

      const listing = claimed[0];

      const { data: freshBuyer } = await supabase.from("profiles").select("acoin").eq("id", user.id).single();
      if (!freshBuyer || (freshBuyer.acoin || 0) < totalCost) {
        await supabase.from("gift_marketplace").update({ status: "listed", buyer_id: null, sold_at: null }).eq("id", selectedListing.id);
        showAlert("Insufficient ACoin", "Your balance has changed. Listing restored.");
        setBuying(false);
        return;
      }

      const fee = Math.ceil(totalCost * (MARKETPLACE_FEE_PERCENT / 100));
      const sellerReceives = totalCost - fee;

      const { error: buyerErr } = await supabase
        .from("profiles")
        .update({ acoin: (freshBuyer.acoin || 0) - totalCost })
        .eq("id", user.id);

      if (buyerErr) {
        await supabase.from("gift_marketplace").update({ status: "listed", buyer_id: null, sold_at: null }).eq("id", selectedListing.id);
        showAlert("Error", "Could not deduct ACoin. Listing restored.");
        setBuying(false);
        return;
      }

      const { data: sellerProfile } = await supabase.from("profiles").select("acoin").eq("id", listing.seller_id).single();
      const { error: sellerErr } = await supabase
        .from("profiles")
        .update({ acoin: (sellerProfile?.acoin || 0) + sellerReceives })
        .eq("id", listing.seller_id);

      if (sellerErr) {
        await supabase.from("profiles").update({ acoin: (freshBuyer.acoin || 0) }).eq("id", user.id);
        await supabase.from("gift_marketplace").update({ status: "listed", buyer_id: null, sold_at: null }).eq("id", selectedListing.id);
        showAlert("Error", "Could not credit seller. Transaction reversed.");
        setBuying(false);
        return;
      }

      const { data: transferred, error: transferErr } = await supabase
        .from("user_gifts")
        .update({ user_id: user.id })
        .eq("id", listing.user_gift_id)
        .eq("user_id", listing.seller_id)
        .select("id");

      if (transferErr || !transferred || transferred.length === 0) {
        await supabase.from("profiles").update({ acoin: (freshBuyer.acoin || 0) }).eq("id", user.id);
        await supabase.from("profiles").update({ acoin: (sellerProfile?.acoin || 0) }).eq("id", listing.seller_id);
        await supabase.from("gift_marketplace").update({ status: "listed", buyer_id: null, sold_at: null }).eq("id", selectedListing.id);
        showAlert("Error", "Gift transfer failed. Transaction reversed.");
        setBuying(false);
        return;
      }

      await supabase.from("acoin_transactions").insert([
        {
          user_id: user.id,
          amount: -totalCost,
          transaction_type: "marketplace_purchase",
          metadata: { gift_name: selectedListing.gift.name, listing_id: selectedListing.id, seller_id: listing.seller_id },
        },
        {
          user_id: listing.seller_id,
          amount: sellerReceives,
          transaction_type: "marketplace_sale",
          metadata: { gift_name: selectedListing.gift.name, listing_id: selectedListing.id, buyer_id: user.id, fee },
        },
      ]);

      const giftId = selectedListing.gift.id;
      const salePrice = totalCost;
      const { data: currentStats } = await supabase
        .from("gift_statistics")
        .select("price_multiplier, total_sent, last_sale_price")
        .eq("gift_id", giftId)
        .maybeSingle();

      const newLastSale = salePrice;
      await supabase
        .from("gift_statistics")
        .upsert({
          gift_id: giftId,
          price_multiplier: currentStats?.price_multiplier ?? 1,
          total_sent: currentStats?.total_sent ?? 0,
          last_sale_price: newLastSale,
          last_updated: new Date().toISOString(),
        }, { onConflict: "gift_id" });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Purchased!", `You now own ${selectedListing.gift.emoji} ${selectedListing.gift.name}`);
      setSelectedListing(null);
      refreshProfile();
      loadListings();
    } catch {
      showAlert("Error", "Something went wrong. Please try again.");
    }
    setBuying(false);
  }

  function renderListing({ item }: { item: MarketplaceListing }) {
    const rBg = rarityBgColors[item.gift.rarity] || "rgba(0,0,0,0.05)";
    const rColor = rarityColors[item.gift.rarity] || "#888";
    const isOwn = item.seller_id === user?.id;
    const base = item.gift.base_xp_cost;
    const asking = item.asking_price;
    const pct = base > 0 ? Math.round(((asking - base) / base) * 100) : 0;

    return (
      <TouchableOpacity
        style={[styles.listingCard, { backgroundColor: colors.surface }]}
        onPress={() => setSelectedListing(item)}
        activeOpacity={0.7}
      >
        {isOwn && (
          <View style={styles.ownBadge}>
            <Text style={styles.ownBadgeText}>YOURS</Text>
          </View>
        )}
        <View style={[styles.listingImageWrap, { backgroundColor: rBg }]}>
          <GiftImage uri={item.gift.image_url} emoji={item.gift.emoji} size={64} />
        </View>
        <Text style={[styles.listingName, { color: colors.text }]} numberOfLines={1}>{item.gift.name}</Text>
        <View style={[styles.rarityBadge, { backgroundColor: rBg }]}>
          <View style={[styles.rarityDot, { backgroundColor: rColor }]} />
          <Text style={[styles.rarityText, { color: rColor }]}>{item.gift.rarity}</Text>
        </View>
        <View style={styles.priceRow}>
          <Ionicons name="diamond" size={14} color={Colors.gold} />
          <Text style={styles.priceText}>{asking}</Text>
        </View>
        {pct !== 0 && (
          <View style={[styles.pctBadge, { backgroundColor: pct > 0 ? "#10B98118" : "#EF444418" }]}>
            <Ionicons name={pct > 0 ? "trending-up" : "trending-down"} size={10} color={pct > 0 ? "#10B981" : "#EF4444"} />
            <Text style={[styles.pctText, { color: pct > 0 ? "#10B981" : "#EF4444" }]}>
              {pct > 0 ? "+" : ""}{pct}%
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2, justifyContent: "center" }}>
          <Text style={[styles.sellerText, { color: colors.textMuted }]} numberOfLines={1}>by {item.seller_name}</Text>
          <VerifiedBadge isVerified={item.seller_is_verified} isOrganizationVerified={item.seller_is_organization_verified} size={12} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Gift Marketplace</Text>
        <TouchableOpacity onPress={() => router.push("/wallet")}>
          <View style={styles.acoinBadge}>
            <Ionicons name="diamond" size={14} color="#fff" />
            <Text style={styles.acoinText}>{profile?.acoin || 0}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.infoBanner, { backgroundColor: "rgba(255,149,0,0.08)" }]}>
        <Ionicons name="sparkles" size={16} color="#FF9500" />
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Only <Text style={{ fontFamily: "Inter_600SemiBold" }}>Rare</Text>, <Text style={{ fontFamily: "Inter_600SemiBold" }}>Epic</Text> & <Text style={{ fontFamily: "Inter_600SemiBold" }}>Legendary</Text> gifts can be traded here
        </Text>
      </View>

      <View style={styles.filterRow}>
        {["all", "rare", "epic", "legendary"].map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.filterChip, filterRarity === r && { backgroundColor: rarityColors[r] || Colors.brand }]}
            onPress={() => { setFilterRarity(r); setLoading(true); }}
          >
            <Text style={[styles.filterText, filterRarity === r && { color: "#fff" }]}>
              {r === "all" ? "All" : r.charAt(0).toUpperCase() + r.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
            {[1,2,3,4,5,6].map(i => <MarketplaceCardSkeleton key={i} />)}
          </View>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={renderListing}
          contentContainerStyle={{ padding: 8, paddingBottom: insets.bottom + 20 }}
          columnWrapperStyle={{ gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadListings(); }} tintColor={Colors.brand} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconWrap, { backgroundColor: "rgba(255,149,0,0.1)" }]}>
                <Ionicons name="storefront-outline" size={48} color="#FF9500" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No listings yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Rare, Epic & Legendary gifts listed for sale will appear here
              </Text>
            </View>
          }
        />
      )}

      <SwipeableBottomSheet visible={!!selectedListing} onClose={() => setSelectedListing(null)} backgroundColor={colors.surface}>
          <View style={[styles.modalContent]}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedListing(null)}>
              <Ionicons name="close-circle" size={28} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.modalGiftDisplay}>
              <View style={[styles.modalImageWrap, { backgroundColor: rarityBgColors[selectedListing?.gift.rarity || "rare"] }]}>
                <GiftImage uri={selectedListing?.gift.image_url || null} emoji={selectedListing?.gift.emoji || "🎁"} size={80} />
              </View>
              <Text style={[styles.modalGiftName, { color: colors.text }]}>{selectedListing?.gift.name}</Text>
              <View style={[styles.rarityBadgeLg, { backgroundColor: rarityBgColors[selectedListing?.gift.rarity || "rare"] }]}>
                <View style={[styles.rarityDot, { backgroundColor: rarityColors[selectedListing?.gift.rarity || "rare"] }]} />
                <Text style={[styles.rarityTextLg, { color: rarityColors[selectedListing?.gift.rarity || "rare"] }]}>{selectedListing?.gift.rarity}</Text>
              </View>
            </View>

            {selectedListing?.gift.description && (
              <Text style={[styles.giftDesc, { color: colors.textSecondary }]}>{selectedListing.gift.description}</Text>
            )}

            <View style={[styles.sellerInfoRow, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="person-circle-outline" size={18} color={colors.textMuted} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
                <Text style={[styles.sellerInfoText, { color: colors.textSecondary }]}>Listed by </Text>
                <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>{selectedListing?.seller_name}</Text>
                {selectedListing && <VerifiedBadge isVerified={selectedListing.seller_is_verified} isOrganizationVerified={selectedListing.seller_is_organization_verified} size={14} />}
              </View>
              <Text style={[styles.listedDate, { color: colors.textMuted }]}>
                {selectedListing ? new Date(selectedListing.listed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
              </Text>
            </View>

            {(() => {
              const base2 = selectedListing?.gift.base_xp_cost ?? 0;
              const asking2 = selectedListing?.asking_price ?? 0;
              const pct2 = base2 > 0 ? Math.round(((asking2 - base2) / base2) * 100) : 0;
              return (
                <View style={[styles.priceCard, { backgroundColor: colors.inputBg }]}>
                  <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Asking Price</Text>
                  <View style={styles.priceValueRow}>
                    <Ionicons name="diamond" size={22} color={Colors.gold} />
                    <Text style={[styles.priceValueText, { color: colors.text }]}>{asking2}</Text>
                    <Text style={[styles.priceCurrency, { color: colors.textMuted }]}>AC</Text>
                    {pct2 !== 0 && (
                      <View style={[styles.pctBadge, { backgroundColor: pct2 > 0 ? "#10B98118" : "#EF444418", marginLeft: 6 }]}>
                        <Ionicons name={pct2 > 0 ? "trending-up" : "trending-down"} size={12} color={pct2 > 0 ? "#10B981" : "#EF4444"} />
                        <Text style={[styles.pctText, { color: pct2 > 0 ? "#10B981" : "#EF4444", fontSize: 12 }]}>
                          {pct2 > 0 ? "+" : ""}{pct2}%
                        </Text>
                      </View>
                    )}
                  </View>
                  {base2 > 0 && (
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 2 }}>
                      Base value: {base2} AC
                    </Text>
                  )}
                </View>
              );
            })()}

            {selectedListing?.seller_id === user?.id ? (
              <TouchableOpacity
                style={[styles.cancelListingBtn, { borderColor: "#FF3B30" }]}
                onPress={async () => {
                  const { data: cancelled } = await supabase
                    .from("gift_marketplace")
                    .update({ status: "cancelled" })
                    .eq("id", selectedListing.id)
                    .eq("status", "listed")
                    .select("id");
                  if (!cancelled || cancelled.length === 0) {
                    showAlert("Error", "This listing has already been sold or removed.");
                  } else {
                    Haptics.selectionAsync();
                    showAlert("Cancelled", "Listing removed from marketplace.");
                  }
                  setSelectedListing(null);
                  loadListings();
                }}
              >
                <Ionicons name="close" size={18} color="#FF3B30" />
                <Text style={[styles.cancelListingText, { color: "#FF3B30" }]}>Cancel Listing</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.buyBtn, buying && { opacity: 0.6 }]}
                onPress={handleBuy}
                disabled={buying}
              >
                {buying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cart" size={18} color="#fff" />
                    <Text style={styles.buyBtnText}>Buy for {selectedListing?.asking_price} ACoin</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
      </SwipeableBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  acoinBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.gold, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  acoinText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  infoBanner: { flexDirection: "row", alignItems: "center", gap: 8, margin: 16, marginBottom: 0, padding: 12, borderRadius: 12 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: "rgba(128,128,128,0.1)" },
  filterText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#888" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  listingCard: { flex: 1, margin: 4, borderRadius: 16, padding: 14, alignItems: "center", gap: 6, minWidth: "45%", maxWidth: "50%" },
  listingImageWrap: { width: 80, height: 80, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  listingImage: { width: 64, height: 64 },
  listingEmoji: { fontSize: 40 },
  listingName: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  rarityBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rarityDot: { width: 6, height: 6, borderRadius: 3 },
  rarityText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" as any },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  priceText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.gold },
  pctBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  pctText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  sellerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  ownBadge: { position: "absolute", top: 8, left: 8, backgroundColor: Colors.brand, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, zIndex: 1 },
  ownBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
  emptyWrap: { alignItems: "center", paddingTop: 80, gap: 12, paddingHorizontal: 40 },
  emptyIconWrap: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { padding: 24, gap: 16 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center" },
  modalClose: { position: "absolute", top: 16, right: 16, zIndex: 1 },
  modalGiftDisplay: { alignItems: "center", gap: 8, paddingTop: 8 },
  modalImageWrap: { width: 100, height: 100, borderRadius: 24, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  modalGiftImage: { width: 80, height: 80 },
  modalEmoji: { fontSize: 48 },
  modalGiftName: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  rarityBadgeLg: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  rarityTextLg: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" as any },
  giftDesc: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },
  sellerInfoRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  sellerInfoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  listedDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  priceCard: { borderRadius: 14, padding: 16, alignItems: "center", gap: 6 },
  priceLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  priceValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  priceValueText: { fontSize: 28, fontFamily: "Inter_700Bold" },
  priceCurrency: { fontSize: 16, fontFamily: "Inter_500Medium" },
  buyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.gold, borderRadius: 14, paddingVertical: 14 },
  buyBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cancelListingBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14 },
  cancelListingText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
