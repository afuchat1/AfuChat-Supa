import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Dimensions,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  TouchableOpacity,
  View,
} from "react-native";

const _SW = Dimensions.get("window").width;
const ATTACH_W = Math.round(_SW * 0.58);
const ATTACH_H = Math.round(ATTACH_W * 0.82);
const STORY_REPLY_W = Math.round(_SW * 0.50);
const STORY_REPLY_H = Math.round(STORY_REPLY_W * 0.65);

import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { ImageViewer, useImageViewer } from "@/components/ImageViewer";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Video, ResizeMode, Audio } from "expo-av";
import * as Speech from "expo-speech";
import * as Clipboard from "expo-clipboard";
import AudioPlayer from "@/components/AudioPlayer";
import Svg, { Path } from "react-native-svg";
import { ChatLoadingSkeleton } from "@/components/ui/Skeleton";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, supabaseUrl as SUPA_URL, supabaseAnonKey as SUPA_KEY } from "@/lib/supabase";
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
  queueMessage,
  isOnline,
  getCachedUserId,
  onConnectivityChange,
} from "@/lib/offlineStore";
import { getLocalMessages, saveMessages, savePendingMessage, getNewestMessageDate, deleteAllLocalMessages } from "@/lib/storage/localMessages";
import { LinkPreview } from "@/components/ui/LinkPreview";
import { getPhonebookName } from "@/lib/storage/localContacts";
import { clearUnread, getLocalConversation } from "@/lib/storage/localConversations";
import { getLocalAttachmentUri, ensureChatAttachmentDownloaded, autoDownloadChatAttachments, openChatFile, saveAttachmentToGallery } from "@/lib/storage/chatAttachmentCache";
import { uploadChatMedia } from "@/lib/mediaUpload";
import { syncPendingMessages } from "@/lib/offlineSync";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { translateText, LANG_LABELS } from "@/lib/translate";
import { useLanguage } from "@/context/LanguageContext";
import { useChatPreferences, CHAT_THEME_COLORS, BUBBLE_RADIUS } from "@/context/ChatPreferencesContext";
import { useAdvancedFeatures } from "@/context/AdvancedFeaturesContext";
import { useDataMode } from "@/context/DataModeContext";
import { markChatVisited, setActiveChatId, clearActiveChatId } from "@/lib/chatVisited";
import { askAi, aiSuggestReply, transcribeAudio, getEdgeFnBase, edgeHeaders } from "@/lib/aiHelper";
import { buildNavigationContext, ACTION_ROUTES_GUIDE, detectVoiceNavCommand, pickNavConfirmation } from "@/lib/platformKnowledge";
import {
  playNotificationSound as playMgrSound,
  resetToPlaybackMode,
} from "@/lib/soundManager";
import { AFUAI_BOT_ID } from "@/lib/afuAiBot";
import { getDailyUsage, recordDailyUsage } from "@/lib/featureUsage";
import EmojiStickerPicker from "@/components/chat/EmojiStickerPicker";
import GiftPickerSheet, { DbGift } from "@/components/gifts/GiftPickerSheet";
import MiniProfilePopup from "@/components/chat/MiniProfilePopup";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";

type Gift = {
  id: string;
  name: string;
  emoji: string;
  base_xp_cost: number;
  acoin_price: number;
  rarity: string;
};

type AiInvoiceData = {
  type: string; date: string; from?: string; to?: string;
  amount: number; currency: string; fee?: number; net?: number;
  reference: string; status: string; description?: string;
};
type AiExecAction = {
  id: string; actionType: string; params: Record<string, any>;
  label: string; description: string;
  status: "pending" | "executing" | "success" | "failed";
  result?: string; invoice?: AiInvoiceData;
};
type AiActionButton = { label: string; icon: string; action: string; params?: Record<string, any> };

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
  edited_at?: string | null;
  _pending?: boolean;
  _isAi?: boolean;
  _aiActions?: AiActionButton[];
  _aiSuggestions?: string[];
  _aiInvoices?: AiInvoiceData[];
  _aiExecAction?: AiExecAction;
};

type ChatInfo = {
  is_group: boolean;
  is_channel: boolean;
  name: string | null;
  other_name: string;
  other_avatar: string | null;
  other_id: string;
  member_ids: string[];
  avatar_url: string | null;
  is_verified?: boolean;
  is_organization_verified?: boolean;
  other_last_seen?: string | null;
  other_show_online_status?: boolean;
};

// Enable LayoutAnimation on Android so keyboard show/hide transitions are smooth.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const BRAND_FALLBACK = Colors.brand;
const MIC_SPRING_CONFIG = { damping: 18, stiffness: 200, mass: 0.8 };
const MIC_SPRING_SNAP = { damping: 20, stiffness: 180 };
const MIC_CANCEL_THRESHOLD = -120;
const MIC_LOCK_THRESHOLD = -100;
const MIC_DIRECTION_DEADZONE = 10;

function formatLastSeen(ts: string | null | undefined, showOnlineStatus?: boolean): { text: string; isOnline: boolean } {
  if (showOnlineStatus === false) return { text: "last seen recently", isOnline: false };
  if (!ts) return { text: "last seen recently", isOnline: false };
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 2 * 60 * 1000) return { text: "Online", isOnline: true };
  if (diff < 60 * 60 * 1000) return { text: "last seen recently", isOnline: false };
  if (diff < 24 * 60 * 60 * 1000) {
    const h = Math.floor(diff / 3600000);
    return { text: `last seen ${h}h ago`, isOnline: false };
  }
  const date = new Date(ts);
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const day = date.toLocaleDateString([], { weekday: "long" });
    return { text: `last seen on ${day}`, isOnline: false };
  }
  if (diff < 30 * 24 * 60 * 60 * 1000) {
    const label = date.toLocaleDateString([], { day: "numeric", month: "short" });
    return { text: `last seen on ${label}`, isOnline: false };
  }
  return { text: "last seen long time ago", isOnline: false };
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
    // Right-side tail: sharp point at bottom-right, concave inner curve back to top-left
    return (
      <View style={st.tailMe}>
        <Svg width={14} height={20} viewBox="0 0 14 20">
          <Path d="M0 0 L14 20 C9 15 2 9 0 0 Z" fill={color} />
        </Svg>
      </View>
    );
  }
  // Left-side tail: mirror of the above
  return (
    <View style={st.tailOther}>
      <Svg width={14} height={20} viewBox="0 0 14 20">
        <Path d="M14 0 L0 20 C5 15 12 9 14 0 Z" fill={color} />
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
            borderColor: (colors.accent || BRAND_FALLBACK) + "60",
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
  const { height: screenHeight } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(screenHeight)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20 }).start();
    } else {
      Animated.timing(translateY, { toValue: screenHeight, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, screenHeight]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 0.5) {
          Animated.timing(translateY, { toValue: screenHeight, duration: 200, useNativeDriver: true }).start(() => onClose());
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
        style={[st.sheetContent, { backgroundColor: colors.surface, transform: [{ translateY }], maxHeight: screenHeight * 0.7 }]}
        {...panResponder.panHandlers}
      >
        <View style={st.sheetHandle} />
        {children}
      </Animated.View>
    </View>
  );
}

