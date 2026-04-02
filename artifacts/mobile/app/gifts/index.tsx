import React, { useCallback, useEffect, useState } from "react";
import {
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
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { notifyGiftReceived } from "@/lib/notifyUser";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useGiftPrices } from "@/hooks/useGiftPrices";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { GiftCardSkeleton } from "@/components/ui/Skeleton";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";

type Gift = {
  id: string;
  name: string;
  emoji: string;
  base_xp_cost: number;
  acoin_price?: number;
  rarity: string;
  description: string | null;
  image_url: string | null;
};

type OwnedGift = {
  id: string;
  gift_id: string;
  gift: Gift;
  is_pinned: boolean;
  acquired_at: string;
  transaction_id: string | null;
  sender_name?: string;
};

const HIDDEN_FEE_PERCENT = 5.99;
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

const rarityColors: Record<string, string> = {
  common: "#8E8E93",
  uncommon: Colors.brand,
  rare: "#007AFF",
  epic: "#AF52DE",
  legendary: "#FF9500",
};

const rarityBgColors: Record<string, string> = {
  common: "rgba(142,142,147,0.08)",
  uncommon: "rgba(0,194,203,0.08)",
  rare: "rgba(0,122,255,0.08)",
  epic: "rgba(175,82,222,0.08)",
  legendary: "rgba(255,149,0,0.08)",
};

