import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import * as Haptics from "@/lib/haptics";
import { ImageViewer, useImageViewer } from "@/components/ImageViewer";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Video, ResizeMode } from "expo-av";
import Svg, { Path } from "react-native-svg";
import { ChatLoadingSkeleton } from "@/components/ui/Skeleton";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useGiftPrices } from "@/hooks/useGiftPrices";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
import { showAlert } from "@/lib/alert";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { notifyNewMessage, notifyGiftReceived } from "@/lib/notifyUser";
import {
  cacheMessages,
  getCachedMessages,
  queueMessage,
  isOnline,
  onConnectivityChange,
} from "@/lib/offlineStore";
import { uploadChatMedia } from "@/lib/mediaUpload";
import { syncPendingMessages } from "@/lib/offlineSync";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { translateText, LANG_LABELS } from "@/lib/translate";
import { useLanguage } from "@/context/LanguageContext";
import { askAi, aiSuggestReply } from "@/lib/aiHelper";

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
  is_verified?: boolean;
  is_organization_verified?: boolean;
  other_last_seen?: string | null;
};

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const SCREEN_HEIGHT = Dimensions.get("window").height;
const BRAND = Colors.brand;

function formatLastSeen(ts: string | null | undefined): { text: string; isOnline: boolean } {
  if (!ts) return { text: "Offline", isOnline: false };
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 2 * 60 * 1000) return { text: "Online", isOnline: true };
  if (diff < 60 * 60 * 1000) return { text: `Last seen ${Math.floor(diff / 60000)}m ago`, isOnline: false };
  if (diff < 24 * 60 * 60 * 1000) return { text: `Last seen ${Math.floor(diff / 3600000)}h ago`, isOnline: false };
  return { text: `Last seen ${new Date(ts).toLocaleDateString()}`, isOnline: false };
}

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

function PremiumBubbleShimmer() {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.delay(3800),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-80, 220] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, overflow: "hidden" }}
    >
      <Animated.View style={{ position: "absolute", top: 0, bottom: 0, width: 70, transform: [{ translateX }] }}>
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.22)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </Animated.View>
  );
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

const SMART_REPLIES: Record<string, string[]> = {
  question:  ["Sure!", "Let me check", "Tell me more!"],
  greeting:  ["Hey! 👋", "Hello!", "What's up?"],
  howAreYou: ["I'm great! 😊", "Doing well!", "Pretty good, you?"],
  thanks:    ["You're welcome!", "No problem!", "Anytime 😊"],
  love:      ["❤️", "That's sweet!", "Aww!"],
  okay:      ["Perfect!", "Sounds good!", "Got it 👍"],
  bye:       ["Bye! 👋", "See ya!", "Take care!"],
  miss:      ["Miss you too! 💙", "Same here!", "Come visit!"],
  agree:     ["Totally!", "100%", "Exactly!"],
  default:   ["👍", "Got it!", "Sounds good!"],
};

function getSmartReplies(text: string): string[] {
  const t = text.toLowerCase();
  if (t.endsWith("?") || /\bright\?|isn't it|correct\?/.test(t)) return SMART_REPLIES.question;
  if (/\b(hi|hey|hello|howdy|hiya|sup)\b/.test(t)) return SMART_REPLIES.greeting;
  if (/how (are|r) you|how's it going|how are things|hows life/.test(t)) return SMART_REPLIES.howAreYou;
  if (/thank|thanks|ty\b|thx/.test(t)) return SMART_REPLIES.thanks;
  if (/love|❤|💕|💙|💗|adore/.test(t)) return SMART_REPLIES.love;
  if (/\b(ok|okay|sure|alright|fine|k\b)\b/.test(t)) return SMART_REPLIES.okay;
  if (/\b(bye|goodbye|gtg|cya|see ya|ttyl)\b/.test(t)) return SMART_REPLIES.bye;
  if (/miss (you|u)\b/.test(t)) return SMART_REPLIES.miss;
  if (/agree|same|exactly|totally/.test(t)) return SMART_REPLIES.agree;
  return SMART_REPLIES.default;
}

function SmartReplyBar({ messages, myId, input, onSend, colors }: {
  messages: Message[];
  myId: string;
  input: string;
  onSend: (text: string) => void;
  colors: any;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lastOtherMsg = messages.find((m) => m.sender_id !== myId && !m._pending);
  const replies = lastOtherMsg ? getSmartReplies(lastOtherMsg.encrypted_content) : [];
  const show = replies.length > 0 && !input.trim();

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: show ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [show]);

  if (!lastOtherMsg) return null;

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        flexDirection: "row",
        paddingHorizontal: 12,
        paddingTop: 6,
        paddingBottom: 2,
        gap: 8,
        flexWrap: "wrap",
        borderTopWidth: show ? StyleSheet.hairlineWidth : 0,
        borderTopColor: colors.border,
      }}
      pointerEvents={show ? "auto" : "none"}
    >
      {replies.map((r) => (
        <TouchableOpacity
          key={r}
          onPress={() => onSend(r)}
          style={{
            backgroundColor: colors.inputBg,
            borderColor: BRAND + "60",
            borderWidth: 1,
            borderRadius: 18,
            paddingHorizontal: 13,
            paddingVertical: 7,
          }}
          activeOpacity={0.7}
        >
          <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_500Medium" }}>{r}</Text>
        </TouchableOpacity>
      ))}
    </Animated.View>
  );
}

