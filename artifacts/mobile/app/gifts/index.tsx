import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
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
import { notifyGiftReceived } from "@/lib/notifyUser";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { GiftCardSkeleton } from "@/components/ui/Skeleton";

type Gift = {
  id: string;
  name: string;
  emoji: string;
  base_xp_cost: number;
  acoin_price: number;
  rarity: string;
  description: string | null;
};

type OwnedGift = {
  id: string;
  gift_id: string;
  gift: Gift;
  is_pinned: boolean;
  acquired_at: string;
};

const HIDDEN_FEE_PERCENT = 5.99;

const rarityColors: Record<string, string> = {
  common: "#8E8E93",
  uncommon: Colors.brand,
  rare: "#007AFF",
  epic: "#AF52DE",
  legendary: "#FF9500",
};

export default function GiftsScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [owned, setOwned] = useState<OwnedGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [convertGift, setConvertGift] = useState<OwnedGift | null>(null);
  const [converting, setConverting] = useState(false);
  const [sendGift, setSendGift] = useState<OwnedGift | null>(null);
  const [sendHandle, setSendHandle] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);

  const loadOwned = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_gifts")
      .select("id, gift_id, is_pinned, acquired_at, gifts(id, name, emoji, base_xp_cost, acoin_price, rarity, description)")
      .eq("user_id", user.id)
      .order("acquired_at", { ascending: false });
    if (data) setOwned(data.map((g: any) => ({ ...g, gift: { ...g.gifts, acoin_price: g.gifts.acoin_price ?? g.gifts.base_xp_cost } })));
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadOwned(); }, [loadOwned]);

  function getConvertValue(gift: Gift): number {
    const baseValue = gift.acoin_price ?? gift.base_xp_cost;
    const fee = baseValue * (HIDDEN_FEE_PERCENT / 100);
    return Math.floor(baseValue - fee);
  }

  async function handleConvertToAcoin() {
    if (!convertGift || !user || !profile) return;
    setConverting(true);

    const acoinAmount = getConvertValue(convertGift.gift);
    if (acoinAmount <= 0) {
      showAlert("Too Low", "This gift's value is too low to convert.");
      setConverting(false);
      return;
    }

    try {
      const { data: freshProfile } = await supabase.from("profiles").select("acoin").eq("id", user.id).single();
      if (!freshProfile) { showAlert("Error", "Could not load your balance."); setConverting(false); return; }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ acoin: (freshProfile.acoin || 0) + acoinAmount })
        .eq("id", user.id);

      if (updateErr) {
        showAlert("Error", "Could not credit ACoin. Please try again.");
        setConverting(false);
        return;
      }

      const { error: deleteErr } = await supabase.from("user_gifts").delete().eq("id", convertGift.id);
      if (deleteErr) {
        await supabase.from("profiles").update({ acoin: freshProfile.acoin || 0 }).eq("id", user.id);
        showAlert("Error", "Could not remove gift. Conversion rolled back.");
        setConverting(false);
        return;
      }

      await supabase.from("acoin_transactions").insert({
        user_id: user.id,
        amount: acoinAmount,
        transaction_type: "gift_conversion",
        metadata: { gift_id: convertGift.gift.id, gift_name: convertGift.gift.name },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Converted!", `${convertGift.gift.emoji} ${convertGift.gift.name} converted to ${acoinAmount} ACoin`);
      setConvertGift(null);
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
      const { data: recipient } = await supabase.from("profiles").select("id, display_name").eq("handle", sendHandle.trim().toLowerCase()).single();
      if (!recipient) { showAlert("Not found", "User not found."); setSending(false); return; }

      const { error: insertErr } = await supabase.from("user_gifts").insert({
        user_id: recipient.id,
        gift_id: sendGift.gift.id,
        is_pinned: false,
      });

      if (insertErr) {
        showAlert("Error", "Could not deliver gift. Please try again.");
        setSending(false);
        return;
      }

      const { error: deleteErr } = await supabase.from("user_gifts").delete().eq("id", sendGift.id);
      if (deleteErr) {
        await supabase.from("user_gifts").delete().eq("user_id", recipient.id).eq("gift_id", sendGift.gift.id).order("acquired_at", { ascending: false }).limit(1);
        showAlert("Error", "Could not complete transfer. Please try again.");
        setSending(false);
        return;
      }

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
    loadOwned();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Gifts</Text>
        <TouchableOpacity onPress={() => router.push("/wallet")}>
          <View style={styles.acoinBadge}>
            <Ionicons name="diamond" size={14} color="#fff" />
            <Text style={styles.acoinText}>{profile?.acoin || 0}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.infoBar, { backgroundColor: colors.surface }]}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Tap a gift to convert to ACoin or send to a friend
        </Text>
      </View>

      {loading ? (
        <View style={styles.skeletonGrid}>
          {[1, 2, 3, 4, 5, 6].map((i) => <GiftCardSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={owned}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.giftCard, { backgroundColor: colors.surface }]}
              onPress={() => setConvertGift(item)}
              onLongPress={() => togglePin(item)}
            >
              <Text style={styles.giftEmoji}>{item.gift.emoji}</Text>
              <Text style={[styles.giftName, { color: colors.text }]} numberOfLines={1}>{item.gift.name}</Text>
              <View style={styles.giftValueRow}>
                <Ionicons name="diamond" size={11} color={Colors.gold} />
                <Text style={[styles.giftValue, { color: Colors.gold }]}>{getConvertValue(item.gift)}</Text>
              </View>
              <Text style={[styles.rarityTag, { color: rarityColors[item.gift.rarity] || "#8E8E93" }]}>{item.gift.rarity}</Text>
              {item.is_pinned && <Ionicons name="pin" size={14} color={Colors.brand} style={styles.pinIcon} />}
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 8, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOwned(); }} tintColor={Colors.brand} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="gift-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No gifts yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Receive gifts from friends or buy them in chats
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={!!convertGift} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{convertGift?.gift.emoji} {convertGift?.gift.name}</Text>
              <TouchableOpacity onPress={() => setConvertGift(null)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>

            <Text style={[styles.rarityLabel, { color: rarityColors[convertGift?.gift.rarity || "common"] || "#8E8E93" }]}>
              {convertGift?.gift.rarity}
            </Text>

            {convertGift?.gift.description && (
              <Text style={[styles.giftDesc, { color: colors.textSecondary }]}>{convertGift.gift.description}</Text>
            )}

            <View style={[styles.convertCard, { backgroundColor: colors.inputBg }]}>
              <View style={styles.convertRow}>
                <Text style={[styles.convertLabel, { color: colors.textSecondary }]}>Convert Value</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="diamond" size={16} color={Colors.gold} />
                  <Text style={[styles.convertValue, { color: colors.text }]}>{convertGift ? getConvertValue(convertGift.gift) : 0} ACoin</Text>
                </View>
              </View>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.convertBtn, converting && { opacity: 0.6 }]}
                onPress={handleConvertToAcoin}
                disabled={converting}
              >
                <Ionicons name="swap-horizontal" size={18} color="#fff" />
                <Text style={styles.convertBtnText}>{converting ? "Converting..." : "Convert to ACoin"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sendGiftBtn, { borderColor: Colors.brand }]}
                onPress={() => { setSendGift(convertGift); setConvertGift(null); }}
              >
                <Ionicons name="send" size={16} color={Colors.brand} />
                <Text style={[styles.sendGiftBtnText, { color: Colors.brand }]}>Send</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => { if (convertGift) togglePin(convertGift); setConvertGift(null); }}>
              <Text style={[styles.pinLink, { color: colors.textSecondary }]}>
                {convertGift?.is_pinned ? "Unpin from profile" : "Pin to profile"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!sendGift} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Send {sendGift?.gift.emoji} {sendGift?.gift.name}</Text>
              <TouchableOpacity onPress={() => setSendGift(null)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Recipient @handle" placeholderTextColor={colors.textMuted} value={sendHandle} onChangeText={setSendHandle} autoCapitalize="none" />
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Add a message (optional)" placeholderTextColor={colors.textMuted} value={sendMsg} onChangeText={setSendMsg} />
            <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={handleSendGift} disabled={sending}>
              <Text style={styles.sendBtnText}>{sending ? "Sending..." : "Send Gift"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  acoinBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.gold, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  acoinText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  infoBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  skeletonGrid: { flexDirection: "row", flexWrap: "wrap", padding: 8, justifyContent: "flex-start" },
  giftCard: { flex: 1, margin: 4, borderRadius: 14, padding: 12, alignItems: "center", gap: 4, maxWidth: "32%" },
  giftEmoji: { fontSize: 36 },
  giftName: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
  giftValueRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  giftValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  rarityTag: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  pinIcon: { position: "absolute", top: 6, right: 6 },
  emptyWrap: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 4 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  rarityLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  giftDesc: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  convertCard: { borderRadius: 12, padding: 14 },
  convertRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  convertLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  convertValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  actionRow: { flexDirection: "row", gap: 10 },
  convertBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.gold, borderRadius: 14, paddingVertical: 14 },
  convertBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sendGiftBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20 },
  sendGiftBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  pinLink: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
  modalInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  sendBtn: { backgroundColor: Colors.brand, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  sendBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
