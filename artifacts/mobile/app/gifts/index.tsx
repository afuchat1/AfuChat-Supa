import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

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

const rarityColors: Record<string, string> = {
  common: "#8E8E93",
  uncommon: Colors.brand,
  rare: "#007AFF",
  epic: "#AF52DE",
  legendary: "#FF9500",
};

export default function GiftsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"shop" | "owned">("shop");
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [owned, setOwned] = useState<OwnedGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendGift, setSendGift] = useState<Gift | null>(null);
  const [sendHandle, setSendHandle] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);

  const loadGifts = useCallback(async () => {
    const { data } = await supabase.from("gifts").select("id, name, emoji, base_xp_cost, acoin_price, rarity, description").order("base_xp_cost", { ascending: true });
    if (data) setGifts(data.map((g: any) => ({ ...g, acoin_price: g.acoin_price ?? g.base_xp_cost })));
    setLoading(false);
  }, []);

  const loadOwned = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_gifts")
      .select("id, gift_id, is_pinned, acquired_at, gifts(id, name, emoji, base_xp_cost, rarity, description)")
      .eq("user_id", user.id)
      .order("acquired_at", { ascending: false });
    if (data) setOwned(data.map((g: any) => ({ ...g, gift: g.gifts })));
  }, [user]);

  useEffect(() => { loadGifts(); loadOwned(); }, [loadGifts, loadOwned]);

  async function handleSendGift() {
    if (!sendGift || !sendHandle.trim() || !user) return;
    setSending(true);

    const price = sendGift.acoin_price ?? sendGift.base_xp_cost;

    const { data: senderProfile } = await supabase.from("profiles").select("acoin").eq("id", user.id).single();
    if (!senderProfile || (senderProfile.acoin || 0) < price) {
      showAlert("Insufficient ACoins", `You need ${price} ACoins to send this gift. Your balance: ${senderProfile?.acoin || 0} ACoins.`);
      setSending(false);
      return;
    }

    const { data: recipient } = await supabase.from("profiles").select("id, display_name").eq("handle", sendHandle.trim().toLowerCase()).single();
    if (!recipient) { showAlert("Not found", "User not found."); setSending(false); return; }

    const originalBalance = senderProfile.acoin || 0;
    const { error: deductErr } = await supabase.rpc("deduct_acoin", { p_user_id: user.id, p_amount: price }).maybeSingle();
    if (deductErr) {
      const { error: fallbackErr } = await supabase
        .from("profiles")
        .update({ acoin: originalBalance - price })
        .eq("id", user.id)
        .gte("acoin", price);
      if (fallbackErr) {
        showAlert("Error", "Could not deduct ACoins. Please try again.");
        setSending(false);
        return;
      }
    }

    const { error } = await supabase.from("gift_transactions").insert({
      gift_id: sendGift.id,
      sender_id: user.id,
      receiver_id: recipient.id,
      xp_cost: price,
      message: sendMsg.trim() || null,
    });

    if (error) {
      await supabase.from("profiles").update({ acoin: originalBalance }).eq("id", user.id);
      showAlert("Error", "Could not send gift. Your ACoins have been refunded.");
    } else {
      await supabase.from("acoin_transactions").insert({
        user_id: user.id,
        amount: -price,
        transaction_type: "gift_sent",
        metadata: { gift_id: sendGift.id, gift_name: sendGift.name, receiver_id: recipient.id },
      });

      const rarityMultipliers: Record<string, number> = {
        common: 0,
        uncommon: 0.02,
        rare: 0.05,
        epic: 0.08,
        legendary: 0.12,
      };
      const multiplier = rarityMultipliers[sendGift.rarity] || 0;
      if (multiplier > 0) {
        const { error: rpcErr } = await supabase.rpc("escalate_gift_price", { p_gift_id: sendGift.id, p_multiplier: multiplier }).maybeSingle();
        if (rpcErr) {
          const newPrice = Math.ceil(price * (1 + multiplier));
          await supabase.from("gifts").update({ acoin_price: newPrice }).eq("id", sendGift.id);
        }
      }

      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("gift_sent"); } catch (_) {}
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Gift Sent!", `${sendGift.emoji} ${sendGift.name} sent to ${recipient.display_name}`);
      setSendGift(null);
      setSendHandle("");
      setSendMsg("");
      loadOwned();
      loadGifts();
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Gifts</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.surface }]}>
        {(["shop", "owned"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && { borderBottomColor: Colors.brand, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? Colors.brand : colors.textSecondary }]}>
              {t === "shop" ? "Gift Shop" : "My Gifts"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} /> : tab === "shop" ? (
        <FlatList
          data={gifts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.giftCard, { backgroundColor: colors.surface }]} onPress={() => setSendGift(item)}>
              <Text style={styles.giftEmoji}>{item.emoji}</Text>
              <Text style={[styles.giftName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
              <View style={styles.giftPriceRow}>
                <Ionicons name="logo-bitcoin" size={12} color={Colors.gold} />
                <Text style={[styles.giftPrice, { color: Colors.gold }]}>{item.acoin_price ?? item.base_xp_cost}</Text>
              </View>
              <Text style={[styles.rarityTag, { color: rarityColors[item.rarity] || "#8E8E93" }]}>{item.rarity}</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 8, paddingBottom: 90 }}
        />
      ) : (
        <FlatList
          data={owned}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.giftCard, { backgroundColor: colors.surface }]} onPress={() => togglePin(item)}>
              <Text style={styles.giftEmoji}>{item.gift.emoji}</Text>
              <Text style={[styles.giftName, { color: colors.text }]} numberOfLines={1}>{item.gift.name}</Text>
              {item.is_pinned && <Ionicons name="pin" size={14} color={Colors.brand} style={styles.pinIcon} />}
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 8, paddingBottom: 90 }}
          ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>No gifts yet</Text>}
        />
      )}

      <Modal visible={!!sendGift} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Send {sendGift?.emoji} {sendGift?.name}</Text>
              <TouchableOpacity onPress={() => setSendGift(null)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <Text style={[styles.costText, { color: Colors.gold }]}>Cost: {sendGift?.acoin_price ?? sendGift?.base_xp_cost} ACoin</Text>
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Recipient handle" placeholderTextColor={colors.textMuted} value={sendHandle} onChangeText={setSendHandle} autoCapitalize="none" />
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Add a message (optional)" placeholderTextColor={colors.textMuted} value={sendMsg} onChangeText={setSendMsg} />
            <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={handleSendGift} disabled={sending}>
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>Send Gift</Text>}
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
  tabs: { flexDirection: "row" },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  giftCard: { flex: 1, margin: 4, borderRadius: 14, padding: 12, alignItems: "center", gap: 4, maxWidth: "32%" },
  giftEmoji: { fontSize: 36 },
  giftName: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
  giftPriceRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  giftPrice: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  rarityTag: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  pinIcon: { position: "absolute", top: 6, right: 6 },
  emptyText: { textAlign: "center", marginTop: 40, fontSize: 15, fontFamily: "Inter_400Regular" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  costText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modalInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  sendBtn: { backgroundColor: Colors.brand, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  sendBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