export default function GiftsScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { statsMap, getDynamicPrice, refreshStats } = useGiftPrices();
  const params = useLocalSearchParams<{ userId?: string; userName?: string }>();
  const viewUserId = params.userId || user?.id;
  const viewUserName = params.userName;
  const isOwnProfile = !params.userId || params.userId === user?.id;
  const [owned, setOwned] = useState<OwnedGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGift, setSelectedGift] = useState<OwnedGift | null>(null);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [converting, setConverting] = useState(false);
  const [sendGift, setSendGift] = useState<OwnedGift | null>(null);
  const [sendHandle, setSendHandle] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [listPrice, setListPrice] = useState("");
  const [showListModal, setShowListModal] = useState(false);
  const [listing, setListing] = useState(false);

  const loadOwned = useCallback(async () => {
    if (!viewUserId) return;
    const [{ data }, { data: listedData }] = await Promise.all([
      supabase
        .from("user_gifts")
        .select("id, gift_id, is_pinned, acquired_at, transaction_id, gifts(id, name, emoji, base_xp_cost, rarity, description, image_url)")
        .eq("user_id", viewUserId)
        .order("acquired_at", { ascending: false }),
      isOwnProfile
        ? supabase.from("gift_marketplace").select("user_gift_id").eq("seller_id", viewUserId).eq("status", "listed")
        : Promise.resolve({ data: [] }),
    ]);

    const listedGiftIds = new Set((listedData || []).map((l: any) => l.user_gift_id));

    if (data) {
      const available = data.filter((g: any) => !listedGiftIds.has(g.id));

      const txIds = available.map((g: any) => g.transaction_id).filter(Boolean);
      let senderMap: Record<string, string> = {};

      if (txIds.length > 0) {
        const { data: txData } = await supabase
          .from("gift_transactions")
          .select("id, sender_id, profiles!gift_transactions_sender_id_fkey(display_name)")
          .in("id", txIds);

        if (txData) {
          txData.forEach((tx: any) => {
            senderMap[tx.id] = tx.profiles?.display_name || "Someone";
          });
        }
      }

      setOwned(available.map((g: any) => ({
        ...g,
        gift: { ...g.gifts },
        sender_name: g.transaction_id ? senderMap[g.transaction_id] : undefined,
      })));
    }
    setLoading(false);
    setRefreshing(false);
  }, [viewUserId, isOwnProfile]);

  useEffect(() => { loadOwned(); }, [loadOwned]);

  function getConvertValue(gift: Gift): number {
    const baseValue = getDynamicPrice(gift.id, gift.base_xp_cost);
    const fee = baseValue * (HIDDEN_FEE_PERCENT / 100);
    return Math.floor(baseValue - fee);
  }

  async function handleConvertToAcoin() {
    if (!selectedGift || !user || !profile) return;
    setConverting(true);

    const acoinAmount = getConvertValue(selectedGift.gift);
    if (acoinAmount <= 0) {
      showAlert("Too Low", "This gift's value is too low to convert.");
      setConverting(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("convert_gift_to_acoin", {
        p_user_gift_id: selectedGift.id,
        p_acoin_amount: acoinAmount,
      });

      if (error) {
        showAlert("Error", "Something went wrong. Please try again.");
        setConverting(false);
        return;
      }

      if (!data?.success) {
        showAlert("Error", data?.message || "Could not convert gift.");
        setConverting(false);
        setSelectedGift(null);
        setConfirmConvert(false);
        loadOwned();
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Converted!", `${selectedGift.gift.emoji} ${selectedGift.gift.name} converted to ${acoinAmount} ACoin`);
      setSelectedGift(null);
      setConfirmConvert(false);
      refreshProfile();
      loadOwned();
    } catch {
      showAlert("Error", "Something went wrong. Please try again.");
    }
    setConverting(false);
  }

  async function handleSendGift() {
    if (!sendGift || !sendHandle.trim() || !user || !profile) return;
    setSending(true);

    try {
      const { data: activeListing } = await supabase
        .from("gift_marketplace")
        .select("id")
        .eq("user_gift_id", sendGift.id)
        .eq("status", "listed")
        .maybeSingle();

      if (activeListing) {
        showAlert("Listed", "This gift is listed on the marketplace. Cancel the listing first.");
        setSending(false);
        return;
      }

      const { data: recipient } = await supabase.from("profiles").select("id, display_name").eq("handle", sendHandle.trim().toLowerCase()).single();
      if (!recipient) { showAlert("Not found", "User not found."); setSending(false); return; }
      if (recipient.id === user.id) { showAlert("Oops", "You can't send a gift to yourself."); setSending(false); return; }

      const { data: removed, error: deleteErr } = await supabase
        .from("user_gifts")
        .delete()
        .eq("id", sendGift.id)
        .eq("user_id", user.id)
        .select("id");

      if (deleteErr || !removed || removed.length === 0) {
        showAlert("Error", "Gift not found or already transferred.");
        setSending(false);
        setSendGift(null);
        loadOwned();
        return;
      }

      await supabase.from("user_gifts").insert({
        user_id: recipient.id,
        gift_id: sendGift.gift.id,
        is_pinned: false,
      });

      await supabase.from("gift_transactions").insert({
        gift_id: sendGift.gift.id,
        sender_id: user.id,
        receiver_id: recipient.id,
        xp_cost: 0,
        message: sendMsg.trim() || null,
      });

      notifyGiftReceived({
        recipientId: recipient.id,
        senderName: profile?.display_name || "Someone",
        senderUserId: user.id,
        giftName: `${sendGift.gift.emoji} ${sendGift.gift.name}`,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Gift Sent!", `${sendGift.gift.emoji} ${sendGift.gift.name} sent to ${recipient.display_name}`);
      setSendGift(null);
      setSendHandle("");
      setSendMsg("");
      loadOwned();
    } catch {
      showAlert("Error", "Something went wrong. Please try again.");
    }
    setSending(false);
  }

  async function togglePin(giftItem: OwnedGift) {
    await supabase.from("user_gifts").update({ is_pinned: !giftItem.is_pinned }).eq("id", giftItem.id);
    Haptics.selectionAsync();
    loadOwned();
  }

  function isRareOrAbove(rarity: string): boolean {
    return ["rare", "epic", "legendary"].includes(rarity);
  }

  async function handleListOnMarketplace() {
    if (!selectedGift || !user || !listPrice.trim()) return;
    const price = parseInt(listPrice);
    if (isNaN(price) || price <= 0) {
      showAlert("Invalid", "Enter a valid price in ACoin.");
      return;
    }
    setListing(true);
    try {
      const { data: existing } = await supabase
        .from("gift_marketplace")
        .select("id")
        .eq("user_gift_id", selectedGift.id)
        .eq("status", "listed")
        .maybeSingle();

      if (existing) {
        showAlert("Already Listed", "This gift is already on the marketplace.");
        setListing(false);
        return;
      }

      const { error } = await supabase.from("gift_marketplace").insert({
        seller_id: user.id,
        user_gift_id: selectedGift.id,
        gift_id: selectedGift.gift.id,
        asking_price: price,
      });
      if (error) {
        showAlert("Error", error.message);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert("Listed!", `${selectedGift.gift.emoji} ${selectedGift.gift.name} is now on the marketplace for ${price} ACoin.`);
        setSelectedGift(null);
        setShowListModal(false);
        setListPrice("");
        loadOwned();
      }
    } catch {
      showAlert("Error", "Something went wrong.");
    }
    setListing(false);
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function renderGiftCard({ item }: { item: OwnedGift }) {
    const rBg = rarityBgColors[item.gift.rarity] || rarityBgColors.common;
    const rColor = rarityColors[item.gift.rarity] || rarityColors.common;
    const livePrice = getDynamicPrice(item.gift.id, item.gift.base_xp_cost);

    return (
      <TouchableOpacity
        style={[styles.giftCard, { backgroundColor: colors.surface }]}
        onPress={() => setSelectedGift(item)}
        onLongPress={isOwnProfile ? () => togglePin(item) : undefined}
        activeOpacity={0.7}
      >
        {item.is_pinned && (
          <View style={styles.pinBadge}>
            <Ionicons name="pin" size={10} color="#fff" />
          </View>
        )}
        <View style={[styles.giftImageWrap, { backgroundColor: rBg }]}>
          <GiftImage uri={item.gift.image_url} emoji={item.gift.emoji} size={64} />
        </View>
        <Text style={[styles.giftName, { color: colors.text }]} numberOfLines={1}>{item.gift.name}</Text>
        <View style={[styles.rarityBadge, { backgroundColor: rBg }]}>
          <View style={[styles.rarityDot, { backgroundColor: rColor }]} />
          <Text style={[styles.rarityText, { color: rColor }]}>{item.gift.rarity}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
          <Ionicons name="diamond" size={10} color={Colors.gold} />
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.gold }}>{livePrice}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{isOwnProfile ? "My Gifts" : `${viewUserName || "User"}'s Gifts`}</Text>
        {isOwnProfile ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => router.push("/gifts/marketplace")} style={styles.marketplaceBtn}>
              <Ionicons name="storefront" size={14} color="#FF9500" />
              <Text style={styles.marketplaceBtnText}>Market</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/wallet")}>
              <View style={styles.acoinBadge}>
                <Ionicons name="diamond" size={14} color="#fff" />
                <Text style={styles.acoinText}>{profile?.acoin || 0}</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>{owned.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total Gifts</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.gold }]}>{owned.filter(g => ["rare", "epic", "legendary"].includes(g.gift.rarity)).length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Rare+</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>{owned.filter(g => g.is_pinned).length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Pinned</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.skeletonGrid}>
          {[1, 2, 3, 4, 5, 6].map((i) => <GiftCardSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={owned}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={renderGiftCard}
          extraData={statsMap}
          contentContainerStyle={{ padding: 8, paddingBottom: insets.bottom + 20 }}
          columnWrapperStyle={{ gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refreshStats(); loadOwned(); }} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIconWrap, { backgroundColor: "rgba(212,168,83,0.1)" }]}>
                <Ionicons name="gift-outline" size={48} color={Colors.gold} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No gifts yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Receive gifts from friends or earn them through activities
              </Text>
            </View>
          }
        />
      )}

      <SwipeableBottomSheet visible={!!selectedGift && !confirmConvert} onClose={() => setSelectedGift(null)} backgroundColor={colors.surface}>
          <View style={[styles.modalContent]}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedGift(null)}>
              <Ionicons name="close-circle" size={28} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.modalGiftDisplay}>
              <View style={[styles.modalImageWrap, { backgroundColor: rarityBgColors[selectedGift?.gift.rarity || "common"] }]}>
                <GiftImage uri={selectedGift?.gift.image_url || null} emoji={selectedGift?.gift.emoji || "🎁"} size={80} />
              </View>
              <Text style={[styles.modalGiftName, { color: colors.text }]}>{selectedGift?.gift.name}</Text>
              <View style={[styles.rarityBadgeLg, { backgroundColor: rarityBgColors[selectedGift?.gift.rarity || "common"] }]}>
                <View style={[styles.rarityDot, { backgroundColor: rarityColors[selectedGift?.gift.rarity || "common"] }]} />
                <Text style={[styles.rarityTextLg, { color: rarityColors[selectedGift?.gift.rarity || "common"] }]}>{selectedGift?.gift.rarity}</Text>
              </View>
            </View>

            {(() => {
              const base = selectedGift?.gift.base_xp_cost ?? 0;
              const current = selectedGift ? getDynamicPrice(selectedGift.gift.id, base) : 0;
              const diff = current - base;
              const pct = base > 0 ? Math.round((diff / base) * 100) : 0;
              const stat = selectedGift ? statsMap[selectedGift.gift.id] : null;
              const lastSale = stat?.lastSalePrice ?? null;
              const isMarketDriven = ["rare","epic","legendary"].includes(selectedGift?.gift.rarity ?? "");
              return (
                <View style={{ marginTop: 6, gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="diamond" size={15} color={Colors.gold} />
                      <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.gold }}>{current}</Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.textMuted }}>AC</Text>
                    </View>
                    {pct !== 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: pct > 0 ? "#10B98118" : "#EF444418", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                        <Ionicons name={pct > 0 ? "trending-up" : "trending-down"} size={13} color={pct > 0 ? "#10B981" : "#EF4444"} />
                        <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: pct > 0 ? "#10B981" : "#EF4444" }}>
                          {pct > 0 ? "+" : ""}{pct}% from base
                        </Text>
                      </View>
                    )}
                  </View>
                  {base !== current && (
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center" }}>
                      Base price: {base} AC · Current: {current} AC
                    </Text>
                  )}
                  {isMarketDriven && lastSale != null && lastSale > 0 && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "center" }}>
                      <Ionicons name="storefront-outline" size={12} color={colors.textMuted} />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
                        Last sold: <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>{lastSale} AC</Text>
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {selectedGift?.gift.description && (
              <Text style={[styles.giftDesc, { color: colors.textSecondary }]}>{selectedGift.gift.description}</Text>
            )}

            {selectedGift?.sender_name && (
              <View style={[styles.senderRow, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.senderText, { color: colors.textSecondary }]}>From <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>{selectedGift.sender_name}</Text></Text>
                <Text style={[styles.dateText, { color: colors.textMuted }]}>{selectedGift ? formatDate(selectedGift.acquired_at) : ""}</Text>
              </View>
            )}

            {isOwnProfile && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.convertBtn}
                  onPress={() => setConfirmConvert(true)}
                >
                  <Ionicons name="swap-horizontal" size={18} color="#fff" />
                  <Text style={styles.convertBtnText}>Convert to ACoin</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sendGiftBtn, { borderColor: colors.accent }]}
                  onPress={() => { setSendGift(selectedGift); setSelectedGift(null); }}
                >
                  <Ionicons name="send" size={16} color={colors.accent} />
                  <Text style={[styles.sendGiftBtnText, { color: colors.accent }]}>Send</Text>
                </TouchableOpacity>
              </View>
            )}

            {isOwnProfile && selectedGift && isRareOrAbove(selectedGift.gift.rarity) && (
              <TouchableOpacity
                style={styles.sellRow}
                onPress={() => { setShowListModal(true); setListPrice(String(getDynamicPrice(selectedGift.gift.id, selectedGift.gift.base_xp_cost))); }}
              >
                <Ionicons name="storefront-outline" size={16} color="#FF9500" />
                <Text style={[styles.sellLink, { color: "#FF9500" }]}>Sell on Marketplace</Text>
              </TouchableOpacity>
            )}

            {isOwnProfile && (
              <TouchableOpacity style={styles.pinRow} onPress={() => { if (selectedGift) togglePin(selectedGift); setSelectedGift(null); }}>
                <Ionicons name={selectedGift?.is_pinned ? "pin" : "pin-outline"} size={16} color={colors.textSecondary} />
                <Text style={[styles.pinLink, { color: colors.textSecondary }]}>
                  {selectedGift?.is_pinned ? "Unpin from profile" : "Pin to profile"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
      </SwipeableBottomSheet>

      <Modal visible={confirmConvert} animationType="fade" transparent>
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmBox, { backgroundColor: colors.surface }]}>
            <View style={[styles.confirmIconWrap, { backgroundColor: "rgba(212,168,83,0.1)" }]}>
              <Ionicons name="swap-horizontal" size={32} color={Colors.gold} />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>Convert Gift?</Text>
            <Text style={[styles.confirmDesc, { color: colors.textSecondary }]}>
              You will receive <Text style={{ fontFamily: "Inter_700Bold", color: Colors.gold }}>{selectedGift ? getConvertValue(selectedGift.gift) : 0} ACoin</Text> and the gift <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>{selectedGift?.gift.emoji} {selectedGift?.gift.name}</Text> will be removed from your collection.
            </Text>
            <Text style={[styles.confirmWarn, { color: colors.textMuted }]}>This action cannot be undone.</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={[styles.confirmCancel, { backgroundColor: colors.inputBg }]}
                onPress={() => setConfirmConvert(false)}
                disabled={converting}
              >
                <Text style={[styles.confirmCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmOk, converting && { opacity: 0.6 }]}
                onPress={handleConvertToAcoin}
                disabled={converting}
              >
                {converting ? (
                  <Text style={styles.confirmOkText}>Converting...</Text>
                ) : (
                  <Text style={styles.confirmOkText}>Convert</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showListModal} animationType="fade" transparent>
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmBox, { backgroundColor: colors.surface }]}>
            <View style={[styles.confirmIconWrap, { backgroundColor: "rgba(255,149,0,0.1)" }]}>
              <Ionicons name="storefront" size={32} color="#FF9500" />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>List on Marketplace</Text>
            <Text style={[styles.confirmDesc, { color: colors.textSecondary }]}>
              Set your asking price for{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>
                {selectedGift?.gift.emoji} {selectedGift?.gift.name}
              </Text>
              . A {MARKETPLACE_FEE_PERCENT}% fee applies on sale.
            </Text>
            <TextInput
              style={[styles.listInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              placeholder="Price in ACoin"
              placeholderTextColor={colors.textMuted}
              value={listPrice}
              onChangeText={setListPrice}
              keyboardType="numeric"
            />
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={[styles.confirmCancel, { backgroundColor: colors.inputBg }]}
                onPress={() => { setShowListModal(false); setListPrice(""); }}
                disabled={listing}
              >
                <Text style={[styles.confirmCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmOk, { backgroundColor: "#FF9500" }, listing && { opacity: 0.6 }]}
                onPress={handleListOnMarketplace}
                disabled={listing}
              >
                <Text style={styles.confirmOkText}>{listing ? "Listing..." : "List"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SwipeableBottomSheet visible={!!sendGift} onClose={() => setSendGift(null)} backgroundColor={colors.surface}>
          <View style={[styles.modalContent]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Send Gift</Text>
              <TouchableOpacity onPress={() => setSendGift(null)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>

            <View style={[styles.sendGiftPreview, { backgroundColor: colors.inputBg }]}>
              <GiftImage uri={sendGift?.gift.image_url || null} emoji={sendGift?.gift.emoji || "🎁"} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sendPreviewName, { color: colors.text }]}>{sendGift?.gift.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <Text style={[styles.sendPreviewRarity, { color: rarityColors[sendGift?.gift.rarity || "common"] }]}>{sendGift?.gift.rarity}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Ionicons name="diamond" size={11} color={Colors.gold} />
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.gold }}>{sendGift ? getDynamicPrice(sendGift.gift.id, sendGift.gift.base_xp_cost) : 0}</Text>
                  </View>
                </View>
              </View>
            </View>

            <TextInput
              style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              placeholder="Recipient's @handle"
              placeholderTextColor={colors.textMuted}
              value={sendHandle}
              onChangeText={setSendHandle}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              placeholder="Add a message (optional)"
              placeholderTextColor={colors.textMuted}
              value={sendMsg}
              onChangeText={setSendMsg}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!sendHandle.trim() || sending) && { opacity: 0.5 }]}
              onPress={handleSendGift}
              disabled={sending || !sendHandle.trim()}
            >
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.sendBtnText}>{sending ? "Sending..." : "Send Gift"}</Text>
            </TouchableOpacity>
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
  statsBar: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16 },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, height: 28 },
  skeletonGrid: { flexDirection: "row", flexWrap: "wrap", padding: 8, justifyContent: "flex-start" },
  giftCard: { flex: 1, margin: 4, borderRadius: 16, padding: 14, alignItems: "center", gap: 6, minWidth: "45%", maxWidth: "50%" },
  giftImageWrap: { width: 80, height: 80, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  giftImage: { width: 64, height: 64 },
  giftEmojiFallback: { fontSize: 40 },
  giftName: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  rarityBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rarityDot: { width: 6, height: 6, borderRadius: 3 },
  rarityText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  giftValueRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  giftValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.gold },
  pinBadge: { position: "absolute", top: 8, right: 8, backgroundColor: Colors.brand, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center", zIndex: 1 },
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
  rarityTextLg: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  giftDesc: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },
  senderRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  senderText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  convertCard: { borderRadius: 14, padding: 16, alignItems: "center", gap: 6 },
  convertLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  convertValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  convertValueText: { fontSize: 28, fontFamily: "Inter_700Bold" },
  convertCurrency: { fontSize: 16, fontFamily: "Inter_500Medium" },
  actionRow: { flexDirection: "row", gap: 10 },
  convertBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.gold, borderRadius: 14, paddingVertical: 14 },
  convertBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sendGiftBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20 },
  sendGiftBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  pinRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  pinLink: { fontSize: 14, fontFamily: "Inter_500Medium" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  sendGiftPreview: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 12 },
  sendPreviewImage: { width: 48, height: 48 },
  sendPreviewName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  sendPreviewRarity: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  modalInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.brand, borderRadius: 14, paddingVertical: 14 },
  sendBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  confirmOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)", padding: 32 },
  confirmBox: { borderRadius: 20, padding: 28, width: "100%", maxWidth: 340, alignItems: "center", gap: 12 },
  confirmIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  confirmTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  confirmDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  confirmWarn: { fontSize: 12, fontFamily: "Inter_500Medium" },
  confirmBtns: { flexDirection: "row", gap: 10, width: "100%", marginTop: 4 },
  confirmCancel: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  confirmCancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  confirmOk: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: Colors.gold },
  confirmOkText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  marketplaceBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#FF9500", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  marketplaceBtnText: { color: "#FF9500", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sellRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  sellLink: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  listInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular", width: "100%" },
});