function TypingBubble({ names, colors }: { names: string[]; colors: any }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -5, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ])
      );
    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 150);
    const a3 = bounce(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
      <View style={[{ backgroundColor: colors.bubbleIncoming, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 10, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 10 }]}>
        <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: colors.bubbleIncomingText === "#FFFFFF" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.35)",
                transform: [{ translateY: dot }],
              }}
            />
          ))}
        </View>
        {names.length > 0 && (
          <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" }}>
            {names.join(", ")} {names.length === 1 ? "is" : "are"} typing
          </Text>
        )}
      </View>
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

function MessageBubble({ msg, isMe, showTail, showName, onLongPress, onReply, replyPreview, onTapEnvelope, onTapGift, onImageTap, isPremiumSender }: {
  msg: Message;
  isMe: boolean;
  showTail: boolean;
  showName: boolean;
  onLongPress: (msg: Message) => void;
  onReply: (msg: Message) => void;
  replyPreview?: string | null;
  onTapEnvelope?: (msg: Message) => void;
  onTapGift?: (msg: Message) => void;
  onImageTap?: (images: string[], index: number) => void;
  isPremiumSender?: boolean;
}) {
  const { colors } = useTheme();
  const { preferredLang } = useLanguage();
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);

  const isSpecial =
    msg.encrypted_content?.startsWith("🧧") ||
    msg.encrypted_content?.startsWith("🎁") ||
    ["📷 Photo", "🎥 Video", "GIF"].includes(msg.encrypted_content ?? "");

  const canTranslate = !isMe && !!msg.encrypted_content && !isSpecial && !!preferredLang;

  useEffect(() => {
    if (!canTranslate || !preferredLang) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      translateText(msg.encrypted_content, preferredLang).then((result) => {
        if (!cancelled && result && result !== msg.encrypted_content) {
          setTranslated(result);
          setShowTranslated(true);
        }
      });
    }, Math.random() * 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [canTranslate, preferredLang, msg.encrypted_content]);

  async function handleTranslate() {
    if (showTranslated) { setShowTranslated(false); return; }
    if (translated) { setShowTranslated(true); return; }
    setTranslating(true);
    const result = await translateText(msg.encrypted_content, preferredLang || "en");
    if (result && result !== msg.encrypted_content) {
      setTranslated(result);
      setShowTranslated(true);
    }
    setTranslating(false);
  }

  const displayText = showTranslated && translated ? translated : msg.encrypted_content;

  const isRedEnvelope = msg.encrypted_content.startsWith("🧧");
  const isGiftMsg = msg.encrypted_content.startsWith("🎁");
  const meBubbleColor = BRAND;
  const otherBubbleColor = colors.bubbleIncoming;
  const bubbleColor = isMe ? meBubbleColor : otherBubbleColor;
  const textColor = isMe ? "#FFFFFF" : colors.bubbleIncomingText;
  const isPending = msg._pending || msg.status === "sending";

  const slideX = useRef(new Animated.Value(isMe ? 18 : -18)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideX, { toValue: 0, tension: 100, friction: 11, useNativeDriver: true }),
      Animated.timing(fadeIn, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, []);

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
    <Animated.View style={[st.msgRow, isMe ? st.msgRowMe : st.msgRowOther, { transform: [{ translateX: slideX }], opacity: fadeIn }]}>
      <View style={[st.bubbleContainer, isMe ? st.bubbleContainerMe : st.bubbleContainerOther]}>
        {showTail && <BubbleTail isMe={isMe} color={bubbleColor} />}

        <View style={[
          st.bubble,
          { backgroundColor: bubbleColor },
          isMe ? st.bubbleMe : st.bubbleOther,
          showTail ? (isMe ? st.bubbleTailMe : st.bubbleTailOther) : null,
          isPending && { opacity: 0.6 },
        ]}>
          {isPremiumSender && <PremiumBubbleShimmer />}
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
            <TouchableOpacity
              onPress={() => onImageTap?.([msg.attachment_url!], 0)}
              onLongPress={() => onLongPress(msg)}
              delayLongPress={300}
              activeOpacity={0.9}
            >
              <Image source={{ uri: msg.attachment_url! }} style={st.attachImage} resizeMode="cover" />
              {hasTextContent && (
                <RichText style={[st.bubbleText, { color: textColor, marginTop: 6 }]} linkColor={isMe ? "#FFFFFF" : "#00C2CB"}>{displayText}</RichText>
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
                <Text style={[st.fileName, { color: textColor }]} numberOfLines={2}>{displayText}</Text>
                <Text style={[st.fileMeta, { color: isMe ? "rgba(255,255,255,0.6)" : colors.textMuted }]}>Document</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onLongPress={() => onLongPress(msg)} delayLongPress={300} activeOpacity={0.9}>
              <RichText style={[st.bubbleText, { color: textColor }]} linkColor={isMe ? "#FFFFFF" : "#00C2CB"}>{displayText}</RichText>
            </TouchableOpacity>
          )}

          {/* Translate chip — shown on incoming messages when translation is enabled */}
          {canTranslate && (
            <TouchableOpacity
              onPress={handleTranslate}
              style={[st.translateChip, { backgroundColor: isMe ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)" }]}
              hitSlop={8}
            >
              {translating ? (
                <ActivityIndicator size={10} color={colors.textMuted} style={{ marginRight: 3 }} />
              ) : (
                <Ionicons name="language" size={11} color={showTranslated ? BRAND : colors.textMuted} style={{ marginRight: 3 }} />
              )}
              <Text style={[st.translateChipText, { color: showTranslated ? BRAND : colors.textMuted }]}>
                {translating
                  ? "Translating…"
                  : showTranslated
                  ? `Original · ${LANG_LABELS[preferredLang || "en"] ?? preferredLang}`
                  : `Translate · ${LANG_LABELS[preferredLang || "en"] ?? preferredLang}`}
              </Text>
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
    </Animated.View>
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
  const { user, profile, isPremium } = useAuth();
  const { colors } = useTheme();
  const { statsMap, getDynamicPrice } = useGiftPrices();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(!isDraft);
  const [sending, setSending] = useState(false);
  const imgViewer = useImageViewer();
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
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [forwardChats, setForwardChats] = useState<{ id: string; name: string; avatar: string | null }[]>([]);
  const [forwardSending, setForwardSending] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiResultType, setAiResultType] = useState<"summary" | "replies" | "translate" | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReplies, setAiReplies] = useState<string[]>([]);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [translateMsg, setTranslateMsg] = useState<Message | null>(null);
  const [translatingLang, setTranslatingLang] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeout = useRef<any>(null);
  const draftSaveTimer = useRef<any>(null);

  const effectiveChatId = isDraft ? realChatId : id;

  const loadChatInfo = useCallback(async () => {
    if (!id || !user || isDraft) return;
    const { data: chat } = await supabase
      .from("chats")
      .select(`is_group, is_channel, name, avatar_url, chat_members(user_id, profiles(id, display_name, avatar_url, handle, is_verified, is_organization_verified, last_seen, show_online_status))`)
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
        is_verified: !!other?.is_verified,
        is_organization_verified: !!other?.is_organization_verified,
        other_last_seen: other?.show_online_status !== false ? (other?.last_seen || null) : null,
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
      const deliveredSet = new Set<string>();
      for (const s of (statuses || []) as any[]) {
        if (s.read_at) readSet.add(s.message_id);
        else if (s.delivered_at) deliveredSet.add(s.message_id);
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
          ? (readSet.has(m.id) ? "read" : deliveredSet.has(m.id) ? "delivered" : "sent")
          : undefined,
      }));

      setMessages(mapped);
      cacheMessages(chatId, mapped);

      const unreadFromOthers = data.filter((m: any) => m.sender_id !== user.id);
      if (unreadFromOthers.length > 0) {
        const now = new Date().toISOString();
        const unreadIds = unreadFromOthers.map((m: any) => m.id);
        const { data: myReadRows } = unreadIds.length > 0
          ? await supabase.from("message_status").select("message_id").eq("user_id", user.id).not("read_at", "is", null).in("message_id", unreadIds)
          : { data: [] };
        const alreadyRead = new Set((myReadRows || []).map((r: any) => r.message_id));
        const toMark = unreadFromOthers.filter((m: any) => !alreadyRead.has(m.id));
        if (toMark.length > 0) {
          await supabase.from("message_status").upsert(
            toMark.map((m: any) => ({
              message_id: m.id,
              user_id: user.id,
              delivered_at: now,
              read_at: now,
            })),
            { onConflict: "message_id,user_id" }
          );
        }
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

  function saveDraft(text: string) {
    if (!id) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      if (user && id) {
        if (text.trim()) {
          supabase.from("chat_drafts")
            .upsert({ user_id: user.id, chat_id: id, content: text, updated_at: new Date().toISOString() }, { onConflict: "user_id,chat_id" })
            .then(({ error }) => { if (error) AsyncStorage.setItem(`chat_draft_${id}`, text).catch(() => {}); });
        } else {
          supabase.from("chat_drafts")
            .delete().eq("user_id", user.id).eq("chat_id", id)
            .then(({ error }) => { if (error) AsyncStorage.removeItem(`chat_draft_${id}`).catch(() => {}); });
        }
      } else if (id) {
        const key = `chat_draft_${id}`;
        if (text.trim()) { AsyncStorage.setItem(key, text).catch(() => {}); }
        else { AsyncStorage.removeItem(key).catch(() => {}); }
      }
    }, 800);
  }

  useEffect(() => {
    if (!id) return;
    if (user) {
      supabase.from("chat_drafts")
        .select("content").eq("user_id", user.id).eq("chat_id", id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.content) { setInput(data.content); }
          else { AsyncStorage.getItem(`chat_draft_${id}`).then((draft) => { if (draft) setInput(draft); }).catch(() => {}); }
        })
        .catch(() => { AsyncStorage.getItem(`chat_draft_${id}`).then((draft) => { if (draft) setInput(draft); }).catch(() => {}); });
    } else {
      AsyncStorage.getItem(`chat_draft_${id}`).then((draft) => { if (draft) setInput(draft); }).catch(() => {});
    }
  }, [id, user?.id]);

  function handleSmartReply(text: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage(text);
  }

  async function handleAiSummarize(msg: Message) {
    if (aiLoading) return;
    setAiLoading(true);
    setAiResult(null);
    setAiResultType("summary");
    setAiReplies([]);
    try {
      const result = await askAi(
        `Summarize this message in 1-2 concise sentences. Keep the key points:\n\n${msg.encrypted_content}`,
        "You are a message summarizer. Return ONLY a brief summary. No quotes, no prefixes.",
        { fast: true, maxTokens: 150 }
      );
      setAiResult(result);
    } catch {
      setAiResult("Could not generate summary. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAiSuggestReply() {
    if (aiLoading || messages.length < 1) return;
    setAiLoading(true);
    setAiResult(null);
    setAiResultType("replies");
    setAiReplies([]);
    try {
      const recent = messages.slice(0, 10).reverse();
      const formatted = recent.map((m) => ({
        sender: m.sender_id === user?.id ? "Me" : chatInfo?.other_name || "Them",
        content: m.encrypted_content,
        isMe: m.sender_id === user?.id,
      }));
      const myName = user?.user_metadata?.display_name || "Me";
      const result = await aiSuggestReply(formatted, myName);
      setAiReplies(result);
    } catch {
      setAiReplies(["Could not generate replies. Tap to try again."]);
    } finally {
      setAiLoading(false);
    }
  }

  function openTranslatePicker(msg: Message) {
    setTranslateMsg(msg);
    setShowLangPicker(true);
    setShowReactions(null);
    setAiResult(null);
    setAiResultType(null);
    setAiReplies([]);
  }

  async function handleTranslateToLang(langCode: string) {
    if (!translateMsg || translatingLang) return;
    setTranslatingLang(true);
    setAiResultType("translate");
    setAiResult(null);
    try {
      const result = await translateText(translateMsg.encrypted_content, langCode);
      setAiResult(result);
    } catch {
      setAiResult("Could not translate. Please try again.");
    } finally {
      setTranslatingLang(false);
    }
  }

  async function openForward(msg: Message) {
    setForwardMsg(msg);
    const { data } = await supabase
      .from("chats")
      .select("id, name, avatar_url, chat_members!inner(user_id), profiles!chats_created_by_fkey(display_name, avatar_url)")
      .eq("chat_members.user_id", user?.id || "")
      .order("updated_at", { ascending: false })
      .limit(30);
    const mapped = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name || c.profiles?.display_name || "Chat",
      avatar: c.avatar_url || c.profiles?.avatar_url || null,
    }));
    setForwardChats(mapped);
  }

  async function sendForward(targetChatId: string) {
    if (!forwardMsg || !user) return;
    setForwardSending(true);
    await supabase.from("messages").insert({
      chat_id: targetChatId,
      sender_id: user.id,
      encrypted_content: `↪ Forwarded\n${forwardMsg.encrypted_content}`,
    });
    setForwardSending(false);
    setForwardMsg(null);
    setForwardChats([]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  async function sendMessage(directText?: string) {
    const text = (directText ?? input).trim();
    if (!text || !user || sending) return;
    if (messageLimited) {
      showAlert("Message limit", `You can only send one message until ${chatInfo?.other_name || "this user"} replies or follows you.`);
      return;
    }
    setSending(true);
    if (!directText) setInput("");
    if (id) {
      AsyncStorage.removeItem(`chat_draft_${id}`).catch(() => {});
      if (user) { supabase.from("chat_drafts").delete().eq("user_id", user.id).eq("chat_id", id).then(() => {}); }
    }
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
    if (data) {
      setGifts(data.map((g: any) => ({
        ...g,
        acoin_price: getDynamicPrice(g.id, g.base_xp_cost),
      })));
    }
  }

  useEffect(() => {
    if (gifts.length > 0) {
      setGifts((prev) =>
        prev.map((g) => ({
          ...g,
          acoin_price: getDynamicPrice(g.id, g.base_xp_cost),
        }))
      );
    }
  }, [statsMap]);

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

    const { data: currentStats } = await supabase
      .from("gift_statistics")
      .select("price_multiplier, total_sent, last_sale_price")
      .eq("gift_id", gift.id)
      .maybeSingle();

    const currentMultiplier = currentStats ? parseFloat(String(currentStats.price_multiplier)) : 1;
    const currentSent = currentStats?.total_sent || 0;
    const newMultiplier = Math.min(currentMultiplier + 0.01, 3.0);

    await supabase
      .from("gift_statistics")
      .upsert({
        gift_id: gift.id,
        price_multiplier: newMultiplier,
        total_sent: currentSent + 1,
        last_sale_price: currentStats?.last_sale_price ?? null,
        last_updated: new Date().toISOString(),
      }, { onConflict: "gift_id" });

    await supabase.from("messages").insert({
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: `🎁 ${gift.emoji} ${gift.name}${giftMsg ? ` - ${giftMsg}` : ""}|giftId:${gift.id}|receiverId:${receiverId}`,
    });

    notifyGiftReceived({
      recipientId: receiverId,
      senderName: profile?.display_name || "Someone",
      senderUserId: user.id,
      giftName: `${gift.emoji} ${gift.name}`,
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
      const label = attachmentPreview.type === "image" ? "📷 Photo" : attachmentPreview.type === "video" ? "🎥 Video" : `📎 ${attachmentPreview.name || "File"}`;

      const { publicUrl, error: uploadErr } = await uploadChatMedia(
        "chat-media",
        activeChatId,
        user.id,
        attachmentPreview.uri,
        attachmentPreview.name || undefined,
      );

      if (uploadErr || !publicUrl) {
        await supabase.from("messages").insert({ chat_id: activeChatId, sender_id: user.id, encrypted_content: label });
      } else {
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
          onImageTap={imgViewer.openViewer}
          isPremiumSender={isMe && isPremium}
        />
      </View>
    );
  }, [messages, user, colors]);

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <OfflineBanner />
      <View style={[st.header, { backgroundColor: colors.surface, paddingTop: insets.top + 4, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={st.headerProfile}
          activeOpacity={0.7}
          onPress={() => {
            if (chatInfo && !chatInfo.is_group && !chatInfo.is_channel && chatInfo.other_id) {
              router.push({ pathname: "/contact/[id]", params: { id: chatInfo.other_id } });
            }
          }}
        >
          <Avatar uri={headerAvatar} name={headerTitle} size={38} />
          <View style={st.headerInfo}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[st.headerName, { color: colors.text }]} numberOfLines={1}>{headerTitle}</Text>
              <VerifiedBadge isVerified={chatInfo?.is_verified} isOrganizationVerified={chatInfo?.is_organization_verified} size={16} />
            </View>
            {typingUsers.length > 0 ? (
              <Text style={[st.headerSub, { color: BRAND }]}>
                {typingUsers.join(", ")} typing...
              </Text>
            ) : !networkOnline ? (
              <Text style={[st.headerSub, { color: "#FF9500" }]}>Waiting for network...</Text>
            ) : chatInfo?.is_group ? (
              <Text style={[st.headerSub, { color: colors.textMuted }]}>Group chat</Text>
            ) : (() => {
              const ls = formatLastSeen(chatInfo?.other_last_seen);
              return <Text style={[st.headerSub, { color: ls.isOnline ? "#34C759" : colors.textMuted }]}>{ls.text}</Text>;
            })()}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { loadGifts(); setShowGiftPicker(true); }} style={st.headerAction} hitSlop={8}>
          <Ionicons name="gift-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowRedEnvelope(true)} style={st.headerAction} hitSlop={8}>
          <Text style={{ fontSize: 20 }}>🧧</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}>
        {loading ? (
          <ChatLoadingSkeleton />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={st.listContent}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              typingUsers.length > 0 ? <TypingBubble names={typingUsers} colors={colors} /> : null
            }
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
          <>
            {(chatInfo?.is_group || chatInfo?.is_channel) && (
              <SmartReplyBar messages={messages} myId={user?.id || ""} input={input} onSend={handleSmartReply} colors={colors} />
            )}
            <View style={[st.inputBar, { paddingBottom: Math.max(insets.bottom, 4) }]}>
            <TouchableOpacity onPress={() => setShowAttachMenu(true)} style={st.inputAction} hitSlop={8}>
              <Ionicons name="happy-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={[st.inputField, { backgroundColor: colors.inputBg }]}>
              <TextInput
                style={[st.input, { color: colors.text }]}
                placeholder="Message"
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={(t) => { setInput(t); handleTyping(); saveDraft(t); }}
                multiline
                maxLength={4000}
              />
              <TouchableOpacity onPress={() => setShowAttachMenu(true)} hitSlop={8} style={{ paddingHorizontal: 4 }}>
                <Ionicons name="attach" size={20} color={colors.textMuted} style={{ transform: [{ rotate: "-45deg" }] }} />
              </TouchableOpacity>
            </View>
            {(input.trim() || attachmentPreview) ? (
              <TouchableOpacity
                onPress={attachmentPreview ? sendAttachment : () => sendMessage()}
                disabled={sending}
                style={[st.sendBtn, { backgroundColor: BRAND }]}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => {}} style={[st.sendBtn, { backgroundColor: BRAND }]} hitSlop={8}>
                <Ionicons name="mic" size={18} color="#fff" />
              </TouchableOpacity>
            )}
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      <BottomSheet visible={!!showReactions} onClose={() => { setShowReactions(null); setAiResult(null); setAiResultType(null); setAiReplies([]); }}>
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
        <TouchableOpacity
          style={st.sheetActionRow}
          onPress={() => {
            if (showReactions) {
              openForward(showReactions);
              setShowReactions(null);
            }
          }}
        >
          <Ionicons name="arrow-redo" size={20} color={colors.text} />
          <Text style={[st.sheetActionText, { color: colors.text }]}>Forward</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={st.sheetActionRow}
          onPress={() => { if (showReactions) openTranslatePicker(showReactions); }}
        >
          <Ionicons name="language-outline" size={20} color={colors.text} />
          <Text style={[st.sheetActionText, { color: colors.text }]}>Translate</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: "auto" }} />
        </TouchableOpacity>

        {(chatInfo?.is_group || chatInfo?.is_channel) && (
          <>
            <View style={{ height: 1, backgroundColor: colors.border + "50", marginHorizontal: 16, marginVertical: 6 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2 }}>
              <Ionicons name="sparkles" size={12} color={Colors.brand} />
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.brand, textTransform: "uppercase", letterSpacing: 0.5 }}>AI Features</Text>
            </View>
            {showReactions && showReactions.encrypted_content.length >= 500 && (
              <TouchableOpacity
                style={[st.sheetActionRow, { opacity: aiLoading && aiResultType === "summary" ? 0.5 : 1 }]}
                disabled={aiLoading}
                onPress={() => { if (showReactions) handleAiSummarize(showReactions); }}
              >
                <Ionicons name="document-text-outline" size={20} color={Colors.brand} />
                <Text style={[st.sheetActionText, { color: colors.text }]}>Summarize Message</Text>
                {aiLoading && aiResultType === "summary" && <ActivityIndicator color={Colors.brand} size="small" style={{ marginLeft: "auto" }} />}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[st.sheetActionRow, { opacity: aiLoading && aiResultType === "replies" ? 0.5 : 1 }]}
              disabled={aiLoading}
              onPress={handleAiSuggestReply}
            >
              <Ionicons name="chatbubbles-outline" size={20} color="#D4A853" />
              <Text style={[st.sheetActionText, { color: colors.text }]}>Smart Replies</Text>
              {aiLoading && aiResultType === "replies" && <ActivityIndicator color="#D4A853" size="small" style={{ marginLeft: "auto" }} />}
            </TouchableOpacity>

            {aiResult && aiResultType === "summary" && (
              <View style={{ marginHorizontal: 16, marginTop: 6, marginBottom: 8, backgroundColor: Colors.brand + "0A", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.brand + "18" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Ionicons name="sparkles" size={12} color={Colors.brand} />
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.brand, textTransform: "uppercase", letterSpacing: 0.5 }}>Summary</Text>
                </View>
                <Text style={{ fontSize: 14, color: colors.text, fontFamily: "Inter_400Regular", lineHeight: 20 }}>{aiResult}</Text>
              </View>
            )}

            {aiReplies.length > 0 && aiResultType === "replies" && (
              <View style={{ marginHorizontal: 16, marginTop: 6, marginBottom: 8, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <Ionicons name="flash" size={12} color="#D4A853" />
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#D4A853", textTransform: "uppercase", letterSpacing: 0.5 }}>Tap to use</Text>
                </View>
                {aiReplies.map((reply, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => { setInput(reply); setShowReactions(null); setAiResult(null); setAiResultType(null); setAiReplies([]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={{ backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#D4A853" + "25", flexDirection: "row", alignItems: "center", gap: 8 }}
                    activeOpacity={0.6}
                  >
                    <Text style={{ flex: 1, fontSize: 14, color: colors.text, fontFamily: "Inter_400Regular", lineHeight: 19 }}>{reply}</Text>
                    <Ionicons name="arrow-forward-circle" size={16} color="#D4A853" style={{ opacity: 0.5 }} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </BottomSheet>

      <BottomSheet visible={showLangPicker} onClose={() => { setShowLangPicker(false); setTranslateMsg(null); setAiResult(null); setAiResultType(null); }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity onPress={() => { setShowLangPicker(false); setTranslateMsg(null); setAiResult(null); setAiResultType(null); }} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Ionicons name="language-outline" size={20} color={Colors.brand} />
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text }}>Translate to</Text>
          </View>
          {translatingLang && <ActivityIndicator color={Colors.brand} size="small" />}
        </View>
        {translateMsg && (
          <View style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 6, backgroundColor: colors.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted, fontFamily: "Inter_400Regular" }} numberOfLines={2}>{translateMsg.encrypted_content}</Text>
          </View>
        )}
        {aiResult && aiResultType === "translate" && (
          <View style={{ marginHorizontal: 16, marginTop: 6, marginBottom: 6, backgroundColor: Colors.brand + "0A", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.brand + "18" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.brand} />
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.brand, textTransform: "uppercase", letterSpacing: 0.4 }}>Translation</Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.text, fontFamily: "Inter_400Regular", lineHeight: 20 }}>{aiResult}</Text>
          </View>
        )}
        <ScrollView style={{ maxHeight: 320, marginTop: 4 }} showsVerticalScrollIndicator={false} bounces={false}>
          {Object.entries(LANG_LABELS).map(([code, label]) => (
            <TouchableOpacity
              key={code}
              style={{
                flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12,
                borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + "40",
              }}
              onPress={() => handleTranslateToLang(code)}
              disabled={translatingLang}
              activeOpacity={0.6}
            >
              <Text style={{ flex: 1, fontSize: 15, color: colors.text, fontFamily: "Inter_500Medium" }}>{label}</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, fontFamily: "Inter_400Regular" }}>{code.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
      <ImageViewer
        images={imgViewer.images}
        initialIndex={imgViewer.index}
        visible={imgViewer.visible}
        onClose={imgViewer.closeViewer}
      />


      {forwardMsg && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => { setForwardMsg(null); setForwardChats([]); }}
        >
          <View style={[st.forwardOverlay]}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => { setForwardMsg(null); setForwardChats([]); }} />
            <View style={[st.forwardSheet, { backgroundColor: colors.surface }]}>
              <View style={[st.forwardHeader, { borderBottomColor: colors.border }]}>
                <Text style={[st.forwardTitle, { color: colors.text }]}>Forward to…</Text>
                <TouchableOpacity onPress={() => { setForwardMsg(null); setForwardChats([]); }} hitSlop={12}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={[st.forwardPreview, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="arrow-redo-outline" size={14} color={colors.textMuted} style={{ marginTop: 1 }} />
                <Text style={[st.forwardPreviewText, { color: colors.textSecondary }]} numberOfLines={2}>
                  {forwardMsg.encrypted_content}
                </Text>
              </View>
              {forwardChats.length === 0 ? (
                <ActivityIndicator color={BRAND} style={{ marginVertical: 24 }} />
              ) : (
                <FlatList
                  data={forwardChats}
                  keyExtractor={(c) => c.id}
                  style={{ maxHeight: 380 }}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[st.forwardChatRow, { borderBottomColor: colors.border }]}
                      onPress={() => sendForward(item.id)}
                      disabled={forwardSending}
                    >
                      <Avatar uri={item.avatar} name={item.name} size={42} />
                      <Text style={[st.forwardChatName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                      {forwardSending ? (
                        <ActivityIndicator color={BRAND} size="small" />
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </View>
        </Modal>
      )}
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

  translateChip: {
    flexDirection: "row", alignItems: "center", marginTop: 4,
    alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10,
  },
  translateChipText: { fontSize: 10, fontFamily: "Inter_500Medium" },

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
    paddingTop: 2,
    gap: 4,
  },
  inputAction: { paddingBottom: 6 },
  inputField: { flex: 1, flexDirection: "row", alignItems: "flex-end", borderRadius: 20, paddingLeft: 12, paddingRight: 8, paddingVertical: 4, borderWidth: 0 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 20, borderWidth: 0, outlineStyle: "none" as any, paddingVertical: 2, minHeight: 22, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

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

  forwardOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  forwardSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40, overflow: "hidden" },
  forwardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  forwardTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  forwardPreview: { flexDirection: "row", gap: 8, padding: 12, marginHorizontal: 16, marginVertical: 10, borderRadius: 10 },
  forwardPreviewText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  forwardChatRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  forwardChatName: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
});
