import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
import {
  chargeMatchGift,
  GIFT_CATALOG,
  getGiftItem,
  getAcoinBalance,
} from "@/lib/matchTransactions";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";

const BRAND = "#FF2D55";
const GOLD = "#FFD60A";
const EMOJI_PANEL_HEIGHT = 288;

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

type Reaction = { emoji: string; count: number; reacted: boolean };

const QUICK_REPLIES = [
  "Hey there! 👋", "You seem interesting 😊", "Love your photos! ❤️",
  "Let's chat 💬", "How's your day? ☀️", "What do you do for fun? 🎉",
];

const REACTION_EMOJIS = ["❤️", "😂", "😍", "😮", "😢", "😡", "👍", "🔥", "🥺", "🎉"];

const EMOJI_SECTIONS = [
  { label: "Smileys", emojis: ["😀","😂","🥹","😍","🥰","😘","😊","🤩","😜","😏","😎","🥳","😇","🤗","🙃","😅","😭","😤","😱","🤔"] },
  { label: "Gestures", emojis: ["👍","👎","❤️","🙏","🤝","👏","🔥","💯","✨","🎉","💪","🤙","👌","🫶","✌️"] },
  { label: "Food", emojis: ["🍕","🍔","🌮","🍜","🍣","🍫","🍰","☕","🧋","🍷","🍾","🎂","🍩","🍓","🥑"] },
  { label: "Nature", emojis: ["🌹","🌸","🌺","🌻","🌙","⭐","🌈","☀️","🦋","🐶","🐱","🌊","🏔","🌴","🌿"] },
];

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
  const [showEmoji, setShowEmoji] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const [acoinBalance, setAcoinBalance] = useState(0);
  const [selectedGift, setSelectedGift] = useState<Message | null>(null);
  const [activeEmojiSection, setActiveEmojiSection] = useState(0);
  const [pendingGiftEmoji, setPendingGiftEmoji] = useState<string | null>(null);

  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);

  const flatRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

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
    await supabase.from("match_messages").update({ read_at: new Date().toISOString() }).eq("match_id", id).neq("sender_id", user.id).is("read_at", null);
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

    if (giftEmoji) {
      const giftItem = getGiftItem(giftEmoji);
      const result = await chargeMatchGift(user.id, giftEmoji, otherProfile?.name ?? "match", id, giftItem.price);
      if (!result.success) {
        showAlert("Insufficient ACoins", `${result.error}\n\nThis gift costs ${giftItem.price} AC.`, [
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
    if (giftEmoji) {
      msg.is_gift = true;
      msg.gift_emoji = giftEmoji;
      msg.content = `Sent a gift ${giftEmoji}`;
    } else {
      msg.content = content?.trim();
    }
    const { data } = await supabase.from("match_messages").insert(msg).select().single();
    if (data) {
      setMessages((prev) => [...prev, data as Message]);
      flatRef.current?.scrollToEnd({ animated: true });
    }
    setText("");
    setPendingGiftEmoji(null);
    setShowGifts(false);
    setSending(false);
  }

  function addReaction(messageId: string, emoji: string) {
    setReactions((prev) => {
      const existing = prev[messageId] ?? [];
      const idx = existing.findIndex((r) => r.emoji === emoji);
      let updated: Reaction[];
      if (idx >= 0) {
        const r = existing[idx];
        if (r.reacted) {
          const newCount = r.count - 1;
          updated = newCount <= 0
            ? existing.filter((_, i) => i !== idx)
            : existing.map((r, i) => i === idx ? { ...r, count: newCount, reacted: false } : r);
        } else {
          updated = existing.map((r, i) => i === idx ? { ...r, count: r.count + 1, reacted: true } : r);
        }
      } else {
        updated = [...existing, { emoji, count: 1, reacted: true }];
      }
      return { ...prev, [messageId]: updated };
    });
    setReactionTarget(null);
  }

  function openEmoji() {
    Keyboard.dismiss();
    setShowGifts(false);
    setShowEmoji(true);
  }

  function closeEmoji() {
    setShowEmoji(false);
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  function toggleEmoji() {
    if (showEmoji) {
      closeEmoji();
    } else {
      openEmoji();
    }
  }

  function insertEmoji(emoji: string) {
    setText((prev) => prev + emoji);
  }

  function openGifts() {
    Keyboard.dismiss();
    setShowEmoji(false);
    setPendingGiftEmoji(null);
    setShowGifts(true);
  }

  function toggleGifts() {
    if (showGifts) {
      setShowGifts(false);
    } else {
      openGifts();
    }
  }

  function unmatch() {
    showAlert("Unmatch", `Are you sure you want to unmatch with ${otherProfile?.name ?? "this person"}?`, [
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
    return new Date().getFullYear() - new Date(dob).getFullYear();
  }

  const pendingGiftItem = pendingGiftEmoji ? getGiftItem(pendingGiftEmoji) : null;

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
              {match?.is_super_match && <Ionicons name="star" size={14} color={GOLD} />}
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

      {isFirstMessage && (
        <View style={[styles.firstMsgBanner, { backgroundColor: BRAND + "15" }]}>
          <Ionicons name="heart" size={16} color={BRAND} />
          <Text style={[styles.firstMsgText, { color: BRAND }]}>It's a match! Say hello to {otherProfile?.name ?? "your match"} 👋</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[styles.msgList, { paddingBottom: 12 }]}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMine = item.sender_id === user?.id;
            const msgReactions = reactions[item.id] ?? [];
            return (
              <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
                <View>
                  {item.is_gift ? (
                    <Pressable
                      style={[styles.giftBubble, isMine ? styles.giftBubbleMine : { backgroundColor: colors.surface }]}
                      onPress={() => setSelectedGift(item)}
                      onLongPress={() => setReactionTarget(item.id)}
                      delayLongPress={400}
                    >
                      <Text style={{ fontSize: 36 }}>{item.gift_emoji}</Text>
                      <Text style={[styles.giftName, { color: isMine ? "#fff" : colors.text }]}>
                        {getGiftItem(item.gift_emoji ?? "🎁").name}
                      </Text>
                      <View style={[styles.giftPriceBadge, { backgroundColor: isMine ? "rgba(0,0,0,0.2)" : colors.backgroundSecondary }]}>
                        <Ionicons name="diamond" size={10} color={GOLD} />
                        <Text style={styles.giftPriceText}>{getGiftItem(item.gift_emoji ?? "🎁").price} AC</Text>
                      </View>
                      <View style={styles.giftTapHint}>
                        <Ionicons name="information-circle-outline" size={11} color={isMine ? "rgba(255,255,255,0.6)" : colors.textMuted} />
                        <Text style={[styles.giftTapHintText, { color: isMine ? "rgba(255,255,255,0.6)" : colors.textMuted }]}>tap for details</Text>
                      </View>
                    </Pressable>
                  ) : (
                    <Pressable onLongPress={() => setReactionTarget(item.id)} delayLongPress={400}>
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
                    </Pressable>
                  )}

                  {msgReactions.length > 0 && (
                    <View style={[styles.reactionsRow, isMine && styles.reactionsRowMine]}>
                      {msgReactions.map((r) => (
                        <Pressable
                          key={r.emoji}
                          style={[styles.reactionChip, { backgroundColor: r.reacted ? BRAND + "20" : colors.surface, borderColor: r.reacted ? BRAND : colors.border }]}
                          onPress={() => addReaction(item.id, r.emoji)}
                        >
                          <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                          {r.count > 1 && <Text style={[styles.reactionCount, { color: r.reacted ? BRAND : colors.textMuted }]}>{r.count}</Text>}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
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

        {/* Gift picker panel */}
        {showGifts && (
          <View style={[styles.panel, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <View style={styles.panelHeader}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Send a Gift</Text>
              <View style={styles.balanceBadge}>
                <Ionicons name="diamond" size={12} color={GOLD} />
                <Text style={styles.balanceText}>{acoinBalance} AC</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {GIFT_CATALOG.map((g) => {
                const isSelected = pendingGiftEmoji === g.emoji;
                const tooExpensive = acoinBalance < g.price;
                return (
                  <Pressable
                    key={g.emoji}
                    style={[
                      styles.giftCard,
                      { borderColor: isSelected ? BRAND : colors.border },
                      isSelected && { backgroundColor: BRAND + "18" },
                      !isSelected && { backgroundColor: colors.backgroundSecondary },
                      tooExpensive && { opacity: 0.38 },
                    ]}
                    onPress={() => setPendingGiftEmoji(isSelected ? null : g.emoji)}
                    disabled={tooExpensive}
                  >
                    <Text style={styles.giftCardEmoji}>{g.emoji}</Text>
                    <Text style={[styles.giftCardName, { color: isSelected ? BRAND : colors.text }]} numberOfLines={1}>{g.name}</Text>
                    <View style={styles.giftCardPrice}>
                      <Ionicons name="diamond" size={9} color={GOLD} />
                      <Text style={styles.giftCardPriceText}>{g.price} AC</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            {/* Send confirmation row */}
            {pendingGiftItem && (
              <View style={[styles.giftConfirmRow, { backgroundColor: colors.backgroundSecondary, borderColor: BRAND + "30" }]}>
                <Text style={{ fontSize: 24 }}>{pendingGiftItem.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.giftConfirmName, { color: colors.text }]}>{pendingGiftItem.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="diamond" size={10} color={GOLD} />
                    <Text style={[styles.giftConfirmPrice, { color: GOLD }]}>{pendingGiftItem.price} ACoins</Text>
                  </View>
                </View>
                <Pressable
                  style={[styles.giftSendBtn, sending && { opacity: 0.5 }]}
                  onPress={() => send(undefined, pendingGiftEmoji!)}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="send" size={14} color="#fff" />
                      <Text style={styles.giftSendBtnText}>Send</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: showEmoji ? 8 : insets.bottom + 8 }]}>
          <Pressable style={styles.inputAction} onPress={toggleGifts}>
            <Ionicons name="gift" size={22} color={showGifts ? BRAND : colors.textMuted} />
          </Pressable>
          {/* Emoji / Keyboard toggle */}
          <Pressable style={styles.inputAction} onPress={toggleEmoji}>
            <Ionicons
              name={showEmoji ? "keypad-outline" : "happy-outline"}
              size={22}
              color={showEmoji ? BRAND : colors.textMuted}
            />
          </Pressable>
          <TextInput
            ref={inputRef}
            style={[styles.inputField, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
            placeholder="Type a message…"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={(v) => { setText(v); setShowQuick(false); }}
            multiline
            maxLength={1000}
            returnKeyType="default"
            onFocus={() => { setShowEmoji(false); setShowGifts(false); }}
            showSoftInputOnFocus={!showEmoji}
          />
          <Pressable
            style={[styles.sendBtn, { backgroundColor: text.trim() ? BRAND : colors.border }]}
            onPress={() => send(text)}
            disabled={!text.trim() || sending}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={16} color="#fff" />}
          </Pressable>
        </View>

        {/* Emoji picker panel — sits below input bar (keyboard replacement) */}
        {showEmoji && (
          <View style={[styles.emojiPanel, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom }]}>
            <View style={styles.emojiTabs}>
              {EMOJI_SECTIONS.map((s, i) => (
                <Pressable
                  key={s.label}
                  style={[styles.emojiTab, activeEmojiSection === i && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
                  onPress={() => setActiveEmojiSection(i)}
                >
                  <Text style={styles.emojiTabIcon}>{s.emojis[0]}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.emojiGrid}>
              {EMOJI_SECTIONS[activeEmojiSection].emojis.map((em) => (
                <Pressable
                  key={em}
                  style={({ pressed }) => [styles.emojiItem, pressed && { backgroundColor: colors.border + "44" }]}
                  onPress={() => insertEmoji(em)}
                >
                  <Text style={styles.emojiItemText}>{em}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Reaction picker overlay */}
      {reactionTarget && (
        <Pressable style={styles.reactionOverlay} onPress={() => setReactionTarget(null)}>
          <View style={[styles.reactionPicker, { backgroundColor: colors.surface }]}>
            {REACTION_EMOJIS.map((em) => (
              <Pressable
                key={em}
                style={({ pressed }) => [styles.reactionPickerItem, pressed && { transform: [{ scale: 1.3 }] }]}
                onPress={() => addReaction(reactionTarget, em)}
              >
                <Text style={styles.reactionPickerEmoji}>{em}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      )}

      {/* Gift detail bottom sheet */}
      <SwipeableBottomSheet
        visible={!!selectedGift}
        onClose={() => setSelectedGift(null)}
        backgroundColor={colors.surface}
        maxHeight="80%"
      >
        <View style={styles.giftDetailHeader}>
          <Text style={[styles.giftDetailTitle, { color: colors.text }]}>Gift Details</Text>
          <Pressable onPress={() => setSelectedGift(null)} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          <View style={[styles.giftDetailEmoji, { backgroundColor: BRAND + "12" }]}>
            <Text style={{ fontSize: 72 }}>{selectedGift?.gift_emoji}</Text>
            <Text style={[styles.giftDetailEmojiName, { color: colors.textSecondary }]}>
              {getGiftItem(selectedGift?.gift_emoji ?? "🎁").name}
            </Text>
          </View>
          <Text style={[styles.giftDetailDirection, { color: BRAND }]}>
            {selectedGift?.sender_id === user?.id ? "You sent this gift 💝" : "You received this gift 🎁"}
          </Text>
          <View style={[styles.giftDetailRows, { backgroundColor: colors.backgroundSecondary }]}>
            {[
              { label: selectedGift?.sender_id === user?.id ? "To" : "From", value: otherProfile?.name ?? "Match" },
              { label: "Sent", value: selectedGift ? new Date(selectedGift.sent_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "" },
            ].map((row, i, arr) => (
              <View key={row.label}>
                <View style={styles.giftDetailRow}>
                  <Text style={[styles.giftDetailLabel, { color: colors.textMuted }]}>{row.label}</Text>
                  <Text style={[styles.giftDetailValue, { color: colors.text }]}>{row.value}</Text>
                </View>
                {i < arr.length - 1 && <View style={[styles.giftDetailDivider, { backgroundColor: colors.border }]} />}
              </View>
            ))}
            <View style={[styles.giftDetailDivider, { backgroundColor: colors.border }]} />
            <View style={styles.giftDetailRow}>
              <Text style={[styles.giftDetailLabel, { color: colors.textMuted }]}>Value</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="diamond" size={14} color={GOLD} />
                <Text style={[styles.giftDetailValue, { color: GOLD }]}>{getGiftItem(selectedGift?.gift_emoji ?? "🎁").price} ACoins</Text>
              </View>
            </View>
          </View>
          {selectedGift?.sender_id !== user?.id && (
            <View style={[styles.giftDetailNote, { backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="star" size={16} color={BRAND} />
              <Text style={[styles.giftDetailNoteText, { color: colors.textSecondary }]}>
                This gift appears on your AfuMatch profile. Manage your gift showcase from your profile settings.
              </Text>
            </View>
          )}
        </ScrollView>
      </SwipeableBottomSheet>
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
  giftBubble: { borderRadius: 18, padding: 14, alignItems: "center", gap: 3, minWidth: 110 },
  giftBubbleMine: { backgroundColor: BRAND + "CC" },
  giftName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  giftPriceBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  giftPriceText: { color: GOLD, fontSize: 11, fontFamily: "Inter_700Bold" },
  giftTapHint: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  giftTapHintText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, marginLeft: 4 },
  reactionsRowMine: { justifyContent: "flex-end", marginLeft: 0, marginRight: 4 },
  reactionChip: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3 },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  reactionOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.3)" },
  reactionPicker: { flexDirection: "row", borderRadius: 32, paddingHorizontal: 12, paddingVertical: 10, gap: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  reactionPickerItem: { padding: 4 },
  reactionPickerEmoji: { fontSize: 26 },
  panel: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  panelTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  balanceBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1C1C1E", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  balanceText: { color: "#8E8E93", fontSize: 11, fontFamily: "Inter_400Regular" },
  giftCard: { width: 76, alignItems: "center", borderRadius: 14, padding: 10, gap: 4, borderWidth: 1.5 },
  giftCardEmoji: { fontSize: 30 },
  giftCardName: { fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center" },
  giftCardPrice: { flexDirection: "row", alignItems: "center", gap: 2 },
  giftCardPriceText: { color: GOLD, fontSize: 10, fontFamily: "Inter_700Bold" },
  giftConfirmRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 10 },
  giftConfirmName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  giftConfirmPrice: { fontSize: 12, fontFamily: "Inter_700Bold" },
  giftSendBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: BRAND, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10 },
  giftSendBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  inputAction: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  inputField: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 120 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  emojiPanel: { borderTopWidth: StyleSheet.hairlineWidth, height: EMOJI_PANEL_HEIGHT },
  emojiTabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#3A3A3C" },
  emojiTab: { flex: 1, alignItems: "center", paddingVertical: 8 },
  emojiTabIcon: { fontSize: 20 },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", padding: 4, gap: 2 },
  emojiItem: { width: "12.5%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  emojiItemText: { fontSize: 24 },
  quickWrap: { paddingVertical: 8 },
  quickChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  quickText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32 },
  giftDetailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  giftDetailTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  giftDetailEmoji: { borderRadius: 20, padding: 24, alignItems: "center", marginBottom: 16, gap: 6 },
  giftDetailEmojiName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  giftDetailDirection: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center", marginBottom: 16 },
  giftDetailRows: { borderRadius: 14, marginBottom: 12, overflow: "hidden" },
  giftDetailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  giftDetailLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  giftDetailValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  giftDetailDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  giftDetailNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 14 },
  giftDetailNoteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
