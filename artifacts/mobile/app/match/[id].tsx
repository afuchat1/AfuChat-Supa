import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import { chargeMatchGift, MATCH_PRICES, getAcoinBalance } from "@/lib/matchTransactions";

const BRAND = "#FF2D55";

type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  is_gift: boolean;
  gift_emoji: string | null;
  read_at: string | null;
  sent_at: string;
};

type MatchProfile = {
  user_id: string;
  name: string;
  date_of_birth: string | null;
  primary_photo: string | null;
  job_title: string | null;
  location_name: string | null;
};

const QUICK_REPLIES = ["Hey there! 👋", "You seem interesting 😊", "Love your photos! ❤️", "Let's chat 💬", "How's your day? ☀️", "What do you do for fun? 🎉"];

const GIFT_EMOJIS = ["🌹", "💐", "🎁", "💎", "🍫", "🦋", "⭐", "🎵", "🌙", "✨"];

export default function MatchConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [match, setMatch] = useState<{ user1_id: string; user2_id: string; is_super_match: boolean } | null>(null);
  const [otherProfile, setOtherProfile] = useState<MatchProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showGifts, setShowGifts] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const [acoinBalance, setAcoinBalance] = useState(0);
  const [selectedGift, setSelectedGift] = useState<Message | null>(null);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => { if (id) loadAll(); }, [id]);

  async function loadAll() {
    if (!id || !user) return;
    const [{ data: matchData }, { data: msgs }] = await Promise.all([
      supabase.from("match_matches").select("user1_id, user2_id, is_super_match").eq("id", id).single(),
      supabase.from("match_messages").select("*").eq("match_id", id).order("sent_at"),
    ]);
    if (matchData) {
      setMatch(matchData);
      const otherId = matchData.user1_id === user.id ? matchData.user2_id : matchData.user1_id;
      const { data: photos } = await supabase.from("match_photos").select("url").eq("user_id", otherId).eq("is_primary", true).maybeSingle();
      const { data: mp } = await supabase.from("match_profiles").select("user_id, name, date_of_birth, job_title, location_name").eq("user_id", otherId).maybeSingle();
      if (mp) setOtherProfile({ ...mp, primary_photo: photos?.url ?? null });
    }
    setMessages((msgs as Message[]) ?? []);
    setLoading(false);
    // Mark messages read
    await supabase.from("match_messages").update({ read_at: new Date().toISOString() }).eq("match_id", id).neq("sender_id", user.id).is("read_at", null);
    // Load ACoin balance
    const balance = await getAcoinBalance(user.id);
    setAcoinBalance(balance);
  }

  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`match-msgs-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "match_messages", filter: `match_id=eq.${id}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
        flatRef.current?.scrollToEnd({ animated: true });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  async function send(content?: string, giftEmoji?: string) {
    if (!id || !user || (!content?.trim() && !giftEmoji)) return;

    // Charge ACoins for gifts
    if (giftEmoji) {
      const result = await chargeMatchGift(user.id, giftEmoji, otherProfile?.name ?? "match", id);
      if (!result.success) {
        showAlert("Insufficient ACoins", `${result.error}\n\nGifts cost ${MATCH_PRICES.GIFT} AC each. Top up your wallet to send gifts.`, [
          { text: "Top Up Wallet", onPress: () => router.push("/wallet/topup" as any) },
          { text: "Cancel", style: "cancel" },
        ]);
        return;
      }
      setAcoinBalance(result.newBalance ?? 0);
    }

    setSending(true);
    setShowQuick(false);
    const msg: any = { match_id: id, sender_id: user.id };
    if (giftEmoji) { msg.is_gift = true; msg.gift_emoji = giftEmoji; msg.content = `Sent a gift ${giftEmoji}`; }
    else { msg.content = content?.trim(); }
    const { data } = await supabase.from("match_messages").insert(msg).select().single();
    if (data) {
      setMessages((prev) => [...prev, data as Message]);
      flatRef.current?.scrollToEnd({ animated: true });
    }
    setText("");
    setShowGifts(false);
    setSending(false);
  }

  function unmatch() {
    showAlert("Unmatch", `Are you sure you want to unmatch with ${otherProfile?.name ?? "this person"}? This will remove your match and all messages.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Unmatch", style: "destructive", onPress: async () => {
        await supabase.from("match_messages").delete().eq("match_id", id);
        await supabase.from("match_matches").delete().eq("id", id);
        router.replace("/match" as any);
      }},
    ]);
  }

  function calcAge(dob: string | null) {
    if (!dob) return null;
    const age = new Date().getFullYear() - new Date(dob).getFullYear();
    return age;
  }

  if (loading) return (
    <View style={[styles.root, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
      <ActivityIndicator color={BRAND} size="large" />
    </View>
  );

  const isFirstMessage = messages.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={[BRAND, "#FF375F"]} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Pressable
          style={styles.headerProfile}
          onPress={() => router.push({ pathname: "/match/view-profile", params: { userId: otherProfile?.user_id } } as any)}
        >
          {otherProfile?.primary_photo ? (
            <Image source={{ uri: otherProfile.primary_photo }} style={styles.headerAvatar} />
          ) : (
            <Avatar uri={null} name={otherProfile?.name ?? ""} size={40} />
          )}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.headerName}>{otherProfile?.name ?? "Match"}</Text>
              {match?.is_super_match && <Ionicons name="star" size={14} color="#FFD60A" />}
            </View>
            <Text style={styles.headerSub}>
              {[calcAge(otherProfile?.date_of_birth ?? null) ? `${calcAge(otherProfile?.date_of_birth ?? null)} yrs` : null, otherProfile?.job_title, otherProfile?.location_name].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={unmatch} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
          <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
        </Pressable>
      </LinearGradient>

      {/* First message prompt */}
      {isFirstMessage && (
        <View style={[styles.firstMsgBanner, { backgroundColor: BRAND + "15" }]}>
          <Ionicons name="heart" size={16} color={BRAND} />
          <Text style={[styles.firstMsgText, { color: BRAND }]}>It's a match! Say hello to {otherProfile?.name ?? "your match"} 👋</Text>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[styles.msgList, { paddingBottom: 12 }]}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMine = item.sender_id === user?.id;
            return (
              <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
                {item.is_gift ? (
                  <Pressable
                    style={[styles.giftBubble, isMine ? styles.giftBubbleMine : { backgroundColor: colors.surface }]}
                    onPress={() => setSelectedGift(item)}
                  >
                    <Text style={{ fontSize: 36 }}>{item.gift_emoji}</Text>
                    <Text style={[styles.giftLabel, { color: isMine ? "#fff" : colors.text }]}>
                      {isMine ? "Gift sent" : "Gift received"}
                    </Text>
                    <View style={styles.giftTapHint}>
                      <Ionicons name="information-circle-outline" size={11} color={isMine ? "rgba(255,255,255,0.6)" : colors.textMuted} />
                      <Text style={[styles.giftTapHintText, { color: isMine ? "rgba(255,255,255,0.6)" : colors.textMuted }]}>tap to view</Text>
                    </View>
                  </Pressable>
                ) : (
                  <View style={[styles.bubble, isMine ? styles.bubbleMine : [styles.bubbleTheirs, { backgroundColor: colors.surface }]]}>
                    <Text style={[styles.bubbleText, { color: isMine ? "#fff" : colors.text }]}>{item.content}</Text>
                    <View style={styles.bubbleMeta}>
                      <Text style={[styles.bubbleTime, { color: isMine ? "rgba(255,255,255,0.7)" : colors.textMuted }]}>
                        {new Date(item.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                      {isMine && (
                        <Ionicons name={item.read_at ? "checkmark-done" : "checkmark"} size={13} color={item.read_at ? "#fff" : "rgba(255,255,255,0.7)"} />
                      )}
                    </View>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 40, paddingBottom: 20 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>💌</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Start the conversation!</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>Be yourself — a genuine opener goes a long way.</Text>
            </View>
          }
        />

        {/* Quick replies */}
        {showQuick && isFirstMessage && (
          <View style={styles.quickWrap}>
            <FlatList
              horizontal
              data={QUICK_REPLIES}
              keyExtractor={(q) => q}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
              renderItem={({ item }) => (
                <Pressable style={[styles.quickChip, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => send(item)}>
                  <Text style={[styles.quickText, { color: colors.text }]}>{item}</Text>
                </Pressable>
              )}
            />
          </View>
        )}

        {/* Gift emoji picker */}
        {showGifts && (
          <View style={[styles.giftPicker, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <View style={styles.giftPickerHeader}>
              <Text style={[styles.giftPickerTitle, { color: colors.text }]}>Send a gift 🎁</Text>
              <View style={styles.giftCostBadge}>
                <Ionicons name="logo-bitcoin" size={13} color="#FFD60A" />
                <Text style={styles.giftCostText}>{MATCH_PRICES.GIFT} AC each</Text>
                <View style={styles.giftBalanceDivider} />
                <Text style={styles.giftBalanceText}>Balance: {acoinBalance} AC</Text>
              </View>
            </View>
            <View style={styles.giftRow}>
              {GIFT_EMOJIS.map((g) => (
                <Pressable key={g} style={styles.giftEmoji} onPress={() => send(undefined, g)}>
                  <Text style={{ fontSize: 32 }}>{g}</Text>
                  <Text style={styles.giftEmojiCost}>{MATCH_PRICES.GIFT} AC</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
          <Pressable style={styles.inputAction} onPress={() => setShowGifts((v) => !v)}>
            <Ionicons name="gift" size={22} color={showGifts ? BRAND : colors.textMuted} />
          </Pressable>
          <TextInput
            style={[styles.inputField, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
            placeholder="Type a message…"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={(v) => { setText(v); setShowQuick(false); }}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={() => send(text)}
          />
          <Pressable
            style={[styles.sendBtn, { backgroundColor: text.trim() ? BRAND : colors.border }]}
            onPress={() => send(text)}
            disabled={!text.trim() || sending}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={16} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Gift Detail Modal */}
      <Modal visible={!!selectedGift} animationType="slide" transparent>
        <View style={styles.giftModalOverlay}>
          <View style={[styles.giftModalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.giftModalHandle} />

            {/* Header */}
            <View style={styles.giftModalHeader}>
              <Text style={[styles.giftModalTitle, { color: colors.text }]}>Gift Details</Text>
              <Pressable onPress={() => setSelectedGift(null)} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Emoji showcase */}
              <View style={[styles.giftModalEmoji, { backgroundColor: BRAND + "12" }]}>
                <Text style={{ fontSize: 72 }}>{selectedGift?.gift_emoji}</Text>
              </View>

              {/* Direction */}
              <Text style={[styles.giftModalDirection, { color: BRAND }]}>
                {selectedGift?.sender_id === user?.id ? "You sent this gift 💝" : "You received this gift 🎁"}
              </Text>

              {/* Details */}
              <View style={[styles.giftModalDetails, { backgroundColor: colors.backgroundSecondary }]}>
                <View style={styles.giftModalRow}>
                  <Text style={[styles.giftModalLabel, { color: colors.textMuted }]}>
                    {selectedGift?.sender_id === user?.id ? "To" : "From"}
                  </Text>
                  <Text style={[styles.giftModalValue, { color: colors.text }]}>{otherProfile?.name ?? "Match"}</Text>
                </View>
                <View style={[styles.giftModalDivider, { backgroundColor: colors.border }]} />
                <View style={styles.giftModalRow}>
                  <Text style={[styles.giftModalLabel, { color: colors.textMuted }]}>Sent</Text>
                  <Text style={[styles.giftModalValue, { color: colors.text }]}>
                    {selectedGift ? new Date(selectedGift.sent_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                  </Text>
                </View>
                <View style={[styles.giftModalDivider, { backgroundColor: colors.border }]} />
                <View style={styles.giftModalRow}>
                  <Text style={[styles.giftModalLabel, { color: colors.textMuted }]}>Value</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="diamond" size={14} color="#FFD60A" />
                    <Text style={[styles.giftModalValue, { color: "#FFD60A" }]}>{MATCH_PRICES.GIFT} ACoins</Text>
                  </View>
                </View>
              </View>

              {/* Received gift note */}
              {selectedGift?.sender_id !== user?.id && (
                <View style={[styles.giftModalNote, { backgroundColor: colors.backgroundSecondary }]}>
                  <Ionicons name="star" size={16} color={BRAND} />
                  <Text style={[styles.giftModalNoteText, { color: colors.textSecondary }]}>
                    This gift is displayed on your AfuMatch profile.
                  </Text>
                </View>
              )}

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
  headerProfile: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "rgba(255,255,255,0.4)" },
  headerName: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  firstMsgBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  firstMsgText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  msgList: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  msgRow: { flexDirection: "row", justifyContent: "flex-start" },
  msgRowMine: { justifyContent: "flex-end" },
  bubble: { maxWidth: "75%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  bubbleMine: { backgroundColor: BRAND, borderBottomRightRadius: 4 },
  bubbleTheirs: { borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  bubbleMeta: { flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "flex-end" },
  bubbleTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  giftBubble: { borderRadius: 18, padding: 16, alignItems: "center", gap: 4, minWidth: 100 },
  giftBubbleMine: { backgroundColor: BRAND + "CC" },
  giftLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  giftTapHint: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  giftTapHintText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  giftModalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  giftModalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 32, maxHeight: "80%" },
  giftModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#3A3A3C", alignSelf: "center", marginTop: 12, marginBottom: 4 },
  giftModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16 },
  giftModalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  giftModalEmoji: { borderRadius: 20, padding: 24, alignItems: "center", marginBottom: 16 },
  giftModalDirection: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center", marginBottom: 16 },
  giftModalDetails: { borderRadius: 14, marginBottom: 12, overflow: "hidden" },
  giftModalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  giftModalLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  giftModalValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  giftModalDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  giftModalNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 14, marginBottom: 12 },
  giftModalNoteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  quickWrap: { paddingVertical: 8 },
  quickChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  quickText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  giftPicker: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16 },
  giftPickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  giftPickerTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  giftCostBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#1C1C1E", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  giftCostText: { color: "#FFD60A", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  giftBalanceDivider: { width: 1, height: 12, backgroundColor: "#3A3A3C" },
  giftBalanceText: { color: "#8E8E93", fontSize: 11, fontFamily: "Inter_400Regular" },
  giftRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  giftEmoji: { width: 56, height: 64, alignItems: "center", justifyContent: "center", gap: 2 },
  giftEmojiCost: { color: "#FFD60A", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  inputAction: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  inputField: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 120 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32 },
});