const AI_EXEC_LABELS: Record<string, string> = {
  send_nexa: "Send Nexa", send_acoin: "Send ACoin",
  follow: "Follow User", unfollow: "Unfollow User",
  subscribe: "Subscribe to Plan", cancel_subscription: "Cancel Subscription",
  convert_nexa: "Convert Currency",
};
function buildAiExecDesc(actionType: string, params: Record<string, any>): string {
  switch (actionType) {
    case "send_nexa": return `Send ${params.amount || "?"} Nexa to @${params.handle || "?"}${params.message ? ` — "${params.message}"` : ""}`;
    case "send_acoin": return `Send ${params.amount || "?"} ACoin to @${params.handle || "?"}${params.message ? ` — "${params.message}"` : ""}`;
    case "follow": return `Follow @${params.handle || "?"}`;
    case "unfollow": return `Unfollow @${params.handle || "?"}`;
    case "subscribe": return `Subscribe to ${params.tier ? params.tier.charAt(0).toUpperCase() + params.tier.slice(1) : "?"} plan`;
    case "cancel_subscription": return "Cancel your current premium subscription";
    case "convert_nexa": return `Convert ${params.amount || "?"} Nexa to ACoin`;
    default: return `Execute ${actionType}`;
  }
}
type RichSeg = { type: "text"|"heading"|"bullet"|"numbered"|"codeblock"|"divider"; text: string; level?: number; indent?: number; num?: string; lang?: string; };
function parseAiRichText(raw: string): RichSeg[] {
  const segs: RichSeg[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      segs.push({ type: "codeblock", text: code.join("\n"), lang: lang || undefined });
      continue;
    }
    if (line.match(/^---+$/) || line.match(/^\*\*\*+$/)) { segs.push({ type: "divider", text: "" }); continue; }
    const hm = line.match(/^(#{1,3})\s+(.+)$/);
    if (hm) { segs.push({ type: "heading", text: hm[2].replace(/^#+\s*/, ""), level: hm[1].length }); continue; }
    const bm = line.match(/^(\s*)[•\-*]\s+(.+)$/);
    if (bm) { segs.push({ type: "bullet", text: bm[2], indent: Math.floor(bm[1].length / 2) }); continue; }
    const nm = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (nm) { segs.push({ type: "numbered", text: nm[2], num: nm[1] }); continue; }
    if (line.trim() === "" && segs.length > 0) { segs.push({ type: "text", text: "\n" }); continue; }
    segs.push({ type: "text", text: line });
  }
  return segs;
}
function stripMd(s: string) {
  return s
    .replace(/\*{1,3}([^*\n]*)\*{1,3}/g, "$1")
    .replace(/_{1,2}([^_\n]*)_{1,2}/g, "$1")
    .replace(/\*{1,3}/g, "")
    .replace(/_{1,2}/g, "")
    .replace(/^#{1,3}\s*/gm, "")
    .replace(/`/g, "");
}
function stripMdForPreview(s: string): string {
  return s
    .replace(/\[ACTION:[^\]]+\]/g, "")
    .replace(/\[SUGGEST:[^\]]+\]/g, "")
    .replace(/\[INVOICE:[\s\S]*?\]/g, "")
    .replace(/\[EXEC:\w+:[\s\S]*?\]/g, "")
    .replace(/\*{1,3}([^*\n]*)\*{1,3}/g, "$1")
    .replace(/_{1,2}([^_\n]*)_{1,2}/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function AiInlineText({ text, color }: { text: string; color: string }) {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/g;
  let last = 0; let m; let k = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<Text key={k++} style={{ color }}>{stripMd(text.slice(last, m.index))}</Text>);
    if (m[2]) parts.push(<Text key={k++} style={{ color, fontWeight: "700", fontStyle: "italic" }}>{m[2]}</Text>);
    else if (m[3]) parts.push(<Text key={k++} style={{ color, fontWeight: "700" }}>{m[3]}</Text>);
    else if (m[4]) parts.push(<Text key={k++} style={{ color, fontStyle: "italic" }}>{m[4]}</Text>);
    else if (m[5]) parts.push(<Text key={k++} style={{ color: "#00BCD4", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13 }}>{` ${m[5]} `}</Text>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Text key={k++} style={{ color }}>{stripMd(text.slice(last))}</Text>);
  return <>{parts}</>;
}
function AiRichContent({ content, colors: c, isUser }: { content: string; colors: any; isUser?: boolean }) {
  const textColor = isUser ? "#fff" : c.text;
  if (isUser) return <Text style={{ fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 21, color: "#fff" }}>{stripMd(content)}</Text>;
  const segs = parseAiRichText(content);
  return (
    <View style={{ gap: 2 }}>
      {segs.map((seg, i) => {
        if (seg.type === "heading") return <Text key={i} style={{ color: textColor, fontFamily: "Inter_700Bold", fontSize: seg.level === 1 ? 18 : seg.level === 2 ? 16 : 15, marginTop: 4 }}><AiInlineText text={seg.text} color={textColor} /></Text>;
        if (seg.type === "codeblock") return <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: c.inputBg || "#1e1e1e", borderRadius: 8, padding: 10, marginVertical: 4 }}><Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13, color: "#00BCD4" }}>{seg.text}</Text></ScrollView>;
        if (seg.type === "bullet") return <View key={i} style={{ flexDirection: "row", gap: 6, paddingLeft: (seg.indent || 0) * 16 }}><Text style={{ color: "#00BCD4", fontSize: 14, lineHeight: 22 }}>●</Text><Text style={{ color: textColor, fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 21, flex: 1 }}><AiInlineText text={seg.text} color={textColor} /></Text></View>;
        if (seg.type === "numbered") return <View key={i} style={{ flexDirection: "row", gap: 6 }}><Text style={{ color: "#00BCD4", fontSize: 14, fontWeight: "600", lineHeight: 22, minWidth: 20 }}>{seg.num}.</Text><Text style={{ color: textColor, fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 21, flex: 1 }}><AiInlineText text={seg.text} color={textColor} /></Text></View>;
        if (seg.type === "divider") return <View key={i} style={{ height: 1, backgroundColor: c.border, marginVertical: 6 }} />;
        if (seg.text === "\n") return <View key={i} style={{ height: 6 }} />;
        return <Text key={i} style={{ color: textColor, fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 21 }}><AiInlineText text={seg.text} color={textColor} /></Text>;
      })}
    </View>
  );
}
function AiInvoiceCard({ invoice, colors: c }: { invoice: AiInvoiceData; colors: any }) {
  const rows = [
    { label: "Type", value: invoice.type },
    { label: "Date", value: new Date(invoice.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
    invoice.from ? { label: "From", value: invoice.from } : null,
    invoice.to ? { label: "To", value: invoice.to } : null,
    { label: "Amount", value: `${invoice.amount} ${invoice.currency}` },
    invoice.fee != null ? { label: "Fee", value: `${invoice.fee} ACoin` } : null,
    invoice.net != null ? { label: "Net", value: `${invoice.net} ACoin`, highlight: true } : null,
  ].filter(Boolean) as { label: string; value: string; highlight?: boolean }[];
  return (
    <View style={{ backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, marginTop: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Ionicons name="receipt-outline" size={14} color="#00BCD4" />
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#00BCD4", textTransform: "uppercase", letterSpacing: 0.5 }}>Invoice</Text>
      </View>
      {rows.map((r, i) => <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}><Text style={{ fontSize: 13, color: c.textMuted, fontFamily: "Inter_400Regular" }}>{r.label}</Text><Text style={{ fontSize: 13, color: r.highlight ? "#00BCD4" : c.text, fontFamily: "Inter_600SemiBold" }}>{r.value}</Text></View>)}
      <View style={{ height: 1, backgroundColor: c.border, marginVertical: 6 }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 13, color: c.textMuted, fontFamily: "Inter_400Regular" }}>Status</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name={invoice.status === "Completed" ? "checkmark-circle" : "time"} size={13} color={invoice.status === "Completed" ? "#34C759" : "#FF9500"} />
          <Text style={{ fontSize: 13, color: invoice.status === "Completed" ? "#34C759" : "#FF9500", fontFamily: "Inter_600SemiBold" }}>{invoice.status}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 11, color: c.textMuted, fontFamily: "Inter_400Regular", marginTop: 6 }}>Ref: {invoice.reference}</Text>
      {invoice.description ? <Text style={{ fontSize: 12, color: c.textMuted, fontFamily: "Inter_400Regular", marginTop: 4 }}>{invoice.description}</Text> : null}
    </View>
  );
}
function AiConfirmationCard({ exec: ea, colors: c, onConfirm, onCancel }: { exec: AiExecAction; colors: any; onConfirm: () => void; onCancel: () => void }) {
  const colorMap: Record<string, string> = { send_nexa: "#FF9500", send_acoin: "#34C759", follow: "#00BCD4", unfollow: "#FF3B30", subscribe: "#D4A853", cancel_subscription: "#FF3B30", convert_nexa: "#007AFF" };
  const iconMap: Record<string, string> = { send_nexa: "flash", send_acoin: "cash", follow: "person-add", unfollow: "person-remove", subscribe: "diamond", cancel_subscription: "close-circle", convert_nexa: "swap-horizontal" };
  const accent = colorMap[ea.actionType] || "#00BCD4";
  if (ea.status === "executing") return <View style={{ backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1, borderColor: accent + "40", padding: 14, marginTop: 8, alignItems: "center" }}><ActivityIndicator color={accent} size="small" /></View>;
  if (ea.status === "success" || ea.status === "failed") {
    const ok = ea.status === "success";
    return <View style={{ backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1, borderColor: (ok ? "#34C759" : "#FF3B30") + "40", padding: 14, marginTop: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: ea.result ? 6 : 0 }}><Ionicons name={ok ? "checkmark-circle" : "close-circle"} size={18} color={ok ? "#34C759" : "#FF3B30"} /><Text style={{ fontSize: 14, color: ok ? "#34C759" : "#FF3B30", fontFamily: "Inter_600SemiBold" }}>{ok ? "Success" : "Failed"}</Text></View>
      {ea.result ? <Text style={{ fontSize: 13, color: c.text, fontFamily: "Inter_400Regular" }}>{ea.result}</Text> : null}
      {ea.invoice ? <AiInvoiceCard invoice={ea.invoice} colors={c} /> : null}
    </View>;
  }
  return <View style={{ backgroundColor: c.inputBg, borderRadius: 12, borderWidth: 1, borderColor: accent + "40", padding: 14, marginTop: 8 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accent + "20", alignItems: "center", justifyContent: "center" }}><Ionicons name={(iconMap[ea.actionType] || "flash") as any} size={18} color={accent} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 14, color: c.text, fontFamily: "Inter_600SemiBold" }}>{ea.label}</Text><Text style={{ fontSize: 12, color: c.textMuted, fontFamily: "Inter_400Regular", marginTop: 2 }}>{ea.description}</Text></View>
    </View>
    <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
      <TouchableOpacity onPress={onConfirm} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: accent }}><Ionicons name="checkmark" size={16} color="#fff" /><Text style={{ fontSize: 14, color: "#fff", fontFamily: "Inter_600SemiBold" }}>Confirm</Text></TouchableOpacity>
      <TouchableOpacity onPress={onCancel} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: c.border }}><Ionicons name="close" size={16} color={c.textMuted} /><Text style={{ fontSize: 14, color: c.textMuted, fontFamily: "Inter_600SemiBold" }}>Cancel</Text></TouchableOpacity>
    </View>
  </View>;
}

const SWIPE_THRESHOLD = 60;

function MessageBubble({ msg, isMe, showTail, showName, onLongPress, onReply, replyPreview, onTapReply, isHighlighted, onTapEnvelope, onTapGift, onImageTap, isPremiumSender, onConfirmExec, onCancelExec, onSuggestionTap, onSenderPress, onReactionPress }: {
  msg: Message;
  isMe: boolean;
  showTail: boolean;
  showName: boolean;
  onLongPress: (msg: Message) => void;
  onReply: (msg: Message) => void;
  replyPreview?: string | null;
  onTapReply?: () => void;
  isHighlighted?: boolean;
  onTapEnvelope?: (msg: Message) => void;
  onTapGift?: (msg: Message) => void;
  onImageTap?: (images: string[], index: number) => void;
  isPremiumSender?: boolean;
  onConfirmExec?: (msgId: string) => void;
  onCancelExec?: (msgId: string) => void;
  onSuggestionTap?: (text: string) => void;
  onSenderPress?: (senderId: string) => void;
  onReactionPress?: (msg: Message, emoji: string) => void;
}) {
  const { colors } = useTheme();
  const BRAND = colors.accent;
  const { preferredLang, voiceToText, textToSpeech } = useLanguage();
  const { themeColors: chatTheme, bubbleRadius: chatRadius, prefs: chatPrefsLocal } = useChatPreferences();
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Local attachment URI (from device cache) ──────────────────────────────
  // Initialise synchronously from the in-memory cache; then resolve in the
  // background so the local file is used on re-renders without any re-download.
  const [attachUri, setAttachUri] = useState<string>(() => {
    if (!msg.attachment_url) return "";
    return getLocalAttachmentUri(msg.attachment_url) ?? msg.attachment_url;
  });
  const [fileDownloading, setFileDownloading] = useState(false);

  useEffect(() => {
    const url  = msg.attachment_url;
    const type = msg.attachment_type;
    // Skip video (stream from URL) and file (user must choose to download)
    if (!url || !type || type === "video" || type === "file") return;
    // Already resolved to a local path — nothing to do
    if (attachUri && !attachUri.startsWith("http")) return;
    ensureChatAttachmentDownloaded(url, type)
      .then((local) => { if (local && local !== attachUri) setAttachUri(local); })
      .catch(() => {});
  }, [msg.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFileTap() {
    if (!msg.attachment_url) return;
    const url = msg.attachment_url;
    const _isApk = Platform.OS === "android" &&
      (url.toLowerCase().includes(".apk") ||
       (msg.encrypted_content?.toLowerCase() ?? "").includes(".apk"));

    async function _openOrInstall(localPath: string) {
      if (_isApk) {
        // Try to launch Android's package installer via a content:// URI.
        try {
          const contentUri = await FileSystem.getContentUriAsync(localPath);
          await Linking.openURL(contentUri);
          return;
        } catch {}
        // Fallback: share sheet pointing at the APK (still opens installer).
        try {
          const Sharing = await import("expo-sharing");
          await Sharing.shareAsync(localPath, {
            dialogTitle: "Install app",
            mimeType: "application/vnd.android.package-archive",
          });
        } catch {}
      } else {
        openChatFile(localPath);
      }
    }

    const local = getLocalAttachmentUri(url);
    if (local) { await _openOrInstall(local); return; }

    setFileDownloading(true);
    try {
      const downloaded = await ensureChatAttachmentDownloaded(url, "file");
      if (downloaded) { setAttachUri(downloaded); await _openOrInstall(downloaded); }
    } finally {
      setFileDownloading(false);
    }
  }

  const swipeX = useRef(new Animated.Value(0)).current;
  const swipeTriggered = useRef(false);
  const swipePan = useRef(
    PanResponder.create({
      // Bubble phase — claim clearly-horizontal swipes when nothing else has
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      // Capture phase — runs BEFORE the FlatList/ScrollView sees the event.
      // This is the key fix: when the keyboard is open the scroll view normally
      // wins in the bubble phase; capture lets us intercept horizontal gestures
      // first, regardless of keyboard state.
      onMoveShouldSetPanResponderCapture: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2.5,
      onPanResponderMove: (_, gs) => {
        const dx = isMe ? Math.min(0, gs.dx) : Math.max(0, gs.dx);
        swipeX.setValue(dx);
        if (Math.abs(dx) >= SWIPE_THRESHOLD && !swipeTriggered.current) {
          swipeTriggered.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
      onPanResponderRelease: (_, gs) => {
        const triggered = isMe ? gs.dx <= -SWIPE_THRESHOLD : gs.dx >= SWIPE_THRESHOLD;
        Animated.spring(swipeX, { toValue: 0, tension: 120, friction: 14, useNativeDriver: true }).start();
        if (triggered) onReply(msg);
        swipeTriggered.current = false;
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeX, { toValue: 0, tension: 120, friction: 14, useNativeDriver: true }).start();
        swipeTriggered.current = false;
      },
    })
  ).current;

  const isSpecial =
    msg.encrypted_content?.startsWith("🧧") ||
    msg.encrypted_content?.startsWith("🎁") ||
    ["📷 Photo", "🎥 Video", "GIF"].includes(msg.encrypted_content ?? "");

  const canTranslate = !isMe && !!msg.encrypted_content && !isSpecial && !!preferredLang;
  const canTranscribe = !!msg.attachment_url && msg.attachment_type === "audio" && voiceToText;
  const canSpeak = textToSpeech && !!msg.encrypted_content && !isSpecial && msg.attachment_type !== "audio";

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

  async function handleTranscribe() {
    if (showTranscript) { setShowTranscript(false); return; }
    if (transcript) { setShowTranscript(true); return; }
    setTranscribing(true);
    try {
      const result = await transcribeAudio(msg.attachment_url!);
      if (result) {
        setTranscript(result);
        setShowTranscript(true);
      } else {
        setTranscript("(no speech detected)");
        setShowTranscript(true);
      }
    } catch (err) {
      setTranscript("Transcription failed — please try again.");
      setShowTranscript(true);
    }
    setTranscribing(false);
  }

  async function handleSpeak() {
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }
    const text = (showTranslated && translated ? translated : msg.encrypted_content) || "";
    setIsSpeaking(true);
    Speech.speak(text, {
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  }

  const displayText = (showTranslated && translated ? translated : msg.encrypted_content) ?? "";

  const isRedEnvelope = msg.encrypted_content?.startsWith("🧧") ?? false;
  const isGiftMsg = msg.encrypted_content?.startsWith("🎁") ?? false;
  const meBubbleColor = BRAND;
  const otherBubbleColor = colors.bubbleIncoming;
  const isSticker = msg.attachment_type === "sticker";
  const bubbleColor = isSticker ? "transparent" : (isMe ? meBubbleColor : otherBubbleColor);
  const textColor = isMe ? "#FFFFFF" : colors.bubbleIncomingText;
  const isPending = msg._pending || msg.status === "sending";

  const fadeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, []);

  if (isRedEnvelope) {
    return (
      <View style={[st.msgRow, isMe ? st.msgRowMe : st.msgRowOther]}>
        <TouchableOpacity onPress={() => onTapEnvelope?.(msg)} activeOpacity={0.7} style={st.specialMsgTap}>
          <Text style={st.specialMsgEmoji}>🧧</Text>
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
        <TouchableOpacity onPress={() => onTapGift?.(msg)} activeOpacity={0.7} style={st.specialMsgTap}>
          <Text style={st.specialMsgEmoji}>{giftEmoji}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasImage = msg.attachment_url && (msg.attachment_type === "image" || msg.attachment_type === "gif");
  const hasVideo = msg.attachment_url && msg.attachment_type === "video";
  const hasAudio = msg.attachment_url && msg.attachment_type === "audio";
  const hasFile = msg.attachment_url && msg.attachment_type === "file";
  const hasStoryReply = msg.attachment_url && msg.attachment_type === "story_reply";
  const hasTextContent = msg.encrypted_content && !["📷 Photo", "🎥 Video", "GIF"].includes(msg.encrypted_content);

  // Detect APK files: check both the URL and the message label (📎 filename.apk)
  const isApk = !!hasFile && Platform.OS === "android" &&
    ((msg.attachment_url?.toLowerCase() ?? "").includes(".apk") ||
     (msg.encrypted_content?.toLowerCase() ?? "").includes(".apk"));

  const replyIconOpacity = swipeX.interpolate({
    inputRange: isMe ? [-SWIPE_THRESHOLD, -10, 0] : [0, 10, SWIPE_THRESHOLD],
    outputRange: isMe ? [1, 0.3, 0] : [0, 0.3, 1],
    extrapolate: "clamp",
  });

  return (
    <View>
    <View {...swipePan.panHandlers} style={[st.msgRow, isMe ? st.msgRowMe : st.msgRowOther]}>
      {!isMe && (
        <Animated.View style={[st.swipeReplyIcon, { opacity: replyIconOpacity, left: 4 }]}>
          <Ionicons name="arrow-undo" size={18} color={BRAND} />
        </Animated.View>
      )}
      <Animated.View style={[{ flex: 1, flexDirection: "row", justifyContent: isMe ? "flex-end" : "flex-start", minWidth: 0 }, { transform: [{ translateX: swipeX }], opacity: fadeIn }]}>
      <View style={[st.bubbleContainer, isMe ? st.bubbleContainerMe : st.bubbleContainerOther]}>
        {showTail && <BubbleTail isMe={isMe} color={bubbleColor} />}

        <View style={[
          st.bubble,
          { backgroundColor: bubbleColor, borderRadius: chatRadius ?? 18 },
          isMe ? st.bubbleMe : st.bubbleOther,
          showTail ? (isMe ? st.bubbleTailMe : st.bubbleTailOther) : null,
          replyPreview ? st.bubbleWithReply : null,
          isPending && { opacity: 0.6 },
        ]}>
          {isPremiumSender && <PremiumBubbleShimmer />}
          {!isMe && showName && (
            onSenderPress ? (
              <TouchableOpacity
                onPress={() => onSenderPress(msg.sender_id)}
                activeOpacity={0.65}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Text style={[st.senderName, { color: BRAND }]}>
                  {msg.sender?.display_name ?? ""}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={[st.senderName, { color: BRAND }]}>
                {msg.sender?.display_name ?? ""}
              </Text>
            )
          )}

          {replyPreview && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onTapReply}
              disabled={!onTapReply}
              style={[st.replyPreview, { backgroundColor: isMe ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.07)" }]}
            >
              <View style={[st.replyBarLine, { backgroundColor: isMe ? "rgba(255,255,255,0.9)" : BRAND }]} />
              <View style={st.replyTextWrap}>
                <Text style={[st.replyPreviewText, { color: isMe ? "rgba(255,255,255,0.85)" : colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
                  {stripMdForPreview(replyPreview)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          {isHighlighted && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: BRAND + "38", borderRadius: chatRadius ?? 18, pointerEvents: "none" }]} />
          )}

          {hasImage ? (
            <>
              <TouchableOpacity
                  onPress={() => onImageTap?.([attachUri || msg.attachment_url!], 0)}
                  onLongPress={() => onLongPress(msg)}
                  delayLongPress={300}
                  activeOpacity={0.9}
                >
                  <View>
                    <Image source={{ uri: attachUri || msg.attachment_url! }} style={st.attachImage} resizeMode="cover" />
                  </View>
                </TouchableOpacity>
              {hasTextContent && (
                <RichText style={[st.bubbleText, { color: textColor, marginTop: 6, fontSize: chatPrefsLocal?.font_size ?? 15, lineHeight: (chatPrefsLocal?.font_size ?? 15) + 5 }]} linkColor={isMe ? "#FFFFFF" : BRAND}>{stripMd(displayText)}</RichText>
              )}
            </>
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
            <View>
              <AudioPlayer uri={attachUri || msg.attachment_url!} tintColor={textColor} waveColor={isMe ? "#FFFFFF" : BRAND} />
              {canTranscribe && (
                <TouchableOpacity
                  onPress={handleTranscribe}
                  style={[st.translateChip, { backgroundColor: isMe ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)", marginTop: 6 }]}
                  hitSlop={8}
                >
                  {transcribing ? (
                    <ActivityIndicator size={10} color={colors.textMuted} style={{ marginRight: 3 }} />
                  ) : (
                    <Ionicons name="mic-outline" size={11} color={showTranscript ? BRAND : colors.textMuted} style={{ marginRight: 3 }} />
                  )}
                  <Text style={[st.translateChipText, { color: showTranscript ? BRAND : colors.textMuted }]}>
                    {transcribing ? "Transcribing…" : showTranscript ? "Hide transcript" : "Transcribe"}
                  </Text>
                </TouchableOpacity>
              )}
              {showTranscript && transcript && (
                <Text style={[st.bubbleText, { color: textColor, marginTop: 6, fontStyle: "italic", fontSize: chatPrefsLocal?.font_size ?? 15, lineHeight: (chatPrefsLocal?.font_size ?? 15) + 5 }]}>{transcript}</Text>
              )}
            </View>
          ) : hasFile ? (
            <TouchableOpacity
              onPress={handleFileTap}
              onLongPress={() => onLongPress(msg)}
              delayLongPress={300}
              activeOpacity={0.9}
              style={st.fileRow}
            >
              <View style={[st.fileIconBg, { backgroundColor: isMe ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.06)" }]}>
                {fileDownloading
                  ? <ActivityIndicator size={18} color={textColor} />
                  : <Ionicons
                      name={
                        attachUri && !attachUri.startsWith("http")
                          ? (isApk ? "logo-android" : "document-text")
                          : "download-outline"
                      }
                      size={22}
                      color={isApk && attachUri && !attachUri.startsWith("http") ? "#3DDC84" : textColor}
                    />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.fileName, { color: textColor }]} numberOfLines={2}>{displayText}</Text>
                <Text style={[st.fileMeta, { color: isMe ? "rgba(255,255,255,0.6)" : colors.textMuted }]}>
                  {fileDownloading
                    ? "Downloading…"
                    : attachUri && !attachUri.startsWith("http")
                      ? (isApk ? "Tap to install" : "Tap to open")
                      : (isApk ? "Tap to download & install" : "Tap to download")}
                </Text>
              </View>
            </TouchableOpacity>
          ) : hasStoryReply ? (
            (() => {
              // Parse encoded storyUserId prefix: "storyUserId:{uid}|{display text}"
              const raw = msg.encrypted_content ?? "";
              const isEncoded = raw.startsWith("storyUserId:");
              const storyUserId = isEncoded ? raw.slice("storyUserId:".length).split("|")[0] : null;
              const storyDisplayText = isEncoded ? raw.slice("storyUserId:".length + (storyUserId?.length ?? 0) + 1) : raw;
              const isShared = isEncoded && (storyDisplayText === "Shared a story" || storyDisplayText.startsWith('"'));

              return (
                <TouchableOpacity
                  onPress={() => storyUserId && router.push({ pathname: "/stories/view", params: { userId: storyUserId } })}
                  onLongPress={() => onLongPress(msg)}
                  delayLongPress={300}
                  activeOpacity={0.85}
                >
                  <View style={[st.storyReplyCard, { borderColor: isMe ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.12)" }]}>
                    <Image
                      source={{ uri: msg.attachment_url! }}
                      style={st.storyReplyThumb}
                      resizeMode="cover"
                    />
                    <View style={[st.storyReplyOverlay, { backgroundColor: isMe ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.38)" }]}>
                      <Ionicons name={isShared ? "share-social" : "camera"} size={11} color="rgba(255,255,255,0.9)" />
                      <Text style={st.storyReplyLabel} numberOfLines={1}>
                        {isShared
                          ? (isMe ? "You shared a story" : "Shared a story")
                          : (isMe ? "You replied to a story" : "Replied to your story")}
                      </Text>
                      {storyUserId && (
                        <Ionicons name="chevron-forward" size={11} color="rgba(255,255,255,0.6)" />
                      )}
                    </View>
                  </View>
                  {storyDisplayText && !isShared ? (
                    <Text style={[st.bubbleText, { color: textColor, marginTop: 6, fontSize: chatPrefsLocal?.font_size ?? 15, lineHeight: (chatPrefsLocal?.font_size ?? 15) + 5 }]}>
                      {storyDisplayText}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })()
          ) : msg.attachment_type === "sticker" ? (
            <TouchableOpacity onLongPress={() => onLongPress(msg)} delayLongPress={300} activeOpacity={0.8}>
              <Text style={{ fontSize: 64, lineHeight: 74 }}>{msg.encrypted_content ?? ""}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onLongPress={() => onLongPress(msg)} delayLongPress={300} activeOpacity={0.9}>
              {msg._isAi
                ? <AiRichContent content={displayText} colors={colors} isUser={isMe} />
                : <RichText style={[st.bubbleText, { color: textColor, fontSize: chatPrefsLocal?.font_size ?? 15, lineHeight: (chatPrefsLocal?.font_size ?? 15) + 5 }]} linkColor={isMe ? "#FFFFFF" : BRAND} selectable={Platform.OS === "web"}>{stripMd(displayText)}</RichText>
              }
              {!msg._isAi && !isSpecial && chatPrefsLocal?.link_previews !== false && (
                <LinkPreview text={displayText} isMe={isMe} />
              )}
            </TouchableOpacity>
          )}

          {/* AI invoice cards */}
          {msg._aiInvoices?.map((inv, i) => <AiInvoiceCard key={i} invoice={inv} colors={colors} />)}

          {/* AI action confirmation card */}
          {msg._aiExecAction && (
            <AiConfirmationCard
              exec={msg._aiExecAction}
              colors={colors}
              onConfirm={() => onConfirmExec?.(msg.id)}
              onCancel={() => onCancelExec?.(msg.id)}
            />
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

          {/* Speak chip — shown when text-to-speech is enabled */}
          {canSpeak && (
            <TouchableOpacity
              onPress={handleSpeak}
              style={[st.translateChip, { backgroundColor: isMe ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)" }]}
              hitSlop={8}
            >
              <Ionicons
                name={isSpeaking ? "stop-circle-outline" : "volume-medium-outline"}
                size={11}
                color={isSpeaking ? BRAND : colors.textMuted}
                style={{ marginRight: 3 }}
              />
              <Text style={[st.translateChipText, { color: isSpeaking ? BRAND : colors.textMuted }]}>
                {isSpeaking ? "Stop" : "Speak"}
              </Text>
            </TouchableOpacity>
          )}

          <View style={st.metaRow}>
            {msg.edited_at && (
              <Text style={[st.msgTime, { color: isMe ? "rgba(255,255,255,0.55)" : colors.textMuted, marginRight: 4 }]}>edited</Text>
            )}
            <Text style={[st.msgTime, { color: isMe ? "rgba(255,255,255,0.55)" : colors.textMuted }]}>
              {formatMsgTime(msg.sent_at)}
            </Text>
            {isMe && (
              <Ionicons
                name={
                  msg.status === "failed" ? "alert-circle-outline" :
                  isPending ? "time-outline" :
                  msg.status === "read" ? "checkmark-done" :
                  msg.status === "delivered" ? "checkmark-done" : "checkmark"
                }
                size={14}
                color={
                  msg.status === "failed" ? "#FF4444" :
                  msg.status === "read" ? "#53BDEB" :
                  "rgba(255,255,255,0.55)"
                }
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
        </View>

        {msg.reactions && msg.reactions.length > 0 && (
          <View style={[st.reactionsRow, isMe ? st.reactionsMe : st.reactionsOther]}>
            {msg.reactions.map((r, i) => (
              <TouchableOpacity
                key={i}
                style={[st.reactionPill, r.myReaction && { borderColor: BRAND, borderWidth: 1.5 }]}
                onPress={() => onReactionPress?.(msg, r.emoji)}
                activeOpacity={0.7}
              >
                <Text style={st.reactionEmoji}>{r.emoji}</Text>
                {r.count > 1 && <Text style={[st.reactionCount, { color: colors.text }]}>{r.count}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      </Animated.View>
      {isMe && (
        <Animated.View style={[st.swipeReplyIcon, { opacity: replyIconOpacity, right: 4 }]}>
          <Ionicons name="arrow-undo" size={18} color={BRAND} />
        </Animated.View>
      )}
    </View>
    {msg._isAi && ((msg._aiActions?.length ?? 0) > 0 || (msg._aiSuggestions?.length ?? 0) > 0) && (
      <View style={{ paddingLeft: 10, paddingRight: 10, marginTop: 2 }}>
        {msg._aiActions && msg._aiActions.length > 0 && (
          <View style={{ gap: 6, marginTop: 4 }}>
            {msg._aiActions.map((action, i) => (
              <TouchableOpacity key={i} onPress={() => { if (action.action === "navigate" && action.params?.route) router.push(action.params.route as any); }} activeOpacity={0.7}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: BRAND + "10", borderWidth: 1, borderColor: BRAND + "30" }}>
                  <Ionicons name={action.icon as any} size={16} color={BRAND} />
                  <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: BRAND }}>{action.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={BRAND} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {msg._aiSuggestions && msg._aiSuggestions.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 4 }}>
            {msg._aiSuggestions.map((s, i) => (
              <TouchableOpacity key={i} onPress={() => onSuggestionTap?.(s)} activeOpacity={0.7}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: BRAND + "50", backgroundColor: BRAND + "08" }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: BRAND }}>{s}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    )}
    </View>
  );
}

/**
 * Default export — auth guard wrapper.
 *
 * Conversations are private; we never want the chat UI shell (or any of its
 * data-fetching hooks) to mount for an unauthenticated viewer. While auth is
 * still being restored we show a centred spinner; once auth is known and
 * there's no signed-in user we redirect to the login screen.
 */
export default function ChatScreenRoute() {
  const { user, loading } = useAuth();

  // Don't block on loading — if there's no user yet but loading is still in
  // progress, render the screen optimistically. The inner ChatScreen will
  // redirect to login if user turns out to be null once loading finishes.
  //
  // Offline guard: if the device has no network AND we have a cached user ID,
  // the user is simply offline — not logged out. Keep them on the screen.
  // Redirecting to login when offline and then back here on reconnect would be
  // jarring and wrong. We only redirect when we're certain they're signed out
  // (i.e. they explicitly signed out OR we're online and have no session).
  if (!loading && !user && (isOnline() || !getCachedUserId())) {
    return <Redirect href="/(auth)/login" />;
  }

  return <ChatScreen />;
}

function ChatScreen() {
  const {
    id,
    contactId,
    contactName,
    contactAvatar,
    // Pre-populated chat metadata passed from the chat list for instant rendering.
    otherName,
    otherAvatar,
    otherId,
    isGroup,
    isChannel,
    chatName,
    chatAvatar,
    initialMessage,
    lensIntro,
  } = useLocalSearchParams<{
    id: string;
    contactId?: string;
    contactName?: string;
    contactAvatar?: string;
    otherName?: string;
    otherAvatar?: string;
    otherId?: string;
    isGroup?: string;
    isChannel?: string;
    chatName?: string;
    chatAvatar?: string;
    initialMessage?: string;
    lensIntro?: string;
  }>();
  const isDraft = id === "new";
  const { user, profile, isPremium, subscription, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const BRAND = colors.accent;
  const { textToSpeech: ttsEnabled } = useLanguage();
  const { prefs: chatPrefs, themeColors: chatThemeColors, bubbleRadius: chatBubbleRadius } = useChatPreferences();
  const { features: advancedFeatures } = useAdvancedFeatures();
  const { isLowData: chatIsLowData } = useDataMode();
  const { statsMap, getDynamicPrice } = useGiftPrices();

  const playNotificationSound = useCallback(() => {
    if (!chatPrefs.sounds_enabled) return;
    playMgrSound();
  }, [chatPrefs.sounds_enabled]);
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  // Start without a loading spinner — messages are shown from local cache immediately.
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const imgViewer = useImageViewer();
  const [realChatId, setRealChatId] = useState<string | null>(null);

  // Build initial chatInfo from navigation params so the header renders instantly.
  const buildInitialChatInfo = (): ChatInfo | null => {
    if (otherName || chatName) {
      return {
        is_group: isGroup === "true",
        is_channel: isChannel === "true",
        name: chatName || null,
        other_name: otherName || chatName || "Unknown",
        other_avatar: otherAvatar || chatAvatar || null,
        other_id: otherId || "",
        member_ids: otherId ? [otherId] : [],
        avatar_url: chatAvatar || null,
      };
    }
    if (isDraft && contactName) {
      return {
        is_group: false,
        is_channel: false,
        name: null,
        other_name: contactName as string,
        other_avatar: contactAvatar as string | null || null,
        other_id: contactId as string,
        member_ids: contactId ? [contactId as string] : [],
        avatar_url: null,
      };
    }
    return null;
  };

  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(buildInitialChatInfo);
  const isAfuAiDirectChat = chatInfo?.other_id === AFUAI_BOT_ID;
  const [phonebookName, setPhonebookName] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingMapRef = useRef<Map<string, string>>(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [isAfuAiTyping, setIsAfuAiTyping] = useState(false);
  const [showAfuAiMenu, setShowAfuAiMenu] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showReactions, setShowReactions] = useState<Message | null>(null);
  const [showRedEnvelope, setShowRedEnvelope] = useState(false);
  const [envelopeAmount, setEnvelopeAmount] = useState("");
  const [envelopeMsg, setEnvelopeMsg] = useState("");
  const [envelopeCount, setEnvelopeCount] = useState("1");
  const [showEmojiStickerPicker, setShowEmojiStickerPicker] = useState(false);
  const [miniProfileUserId, setMiniProfileUserId] = useState<string | null>(null);
  const [emojiKeyboardHeight, setEmojiKeyboardHeight] = useState(280);
  const [reminderMsg, setReminderMsg] = useState<Message | null>(null);

  // Load chatInfo from local SQLite cache immediately so the header renders
  // without any network delay, even if nav params weren't passed.
  useEffect(() => {
    if (isDraft || chatInfo || Platform.OS === "web") return;
    getLocalConversation(id).then((local) => {
      if (!local) return;
      setChatInfo((prev) => prev ?? {
        is_group: local.is_group,
        is_channel: local.is_channel,
        name: local.name,
        other_name: local.other_display_name || "Unknown",
        other_avatar: local.other_avatar,
        other_id: local.other_id || "",
        member_ids: local.other_id ? [local.other_id] : [],
        avatar_url: local.avatar_url,
        other_last_seen: local.other_last_seen,
        other_show_online_status: local.other_show_online,
      });
    }).catch(() => {});
  }, []);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [floatingInputHeight, setFloatingInputHeight] = useState(80);

  useEffect(() => {
    if (Platform.OS === "web") return;
    // iOS: use Will events for zero-lag animation in sync with the keyboard.
    // Android (pan mode): use Did events; animate layout changes manually.
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates.height;
      if (Platform.OS === "android") {
        LayoutAnimation.configureNext({
          duration: 180,
          update: { type: LayoutAnimation.Types.easeInEaseOut },
        });
      }
      setKeyboardHeight(h);
      if (h > 100) setEmojiKeyboardHeight(h);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      if (Platform.OS === "android") {
        LayoutAnimation.configureNext({
          duration: 180,
          update: { type: LayoutAnimation.Types.easeInEaseOut },
        });
      }
      setKeyboardHeight(0);
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, []);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [disappearingEnabled, setDisappearingEnabled] = useState(false);
  const [disappearingTimer, setDisappearingTimer] = useState(86400); // seconds; 0 = off
  const [showDisappearingPicker, setShowDisappearingPicker] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [giftSending, setGiftSending] = useState(false);
  const [giftReveal, setGiftReveal] = useState<{ content: string; isReceiver: boolean } | null>(null);
  const [envReveal, setEnvReveal] = useState<{
    amount: number | null;
    message: string;
    senderName: string;
    isSender: boolean;
    alreadyClaimed: boolean;
    allGone: boolean;
    claimedCount: number;
    totalCount: number;
    totalAmount: number;
  } | null>(null);
  const [envClaiming, setEnvClaiming] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const showScrollBtnRef = useRef(false);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const oldestCursorRef = useRef<string | null>(null);
  const scrollBtnOpacity = useRef(new Animated.Value(0)).current;
  const autoSentInitialRef = useRef(false);
  const lensInjectedRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recLocked, setRecLocked] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingTenths, setRecordingTenths] = useState(0);
  const [waveformLevels, setWaveformLevels] = useState<number[]>([]);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimer = useRef<any>(null);
  const meterInterval = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recLockedSV = useSharedValue(false);
  const recCancelledSV = useSharedValue(false);
  const recStartedSV = useSharedValue(false);
  const recPressActiveSV = useSharedValue(false);

  const slideX = useSharedValue(0);
  const slideY = useSharedValue(0);
  const micScale = useSharedValue(1);
  const recBarOpacity = useSharedValue(0);
  const cancelProgress = useSharedValue(0);
  const lockProgress = useSharedValue(0);
  const chevronAnim = useSharedValue(0);
  const directionLock = useSharedValue<"none" | "horizontal" | "vertical">("none");

  useEffect(() => {
    if (isRecording && !recLocked) {
      const run = () => {
        chevronAnim.value = 0;
        chevronAnim.value = withTiming(1, { duration: 1200 }, (finished) => {
          if (finished) runOnJS(run)();
        });
      };
      run();
    } else {
      chevronAnim.value = 0;
    }
  }, [isRecording, recLocked]);

  const onRecStart = useCallback(() => {
    recLockedSV.value = false;
    recCancelledSV.value = false;
    recStartedSV.value = false;
    recPressActiveSV.value = true;
    startVoiceRecordingHold();
  }, [isRecording]);

  const onRecCancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    cancelVoiceRecording();
  }, []);

  const onRecLock = useCallback(() => {
    recLockedSV.value = true;
    setRecLocked(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const onRecSend = useCallback(() => {
    stopVoiceRecording();
  }, []);

  const onRecTerminate = useCallback(() => {
    cancelVoiceRecording();
  }, []);

  const micGesture = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      micScale.value = withSpring(1.35, MIC_SPRING_CONFIG);
      recBarOpacity.value = withTiming(1, { duration: 200 });
      directionLock.value = "none";
      runOnJS(onRecStart)();
    })
    .onUpdate((e) => {
      if (recLockedSV.value || recCancelledSV.value) return;

      const absX = Math.abs(e.translationX);
      const absY = Math.abs(e.translationY);

      if (directionLock.value === "none") {
        if (absX > MIC_DIRECTION_DEADZONE || absY > MIC_DIRECTION_DEADZONE) {
          directionLock.value = absX > absY ? "horizontal" : "vertical";
        }
        return;
      }

      if (directionLock.value === "horizontal") {
        const clampedX = Math.min(0, e.translationX);
        slideX.value = clampedX;
        slideY.value = 0;
        cancelProgress.value = interpolate(clampedX, [MIC_CANCEL_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP);
        lockProgress.value = 0;

        if (clampedX < MIC_CANCEL_THRESHOLD && !recCancelledSV.value) {
          recCancelledSV.value = true;
          slideX.value = withSpring(0, MIC_SPRING_SNAP);
          slideY.value = withSpring(0, MIC_SPRING_SNAP);
          micScale.value = withSpring(1, MIC_SPRING_SNAP);
          recBarOpacity.value = withTiming(0, { duration: 200 });
          cancelProgress.value = withTiming(0, { duration: 200 });
          runOnJS(onRecCancel)();
        }
      } else {
        const clampedY = Math.min(0, e.translationY);
        slideY.value = clampedY;
        slideX.value = 0;
        lockProgress.value = interpolate(clampedY, [MIC_LOCK_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP);
        cancelProgress.value = 0;

        if (clampedY < MIC_LOCK_THRESHOLD && !recLockedSV.value && !recCancelledSV.value) {
          slideX.value = withSpring(0, MIC_SPRING_SNAP);
          slideY.value = withSpring(0, MIC_SPRING_SNAP);
          micScale.value = withSpring(1.1, MIC_SPRING_CONFIG);
          lockProgress.value = withTiming(0, { duration: 200 });
          runOnJS(onRecLock)();
        }
      }
    })
    .onEnd(() => {
      recPressActiveSV.value = false;
      directionLock.value = "none";
      if (!recLockedSV.value) {
        slideX.value = withSpring(0, MIC_SPRING_SNAP);
        slideY.value = withSpring(0, MIC_SPRING_SNAP);
        micScale.value = withSpring(1, MIC_SPRING_CONFIG);
        recBarOpacity.value = withTiming(0, { duration: 150 });
        cancelProgress.value = withTiming(0, { duration: 150 });
        lockProgress.value = withTiming(0, { duration: 150 });
      }
      if (recCancelledSV.value || recLockedSV.value) return;
      if (recStartedSV.value) {
        runOnJS(onRecSend)();
      }
    })
    .onFinalize(() => {
      recPressActiveSV.value = false;
    }), [onRecStart, onRecCancel, onRecLock, onRecSend]);

  const micBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: slideX.value },
      { translateY: slideY.value * 0.3 },
      { scale: micScale.value },
    ],
  }));

  const cancelZoneAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cancelProgress.value, [0, 0.3, 1], [0, 0.5, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(cancelProgress.value, [0, 1], [0.8, 1.15], Extrapolation.CLAMP) }],
  }));

  const slideHintAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(cancelProgress.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(chevronAnim.value, [0, 0.5, 1], [0, -8, 0], Extrapolation.CLAMP) }],
  }));

  const lockIndicatorAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lockProgress.value, [0, 0.3, 1], [0.3, 0.65, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(lockProgress.value, [0, 1], [0, -18], Extrapolation.CLAMP) },
      { scale: interpolate(lockProgress.value, [0, 1], [0.85, 1.1], Extrapolation.CLAMP) },
    ],
  }));

  const recBarAnimStyle = useAnimatedStyle(() => ({
    opacity: recBarOpacity.value,
  }));
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState("");
  const [attachmentPreview, setAttachmentPreview] = useState<{ uri: string; type: string; name?: string; mimeType?: string } | null>(null);
  const [networkOnline, setNetworkOnline] = useState(isOnline());
  const [messageLimited, setMessageLimited] = useState(false);
  const [isStranger, setIsStranger] = useState(false);
  const [strangerCountry, setStrangerCountry] = useState<string | null>(null);
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
  const chatInputRef = useRef<TextInput>(null);
  const typingTimeout = useRef<any>(null);
  const draftSaveTimer = useRef<any>(null);

  const effectiveChatId = isDraft ? realChatId : id;

  const loadChatInfo = useCallback(async () => {
    if (!id || !user || isDraft) return;
    // SQLite fallback (useEffect above) already hydrates chatInfo when offline —
    // skip the network round-trip so we don't leave a dangling fetch.
    if (!isOnline()) return;
    const { data: chat } = await supabase
      .from("chats")
      .select(`is_group, is_channel, name, avatar_url, chat_members(user_id, profiles(id, display_name, avatar_url, handle, is_verified, is_organization_verified, last_seen, show_online_status))`)
      .eq("id", id)
      .single();

    if (chat) {
      const others = (chat.chat_members || []).filter((m: any) => m.user_id !== user.id);
      const profileRaw = others[0]?.profiles;
      const other: any = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
      const memberIds = others.map((m: any) => m.profiles?.id).filter(Boolean) as string[];
      setChatInfo({
        is_group: !!chat.is_group,
        is_channel: !!chat.is_channel,
        name: chat.name,
        other_name: other?.display_name || "Unknown",
        other_avatar: other?.avatar_url || null,
        other_id: other?.id || "",
        member_ids: memberIds,
        avatar_url: chat.avatar_url,
        is_verified: !!other?.is_verified,
        is_organization_verified: !!other?.is_organization_verified,
        other_last_seen: other?.last_seen || null,
        other_show_online_status: other?.show_online_status !== false,
      });
    }
  }, [id, user, isDraft]);

  const loadMessages = useCallback(async () => {
    const chatId = isDraft ? realChatId : id;
    if (!chatId || !user) return;

    // ── Native-only: load from local SQLite cache first (instant render, no network) ──
    if (Platform.OS !== "web") {
      // getLocalMessages returns oldest-first (ASC). FlatList is inverted so index 0
      // must be the NEWEST message. Reverse to get newest-first.
      const clearedAt = await AsyncStorage.getItem(`chat_cleared_${user.id}_${chatId}`).catch(() => null);
      const allCached = await getLocalMessages(chatId, 5000);
      const cached = clearedAt ? allCached.filter((m) => m.sent_at > clearedAt) : allCached;
      if (cached.length > 0) {
        const newestFirst = [...cached].reverse();
        setMessages(newestFirst.map((m) => ({
          id: m.id, chat_id: m.conversation_id, sender_id: m.sender_id,
          encrypted_content: m.content ?? "", sent_at: m.sent_at,
          reply_to_message_id: m.reply_to_id, attachment_url: m.attachment_url,
          attachment_type: m.attachment_type, edited_at: m.edited_at,
          status: m.status as any, reactions: [], _pending: m.is_pending,
        })));
        setLoading(false);
        // Seed the pagination cursor from the OLDEST cached message.
        if (!oldestCursorRef.current) {
          oldestCursorRef.current = cached[0].sent_at;
          setHasMore(true);
        }
        // Background: pre-download attachments so they render from local storage.
        autoDownloadChatAttachments(cached.map((m) => ({
          attachment_url: m.attachment_url,
          attachment_type: m.attachment_type,
          encrypted_content: m.content ?? "",
        })));
        // Background: refresh reactions for cached messages so they reappear after navigation.
        const cachedIds = cached.map((m) => m.id).filter((cid) => !cid.startsWith("pending"));
        if (cachedIds.length > 0) {
          void supabase.from("message_reactions").select("message_id, reaction, user_id").in("message_id", cachedIds).then(({ data: cacheReactions }) => {
            if (!cacheReactions || cacheReactions.length === 0) return;
            const reactionMap: Record<string, { emoji: string; count: number; myReaction: boolean }[]> = {};
            for (const r of cacheReactions as any[]) {
              if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
              const existing = reactionMap[r.message_id].find((x) => x.emoji === r.reaction);
              if (existing) { existing.count++; if (r.user_id === user.id) existing.myReaction = true; }
              else reactionMap[r.message_id].push({ emoji: r.reaction, count: 1, myReaction: r.user_id === user.id });
            }
            const cachedIdSet = new Set(cachedIds);
            setMessages((prev) => prev.map((m) => {
              if (!cachedIdSet.has(m.id) || !reactionMap[m.id]) return m;
              return { ...m, reactions: reactionMap[m.id] };
            }));
          });
        }
      }

      // If offline on native: show cached messages only, do not attempt network.
      if (!isOnline()) {
        if (cached.length === 0) setLoading(false);
        return;
      }
    }

    // Delta sync: only fetch messages NEWER than what's already stored on device.
    // On web: always fetch fresh from the server (no local cache).
    const newestStored = Platform.OS !== "web" ? await getNewestMessageDate(chatId) : null;
    const clearedAtServer = Platform.OS !== "web"
      ? await AsyncStorage.getItem(`chat_cleared_${user.id}_${chatId}`).catch(() => null)
      : null;
    let msgQuery = supabase
      .from("messages")
      .select(`id, chat_id, sender_id, encrypted_content, sent_at, reply_to_message_id, attachment_url, attachment_type, edited_at, profiles!messages_sender_id_fkey(display_name, avatar_url, handle)`)
      .eq("chat_id", chatId)
      .order("sent_at", { ascending: false })
      .limit(100);
    if (newestStored) {
      msgQuery = msgQuery.gt("sent_at", newestStored);
    }
    if (clearedAtServer && (!newestStored || clearedAtServer > newestStored)) {
      msgQuery = msgQuery.gt("sent_at", clearedAtServer);
    }
    const { data } = await msgQuery;

    if (data) {
      const msgIds = data.map((m: any) => m.id);

      // ── Fast path: map and display messages immediately, no reactions yet ────
      const mapped = data.map((m: any) => {
        const isBot = m.sender_id === AFUAI_BOT_ID;
        const aiParsed = isBot ? parseAfuAiTags(m.encrypted_content || "") : null;
        return {
          id: m.id,
          chat_id: m.chat_id,
          sender_id: m.sender_id,
          encrypted_content: aiParsed ? (aiParsed.text || m.encrypted_content) : m.encrypted_content,
          sent_at: m.sent_at,
          reply_to_message_id: m.reply_to_message_id,
          attachment_url: m.attachment_url,
          attachment_type: m.attachment_type,
          edited_at: m.edited_at,
          sender: m.profiles,
          reactions: [],
          status: undefined as any,
          _isAi: isBot || undefined,
          _aiActions: aiParsed && aiParsed.actions.length > 0 ? aiParsed.actions : undefined,
          _aiInvoices: aiParsed && aiParsed.invoices.length > 0 ? aiParsed.invoices : undefined,
        };
      });

      // Display new messages the instant we have them — reactions paint after.
      setMessages((prev) => {
        if (mapped.length === 0) return prev;
        const serverIds = new Set(mapped.map((m: any) => m.id));
        const notInServer = prev.filter((m) => !serverIds.has(m.id));
        return [...mapped, ...notInServer].sort(
          (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
        );
      });

      if (Platform.OS !== "web") saveMessages(chatId, mapped).catch(() => {});
      if (Platform.OS !== "web") autoDownloadChatAttachments(mapped);
      clearUnread(chatId).catch(() => {});

      if (!newestStored) {
        oldestCursorRef.current = data.length > 0 ? data[data.length - 1].sent_at : null;
        setHasMore(data.length >= 50);
      }
      if (chatId) {
        markChatVisited(chatId);
        setActiveChatId(chatId);
      }

      // ── Background: enrich with reactions + delivery status ──────────────────
      // Fired after the UI already shows the messages — zero perceived latency.
      if (msgIds.length > 0) {
        Promise.all([
          supabase.from("message_reactions").select("message_id, reaction, user_id").in("message_id", msgIds),
          supabase.from("message_status").select("message_id, read_at, delivered_at").in("message_id", msgIds),
        ]).then(([{ data: reactions }, { data: statuses }]) => {
          const reactionMap: Record<string, { emoji: string; count: number; myReaction: boolean }[]> = {};
          for (const r of (reactions || []) as any[]) {
            if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
            const existing = reactionMap[r.message_id].find((x: any) => x.emoji === r.reaction);
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
          const msgIdSet = new Set(msgIds);
          setMessages((prev) =>
            prev.map((m) => {
              if (!msgIdSet.has(m.id)) return m;
              return {
                ...m,
                reactions: reactionMap[m.id] ?? m.reactions,
                status: m.sender_id === user.id
                  ? (readSet.has(m.id) ? "read" : deliveredSet.has(m.id) ? "delivered" : (m.status || "sent"))
                  : m.status,
              };
            })
          );
        }).catch(() => {});
      }

      // ── Background: mark incoming messages as read ────────────────────────────
      const unreadFromOthers = data.filter((m: any) => m.sender_id !== user.id);
      if (unreadFromOthers.length > 0) {
        const now = new Date().toISOString();
        const unreadIds = unreadFromOthers.map((m: any) => m.id);
        supabase.from("message_status")
          .select("message_id").eq("user_id", user.id).not("read_at", "is", null).in("message_id", unreadIds)
          .then(({ data: myReadRows }) => {
            const alreadyRead = new Set((myReadRows || []).map((r: any) => r.message_id));
            const toMark = unreadFromOthers.filter((m: any) => !alreadyRead.has(m.id));
            if (toMark.length > 0) {
              supabase.from("message_status").upsert(
                toMark.map((m: any) => ({
                  message_id: m.id,
                  user_id: user.id,
                  delivered_at: now,
                  read_at: now,
                })),
                { onConflict: "message_id,user_id" }
              ).then(() => {});
              typingChannelRef.current?.send({ type: "broadcast", event: "read", payload: { reader_id: user.id, message_ids: toMark.map((m: any) => m.id) } });
            }
          });
      }
    }
    setLoading(false);
  }, [id, user, isDraft, realChatId]);

  const loadMoreMessages = useCallback(async () => {
    const chatId = isDraft ? realChatId : id;
    if (!chatId || !user || loadingMore || !hasMore || !oldestCursorRef.current) return;
    setLoadingMore(true);
    const cursor = oldestCursorRef.current;
    const { data } = await supabase
      .from("messages")
      .select(`id, chat_id, sender_id, encrypted_content, sent_at, reply_to_message_id, attachment_url, attachment_type, edited_at, profiles!messages_sender_id_fkey(display_name, avatar_url, handle)`)
      .eq("chat_id", chatId)
      .lt("sent_at", cursor)
      .order("sent_at", { ascending: false })
      .limit(50);
    if (data && data.length > 0) {
      const msgIds = data.map((m: any) => m.id);
      const [{ data: reactions }, { data: statuses }] = await Promise.all([
        supabase.from("message_reactions").select("message_id, reaction, user_id").in("message_id", msgIds),
        supabase.from("message_status").select("message_id, read_at, delivered_at").in("message_id", msgIds),
      ]);
      const reactionMap: Record<string, { emoji: string; count: number; myReaction: boolean }[]> = {};
      for (const r of (reactions || []) as any[]) {
        if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
        const existing = reactionMap[r.message_id].find((x: any) => x.emoji === r.reaction);
        if (existing) { existing.count++; if (r.user_id === user.id) existing.myReaction = true; }
        else reactionMap[r.message_id].push({ emoji: r.reaction, count: 1, myReaction: r.user_id === user.id });
      }
      const readSet = new Set<string>();
      const deliveredSet = new Set<string>();
      for (const s of (statuses || []) as any[]) {
        if (s.read_at) readSet.add(s.message_id);
        else if (s.delivered_at) deliveredSet.add(s.message_id);
      }
      const mapped = data.map((m: any) => {
        const isBot = m.sender_id === AFUAI_BOT_ID;
        const aiParsed = isBot ? parseAfuAiTags(m.encrypted_content || "") : null;
        return {
          id: m.id, chat_id: m.chat_id, sender_id: m.sender_id,
          encrypted_content: aiParsed ? (aiParsed.text || m.encrypted_content) : m.encrypted_content,
          sent_at: m.sent_at, reply_to_message_id: m.reply_to_message_id,
          attachment_url: m.attachment_url, attachment_type: m.attachment_type, edited_at: m.edited_at,
          sender: m.profiles, reactions: reactionMap[m.id] || [],
          status: m.sender_id === user.id
            ? (readSet.has(m.id) ? "read" : deliveredSet.has(m.id) ? "delivered" : "sent")
            : undefined,
          _isAi: isBot || undefined,
          _aiActions: aiParsed && aiParsed.actions.length > 0 ? aiParsed.actions : undefined,
          _aiInvoices: aiParsed && aiParsed.invoices.length > 0 ? aiParsed.invoices : undefined,
        };
      });
      oldestCursorRef.current = data[data.length - 1].sent_at;
      setHasMore(data.length >= 50);
      setMessages((prev) => [...prev, ...mapped]);
    } else {
      setHasMore(false);
    }
    setLoadingMore(false);
  }, [id, user, isDraft, realChatId, loadingMore, hasMore]);

  useEffect(() => {
    // Native-only: web has no offline queue and no connectivity events to handle.
    if (Platform.OS === "web") return;
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

  useEffect(() => {
    return () => {
      clearInterval(recordingTimer.current);
      clearInterval(meterInterval.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
        resetToPlaybackMode().catch(() => {});
      }
    };
  }, []);

  const checkMessageGating = useCallback(async () => {
    if (!user) return;
    const info = chatInfo;
    if (!info || info.is_group || info.is_channel || !info.other_id || info.other_id === AFUAI_BOT_ID) {
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

  const checkIfStranger = useCallback(async () => {
    if (!user) return;
    const info = chatInfo;
    if (!info || info.is_group || info.is_channel || !info.other_id || info.other_id === AFUAI_BOT_ID) {
      setIsStranger(false);
      return;
    }
    const otherId = info.other_id;
    const { data: iFollow } = await supabase
      .from("follows").select("id").eq("follower_id", user.id).eq("following_id", otherId).maybeSingle();
    if (iFollow) { setIsStranger(false); return; }

    const chatId = isDraft ? realChatId : id;
    if (!chatId) { setIsStranger(false); return; }
    const { data: theirMsgs } = await supabase
      .from("messages").select("id").eq("chat_id", chatId).eq("sender_id", otherId).limit(1);
    const theyMessagedMe = theirMsgs && theirMsgs.length > 0;
    if (!theyMessagedMe) { setIsStranger(false); return; }

    const { data: myMsgs } = await supabase
      .from("messages").select("id").eq("chat_id", chatId).eq("sender_id", user.id).limit(1);
    const iReplied = myMsgs && myMsgs.length > 0;
    if (iReplied) { setIsStranger(false); return; }

    const { data: otherProfile } = await supabase
      .from("profiles").select("country").eq("id", otherId).maybeSingle();
    setStrangerCountry((otherProfile as any)?.country || null);
    setIsStranger(true);
  }, [user, chatInfo, isDraft, realChatId, id]);

  useEffect(() => {
    checkMessageGating();
    checkIfStranger();
  }, [checkMessageGating, checkIfStranger, messages.length]);


  useEffect(() => {
    if (isDraft) return;

    loadChatInfo();
    loadMessages();

    const msgSub = supabase
      .channel(`chat:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${id}` },
        async (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.sender_id === user?.id) return;
          if (newMsg.sender_id === AFUAI_BOT_ID) return;
          const { data: senderProfile } = await supabase.from("profiles").select("display_name, avatar_url, handle").eq("id", newMsg.sender_id).single();
          setMessages((prev) => [{ ...newMsg, sender: senderProfile as any, reactions: [], status: undefined }, ...prev]);
          // Auto-download images/gifs/audio on incoming messages (NOT files — user must tap)
          if (newMsg.attachment_url && newMsg.attachment_type &&
              newMsg.attachment_type !== "video" && newMsg.attachment_type !== "file") {
            ensureChatAttachmentDownloaded(newMsg.attachment_url, newMsg.attachment_type).catch(() => {});
          }
          playNotificationSound();
          if (showScrollBtnRef.current) {
            setNewMsgCount((c) => c + 1);
          }

          if (user) {
            supabase.from("message_status").upsert({ message_id: newMsg.id, user_id: user.id, delivered_at: new Date().toISOString(), read_at: new Date().toISOString() }, { onConflict: "message_id,user_id" }).then(() => {});
            typingChannelRef.current?.send({ type: "broadcast", event: "read", payload: { reader_id: user.id, message_ids: [newMsg.id] } });
            markChatVisited(id);
          }
        }
      )
      // Real-time reaction sync — someone added a reaction
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.new as any;
          if (r.user_id === user?.id) return; // already handled optimistically
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== r.message_id) return m;
              const reactions = [...(m.reactions || [])];
              const idx = reactions.findIndex((x) => x.emoji === r.reaction);
              if (idx >= 0) {
                reactions[idx] = { ...reactions[idx], count: reactions[idx].count + 1 };
              } else {
                reactions.push({ emoji: r.reaction, count: 1, myReaction: false });
              }
              return { ...m, reactions };
            })
          );
        }
      )
      // Real-time reaction sync — someone removed a reaction
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.old as any;
          if (r.user_id === user?.id) return; // already handled optimistically
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== r.message_id) return m;
              const reactions = (m.reactions || [])
                .map((x) => x.emoji === r.reaction ? { ...x, count: Math.max(0, x.count - 1) } : x)
                .filter((x) => x.count > 0);
              return { ...m, reactions };
            })
          );
        }
      )
      .subscribe();

    const typingChannel = supabase.channel(`typing:${id}`, { config: { broadcast: { self: false } } });
    typingChannelRef.current = typingChannel;

    typingChannel
      .on("broadcast", { event: "typing" }, (payload) => {
        const { user_id: uid, display_name: name, is_typing } = (payload.payload || {}) as any;
        if (!uid || uid === user?.id) return;

        const clearTyper = () => {
          if (typingTimersRef.current.has(uid)) {
            clearTimeout(typingTimersRef.current.get(uid)!);
            typingTimersRef.current.delete(uid);
          }
          typingMapRef.current.delete(uid);
          setTypingUsers(Array.from(typingMapRef.current.values()));
        };

        if (is_typing) {
          typingMapRef.current.set(uid, name || "Someone");
          if (typingTimersRef.current.has(uid)) clearTimeout(typingTimersRef.current.get(uid)!);
          typingTimersRef.current.set(uid, setTimeout(clearTyper, 6000));
          setTypingUsers(Array.from(typingMapRef.current.values()));
        } else {
          clearTyper();
        }
      })
      .on("broadcast", { event: "read" }, (payload) => {
        const { reader_id, message_ids } = (payload.payload || {}) as { reader_id: string; message_ids: string[] };
        if (!reader_id || reader_id === user?.id || !Array.isArray(message_ids)) return;
        const readSet = new Set(message_ids);
        setMessages((prev) =>
          prev.map((m) =>
            m.sender_id === user?.id && readSet.has(m.id)
              ? { ...m, status: "read" as const }
              : m
          )
        );
      })
      .subscribe();

    return () => {
      clearActiveChatId();
      supabase.removeChannel(msgSub);
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
      typingTimersRef.current.forEach((t) => clearTimeout(t));
      typingTimersRef.current.clear();
      typingMapRef.current.clear();
    };
  }, [id, loadChatInfo, loadMessages]);

  // ── Realtime: online status (1-on-1 chats only) ───────────────────────────
  useEffect(() => {
    const otherId = chatInfo?.other_id;
    if (!otherId || chatInfo?.is_group || chatInfo?.is_channel || isDraft) return;

    const presenceSub = supabase
      .channel(`presence-watch:${id}:${otherId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${otherId}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated?.last_seen) {
            setChatInfo((prev) => prev ? { ...prev, other_last_seen: updated.last_seen } : prev);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(presenceSub);
    };
  }, [chatInfo?.other_id, chatInfo?.is_group, chatInfo?.is_channel, id, isDraft]);

  function handleTyping() {
    if (!user || !id || isDraft) return;
    if (!chatPrefs.typing_indicators) return;
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: user.id, display_name: profile?.display_name || "Someone", is_typing: true },
    });
    typingTimeout.current = setTimeout(() => {
      typingChannelRef.current?.send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: user.id, display_name: profile?.display_name || "Someone", is_typing: false },
      });
    }, 3000);
  }

  function saveDraft(text: string) {
    if (!id || !advancedFeatures.offline_drafts) return;
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
          else { AsyncStorage.getItem(`chat_draft_${id}`).then((draft) => { if (draft) setInput(draft); }).then(undefined, () => {}); }
        })
        .then(undefined, () => { AsyncStorage.getItem(`chat_draft_${id}`).then((draft) => { if (draft) setInput(draft); }).then(undefined, () => {}); });
    } else {
      AsyncStorage.getItem(`chat_draft_${id}`).then((draft) => { if (draft) setInput(draft); }).catch(() => {});
    }
  }, [id, user?.id]);

  // Auto-send a pre-filled message (e.g. from AI Lens "Ask AfuAI" button).
  // Fires once after the chat finishes loading and only for AfuAI direct chats.
  useEffect(() => {
    if (!initialMessage || !user || loading || autoSentInitialRef.current) return;
    if (chatInfo?.other_id !== AFUAI_BOT_ID) return;
    autoSentInitialRef.current = true;
    const t = setTimeout(() => {
      sendMessage(decodeURIComponent(initialMessage as string));
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, chatInfo?.other_id, initialMessage]);

  // AI Lens → Chat: immediately inject a rich AI intro message so the user
  // arrives in a chat that already has AI-generated content about their scan.
  useEffect(() => {
    if (!lensIntro || lensIntro !== "true") return;
    if (!user || loading || lensInjectedRef.current) return;
    if (chatInfo?.other_id !== AFUAI_BOT_ID) return;
    lensInjectedRef.current = true;
    AsyncStorage.getItem("afuai_lens_context").then((raw) => {
      if (!raw) return;
      try {
        const ctx = JSON.parse(raw);
        if (!ctx.expiresAt || ctx.expiresAt <= Date.now()) return;
        AsyncStorage.removeItem("afuai_lens_context").catch(() => {});
        const factsBlock = ctx.facts?.length
          ? `\n\nKey facts:\n${(ctx.facts as string[]).map((f) => `• ${f}`).join("\n")}`
          : "";
        const answerBlock = ctx.answer ? `\n\n${ctx.answer}` : "";
        const suggestions = [
          `[SUGGEST:Tell me more about ${ctx.title}]`,
          `[SUGGEST:How is this used?]`,
          `[SUGGEST:What else should I know?]`,
        ].join("");
        const content =
          `**${ctx.title}**\n\n${ctx.description}${factsBlock}${answerBlock}${suggestions}`;
        const introMsg: Message = {
          id: `lens_intro_${Date.now()}`,
          chat_id: id as string,
          sender_id: AFUAI_BOT_ID,
          encrypted_content: content,
          sent_at: new Date().toISOString(),
          sender: { display_name: "AfuAI", avatar_url: null, handle: "afuai" },
          reactions: [],
          _isAi: true,
        };
        setMessages((prev) => {
          if (prev.some((m) => m.id === introMsg.id)) return prev;
          return [...prev, introMsg];
        });
      } catch {}
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, chatInfo?.other_id, lensIntro]);

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

  async function getAfuAiUserContext(): Promise<string> {
    if (!user || !profile) return "";
    try {
      const [
        { count: followersCount }, { count: followingCount }, { count: postsCount },
        { data: subData }, { data: recentAcoinTx }, { data: recentNexaSent }, { data: recentNexaRecv },
      ] = await Promise.all([
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", user.id),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id),
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", user.id),
        supabase.from("user_subscriptions").select("plan_id, is_active, expires_at, subscription_plans(name, tier)").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
        supabase.from("acoin_transactions").select("id, amount, transaction_type, created_at, nexa_spent, fee_charged, metadata").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("xp_transfers").select("id, amount, created_at, status, receiver:profiles!xp_transfers_receiver_id_fkey(handle, display_name)").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("xp_transfers").select("id, amount, created_at, status, sender:profiles!xp_transfers_sender_id_fkey(handle, display_name)").eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(5),
      ]);
      const premium = subData ? `${(subData as any).subscription_plans?.name} (${(subData as any).subscription_plans?.tier})` : "None";
      const txLines: string[] = [];
      (recentAcoinTx || []).forEach((t: any) => {
        const date = new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const meta = t.metadata || {};
        txLines.push(`  - [ref:${t.id}] ${date}: ${t.transaction_type} ${t.amount > 0 ? "+" : ""}${t.amount} ACoin${meta.plan_name ? ` (${meta.plan_name})` : ""}${meta.to_handle ? ` to @${meta.to_handle}` : ""}${meta.from_handle ? ` from @${meta.from_handle}` : ""}${t.nexa_spent ? ` [${t.nexa_spent} Nexa spent]` : ""}${t.fee_charged ? ` [fee: ${t.fee_charged}]` : ""}`);
      });
      (recentNexaSent || []).forEach((t: any) => {
        const recv = t.receiver;
        txLines.push(`  - [ref:${t.id}] ${new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: Sent ${t.amount} Nexa to @${recv?.handle || "unknown"}`);
      });
      (recentNexaRecv || []).forEach((t: any) => {
        const sndr = t.sender;
        txLines.push(`  - [ref:${t.id}] ${new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: Received ${t.amount} Nexa from @${sndr?.handle || "unknown"}`);
      });
      return `USER CONTEXT:\n- Name: ${profile.display_name}\n- Handle: @${profile.handle}\n- Nexa: ${profile.xp || 0}\n- ACoin: ${profile.acoin || 0}\n- Grade: ${profile.current_grade || "Newcomer"}\n- Followers: ${followersCount || 0}, Following: ${followingCount || 0}, Posts: ${postsCount || 0}\n- Premium: ${premium}\nRECENT TRANSACTIONS:\n${txLines.join("\n") || "  None"}`;
    } catch { return ""; }
  }

  function parseAfuAiTags(raw: string): { text: string; actions: AiActionButton[]; suggestions: string[]; invoices: AiInvoiceData[]; execAction?: { actionType: string; params: Record<string, any> } } {
    let text = raw;
    const actions: AiActionButton[] = [];
    const suggestions: string[] = [];
    const invoices: AiInvoiceData[] = [];
    let execAction: { actionType: string; params: Record<string, any> } | undefined;
    text = text.replace(/\[ACTION:([^\]:]+):([^\]]+)\]/g, (_, label, route) => {
      const r = route.trim();
      let icon = "arrow-forward-circle";
      if (r.includes("wallet")) icon = "wallet";
      else if (r.includes("gift")) icon = "gift";
      else if (r.includes("premium")) icon = "star";
      else if (r.includes("profile") || r.startsWith("/@") || r.match(/^\/[a-z0-9_]+$/) && !r.includes("-")) icon = "person";
      else if (r.includes("settings")) icon = "settings";
      else if (r.includes("search") || r.includes("/search")) icon = "search";
      else if (r.includes("username-market")) icon = "at";
      else if (r.includes("chat")) icon = "chatbubble";
      else if (r.includes("discover") || r.includes("user-discovery")) icon = "compass";
      actions.push({ label: label.trim(), icon, action: "navigate", params: { route: r } });
      return "";
    });
    text = text.replace(/\[SUGGEST:([^\]]+)\]/g, (_, s) => {
      const t = s.trim();
      if (t && suggestions.length < 3 && !suggestions.includes(t)) suggestions.push(t);
      return "";
    });
    text = text.replace(/\[INVOICE:(.*?)\]/gs, (_, j) => {
      try { invoices.push(JSON.parse(j.trim())); } catch {}
      return "";
    });
    text = text.replace(/\[EXEC:(\w+):(.*?)\]/gs, (_, actionType, j) => {
      try { execAction = { actionType, params: JSON.parse(j.trim()) }; } catch {}
      return "";
    });
    text = text.replace(/\b(go to|visit|navigate to|open|tap|click)\s+(\/[\w\-/]+)/gi, (_, verb, route) => {
      const label = route.replace(/^\//, "").replace(/\//g, " › ").replace(/-/g, " ");
      actions.push({ label: label.charAt(0).toUpperCase() + label.slice(1), icon: "arrow-forward-circle", action: "navigate", params: { route: route.trim() } });
      return "";
    });
    text = text.replace(/\s\/[\w][\w\-/]*/g, " ");
    text = text.replace(/\s+/g, " ");
    return { text: text.trim(), actions, suggestions, invoices, execAction };
  }

  async function executeAfuAiAction(ea: AiExecAction): Promise<{ success: boolean; message: string; invoice?: AiInvoiceData }> {
    if (!user || !profile) return { success: false, message: "Not logged in" };
    const freshProfile = async () => (await supabase.from("profiles").select("xp, acoin, handle").eq("id", user.id).single()).data as { xp: number; acoin: number; handle: string } | null;
    switch (ea.actionType) {
      case "send_nexa": {
        const { handle, amount, message: msg } = ea.params;
        const amt = parseInt(amount);
        if (!handle || isNaN(amt) || amt <= 0) return { success: false, message: "Invalid handle or amount" };
        const live = await freshProfile();
        if (!live || amt > (live.xp || 0)) return { success: false, message: `Insufficient Nexa. You have ${live?.xp || 0}` };
        const { data: recipient } = await supabase.from("profiles").select("id, display_name").eq("handle", handle.toLowerCase()).single();
        if (!recipient) return { success: false, message: `User @${handle} not found` };
        if (recipient.id === user.id) return { success: false, message: "Cannot send to yourself" };
        const { data: ded, error: dedErr } = await supabase.from("profiles").update({ xp: (live.xp || 0) - amt }).eq("id", user.id).gte("xp", amt).select("id").maybeSingle();
        if (dedErr || !ded) return { success: false, message: "Could not deduct Nexa" };
        await supabase.rpc("award_xp", { p_user_id: recipient.id, p_action_type: "nexa_transfer_received", p_xp_amount: amt, p_metadata: { from_user_id: user.id, from_handle: live.handle } });
        await supabase.from("xp_transfers").insert({ sender_id: user.id, receiver_id: recipient.id, amount: amt, message: msg || null });
        return { success: true, message: `Sent ${amt} Nexa to ${(recipient as any).display_name}`, invoice: { type: "Nexa Transfer", date: new Date().toISOString(), from: `@${live.handle}`, to: `@${handle}`, amount: amt, currency: "Nexa", reference: `NXA-${Date.now().toString(36).toUpperCase()}`, status: "Completed" } };
      }
      case "send_acoin": {
        const { handle, amount, message: msg } = ea.params;
        const acAmt = parseInt(amount);
        if (!handle || isNaN(acAmt) || acAmt <= 0) return { success: false, message: "Invalid handle or amount" };
        const live = await freshProfile();
        if (!live || acAmt > (live.acoin || 0)) return { success: false, message: `Insufficient ACoin. You have ${live?.acoin || 0}` };
        const { data: recip } = await supabase.from("profiles").select("id, display_name").eq("handle", handle.toLowerCase()).single();
        if (!recip) return { success: false, message: `User @${handle} not found` };
        if (recip.id === user.id) return { success: false, message: "Cannot send to yourself" };
        const { error: dedErr } = await supabase.rpc("deduct_acoin", { p_user_id: user.id, p_amount: acAmt }).maybeSingle();
        if (dedErr) return { success: false, message: "Could not deduct ACoin" };
        await supabase.rpc("credit_acoin", { p_user_id: recip.id, p_amount: acAmt });
        await supabase.from("acoin_transactions").insert([{ user_id: user.id, amount: -acAmt, transaction_type: "acoin_transfer_sent", metadata: { to_user_id: recip.id, to_handle: handle, message: msg || null } }, { user_id: recip.id, amount: acAmt, transaction_type: "acoin_transfer_received", metadata: { from_user_id: user.id, from_handle: live.handle, message: msg || null } }]);
        return { success: true, message: `Sent ${acAmt} ACoin to ${(recip as any).display_name}`, invoice: { type: "ACoin Transfer", date: new Date().toISOString(), from: `@${live.handle}`, to: `@${handle}`, amount: acAmt, currency: "ACoin", reference: `ACN-${Date.now().toString(36).toUpperCase()}`, status: "Completed" } };
      }
      case "follow": {
        const { handle } = ea.params;
        if (!handle) return { success: false, message: "Missing handle" };
        const { data: target } = await supabase.from("profiles").select("id, display_name").eq("handle", handle.toLowerCase()).single();
        if (!target) return { success: false, message: `User @${handle} not found` };
        if (target.id === user.id) return { success: false, message: "Cannot follow yourself" };
        const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: target.id });
        if (error) return { success: false, message: error.message };
        return { success: true, message: `You now follow ${(target as any).display_name} (@${handle})` };
      }
      case "unfollow": {
        const { handle } = ea.params;
        const { data: target } = await supabase.from("profiles").select("id, display_name").eq("handle", handle.toLowerCase()).single();
        if (!target) return { success: false, message: `User @${handle} not found` };
        await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", target.id);
        return { success: true, message: `Unfollowed @${handle}` };
      }
      case "subscribe": {
        const { tier } = ea.params;
        const { data: plan } = await supabase.from("subscription_plans").select("id, name, tier, acoin_price, duration_days").eq("tier", tier.toLowerCase()).eq("is_active", true).single();
        if (!plan) return { success: false, message: `Plan '${tier}' not found` };
        const p = plan as any;
        const live = await freshProfile();
        if (!live || (live.acoin || 0) < p.acoin_price) return { success: false, message: `Insufficient ACoin. Need ${p.acoin_price}` };
        const { data: ded, error: dedErr } = await supabase.from("profiles").update({ acoin: (live.acoin || 0) - p.acoin_price }).eq("id", user.id).gte("acoin", p.acoin_price).select("id").maybeSingle();
        if (dedErr || !ded) return { success: false, message: "Could not deduct ACoin" };
        const exp = new Date(); exp.setDate(exp.getDate() + p.duration_days);
        await supabase.from("user_subscriptions").upsert({ user_id: user.id, plan_id: p.id, started_at: new Date().toISOString(), expires_at: exp.toISOString(), is_active: true, acoin_paid: p.acoin_price }, { onConflict: "user_id" });
        await supabase.from("acoin_transactions").insert({ user_id: user.id, amount: -p.acoin_price, transaction_type: "subscription", metadata: { plan_name: p.name, plan_tier: p.tier, duration_days: p.duration_days } });
        return { success: true, message: `Subscribed to ${p.name}! Active for ${p.duration_days} days.`, invoice: { type: "Premium Subscription", date: new Date().toISOString(), amount: p.acoin_price, currency: "ACoin", reference: `SUB-${Date.now().toString(36).toUpperCase()}`, status: "Completed", description: `${p.name} — ${p.duration_days} days` } };
      }
      case "cancel_subscription": {
        const { error } = await supabase.rpc("cancel_my_subscription");
        if (error) return { success: false, message: error.message };
        return { success: true, message: "Subscription cancelled. You're now on the free plan." };
      }
      case "convert_nexa": {
        const { amount } = ea.params;
        const nAmt = parseInt(amount);
        if (isNaN(nAmt) || nAmt <= 0) return { success: false, message: "Invalid amount" };
        const live = await freshProfile();
        if (!live || nAmt > (live.xp || 0)) return { success: false, message: `Insufficient Nexa. You have ${live?.xp || 0}` };
        const { data: settings } = await supabase.from("currency_settings").select("nexa_to_acoin_rate, conversion_fee_percent").limit(1).single();
        if (!settings) return { success: false, message: "Currency settings not available" };
        const s = settings as any;
        const raw = nAmt / s.nexa_to_acoin_rate;
        const fee = Math.ceil(raw * (s.conversion_fee_percent / 100));
        const net = Math.floor(raw - fee);
        if (net <= 0) return { success: false, message: "Amount too small after fees" };
        const { data: cv, error } = await supabase.from("profiles").update({ xp: (live.xp || 0) - nAmt, acoin: (live.acoin || 0) + net }).eq("id", user.id).gte("xp", nAmt).select("id").maybeSingle();
        if (error || !cv) return { success: false, message: "Conversion failed — balance may have changed" };
        await supabase.from("acoin_transactions").insert({ user_id: user.id, amount: net, transaction_type: "conversion", nexa_spent: nAmt, fee_charged: fee, metadata: { rate: s.nexa_to_acoin_rate, fee_percent: s.conversion_fee_percent } });
        return { success: true, message: `Converted ${nAmt} Nexa → ${net} ACoin`, invoice: { type: "Currency Conversion", date: new Date().toISOString(), amount: nAmt, currency: "Nexa", fee, net, reference: `CNV-${Date.now().toString(36).toUpperCase()}`, status: "Completed", description: `Rate: ${s.nexa_to_acoin_rate} Nexa = 1 ACoin, Fee: ${s.conversion_fee_percent}%` } };
      }
      default: return { success: false, message: `Unknown action: ${ea.actionType}` };
    }
  }

  function handleConfirmAiExec(msgId: string) {
    const msg = messages.find(m => m.id === msgId);
    if (!msg?._aiExecAction || msg._aiExecAction.status !== "pending") return;
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, _aiExecAction: { ...m._aiExecAction!, status: "executing" as const } } : m));
    executeAfuAiAction(msg._aiExecAction).then(result => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, _aiExecAction: { ...m._aiExecAction!, status: result.success ? "success" as const : "failed" as const, result: result.message, invoice: result.invoice } } : m));
      if (result.success) { refreshProfile?.(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    }).catch(err => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, _aiExecAction: { ...m._aiExecAction!, status: "failed" as const, result: err?.message || "Something went wrong" } } : m));
    });
  }

  function handleCancelAiExec(msgId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, _aiExecAction: { ...m._aiExecAction!, status: "failed" as const, result: "Cancelled" } } : m));
  }

  async function clearAfuAiChatHistory() {
    const chatId = isDraft ? realChatId : id;
    if (!chatId) return;
    showAlert(
      "Clear chat history",
      "This will permanently delete all messages in this conversation and start a fresh thread. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setShowAfuAiMenu(false);
            try {
              const { error } = await supabase.rpc("clear_afuai_chat", { p_chat_id: chatId });
              if (error) throw error;
              setMessages([]);
            } catch (e) {
              showAlert("Error", "Could not clear chat history. Please try again.");
            }
          },
        },
      ]
    );
  }

  // ── Chat Options handlers ─────────────────────────────────────────────────

  useEffect(() => {
    const chatId = isDraft ? realChatId : id;
    if (!chatId || !user) return;
    AsyncStorage.getItem(`afu_muted_${chatId}`).then((v) => setIsMuted(v === "1")).catch(() => {});
    AsyncStorage.getItem(`afu_disappearing_${chatId}`).then((v) => setDisappearingEnabled(v === "1")).catch(() => {});
    AsyncStorage.getItem(`afu_disappearing_timer_${chatId}`).then((v) => { if (v) setDisappearingTimer(parseInt(v, 10)); }).catch(() => {});
    if (chatInfo?.other_id && !chatInfo.is_group && !chatInfo.is_channel) {
      supabase.from("blocks").select("id").eq("blocker_id", user.id).eq("blocked_id", chatInfo.other_id).maybeSingle()
        .then(({ data }: any) => setIsBlocked(!!data), () => {});
    }
  }, [id, realChatId, isDraft, user?.id, chatInfo?.other_id]);

  async function handleMuteToggle() {
    const chatId = isDraft ? realChatId : id;
    if (!chatId) return;
    const next = !isMuted;
    setIsMuted(next);
    await AsyncStorage.setItem(`afu_muted_${chatId}`, next ? "1" : "0");
  }

  async function handleDisappearingToggle() {
    const chatId = isDraft ? realChatId : id;
    if (!chatId) return;
    const next = !disappearingEnabled;
    setDisappearingEnabled(next);
    if (!next) setShowDisappearingPicker(false);
    await AsyncStorage.setItem(`afu_disappearing_${chatId}`, next ? "1" : "0");
  }

  async function handleDisappearingTimerSelect(seconds: number) {
    const chatId = isDraft ? realChatId : id;
    if (!chatId) return;
    if (seconds === 0) {
      setDisappearingEnabled(false);
      setDisappearingTimer(86400);
      setShowDisappearingPicker(false);
      await AsyncStorage.setItem(`afu_disappearing_${chatId}`, "0");
      await AsyncStorage.removeItem(`afu_disappearing_timer_${chatId}`);
    } else {
      setDisappearingEnabled(true);
      setDisappearingTimer(seconds);
      setShowDisappearingPicker(false);
      await AsyncStorage.setItem(`afu_disappearing_${chatId}`, "1");
      await AsyncStorage.setItem(`afu_disappearing_timer_${chatId}`, String(seconds));
    }
  }

  async function handleBlockUser() {
    if (!user || !chatInfo?.other_id) return;
    if (isBlocked) {
      showAlert("Unblock User", `Allow ${headerTitle} to message you again?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", chatInfo.other_id!);
            setIsBlocked(false);
            setShowChatOptions(false);
          },
        },
      ]);
    } else {
      showAlert("Block User", `Block ${headerTitle}? They won't be able to send you messages.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: chatInfo.other_id });
            setIsBlocked(true);
            setShowChatOptions(false);
          },
        },
      ]);
    }
  }

  async function handleReportUser() {
    if (!user || !chatInfo?.other_id) return;
    showAlert("Report User", `Why are you reporting ${headerTitle}?`, [
      { text: "Spam", onPress: async () => { await supabase.from("user_reports").insert({ reporter_id: user.id, reported_id: chatInfo.other_id, reason: "spam" }); setShowChatOptions(false); showAlert("Reported", "Thank you. We'll review this report."); } },
      { text: "Harassment", onPress: async () => { await supabase.from("user_reports").insert({ reporter_id: user.id, reported_id: chatInfo.other_id, reason: "harassment" }); setShowChatOptions(false); showAlert("Reported", "Thank you. We'll review this report."); } },
      { text: "Inappropriate Content", onPress: async () => { await supabase.from("user_reports").insert({ reporter_id: user.id, reported_id: chatInfo.other_id, reason: "inappropriate" }); setShowChatOptions(false); showAlert("Reported", "Thank you. We'll review this report."); } },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function handleClearChatMessages() {
    const chatId = isDraft ? realChatId : id;
    if (!chatId || !user) return;
    const isGroupOrChannel = chatInfo?.is_group || chatInfo?.is_channel;
    const subtitle = isGroupOrChannel
      ? "This clears the chat for you only — other members won't be affected. This cannot be undone."
      : "This clears the chat for you only. This cannot be undone.";
    showAlert("Clear Chat", subtitle, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          setShowChatOptions(false);
          try {
            const clearedAt = new Date().toISOString();
            await AsyncStorage.setItem(`chat_cleared_${user.id}_${chatId}`, clearedAt);
            if (Platform.OS !== "web") {
              await deleteAllLocalMessages(chatId);
            }
            if (chatInfo?.other_id === AFUAI_BOT_ID) {
              await supabase.rpc("clear_afuai_chat", { p_chat_id: chatId }).catch(() => {});
            }
            setMessages([]);
          } catch {
            showAlert("Error", "Could not clear chat. Please try again.");
          }
        },
      },
    ]);
  }

  async function handleDeleteChat() {
    const chatId = isDraft ? realChatId : id;
    if (!chatId || !user) return;
    const isGroup = chatInfo?.is_group || chatInfo?.is_channel;
    showAlert(
      isGroup ? "Leave Group" : "Delete Chat",
      isGroup
        ? `Leave this ${chatInfo?.is_channel ? "channel" : "group"}? You won't receive messages anymore.`
        : "Delete this conversation? All messages will be removed for you.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isGroup ? "Leave" : "Delete",
          style: "destructive",
          onPress: async () => {
            setShowChatOptions(false);
            try {
              if (isGroup) {
                await supabase.from("chat_members").delete().eq("chat_id", chatId).eq("user_id", user.id);
              } else {
                await supabase.from("messages").delete().eq("chat_id", chatId);
                await supabase.from("conversations").delete().eq("id", chatId);
              }
              router.back();
            } catch {
              showAlert("Error", "Could not complete this action. Please try again.");
            }
          },
        },
      ]
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  async function handleAfuAiResponse(userText: string, currentMessages: Message[], activeChatId?: string) {
    setIsAfuAiTyping(true);
    const chatId = activeChatId || (isDraft ? realChatId : id) || id;

    // ── Voice-activated navigation fast-path ─────────────────────────────────
    // Detects explicit commands like "take me to wallet" / "open settings" and
    // handles them instantly — no AI round-trip needed for simple nav requests.
    const navCommand = detectVoiceNavCommand(userText);
    if (navCommand) {
      const { route, label } = navCommand;
      const confirmText = pickNavConfirmation(label);
      const sentAt = new Date().toISOString();

      // Speak confirmation if TTS is enabled in Language Settings
      if (ttsEnabled) {
        Speech.isSpeakingAsync()
          .then((speaking) => {
            if (speaking) Speech.stop();
            Speech.speak(`Sure! Taking you to ${label}.`, { rate: 0.92, pitch: 1.05 });
          })
          .catch(() => {});
      }

      // Insert AfuAI confirmation bubble immediately (appears while navigating)
      setMessages((prev) => [{
        id: `afuai_nav_${Date.now()}`,
        chat_id: chatId,
        sender_id: AFUAI_BOT_ID,
        encrypted_content: confirmText,
        sent_at: sentAt,
        sender: { display_name: "AfuAI", avatar_url: null, handle: "afuai" },
        reactions: [],
        _isAi: true,
        _aiSuggestions: [`What can I do in ${label}?`, "Go back to chat"],
      }, ...prev]);

      // Persist confirmation message to DB in background (fire-and-forget)
      (async () => { try { await supabase.rpc("insert_afuai_message", { p_chat_id: chatId, p_content: confirmText }); } catch {} })();

      // Navigate after a short delay so the confirmation bubble can animate in
      setTimeout(() => router.push(route as any), 750);

      setIsAfuAiTyping(false);
      return;
    }
    // ── End voice-activated navigation ────────────────────────────────────────

    try {
      const userContext = await getAfuAiUserContext();
      const platformContext = buildNavigationContext();
      const systemPrompt = `You are AfuAI, a capable and professional AI assistant built into AfuChat — a social super-app from Uganda. You can help with anything: writing, coding, math, advice, research, creative work, translations, general questions, and more.

You have access to the user's AfuChat account data below. Only reference it when the user asks about their account, balance, transactions, followers, or anything platform-related.

${userContext}

PLATFORM KNOWLEDGE — use this to answer any question about how the app works, where to find features, or how to navigate:
${platformContext}

${ACTION_ROUTES_GUIDE}

FORMATTING — you can use rich text in your responses:
- **bold**, *italic*, \`inline code\`
- \`\`\`language\\ncode block\\n\`\`\`
- ## Heading, ### Subheading
- - bullet list items
- 1. numbered list items

SPECIAL TAGS — append these at the end of your response when relevant:
- [SUGGEST:Follow-up question] — add up to 3 natural follow-up suggestions (e.g. [SUGGEST:What is my Nexa balance?])
- [ACTION:Button label:/route] — add a tappable in-app navigation button using any valid route from the routes guide above
- [EXEC:action_type:{"param":"value"}] — in-app action. ONLY use when the user explicitly asks. Explain what you will do in text first, then add the tag.
  Supported actions:
  · send_nexa: {"handle":"username","amount":100,"message":"optional note"}
  · send_acoin: {"handle":"username","amount":50}
  · follow: {"handle":"username"}
  · unfollow: {"handle":"username"}
  · subscribe: {"tier":"basic"}
  · cancel_subscription: {}
  · convert_nexa: {"amount":100}

SEARCH CAPABILITY — you can trigger a pre-filled search in the app:
- When the user asks you to "search for X", "find @user", "look up a person", or "show me posts about X", use:
  [ACTION:Search for X:/search?q=X]
- Replace spaces in the query with + (e.g. "ugandan music" → /search?q=ugandan+music)
- Examples: [ACTION:Search for amkaweesi:/search?q=amkaweesi]  [ACTION:Find cooking videos:/search?q=cooking]

PROFILE LOOKUP — you can link directly to any user's profile:
- When the user mentions a @handle or asks "who is @X" / "show me @X's profile", add:
  [ACTION:View @handle:/@handle]
- Founder's profile: [ACTION:View @amkaweesi:/@amkaweesi]
- For bought/marketplace usernames: every handle always routes to its current owner's profile.

STRICT RULES:
- NEVER write raw route paths in your text body. If navigation is needed, use [ACTION:...] tags only.
- When the user asks "how do I [feature]" or "where is [feature]", give clear step-by-step guidance AND add an [ACTION:...] button to navigate there directly.
- When the user asks about a specific person by name or @handle, always add a [ACTION:View @handle:/@handle] button AND a [ACTION:Search for handle:/search?q=handle] button.
- Answer like a knowledgeable professional — direct, clear, and genuinely helpful.
- Use formatting for structured answers. Keep conversational replies as plain prose.
- Only emit [EXEC:...] tags when the user explicitly requests an action. Never act without clear intent.
- [SUGGEST:...] tags should offer meaningful next steps, not repeat the same question.
- Keep your tone professional and warm. Never be dismissive or overly promotional.`;

      let lensAddition = "";
      try {
        const lensRaw = await AsyncStorage.getItem("afuai_lens_context");
        if (lensRaw) {
          const ctx = JSON.parse(lensRaw);
          if (ctx.expiresAt && ctx.expiresAt > Date.now()) {
            lensAddition =
              `\n\n[AI LENS SCAN CONTEXT]\nThe user just scanned something with AI Lens. Give a rich, engaging, conversational response about it — as if you are an expert guide who knows everything about this topic.\n` +
              `Title: ${ctx.title}\n` +
              `Description: ${ctx.description}\n` +
              `Category: ${ctx.category}` +
              (ctx.facts?.length ? `\nKey facts:\n${ctx.facts.map((f: string) => `• ${f}`).join("\n")}` : "") +
              (ctx.answer ? `\nInitial analysis: ${ctx.answer}` : "") +
              `\n\nExpand on this with interesting details, history, context, and any helpful tips. Make the conversation feel natural and informative.`;
          }
          await AsyncStorage.removeItem("afuai_lens_context");
        }
      } catch {}

      const conversationMessages = currentMessages
        .filter(m => !m._pending)
        .slice(0, 10)
        .reverse()
        .map(m => ({ role: m.sender_id === user?.id ? "user" as const : "assistant" as const, content: m.encrypted_content }));
      conversationMessages.push({ role: "user", content: userText.replace(/@afuai/gi, "").trim() || userText });

      const res = await fetch(`${getEdgeFnBase()}/afu-ai-reply`, {
        method: "POST",
        headers: edgeHeaders(),
        body: JSON.stringify({ messages: [{ role: "system", content: systemPrompt + lensAddition }, ...conversationMessages] }),
      });
      const data = await res.json();
      const rawReply = (data.reply || "Sorry, I couldn't process that. Please try again.").trim();
      const parsed = parseAfuAiTags(rawReply);
      const cleanText = parsed.text || rawReply;
      const sentAt = new Date().toISOString();

      let savedId: string | null = null;
      try {
        const { data: rpcId } = await supabase.rpc("insert_afuai_message", {
          p_chat_id: chatId,
          p_content: rawReply,
        });
        if (typeof rpcId === "string") savedId = rpcId;
      } catch (_) {}

      const execAction: AiExecAction | undefined = parsed.execAction ? (() => {
        const at = parsed.execAction!.actionType;
        const p = parsed.execAction!.params;
        const labelMap: Record<string, string> = {
          send_nexa: `Send ${p.amount} Nexa to @${p.handle}`,
          send_acoin: `Send ${p.amount} ACoin to @${p.handle}`,
          follow: `Follow @${p.handle}`,
          unfollow: `Unfollow @${p.handle}`,
          subscribe: `Subscribe to ${p.tier} plan`,
          cancel_subscription: "Cancel subscription",
          convert_nexa: `Convert ${p.amount} Nexa to ACoin`,
        };
        const descMap: Record<string, string> = {
          send_nexa: p.message ? `"${p.message}"` : "Nexa transfer",
          send_acoin: p.message ? `"${p.message}"` : "ACoin transfer",
          follow: "Send a follow request",
          unfollow: "Remove from your following list",
          subscribe: "Activates your premium subscription",
          cancel_subscription: "Downgrade to free plan",
          convert_nexa: "Currency conversion at current rate",
        };
        return { id: `exec_${Date.now()}`, actionType: at, params: p, label: labelMap[at] || "Confirm action", description: descMap[at] || "", status: "pending" as const };
      })() : undefined;

      setMessages((prev) => [{
        id: savedId || `afuai_${Date.now()}`,
        chat_id: chatId,
        sender_id: AFUAI_BOT_ID,
        encrypted_content: cleanText,
        sent_at: sentAt,
        sender: { display_name: "AfuAI", avatar_url: null, handle: "afuai" },
        reactions: [],
        _isAi: true,
        _aiActions: parsed.actions.length > 0 ? parsed.actions : undefined,
        _aiSuggestions: parsed.suggestions.length > 0 ? parsed.suggestions : undefined,
        _aiInvoices: parsed.invoices.length > 0 ? parsed.invoices : undefined,
        _aiExecAction: execAction,
      }, ...prev]);
    } catch {
      setMessages((prev) => [{
        id: `afuai_err_${Date.now()}`,
        chat_id: chatId,
        sender_id: AFUAI_BOT_ID,
        encrypted_content: "Sorry, I couldn't respond right now. Please try again.",
        sent_at: new Date().toISOString(),
        sender: { display_name: "AfuAI", avatar_url: null, handle: "afuai" },
        reactions: [],
      }, ...prev]);
    } finally {
      setIsAfuAiTyping(false);
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

  function handleReportMessage(msg: Message) {
    setShowReactions(null);
    setAiResult(null);
    setAiResultType(null);
    setAiReplies([]);
    const REASONS = ["Spam", "Harassment", "Hate speech", "Inappropriate content"];
    showAlert("Report Message", "Why are you reporting this message?", [
      ...REASONS.map((r) => ({
        text: r,
        onPress: async () => {
          const { error } = await supabase.from("message_reports").insert({
            reporter_id: user?.id,
            message_id: msg.id,
            reason: r,
            message_content: msg.encrypted_content?.slice(0, 500) || "",
          });
          if (error) showAlert("Error", "Could not submit report. Please try again.");
          else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showAlert("Reported", "Thank you. Our team will review this message.");
          }
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  async function handleSaveToPhone(msg: Message) {
    setShowReactions(null);
    setAiResult(null);
    setAiResultType(null);
    setAiReplies([]);
    const url  = msg.attachment_url;
    const type = msg.attachment_type;
    if (!url || !type) return;
    if (type === "file") {
      // Documents: open share sheet so the user can save to Files / Drive
      const local = getLocalAttachmentUri(url) ?? await ensureChatAttachmentDownloaded(url, type);
      if (local) openChatFile(local);
      return;
    }
    const saved = await saveAttachmentToGallery(url);
    if (saved) {
      showAlert("Saved", "File saved to your device gallery (AfuChat album).");
    } else {
      showAlert("Permission needed", "Please allow media access in your device settings so AfuChat can save files.");
    }
  }

  function startEditMessage(msg: Message) {
    setShowReactions(null);
    setAiResult(null);
    setAiResultType(null);
    setAiReplies([]);
    setEditingMessage(msg);
    setInput(msg.encrypted_content);
    setReplyTo(null);
  }

  async function saveEditMessage() {
    if (!editingMessage || !user) return;
    const text = input.trim();
    if (!text) return;
    if (text === editingMessage.encrypted_content) {
      setEditingMessage(null);
      setInput("");
      return;
    }
    setSending(true);
    const { error } = await supabase
      .from("messages")
      .update({ encrypted_content: text, edited_at: new Date().toISOString() })
      .eq("id", editingMessage.id)
      .eq("sender_id", user.id);

    if (error) {
      showAlert("Edit failed", error.message.includes("time") ? "Messages can only be edited within 15 minutes of sending." : "Could not edit message. Please try again.");
    } else {
      setMessages((prev) => prev.map((m) => m.id === editingMessage.id ? { ...m, encrypted_content: text, edited_at: new Date().toISOString() } : m));
    }
    setEditingMessage(null);
    setInput("");
    setSending(false);
  }

  function cancelEdit() {
    setEditingMessage(null);
    setInput("");
  }

  function handleDeleteMessage(msg: Message) {
    setShowReactions(null);
    setAiResult(null);
    setAiResultType(null);
    setAiReplies([]);
    showAlert("Delete Message", "Are you sure you want to delete this message? This cannot be undone.", [
      {
        text: "Delete",
        style: "destructive" as const,
        onPress: async () => {
          const { error } = await supabase
            .from("messages")
            .delete()
            .eq("id", msg.id)
            .eq("sender_id", user?.id);
          if (error) {
            showAlert("Error", "Could not delete message. Please try again.");
          } else {
            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        },
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  async function handleStarMessage(msg: Message) {
    if (!user) return;
    setShowReactions(null);
    setAiResult(null);
    setAiResultType(null);
    setAiReplies([]);
    const isSpecial = !msg.encrypted_content ||
      ["📷 Photo", "🎥 Video", "GIF"].includes(msg.encrypted_content) ||
      msg.encrypted_content.startsWith("🎁 ") ||
      msg.encrypted_content.startsWith("🧧");
    const senderProfile = msg.sender;
    const { error } = await supabase
      .from("starred_messages")
      .upsert({
        user_id: user.id,
        message_id: msg.id,
        chat_id: msg.chat_id,
        content: isSpecial ? (msg.attachment_type === "audio" ? "🎤 Voice message" : msg.encrypted_content) : msg.encrypted_content,
        sender_id: msg.sender_id,
        sender_name: senderProfile?.display_name || "Unknown",
        sender_avatar: senderProfile?.avatar_url || null,
        attachment_url: msg.attachment_url || null,
        attachment_type: msg.attachment_type || null,
      }, { onConflict: "user_id,message_id" });
    if (!error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Starred", "Message saved to your Saved tab.");
    }
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

  async function scheduleReminder(msg: Message, secondsFromNow: number) {
    if (Platform.OS === "web") {
      showAlert("Not supported", "Message reminders are only available on mobile.");
      setReminderMsg(null);
      return;
    }
    try {
      const Notifications = await import("expo-notifications");
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        const { status: reqStatus } = await Notifications.requestPermissionsAsync();
        if (reqStatus !== "granted") {
          showAlert("Permission needed", "Allow notifications to use message reminders.");
          setReminderMsg(null);
          return;
        }
      }
      const preview = msg.encrypted_content?.slice(0, 80) || "Message";
      const senderName = msg.sender?.display_name || "Someone";
      const activeChatId = isDraft ? realChatId : id;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏰ Reminder: ${senderName}`,
          body: preview,
          data: { chatId: activeChatId || id, type: "message_reminder" },
          sound: "notification.wav",
          ...(Platform.OS === "android" && {
            icon: "@mipmap/notification_icon",
            largeIcon: "@mipmap/ic_launcher",
            color: "#00BCD4",
          }),
        },
        trigger: {
          type: "timeInterval",
          seconds: secondsFromNow,
          repeats: false,
        } as any,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const label =
        secondsFromNow <= 1800 ? "30 minutes" :
        secondsFromNow <= 3600 ? "1 hour" :
        secondsFromNow <= 14400 ? "4 hours" :
        secondsFromNow <= 86400 ? "tomorrow morning" : "next week";
      showAlert("Reminder set", `You'll be reminded about this message in ${label}.`);
    } catch (e) {
      showAlert("Error", "Could not set reminder. Please try again.");
    }
    setReminderMsg(null);
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

    const isRemoving = !!(msg.reactions?.find((r) => r.emoji === emoji && r.myReaction));

    // Optimistic update — update local state immediately so the UI responds instantly
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msg.id) return m;
        let reactions = [...(m.reactions || [])];
        if (isRemoving) {
          reactions = reactions
            .map((r) => r.emoji === emoji ? { ...r, count: r.count - 1, myReaction: false } : r)
            .filter((r) => r.count > 0);
        } else {
          const idx = reactions.findIndex((r) => r.emoji === emoji);
          if (idx >= 0) {
            reactions = reactions.map((r, i) => i === idx ? { ...r, count: r.count + 1, myReaction: true } : r);
          } else {
            reactions = [...reactions, { emoji, count: 1, myReaction: true }];
          }
        }
        return { ...m, reactions };
      })
    );

    // Persist to database
    if (isRemoving) {
      await supabase.from("message_reactions").delete().eq("message_id", msg.id).eq("user_id", user.id).eq("reaction", emoji);
    } else {
      await supabase.from("message_reactions").insert({ message_id: msg.id, user_id: user.id, reaction: emoji });
    }
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
          if (newMsg.sender_id === AFUAI_BOT_ID) return;
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
    if (draftSaveTimer.current) { clearTimeout(draftSaveTimer.current); draftSaveTimer.current = null; }
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
    const msgId = `msg_${Date.now()}`;

    const userMsg: Message = {
      id: msgId,
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: text,
      sent_at: now,
      sender: { display_name: profile?.display_name || "You", avatar_url: profile?.avatar_url || null, handle: profile?.handle || "" },
      reply_to_message_id: replyTo?.id || null,
      status: "sent",
      reactions: [],
    };
    setMessages((prev) => [userMsg, ...prev]);
    // Always snap to the newest message when the user sends — even if they
    // were scrolled up reading history. offset 0 = bottom on an inverted list.
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setNewMsgCount(0);
    setReplyTo(null);
    setSending(false);

    if (isAfuAiDirectChat) {
      const aiTier = (subscription?.plan_tier as "free" | "silver" | "gold" | "platinum") || "free";
      const aiUsage = await getDailyUsage("afuai_messages", aiTier);
      if (!aiUsage.allowed) {
        const nextTier = aiTier === "free" ? "Silver" : aiTier === "silver" ? "Gold" : "Platinum";
        setMessages((prev) => [{
          id: `afuai_limit_${Date.now()}`,
          chat_id: activeChatId,
          sender_id: AFUAI_BOT_ID,
          encrypted_content: `You've reached your ${aiUsage.limit} daily message limit on the ${aiTier === "free" ? "Free" : aiTier.charAt(0).toUpperCase() + aiTier.slice(1)} plan. Upgrade to ${nextTier} for ${aiTier === "free" ? "50" : aiTier === "silver" ? "200" : "unlimited"} messages per day.`,
          sent_at: new Date().toISOString(),
          sender: { display_name: "AfuAI", avatar_url: null, handle: "afuai" },
          reactions: [],
          _isAi: true,
          _aiActions: [{ label: `Upgrade to ${nextTier}`, icon: "diamond", action: "navigate", params: { route: "/premium" } }],
        }, ...prev]);
        setSending(false);
        return;
      }

      const insertPayload: any = {
        chat_id: activeChatId,
        sender_id: user.id,
        encrypted_content: text,
      };
      if (userMsg.reply_to_message_id) insertPayload.reply_to_message_id = userMsg.reply_to_message_id;

      const { data: inserted } = await supabase.from("messages").insert(insertPayload).select("id").single();
      if (inserted) {
        setMessages((prev) =>
          prev.map((m) => m.id === msgId ? { ...m, id: inserted.id } : m)
        );
      }

      await recordDailyUsage("afuai_messages");
      const snapshot = messages;
      handleAfuAiResponse(text, snapshot, activeChatId);
      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("message_sent"); } catch (_) {}
      return;
    }

    if (!isOnline()) {
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, status: "sending" as const, _pending: true } : m));
      // Save to both legacy queue (AsyncStorage) and new SQLite pending table
      await Promise.all([
        queueMessage({ id: msgId, chat_id: activeChatId, sender_id: user.id, encrypted_content: text, created_at: now }),
        savePendingMessage({ id: msgId, conversation_id: activeChatId, sender_id: user.id, content: text, sent_at: now }),
      ]);
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
        prev.map((m) => m.id === msgId ? { ...m, id: inserted.id, status: "sent" as const, _pending: false } : m)
      );
    } else if (error) {
      setMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, status: "failed" as const } : m)
      );
    }

    if (!error && chatInfo) {
      const recipientIds = chatInfo.member_ids.length > 0
        ? chatInfo.member_ids
        : chatInfo.other_id ? [chatInfo.other_id] : [];
      if (recipientIds.length > 0) {
        notifyNewMessage({
          recipientIds,
          senderName: profile?.display_name || "Someone",
          senderUserId: user.id,
          messageText: text,
          chatId: activeChatId,
          isGroup: chatInfo.is_group,
          groupName: chatInfo.name || undefined,
        });
      }
    }

    try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("message_sent"); } catch (_) {}

    if (/@afuai/i.test(text)) {
      const snapshot = messages;
      handleAfuAiResponse(text, snapshot);
    }
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

  async function sendGift(gift: DbGift, message: string, price: number) {
    if (!user || giftSending) return;
    if (messageLimited) {
      showAlert("Message limit", `You can only send one message until ${chatInfo?.other_name || "this user"} replies or follows you.`);
      return;
    }

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
      message: message.trim() || null,
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
      encrypted_content: `🎁 ${gift.emoji} ${gift.name}${message.trim() ? ` - ${message.trim()}` : ""}|giftId:${gift.id}|receiverId:${receiverId}`,
    });

    notifyGiftReceived({
      recipientId: receiverId,
      senderName: profile?.display_name || "Someone",
      senderUserId: user.id,
      giftName: `${gift.emoji} ${gift.name}`,
    });
    try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("gift_sent"); } catch (_) {}
    setShowGiftPicker(false);
    setGiftSending(false);
    loadMessages();
  }

  async function pickFromCamera() {
    setShowAttachMenu(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { showAlert("Permission needed", "Camera access is required to take photos."); return; }
    const baseQuality = chatPrefs.media_quality === "High" ? 1.0 : chatPrefs.media_quality === "Low" ? 0.4 : 0.8;
    const pickerQuality = chatIsLowData ? Math.min(baseQuality, 0.4) : baseQuality;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: pickerQuality });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachmentPreview({ uri: asset.uri, type: "image", mimeType: asset.mimeType || "image/jpeg" });
    }
  }

  async function pickFromGallery() {
    setShowAttachMenu(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { showAlert("Permission needed", "Gallery access is required."); return; }
    const baseQuality = chatPrefs.media_quality === "High" ? 1.0 : chatPrefs.media_quality === "Low" ? 0.4 : 0.8;
    const pickerQuality = chatIsLowData ? Math.min(baseQuality, 0.4) : baseQuality;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: pickerQuality, allowsMultipleSelection: false });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachmentPreview({ uri: asset.uri, type: "image", mimeType: asset.mimeType || "image/jpeg" });
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const activeChatId = await getOrCreateChatId();
    if (!activeChatId) return;

    // Capture all values before clearing preview state
    const { uri, type, name, mimeType } = attachmentPreview;
    const caption = input.trim();
    const label = caption || (type === "image" ? "📷 Photo" : type === "video" ? "🎥 Video" : `📎 ${name || "File"}`);

    // Show optimistic message immediately with local URI — user sees their content right away
    const tempId = `pending-${Date.now()}`;
    setMessages((prev) => [{
      id: tempId,
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: label,
      sent_at: new Date().toISOString(),
      sender: { display_name: profile?.display_name || "You", avatar_url: profile?.avatar_url || null, handle: profile?.handle || "" },
      attachment_url: uri,
      attachment_type: type,
      _pending: true,
      reactions: [],
    }, ...prev]);

    // Close preview and clear input immediately
    setAttachmentPreview(null);
    setInput("");
    saveDraft("");

    // Upload and insert in the background
    try {
      const { publicUrl, error: uploadErr } = await uploadChatMedia(
        "chat-attachments",
        activeChatId,
        user.id,
        uri,
        name || undefined,
        mimeType,
      );

      if (uploadErr || !publicUrl) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        showAlert("Upload failed", uploadErr || "Could not upload file. Please try again.");
        return;
      }

      const { data: inserted } = await supabase.from("messages").insert({
        chat_id: activeChatId,
        sender_id: user.id,
        encrypted_content: label,
        attachment_url: publicUrl,
        attachment_type: type,
      }).select("id").single();

      // Replace optimistic bubble with real message (real URL + real DB id)
      setMessages((prev) => prev.map((m) =>
        m.id === tempId
          ? { ...m, id: inserted?.id || tempId, attachment_url: publicUrl, _pending: false }
          : m
      ));

      // Notify recipients — same logic as sendMessage()
      if (chatInfo) {
        const recipientIds = chatInfo.member_ids.length > 0
          ? chatInfo.member_ids
          : chatInfo.other_id ? [chatInfo.other_id] : [];
        if (recipientIds.length > 0) {
          notifyNewMessage({
            recipientIds,
            senderName: profile?.display_name || "Someone",
            senderUserId: user.id,
            messageText: label,
            chatId: activeChatId,
            isGroup: chatInfo.is_group,
            groupName: chatInfo.name || undefined,
          });
        }
      }
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      showAlert("Upload failed", e?.message || "Could not upload file");
    }
  }

  async function sendStickerMessage(emoji: string) {
    if (!user) return;
    if (messageLimited) {
      showAlert("Message limit", `You can only send one message until ${chatInfo?.other_name || "this user"} replies or follows you.`);
      return;
    }
    setShowEmojiStickerPicker(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const activeChatId = await getOrCreateChatId();
    if (!activeChatId) return;

    const tempId = `sticker_${Date.now()}`;
    const now = new Date().toISOString();
    setMessages((prev) => [{
      id: tempId,
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: emoji,
      sent_at: now,
      sender: { display_name: profile?.display_name || "You", avatar_url: profile?.avatar_url || null, handle: profile?.handle || "" },
      attachment_type: "sticker",
      reactions: [],
    }, ...prev]);

    const { data: inserted } = await supabase.from("messages").insert({
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: emoji,
      attachment_type: "sticker",
    }).select("id").single();

    if (inserted) {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, id: inserted.id } : m));
    }
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

  async function startVoiceRecordingHold() {
    if (recordingRef.current) return;
    const safetyTimer = setTimeout(() => {
      if (!recStartedSV.value && recPressActiveSV.value) {
        recPressActiveSV.value = false;
        recCancelledSV.value = false;
        recLockedSV.value = false;
        setIsRecording(false);
        setRecLocked(false);
      }
    }, 5000);
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        clearTimeout(safetyTimer);
        recPressActiveSV.value = false;
        showAlert("Microphone permission needed", "Go to Settings and allow AfuChat to access your microphone.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recordingRef.current = recording;
      recStartedSV.value = true;
      clearTimeout(safetyTimer);

      if (!recPressActiveSV.value && !recLockedSV.value) {
        try {
          await recording.stopAndUnloadAsync();
          await resetToPlaybackMode();
        } catch (_) {}
        recordingRef.current = null;
        recStartedSV.value = false;
        return;
      }

      setIsRecording(true);
      setRecLocked(false);
      setRecordingDuration(0);
      setRecordingTenths(0);
      setWaveformLevels([]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.15, duration: 380, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
        ])
      ).start();
      recordingTimer.current = setInterval(() => {
        setRecordingTenths((t) => {
          if (t >= 9) {
            setRecordingDuration((d) => d + 1);
            return 0;
          }
          return t + 1;
        });
      }, 100);
      meterInterval.current = setInterval(async () => {
        if (!recordingRef.current) return;
        try {
          const s = await recordingRef.current.getStatusAsync();
          if (s.isRecording && s.metering !== undefined) {
            const db = s.metering;
            const normalized = Math.max(0.08, Math.min(1, (db + 55) / 50));
            setWaveformLevels((prev) => {
              const next = [...prev, normalized];
              return next.length > 48 ? next.slice(-48) : next;
            });
          }
        } catch (_) {}
      }, 80);
    } catch (err) {
      clearTimeout(safetyTimer);
      recPressActiveSV.value = false;
      recStartedSV.value = false;
      recCancelledSV.value = false;
      recLockedSV.value = false;
      setIsRecording(false);
      setRecLocked(false);
      await resetToPlaybackMode().catch(() => {});
      showAlert("Error", "Could not start recording.");
    }
  }

  async function startVoiceRecordingWeb() {
    if (recordingRef.current) return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        showAlert("Microphone permission needed", "Please allow access to your microphone.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recordingRef.current = recording;
      recStartedSV.value = true;
      recLockedSV.value = true;
      setIsRecording(true);
      setRecLocked(true);
      setRecordingDuration(0);
      setRecordingTenths(0);
      setWaveformLevels([]);
      recordingTimer.current = setInterval(() => {
        setRecordingTenths((t) => {
          if (t >= 9) { setRecordingDuration((d) => d + 1); return 0; }
          return t + 1;
        });
      }, 100);
      meterInterval.current = setInterval(async () => {
        if (!recordingRef.current) return;
        try {
          const s = await recordingRef.current.getStatusAsync();
          if (s.isRecording && s.metering !== undefined) {
            const db = s.metering;
            const normalized = Math.max(0.05, Math.min(1, (db + 60) / 55));
            setWaveformLevels((prev) => {
              const next = [...prev, normalized];
              return next.length > 40 ? next.slice(-40) : next;
            });
          }
        } catch (_) {}
      }, 100);
    } catch {
      recStartedSV.value = false;
      recLockedSV.value = false;
      setIsRecording(false);
      setRecLocked(false);
      await resetToPlaybackMode().catch(() => {});
      showAlert("Error", "Could not start recording.");
    }
  }

  async function stopVoiceRecording() {
    if (!recordingRef.current) return;
    const capturedDuration = recordingDuration;
    clearInterval(recordingTimer.current);
    clearInterval(meterInterval.current);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    setIsRecording(false);
    setRecLocked(false);
    recLockedSV.value = false;
    recStartedSV.value = false;
    recPressActiveSV.value = false;
    recCancelledSV.value = false;
    setRecordingDuration(0);
    setRecordingTenths(0);
    setWaveformLevels([]);
    slideX.value = withSpring(0, MIC_SPRING_SNAP);
    slideY.value = withSpring(0, MIC_SPRING_SNAP);
    micScale.value = withSpring(1, MIC_SPRING_CONFIG);
    recBarOpacity.value = withTiming(0, { duration: 150 });
    cancelProgress.value = withTiming(0, { duration: 150 });
    lockProgress.value = withTiming(0, { duration: 150 });
    directionLock.value = "none";

    if (capturedDuration < 1) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        await resetToPlaybackMode();
      } catch (_) {}
      recordingRef.current = null;
      return;
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      await resetToPlaybackMode();
      recordingRef.current = null;

      if (!uri || !user) return;

      const activeChatId = await getOrCreateChatId();
      if (!activeChatId) return;

      // Immediately show the audio message in chat (optimistic insert)
      const tempId = `pending-audio-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        chat_id: activeChatId,
        sender_id: user.id,
        encrypted_content: "🎤 Voice message",
        sent_at: new Date().toISOString(),
        sender: {
          display_name: profile?.display_name || "",
          avatar_url: profile?.avatar_url || null,
          handle: profile?.handle || "",
        },
        reactions: [],
        attachment_url: uri,
        attachment_type: "audio",
        _pending: true,
      };
      setMessages((prev) => [optimisticMsg, ...prev]);
      setSending(true);

      const ext = Platform.OS === "web" ? "webm" : "m4a";
      const voiceMime = Platform.OS === "web" ? "audio/webm" : "audio/mp4";
      const { publicUrl, error: uploadErr } = await uploadChatMedia(
        "voice-messages",
        activeChatId,
        user.id,
        uri,
        `voice_${Date.now()}.${ext}`,
        voiceMime,
      );

      if (uploadErr || !publicUrl) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        showAlert("Upload failed", uploadErr || "Could not upload voice message. Please try again.");
        setSending(false);
        return;
      }

      await supabase.from("messages").insert({
        chat_id: activeChatId,
        sender_id: user.id,
        encrypted_content: "🎤 Voice message",
        attachment_url: publicUrl,
        attachment_type: "audio",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadMessages();
      setSending(false);
    } catch (err: any) {
      console.warn("[Voice] Error:", err?.message || err);
      recordingRef.current = null;
      setSending(false);
      showAlert("Error", "Failed to send voice message.");
    }
  }

  async function cancelVoiceRecording() {
    clearInterval(recordingTimer.current);
    clearInterval(meterInterval.current);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    setIsRecording(false);
    setRecLocked(false);
    recLockedSV.value = false;
    recStartedSV.value = false;
    recPressActiveSV.value = false;
    recCancelledSV.value = false;
    setRecordingDuration(0);
    setRecordingTenths(0);
    setWaveformLevels([]);
    slideX.value = withSpring(0, MIC_SPRING_SNAP);
    slideY.value = withSpring(0, MIC_SPRING_SNAP);
    micScale.value = withSpring(1, MIC_SPRING_CONFIG);
    recBarOpacity.value = withTiming(0, { duration: 150 });
    cancelProgress.value = withTiming(0, { duration: 150 });
    lockProgress.value = withTiming(0, { duration: 150 });
    directionLock.value = "none";
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        await resetToPlaybackMode();
      } catch (_) {}
      recordingRef.current = null;
    }
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
    if (envClaiming) return;
    setEnvClaiming(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let envelopeId: string | null = null;
    const match = msg.encrypted_content.match(/\[([a-f0-9-]+)\]/);
    if (match) {
      envelopeId = match[1];
    } else {
      const { data } = await supabase
        .from("red_envelopes")
        .select("id")
        .eq("chat_id", id)
        .eq("sender_id", msg.sender_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      envelopeId = data?.id || null;
    }

    if (!envelopeId) {
      showAlert("Error", "Could not find this red envelope.");
      setEnvClaiming(false);
      return;
    }

    const { data: env } = await supabase
      .from("red_envelopes")
      .select("id, sender_id, total_amount, recipient_count, claimed_count, message, is_expired, profiles!red_envelopes_sender_id_fkey(display_name)")
      .eq("id", envelopeId)
      .single();

    if (!env) {
      showAlert("Error", "Red envelope not found.");
      setEnvClaiming(false);
      return;
    }

    const senderName = (env as any).profiles?.display_name || "Someone";
    const isSender = env.sender_id === user?.id;

    const { data: existingClaim } = await supabase
      .from("red_envelope_claims")
      .select("amount")
      .eq("red_envelope_id", envelopeId)
      .eq("claimer_id", user?.id || "")
      .maybeSingle();

    if (existingClaim) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEnvReveal({
        amount: existingClaim.amount,
        message: env.message,
        senderName,
        isSender,
        alreadyClaimed: true,
        allGone: false,
        claimedCount: env.claimed_count,
        totalCount: env.recipient_count,
        totalAmount: env.total_amount,
      });
      setEnvClaiming(false);
      return;
    }

    if (isSender) {
      setEnvReveal({
        amount: null,
        message: env.message,
        senderName,
        isSender: true,
        alreadyClaimed: false,
        allGone: env.claimed_count >= env.recipient_count || env.is_expired,
        claimedCount: env.claimed_count,
        totalCount: env.recipient_count,
        totalAmount: env.total_amount,
      });
      setEnvClaiming(false);
      return;
    }

    if (env.claimed_count >= env.recipient_count || env.is_expired) {
      setEnvReveal({
        amount: null,
        message: env.message,
        senderName,
        isSender: false,
        alreadyClaimed: false,
        allGone: true,
        claimedCount: env.claimed_count,
        totalCount: env.recipient_count,
        totalAmount: env.total_amount,
      });
      setEnvClaiming(false);
      return;
    }

    const { data: claimResult, error: claimErr } = await supabase.rpc("claim_red_envelope", {
      p_envelope_id: envelopeId,
    });

    if (claimErr || !claimResult?.success) {
      showAlert("Error", claimResult?.message || claimErr?.message || "Failed to claim.");
      setEnvClaiming(false);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("red_envelope_claimed"); } catch (_) {}
    if (!isSender) {
      notifyGiftReceived({
        recipientId: env.sender_id,
        senderName: profile?.display_name || "Someone",
        senderUserId: user?.id || "",
        giftName: `opened your red envelope (${claimResult.amount} ACoin)`,
      });
    }

    setEnvReveal({
      amount: claimResult.amount,
      message: env.message,
      senderName,
      isSender: false,
      alreadyClaimed: false,
      allGone: false,
      claimedCount: env.claimed_count + 1,
      totalCount: env.recipient_count,
      totalAmount: env.total_amount,
    });
    setEnvClaiming(false);
  }

  function getReplyPreview(msgId: string | null | undefined): string | null {
    if (!msgId) return null;
    const found = messages.find((m) => m.id === msgId);
    if (!found?.encrypted_content) return null;
    const t = stripMdForPreview(found.encrypted_content);
    return t.length > 80 ? t.slice(0, 80) + "…" : t;
  }

  function shouldShowTail(index: number): boolean {
    if (index === messages.length - 1) return true;
    const current = messages[index];
    const next = messages[index + 1];
    return current.sender_id !== next.sender_id;
  }

  function shouldShowName(index: number): boolean {
    if (!chatInfo?.is_group) return false;
    return shouldShowTail(index);
  }

  function shouldShowDate(index: number): boolean {
    if (index === 0) return true;
    const current = new Date(messages[index].sent_at);
    const prev = new Date(messages[index - 1].sent_at);
    return current.toDateString() !== prev.toDateString();
  }

  const handleScroll = useCallback((e: any) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const shouldShow = offsetY > 300;
    if (shouldShow !== showScrollBtnRef.current) {
      showScrollBtnRef.current = shouldShow;
      setShowScrollBtn(shouldShow);
      Animated.timing(scrollBtnOpacity, {
        toValue: shouldShow ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      if (!shouldShow) setNewMsgCount(0);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setNewMsgCount(0);
  }, []);

  const scrollToMessage = useCallback((msgId: string) => {
    const index = messages.findIndex((m) => m.id === msgId);
    if (index === -1) return;
    flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedMsgId(msgId);
    highlightTimerRef.current = setTimeout(() => setHighlightedMsgId(null), 1500);
  }, [messages]);

  // Load phone-book name once we know who the other person is.
  useEffect(() => {
    const otherId = chatInfo?.other_id;
    if (!otherId || chatInfo?.is_group || chatInfo?.is_channel || Platform.OS === "web") return;
    getPhonebookName(otherId).then(setPhonebookName).catch(() => {});
  }, [chatInfo?.other_id, chatInfo?.is_group, chatInfo?.is_channel]);

  const headerTitle = chatInfo?.is_group || chatInfo?.is_channel
    ? chatInfo.name || "Group"
    : (phonebookName || chatInfo?.other_name || "Chat");
  const headerAvatar = chatInfo?.is_group || chatInfo?.is_channel ? chatInfo?.avatar_url : chatInfo?.other_avatar;

  const getMessageSpacing = useCallback((index: number): number => {
    if (index === 0) return 0;
    const current = messages[index];
    const prev = messages[index - 1];
    return current.sender_id === prev.sender_id ? 2 : 8;
  }, [messages]);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender_id === user?.id;
    const showDate = shouldShowDate(index);
    const spacing = getMessageSpacing(index);

    return (
      <View style={{ marginTop: showDate ? 0 : spacing }}>
        {showDate && (
          <View style={st.dateBadge}>
            <View style={[st.datePill, { backgroundColor: colors.surface }]}>
              <Text style={[st.dateBadgeText, { color: colors.textMuted }]}>{formatDateHeader(item.sent_at)}</Text>
            </View>
          </View>
        )}
        <MessageBubble
          msg={item}
          isMe={isMe}
          showTail={shouldShowTail(index)}
          showName={shouldShowName(index)}
          onLongPress={(m) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowReactions(m); }}
          onReply={(m) => { setReplyTo(m); setTimeout(() => chatInputRef.current?.focus(), 50); }}
          replyPreview={getReplyPreview(item.reply_to_message_id)}
          onTapReply={item.reply_to_message_id ? () => scrollToMessage(item.reply_to_message_id!) : undefined}
          isHighlighted={item.id === highlightedMsgId}
          onTapEnvelope={handleTapEnvelope}
          onTapGift={handleTapGift}
          onImageTap={imgViewer.openViewer}
          isPremiumSender={isMe && isPremium}
          onConfirmExec={handleConfirmAiExec}
          onCancelExec={handleCancelAiExec}
          onSuggestionTap={(text) => sendMessage(text)}
          onSenderPress={advancedFeatures.mini_profile_popup && !isMe ? (id) => setMiniProfileUserId(id) : undefined}
          onReactionPress={addReaction}
        />
      </View>
    );
  }, [messages, user, colors, highlightedMsgId, scrollToMessage, advancedFeatures.mini_profile_popup]);

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {Platform.OS !== "web" && <OfflineBanner />}
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
            } else if (chatInfo && (chatInfo.is_group || chatInfo.is_channel) && id) {
              router.push({ pathname: "/group/[id]", params: { id: id as string } });
            }
          }}
        >
          <Avatar uri={headerAvatar} name={headerTitle} size={38} square={!!(chatInfo?.is_organization_verified)} />
          <View style={st.headerInfo}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[st.headerName, { color: colors.text }]} numberOfLines={1}>{headerTitle}</Text>
              <VerifiedBadge isVerified={chatInfo?.is_verified} isOrganizationVerified={chatInfo?.is_organization_verified} size={16} />
            </View>
            {(typingUsers.length > 0 || isAfuAiTyping) ? (
              <Text style={[st.headerSub, { color: isAfuAiTyping && typingUsers.length === 0 ? "#00BCD4" : BRAND }]}>
                {isAfuAiTyping
                  ? typingUsers.length > 0
                    ? `AfuAI & ${typingUsers.join(", ")} typing...`
                    : "✦ AfuAI is thinking..."
                  : `${typingUsers.join(", ")} typing...`}
              </Text>
            ) : !networkOnline ? (
              <Text style={[st.headerSub, { color: "#FF9500" }]}>Waiting for network...</Text>
            ) : chatInfo?.is_group ? (
              <Text style={[st.headerSub, { color: colors.textMuted }]}>Group chat</Text>
            ) : (() => {
              const ls = formatLastSeen(chatInfo?.other_last_seen, chatInfo?.other_show_online_status);
              return <Text style={[st.headerSub, { color: ls.isOnline ? "#34C759" : colors.textMuted }]}>{ls.text}</Text>;
            })()}
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          {chatInfo && !chatInfo.is_group && !chatInfo.is_channel && chatInfo.other_id && chatInfo.other_id !== AFUAI_BOT_ID && (
            <>
              <TouchableOpacity
                style={st.headerAction}
                hitSlop={8}
                onPress={async () => {
                  if (!user) return;
                  try {
                    const { initiateCall } = await import("@/lib/callSignaling");
                    const callId = await initiateCall({
                      calleeId: chatInfo.other_id!,
                      chatId: id as string,
                      callType: "voice",
                      callerId: user.id,
                    });
                    router.push({ pathname: "/call/[id]", params: { id: callId } });
                  } catch (e: any) {
                    showAlert("Call failed", e.message || "Could not start call.");
                  }
                }}
              >
                <Ionicons name="call-outline" size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={st.headerAction}
                hitSlop={8}
                onPress={async () => {
                  if (!user) return;
                  try {
                    const { initiateCall } = await import("@/lib/callSignaling");
                    const callId = await initiateCall({
                      calleeId: chatInfo.other_id!,
                      chatId: id as string,
                      callType: "video",
                      callerId: user.id,
                    });
                    router.push({ pathname: "/call/[id]", params: { id: callId } });
                  } catch (e: any) {
                    showAlert("Call failed", e.message || "Could not start call.");
                  }
                }}
              >
                <Ionicons name="videocam-outline" size={23} color={colors.text} />
              </TouchableOpacity>
            </>
          )}
          {chatInfo && (
            <TouchableOpacity style={st.headerAction} hitSlop={8} onPress={() => setShowChatOptions(true)}>
              <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Stranger message-request banner ── */}
      {isStranger && chatInfo?.other_id && (
        <View style={[st.strangerBanner, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <View style={[st.strangerIconWrap, { backgroundColor: "#FF9500" + "18" }]}>
              <Ionicons name="person-add-outline" size={18} color="#FF9500" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.strangerTitle, { color: colors.text }]}>New message request</Text>
              <Text style={[st.strangerSub, { color: colors.textMuted }]}>
                {chatInfo.other_name || "Unknown"}{strangerCountry ? ` · ${strangerCountry}` : ""}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <TouchableOpacity
              style={[st.strangerBtn, { backgroundColor: BRAND }]}
              onPress={() => { setIsStranger(false); chatInputRef.current?.focus(); }}
            >
              <Ionicons name="chatbubble-outline" size={13} color="#fff" />
              <Text style={st.strangerBtnText}>Accept & Reply</Text>
            </TouchableOpacity>
            {Platform.OS !== "web" && (
              <TouchableOpacity
                style={[st.strangerBtnOutline, { borderColor: colors.border }]}
                onPress={async () => {
                  try {
                    const Contacts = await import("expo-contacts");
                    const { status } = await Contacts.requestPermissionsAsync();
                    if (status !== "granted") { showAlert("Permission needed", "Allow contacts access to save this person."); return; }
                    await Contacts.presentContactInputAsync({ [Contacts.Fields.FirstName]: chatInfo.other_name || "Unknown" } as any);
                    setIsStranger(false);
                  } catch {}
                }}
              >
                <Ionicons name="person-add-outline" size={13} color={colors.text} />
                <Text style={[st.strangerBtnOutlineText, { color: colors.text }]}>Save Contact</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[st.strangerBtnOutline, { borderColor: colors.border }]}
              onPress={async () => {
                if (!chatInfo.other_id) return;
                try { await supabase.from("follows").insert({ follower_id: user?.id, following_id: chatInfo.other_id }); } catch {}
                setIsStranger(false);
              }}
            >
              <Ionicons name="person-outline" size={13} color={colors.text} />
              <Text style={[st.strangerBtnOutlineText, { color: colors.text }]}>Follow</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.strangerBtnOutline, { borderColor: "#FF3B30" + "55" }]}
              onPress={() => {
                showAlert("Block this user?", "They won't be able to send you messages.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Block", style: "destructive", onPress: async () => {
                    if (!chatInfo.other_id || !user) return;
                    try { await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: chatInfo.other_id }); } catch {}
                    setIsStranger(false);
                    router.back();
                  }},
                ]);
              }}
            >
              <Ionicons name="ban-outline" size={13} color="#FF3B30" />
              <Text style={[st.strangerBtnOutlineText, { color: "#FF3B30" }]}>Block</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Message list — fills remaining space, padded so content clears the floating input ── */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <ChatLoadingSkeleton />
        ) : messages.length === 0 ? (
          <View style={[st.emptyState, { paddingBottom: floatingInputHeight + 16 }]}>
            <View style={[st.emptyIconWrap, { backgroundColor: BRAND + "14" }]}>
              <Ionicons name="chatbubbles-outline" size={48} color={BRAND} />
            </View>
            <Text style={[st.emptyTitle, { color: colors.text }]}>No messages yet</Text>
            <Text style={[st.emptySub, { color: colors.textMuted }]}>
              Say hello to start the conversation
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(m) => m.id}
              extraData={highlightedMsgId}
              renderItem={renderMessage}
              inverted
              contentContainerStyle={[st.listContent, { paddingTop: floatingInputHeight + (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + 16 }]}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onEndReached={loadMoreMessages}
              onEndReachedThreshold={0.3}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                }, 300);
              }}
              ListHeaderComponent={
                (typingUsers.length > 0 || isAfuAiTyping)
                  ? <TypingBubble
                      names={isAfuAiTyping ? ["AfuAI", ...typingUsers] : typingUsers}
                      colors={{
                        ...colors,
                        bubbleIncoming: isAfuAiTyping && typingUsers.length === 0 ? "#004D5C" : colors.bubbleIncoming,
                        bubbleIncomingText: isAfuAiTyping && typingUsers.length === 0 ? "#E0F7FA" : colors.bubbleIncomingText,
                      }}
                    />
                  : null
              }
              ListFooterComponent={
                loadingMore
                  ? <View style={{ paddingVertical: 12, alignItems: "center" }}><ActivityIndicator size="small" color={colors.accent} /></View>
                  : null
              }
            />
            <Animated.View
              style={[st.scrollFab, { opacity: scrollBtnOpacity, backgroundColor: colors.surface, bottom: floatingInputHeight + (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + 8 }]}
              pointerEvents={showScrollBtn ? "auto" : "none"}
            >
              <TouchableOpacity onPress={scrollToBottom} style={st.scrollFabBtn} activeOpacity={0.7}>
                <Ionicons name="chevron-down" size={22} color={colors.text} />
                {newMsgCount > 0 && (
                  <View style={[st.scrollFabBadge, { backgroundColor: BRAND }]}>
                    <Text style={st.scrollFabBadgeText}>{newMsgCount > 99 ? "99+" : newMsgCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}
      </View>

      {/* ── Floating input container ── absolutely positioned, rises with keyboard ── */}
      <View
        style={[st.floatingInputContainer, { bottom: keyboardHeight > 0 ? keyboardHeight : insets.bottom }]}
        onLayout={(e) => setFloatingInputHeight(e.nativeEvent.layout.height)}
        pointerEvents="box-none"
      >

        {editingMessage && (
          <View style={[st.replyBanner, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <View style={[st.replyBarAccent, { backgroundColor: "#FF9500" }]} />
            <View style={{ flex: 1 }}>
              <Text style={[st.replyBannerName, { color: "#FF9500" }]}>Editing message</Text>
              <Text style={[st.replyBannerText, { color: colors.textSecondary }]} numberOfLines={1}>{stripMdForPreview(editingMessage.encrypted_content)}</Text>
            </View>
            <TouchableOpacity onPress={cancelEdit} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {replyTo && !editingMessage && (
          <View style={[st.replyBanner, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <View style={[st.replyBarAccent, { backgroundColor: BRAND }]} />
            <View style={{ flex: 1 }}>
              <Text style={[st.replyBannerName, { color: BRAND }]}>{replyTo.sender?.display_name || "Message"}</Text>
              <Text style={[st.replyBannerText, { color: colors.textSecondary }]} numberOfLines={1}>{stripMdForPreview(replyTo.encrypted_content ?? "")}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {attachmentPreview && (
          <View style={[st.attachPreviewBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            {attachmentPreview.type === "image" ? (
              <Image source={{ uri: attachmentPreview.uri }} style={st.attachPreviewImg} />
            ) : (
              <View style={[st.attachPreviewFile, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="document" size={20} color={BRAND} />
                <Text style={[st.attachPreviewName, { color: colors.text }]} numberOfLines={1}>{attachmentPreview.name || "File"}</Text>
              </View>
            )}
            <View style={{ flex: 1, paddingHorizontal: 10 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
                {attachmentPreview.type === "image" ? "Photo ready to send" : attachmentPreview.name || "File ready to send"}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Type a caption below (optional)</Text>
            </View>
            <TouchableOpacity onPress={() => setAttachmentPreview(null)} style={st.attachPreviewClose} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {messageLimited ? (
          <View style={[st.inputFloatOuter, { paddingBottom: 8 }]}>
            <View style={[st.limitedGlass, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="lock-closed" size={15} color={colors.textMuted} style={{ marginRight: 8 }} />
              <Text style={[st.limitedText, { color: colors.textSecondary }]}>
                You can send more messages once {chatInfo?.other_name || "this user"} replies or follows you
              </Text>
            </View>
          </View>
        ) : isRecording && recLocked ? (
          <View style={[st.inputFloatOuter, { paddingBottom: 8 }]}>
            {true ? (
              <View style={[st.inputGlassPill, { backgroundColor: colors.surface, borderColor: colors.border + "60" }]}>
                <View style={st.recLockedInner}>
                  <TouchableOpacity onPress={cancelVoiceRecording} hitSlop={12} style={st.recLockedTrash}>
                    <Ionicons name="trash" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                  <View style={st.recLockedWaveWrap}>
                    {waveformLevels.map((level, i) => (
                      <View key={i} style={[st.waveformBar, { height: Math.max(4, level * 28), backgroundColor: BRAND, opacity: 0.45 + level * 0.55 }]} />
                    ))}
                  </View>
                  <View style={st.recLockedTime}>
                    <Animated.View style={[st.recordingDot, { opacity: pulseAnim }]} />
                    <Text style={[st.recordingText, { color: colors.text }]}>
                      {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")},{recordingTenths}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={stopVoiceRecording} style={[st.sendBtn, { backgroundColor: BRAND }]}>
                    <Ionicons name="send" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[st.inputGlassPill, { backgroundColor: colors.surface, borderColor: colors.border + "60" }]}>
                <View style={st.recLockedInner}>
                  <TouchableOpacity onPress={cancelVoiceRecording} hitSlop={12} style={st.recLockedTrash}>
                    <Ionicons name="trash" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                  <View style={st.recLockedWaveWrap}>
                    {waveformLevels.map((level, i) => (
                      <View key={i} style={[st.waveformBar, { height: Math.max(4, level * 28), backgroundColor: BRAND, opacity: 0.45 + level * 0.55 }]} />
                    ))}
                  </View>
                  <View style={st.recLockedTime}>
                    <Animated.View style={[st.recordingDot, { opacity: pulseAnim }]} />
                    <Text style={[st.recordingText, { color: colors.text }]}>
                      {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")},{recordingTenths}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={stopVoiceRecording} style={[st.sendBtn, { backgroundColor: BRAND }]}>
                    <Ionicons name="send" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : (
          <>
            {!isRecording && (chatInfo?.is_group || chatInfo?.is_channel) && (
              <SmartReplyBar messages={messages} myId={user?.id || ""} input={input} onSend={handleSmartReply} colors={colors} />
            )}
            <View style={[st.inputFloatOuter, { paddingBottom: 8 }]}>
              {true ? (
                <View style={[st.inputGlassPill, { backgroundColor: colors.surface, borderColor: colors.border + "80" }, isRecording && !recLocked ? st.recHoldGlass : undefined]}>
                  <View style={st.inputBarRow}>
                    {isRecording && !recLocked ? (
                      <>
                        <ReAnimated.View style={[st.recCancelZone, cancelZoneAnimStyle]}>
                          <View style={st.recCancelCircle}>
                            <Ionicons name="trash" size={17} color="#FF3B30" />
                          </View>
                        </ReAnimated.View>
                        <View style={st.recHoldCenter}>
                          <View style={st.recHoldTimerRow}>
                            <Animated.View style={[st.recordingDot, { opacity: pulseAnim }]} />
                            <Text style={[st.recordingText, { color: colors.text }]}>
                              {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")},{recordingTenths}
                            </Text>
                          </View>
                          <ReAnimated.View style={slideHintAnimStyle}>
                            <View style={st.recSlideHint}>
                              <Ionicons name="chevron-back" size={13} color={colors.textMuted} />
                              <Ionicons name="chevron-back" size={13} color={colors.textMuted} style={{ marginLeft: -7, opacity: 0.45 }} />
                              <Text style={[st.recSlideText, { color: colors.textMuted }]}>Slide to cancel</Text>
                            </View>
                          </ReAnimated.View>
                        </View>
                      </>
                    ) : (
                      <View style={st.inputInnerRow}>
                        <TouchableOpacity hitSlop={8} style={st.pillIcon} onPress={() => {
                          if (showEmojiStickerPicker) {
                            setShowEmojiStickerPicker(false);
                            setTimeout(() => chatInputRef.current?.focus(), 50);
                          } else {
                            chatInputRef.current?.blur();
                            Keyboard.dismiss();
                            setShowEmojiStickerPicker(true);
                          }
                        }}>
                          <Ionicons name={showEmojiStickerPicker ? "keypad-outline" : "happy-outline"} size={23} color={colors.textMuted} />
                        </TouchableOpacity>
                        <TextInput
                          ref={chatInputRef}
                          style={[st.input, { color: colors.text }]}
                          placeholder={attachmentPreview ? "Add a caption..." : "Message"}
                          placeholderTextColor={colors.textMuted}
                          value={input}
                          onChangeText={(t) => { setInput(t); handleTyping(); saveDraft(t); }}
                          onFocus={() => { if (showEmojiStickerPicker) setShowEmojiStickerPicker(false); }}
                          multiline
                          maxLength={4000}
                          returnKeyType={chatPrefs.enter_to_send ? "send" : "default"}
                          blurOnSubmit={false}
                          onSubmitEditing={chatPrefs.enter_to_send ? () => sendMessage() : undefined}
                        />
                        {!input.trim() && (
                          <>
                            {!chatInfo?.is_group && !chatInfo?.is_channel && !isAfuAiDirectChat && (
                              <TouchableOpacity onPress={() => setShowGiftPicker(true)} hitSlop={8} style={st.pillIcon}>
                                <Ionicons name="gift-outline" size={21} color={colors.textMuted} />
                              </TouchableOpacity>
                            )}
                            {(chatInfo?.is_group || chatInfo?.is_channel) && (
                              <TouchableOpacity onPress={() => setShowRedEnvelope(true)} hitSlop={8} style={st.pillIcon}>
                                <Text style={{ fontSize: 19 }}>🧧</Text>
                              </TouchableOpacity>
                            )}
                            {!isAfuAiDirectChat && (
                              <TouchableOpacity onPress={() => setShowAttachMenu(true)} hitSlop={8} style={st.pillIcon}>
                                <Ionicons name="attach" size={21} color={colors.textMuted} style={{ transform: [{ rotate: "-45deg" }] }} />
                              </TouchableOpacity>
                            )}
                          </>
                        )}
                      </View>
                    )}
                    {(input.trim() || attachmentPreview) && !isRecording ? (
                      <TouchableOpacity
                        onPress={editingMessage ? saveEditMessage : attachmentPreview ? sendAttachment : () => sendMessage()}
                        disabled={sending}
                        style={[st.sendBtn, { backgroundColor: editingMessage ? "#FF9500" : BRAND }]}
                      >
                        {sending ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Ionicons name={editingMessage ? "checkmark" : "send"} size={18} color="#fff" />
                        )}
                      </TouchableOpacity>
                    ) : (
                      <View style={isRecording && !recLocked ? st.recMicWrap : undefined}>
                        {isRecording && !recLocked && (
                          <ReAnimated.View style={[st.recLockIndicator, lockIndicatorAnimStyle]}>
                            <View style={[st.recLockPill, { backgroundColor: colors.inputBg }]}>
                              <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
                              <Ionicons name="chevron-up" size={9} color={colors.textMuted} style={{ marginTop: -2 }} />
                            </View>
                          </ReAnimated.View>
                        )}
                        <GestureDetector gesture={micGesture}>
                          <ReAnimated.View style={[
                            isRecording && !recLocked ? [st.recMicBtn, { backgroundColor: BRAND, shadowColor: BRAND }] : [st.sendBtn, { backgroundColor: BRAND }],
                            isRecording && !recLocked ? micBtnAnimStyle : undefined,
                          ]}>
                            <Ionicons name="mic" size={isRecording ? 24 : 20} color="#fff" />
                          </ReAnimated.View>
                        </GestureDetector>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <View style={[st.inputGlassPill, { backgroundColor: colors.surface, borderColor: colors.border + "80" }, isRecording && !recLocked ? st.recHoldGlass : undefined]}>
                  <View style={st.inputBarRow}>
                    {isRecording && !recLocked ? (
                      <>
                        <ReAnimated.View style={[st.recCancelZone, cancelZoneAnimStyle]}>
                          <View style={st.recCancelCircle}>
                            <Ionicons name="trash" size={17} color="#FF3B30" />
                          </View>
                        </ReAnimated.View>
                        <View style={st.recHoldCenter}>
                          <View style={st.recHoldTimerRow}>
                            <Animated.View style={[st.recordingDot, { opacity: pulseAnim }]} />
                            <Text style={[st.recordingText, { color: colors.text }]}>
                              {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")},{recordingTenths}
                            </Text>
                          </View>
                          <ReAnimated.View style={slideHintAnimStyle}>
                            <View style={st.recSlideHint}>
                              <Ionicons name="chevron-back" size={13} color={colors.textMuted} />
                              <Ionicons name="chevron-back" size={13} color={colors.textMuted} style={{ marginLeft: -7, opacity: 0.45 }} />
                              <Text style={[st.recSlideText, { color: colors.textMuted }]}>Slide to cancel</Text>
                            </View>
                          </ReAnimated.View>
                        </View>
                      </>
                    ) : (
                      <View style={st.inputInnerRow}>
                        <TouchableOpacity hitSlop={8} style={st.pillIcon} onPress={() => {
                          if (showEmojiStickerPicker) {
                            setShowEmojiStickerPicker(false);
                            setTimeout(() => chatInputRef.current?.focus(), 50);
                          } else {
                            chatInputRef.current?.blur();
                            Keyboard.dismiss();
                            setShowEmojiStickerPicker(true);
                          }
                        }}>
                          <Ionicons name={showEmojiStickerPicker ? "keypad-outline" : "happy-outline"} size={23} color={colors.textMuted} />
                        </TouchableOpacity>
                        <TextInput
                          ref={chatInputRef}
                          style={[st.input, { color: colors.text }]}
                          placeholder={attachmentPreview ? "Add a caption..." : "Message"}
                          placeholderTextColor={colors.textMuted}
                          value={input}
                          onChangeText={(t) => { setInput(t); handleTyping(); saveDraft(t); }}
                          onFocus={() => { if (showEmojiStickerPicker) setShowEmojiStickerPicker(false); }}
                          multiline
                          maxLength={4000}
                          returnKeyType={chatPrefs.enter_to_send ? "send" : "default"}
                          blurOnSubmit={false}
                          onSubmitEditing={chatPrefs.enter_to_send ? () => sendMessage() : undefined}
                        />
                        {!input.trim() && (
                          <>
                            {!chatInfo?.is_group && !chatInfo?.is_channel && !isAfuAiDirectChat && (
                              <TouchableOpacity onPress={() => setShowGiftPicker(true)} hitSlop={8} style={st.pillIcon}>
                                <Ionicons name="gift-outline" size={21} color={colors.textMuted} />
                              </TouchableOpacity>
                            )}
                            {(chatInfo?.is_group || chatInfo?.is_channel) && (
                              <TouchableOpacity onPress={() => setShowRedEnvelope(true)} hitSlop={8} style={st.pillIcon}>
                                <Text style={{ fontSize: 19 }}>🧧</Text>
                              </TouchableOpacity>
                            )}
                            {!isAfuAiDirectChat && (
                              <TouchableOpacity onPress={() => setShowAttachMenu(true)} hitSlop={8} style={st.pillIcon}>
                                <Ionicons name="attach" size={21} color={colors.textMuted} style={{ transform: [{ rotate: "-45deg" }] }} />
                              </TouchableOpacity>
                            )}
                          </>
                        )}
                      </View>
                    )}
                    {(input.trim() || attachmentPreview) && !isRecording ? (
                      <TouchableOpacity
                        onPress={editingMessage ? saveEditMessage : attachmentPreview ? sendAttachment : () => sendMessage()}
                        disabled={sending}
                        style={[st.sendBtn, { backgroundColor: editingMessage ? "#FF9500" : BRAND }]}
                      >
                        {sending ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Ionicons name={editingMessage ? "checkmark" : "send"} size={18} color="#fff" />
                        )}
                      </TouchableOpacity>
                    ) : Platform.OS === "web" ? (
                      <TouchableOpacity onPress={startVoiceRecordingWeb} style={[st.sendBtn, { backgroundColor: BRAND }]} hitSlop={6}>
                        <Ionicons name="mic" size={20} color="#fff" />
                      </TouchableOpacity>
                    ) : (
                      <View style={isRecording && !recLocked ? st.recMicWrap : undefined}>
                        {isRecording && !recLocked && (
                          <ReAnimated.View style={[st.recLockIndicator, lockIndicatorAnimStyle]}>
                            <View style={[st.recLockPill, { backgroundColor: colors.inputBg }]}>
                              <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
                              <Ionicons name="chevron-up" size={9} color={colors.textMuted} style={{ marginTop: -2 }} />
                            </View>
                          </ReAnimated.View>
                        )}
                        <GestureDetector gesture={micGesture}>
                          <ReAnimated.View style={[
                            isRecording && !recLocked ? [st.recMicBtn, { backgroundColor: BRAND, shadowColor: BRAND }] : [st.sendBtn, { backgroundColor: BRAND }],
                            isRecording && !recLocked ? micBtnAnimStyle : undefined,
                          ]}>
                            <Ionicons name="mic" size={isRecording ? 24 : 20} color="#fff" />
                          </ReAnimated.View>
                        </GestureDetector>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>
          </>
        )}
        {showEmojiStickerPicker && (
          <EmojiStickerPicker
            height={emojiKeyboardHeight}
            onEmojiSelected={(emoji) => setInput((prev) => prev + emoji)}
            onSendSticker={sendStickerMessage}
            onClose={() => setShowEmojiStickerPicker(false)}
          />
        )}
      </View>

      <MiniProfilePopup
        userId={miniProfileUserId}
        visible={!!miniProfileUserId}
        onClose={() => setMiniProfileUserId(null)}
        currentChatId={chatInfo && !chatInfo.is_group && chatInfo.other_id === miniProfileUserId ? chatInfo.other_id : null}
      />

      <Modal visible={!!showReactions} transparent animationType="fade" onRequestClose={() => { setShowReactions(null); setAiResult(null); setAiResultType(null); setAiReplies([]); }}>
        <View style={st.reactModalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { setShowReactions(null); setAiResult(null); setAiResultType(null); setAiReplies([]); }} />
          <View style={[st.reactModalContainer, { backgroundColor: colors.surface }]}>
            <View style={st.reactModalEmojiRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[st.reactModalEmojiBtn, { backgroundColor: colors.inputBg }]}
                  onPress={() => showReactions && addReaction(showReactions, emoji)}
                >
                  <Text style={st.reactModalEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[st.reactModalDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={st.reactModalAction} onPress={() => { if (showReactions) { setReplyTo(showReactions); setTimeout(() => chatInputRef.current?.focus(), 50); setShowReactions(null); } }}>
              <Ionicons name="arrow-undo" size={20} color={colors.text} />
              <Text style={[st.reactModalActionText, { color: colors.text }]}>Reply</Text>
            </TouchableOpacity>
            {showReactions && (() => {
              const txt = showReactions.encrypted_content?.trim();
              const isGift = !txt || txt.startsWith("🎁 ") || txt.startsWith("🧧") || txt.includes("|giftId:");
              if (isGift) return null;
              return (
                <TouchableOpacity
                  style={st.reactModalAction}
                  onPress={async () => {
                    await Clipboard.setStringAsync(txt);
                    setShowReactions(null);
                    showAlert("Copied", "Message text copied to clipboard.");
                  }}
                >
                  <Ionicons name="copy-outline" size={20} color={colors.text} />
                  <Text style={[st.reactModalActionText, { color: colors.text }]}>Copy Text</Text>
                </TouchableOpacity>
              );
            })()}
            <TouchableOpacity
              style={st.reactModalAction}
              onPress={() => { if (showReactions) { openForward(showReactions); setShowReactions(null); } }}
            >
              <Ionicons name="arrow-redo" size={20} color={colors.text} />
              <Text style={[st.reactModalActionText, { color: colors.text }]}>Forward</Text>
            </TouchableOpacity>
            {showReactions && (() => {
              const txt = showReactions.encrypted_content?.trim();
              const isGift = !txt || txt.startsWith("🎁 ") || txt.startsWith("🧧") || txt.includes("|giftId:");
              if (isGift) return null;
              return (
                <TouchableOpacity
                  style={st.reactModalAction}
                  onPress={() => { if (showReactions) handleStarMessage(showReactions); }}
                >
                  <Ionicons name="star-outline" size={20} color={Colors.gold} />
                  <Text style={[st.reactModalActionText, { color: colors.text }]}>Star Message</Text>
                </TouchableOpacity>
              );
            })()}
            {showReactions && showReactions.attachment_url && showReactions.attachment_type !== "video" && Platform.OS !== "web" && (
              <TouchableOpacity
                style={st.reactModalAction}
                onPress={() => { if (showReactions) handleSaveToPhone(showReactions); }}
              >
                <Ionicons name="download-outline" size={20} color={colors.text} />
                <Text style={[st.reactModalActionText, { color: colors.text }]}>Save to Phone</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={st.reactModalAction}
              onPress={() => { if (showReactions) openTranslatePicker(showReactions); }}
            >
              <Ionicons name="language-outline" size={20} color={colors.text} />
              <Text style={[st.reactModalActionText, { color: colors.text }]}>Translate</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: "auto" }} />
            </TouchableOpacity>
            {showReactions && showReactions.sender_id === user?.id && !showReactions.attachment_url && !showReactions.encrypted_content.startsWith("🎁 ") && !showReactions.encrypted_content.startsWith("🧧") && !showReactions.encrypted_content.includes("|giftId:") && (
              <TouchableOpacity
                style={st.reactModalAction}
                onPress={() => { if (showReactions) startEditMessage(showReactions); }}
              >
                <Ionicons name="pencil-outline" size={20} color={colors.text} />
                <Text style={[st.reactModalActionText, { color: colors.text }]}>Edit</Text>
              </TouchableOpacity>
            )}
            {showReactions && showReactions.sender_id === user?.id && (
              <TouchableOpacity
                style={st.reactModalAction}
                onPress={() => { if (showReactions) handleDeleteMessage(showReactions); }}
              >
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                <Text style={[st.reactModalActionText, { color: "#FF3B30" }]}>Delete</Text>
              </TouchableOpacity>
            )}
            {showReactions && showReactions.sender_id !== user?.id && (
              <TouchableOpacity
                style={st.reactModalAction}
                onPress={() => { if (showReactions) handleReportMessage(showReactions); }}
              >
                <Ionicons name="flag-outline" size={20} color="#FF3B30" />
                <Text style={[st.reactModalActionText, { color: "#FF3B30" }]}>Report Message</Text>
              </TouchableOpacity>
            )}
            {advancedFeatures.message_reminders && showReactions && showReactions.encrypted_content && !showReactions.encrypted_content.startsWith("🎁 ") && !showReactions.encrypted_content.startsWith("🧧") && !["📷 Photo", "🎥 Video", "GIF"].includes(showReactions.encrypted_content) && (
              <TouchableOpacity
                style={st.reactModalAction}
                onPress={() => { setReminderMsg(showReactions); setShowReactions(null); setAiResult(null); setAiResultType(null); setAiReplies([]); }}
              >
                <Ionicons name="alarm-outline" size={20} color={colors.accent} />
                <Text style={[st.reactModalActionText, { color: colors.text }]}>Remind Me</Text>
              </TouchableOpacity>
            )}

            {(chatInfo?.is_group || chatInfo?.is_channel) && (
              <>
                <View style={[st.reactModalDivider, { backgroundColor: colors.border }]} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}>
                  <Ionicons name="sparkles" size={12} color={colors.accent} />
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>AI Features</Text>
                </View>
                {showReactions && showReactions.encrypted_content.length >= 500 && (
                  <TouchableOpacity
                    style={[st.reactModalAction, { opacity: aiLoading && aiResultType === "summary" ? 0.5 : 1 }]}
                    disabled={aiLoading}
                    onPress={() => { if (showReactions) handleAiSummarize(showReactions); }}
                  >
                    <Ionicons name="document-text-outline" size={20} color={colors.accent} />
                    <Text style={[st.reactModalActionText, { color: colors.text }]}>Summarize Message</Text>
                    {aiLoading && aiResultType === "summary" && <ActivityIndicator color={colors.accent} size="small" style={{ marginLeft: "auto" }} />}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[st.reactModalAction, { opacity: aiLoading && aiResultType === "replies" ? 0.5 : 1 }]}
                  disabled={aiLoading}
                  onPress={handleAiSuggestReply}
                >
                  <Ionicons name="chatbubbles-outline" size={20} color="#D4A853" />
                  <Text style={[st.reactModalActionText, { color: colors.text }]}>Smart Replies</Text>
                  {aiLoading && aiResultType === "replies" && <ActivityIndicator color="#D4A853" size="small" style={{ marginLeft: "auto" }} />}
                </TouchableOpacity>

                {aiResult && aiResultType === "summary" && (
                  <View style={{ marginTop: 6, backgroundColor: colors.accent + "0A", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.accent + "18" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <Ionicons name="sparkles" size={12} color={colors.accent} />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>Summary</Text>
                    </View>
                    <Text style={{ fontSize: 14, color: colors.text, fontFamily: "Inter_400Regular", lineHeight: 20 }}>{aiResult}</Text>
                  </View>
                )}

                {aiReplies.length > 0 && aiResultType === "replies" && (
                  <View style={{ marginTop: 6, gap: 6 }}>
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
          </View>
        </View>
      </Modal>

      <BottomSheet visible={showAfuAiMenu} onClose={() => setShowAfuAiMenu(false)}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
            <Ionicons name="sparkles" size={18} color="#00BCD4" />
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text }}>AfuAI Options</Text>
          </View>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 }}
            activeOpacity={0.7}
            onPress={clearAfuAiChatHistory}
          >
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#FF3B3018", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="trash-outline" size={19} color="#FF3B30" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FF3B30" }}>Clear chat history</Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 2 }}>Delete all messages and start a new thread</Text>
            </View>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={!!reminderMsg} onClose={() => setReminderMsg(null)}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + "18", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="alarm-outline" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text }}>Remind Me</Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                {reminderMsg?.encrypted_content?.slice(0, 60) || "This message"}
              </Text>
            </View>
          </View>
          {[
            { label: "In 30 minutes", icon: "time-outline" as const, seconds: 30 * 60 },
            { label: "In 1 hour",     icon: "time-outline" as const, seconds: 60 * 60 },
            { label: "In 4 hours",    icon: "time-outline" as const, seconds: 4 * 60 * 60 },
            { label: "Tomorrow morning", icon: "sunny-outline" as const, seconds: (() => {
                const now = new Date();
                const tom = new Date(now);
                tom.setDate(tom.getDate() + 1);
                tom.setHours(8, 0, 0, 0);
                return Math.max(3600, Math.floor((tom.getTime() - now.getTime()) / 1000));
              })() },
            { label: "Next week",     icon: "calendar-outline" as const, seconds: 7 * 24 * 60 * 60 },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.label}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}
              onPress={() => reminderMsg && scheduleReminder(reminderMsg, opt.seconds)}
              activeOpacity={0.7}
            >
              <Ionicons name={opt.icon} size={20} color={colors.accent} />
              <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: colors.text, flex: 1 }}>{opt.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={showLangPicker} onClose={() => { setShowLangPicker(false); setTranslateMsg(null); setAiResult(null); setAiResultType(null); }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity onPress={() => { setShowLangPicker(false); setTranslateMsg(null); setAiResult(null); setAiResultType(null); }} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Ionicons name="language-outline" size={20} color={colors.accent} />
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text }}>Translate to</Text>
          </View>
          {translatingLang && <ActivityIndicator color={colors.accent} size="small" />}
        </View>
        {translateMsg && (
          <View style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 6, backgroundColor: colors.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted, fontFamily: "Inter_400Regular" }} numberOfLines={2}>{translateMsg.encrypted_content}</Text>
          </View>
        )}
        {aiResult && aiResultType === "translate" && (
          <View style={{ marginHorizontal: 16, marginTop: 6, marginBottom: 6, backgroundColor: colors.accent + "0A", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.accent + "18" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.accent, textTransform: "uppercase", letterSpacing: 0.4 }}>Translation</Text>
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

      <GiftPickerSheet
        visible={showGiftPicker}
        onClose={() => setShowGiftPicker(false)}
        onSend={sendGift}
        sending={giftSending}
        acoinBalance={profile?.acoin ?? 0}
        recipientName={chatInfo?.other_name}
      />

      <BottomSheet visible={showAttachMenu} onClose={() => setShowAttachMenu(false)}>
        <Text style={[st.sheetTitle, { color: colors.text }]}>Share</Text>
        <View style={st.attachGrid}>
          {Platform.OS !== "web" && (
            <TouchableOpacity style={[st.attachOption, { backgroundColor: colors.inputBg }]} onPress={pickFromCamera}>
              <View style={[st.attachIconBg, { backgroundColor: "#FF6B35" }]}>
                <Ionicons name="camera" size={24} color="#fff" />
              </View>
              <Text style={[st.attachLabel, { color: colors.text }]}>Camera</Text>
            </TouchableOpacity>
          )}
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

      <Modal visible={!!envReveal} transparent animationType="fade" onRequestClose={() => setEnvReveal(null)}>
        <View style={st.envRevealOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setEnvReveal(null)} />
          <View style={[st.envRevealCard, { backgroundColor: colors.surface }]}>
            <View style={st.envRevealTop}>
              <Text style={st.envRevealBigEmoji}>🧧</Text>
              {envReveal?.amount !== null ? (
                <>
                  <Text style={st.envRevealAmountLabel}>
                    {envReveal?.alreadyClaimed ? "You already received" : "You received"}
                  </Text>
                  <Text style={st.envRevealAmount}>{envReveal?.amount} <Text style={st.envRevealCurrency}>ACoin</Text></Text>
                </>
              ) : envReveal?.isSender ? (
                <>
                  <Text style={st.envRevealAmountLabel}>Your Red Envelope</Text>
                  <Text style={[st.envRevealStatus, { color: colors.textSecondary }]}>
                    {envReveal?.totalAmount} ACoin · {envReveal?.claimedCount}/{envReveal?.totalCount} claimed
                  </Text>
                </>
              ) : (
                <Text style={st.envRevealAmountLabel}>All envelopes have been claimed</Text>
              )}
            </View>
            <View style={[st.envRevealDivider, { backgroundColor: colors.border }]} />
            <View style={st.envRevealBottom}>
              <Text style={[st.envRevealFrom, { color: colors.textMuted }]}>From {envReveal?.senderName}</Text>
              <Text style={[st.envRevealMsg, { color: colors.text }]}>"{envReveal?.message}"</Text>
              <Text style={[st.envRevealStats, { color: colors.textMuted }]}>
                {envReveal?.claimedCount}/{envReveal?.totalCount} opened
              </Text>
            </View>
            <TouchableOpacity style={st.envRevealBtn} onPress={() => setEnvReveal(null)}>
              <Text style={st.envRevealBtnText}>
                {envReveal?.amount !== null ? "Awesome!" : "Got it"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!giftReveal} transparent animationType="fade" onRequestClose={() => setGiftReveal(null)}>
        <View style={st.giftRevealOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setGiftReveal(null)} />
          <View style={[st.giftRevealContainer, { backgroundColor: colors.surface }]}>
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
                <TouchableOpacity style={[st.giftRevealBtn, { backgroundColor: BRAND }]} onPress={() => { setGiftReveal(null); router.push("/gifts"); }}>
                  <Text style={st.giftRevealBtnText}>View Gift Gallery</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[st.giftRevealBtn, { backgroundColor: BRAND }]} onPress={() => setGiftReveal(null)}>
                  <Text style={st.giftRevealBtnText}>Awesome!</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
      <ImageViewer
        images={imgViewer.images}
        initialIndex={imgViewer.index}
        visible={imgViewer.visible}
        onClose={imgViewer.closeViewer}
      />


      {/* ── Chat Options Sheet ─────────────────────────────────────────────── */}
      <Modal
        visible={showChatOptions}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowChatOptions(false); setShowDisappearingPicker(false); }}
      >
        <View style={st.optionsOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { setShowChatOptions(false); setShowDisappearingPicker(false); }} />
          <View style={[st.optionsSheet, { backgroundColor: colors.surface }]}>
            {/* Handle */}
            <View style={[st.optionsHandle, { backgroundColor: colors.border }]} />

            {/* Contact / Chat identity header */}
            <View style={[st.optionsIdentity, { borderBottomColor: colors.border }]}>
              <Avatar
                uri={chatInfo?.is_group || chatInfo?.is_channel ? chatInfo?.avatar_url : chatInfo?.other_avatar}
                name={headerTitle}
                size={52}
              />
              <View style={{ flex: 1 }}>
                <Text style={[st.optionsName, { color: colors.text }]} numberOfLines={1}>{headerTitle}</Text>
                <Text style={[st.optionsSub, { color: colors.textMuted }]}>
                  {chatInfo?.is_channel ? "Channel" : chatInfo?.is_group ? "Group chat" : chatInfo?.other_id === AFUAI_BOT_ID ? "AI Assistant" : "Private chat"}
                </Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>

              {/* ── SECTION: Chat ───────────────────────────────────────── */}
              <Text style={[st.optionsSection, { color: colors.textMuted }]}>CHAT</Text>

              <TouchableOpacity
                style={[st.optionsRow, { borderBottomColor: colors.border }]}
                onPress={() => { setShowChatOptions(false); router.push({ pathname: "/saved-posts", params: { tab: "messages" } } as any); }}
              >
                <View style={[st.optionsIcon, { backgroundColor: "#FF9500" }]}>
                  <Ionicons name="star" size={16} color="#fff" />
                </View>
                <Text style={[st.optionsLabel, { color: colors.text }]}>Starred Messages</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              {(chatInfo?.is_group || chatInfo?.is_channel) && (
                <TouchableOpacity
                  style={[st.optionsRow, { borderBottomColor: colors.border }]}
                  onPress={() => { setShowChatOptions(false); router.push({ pathname: "/group/[id]", params: { id: id as string } }); }}
                >
                  <View style={[st.optionsIcon, { backgroundColor: "#5856D6" }]}>
                    <Ionicons name="people" size={16} color="#fff" />
                  </View>
                  <Text style={[st.optionsLabel, { color: colors.text }]}>
                    {chatInfo?.is_channel ? "Channel Info" : "Group Info & Members"}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}

              {chatInfo?.other_id && !chatInfo.is_group && !chatInfo.is_channel && chatInfo.other_id !== AFUAI_BOT_ID && (
                <TouchableOpacity
                  style={[st.optionsRow, { borderBottomColor: colors.border }]}
                  onPress={() => { setShowChatOptions(false); router.push({ pathname: "/contact/[id]", params: { id: chatInfo.other_id! } }); }}
                >
                  <View style={[st.optionsIcon, { backgroundColor: "#34C759" }]}>
                    <Ionicons name="person" size={16} color="#fff" />
                  </View>
                  <Text style={[st.optionsLabel, { color: colors.text }]}>View Profile</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}

              {/* ── SECTION: Privacy ─────────────────────────────────────── */}
              <Text style={[st.optionsSection, { color: colors.textMuted, marginTop: 8 }]}>PRIVACY</Text>

              <TouchableOpacity
                style={[st.optionsRow, { borderBottomColor: colors.border }]}
                onPress={handleMuteToggle}
              >
                <View style={[st.optionsIcon, { backgroundColor: isMuted ? "#8E8E93" : "#007AFF" }]}>
                  <Ionicons name={isMuted ? "notifications-off" : "notifications"} size={16} color="#fff" />
                </View>
                <Text style={[st.optionsLabel, { color: colors.text }]}>{isMuted ? "Unmute Notifications" : "Mute Notifications"}</Text>
                <View style={[st.optionsToggle, { backgroundColor: isMuted ? BRAND : colors.border }]}>
                  <View style={[st.optionsToggleThumb, { transform: [{ translateX: isMuted ? 14 : 0 }] }]} />
                </View>
              </TouchableOpacity>

              {!chatInfo?.is_channel && (() => {
                const DISAPPEAR_OPTIONS = [
                  { label: "Off",      seconds: 0 },
                  { label: "5 minutes", seconds: 300 },
                  { label: "1 hour",   seconds: 3600 },
                  { label: "24 hours", seconds: 86400 },
                  { label: "7 days",   seconds: 604800 },
                  { label: "4 weeks",  seconds: 2419200 },
                ];
                const activeLabel = disappearingEnabled
                  ? (DISAPPEAR_OPTIONS.find((o) => o.seconds === disappearingTimer)?.label ?? "Custom")
                  : "Off";
                return (
                  <>
                    <TouchableOpacity
                      style={[st.optionsRow, { borderBottomColor: colors.border }]}
                      onPress={() => setShowDisappearingPicker((v) => !v)}
                    >
                      <View style={[st.optionsIcon, { backgroundColor: disappearingEnabled ? BRAND : "#5856D6" }]}>
                        <Ionicons name="timer-outline" size={16} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.optionsLabel, { color: colors.text }]}>Disappearing Messages</Text>
                        <Text style={{ fontSize: 12, color: disappearingEnabled ? BRAND : colors.textMuted, marginTop: 1 }}>{activeLabel}</Text>
                      </View>
                      <Ionicons name={showDisappearingPicker ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                    {showDisappearingPicker && (
                      <View style={{ backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        {DISAPPEAR_OPTIONS.map((opt) => {
                          const isSelected = opt.seconds === 0 ? !disappearingEnabled : (disappearingEnabled && disappearingTimer === opt.seconds);
                          return (
                            <TouchableOpacity
                              key={opt.seconds}
                              style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
                              onPress={() => handleDisappearingTimerSelect(opt.seconds)}
                            >
                              <Ionicons
                                name={opt.seconds === 0 ? "close-circle-outline" : "timer-outline"}
                                size={16}
                                color={isSelected ? BRAND : colors.textMuted}
                                style={{ marginRight: 12 }}
                              />
                              <Text style={{ flex: 1, fontSize: 14, color: isSelected ? BRAND : colors.text, fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_400Regular" }}>
                                {opt.label}
                              </Text>
                              {isSelected && <Ionicons name="checkmark" size={16} color={BRAND} />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                );
              })()}

              {/* ── SECTION: Safety ─────────────────────────────────────── */}
              {chatInfo?.other_id && !chatInfo.is_group && !chatInfo.is_channel && chatInfo.other_id !== AFUAI_BOT_ID && (
                <>
                  <Text style={[st.optionsSection, { color: colors.textMuted, marginTop: 8 }]}>SAFETY</Text>

                  <TouchableOpacity
                    style={[st.optionsRow, { borderBottomColor: colors.border }]}
                    onPress={() => { setShowChatOptions(false); handleBlockUser(); }}
                  >
                    <View style={[st.optionsIcon, { backgroundColor: isBlocked ? "#34C759" : "#FF3B30" }]}>
                      <Ionicons name={isBlocked ? "checkmark-circle" : "ban"} size={16} color="#fff" />
                    </View>
                    <Text style={[st.optionsLabel, { color: isBlocked ? "#34C759" : "#FF3B30" }]}>
                      {isBlocked ? `Unblock ${headerTitle}` : `Block ${headerTitle}`}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[st.optionsRow, { borderBottomColor: colors.border }]}
                    onPress={() => { setShowChatOptions(false); handleReportUser(); }}
                  >
                    <View style={[st.optionsIcon, { backgroundColor: "#FF9500" }]}>
                      <Ionicons name="flag" size={16} color="#fff" />
                    </View>
                    <Text style={[st.optionsLabel, { color: "#FF9500" }]}>Report {headerTitle}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </>
              )}

              {/* ── SECTION: Danger ─────────────────────────────────────── */}
              <Text style={[st.optionsSection, { color: colors.textMuted, marginTop: 8 }]}>MANAGE</Text>

              <TouchableOpacity
                style={[st.optionsRow, { borderBottomColor: colors.border }]}
                onPress={handleClearChatMessages}
              >
                <View style={[st.optionsIcon, { backgroundColor: "#FF3B30" }]}>
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                </View>
                <Text style={[st.optionsLabel, { color: "#FF3B30" }]}>Clear Chat</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[st.optionsRow, { borderBottomColor: "transparent" }]}
                onPress={handleDeleteChat}
              >
                <View style={[st.optionsIcon, { backgroundColor: "#FF3B30" }]}>
                  <Ionicons name={chatInfo?.is_group || chatInfo?.is_channel ? "exit-outline" : "close-circle-outline"} size={16} color="#fff" />
                </View>
                <Text style={[st.optionsLabel, { color: "#FF3B30" }]}>
                  {chatInfo?.is_channel ? "Leave Channel" : chatInfo?.is_group ? "Leave Group" : "Delete Chat"}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <View style={{ height: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

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

  optionsOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  optionsSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 32,
    paddingTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 16,
  },
  optionsHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
  optionsIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  optionsName: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  optionsSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  optionsSection: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionsIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  optionsLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  optionsToggle: {
    width: 34,
    height: 20,
    borderRadius: 10,
    padding: 2,
    justifyContent: "center",
  },
  optionsToggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#fff",
  },

  headerProfile: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  headerAction: { padding: 6 },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingVertical: 8 },

  dateBadge: {
    alignSelf: "center",
    marginVertical: 10,
  },
  datePill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  dateBadgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptySub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

  scrollFab: {
    position: "absolute",
    right: 16,
    bottom: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  scrollFabBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollFabBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#00BCD4",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  scrollFabBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },

  msgRow: { flexDirection: "row", paddingHorizontal: 12, marginVertical: 0 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },

  bubbleContainer: { maxWidth: "78%", position: "relative", flexShrink: 1, minWidth: 0 },
  bubbleContainerMe: { alignItems: "flex-end" },
  bubbleContainerOther: { alignItems: "flex-start" },

  // Tail sits just outside the bubble corner, overlapping by 2 px so
  // there's no hairline gap between bubble and tail.
  tailMe: { position: "absolute", right: -12, bottom: 0, zIndex: 1 },
  tailOther: { position: "absolute", left: -12, bottom: 0, zIndex: 1 },

  bubble: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 18,
    minWidth: 64,
    overflow: "hidden",
    flexShrink: 1,
  },
  bubbleWithReply: {
    alignSelf: "stretch",
  },
  // When no tail: all four corners stay at the full radius (set above).
  bubbleMe: {},
  bubbleOther: {},
  // When the tail IS shown: flatten the corner the tail attaches to so the
  // tail and bubble meet seamlessly, matching iMessage style.
  bubbleTailMe: {
    borderBottomRightRadius: 0,
  },
  bubbleTailOther: {
    borderBottomLeftRadius: 0,
  },

  senderName: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 2 },

  replyPreview: { flexDirection: "row", alignItems: "stretch", borderRadius: 8, marginBottom: 6, alignSelf: "stretch", overflow: "hidden" },
  replyBarLine: { width: 3, flexShrink: 0, borderRadius: 0 },
  replyTextWrap: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 6, justifyContent: "center" },
  replyPreviewText: { fontSize: 12.5, fontFamily: "Inter_500Medium", flexShrink: 1, minWidth: 0 },

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

  attachImage: { width: ATTACH_W, height: ATTACH_H, borderRadius: 10 },
  attachVideo: { width: ATTACH_W, height: ATTACH_H, borderRadius: 10, overflow: "hidden", backgroundColor: "#0D0D0D" },
  audioRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 180 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 260 },
  fileIconBg: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  fileName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  fileMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  storyReplyCard: { width: STORY_REPLY_W, height: STORY_REPLY_H, borderRadius: 10, overflow: "hidden", borderWidth: 1 },
  storyReplyThumb: { width: "100%", height: "100%" },
  storyReplyOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5 },
  storyReplyLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.9)", flex: 1 },

  replyBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  replyBarAccent: { width: 3, height: 32, borderRadius: 2 },
  replyBannerName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyBannerText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  attachPreviewBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  attachPreviewImg: { width: 68, height: 68, borderRadius: 10 },
  attachPreviewFile: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  attachPreviewName: { fontSize: 13, fontFamily: "Inter_500Medium", maxWidth: 160 },
  attachPreviewClose: { marginLeft: "auto" },

  limitedText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 18,
  },
  limitedGlass: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
  },

  strangerBanner: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  strangerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  strangerTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  strangerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  strangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  strangerBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  strangerBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  strangerBtnOutlineText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },

  floatingInputContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  inputFloatOuter: {
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  inputGlassPill: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(120,120,128,0.22)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 6,
  },
  inputBarRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 5,
  },
  inputInnerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
  },
  pillIcon: { paddingHorizontal: 6 },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 22, outlineStyle: "none" as any, paddingTop: 10, paddingBottom: 10, minHeight: 28, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  recHoldGlass: { },
  recCancelZone: { width: 44, alignItems: "center", justifyContent: "center" },
  recCancelCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,59,48,0.1)", alignItems: "center", justifyContent: "center" },
  recHoldCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  recHoldTimerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  recSlideHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, marginTop: 2 },
  recSlideText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  recMicWrap: { alignItems: "center", justifyContent: "flex-end" },
  recMicBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: BRAND_FALLBACK, alignItems: "center", justifyContent: "center", elevation: 8, shadowColor: BRAND_FALLBACK, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.55, shadowRadius: 10 },
  recLockIndicator: { alignItems: "center", marginBottom: 8 },
  recLockPill: { width: 32, borderRadius: 16, paddingVertical: 6, alignItems: "center", justifyContent: "center", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  recLockedInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 8, minHeight: 56 },
  recLockedTrash: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,59,48,0.12)", alignItems: "center", justifyContent: "center" },
  recLockedWaveWrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2, height: 30, overflow: "hidden" },
  recLockedTime: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 2 },
  waveformBar: { width: 3, borderRadius: 1.5, minHeight: 4 },
  recordingDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: "#FF3B30" },
  recordingText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetContent: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#CCC", alignSelf: "center", marginBottom: 8 },
  desktopSheetOverlay: { backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  desktopSheetCard: { width: "90%", maxWidth: 480, borderRadius: 16, padding: 24, gap: 14, ...Platform.select({ web: { boxShadow: "0 8px 40px rgba(0,0,0,0.22)" } as any }) },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  sheetInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },

  reactModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  reactModalContainer: { width: "100%", borderRadius: 20, padding: 20, elevation: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20, maxHeight: "85%" },
  reactModalEmojiRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 12 },
  reactModalEmojiBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  reactModalEmojiText: { fontSize: 24 },
  reactModalDivider: { height: 1, marginVertical: 8 },
  reactModalAction: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  reactModalActionText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  reactionPicker: { flexDirection: "row", justifyContent: "center", paddingVertical: 8, gap: 6 },
  reactionOption: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  reactionOptionEmoji: { fontSize: 24 },

  sheetActionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  sheetActionText: { fontSize: 16, fontFamily: "Inter_500Medium" },

  swipeReplyIcon: { position: "absolute", top: "50%", marginTop: -12, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(128,128,128,0.12)", alignItems: "center", justifyContent: "center" },
  specialMsgTap: { padding: 4 },
  specialMsgEmoji: { fontSize: 56 },
  redEnvBtn: { backgroundColor: "#FF3B30", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  redEnvBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  envRevealOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  envRevealCard: { width: "100%", borderRadius: 20, overflow: "hidden", elevation: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20 },
  envRevealTop: { alignItems: "center", paddingTop: 28, paddingBottom: 20, paddingHorizontal: 24, backgroundColor: "#FF3B30" },
  envRevealBigEmoji: { fontSize: 64, marginBottom: 8 },
  envRevealAmountLabel: { fontSize: 16, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.85)", marginBottom: 4 },
  envRevealAmount: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#FFD700" },
  envRevealCurrency: { fontSize: 18, fontFamily: "Inter_500Medium", color: "#FFD700" },
  envRevealStatus: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 4 },
  envRevealDivider: { height: 1 },
  envRevealBottom: { alignItems: "center", paddingVertical: 16, paddingHorizontal: 24, gap: 4 },
  envRevealFrom: { fontSize: 13, fontFamily: "Inter_400Regular" },
  envRevealMsg: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center", fontStyle: "italic" },
  envRevealStats: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  envRevealBtn: { backgroundColor: "#FF3B30", marginHorizontal: 24, marginBottom: 20, paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  envRevealBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  giftRevealOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  giftRevealContainer: { width: "100%", borderRadius: 20, padding: 24, elevation: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20 },

  giftModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  giftModalContainer: { width: "100%", height: "80%", borderRadius: 20, padding: 20, elevation: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20 },
  giftModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  giftModalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  giftModalMsgRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  giftModalMsgInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  giftModalSectionLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 12 },
  giftScrollContainer: { flex: 1 },
  giftGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 8 },
  giftModalItem: { width: "30%", borderRadius: 14, padding: 12, alignItems: "center", gap: 6, borderWidth: 1 },
  giftModalEmoji: { fontSize: 36 },
  giftModalName: { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  giftModalPriceRow: { flexDirection: "row", alignItems: "center" },
  giftModalPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },
  giftModalCurrency: { fontSize: 11, fontFamily: "Inter_400Regular" },
  giftModalLoadingCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 40 },
  giftModalLoading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 12 },
  giftModalLoadingText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  giftRevealContent: { alignItems: "center", paddingVertical: 20, gap: 12 },
  giftRevealEmoji: { fontSize: 64 },
  giftRevealTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  giftRevealDetail: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center" },
  giftRevealNote: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  giftRevealBtn: { backgroundColor: BRAND_FALLBACK, borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, marginTop: 8 },
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
