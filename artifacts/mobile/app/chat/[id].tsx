import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Video, ResizeMode } from "expo-av";
import Svg, { Path } from "react-native-svg";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { notifyNewMessage } from "@/lib/notifyUser";
import {
  cacheMessages,
  getCachedMessages,
  queueMessage,
  isOnline,
  onConnectivityChange,
} from "@/lib/offlineStore";
import { syncPendingMessages } from "@/lib/offlineSync";

type Gift = {
  id: string;
  name: string;
  emoji: string;
  base_xp_cost: number;
  acoin_price: number;
  rarity: string;
};

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  encrypted_content: string;
  sent_at: string;
  sender?: { display_name: string; avatar_url: string | null; handle: string };
  reply_to_message_id?: string | null;
  reactions?: { emoji: string; count: number; myReaction: boolean }[];
  status?: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  _pending?: boolean;
};

type ChatInfo = {
  is_group: boolean;
  is_channel: boolean;
  name: string | null;
  other_name: string;
  other_avatar: string | null;
  other_id: string;
  avatar_url: string | null;
};

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const SCREEN_HEIGHT = Dimensions.get("window").height;
const BRAND = Colors.brand;

function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function BubbleTail({ isMe, color }: { isMe: boolean; color: string }) {
  if (isMe) {
    return (
      <View style={st.tailMe}>
        <Svg width={12} height={16} viewBox="0 0 12 16">
          <Path d="M0 0 C0 0 0 8 6 12 C9 14 12 16 12 16 L12 0 Z" fill={color} />
        </Svg>
      </View>
    );
  }
  return (
    <View style={st.tailOther}>
      <Svg width={12} height={16} viewBox="0 0 12 16">
        <Path d="M12 0 C12 0 12 8 6 12 C3 14 0 16 0 16 L0 0 Z" fill={color} />
      </Svg>
    </View>
  );
}

function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20 }).start();
    } else {
      Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 0.5) {
          Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 200, useNativeDriver: true }).start(() => onClose());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <TouchableOpacity style={st.sheetOverlay} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={[st.sheetContent, { backgroundColor: colors.surface, transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        <View style={st.sheetHandle} />
        {children}
      </Animated.View>
    </View>
  );
}

function MessageBubble({ msg, isMe, showTail, showName, onLongPress, onReply, replyPreview, onTapEnvelope, onTapGift }: {
  msg: Message;
  isMe: boolean;
  showTail: boolean;
  showName: boolean;
  onLongPress: (msg: Message) => void;
  onReply: (msg: Message) => void;
  replyPreview?: string | null;
  onTapEnvelope?: (msg: Message) => void;
  onTapGift?: (msg: Message) => void;
}) {
  const { colors } = useTheme();
  const isRedEnvelope = msg.encrypted_content.startsWith("🧧");
  const isGiftMsg = msg.encrypted_content.startsWith("🎁");
  const meBubbleColor = BRAND;
  const otherBubbleColor = colors.bubbleIncoming;
  const bubbleColor = isMe ? meBubbleColor : otherBubbleColor;
  const textColor = isMe ? "#FFFFFF" : colors.bubbleIncomingText;
  const isPending = msg._pending || msg.status === "sending";

  if (isRedEnvelope) {
    const displayMsg = msg.encrypted_content.replace(/🧧 Red Envelope \[[a-f0-9-]+\] - /, "").replace("🧧 Red Envelope - ", "");
    return (
      <View style={[st.msgRow, isMe ? st.msgRowMe : st.msgRowOther]}>
        <TouchableOpacity style={st.redEnvBubble} onPress={() => onTapEnvelope?.(msg)} activeOpacity={0.8}>
          <View style={st.redEnvTop}>
            <Text style={st.redEnvEmoji}>🧧</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.redEnvTitle}>{displayMsg}</Text>
              <Text style={st.redEnvSub}>Tap to open</Text>
            </View>
          </View>
          <View style={st.redEnvBottom}>
            <Text style={st.redEnvLabel}>AfuChat Red Envelope</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  if (isGiftMsg) {
    const giftParts = msg.encrypted_content.replace("🎁 ", "").split("|");
    const giftDisplay = giftParts[0];
    const giftEmoji = giftDisplay.split(" ")[0] || "🎁";

    return (
      <View style={[st.msgRow, isMe ? st.msgRowMe : st.msgRowOther]}>
        <TouchableOpacity style={st.giftBoxBubble} onPress={() => onTapGift?.(msg)} activeOpacity={0.8}>
          <View style={st.giftBoxTop}>
            <Text style={st.giftBoxEmoji}>{giftEmoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.giftBoxTitle}>
                {isMe ? "You sent a gift" : `${msg.sender?.display_name || "Someone"} sent you a gift`}
              </Text>
              <Text style={st.giftBoxSub}>
                {isMe ? "Gift sent" : "Tap to open"}
              </Text>
            </View>
          </View>
          <View style={st.giftBoxBottom}>
            <Text style={st.giftBoxOpen}>{isMe ? "View Gift" : "Open Gift 🎁"}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  const hasImage = msg.attachment_url && (msg.attachment_type === "image" || msg.attachment_type === "gif");
  const hasVideo = msg.attachment_url && msg.attachment_type === "video";
  const hasAudio = msg.attachment_url && msg.attachment_type === "audio";
  const hasFile = msg.attachment_url && msg.attachment_type === "file";
  const hasTextContent = msg.encrypted_content && !["📷 Photo", "🎥 Video", "GIF"].includes(msg.encrypted_content);

  return (
    <View style={[st.msgRow, isMe ? st.msgRowMe : st.msgRowOther]}>
      <View style={[st.bubbleContainer, isMe ? st.bubbleContainerMe : st.bubbleContainerOther]}>
        {showTail && <BubbleTail isMe={isMe} color={bubbleColor} />}

        <View style={[
          st.bubble,
          { backgroundColor: bubbleColor },
          isMe ? st.bubbleMe : st.bubbleOther,
          showTail ? (isMe ? st.bubbleTailMe : st.bubbleTailOther) : null,
          isPending && { opacity: 0.6 },
        ]}>
          {!isMe && showName && (
            <Text style={[st.senderName, { color: BRAND }]}>
              {msg.sender?.display_name}
            </Text>
          )}

          {replyPreview && (
            <View style={[st.replyPreview, { backgroundColor: isMe ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)" }]}>
              <View style={[st.replyBarLine, { backgroundColor: isMe ? "#fff" : BRAND }]} />
              <Text style={[st.replyPreviewText, { color: isMe ? "rgba(255,255,255,0.8)" : colors.textSecondary }]} numberOfLines={1}>
                {replyPreview}
              </Text>
            </View>
          )}

          {hasImage ? (
            <TouchableOpacity onLongPress={() => onLongPress(msg)} delayLongPress={300} activeOpacity={0.9}>
              <Image source={{ uri: msg.attachment_url! }} style={st.attachImage} resizeMode="cover" />
              {hasTextContent && (
                <RichText style={[st.bubbleText, { color: textColor, marginTop: 6 }]} linkColor={isMe ? "#FFFFFF" : "#00C2CB"}>{msg.encrypted_content}</RichText>
              )}
            </TouchableOpacity>
          ) : hasVideo ? (
            <TouchableOpacity onLongPress={() => onLongPress(msg)} delayLongPress={300} activeOpacity={0.9}>
              <View style={st.attachVideo}>
                <Video
                  source={{ uri: msg.attachment_url! }}
                  style={{ width: "100%", height: "100%", borderRadius: 8 }}
                  resizeMode={ResizeMode.COVER}
                  useNativeControls
                  isLooping={false}
                />
              </View>
            </TouchableOpacity>
          ) : hasAudio ? (
            <View style={st.audioRow}>
              <Ionicons name="musical-note" size={20} color={textColor} />
              <View style={{ flex: 1 }}>
                <Video source={{ uri: msg.attachment_url! }} style={{ height: 36 }} useNativeControls />
              </View>
            </View>
          ) : hasFile ? (
            <TouchableOpacity onLongPress={() => onLongPress(msg)} delayLongPress={300} activeOpacity={0.9} style={st.fileRow}>
              <View style={[st.fileIconBg, { backgroundColor: isMe ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.06)" }]}>
                <Ionicons name="document-text" size={22} color={textColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.fileName, { color: textColor }]} numberOfLines={2}>{msg.encrypted_content}</Text>
                <Text style={[st.fileMeta, { color: isMe ? "rgba(255,255,255,0.6)" : colors.textMuted }]}>Document</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onLongPress={() => onLongPress(msg)} delayLongPress={300} activeOpacity={0.9}>
              <RichText style={[st.bubbleText, { color: textColor }]} linkColor={isMe ? "#FFFFFF" : "#00C2CB"}>{msg.encrypted_content}</RichText>
            </TouchableOpacity>
          )}

          <View style={st.metaRow}>
            <Text style={[st.msgTime, { color: isMe ? "rgba(255,255,255,0.55)" : colors.textMuted }]}>
              {formatMsgTime(msg.sent_at)}
            </Text>
            {isMe && (
              <Ionicons
                name={
                  isPending ? "time-outline" :
                  msg.status === "read" ? "checkmark-done" :
                  msg.status === "delivered" ? "checkmark-done" : "checkmark"
                }
                size={14}
                color={msg.status === "read" ? "#53BDEB" : isMe ? "rgba(255,255,255,0.55)" : colors.textMuted}
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
        </View>

        {msg.reactions && msg.reactions.length > 0 && (
          <View style={[st.reactionsRow, isMe ? st.reactionsMe : st.reactionsOther]}>
            {msg.reactions.map((r, i) => (
              <View key={i} style={[st.reactionPill, r.myReaction && { borderColor: BRAND, borderWidth: 1.5 }]}>
                <Text style={st.reactionEmoji}>{r.emoji}</Text>
                {r.count > 1 && <Text style={[st.reactionCount, { color: colors.text }]}>{r.count}</Text>}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { id, contactId, contactName, contactAvatar } = useLocalSearchParams<{
    id: string;
    contactId?: string;
    contactName?: string;
    contactAvatar?: string;
  }>();
  const isDraft = id === "new";
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(!isDraft);
  const [sending, setSending] = useState(false);
  const [realChatId, setRealChatId] = useState<string | null>(null);
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(
    isDraft && contactName
      ? {
          is_group: false,
          is_channel: false,
          name: null,
          other_name: contactName as string,
          other_avatar: contactAvatar as string | null || null,
          other_id: contactId as string,
          avatar_url: null,
        }
      : null
  );
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showReactions, setShowReactions] = useState<Message | null>(null);
  const [showRedEnvelope, setShowRedEnvelope] = useState(false);
  const [envelopeAmount, setEnvelopeAmount] = useState("");
  const [envelopeMsg, setEnvelopeMsg] = useState("");
  const [envelopeCount, setEnvelopeCount] = useState("1");
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftSending, setGiftSending] = useState(false);
  const [giftMsg, setGiftMsg] = useState("");
  const [giftReveal, setGiftReveal] = useState<{ content: string; isReceiver: boolean } | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState("");
  const [attachmentPreview, setAttachmentPreview] = useState<{ uri: string; type: string; name?: string } | null>(null);
  const [networkOnline, setNetworkOnline] = useState(isOnline());
  const [messageLimited, setMessageLimited] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeout = useRef<any>(null);

  const effectiveChatId = isDraft ? realChatId : id;

  const loadChatInfo = useCallback(async () => {
    if (!id || !user || isDraft) return;
    const { data: chat } = await supabase
      .from("chats")
      .select(`is_group, is_channel, name, avatar_url, chat_members(user_id, profiles(id, display_name, avatar_url, handle))`)
      .eq("id", id)
      .single();

    if (chat) {
      const others = (chat.chat_members || []).filter((m: any) => m.user_id !== user.id);
      const other = others[0]?.profiles;
      setChatInfo({
        is_group: !!chat.is_group,
        is_channel: !!chat.is_channel,
        name: chat.name,
        other_name: other?.display_name || "Unknown",
        other_avatar: other?.avatar_url || null,
        other_id: other?.id || "",
        avatar_url: chat.avatar_url,
      });
    }
  }, [id, user, isDraft]);

  const loadMessages = useCallback(async () => {
    const chatId = isDraft ? realChatId : id;
    if (!chatId || !user) return;

    if (!isOnline()) {
      const cached = await getCachedMessages(chatId);
      if (cached.length > 0) setMessages(cached);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("messages")
      .select(`id, chat_id, sender_id, encrypted_content, sent_at, reply_to_message_id, attachment_url, attachment_type, profiles!messages_sender_id_fkey(display_name, avatar_url, handle)`)
      .eq("chat_id", chatId)
      .order("sent_at", { ascending: false })
      .limit(50);

    if (data) {
      const msgIds = data.map((m: any) => m.id);

      const [{ data: reactions }, { data: statuses }] = await Promise.all([
        msgIds.length > 0 ? supabase.from("message_reactions").select("message_id, reaction, user_id").in("message_id", msgIds) : { data: [] },
        msgIds.length > 0 ? supabase.from("message_status").select("message_id, read_at, delivered_at").in("message_id", msgIds) : { data: [] },
      ]);

      const reactionMap: Record<string, { emoji: string; count: number; myReaction: boolean }[]> = {};
      for (const r of (reactions || []) as any[]) {
        if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
        const existing = reactionMap[r.message_id].find((x) => x.emoji === r.reaction);
        if (existing) {
          existing.count++;
          if (r.user_id === user.id) existing.myReaction = true;
        } else {
          reactionMap[r.message_id].push({ emoji: r.reaction, count: 1, myReaction: r.user_id === user.id });
        }
      }

      const readSet = new Set<string>();
      for (const s of (statuses || []) as any[]) {
        if (s.read_at) readSet.add(s.message_id);
      }

      const mapped = data.map((m: any) => ({
        id: m.id,
        chat_id: m.chat_id,
        sender_id: m.sender_id,
        encrypted_content: m.encrypted_content,
        sent_at: m.sent_at,
        reply_to_message_id: m.reply_to_message_id,
        attachment_url: m.attachment_url,
        attachment_type: m.attachment_type,
        sender: m.profiles,
        reactions: reactionMap[m.id] || [],
        status: m.sender_id === user.id
          ? (readSet.has(m.id) ? "read" : "sent")
          : undefined,
      }));

      setMessages(mapped);
      cacheMessages(chatId, mapped);

      const unreadFromOthers = data.filter((m: any) => m.sender_id !== user.id);
      if (unreadFromOthers.length > 0) {
        const now = new Date().toISOString();
        supabase.from("message_status").upsert(
          unreadFromOthers.map((m: any) => ({
            message_id: m.id,
            user_id: user.id,
            delivered_at: now,
            read_at: now,
          })),
          { onConflict: "message_id,user_id" }
        );
      }
    }
    setLoading(false);
  }, [id, user, isDraft, realChatId]);

  useEffect(() => {
    const unsub = onConnectivityChange(async (online) => {
      setNetworkOnline(online);
      if (online) {
        await syncPendingMessages();
        setMessages((prev) => prev.filter((m) => !m._pending));
        loadMessages();
      }
    });
    return unsub;
  }, [loadMessages]);

  const checkMessageGating = useCallback(async () => {
    if (!user) return;
    const info = chatInfo;
    if (!info || info.is_group || info.is_channel || !info.other_id) {
      setMessageLimited(false);
      return;
    }
    const otherId = info.other_id;
    const { data: theyFollowMe } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", otherId)
      .eq("following_id", user.id)
      .maybeSingle();
    if (theyFollowMe) {
      setMessageLimited(false);
      return;
    }
    const chatId = isDraft ? realChatId : id;
    if (!chatId) {
      setMessageLimited(false);
      return;
    }
    const { data: theirReplies } = await supabase
      .from("messages")
      .select("id")
      .eq("chat_id", chatId)
      .eq("sender_id", otherId)
      .limit(1);
    if (theirReplies && theirReplies.length > 0) {
      setMessageLimited(false);
      return;
    }
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId)
      .eq("sender_id", user.id);
    setMessageLimited((count || 0) >= 1);
  }, [user, chatInfo, isDraft, realChatId, id]);

  useEffect(() => {
    checkMessageGating();
  }, [checkMessageGating, messages.length]);

  useEffect(() => {
    if (isDraft) return;

    const loadCached = async () => {
      if (id) {
        const cached = await getCachedMessages(id);
        if (cached.length > 0) setMessages(cached);
      }
    };
    loadCached();

    loadChatInfo();
    loadMessages();

    const msgSub = supabase
      .channel(`chat:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${id}` },
        async (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.sender_id === user?.id) return;
          const { data: senderProfile } = await supabase.from("profiles").select("display_name, avatar_url, handle").eq("id", newMsg.sender_id).single();
          setMessages((prev) => [{ ...newMsg, sender: senderProfile as any, reactions: [], status: undefined }, ...prev]);

          if (user) {
            await supabase.from("message_status").upsert({ message_id: newMsg.id, user_id: user.id, delivered_at: new Date().toISOString(), read_at: new Date().toISOString() }, { onConflict: "message_id,user_id" });
          }
        }
      )
      .subscribe();

    const typingSub = supabase
      .channel(`typing:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "typing_indicators", filter: `chat_id=eq.${id}` },
        async (payload) => {
          const data = payload.new as any;
          if (data.user_id === user?.id) return;
          const { data: typer } = await supabase.from("profiles").select("display_name").eq("id", data.user_id).single();
          const name = typer?.display_name || "Someone";
          if (data.is_typing) {
            setTypingUsers((prev) => prev.includes(name) ? prev : [...prev, name]);
            setTimeout(() => { setTypingUsers((prev) => prev.filter((n) => n !== name)); }, 5000);
          } else {
            setTypingUsers((prev) => prev.filter((n) => n !== name));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgSub);
      supabase.removeChannel(typingSub);
    };
  }, [id, loadChatInfo, loadMessages]);

  function handleTyping() {
    if (!user || !id || isDraft) return;
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    supabase.from("typing_indicators").upsert({ chat_id: id, user_id: user.id, is_typing: true }, { onConflict: "chat_id,user_id" });
    typingTimeout.current = setTimeout(() => {
      supabase.from("typing_indicators").upsert({ chat_id: id, user_id: user.id, is_typing: false }, { onConflict: "chat_id,user_id" });
    }, 3000);
  }

  async function addReaction(msg: Message, emoji: string) {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowReactions(null);

    const existing = msg.reactions?.find((r) => r.emoji === emoji && r.myReaction);
    if (existing) {
      await supabase.from("message_reactions").delete().eq("message_id", msg.id).eq("user_id", user.id).eq("reaction", emoji);
    } else {
      await supabase.from("message_reactions").insert({ message_id: msg.id, user_id: user.id, reaction: emoji });
    }
    loadMessages();
  }

  async function getOrCreateChatId(): Promise<string | null> {
    if (!isDraft) return id;
    if (realChatId) return realChatId;
    if (!user || !contactId) return null;

    const { data: chatId, error } = await supabase.rpc("get_or_create_direct_chat", {
      other_user_id: contactId,
    });

    if (error || !chatId) {
      console.error("[getOrCreateChatId] RPC error:", error?.message);
      return null;
    }

    setRealChatId(chatId);

    supabase
      .channel(`chat:${chatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.sender_id === user.id) return;
          const { data: senderProfile } = await supabase.from("profiles").select("display_name, avatar_url, handle").eq("id", newMsg.sender_id).single();
          setMessages((prev) => [{ ...newMsg, sender: senderProfile as any, reactions: [], status: undefined }, ...prev]);
        }
      )
      .subscribe();

    return chatId;
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !user || sending) return;
    if (messageLimited) {
      showAlert("Message limit", `You can only send one message until ${chatInfo?.other_name || "this user"} replies or follows you.`);
      return;
    }
    setSending(true);
    setInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const activeChatId = await getOrCreateChatId();
    if (!activeChatId) {
      setSending(false);
      showAlert("Failed to start chat", "Could not create the conversation. Please check your connection and try again.");
      return;
    }

    const now = new Date().toISOString();
    const tempId = `temp_${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: text,
      sent_at: now,
      sender: { display_name: "You", avatar_url: profile?.avatar_url || null, handle: profile?.handle || "" },
      reply_to_message_id: replyTo?.id || null,
      status: "sending",
      _pending: !isOnline(),
    };
    setMessages((prev) => [optimistic, ...prev]);
    setReplyTo(null);

    if (!isOnline()) {
      await queueMessage({ id: tempId, chat_id: activeChatId, sender_id: user.id, encrypted_content: text, created_at: now });
      setSending(false);
      return;
    }

    const insertPayload: any = {
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: text,
    };
    if (replyTo) insertPayload.reply_to_message_id = replyTo.id;

    const { data: inserted, error } = await supabase.from("messages").insert(insertPayload).select("id").single();
    if (inserted) {
      setMessages((prev) =>
        prev.map((m) => m.id === tempId ? { ...m, id: inserted.id, status: "sent", _pending: false } : m)
      );
    }

    if (!error && chatInfo) {
      notifyNewMessage({
        recipientIds: [chatInfo.other_id],
        senderName: profile?.display_name || "Someone",
        messageText: text,
        chatId: activeChatId,
      });
    }

    try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("message_sent"); } catch (_) {}
    setSending(false);
  }

  async function sendRedEnvelope() {
    const amount = parseInt(envelopeAmount, 10);
    const count = parseInt(envelopeCount, 10) || 1;
    if (!amount || amount < 1 || !user) return;
    if (messageLimited) {
      showAlert("Message limit", `You can only send one message until ${chatInfo?.other_name || "this user"} replies or follows you.`);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const activeChatId = await getOrCreateChatId();
    if (!activeChatId) return;

    const { data: envResult, error: envError } = await supabase.rpc("create_red_envelope", {
      p_total_amount: amount,
      p_recipient_count: count,
      p_message: envelopeMsg || "Good luck!",
      p_envelope_type: "random",
      p_chat_id: activeChatId,
    });

    if (envError || !envResult?.success) {
      showAlert("Error", envResult?.message || envError?.message || "Failed to create red envelope.");
      return;
    }

    const envId = envResult?.envelope_id || "";
    await supabase.from("messages").insert({
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: `🧧 Red Envelope [${envId}] - ${envelopeMsg || "Good luck!"}`,
    });

    try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("red_envelope_sent"); } catch (_) {}
    setShowRedEnvelope(false);
    setEnvelopeAmount("");
    setEnvelopeMsg("");
    setEnvelopeCount("1");
    loadMessages();
  }

  async function loadGifts() {
    const { data } = await supabase.from("gifts").select("*").order("base_xp_cost", { ascending: true });
    if (data) setGifts(data.map((g: any) => ({ ...g, acoin_price: g.acoin_price ?? g.base_xp_cost })));
  }

  async function sendGift(gift: Gift) {
    if (!user || giftSending) return;
    if (messageLimited) {
      showAlert("Message limit", `You can only send one message until ${chatInfo?.other_name || "this user"} replies or follows you.`);
      return;
    }

    const price = gift.acoin_price ?? gift.base_xp_cost;

    const { data: senderProfile } = await supabase.from("profiles").select("acoin").eq("id", user.id).single();
    if (!senderProfile || (senderProfile.acoin || 0) < price) {
      showAlert("Insufficient ACoins", `You need ${price} ACoins to send this gift. Your balance: ${senderProfile?.acoin || 0} ACoins.`);
      return;
    }

    setGiftSending(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const activeChatId = await getOrCreateChatId();
    if (!activeChatId) { setGiftSending(false); return; }

    const receiverId = chatInfo?.other_id;
    if (!receiverId) { setGiftSending(false); return; }

    const newBalance = (senderProfile.acoin || 0) - price;
    const { error: deductErr } = await supabase.rpc("deduct_acoin", { p_user_id: user.id, p_amount: price }).maybeSingle();
    if (deductErr) {
      const { error: fallbackErr } = await supabase
        .from("profiles")
        .update({ acoin: newBalance })
        .eq("id", user.id)
        .gte("acoin", price);
      if (fallbackErr) {
        showAlert("Error", "Could not deduct ACoins. Please try again.");
        setGiftSending(false);
        return;
      }
    }

    const { error: txErr } = await supabase.from("gift_transactions").insert({
      gift_id: gift.id,
      sender_id: user.id,
      receiver_id: receiverId,
      xp_cost: price,
      message: giftMsg.trim() || null,
    });

    if (txErr) {
      await supabase.from("profiles").update({ acoin: (senderProfile.acoin || 0) }).eq("id", user.id);
      showAlert("Error", "Could not send gift. Your ACoins have been refunded.");
      setGiftSending(false);
      return;
    }

    await supabase.from("acoin_transactions").insert({
      user_id: user.id,
      amount: -price,
      transaction_type: "gift_sent",
      metadata: { gift_id: gift.id, gift_name: gift.name, receiver_id: receiverId },
    });

    const rarityMultipliers: Record<string, number> = {
      common: 0,
      uncommon: 0.02,
      rare: 0.05,
      epic: 0.08,
      legendary: 0.12,
    };
    const multiplier = rarityMultipliers[gift.rarity] || 0;
    if (multiplier > 0) {
      await supabase.rpc("escalate_gift_price", { p_gift_id: gift.id, p_multiplier: multiplier }).maybeSingle().then(({ error: rpcErr }) => {
        if (rpcErr) {
          const newPrice = Math.ceil(price * (1 + multiplier));
          supabase.from("gifts").update({ acoin_price: newPrice }).eq("id", gift.id);
        }
      });
    }

    await supabase.from("messages").insert({
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: `🎁 ${gift.emoji} ${gift.name}${giftMsg ? ` - ${giftMsg}` : ""}|giftId:${gift.id}|receiverId:${receiverId}`,
    });

    try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("gift_sent"); } catch (_) {}
    setShowGiftPicker(false);
    setGiftMsg("");
    setGiftSending(false);
    loadMessages();
    loadGifts();
  }

  async function pickFromCamera() {
    setShowAttachMenu(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { showAlert("Permission needed", "Camera access is required to take photos."); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachmentPreview({ uri: asset.uri, type: asset.type === "video" ? "video" : "image" });
    }
  }

  async function pickFromGallery() {
    setShowAttachMenu(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { showAlert("Permission needed", "Gallery access is required."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.8, allowsMultipleSelection: false });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachmentPreview({ uri: asset.uri, type: asset.type === "video" ? "video" : "image" });
    }
  }

  async function pickDocument() {
    setShowAttachMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets[0]) {
        const doc = result.assets[0];
        setAttachmentPreview({ uri: doc.uri, type: "file", name: doc.name });
      }
    } catch {
      showAlert("Error", "Could not pick document");
    }
  }

  async function sendAttachment() {
    if (!user || !attachmentPreview) return;
    if (messageLimited) {
      showAlert("Message limit", `You can only send one message until ${chatInfo?.other_name || "this user"} replies or follows you.`);
      return;
    }
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const activeChatId = await getOrCreateChatId();
    if (!activeChatId) { setSending(false); return; }

    try {
      const ext = attachmentPreview.uri.split(".").pop()?.split("?")[0] || "file";
      const fileName = attachmentPreview.name || `${Date.now()}.${ext}`;
      const filePath = `chat-attachments/${activeChatId}/${user.id}/${fileName}`;

      let uploadError: any = null;

      if (Platform.OS === "web") {
        const response = await fetch(attachmentPreview.uri);
        const blob = await response.blob();
        const result = await supabase.storage.from("chat-media").upload(filePath, blob, { upsert: true });
        uploadError = result.error;
      } else {
        const mimeTypes: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
          mp4: "video/mp4", mov: "video/quicktime", pdf: "application/pdf",
          doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
        const mime = mimeTypes[ext.toLowerCase()] || "application/octet-stream";
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
        const session = (await supabase.auth.getSession()).data.session;
        const storageUrl = `${supabaseUrl}/storage/v1/object/chat-media/${filePath}`;
        const uploadResult = await FileSystem.uploadAsync(
          storageUrl,
          attachmentPreview.uri,
          {
            httpMethod: "POST",
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: {
              "Content-Type": mime,
              "Authorization": `Bearer ${session?.access_token || ""}`,
              "apikey": process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
              "x-upsert": "true",
            },
          }
        );
        uploadError = uploadResult.status >= 400 ? { message: `Upload failed: ${uploadResult.status}` } : null;
      }

      const label = attachmentPreview.type === "image" ? "📷 Photo" : attachmentPreview.type === "video" ? "🎥 Video" : `📎 ${attachmentPreview.name || "File"}`;

      if (uploadError) {
        await supabase.from("messages").insert({ chat_id: activeChatId, sender_id: user.id, encrypted_content: label });
      } else {
        const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(filePath);
        const publicUrl = urlData?.publicUrl || "";
        await supabase.from("messages").insert({
          chat_id: activeChatId,
          sender_id: user.id,
          encrypted_content: label,
          attachment_url: publicUrl,
          attachment_type: attachmentPreview.type,
        });
      }

      loadMessages();
    } catch (e: any) {
      showAlert("Upload failed", e?.message || "Could not upload file");
    }

    setAttachmentPreview(null);
    setSending(false);
  }

  async function sendGifMessage(gifUrl: string) {
    if (!user) return;
    if (messageLimited) {
      showAlert("Message limit", `You can only send one message until ${chatInfo?.other_name || "this user"} replies or follows you.`);
      setShowGifPicker(false);
      return;
    }
    setShowGifPicker(false);
    setGifSearch("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const activeChatId = await getOrCreateChatId();
    if (!activeChatId) return;

    await supabase.from("messages").insert({
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: "GIF",
      attachment_url: gifUrl,
      attachment_type: "gif",
    });
    loadMessages();
  }

  async function handleTapGift(msg: Message) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const raw = msg.encrypted_content.replace("🎁 ", "");
    const parts = raw.split("|");
    const displayContent = parts[0];

    const giftIdMatch = raw.match(/\|giftId:([a-f0-9-]+)/);
    const receiverIdMatch = raw.match(/\|receiverId:([a-f0-9-]+)/);
    const giftId = giftIdMatch?.[1];
    const receiverId = receiverIdMatch?.[1];

    const isReceiver = user?.id === receiverId;

    if (isReceiver && giftId && user) {
      const { data: existing } = await supabase
        .from("user_gifts")
        .select("id")
        .eq("user_id", user.id)
        .eq("gift_id", giftId)
        .eq("from_message_id", msg.id)
        .maybeSingle();

      if (!existing) {
        await supabase.from("user_gifts").insert({
          user_id: user.id,
          gift_id: giftId,
          from_message_id: msg.id,
        });
      }
    }

    setGiftReveal({ content: displayContent, isReceiver: !!isReceiver });
  }

  async function handleTapEnvelope(msg: Message) {
    const match = msg.encrypted_content.match(/\[([a-f0-9-]+)\]/);
    if (match) {
      router.push({ pathname: "/red-envelope/[id]", params: { id: match[1] } });
      return;
    }
    const { data } = await supabase
      .from("red_envelopes")
      .select("id")
      .eq("chat_id", id)
      .eq("sender_id", msg.sender_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      router.push({ pathname: "/red-envelope/[id]", params: { id: data.id } });
    }
  }

  function getReplyPreview(msgId: string | null | undefined): string | null {
    if (!msgId) return null;
    const found = messages.find((m) => m.id === msgId);
    return found?.encrypted_content || null;
  }

  function shouldShowTail(index: number): boolean {
    if (index === 0) return true;
    const current = messages[index];
    const prev = messages[index - 1];
    return current.sender_id !== prev.sender_id;
  }

  function shouldShowName(index: number): boolean {
    if (!chatInfo?.is_group) return false;
    return shouldShowTail(index);
  }

  function shouldShowDate(index: number): boolean {
    if (index === messages.length - 1) return true;
    const current = new Date(messages[index].sent_at);
    const next = new Date(messages[index + 1].sent_at);
    return current.toDateString() !== next.toDateString();
  }

  const headerTitle = chatInfo?.is_group || chatInfo?.is_channel ? chatInfo.name || "Group" : chatInfo?.other_name || "Chat";
  const headerAvatar = chatInfo?.is_group || chatInfo?.is_channel ? chatInfo?.avatar_url : chatInfo?.other_avatar;

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender_id === user?.id;
    const showDate = shouldShowDate(index);

    return (
      <View>
        {showDate && (
          <View style={st.dateBadge}>
            <Text style={[st.dateBadgeText, { color: colors.textMuted }]}>{formatDateHeader(item.sent_at)}</Text>
          </View>
        )}
        <MessageBubble
          msg={item}
          isMe={isMe}
          showTail={shouldShowTail(index)}
          showName={shouldShowName(index)}
          onLongPress={(m) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowReactions(m); }}
          onReply={(m) => setReplyTo(m)}
          replyPreview={getReplyPreview(item.reply_to_message_id)}
          onTapEnvelope={handleTapEnvelope}
          onTapGift={handleTapGift}
        />
      </View>
    );
  }, [messages, user, colors]);

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <View style={[st.header, { backgroundColor: colors.surface, paddingTop: insets.top + 4, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={st.headerProfile}
          activeOpacity={0.7}
          onPress={() => {
            if (chatInfo && !chatInfo.is_group && !chatInfo.is_channel && chatInfo.other_id) {
              router.push({ pathname: "/profile/[id]", params: { id: chatInfo.other_id } });
            }
          }}
        >
          <Avatar uri={headerAvatar} name={headerTitle} size={38} />
          <View style={st.headerInfo}>
            <Text style={[st.headerName, { color: colors.text }]} numberOfLines={1}>{headerTitle}</Text>
            {typingUsers.length > 0 ? (
              <Text style={[st.headerSub, { color: BRAND }]}>
                {typingUsers.join(", ")} typing...
              </Text>
            ) : !networkOnline ? (
              <Text style={[st.headerSub, { color: "#FF9500" }]}>Waiting for network...</Text>
            ) : (
              <Text style={[st.headerSub, { color: colors.textMuted }]}>
                {chatInfo?.is_group ? "Group chat" : "Online"}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { loadGifts(); setShowGiftPicker(true); }} style={st.headerAction} hitSlop={8}>
          <Ionicons name="gift-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowRedEnvelope(true)} style={st.headerAction} hitSlop={8}>
          <Text style={{ fontSize: 20 }}>🧧</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
        {loading ? (
          <View style={st.loadingCenter}>
            <ActivityIndicator color={BRAND} size="large" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={st.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {replyTo && (
          <View style={[st.replyBanner, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <View style={[st.replyBarAccent, { backgroundColor: BRAND }]} />
            <View style={{ flex: 1 }}>
              <Text style={[st.replyBannerName, { color: BRAND }]}>{replyTo.sender?.display_name || "Message"}</Text>
              <Text style={[st.replyBannerText, { color: colors.textSecondary }]} numberOfLines={1}>{replyTo.encrypted_content}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {attachmentPreview && (
          <View style={[st.attachPreviewBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            {(attachmentPreview.type === "image" || attachmentPreview.type === "video") ? (
              <Image source={{ uri: attachmentPreview.uri }} style={st.attachPreviewImg} />
            ) : (
              <View style={[st.attachPreviewFile, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="document" size={20} color={BRAND} />
                <Text style={[st.attachPreviewName, { color: colors.text }]} numberOfLines={1}>{attachmentPreview.name || "File"}</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setAttachmentPreview(null)} style={st.attachPreviewClose} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {messageLimited ? (
          <View style={[st.limitedBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Ionicons name="lock-closed" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
            <Text style={[st.limitedText, { color: colors.textSecondary }]}>
              You can send more messages once {chatInfo?.other_name || "this user"} replies or follows you
            </Text>
          </View>
        ) : (
          <View style={[st.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
            <TouchableOpacity onPress={() => setShowAttachMenu(true)} style={st.inputAction} hitSlop={6}>
              <Ionicons name="add-circle" size={28} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={[st.inputField, { backgroundColor: colors.inputBg }]}>
              <TextInput
                style={[st.input, { color: colors.text }]}
                placeholder="Message"
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={(t) => { setInput(t); handleTyping(); }}
                multiline
                maxLength={4000}
              />
            </View>
            {(input.trim() || attachmentPreview) ? (
              <TouchableOpacity
                onPress={attachmentPreview ? sendAttachment : sendMessage}
                disabled={sending}
                style={[st.sendBtn, { backgroundColor: BRAND }]}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => {}} style={st.inputAction} hitSlop={6}>
                <Ionicons name="mic" size={26} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      <BottomSheet visible={!!showReactions} onClose={() => setShowReactions(null)}>
        <View style={st.reactionPicker}>
          {REACTION_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={[st.reactionOption, { backgroundColor: colors.inputBg }]}
              onPress={() => showReactions && addReaction(showReactions, emoji)}
            >
              <Text style={st.reactionOptionEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={st.sheetActionRow} onPress={() => { if (showReactions) { setReplyTo(showReactions); setShowReactions(null); } }}>
          <Ionicons name="arrow-undo" size={20} color={colors.text} />
          <Text style={[st.sheetActionText, { color: colors.text }]}>Reply</Text>
        </TouchableOpacity>
      </BottomSheet>

      <BottomSheet visible={showRedEnvelope} onClose={() => setShowRedEnvelope(false)}>
        <Text style={[st.sheetTitle, { color: colors.text }]}>🧧 Red Envelope</Text>
        <TextInput
          style={[st.sheetInput, { color: colors.text, backgroundColor: colors.inputBg }]}
          placeholder="Amount (ACoin)"
          placeholderTextColor={colors.textMuted}
          value={envelopeAmount}
          onChangeText={setEnvelopeAmount}
          keyboardType="number-pad"
        />
        <TextInput
          style={[st.sheetInput, { color: colors.text, backgroundColor: colors.inputBg }]}
          placeholder="Message (optional)"
          placeholderTextColor={colors.textMuted}
          value={envelopeMsg}
          onChangeText={setEnvelopeMsg}
        />
        {chatInfo?.is_group && (
          <TextInput
            style={[st.sheetInput, { color: colors.text, backgroundColor: colors.inputBg }]}
            placeholder="How many can claim?"
            placeholderTextColor={colors.textMuted}
            value={envelopeCount}
            onChangeText={setEnvelopeCount}
            keyboardType="number-pad"
          />
        )}
        <TouchableOpacity style={st.redEnvBtn} onPress={sendRedEnvelope}>
          <Text style={st.redEnvBtnText}>Send Red Envelope</Text>
        </TouchableOpacity>
      </BottomSheet>

      <BottomSheet visible={showGiftPicker} onClose={() => setShowGiftPicker(false)}>
        <Text style={[st.sheetTitle, { color: colors.text }]}>🎁 Send a Gift</Text>
        <TextInput
          style={[st.sheetInput, { color: colors.text, backgroundColor: colors.inputBg }]}
          placeholder="Add a message (optional)"
          placeholderTextColor={colors.textMuted}
          value={giftMsg}
          onChangeText={setGiftMsg}
        />
        <ScrollView horizontal={false} style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
          <View style={st.giftGrid}>
            {gifts.map((gift) => (
              <TouchableOpacity
                key={gift.id}
                style={[st.giftItem, { backgroundColor: colors.inputBg }]}
                onPress={() => sendGift(gift)}
                disabled={giftSending}
              >
                <Text style={st.giftEmoji}>{gift.emoji}</Text>
                <Text style={[st.giftName, { color: colors.text }]} numberOfLines={1}>{gift.name}</Text>
                <Text style={[st.giftCost, { color: Colors.gold }]}>{gift.acoin_price ?? gift.base_xp_cost} ACoin</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        {giftSending && <ActivityIndicator color={BRAND} style={{ marginTop: 8 }} />}
      </BottomSheet>

      <BottomSheet visible={showAttachMenu} onClose={() => setShowAttachMenu(false)}>
        <Text style={[st.sheetTitle, { color: colors.text }]}>Share</Text>
        <View style={st.attachGrid}>
          <TouchableOpacity style={[st.attachOption, { backgroundColor: colors.inputBg }]} onPress={pickFromCamera}>
            <View style={[st.attachIconBg, { backgroundColor: "#FF6B35" }]}>
              <Ionicons name="camera" size={24} color="#fff" />
            </View>
            <Text style={[st.attachLabel, { color: colors.text }]}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.attachOption, { backgroundColor: colors.inputBg }]} onPress={pickFromGallery}>
            <View style={[st.attachIconBg, { backgroundColor: "#8B5CF6" }]}>
              <Ionicons name="images" size={24} color="#fff" />
            </View>
            <Text style={[st.attachLabel, { color: colors.text }]}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.attachOption, { backgroundColor: colors.inputBg }]} onPress={pickDocument}>
            <View style={[st.attachIconBg, { backgroundColor: "#3B82F6" }]}>
              <Ionicons name="document" size={24} color="#fff" />
            </View>
            <Text style={[st.attachLabel, { color: colors.text }]}>File</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.attachOption, { backgroundColor: colors.inputBg }]} onPress={() => { setShowAttachMenu(false); setShowGifPicker(true); }}>
            <View style={[st.attachIconBg, { backgroundColor: BRAND }]}>
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" }}>GIF</Text>
            </View>
            <Text style={[st.attachLabel, { color: colors.text }]}>GIF</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={showGifPicker} onClose={() => { setShowGifPicker(false); setGifSearch(""); }}>
        <Text style={[st.sheetTitle, { color: colors.text }]}>Send GIF</Text>
        <TextInput
          style={[st.sheetInput, { color: colors.text, backgroundColor: colors.inputBg }]}
          placeholder="Search GIFs..."
          placeholderTextColor={colors.textMuted}
          value={gifSearch}
          onChangeText={setGifSearch}
        />
        <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
          <View style={st.gifGrid}>
            {[
              { label: "Thumbs Up", url: "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif" },
              { label: "Laughing", url: "https://media.giphy.com/media/ZqlvCTNHpqrio/giphy.gif" },
              { label: "Love", url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif" },
              { label: "Dancing", url: "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif" },
              { label: "Clapping", url: "https://media.giphy.com/media/7rj2ZgttvgomY/giphy.gif" },
              { label: "Mind Blown", url: "https://media.giphy.com/media/xT0xeJpnrWC3XWblEk/giphy.gif" },
              { label: "Celebrate", url: "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif" },
              { label: "High Five", url: "https://media.giphy.com/media/3oEjHV0z8S7WM4MwnK/giphy.gif" },
              { label: "Crying", url: "https://media.giphy.com/media/d2lcHJTG5Tscg/giphy.gif" },
              { label: "Fire", url: "https://media.giphy.com/media/l4FATJpd4LWgeruTK/giphy.gif" },
              { label: "Cool", url: "https://media.giphy.com/media/62PP2yEIAZF6g/giphy.gif" },
              { label: "Wave", url: "https://media.giphy.com/media/ASd0Ukj0y3qMM/giphy.gif" },
            ]
              .filter((g) => !gifSearch || g.label.toLowerCase().includes(gifSearch.toLowerCase()))
              .map((gif) => (
                <TouchableOpacity key={gif.label} style={st.gifItem} onPress={() => sendGifMessage(gif.url)} activeOpacity={0.7}>
                  <Image source={{ uri: gif.url }} style={st.gifThumb} resizeMode="cover" />
                  <Text style={[st.gifLabel, { color: colors.textSecondary }]}>{gif.label}</Text>
                </TouchableOpacity>
              ))}
          </View>
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={!!giftReveal} onClose={() => setGiftReveal(null)}>
        <View style={st.giftRevealContent}>
          <Text style={st.giftRevealEmoji}>🎁</Text>
          <Text style={[st.giftRevealTitle, { color: colors.text }]}>
            {giftReveal?.isReceiver ? "Gift Received!" : "Gift Sent!"}
          </Text>
          <Text style={[st.giftRevealDetail, { color: colors.textSecondary }]}>{giftReveal?.content}</Text>
          {giftReveal?.isReceiver && (
            <Text style={[st.giftRevealNote, { color: colors.textMuted }]}>This gift has been added to your Gift Gallery</Text>
          )}
          {giftReveal?.isReceiver ? (
            <TouchableOpacity style={st.giftRevealBtn} onPress={() => { setGiftReveal(null); router.push("/gifts"); }}>
              <Text style={st.giftRevealBtnText}>View Gift Gallery</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={st.giftRevealBtn} onPress={() => setGiftReveal(null)}>
              <Text style={st.giftRevealBtnText}>Awesome!</Text>
            </TouchableOpacity>
          )}
        </View>
      </BottomSheet>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  backBtn: { padding: 6 },
  headerProfile: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  headerAction: { padding: 6 },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingVertical: 8 },

  dateBadge: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginVertical: 8,
  },
  dateBadgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  msgRow: { flexDirection: "row", paddingHorizontal: 6, marginVertical: 1 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },

  bubbleContainer: { maxWidth: "78%", position: "relative" },
  bubbleContainerMe: { alignItems: "flex-end" },
  bubbleContainerOther: { alignItems: "flex-start" },

  tailMe: { position: "absolute", right: -6, bottom: 0, zIndex: 1 },
  tailOther: { position: "absolute", left: -6, bottom: 0, zIndex: 1 },

  bubble: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    borderRadius: 16,
    minWidth: 64,
  },
  bubbleMe: {
    borderBottomRightRadius: 16,
  },
  bubbleOther: {
    borderBottomLeftRadius: 16,
  },
  bubbleTailMe: {
    borderBottomRightRadius: 4,
  },
  bubbleTailOther: {
    borderBottomLeftRadius: 4,
  },

  senderName: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 2 },

  replyPreview: { flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4, gap: 6 },
  replyBarLine: { width: 3, height: "100%", borderRadius: 2, minHeight: 16 },
  replyPreviewText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  bubbleText: { fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 21 },

  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 2, gap: 2 },
  msgTime: { fontSize: 11, fontFamily: "Inter_400Regular" },

  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: -4,
    zIndex: 2,
  },
  reactionsMe: { justifyContent: "flex-end", paddingRight: 8 },
  reactionsOther: { justifyContent: "flex-start", paddingLeft: 8 },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(128,128,128,0.12)",
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "transparent",
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  attachImage: { width: 220, height: 180, borderRadius: 10 },
  attachVideo: { width: 220, height: 180, borderRadius: 10, overflow: "hidden", backgroundColor: "#0D0D0D" },
  audioRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 180 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 260 },
  fileIconBg: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  fileName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  fileMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  replyBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  replyBarAccent: { width: 3, height: 32, borderRadius: 2 },
  replyBannerName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyBannerText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  attachPreviewBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  attachPreviewImg: { width: 56, height: 56, borderRadius: 10 },
  attachPreviewFile: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  attachPreviewName: { fontSize: 13, fontFamily: "Inter_500Medium", maxWidth: 160 },
  attachPreviewClose: { marginLeft: "auto" },

  limitedBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  limitedText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 18,
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  inputAction: { paddingBottom: 6, paddingHorizontal: 4 },
  inputField: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, maxHeight: 120 },
  input: { fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 22 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 4 },

  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetContent: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14, maxHeight: SCREEN_HEIGHT * 0.7 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#CCC", alignSelf: "center", marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  sheetInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },

  reactionPicker: { flexDirection: "row", justifyContent: "center", paddingVertical: 8, gap: 6 },
  reactionOption: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  reactionOptionEmoji: { fontSize: 24 },

  sheetActionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  sheetActionText: { fontSize: 16, fontFamily: "Inter_500Medium" },

  redEnvBubble: { width: 240, borderRadius: 12, overflow: "hidden" },
  redEnvTop: { backgroundColor: "#FF3B30", flexDirection: "row", padding: 14, gap: 10, alignItems: "center" },
  redEnvEmoji: { fontSize: 32 },
  redEnvTitle: { color: "#fff", fontSize: 15, fontFamily: "Inter_500Medium" },
  redEnvSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  redEnvBottom: { backgroundColor: "#E63329", paddingHorizontal: 14, paddingVertical: 6 },
  redEnvLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "Inter_400Regular" },
  redEnvBtn: { backgroundColor: "#FF3B30", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  redEnvBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  giftBoxBubble: { width: 240, borderRadius: 12, overflow: "hidden" },
  giftBoxTop: { backgroundColor: BRAND, flexDirection: "row", padding: 14, gap: 10, alignItems: "center" },
  giftBoxEmoji: { fontSize: 32 },
  giftBoxTitle: { color: "#fff", fontSize: 14, fontFamily: "Inter_500Medium" },
  giftBoxSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  giftBoxBottom: { backgroundColor: Colors.brandDark, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center" },
  giftBoxOpen: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },

  giftGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  giftItem: { width: "30%", borderRadius: 12, padding: 10, alignItems: "center", gap: 4 },
  giftEmoji: { fontSize: 32 },
  giftName: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  giftCost: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  giftRevealContent: { alignItems: "center", paddingVertical: 20, gap: 12 },
  giftRevealEmoji: { fontSize: 64 },
  giftRevealTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  giftRevealDetail: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center" },
  giftRevealNote: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  giftRevealBtn: { backgroundColor: BRAND, borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, marginTop: 8 },
  giftRevealBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  attachGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", paddingVertical: 8 },
  attachOption: { width: 72, alignItems: "center", gap: 6, paddingVertical: 12, borderRadius: 14 },
  attachIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  attachLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },

  gifGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gifItem: { width: "31%", alignItems: "center", gap: 4 },
  gifThumb: { width: "100%", height: 80, borderRadius: 10 },
  gifLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
