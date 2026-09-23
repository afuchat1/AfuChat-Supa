import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image as RNImage,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Dimensions,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  Pressable,
  TouchableOpacity,
  View,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";

// Cap screen width so attachment bubbles don't fill an entire desktop monitor.
const _SW = Math.min(Dimensions.get("window").width, 480);
const ATTACH_W = Math.round(_SW * 0.58);
const ATTACH_H = Math.round(ATTACH_W * 0.82);
const STORY_REPLY_W = Math.round(_SW * 0.50);
const STORY_REPLY_H = Math.round(STORY_REPLY_W * 0.65);

import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CHAT_FAST_DURATION } from "@/lib/chatMotion";
import * as Haptics from "@/lib/haptics";
import { ImageViewer, useImageViewer } from "@/components/ImageViewer";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Image as ExpoImage } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import * as Contacts from "expo-contacts";
import * as FileSystem from "expo-file-system";
// expo-av: lazy-load on native only.
// Do NOT gate on NativeModules.ExponentAV — in Expo SDK 55 + New Architecture
// production builds expo-av uses TurboModules/JSI and is absent from NativeModules,
// so that check always returns null and silently disables all audio.
let Audio: typeof import("expo-av").Audio | null = null;
type AudioRecording = import("expo-av/build/Audio/Recording").Recording;
import { Platform as _Platform } from "react-native";
import { isExpoGo } from "@/lib/expoEnvironment";
if (_Platform.OS !== "web" && !isExpoGo()) {
  try { Audio = require("expo-av").Audio; } catch {}
}
import VideoPreview from "@/components/ui/VideoPreview";
import VideoTrimmerModal from "@/components/chat/VideoTrimmerModal";
import * as Speech from "expo-speech";
import * as Clipboard from "expo-clipboard";
import AudioPlayer from "@/components/AudioPlayer";
import { ChatLoadingSkeleton, ChatBubbleSkeleton } from "@/components/ui/Skeleton";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useChatAppearance } from "@/lib/chatAppearance";
import ChatAppearanceSheet from "@/components/chat/ChatAppearanceSheet";
import { supabase, supabaseUrl as SUPA_URL, supabaseAnonKey as SUPA_KEY } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useGiftPrices } from "@/hooks/useGiftPrices";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { showAlert } from "@/lib/alert";
import { setChatScreenshotProtection } from "@/lib/appLock";
import { generateGroupInviteLink } from "@/lib/groupInvite";
import { showToast as globalShowToast } from "@/lib/toast";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import { useSuperApp } from "@/lib/superapp/SuperAppContext";

import {
  queueMessage,
  isOnline,
  getCachedUserId,
  onConnectivityChange,
} from "@/lib/offlineStore";
import { getLocalMessages, saveMessages, savePendingMessage, getNewestMessageDate, deleteAllLocalMessages, markMessageRead } from "@/lib/storage/localMessages";
import { enqueue } from "@/lib/storage/syncQueue";
import { storage } from "@/lib/storage/mmkv";
import {
  getLocalNotesConversation,
  getLocalNotesMessages,
  clearLocalNotesMessages,
  deleteLocalNotesMessage,
  isLocalNotesId,
  removeLocalNotesConversation,
  saveLocalNotesMessage,
  updateLocalNotesMessage,
} from "@/lib/storage/localNotes";
import { LinkPreview } from "@/components/ui/LinkPreview";
import { getPhonebookName } from "@/lib/storage/localContacts";
import { clearUnread, getLocalConversation } from "@/lib/storage/localConversations";
import { getLocalAttachmentUri, ensureChatAttachmentDownloaded, autoDownloadChatAttachments, openChatFile, saveAttachmentToGallery } from "@/lib/storage/chatAttachmentCache";
import { uploadChatMedia } from "@/lib/mediaUpload";
import { syncPendingMessages } from "@/lib/offlineSync";
import { translateUserContent, detectMessageLanguage } from "@/lib/translate";
import { BUNDLED_UI_LANGUAGES, LANG_LABELS } from "@/lib/i18n";
import { useLanguage } from "@/context/LanguageContext";
import { useChatPreferences, CHAT_THEME_COLORS, BUBBLE_RADIUS } from "@/context/ChatPreferencesContext";
import { useAdvancedFeatures } from "@/context/AdvancedFeaturesContext";
import { useDataMode } from "@/context/DataModeContext";
import { markChatVisited, setActiveChatId, clearActiveChatId } from "@/lib/chatVisited";
import { getProfileCache, setProfileCache } from "@/lib/profileCache";
import { subscribeToChat, broadcastToUserInbox } from "@/lib/globalMessageEvents";
import { askAi, aiSuggestReply, transcribeAudio, getEdgeFnBase, edgeHeaders, aiTransformTone, aiFixText, aiEmojifyText } from "@/lib/aiHelper";
import { buildNavigationContext, ACTION_ROUTES_GUIDE, detectVoiceNavCommand, pickNavConfirmation } from "@/lib/platformKnowledge";
import { AFUAI_BOT_ID } from "@/lib/afuAiBot";
import { notifyChatRecipients } from "@/lib/pushNotifications";
import { clearAIUnread } from "@/lib/aiChatStore";
import { GIPHY_API_KEY } from "@/lib/env";
import { BlurView } from "expo-blur";
import WallpaperOverlay from "@/components/chat/WallpaperOverlay";
import { getDailyUsage, recordDailyUsage } from "@/lib/featureUsage";
import EmojiStickerPicker from "@/components/chat/EmojiStickerPicker";
import GiftPickerSheet, { DbGift } from "@/components/gifts/GiftPickerSheet";
import { formatCompactAmount } from "@/lib/formatCompactAmount";
import AiEditorSheet from "@/components/ui/AiEditorSheet";
import FormatToolbar from "@/components/chat/FormatToolbar";
import MiniProfilePopup from "@/components/chat/MiniProfilePopup";
import { VoiceWaveform } from "@/components/chat/VoiceWaveform";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { audioFocus } from "@/lib/audioFocus";
import { useCall } from "@/context/CallContext";

const ChatFontSizeCtx = React.createContext<number>(14);

async function persistIncomingStatus(
  messageIds: string[],
  chatId: string,
  userId: string,
  readReceipts: boolean,
): Promise<void> {
  if (messageIds.length === 0) return;

  await Promise.all(messageIds.map((messageId) => markMessageRead(messageId)));
  const now = new Date().toISOString();
  const rows = messageIds.map((messageId) => ({
    message_id: messageId,
    user_id: userId,
    delivered_at: now,
    ...(readReceipts ? { read_at: now } : {}),
  }));

  if (!isOnline()) {
    await enqueue("mark_read", { chat_id: chatId, user_id: userId, message_ids: messageIds, read_receipts: readReceipts });
    return;
  }

  const { error } = await supabase
    .from("message_status")
    .upsert(rows, { onConflict: "message_id,user_id" });
  if (error) {
    await enqueue("mark_read", { chat_id: chatId, user_id: userId, message_ids: messageIds, read_receipts: readReceipts });
  }
}

/**
 * System chats must be read when opened, even when every message was already
 * present in the local cache. The normal message loader only sees fresh server
 * rows, which made cached Notifications/AfuAI chats keep their server unread
 * count forever.
 */
async function markSystemChatRead(
  chatId: string,
  userId: string,
  options: { notifications: boolean; afuAi: boolean },
): Promise<void> {
  await clearUnread(chatId);
  if (options.afuAi) {
    // Older installs may still have the synthetic local AfuAI conversation.
    await clearAIUnread();
  }

  const [{ data: incoming }, notificationResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id")
      .eq("chat_id", chatId)
      .neq("sender_id", userId),
    options.notifications
      ? supabase
          .from("notification_events")
          .update({ read_at: new Date().toISOString() })
          .eq("recipient_id", userId)
          .is("read_at", null)
      : Promise.resolve({ error: null }),
  ]);

  if (notificationResult.error) {
    console.warn("[Notifications] failed to mark events read", notificationResult.error.message);
  }

  const messageIds = (incoming ?? []).map((message: { id: string }) => message.id);
  if (messageIds.length > 0) {
    await persistIncomingStatus(messageIds, chatId, userId, true);
  }
}

// ── Lazy-load Reanimated ──────────────────────────────────────────────────────
// On Android Expo Go builds the native worklet runtime throws a Java
// NullPointerException during module init. A static import propagates that
// crash to this module, making ALL exports undefined. The IIFE runs once at
// module-load time; its result never changes, so every component in this file
// always calls the same hook function — satisfying React Rules of Hooks.
const _ra = (() => {
  try {
    // Expo Go may load a different native Reanimated runtime than the
    // bundled Reanimated 4 / Worklets pair. Prefer the safe JS fallbacks
    // there instead of passing an updater object into native styleUpdater.
    const Constants = require("expo-constants").default;
    if (Constants?.appOwnership === "expo" || Constants?.executionEnvironment === "storeClient") {
      return null;
    }
    const m = require("react-native-reanimated"); // eslint-disable-line @typescript-eslint/no-var-requires
    if (m && typeof m.useSharedValue === "function") return m;
  } catch {}
  return null;
})();

function _stubSharedValue<T>(init: T): { value: T } {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ref = React.useRef({ value: init });
  return ref.current;
}

const useSharedValue   = (_ra?.useSharedValue   ?? _stubSharedValue)          as typeof import("react-native-reanimated").useSharedValue;
const useAnimatedStyle = (_ra?.useAnimatedStyle ?? ((_fn: any) => ({})))      as typeof import("react-native-reanimated").useAnimatedStyle;
const withSpring       = (_ra?.withSpring       ?? ((v: any) => v))            as typeof import("react-native-reanimated").withSpring;
const withTiming       = (_ra?.withTiming       ?? ((v: any) => v))            as typeof import("react-native-reanimated").withTiming;
const interpolate      = (_ra?.interpolate      ?? ((v: number) => v))         as typeof import("react-native-reanimated").interpolate;
const Extrapolation    = (_ra?.Extrapolation    ?? { CLAMP: "clamp" as const }) as typeof import("react-native-reanimated").Extrapolation;
const runOnJS          = (_ra?.runOnJS          ?? ((fn: any) => fn))           as typeof import("react-native-reanimated").runOnJS;
// ReAnimated.View falls back to RN's Animated.View (imported above at line 4)
const ReAnimated       = { View: (_ra?.default?.View ?? Animated.View) as any };

// True only when Reanimated native runtime is actually loaded.
// On Android Expo Go (_ra === null) worklet callbacks inside Gesture.Pan()
// crash the moment the gesture fires — the compiled worklet tries to call
// native Reanimated methods on plain React ref stubs.  We gate the
// GestureDetector mic button on this flag and fall back to a plain Pressable.
const _reanimatedEnabled = _ra !== null;

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
  delivered_at?: string | null;
  read_at?: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  edited_at?: string | null;
  _pending?: boolean;
  _isAi?: boolean;
  _aiActions?: AiActionButton[];
  _aiSuggestions?: string[];
  _aiInvoices?: AiInvoiceData[];
  _aiExecAction?: AiExecAction;
  _isLensCard?: boolean;
  _lensData?: {
    title: string;
    description: string;
    category: string;
    confidence: string;
    facts: string[];
    answer?: string;
    history?: Array<{ q: string; a: string }>;
    imagePreview?: string;
    searchQuery?: string;
  };
  _notification?: NotificationMessageData;
};

function isOptimisticMatch(local: Message, server: Message): boolean {
  const isTemporary = local._pending ||
    local.id.startsWith("msg_") ||
    local.id.startsWith("pending-") ||
    local.id.startsWith("pending-audio-") ||
    local.id.startsWith("sticker_");
  if (!isTemporary || local.sender_id !== server.sender_id) return false;
  if (local.encrypted_content !== server.encrypted_content) return false;
  if ((local.attachment_type || null) !== (server.attachment_type || null)) return false;
  const localTime = new Date(local.sent_at).getTime();
  const serverTime = new Date(server.sent_at).getTime();
  return Number.isFinite(localTime) && Number.isFinite(serverTime) &&
    Math.abs(localTime - serverTime) <= 15000;
}

type NotificationMessageData = {
  id: string;
  kind: string;
  cta_label: string | null;
  cta_route: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
};

function getNotificationRoute(event: NotificationMessageData): { pathname: string; params?: Record<string, string> } | null {
  const route = event.cta_route?.trim();
  if (!route || !route.startsWith("/") || route.includes("://") || route.includes("..")) return null;
  if (route === "/premium" || route === "/device-security" || route === "/(tabs)/discover" || route === "/(tabs)/shorts") {
    return { pathname: route };
  }
  if (route === "/stories/view" && event.entity_id) {
    const owner = typeof event.metadata?.story_owner_id === "string" ? event.metadata.story_owner_id : event.entity_id;
    return { pathname: route, params: { userId: owner } };
  }
  if (event.entity_id && ["/chat/[id]", "/contact/[id]", "/post/[id]", "/video/[id]", "/article/[id]"].includes(route)) {
    return { pathname: route, params: { id: event.entity_id } };
  }
  return null;
}

function parseGroupedImageUrls(message: Pick<Message, "attachment_url" | "attachment_type">): string[] {
  if (message.attachment_type !== "image_group" || !message.attachment_url) return [];
  try {
    const parsed = JSON.parse(message.attachment_url);
    return Array.isArray(parsed)
      ? parsed.filter((url): url is string => typeof url === "string" && url.length > 0)
      : [];
  } catch {
    return [];
  }
}

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
  other_handle?: string | null;
  channel_handle?: string | null;
  channel_description?: string | null;
  channel_is_public?: boolean;
  channel_is_member?: boolean;
  channel_owner_id?: string | null;
  channel_subscriber_count?: number | null;
  channel_role?: "owner" | "member";
};

type MessageGateStatus = "unknown" | "limited" | "unlocked";
type MessageGateSnapshot = {
  contextKey: string;
  status: MessageGateStatus;
};

function messageGateStorageKey(userId: string, chatId: string): string {
  return `chat_message_gate_v2_${userId}_${chatId}`;
}

function readCachedMessageGate(userId: string | undefined, chatId: string | null): MessageGateStatus {
  if (!userId || !chatId) return "unknown";
  const cached = storage.getString(messageGateStorageKey(userId, chatId));
  return cached === "limited" || cached === "unlocked" ? cached : "unknown";
}

function NativeAttachmentIcon({
  name,
  color,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
}) {
  return (
    <View
      accessible
      accessibilityRole="image"
      style={{
        width: 42,
        height: 42,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: color,
      }}
    >
      <Ionicons name={name} size={22} color="#FFFFFF" />
    </View>
  );
}

// Enable LayoutAnimation on Android — guarded for New Architecture (SDK 55+).
// RN$Bridgeless is present in bridgeless (New Arch) mode, so this call is
// skipped entirely on SDK 55 where New Arch handles layout transitions natively.
if (Platform.OS === "android" && !("RN$Bridgeless" in global) && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const REACTION_EMOJIS_ADVANCED = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏", "😍", "🤔", "😭", "🥳", "💯", "🎉", "😎"];
const BRAND_FALLBACK = Colors.brand;
const DISAPPEAR_OPTIONS = [
  { label: "Off",      seconds: 0 },
  { label: "5 minutes", seconds: 300 },
  { label: "1 hour",   seconds: 3600 },
  { label: "24 hours", seconds: 86400 },
  { label: "7 days",   seconds: 604800 },
  { label: "4 weeks",  seconds: 2419200 },
];
const MIC_CANCEL_THRESHOLD = -100;
const MIC_LOCK_THRESHOLD = -80;
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

function formatMsgInfoTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}


function BubbleTail({ isMe, color }: { isMe: boolean; color: string }) {
  return (
    <View
      style={[
        st.tailBase,
        isMe ? st.tailMe : st.tailOther,
        { borderTopColor: color, pointerEvents: "none" },
      ]}
    />
  );
}

async function requestAfuAiReply(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens: number,
): Promise<string> {
  const response = await fetch(`${getEdgeFnBase()}/ai/reply`, {
    method: "POST",
    headers: edgeHeaders(),
    body: JSON.stringify({ messages, fast: true, max_tokens: maxTokens }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI request failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  const data = await response.json();
  return String(data?.reply ?? data?.message?.content ?? data?.content ?? "").trim();
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
        paddingHorizontal: 14,
        paddingTop: 4,
        paddingBottom: 4,
        gap: 7,
        pointerEvents: show ? "auto" : "none",
      }}
    >
      {replies.map((r) => (
        <TouchableOpacity
          key={r}
          onPress={() => onSend(r)}
          activeOpacity={0.7}
          style={{
            backgroundColor: colors.inputBg,
            borderColor: colors.border,
            borderWidth: 0.5,
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 12, fontFamily: "Inter_500Medium" }}>{r}</Text>
        </TouchableOpacity>
      ))}
    </Animated.View>
  );
}

function TypingBubble({ colors, compact = false }: { colors: any; compact?: boolean }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(dot, { toValue: -5, duration: 280, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
          ]),
          Animated.delay(420),
        ])
      );
    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 150);
    const a3 = bounce(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const dotColor = colors.bubbleIncomingText === "#FFFFFF"
    ? "rgba(255,255,255,0.9)"
    : colors.accent;

  return (
    <View style={{ paddingHorizontal: compact ? 0 : 16, paddingBottom: compact ? 0 : 4 }}>
      <View style={{
        width: compact ? 48 : 64,
        height: compact ? 28 : 38,
        alignSelf: "flex-start",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <View style={{ flexDirection: "row", gap: compact ? 4 : 5, alignItems: "center" }}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View
              key={i}
              style={{
                width: compact ? 5 : 7,
                height: compact ? 5 : 7,
                borderRadius: 4,
                backgroundColor: dotColor,
                transform: [{ translateY: dot }],
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const translateY     = useRef(new Animated.Value(screenHeight)).current;
  // Tracks keyboard height so the sheet lifts above the keyboard.
  // Uses JS-side animation (useNativeDriver:false) because `bottom` is a
  // layout property and cannot be driven by the native thread.
  const keyboardBottom = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 260 }).start();
    } else {
      Animated.timing(translateY, { toValue: screenHeight, duration: 220, useNativeDriver: true }).start();
      // Reset keyboard offset when sheet closes so it's ready for next open.
      keyboardBottom.setValue(0);
    }
  }, [visible, screenHeight]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardBottom, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === "ios" ? (e.duration ?? 250) : 200,
        useNativeDriver: false,
      }).start();
    });
    const onHide = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardBottom, {
        toValue: 0,
        duration: Platform.OS === "ios" ? (e.duration ?? 200) : 150,
        useNativeDriver: false,
      }).start();
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
      onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.4) {
          Keyboard.dismiss();
          Animated.timing(translateY, { toValue: screenHeight, duration: 200, useNativeDriver: true }).start(() => onClose());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "box-none" }]}>
      <Pressable style={[st.sheetOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]} onPress={() => { Keyboard.dismiss(); onClose(); }} />
      {/*
        Two nested Animated.Views — MUST NOT be merged into one.
        React Native native driver claims the whole node when any animated
        value in the style uses useNativeDriver:true.  If bottom (a layout
        prop) is on the same node it crashes with:
          "Style property 'bottom' is not supported by native animated module"
        Fix: outer = JS-driver (bottom offset), inner = native-driver (transform).
      */}
      <Animated.View
        style={[{ position: "absolute", left: 8, right: 8, bottom: keyboardBottom }, { pointerEvents: "box-none" }]}
      >
        <Animated.View
          style={{
            // All visual styles from st.sheetContent, minus the absolute positioning
            // which is now owned by the outer wrapper above.
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 24,
            gap: 14,
            backgroundColor: colors.surface,
            maxHeight: screenHeight * 0.75,
            transform: [{ translateY }], // native driver — transform prop, safe
          }}
          {...panResponder.panHandlers}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// ── WhatsApp/Telegram-style dropdown row ──────────────────────────────────────
function DdRow({ colors, icon, label, sub, onPress, danger, small, chevron, checked }: {
  colors: any; icon: any; label: string; sub?: string; onPress: () => void;
  danger?: boolean; small?: boolean; chevron?: boolean; checked?: boolean;
}) {
  const fg = danger ? "#FF3B30" : colors.text;
  const iconColor = danger ? "#FF3B3099" : colors.textMuted;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.55}
      style={[st.ddRow, small && { paddingVertical: 9, paddingLeft: 44 }]}>
      <Ionicons name={icon} size={small ? 15 : 18} color={iconColor} style={{ width: 20 }} />
      <View style={{ flex: 1 }}>
        <Text style={[st.ddLabel, { color: fg }, small && { fontSize: 13 }]}>{label}</Text>
        {sub ? <Text style={[st.ddSubText, { color: colors.textMuted }]}>{sub}</Text> : null}
      </View>
      {checked ? <Ionicons name="checkmark" size={14} color={colors.accent} /> : null}
      {chevron ? <Ionicons name="chevron-down" size={13} color={colors.textMuted} /> : null}
    </TouchableOpacity>
  );
}
function DdDivider({ colors }: { colors: any }) {
  return <View style={[st.ddDivider, { backgroundColor: colors.border }]} />;
}

const AI_EXEC_LABELS: Record<string, string> = {
  send_nexa: "Send Nexa", send_acoin: "Send ACoin",
  follow: "Follow User", unfollow: "Unfollow User",
  subscribe: "Subscribe to Plan", cancel_subscription: "Cancel Subscription",
  convert_nexa: "Convert Currency",
};
function buildAiExecDesc(actionType: string, params: Record<string, any>): string {
  switch (actionType) {
    case "send_nexa": return `Send ${params.amount || "?"} Nexa to @${params.handle || "?"}${params.message ? `. Message: "${params.message}"` : ""}`;
    case "send_acoin": return `Send ${params.amount || "?"} ACoin to @${params.handle || "?"}${params.message ? `. Message: "${params.message}"` : ""}`;
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
    .replace(/\*\*([^*\n]*)\*\*/g, "$1")
    .replace(/~~([^~\n]*)~~/g, "$1")
    .replace(/\|\|([^|\n]*)\|\|/g, "$1")
    .replace(/__([^_\n]*)__/g, "$1")
    .replace(/_([^_\n]*)_/g, "$1")
    .replace(/\*{1,3}([^*\n]*)\*{1,3}/g, "$1")
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
    .replace(/\*\*([^*\n]*)\*\*/g, "$1")
    .replace(/~~([^~\n]*)~~/g, "$1")
    .replace(/\|\|([^|\n]*)\|\|/g, "$1")
    .replace(/__([^_\n]*)__/g, "$1")
    .replace(/_([^_\n]*)_/g, "$1")
    .replace(/\*{1,3}([^*\n]*)\*{1,3}/g, "$1")
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
    else if (m[5]) parts.push(<Text key={k++} style={{ color: Colors.brand, fontFamily: "monospace", fontSize: 13 }}>{` ${m[5]} `}</Text>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Text key={k++} style={{ color }}>{stripMd(text.slice(last))}</Text>);
  return <>{parts}</>;
}
function AiRichContent({ content, colors: c, isUser }: { content: string; colors: any; isUser?: boolean }) {
  const textColor = isUser ? "#fff" : c.text;
  if (isUser) return <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, color: "#fff" }}>{stripMd(content)}</Text>;
  const segs = parseAiRichText(content);
  const prevType = (i: number) => (i > 0 ? segs[i - 1].type : "");
  return (
    <View style={{ gap: 0 }}>
      {segs.map((seg, i) => {
        const prev = prevType(i);
        if (seg.type === "heading") {
          return (
            <Text key={i} style={{ color: textColor, fontFamily: "Inter_700Bold", fontSize: seg.level === 1 ? 15 : 14, marginTop: i === 0 ? 0 : 10, marginBottom: 2 }}>
              <AiInlineText text={seg.text} color={textColor} />
            </Text>
          );
        }
        if (seg.type === "codeblock") {
          return (
            <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: c.inputBg || "#1e1e1e", borderRadius: 8, padding: 8, marginTop: 6, marginBottom: 2 }}>
              <Text style={{ fontFamily: "monospace", fontSize: 12, color: Colors.brand }}>{seg.text}</Text>
            </ScrollView>
          );
        }
        if (seg.type === "bullet") {
          return (
            <View key={i} style={{ flexDirection: "row", gap: 7, paddingLeft: (seg.indent || 0) * 12, marginTop: prev === "text" || prev === "heading" ? 6 : 3 }}>
              <Text style={{ color: Colors.brand, fontSize: 11, lineHeight: 20, marginTop: 1 }}>●</Text>
              <Text style={{ color: textColor, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, flex: 1 }}>
                <AiInlineText text={seg.text} color={textColor} />
              </Text>
            </View>
          );
        }
        if (seg.type === "numbered") {
          return (
            <View key={i} style={{ flexDirection: "row", gap: 7, marginTop: prev === "text" || prev === "heading" ? 6 : 4 }}>
              <Text style={{ color: Colors.brand, fontSize: 12, fontFamily: "Inter_600SemiBold", lineHeight: 20, minWidth: 18 }}>{seg.num}.</Text>
              <Text style={{ color: textColor, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, flex: 1 }}>
                <AiInlineText text={seg.text} color={textColor} />
              </Text>
            </View>
          );
        }
        if (seg.type === "divider") return <View key={i} style={{ height: 1, backgroundColor: c.border, marginVertical: 6 }} />;
        if (seg.text === "\n") return <View key={i} style={{ height: 6 }} />;
        return (
          <Text key={i} style={{ color: textColor, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: (prev === "bullet" || prev === "numbered") ? 4 : 0 }}>
            <AiInlineText text={seg.text} color={textColor} />
          </Text>
        );
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
        <Ionicons name="receipt" size={14} color={Colors.brand} />
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.brand, textTransform: "uppercase", letterSpacing: 0.5 }}>Invoice</Text>
      </View>
      {rows.map((r, i) => <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}><Text style={{ fontSize: 13, color: c.textMuted, fontFamily: "Inter_400Regular" }}>{r.label}</Text><Text style={{ fontSize: 13, color: r.highlight ? "#1018D8" : c.text, fontFamily: "Inter_600SemiBold" }}>{r.value}</Text></View>)}
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
  const colorMap: Record<string, string> = { send_nexa: "#FF9500", send_acoin: "#34C759", follow: Colors.brand, unfollow: "#FF3B30", subscribe: "#D4A853", cancel_subscription: "#FF3B30", convert_nexa: Colors.brand };
  const iconMap: Record<string, string> = { send_nexa: "flash", send_acoin: "cash", follow: "person-add", unfollow: "person-remove", subscribe: "diamond", cancel_subscription: "close-circle", convert_nexa: "swap-horizontal" };
  const accent = colorMap[ea.actionType] || Colors.brand;
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

/** Perceived brightness of a 6-digit hex color (0 = black, 1 = white). */
function hexLuminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0.4;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function LensContextCard({ msg, onSuggestionTap }: {
  msg: Message;
  onSuggestionTap?: (text: string) => void;
}) {
  const { colors } = useTheme();
  const BRAND_C = colors.accent;
  const ctx = msg._lensData;
  if (!ctx) return null;

  const catIconMap: Record<string, string> = {
    food: "restaurant", plant: "leaf", animal: "paw",
    place: "location", product: "bag-handle", person: "person",
    artwork: "image", text: "document-text", object: "cube",
  };
  const catIcon = (catIconMap[ctx.category] ?? "help-circle") as any;
  const confColor = ctx.confidence === "high" ? "#34C759"
    : ctx.confidence === "medium" ? "#FF9F0A" : "#FF453A";

  const suggestions = [
    `Tell me more about ${ctx.title}`,
    ctx.history?.length ? `What else should I know about this?` : `How is this used?`,
    `What are interesting facts about ${ctx.title}?`,
  ];

  return (
    <View style={{ paddingHorizontal: 10, marginBottom: 4, marginTop: 6 }}>
      <View style={{
        backgroundColor: colors.surface, borderRadius: 20, overflow: "hidden",
        borderWidth: 1, borderColor: BRAND_C + "30",
        ...Platform.select({ web: { boxShadow: `0 3px 10px ${BRAND_C}1A` } as any, default: { shadowColor: BRAND_C, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 } }),
      }}>
        {/* Header */}
        <View style={{
          flexDirection: "row", alignItems: "center", gap: 8,
          paddingHorizontal: 14, paddingVertical: 11,
          backgroundColor: BRAND_C + "12",
          borderBottomWidth: 1, borderBottomColor: BRAND_C + "25",
        }}>
          <View style={{ backgroundColor: BRAND_C + "25", padding: 6, borderRadius: 10 }}>
            <Ionicons name="scan" size={15} color={BRAND_C} />
          </View>
          <Text style={{ flex: 1, fontSize: 12, fontWeight: "700", color: BRAND_C, letterSpacing: 0.9, textTransform: "uppercase" }}>
            AI Lens Scan
          </Text>
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 4,
            backgroundColor: confColor + "20", borderRadius: 10,
            paddingHorizontal: 8, paddingVertical: 3,
          }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: confColor }} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: confColor, textTransform: "capitalize" }}>{ctx.confidence}</Text>
          </View>
        </View>

        {/* Image preview */}
        {!!ctx.imagePreview && (
          <Image source={{ uri: ctx.imagePreview }} style={{ width: "100%", height: 180 }} resizeMode="cover" />
        )}

        {/* Title + Category */}
        <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Ionicons name={catIcon} size={13} color={BRAND_C} />
            <Text style={{ fontSize: 12, color: BRAND_C, fontWeight: "600", textTransform: "capitalize" }}>{ctx.category}</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 7 }}>{ctx.title}</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 21 }}>{ctx.description}</Text>
        </View>

        {/* Lens Analysis (initial answer) */}
        {!!ctx.answer && (
          <View style={{
            marginHorizontal: 14, marginBottom: 10,
            backgroundColor: BRAND_C + "10", borderRadius: 12,
            padding: 12, borderWidth: 1, borderColor: BRAND_C + "22",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <Ionicons name="chatbubble-ellipses" size={12} color={BRAND_C} />
              <Text style={{ fontSize: 11, color: BRAND_C, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>
                Lens Analysis
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 21 }}>{ctx.answer}</Text>
          </View>
        )}

        {/* Q&A history from Lab */}
        {ctx.history && ctx.history.length > 0 && (
          <View style={{ marginHorizontal: 14, marginBottom: 10 }}>
            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>
              Questions from Lab
            </Text>
            {ctx.history.map((item, i) => (
              <View key={i} style={{
                marginBottom: 8,
                backgroundColor: (colors as any).inputBg ?? colors.surface + "BB",
                borderRadius: 12, padding: 10,
                borderLeftWidth: 3, borderLeftColor: BRAND_C + "60",
              }}>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 4, alignItems: "flex-start" }}>
                  <Ionicons name="help-circle" size={13} color={BRAND_C} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.text }}>{item.q}</Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18, paddingLeft: 19 }}>{item.a}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Key Facts */}
        {ctx.facts && ctx.facts.length > 0 && (
          <View style={{ marginHorizontal: 14, marginBottom: 14 }}>
            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>
              Key Facts
            </Text>
            {ctx.facts.map((fact, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: BRAND_C, marginTop: 7 }} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>{fact}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Timestamp */}
        <View style={{ paddingHorizontal: 14, paddingBottom: 12, flexDirection: "row", justifyContent: "flex-end" }}>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>{formatMsgTime(msg.sent_at)}</Text>
        </View>
      </View>

      {/* Suggestion chips */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {suggestions.map((s, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => onSuggestionTap?.(s)}
            activeOpacity={0.7}
            style={{
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
              borderWidth: 1, borderColor: BRAND_C + "50",
              backgroundColor: BRAND_C + "08",
            }}
          >
            <Text style={{ fontSize: 13, color: BRAND_C }}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function AutoSelectMessageText({ value, style }: { value: string; style?: any }) {
  const inputRef = useRef<TextInput>(null);
  const selection = { start: 0, end: value.length };

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      setTimeout(() => {
        inputRef.current?.setNativeProps({
          selection: { start: 0, end: value.length },
        });
      }, 16);
    }, Platform.OS === "web" ? 0 : 80);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <TextInput
      ref={inputRef}
      value={value}
      // Native selection does not activate reliably on Android when editable
      // is false. Keep the field controlled and discard edits while allowing
      // the OS to focus and select the complete range.
      editable
      autoFocus
      onChangeText={() => {}}
      onFocus={() => {
        inputRef.current?.setNativeProps({
          selection: { start: 0, end: value.length },
        });
      }}
      multiline
      scrollEnabled={false}
      selectTextOnFocus
      selection={selection}
      showSoftInputOnFocus={false}
      contextMenuHidden={false}
      style={[style, { paddingHorizontal: 0, paddingVertical: 0 }]}
    />
  );
}

function MediaUploadIndicator({ kind, isMe }: { kind: "image" | "video"; isMe: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState(0);
  const phases = ["Preparing", "Uploading", "Securing"];

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    loop.start();
    const timer = setInterval(() => setPhase((current) => (current + 1) % phases.length), 1400);
    return () => {
      loop.stop();
      clearInterval(timer);
    };
  }, [spin]);

  const rotation = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View
      style={{
        position: "absolute",
        left: 8,
        bottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        pointerEvents: "none",
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: isMe ? "rgba(0,0,0,0.46)" : "rgba(0,0,0,0.58)",
      }}
    >
      <Animated.View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: "rgba(255,255,255,0.28)",
          borderTopColor: "#fff",
          transform: [{ rotate: rotation }],
        }}
      />
      <Ionicons name={kind === "video" ? "videocam" : "image"} size={12} color="#fff" />
      <Text style={{ color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
        {phases[phase]}
      </Text>
    </View>
  );
}

function MessageBubble({ msg, isMe, isChannel, showTail, showName, onLongPress, onReply, replyPreview, onTapReply, isHighlighted, onTapEnvelope, onTapGift, onImageTap, onConfirmExec, onCancelExec, onSuggestionTap, onSenderPress, onReactionPress, onStatusPress, onNotificationAction, brandColor, flatSurface, hideTimestamp, isTextSelectionEnabled }: {
  msg: Message;
  isMe: boolean;
  isChannel?: boolean;
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
  onConfirmExec?: (msgId: string) => void;
  onCancelExec?: (msgId: string) => void;
  onSuggestionTap?: (text: string) => void;
  onSenderPress?: (senderId: string) => void;
  onReactionPress?: (msg: Message, emoji: string) => void;
  onStatusPress?: (msg: Message) => void;
  onNotificationAction?: (notification: NotificationMessageData) => void;
  brandColor?: string;
  /** When true, renders a flat borderless surface — no bubble bg, no tail, no radius */
  flatSurface?: boolean;
  /** When true, hides per-message timestamps (used in AfuAI chat) */
  hideTimestamp?: boolean;
  /** Automatically selects the full message text after the user chooses Select. */
  isTextSelectionEnabled?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const { openApp } = useSuperApp();
  const BRAND = brandColor ?? colors.accent;
  const { voiceToText, textToSpeech } = useLanguage();
  const { themeColors: chatTheme, bubbleRadius: chatRadius, prefs: chatPrefsLocal } = useChatPreferences();
  const _perChatFont = React.useContext(ChatFontSizeCtx);
  const { features: msgBubbleFeatures } = useAdvancedFeatures();
  const messageLongPress = isTextSelectionEnabled ? undefined : () => onLongPress(msg);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Local attachment URI (from device cache) ──────────────────────────────
  // Initialise synchronously from the in-memory cache; then resolve in the
  // background so the local file is used on re-renders without any re-download.
  const [attachUri, setAttachUri] = useState<string>(() => {
    if (!msg.attachment_url || msg.attachment_type === "image_group") return "";
    return getLocalAttachmentUri(msg.attachment_url) ?? msg.attachment_url;
  });
  const [fileDownloading, setFileDownloading] = useState(false);

  useEffect(() => {
    const url  = msg.attachment_url;
    const type = msg.attachment_type;
    if (!chatPrefsLocal.auto_download) return;
    // Skip video (stream from URL) and file (user must choose to download)
    if (!url || !type || type === "image_group" || type === "video" || type === "file") return;
    // Already resolved to a local path — nothing to do
    if (attachUri && !attachUri.startsWith("http")) return;
    ensureChatAttachmentDownloaded(url, type)
      .then((local) => { if (local && local !== attachUri) setAttachUri(local); })
      .catch(() => {});
  }, [msg.id, chatPrefsLocal.auto_download]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFileTap() {
    if (!msg.attachment_url) return;
    const url = msg.attachment_url;
    async function _openOrInstall(localPath: string) {
      openChatFile(localPath);
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
    msg.attachment_type === "payment" ||
    msg.encrypted_content?.startsWith("🧧") ||
    msg.encrypted_content?.startsWith("🎁") ||
    ["📷 Photo", "🎥 Video", "GIF"].includes(msg.encrypted_content ?? "");

  const canTranscribe = !!msg.attachment_url && msg.attachment_type === "audio" && voiceToText;
  const canSpeak = textToSpeech && !!msg.encrypted_content && !isSpecial && msg.attachment_type !== "audio";

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
      setTranscript("Transcription failed. Please try again.");
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
    const text = msg.encrypted_content || "";
    setIsSpeaking(true);
    Speech.speak(text, {
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  }

  const speakButton = canSpeak ? (
    <TouchableOpacity
      onPress={handleSpeak}
      style={[
        st.translateChip,
        {
          marginTop: 0,
          backgroundColor: isMe ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)",
        },
      ]}
      hitSlop={8}
    >
      <Ionicons
        name={isSpeaking ? "stop-circle" : "volume-medium"}
        size={11}
        color={isSpeaking ? BRAND : colors.textMuted}
        style={{ marginRight: 3 }}
      />
      <Text style={[st.translateChipText, { color: isSpeaking ? BRAND : colors.textMuted }]}>
        {isSpeaking ? "Stop" : "Speak"}
      </Text>
    </TouchableOpacity>
  ) : null;

  const displayText = msg.encrypted_content ?? "";

  const isRedEnvelope = msg.encrypted_content?.startsWith("🧧") ?? false;
  const isGiftMsg = msg.encrypted_content?.startsWith("🎁") ?? false;
  const meBubbleColor = BRAND;
  const otherBubbleColor = colors.bubbleIncoming;
  const isSticker = msg.attachment_type === "sticker";
  const bubbleColor = flatSurface ? "transparent" : (isSticker ? "transparent" : (isMe ? meBubbleColor : otherBubbleColor));
  const textColor = flatSurface ? colors.text : (isMe ? "#FFFFFF" : colors.bubbleIncomingText);

  // Adaptive receipt colours — computed from the actual bubble background so they
  // are always legible regardless of the user's chosen accent colour.
  const bubbleLum = hexLuminance(meBubbleColor);
  const darkBubble = bubbleLum < 0.55;        // teal / deep colours → use whites
  // Use solid, high-contrast colours so receipts are clearly visible on ANY bubble colour
  const myTimeColor   = darkBubble ? "rgba(255,255,255,0.80)" : "rgba(0,0,0,0.55)";
  const rcptSent      = darkBubble ? "rgba(255,255,255,0.80)" : "rgba(0,0,0,0.50)";
  const rcptDelivered = darkBubble ? "#FFFFFF"                : "rgba(0,0,0,0.72)";
  // rcptRead: high-visibility blue — stays readable on dark AND light bubble colours
  const rcptRead      = darkBubble ? "#7DD3FC" : "#0284C7";
  const isPending = msg._pending || msg.status === "sending";
  if (isRedEnvelope) {
    return (
      <View style={[st.msgRow, isMe ? st.msgRowMe : st.msgRowOther]}>
        <TouchableOpacity onPress={() => onTapEnvelope?.(msg)} onLongPress={messageLongPress} delayLongPress={300} activeOpacity={0.7} style={st.specialMsgTap}>
          <Text style={st.specialMsgEmoji}>🧧</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isGiftMsg) {
    const giftParts = (msg.encrypted_content ?? "").replace("🎁 ", "").split("|");
    const giftDisplay = giftParts[0];
    const giftEmoji = giftDisplay.split(" ")[0] || "🎁";

    return (
      <View style={[st.msgRow, isMe ? st.msgRowMe : st.msgRowOther]}>
        <TouchableOpacity onPress={() => onTapGift?.(msg)} onLongPress={messageLongPress} delayLongPress={300} activeOpacity={0.7} style={st.specialMsgTap}>
          <Text style={st.specialMsgEmoji}>{giftEmoji}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const groupedImageUrls = parseGroupedImageUrls(msg);
  const hasImage = msg.attachment_url && (msg.attachment_type === "image" || msg.attachment_type === "gif" || groupedImageUrls.length > 0);
  const hasVideo = msg.attachment_url && msg.attachment_type === "video";
  const hasAudio = msg.attachment_url && msg.attachment_type === "audio";
  const hasFile = msg.attachment_url && msg.attachment_type === "file";
  const hasStoryReply = msg.attachment_url && msg.attachment_type === "story_reply";
  const hasTextContent = msg.encrypted_content && !["📷 Photo", "🎥 Video", "GIF"].includes(msg.encrypted_content);

  // Plain text messages get an inline (WhatsApp-style) timestamp.
  // All other types (image, audio, file, sticker, AI) keep the metaRow below.
  const isPlainText = !hasImage && !hasVideo && !hasAudio && !hasFile && !hasStoryReply && !isSticker;
  // Use inline timestamp only for bare text — exclude AI and flat-surface messages.
  // Speak is rendered in the metadata row, so it can share this line without
  // becoming part of the message text.
  const useInlineTimestamp = isPlainText && !msg._isAi && !flatSurface;

  const replyIconOpacity = swipeX.interpolate({
    inputRange: isMe ? [-SWIPE_THRESHOLD, -10, 0] : [0, 10, SWIPE_THRESHOLD],
    outputRange: isMe ? [1, 0.3, 0] : [0, 0.3, 1],
    extrapolate: "clamp",
  });

  return (
    <View>
    <View {...swipePan.panHandlers} style={[st.msgRow, isMe ? st.msgRowMe : st.msgRowOther]}>
      {!isMe && !flatSurface && (
        <Animated.View style={[st.swipeReplyIcon, { opacity: replyIconOpacity, left: 4 }]}>
          <Ionicons name="arrow-undo" size={18} color={BRAND} />
        </Animated.View>
      )}
      <Animated.View style={[{ flex: 1, flexDirection: "row", justifyContent: isMe ? "flex-end" : "flex-start", minWidth: 0 }, { transform: [{ translateX: swipeX }] }]}>
      <View style={[
        st.bubbleContainer,
        isMe ? st.bubbleContainerMe : st.bubbleContainerOther,
        flatSurface && { maxWidth: "100%" },
      ]}>
        {showTail && !flatSurface && <BubbleTail isMe={isMe} color={bubbleColor} />}

        <Pressable
          onLongPress={messageLongPress}
          delayLongPress={300}
          style={[
            st.bubble,
            flatSurface
              ? { backgroundColor: "transparent", borderRadius: 0, paddingHorizontal: 4, paddingTop: 2, paddingBottom: 0 }
              : hasAudio
              ? { backgroundColor: bubbleColor, borderRadius: chatRadius ?? 18, paddingHorizontal: 10, paddingTop: 7, paddingBottom: 7 }
              : { backgroundColor: bubbleColor, borderRadius: chatRadius ?? 18 },
            isMe ? st.bubbleMe : st.bubbleOther,
            !flatSurface && showTail ? (isMe ? st.bubbleTailMe : st.bubbleTailOther) : null,
            replyPreview ? st.bubbleWithReply : null,
            isPending && { opacity: 0.6 },
            !flatSurface && chatPrefsLocal.compact_mode && { paddingVertical: 5 },
          ]}>
          {!isMe && showName && (
            onSenderPress ? (
              <TouchableOpacity
                onPress={() => onSenderPress(msg.sender_id)}
                activeOpacity={0.65}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <UserName
                  userId={msg.sender_id}
                  name={msg.sender?.display_name ?? ""}
                  style={[st.senderName, { color: BRAND }]}
                />
              </TouchableOpacity>
            ) : (
              <UserName
                userId={msg.sender_id}
                name={msg.sender?.display_name ?? ""}
                style={[st.senderName, { color: BRAND }]}
              />
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
                onPress={() => onImageTap?.(
                  groupedImageUrls.length > 0 ? groupedImageUrls : [attachUri || msg.attachment_url!],
                  0,
                )}
                onLongPress={messageLongPress}
                delayLongPress={300}
                activeOpacity={0.9}
                  style={{ position: "relative" }}
              >
                {groupedImageUrls.length > 0 ? (
                  <View style={st.imageGroupGrid}>
                    {groupedImageUrls.map((url, index) => (
                      <ExpoImage
                        key={`${url}-${index}`}
                        source={{ uri: url }}
                        style={groupedImageUrls.length === 1 ? st.attachImage : st.imageGroupTile}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={0}
                      />
                    ))}
                  </View>
                ) : (
                  <ExpoImage
                    source={{ uri: attachUri || msg.attachment_url! }}
                    style={st.attachImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={0}
                    autoplay={msg.attachment_type !== "gif" || chatPrefsLocal.autoplay_gifs}
                  />
                )}
                  {isPending && msg.attachment_type !== "gif" && (
                    <MediaUploadIndicator kind="image" isMe={isMe} />
                  )}
              </TouchableOpacity>
              {hasTextContent && (
                isTextSelectionEnabled ? (
                  <AutoSelectMessageText
                    value={displayText}
                    style={[st.bubbleText, { color: textColor, marginTop: 3, fontSize: _perChatFont, lineHeight: _perChatFont + 5 }]}
                  />
                ) : (
                  <RichText style={[st.bubbleText, { color: textColor, marginTop: 3, fontSize: _perChatFont, lineHeight: _perChatFont + 5 }]} linkColor={isMe ? "#FFFFFF" : BRAND} showMentionAvatars={!isChannel}>{displayText}</RichText>
                )
              )}
            </>
          ) : hasVideo ? (
            <TouchableOpacity onLongPress={messageLongPress} delayLongPress={300} activeOpacity={0.9} style={{ position: "relative" }}>
              <View style={st.attachVideo}>
                <VideoPreview
                  uri={msg.attachment_url!}
                  style={{ width: "100%", height: "100%", borderRadius: 8 }}
                  contentFit="cover"
                  nativeControls
                  isLooping={false}
                  shouldPlay={false}
                />
              </View>
              {isPending && <MediaUploadIndicator kind="video" isMe={isMe} />}
            </TouchableOpacity>
          ) : hasAudio ? (
            <TouchableOpacity onLongPress={messageLongPress} delayLongPress={300} activeOpacity={1}>
              <AudioPlayer
                uri={attachUri || msg.attachment_url!}
                tintColor={textColor}
                waveColor={isMe ? "#FFFFFF" : BRAND}
                backgroundColor={bubbleColor}
              />
              {canTranscribe && (
                <TouchableOpacity
                  onPress={handleTranscribe}
                  style={[st.translateChip, { backgroundColor: isMe ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)", marginTop: 3 }]}
                  hitSlop={8}
                >
                  {transcribing ? (
                    <ActivityIndicator size={10} color={colors.textMuted} style={{ marginRight: 3 }} />
                  ) : (
                    <Ionicons name="mic" size={11} color={showTranscript ? BRAND : colors.textMuted} style={{ marginRight: 3 }} />
                  )}
                  <Text style={[st.translateChipText, { color: showTranscript ? BRAND : colors.textMuted }]}>
                    {transcribing ? "Transcribing…" : showTranscript ? "Hide transcript" : "Transcribe"}
                  </Text>
                </TouchableOpacity>
              )}
              {showTranscript && transcript && (
                <Text style={[st.bubbleText, { color: textColor, marginTop: 3, fontStyle: "italic", fontSize: _perChatFont, lineHeight: _perChatFont + 5 }]}>{transcript}</Text>
              )}
            </TouchableOpacity>
          ) : hasFile ? (
            <TouchableOpacity
              onPress={handleFileTap}
              onLongPress={messageLongPress}
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
                          ? "document-text"
                          : "download"
                      }
                      size={22}
                      color={textColor}
                    />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.fileName, { color: textColor }]} numberOfLines={2}>{displayText}</Text>
                <Text style={[st.fileMeta, { color: isMe ? "rgba(255,255,255,0.6)" : colors.textMuted }]}>
                  {fileDownloading
                    ? "Downloading…"
                    : attachUri && !attachUri.startsWith("http")
                      ? "Tap to open"
                      : "Tap to download"}
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
                  onLongPress={messageLongPress}
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
                    <Text style={[st.bubbleText, { color: textColor, marginTop: 3, fontSize: _perChatFont, lineHeight: _perChatFont + 5 }]}>
                      {storyDisplayText}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })()
          ) : msg.attachment_type === "payment" ? (
            (() => {
              let pay: { currency?: string; amount?: number; note?: string; sender_handle?: string; recipient_handle?: string; recipient_name?: string } = {};
              try { pay = JSON.parse(msg.encrypted_content ?? "{}"); } catch {}
              const isSender = isMe;
              const accentColor = pay.currency === "nexa" ? "#FF9500" : "#10B981";
              const coinLabel = pay.currency === "nexa" ? "Nexa" : "ACoin";
              return (
            <TouchableOpacity onLongPress={messageLongPress} delayLongPress={300} activeOpacity={0.85}>
                  <View style={{ minWidth: 200, gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: accentColor + "25", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name={pay.currency === "nexa" ? "flash" : "cash"} size={20} color={accentColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: isMe ? "rgba(255,255,255,0.7)" : colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
                          {isSender ? "You sent" : "Payment received"}
                        </Text>
                        <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: isMe ? "#fff" : accentColor, lineHeight: 26 }}>
                          {(pay.amount ?? 0).toLocaleString()} {coinLabel}
                        </Text>
                      </View>
                    </View>
                    {pay.note ? (
                      <View style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: isMe ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.05)" }}>
                        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: isMe ? "rgba(255,255,255,0.9)" : colors.text }} numberOfLines={3}>{pay.note}</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Ionicons name="checkmark-circle" size={13} color={isMe ? "rgba(255,255,255,0.55)" : "#10B981"} />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: isMe ? "rgba(255,255,255,0.55)" : colors.textMuted }}>
                        {isSender ? `To @${pay.recipient_handle}` : `From @${pay.sender_handle}`}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })()
          ) : msg.attachment_type === "sticker" ? (
            <TouchableOpacity onLongPress={messageLongPress} delayLongPress={300} activeOpacity={0.8}>
              <Text style={{ fontSize: 64, lineHeight: 74 }}>{msg.encrypted_content ?? ""}</Text>
            </TouchableOpacity>
          ) : (
            <>
              {useInlineTimestamp ? (
                /* WhatsApp-style inline timestamp:
                   Ghost text (same color as bubble background) is appended inline at
                   the END of the message text so the last line wraps around it, leaving
                   room for the real absolute-positioned timestamp at bottom-right.
                   Using bubbleColor (not opacity/transparent) is the only reliably
                   invisible technique on Android — nested Text opacity leaks through. */
                (()=>{
                  const _fontSize  = _perChatFont;
                  const _lineH     = _fontSize + 5;
                  const _timeStr   = formatMsgTime(msg.sent_at);
                   // Keep short messages genuinely compact. Reserve room for the
                   // real metadata row, including Speak when it is available.
                   const _speakWidth = canSpeak ? 56 : 0;
                   const _tsWidth = (msg.edited_at ? 34 : 0) + (isMe ? 56 : 40) + _speakWidth;
                  const _compactInlineMeta =
                    !canSpeak &&
                    !msg.edited_at &&
                    !displayText.includes("\n") &&
                    displayText.trim().length <= 18;
                  // Ghost: same color as bubble background → visually invisible on all platforms.
                  // Content mirrors the real timestamp exactly plus a leading gap ("   ")
                  // so the last line of text never crowds or overlaps the timestamp.
                   const _iconPad = isMe ? "   " : " "; // space for checkmark icon + margins
                   const _speakPad = canSpeak ? " ".repeat(18) : "";
                  const ghost = _compactInlineMeta || Platform.OS === "web" ? null : (
                    <Text style={{ color: bubbleColor, fontSize: 11, fontFamily: "Inter_400Regular", includeFontPadding: false }}>
                       {"   "}{_speakPad}{msg.edited_at ? "edited  " : ""}{_timeStr}{_iconPad}
                    </Text>
                  );
                  const renderMeta = (metaStyle: any) => (
                    <View style={[st.metaRow, metaStyle]}>
                      {speakButton}
                      {msg.edited_at && (
                        <Text style={[st.msgTime, { color: isMe ? myTimeColor : colors.textMuted, marginRight: 3 }]}>edited</Text>
                      )}
                      <Text style={[st.msgTime, { color: isMe ? myTimeColor : colors.textMuted }]}>
                        {_timeStr}
                      </Text>
                      {isMe && (
                        <TouchableOpacity onPress={() => onStatusPress?.(msg)} hitSlop={8} activeOpacity={0.65} disabled={!onStatusPress}>
                          <Ionicons
                            name={
                              msg.status === "failed" ? "alert-circle" :
                              isPending ? "time" :
                              msg.status === "read" ? "checkmark-done" :
                              msg.status === "delivered" ? "checkmark-done" : "checkmark"
                            }
                            size={14}
                            color={
                              msg.status === "failed" ? "#FF4444" :
                              isPending ? rcptSent :
                              msg.status === "read" ? rcptRead :
                              msg.status === "delivered" ? rcptDelivered :
                              rcptSent
                            }
                            style={{ marginLeft: 2 }}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                  return (
                    <>
                      <TouchableOpacity
                        onLongPress={messageLongPress}
                        delayLongPress={500}
                        activeOpacity={0.9}
                        style={[
                          _compactInlineMeta
                            ? { flexDirection: "row", alignItems: "flex-end" }
                            : { minWidth: _tsWidth + 16 },
                        ]}
                      >
                         {isTextSelectionEnabled ? (
                           <AutoSelectMessageText
                             value={displayText}
                             style={[
                               st.bubbleText,
                               {
                                 color: textColor,
                                 fontSize: _fontSize,
                                 lineHeight: _lineH,
                                 flexShrink: _compactInlineMeta ? 1 : undefined,
                                 paddingRight: _compactInlineMeta ? 0 : _tsWidth,
                               },
                             ]}
                           />
                         ) : (
                           <RichText
                             style={[
                               st.bubbleText,
                               { color: textColor, fontSize: _fontSize, lineHeight: _lineH },
                               _compactInlineMeta
                                 ? { flexShrink: 1 }
                                 : Platform.OS === "web"
                                 ? { paddingRight: _tsWidth }
                                 : null,
                             ]}
                             linkColor={isMe ? "#FFFFFF" : BRAND}
                              showMentionAvatars={!isChannel}
                             tail={ghost}
                           >
                             {displayText}
                           </RichText>
                         )}
                          {_compactInlineMeta && renderMeta({ position: "relative", marginLeft: 5, flexShrink: 0 })}
                      </TouchableOpacity>
                       {!_compactInlineMeta && renderMeta({ position: "absolute", bottom: 3, right: 8 })}
                    </>
                  );
                })()
              ) : (
                <TouchableOpacity onLongPress={messageLongPress} delayLongPress={500} activeOpacity={0.9}>
                         {msg._isAi
                    ? (
                      isTextSelectionEnabled ? (
                        <AutoSelectMessageText
                          value={displayText}
                          style={[st.bubbleText, { color: textColor, fontSize: _perChatFont, lineHeight: _perChatFont + 5 }]}
                        />
                      ) : (
                        <AiRichContent content={displayText} colors={colors} isUser={isMe} />
                      )
                    )
                    : (
                      isTextSelectionEnabled ? (
                        <AutoSelectMessageText
                          value={displayText}
                          style={[st.bubbleText, {
                            color: textColor,
                            fontSize: _perChatFont,
                            lineHeight: _perChatFont + 5,
                          }]}
                        />
                      ) : (
                        <RichText
                          style={[st.bubbleText, {
                            color: textColor,
                            fontSize: _perChatFont,
                            lineHeight: _perChatFont + 5,
                          }]}
                          linkColor={isMe ? "#FFFFFF" : BRAND}
                          showMentionAvatars={!isChannel}
                        >
                          {displayText}
                        </RichText>
                      )
                    )
                  }
                </TouchableOpacity>
              )}

              {!msg._isAi && !isSpecial && chatPrefsLocal?.link_previews !== false && msgBubbleFeatures.interactive_link_preview && (
                <LinkPreview text={displayText} isMe={isMe} />
              )}
            </>
          )}

          {msg._notification?.cta_label && getNotificationRoute(msg._notification) && (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => onNotificationAction?.(msg._notification!)}
              style={[st.notificationCta, { borderTopColor: isMe ? "rgba(255,255,255,0.22)" : colors.border }]}
            >
              <Text style={[st.notificationCtaText, { color: isMe ? "#FFFFFF" : BRAND }]}>{msg._notification.cta_label}</Text>
              <Ionicons name="arrow-forward" size={14} color={isMe ? "#FFFFFF" : BRAND} />
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

          {/* metaRow: only rendered for non-plain-text messages (images, audio, AI, etc.).
              Plain text messages render their timestamp inline in the text flow above.
              hideTimestamp suppresses the time text but keeps the read-receipt icon
              so the user still gets delivery confirmation in regular chats. */}
           {!useInlineTimestamp && (
             <View
               style={[
                 st.metaRow,
                 hasAudio
                   ? { marginTop: 0, opacity: 0.7 }
                   : { marginTop: 3 },
               ]}
             >
               {speakButton}
              {!hideTimestamp && msg.edited_at && (
                <Text style={[st.msgTime, { color: isMe ? myTimeColor : colors.textMuted, marginRight: 4 }]}>edited</Text>
              )}
              {!hideTimestamp && (
                <Text style={[st.msgTime, { color: isMe ? myTimeColor : colors.textMuted }]}>
                  {formatMsgTime(msg.sent_at)}
                </Text>
              )}
              {isMe && (
                <TouchableOpacity onPress={() => onStatusPress?.(msg)} hitSlop={8} activeOpacity={0.65} disabled={!onStatusPress}>
                  <Ionicons
                    name={
                      msg.status === "failed" ? "alert-circle" :
                      isPending ? "time" :
                      msg.status === "read" ? "checkmark-done" :
                      msg.status === "delivered" ? "checkmark-done" : "checkmark"
                    }
                    size={14}
                    color={
                      msg.status === "failed" ? "#FF4444" :
                      isPending ? rcptSent :
                      msg.status === "read" ? rcptRead :
                      msg.status === "delivered" ? rcptDelivered :
                      rcptSent
                    }
                    style={{ marginLeft: 2 }}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}
        </Pressable>

          {chatPrefsLocal.reactions_enabled && msg.reactions && msg.reactions.length > 0 && (
          <View style={[st.reactionsRow, isMe ? st.reactionsMe : st.reactionsOther]}>
            {msg.reactions.map((r, i) => (
              <TouchableOpacity
                key={i}
                 style={[st.reactionPill, r.myReaction && { transform: [{ scale: 1.08 }] }]}
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
      {isMe && !flatSurface && (
        <Animated.View style={[st.swipeReplyIcon, { opacity: replyIconOpacity, right: 4 }]}>
          <Ionicons name="arrow-undo" size={18} color={BRAND} />
        </Animated.View>
      )}
    </View>
    {msg._isAi && ((msg._aiActions?.length ?? 0) > 0 || (msg._aiSuggestions?.length ?? 0) > 0) && (
      <View style={{ paddingLeft: 10, marginTop: 4 }}>
        {msg._aiActions && msg._aiActions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingRight: 10, paddingBottom: 2 }}
            style={{ marginBottom: 4 }}
          >
            {msg._aiActions.map((action, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => { if (action.action === "navigate" && action.params?.route) router.push(action.params.route as any); }}
                activeOpacity={0.75}
              >
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 5,
                  paddingHorizontal: 10, paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                  borderWidth: 1,
                  borderColor: BRAND + "35",
                  overflow: "hidden",
                }}>
                  <Ionicons name={action.icon as any} size={12} color={BRAND} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: BRAND }} numberOfLines={1}>{action.label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {msg._aiSuggestions && msg._aiSuggestions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingRight: 10, paddingBottom: 4 }}
          >
            {msg._aiSuggestions.map((s, i) => (
              <TouchableOpacity key={i} onPress={() => onSuggestionTap?.(s)} activeOpacity={0.75}>
                <View style={{
                  paddingHorizontal: 10, paddingVertical: 5,
                  borderRadius: 20,
                  backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)",
                  borderWidth: 1,
                  borderColor: BRAND + "30",
                }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: BRAND }} numberOfLines={1}>{s}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
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

  return (
    <ChatLockGate>
      <ChatScreen />
    </ChatLockGate>
  );
}

function ChatLockGate({ children }: { children: React.ReactNode }) {
  const { prefs } = useChatPreferences();
  const { colors } = useTheme();
  const [unlocked, setUnlocked] = useState(!prefs.chat_lock || Platform.OS === "web");
  const [checking, setChecking] = useState(false);

  const authenticate = useCallback(async () => {
    if (!prefs.chat_lock || Platform.OS === "web") {
      setUnlocked(true);
      return;
    }
    setChecking(true);
    try {
      const LocalAuthentication = require("expo-local-authentication") as typeof import("expo-local-authentication");
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) {
        setUnlocked(true);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock your chats",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      setUnlocked(result.success);
    } catch {
      // Unsupported clients must not strand the user behind an unusable lock.
      setUnlocked(true);
    } finally {
      setChecking(false);
    }
  }, [prefs.chat_lock]);

  useEffect(() => {
    if (!prefs.chat_lock || Platform.OS === "web") {
      setUnlocked(true);
      return;
    }
    setUnlocked(false);
    authenticate();
  }, [prefs.chat_lock, authenticate]);

  if (!prefs.chat_lock || unlocked) return <>{children}</>;

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: colors.background }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, marginBottom: 18 }}>
        <Ionicons name="lock-closed" size={30} color={colors.accent} />
      </View>
      <Text style={{ color: colors.text, fontFamily: "Inter_700Bold", fontSize: 20, textAlign: "center" }}>Chats are locked</Text>
      <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 }}>
        Authenticate to open this conversation.
      </Text>
      <TouchableOpacity
        onPress={authenticate}
        disabled={checking}
        style={{ marginTop: 22, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.accent, minWidth: 130, alignItems: "center" }}
      >
        {checking ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Unlock</Text>}
      </TouchableOpacity>
    </View>
  );
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
     otherHandle,
     channelHandle,
     channelDescription,
    isGroup,
    isChannel,
    channelRole,
    chatName,
    chatAvatar,
    initialMessage,
    sharedImageUri,
    sharedImageUris,
    sharedFilesJson,
    sharedFileUri,
    sharedFileType,
    sharedFileName,
    lensIntro,
    messageId,
  } = useLocalSearchParams<{
    id: string;
    contactId?: string;
    contactName?: string;
    contactAvatar?: string;
    otherName?: string;
    otherAvatar?: string;
    otherId?: string;
    otherHandle?: string;
     channelHandle?: string;
     channelDescription?: string;
    isGroup?: string;
    isChannel?: string;
    channelRole?: "owner" | "member";
    chatName?: string;
    chatAvatar?: string;
    initialMessage?: string;
    sharedImageUri?: string;
    sharedImageUris?: string;
    sharedFilesJson?: string;
    sharedFileUri?: string;
    sharedFileType?: string;
    sharedFileName?: string;
    lensIntro?: string;
    messageId?: string;
  }>();
  const isDraft = id === "new";
  const { user, session, profile, isPremium, subscription, refreshProfile, equippedGoods } = useAuth();
  const { status: callStatus, startCall: callStart, isAvailable: callAvailable } = useCall();
  const callStartingRef = useRef(false);
  const { openApp } = useSuperApp();
  const { colors, isDark } = useTheme();
  const { appearance: chatAppearance, updateAppearance: updateChatAppearance } = useChatAppearance(id as string | undefined);
  const BRAND = colors.accent;
  const { preferredLang, textToSpeech: ttsEnabled, t } = useLanguage();
  const { prefs: chatPrefs, themeColors: chatThemeColors, bubbleRadius: chatBubbleRadius } = useChatPreferences();
  const effectiveChatFontSize = chatAppearance?.fontSize ?? chatPrefs?.font_size ?? 14;
  const { features: advancedFeatures } = useAdvancedFeatures();
  const advancedFeaturesRef = useRef(advancedFeatures);
  advancedFeaturesRef.current = advancedFeatures;
  const { isLowData: chatIsLowData } = useDataMode();
  const { statsMap, getDynamicPrice } = useGiftPrices();
  const pickerQuality = (() => {
    const base = chatPrefs.media_quality === "High" ? 1.0 : chatPrefs.media_quality === "Low" ? 0.4 : 0.8;
    return chatIsLowData ? Math.min(base, 0.4) : base;
  })();

  // Screen capture is process-wide. The server RPC checks every member in
  // this conversation, so one participant opting in protects the chat for
  // everyone viewing it. Default to protected while the policy is being
  // checked: failure must never create a privacy window.
  useEffect(() => {
    const chatId = isDraft ? undefined : id;
    if (!user || !chatId || isLocalNotesId(chatId)) return;
    let cancelled = false;
    setChatScreenshotProtection(chatId, true).catch(() => {});

    const refreshPolicy = () => {
      supabase
        .rpc("chat_has_screenshot_protection", { p_chat_id: chatId })
        .then(({ data, error }) => {
          if (cancelled) return;
          // Keep protection enabled if the policy cannot be verified.
          setChatScreenshotProtection(chatId, error ? true : data === true).catch(() => {});
        });
    };
    refreshPolicy();

    const policyChannelName = `chat-screenshot-policy:${chatId}:${user.id}`;
    // React can rerun this effect before a previous cleanup has removed its
    // subscribed channel (Strict Mode and rapid chat transitions both do this).
    // Supabase returns the existing channel by topic, and .on() then throws
    // because callbacks cannot be added after subscribe().
    const stalePolicyChannel = supabase
      .getChannels()
      .find((channel) => channel.topic === `realtime:${policyChannelName}`);
    if (stalePolicyChannel) {
      void supabase.removeChannel(stalePolicyChannel);
    }

    const policyChannel = supabase
      .channel(policyChannelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_preferences" },
        refreshPolicy,
      )
      .subscribe();

    return () => {
      cancelled = true;
      setChatScreenshotProtection(chatId, false).catch(() => {});
      supabase.removeChannel(policyChannel);
    };
  }, [user?.id, id, isDraft, chatPrefs.screenshot_protection]);

  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [senderRingMap, setSenderRingMap] = useState<Map<string, 'crown'|'void'|'diamond'>>(new Map());

  useEffect(() => {
    const senderIds = [...new Set(messages.map((m) => m.sender_id).filter((id) => id && id !== user?.id))];
    if (senderIds.length === 0) return;

    const rings = new Map<string, 'crown'|'void'|'diamond'>();
    const crownCandidates = new Set<string>();
    const platinumIds = new Set<string>();

    // Query 1: status goods — rings only (sg1-3); nameplate/star/glow props removed
    const goodsPromise = supabase
      .from("status_goods_purchases")
      .select("user_id, good_id")
      .in("user_id", senderIds)
      .in("good_id", ["sg1", "sg2", "sg3"])
      .eq("equipped", true)
      .then(({ data }) => {
        for (const r of (data || []) as { user_id: string; good_id: string }[]) {
          if (r.good_id === "sg1") crownCandidates.add(r.user_id);
          if (r.good_id === "sg2" && !rings.has(r.user_id)) rings.set(r.user_id, 'void');
          if (r.good_id === "sg3" && !rings.has(r.user_id)) rings.set(r.user_id, 'diamond');
        }
      }, () => {});

    // Query 2: Platinum required before an equipped Crown Aura can render.
    const subPromise = supabase
      .from("user_subscriptions")
      .select("user_id, subscription_plans(tier)")
      .in("user_id", senderIds)
      .eq("is_active", true)
      .then(({ data }) => {
        for (const s of (data || []) as { user_id: string; subscription_plans: any }[]) {
          if (s.subscription_plans?.tier === "platinum") platinumIds.add(s.user_id);
        }
      }, () => {});

    Promise.allSettled([goodsPromise, subPromise]).then(() => {
      for (const userId of crownCandidates) {
        if (platinumIds.has(userId) && !rings.has(userId)) rings.set(userId, 'crown');
      }
      setSenderRingMap(new Map(rings));
    });
  }, [messages.length]);
  const [input, setInput] = useState("");
  // Show skeleton immediately on open; setLoading(false) is called once messages are ready.
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const imgViewer = useImageViewer();
  const [realChatId, setRealChatId] = useState<string | null>(null);
  const creatingChatIdRef = useRef<Promise<string | null> | null>(null);

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
        other_handle: otherHandle || null,
        channel_handle: channelHandle || null,
        channel_description: channelDescription || null,
        channel_owner_id: channelRole === "owner" ? (user?.id ?? null) : null,
        channel_role: channelRole,
        channel_is_member: channelRole ? true : undefined,
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
  const chatInfoStateRef = useRef(chatInfo);
  chatInfoStateRef.current = chatInfo;
  const messageLimitName = chatInfo?.other_name || t("this user");
  const messageLimitNotice = t("chat.message_limit_notice", { name: messageLimitName });
  const messageLimitAlert = t("chat.message_limit_alert", { name: messageLimitName });
  const messageLimitTitle = t("chat.message_limit_title");
  const isAfuAiDirectChat = chatInfo?.other_id === AFUAI_BOT_ID;
  const isNotificationsChat = [chatInfo?.other_handle, otherHandle, chatInfo?.other_name, chatInfo?.name]
    .some((value) => value?.trim().toLowerCase() === "notifications");
  const isSelfChat = !chatInfo?.is_group && !chatInfo?.is_channel && !!chatInfo?.other_id && chatInfo?.other_id === user?.id;
  const isLocalNotes = isLocalNotesId(id);
  const messageGateContextKey = `${user?.id ?? "anonymous"}:${isDraft ? `draft:${id}` : id}`;
  const initialMessageGateStatus: MessageGateStatus =
    isDraft || isLocalNotes || isNotificationsChat || isAfuAiDirectChat || isSelfChat || isGroup === "true" || isChannel === "true"
      ? "unlocked"
      : readCachedMessageGate(user?.id, id);
  const [phonebookName, setPhonebookName] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingMapRef = useRef<Map<string, string>>(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const msgSubDroppedRef = useRef(false);
  const [isAfuAiTyping, setIsAfuAiTyping] = useState(false);
  const [showAfuAiMenu, setShowAfuAiMenu] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationTargetLoadRef = useRef<string | null>(null);
  const notificationTargetHandledRef = useRef<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCursor, setSearchCursor] = useState(0);
  const searchInputRef = useRef<any>(null);
  const chatSearchAnim = useRef(new Animated.Value(0)).current;
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editHistoryMsg, setEditHistoryMsg] = useState<Message | null>(null);
  const [editHistoryItems, setEditHistoryItems] = useState<{ id: string; previous_content: string; edited_at: string }[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [showReactions, setShowReactions] = useState<Message | null>(null);
  const [showMoreEmojis, setShowMoreEmojis] = useState(false);
  const [textSelectionMessageId, setTextSelectionMessageId] = useState<string | null>(null);
  const [messageSourceLanguage, setMessageSourceLanguage] = useState<string | null>(null);

  useEffect(() => {
    const message = showReactions;
    const text = message?.encrypted_content?.trim() ?? "";
    const isSpecialMessage =
      !text ||
      text.startsWith("🧧") ||
      text.startsWith("🎁 ") ||
      text.includes("|giftId:") ||
      ["📷 Photo", "🎥 Video", "GIF"].includes(text);

    if (!message || isLocalNotes || isSpecialMessage || !advancedFeatures.message_translation || !preferredLang) {
      setMessageSourceLanguage(null);
      return;
    }
    if (preferredLang === "en") {
      setMessageSourceLanguage("en");
      return;
    }

    let cancelled = false;
    setMessageSourceLanguage(null);
    detectMessageLanguage(text).then((sourceLanguage) => {
      if (!cancelled) setMessageSourceLanguage(sourceLanguage);
    }).catch(() => {
      if (!cancelled) setMessageSourceLanguage(null);
    });
    return () => { cancelled = true; };
  }, [showReactions?.id, showReactions?.encrypted_content, preferredLang, isLocalNotes, advancedFeatures.message_translation]);

  const closeMessageOptions = useCallback(() => {
    setShowReactions(null);
    setAiResult(null);
    setAiResultType(null);
    setAiReplies([]);
    setShowMoreEmojis(false);
  }, []);
  const [msgInfoTarget, setMsgInfoTarget] = useState<Message | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<{ id: string; handle: string; display_name: string; avatar_url: string | null }[]>([]);
  const [showRedEnvelope, setShowRedEnvelope] = useState(false);
  const [showAiEditor, setShowAiEditor] = useState(false);
  const [inputSelection, setInputSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [envelopeAmount, setEnvelopeAmount] = useState("");
  const [envelopeMsg, setEnvelopeMsg] = useState("");
  const [envelopeCount, setEnvelopeCount] = useState("1");
  const [showEmojiStickerPicker, setShowEmojiStickerPicker] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardOffsetAnim = useRef(new Animated.Value(0)).current;
  // If the system keyboard opens while the emoji/sticker picker is open, close it.
  useEffect(() => {
    if (showEmojiStickerPicker && keyboardHeight > 0) {
      setShowEmojiStickerPicker(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardHeight]);
  const [miniProfileUserId, setMiniProfileUserId] = useState<string | null>(null);
  const [emojiKeyboardHeight, setEmojiKeyboardHeight] = useState(280);
  const [iAmChatAdmin, setIAmChatAdmin] = useState(false);
  const [joiningChannel, setJoiningChannel] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showInviteLink, setShowInviteLink] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const inviteCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [addMemberResults, setAddMemberResults] = useState<any[]>([]);
  const [addMemberSelected, setAddMemberSelected] = useState<Set<string>>(new Set());
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addMemberAdding, setAddMemberAdding] = useState(false);
  const [existingMemberIds, setExistingMemberIds] = useState<Set<string>>(new Set());

  // Load chatInfo from local SQLite cache immediately so the header renders
  // without any network delay, even if nav params weren't passed.
  useEffect(() => {
    if (isDraft || chatInfo) return;
    if (isLocalNotesId(id)) {
      getLocalNotesConversation(user?.id || "").then((local) => {
        if (!local) return;
        const notesOwnerId = local.other_id || user?.id || "";
        setChatInfo((prev) => prev ?? {
          is_group: false,
          is_channel: false,
          name: local.name || "My Notes",
          other_name: local.name || "My Notes",
          other_avatar: null,
          other_id: notesOwnerId,
          member_ids: [notesOwnerId],
          avatar_url: null,
          other_last_seen: null,
          other_show_online_status: false,
        });
      }).catch(() => {});
      return;
    }
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
        channel_owner_id: local.is_channel && local.created_by === user?.id ? (user?.id ?? null) : null,
        channel_role: local.is_channel
          ? (local.created_by === user?.id ? "owner" : "member")
          : undefined,
        channel_is_member: local.is_channel ? true : undefined,
        other_last_seen: local.other_last_seen,
        other_show_online_status: local.other_show_online,
      });
    }).catch(() => {});
  }, [id, isDraft, chatInfo, user?.id]);

  const [floatingInputHeight, setFloatingInputHeight] = useState(80);


  useEffect(() => {
    // iOS: use Will events for zero-lag animation in sync with the keyboard.
    // Android (pan mode): use Did events; animate layout changes manually.
    const showEvent = "keyboardDidShow";
    const hideEvent = "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates.height;
      Animated.timing(keyboardOffsetAnim, {
        toValue: h,
        duration: Platform.OS === "ios" ? (e.duration ?? CHAT_FAST_DURATION) : CHAT_FAST_DURATION,
        useNativeDriver: false,
      }).start();
      setKeyboardHeight(h);
      if (h > 100) setEmojiKeyboardHeight(h);
    });
    const onHide = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardOffsetAnim, {
        toValue: 0,
        duration: Platform.OS === "ios" ? (e?.duration ?? CHAT_FAST_DURATION) : CHAT_FAST_DURATION,
        useNativeDriver: false,
      }).start();
      setKeyboardHeight(0);
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, [keyboardOffsetAnim]);
  useEffect(() => {
    Animated.spring(chatSearchAnim, {
      toValue: searchActive ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 190,
      mass: 0.75,
    }).start();
  }, [chatSearchAnim, searchActive]);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [showAppearanceSheet, setShowAppearanceSheet] = useState(false);
  const [muteUntil, setMuteUntil] = useState<string | null | undefined>(undefined);
  const [showMutePicker, setShowMutePicker] = useState(false);
  // null = muted forever; ISO string = muted until that time; undefined = not loaded / not muted
  const isMuted = muteUntil === null || (muteUntil !== undefined && new Date(muteUntil) > new Date());
  const [disappearingEnabled, setDisappearingEnabled] = useState(false);
  const [disappearingTimer, setDisappearingTimer] = useState(86400); // seconds; 0 = off
  const [showDisappearingPicker, setShowDisappearingPicker] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [giftSending, setGiftSending] = useState(false);
  const [walletCurrency, setWalletCurrency] = useState<"acoin" | "nexa">("acoin");
  const [walletAmount, setWalletAmount] = useState("");
  const [walletNote, setWalletNote] = useState("");
  const [walletSending, setWalletSending] = useState(false);
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
  const [lensCardMsg, setLensCardMsg] = useState<Message | null>(null);
  const lensContextRef = useRef<{
    title: string; description: string; category: string;
    confidence: string; facts: string[]; answer?: string;
    history?: Array<{ q: string; a: string }>;
    imagePreview?: string; searchQuery?: string;
  } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recLocked, setRecLocked] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingTenths, setRecordingTenths] = useState(0);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recAmplitudes, setRecAmplitudes] = useState<number[]>([]);
  const recorderRef = useRef<AudioRecording | null>(null);
  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webStreamRef = useRef<MediaStream | null>(null);
  const recordingActiveRef = useRef(false);
  const recordingStartingRef = useRef(false);
  const recordingTimer = useRef<any>(null);
  const meterInterval = useRef<any>(null);

  const recordingDurationRef = useRef(0);
  const recAmpHistoryRef = useRef<number[]>([]);
  const webAnalyserRef = useRef<any>(null);
  const webAudioCtxRef = useRef<any>(null);
  const recLockedSV = useSharedValue(false);
  const recCancelledSV = useSharedValue(false);
  const recStartedSV = useSharedValue(false);
  const recPressActiveSV = useSharedValue(false);

  const slideX = useSharedValue(0);
  const slideY = useSharedValue(0);
  const directionLock = useSharedValue<"none" | "horizontal" | "vertical">("none");

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
        slideX.value = Math.min(0, e.translationX);
        if (slideX.value < MIC_CANCEL_THRESHOLD && !recCancelledSV.value) {
          recCancelledSV.value = true;
          slideX.value = 0;
          slideY.value = 0;
          runOnJS(onRecCancel)();
        }
      } else {
        slideY.value = Math.min(0, e.translationY);
        if (slideY.value < MIC_LOCK_THRESHOLD && !recLockedSV.value && !recCancelledSV.value) {
          slideX.value = 0;
          slideY.value = 0;
          runOnJS(onRecLock)();
        }
      }
    })
    .onEnd(() => {
      recPressActiveSV.value = false;
      directionLock.value = "none";
      slideX.value = 0;
      slideY.value = 0;
      if (recCancelledSV.value || recLockedSV.value) return;
      if (recStartedSV.value) {
        // A single tap starts and locks recording. Sending is explicit via the
        // now-visible send button, while swipe gestures retain cancel support.
        runOnJS(onRecLock)();
      }
    })
    .onFinalize(() => {
      recPressActiveSV.value = false;
    }), [onRecStart, onRecCancel, onRecLock, onRecSend]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showAttachPanel, setShowAttachPanel] = useState(false);
  const [attachTab, setAttachTab] = useState<"Gallery" | "Wallet" | "Poll" | "Contact">("Gallery");
  const [contactList, setContactList] = useState<{ id: string; name: string; phone: string; initials: string }[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSending, setContactSending] = useState<string | null>(null);

  useEffect(() => {
    if (!showAttachPanel || attachTab !== "Contact") return;
    if (contactList.length > 0) return; // already loaded
    (async () => {
      setContactsLoading(true);
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status === "granted") {
          const { data } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
            sort: Contacts.SortTypes.FirstName,
          });
          const mapped = data
            .filter((c) => c.name)
            .map((c) => {
              const phone = c.phoneNumbers?.[0]?.number ?? "";
              const words = (c.name ?? "").trim().split(/\s+/);
              const initials = words.length >= 2
                ? words[0][0] + words[words.length - 1][0]
                : (words[0]?.[0] ?? "?");
              return { id: c.id ?? Math.random().toString(), name: c.name ?? "", phone, initials: initials.toUpperCase() };
            });
          setContactList(mapped);
        }
      } catch { /* ignore */ }
      setContactsLoading(false);
    })();
  }, [showAttachPanel, attachTab]);

  type AttachmentPreview = { uri: string; type: string; name?: string; mimeType?: string; trimStart?: number; trimEnd?: number };
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const [selectedImages, setSelectedImages] = useState<AttachmentPreview[]>([]);
  const sharedImageInjectedRef = useRef(false);
  const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);
  const [showVideoTrimmer, setShowVideoTrimmer] = useState(false);
  const [pendingVideoUri, setPendingVideoUri] = useState<{ uri: string; mimeType: string } | null>(null);
  const [networkOnline, setNetworkOnline] = useState(isOnline());
  const [messageGateSnapshot, setMessageGateSnapshot] = useState<MessageGateSnapshot>({
    contextKey: messageGateContextKey,
    status: initialMessageGateStatus,
  });
  // Never borrow the previous route's gate while navigating between chats.
  // Read this chat's durable snapshot synchronously so a known unlocked chat
  // opens straight into its composer, even when the device is offline.
  const messageGateStatus = messageGateSnapshot.contextKey === messageGateContextKey
    ? messageGateSnapshot.status
    : initialMessageGateStatus;
  const messageLimited = messageGateStatus === "limited";
  const messageGateBlocked = messageGateStatus !== "unlocked";
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
  const selectionClearTimer = useRef<any>(null);
  const chatLoadGenerationRef = useRef(0);
  const messageGateCheckRef = useRef(0);
  const messageGateContextRef = useRef(messageGateContextKey);
  messageGateContextRef.current = messageGateContextKey;

  const effectiveChatId = isDraft ? realChatId : id;

  const loadChatInfo = useCallback(async (loadToken = chatLoadGenerationRef.current) => {
    const isCurrentLoad = () => chatLoadGenerationRef.current === loadToken;
    if (!id || !user || isDraft || isLocalNotesId(id)) return;
    // SQLite fallback (useEffect above) already hydrates chatInfo when offline —
    // skip the network round-trip so we don't leave a dangling fetch.
    if (!isOnline()) return;
    const channelRouteHint = isChannel === "true";
    const chatSelect = channelRouteHint
      ? "is_group, is_channel, name, description, avatar_url"
      : "is_group, is_channel, name, description, avatar_url, chat_members(user_id, is_admin, profiles(id, display_name, avatar_url, handle, is_verified, is_organization_verified, last_seen, show_online_status))";
    const { data: chat } = await supabase
      .from("chats")
      .select(chatSelect as any)
      .eq("id", id)
      .single() as { data: any };

    if (chat) {
      if (chat.is_channel) {
        // A channel opened from Search or an existing chat already has enough
        // route/cache data to render immediately. Keep the first query small,
        // then resolve private access and subscription state in the background.
        if (!isCurrentLoad()) return;
        setChatInfo((prev) => ({
          ...(prev ?? {
            is_group: false,
            is_channel: true,
            name: null,
            other_name: "Channel",
            other_avatar: null,
            other_id: "",
            member_ids: [],
            avatar_url: null,
          }),
          is_group: false,
          is_channel: true,
          name: chat.name ?? prev?.name ?? chatName ?? null,
          other_name: chat.name ?? prev?.other_name ?? chatName ?? "Channel",
          other_avatar: chat.avatar_url ?? prev?.other_avatar ?? chatAvatar ?? null,
          avatar_url: chat.avatar_url ?? prev?.avatar_url ?? chatAvatar ?? null,
          channel_description: prev?.channel_description ?? chat.description ?? channelDescription ?? null,
          channel_role: prev?.channel_role ?? channelRole,
          channel_is_member: prev?.channel_is_member ?? (channelRole ? true : undefined),
          channel_owner_id: prev?.channel_owner_id ?? (channelRole === "owner" ? user.id : null),
        }));

        void Promise.all([
          supabase.rpc("get_channel_access_context", { p_channel_id: id }),
          supabase
            .from("channels")
            .select("handle, description, is_public, subscriber_count")
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("channel_subscriptions")
            .select("user_id")
            .eq("channel_id", id)
            .eq("user_id", user.id)
            .maybeSingle(),
        ]).then(([channelAccessResult, channelResult, channelMembershipResult]) => {
          if (!isCurrentLoad()) return;
          const channelAccess = channelAccessResult.data?.[0];
          const channel = channelResult.data;
          const channelIsMember = channelMembershipResult.error
            ? undefined
            : !!channelMembershipResult.data || !!channelAccess?.is_owner || !!channelAccess?.is_admin;
          const nextChannelRole = channelAccess?.is_owner
            ? "owner"
            : channelIsMember
              ? (channelRole ?? "member")
              : undefined;
          setIAmChatAdmin(!!channelAccess?.is_admin);
          setChatInfo((prev) => prev ? {
            ...prev,
            channel_handle: channel?.handle || prev.channel_handle || channelHandle || null,
            channel_description: channel?.description ?? prev.channel_description ?? channelDescription ?? null,
            channel_is_public: channel?.is_public ?? prev.channel_is_public,
            channel_is_member: channelIsMember === undefined ? prev.channel_is_member : channelIsMember,
            channel_owner_id: channelAccess?.owner_id || prev.channel_owner_id || null,
            channel_subscriber_count: channel?.subscriber_count ?? prev.channel_subscriber_count ?? null,
            channel_role: nextChannelRole,
          } : prev);
        }).catch(() => {});
        return;
      }

      const channelAccess = chat.is_channel
        ? (await supabase.rpc("get_channel_access_context", { p_channel_id: id })).data?.[0]
        : null;
      const channel = chat.is_channel
        ? (await supabase
            .from("channels")
            .select("handle, description, is_public, subscriber_count")
            .eq("id", id)
            .maybeSingle()).data
        : null;
      if (!isCurrentLoad()) return;
      const allMembers = (chat.chat_members || []) as any[];
      const me = allMembers.find((m: any) => m.user_id === user.id);
      setIAmChatAdmin(chat.is_channel ? !!channelAccess?.is_admin : !!(me?.is_admin));
      const channelIsMember = chat.is_channel
        ? !!me || !!channelAccess?.is_owner || !!channelAccess?.is_admin
        : undefined;
      const others = allMembers.filter((m) => m.user_id !== user.id);
      // Self-chat ("My Notes"): ONLY when the user is the sole member AND we have no
      // other_id hint from URL params (allMembers empty just means an old DM chat).
      const isSelf = others.length === 0 && allMembers.length > 0 && !otherId;
      const sourceMember = isSelf ? allMembers.find((m) => m.user_id === user.id) : others[0];
      const profileRaw = sourceMember?.profiles;
      const other: any = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
      const memberIds = isSelf ? [user.id] : others.map((m: any) => m.profiles?.id).filter(Boolean) as string[];
      setChatInfo({
        is_group: !!chat.is_group,
        is_channel: !!chat.is_channel,
        name: chat.name,
        other_name: isSelf ? "My Notes" : (other?.display_name || "Unknown"),
        other_avatar: isSelf ? null : (other?.avatar_url || null),
        other_id: isSelf ? user.id : (other?.id || ""),
        member_ids: memberIds,
        avatar_url: chat.avatar_url,
         channel_handle: channel?.handle || channelHandle || null,
         channel_description: channel?.description ?? chat.description ?? channelDescription ?? null,
        channel_is_public: channel?.is_public ?? undefined,
        channel_is_member: channelIsMember,
            channel_owner_id: channelAccess?.owner_id || null,
        channel_subscriber_count: channel?.subscriber_count ?? null,
        is_verified: isSelf ? false : !!other?.is_verified,
        is_organization_verified: isSelf ? false : !!other?.is_organization_verified,
        other_last_seen: isSelf ? null : (other?.last_seen || null),
        other_show_online_status: isSelf ? false : (other?.show_online_status !== false),
         other_handle: isSelf ? null : (other?.handle || null),
      });
    }
  }, [id, user, isDraft, isChannel, channelRole, channelHandle, channelDescription, chatName, chatAvatar]);

  const loadMessages = useCallback(async (loadToken = chatLoadGenerationRef.current) => {
    const isCurrentLoad = () => chatLoadGenerationRef.current === loadToken;
    const chatId = isDraft ? realChatId : id;
    if (!chatId || !user) return;
    if (isNotificationsChat || isAfuAiDirectChat) {
      // Do this before reading the cache or waiting for the network so a
      // subsequent chats-list refresh cannot restore the unread badge.
      void markSystemChatRead(chatId, user.id, {
        notifications: isNotificationsChat,
        afuAi: isAfuAiDirectChat,
      });
    }
    // My Notes is intentionally device-only. Do not query Supabase, subscribe
    // to realtime, or attempt any server sync for this conversation.
    if (isLocalNotesId(chatId)) {
      const localNotes = await getLocalNotesMessages(user.id);
      if (!isCurrentLoad()) return;
      setMessages([...localNotes].reverse().map((message) => ({
        id: message.id,
        chat_id: message.chat_id,
        sender_id: message.sender_id,
        encrypted_content: message.encrypted_content,
        sent_at: message.sent_at,
        reply_to_message_id: message.reply_to_message_id,
        attachment_url: message.attachment_url,
        attachment_type: message.attachment_type,
        status: message.status,
        reactions: [],
      })));
      setLoading(false);
      return;
    }

    // ── Load from local SQLite cache first (instant render, no network) ──
    {
      // getLocalMessages returns oldest-first (ASC). FlatList is inverted so index 0
      // must be the NEWEST message. Reverse to get newest-first.
      const clearedAt = await AsyncStorage.getItem(`chat_cleared_${user.id}_${chatId}`).catch(() => null);
      const allCached = await getLocalMessages(chatId, 5000);
      if (!isCurrentLoad()) return;
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
        // Only pre-download recent attachments. Downloading the entire local
        // history on every chat open can create a large background burst.
        autoDownloadChatAttachments(cached.slice(-100).map((m) => ({
          attachment_url: m.attachment_url,
          attachment_type: m.attachment_type,
          encrypted_content: m.content ?? "",
        })), {
          autoDownloadPref: chatPrefs.auto_download ? "wifi_only" : "never",
          saveToGallery: chatPrefs.save_to_gallery,
        });
        // Background: refresh reactions for cached messages so they reappear after navigation.
        const cachedIds = cached.map((m) => m.id).filter((cid) => !cid.startsWith("pending"));
        if (cachedIds.length > 0) {
          void supabase.from("message_reactions").select("message_id, reaction, user_id").in("message_id", cachedIds).then(({ data: cacheReactions }) => {
             if (!isCurrentLoad()) return;
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
    const newestStored = await getNewestMessageDate(chatId);
    const clearedAtServer = await AsyncStorage.getItem(`chat_cleared_${user.id}_${chatId}`).catch(() => null);
    if (!isCurrentLoad()) return;
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
      if (!isCurrentLoad()) return;

    if (data) {
      const msgIds = data.map((m: any) => m.id);
        const notificationMap = new Map<string, NotificationMessageData>();
        if (isNotificationsChat && msgIds.length > 0) {
          const { data: notificationEvents } = await supabase
            .from("notification_events")
            .select("id, message_id, kind, cta_label, cta_route, entity_id, metadata, read_at")
            .eq("recipient_id", user.id)
            .in("message_id", msgIds);
          for (const event of (notificationEvents ?? []) as any[]) {
            if (event.message_id) notificationMap.set(event.message_id, event);
          }
        }

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
          _notification: notificationMap.get(m.id),
        };
      });

      // Display new messages the instant we have them — reactions paint after.
      setMessages((prev) => {
        if (mapped.length === 0) return prev;
        const serverIds = new Set(mapped.map((m: any) => m.id));
        const notInServer = prev.filter((m) =>
          !serverIds.has(m.id) &&
          !mapped.some((serverMessage: Message) => isOptimisticMatch(m, serverMessage))
        );
        const previousById = new Map(prev.map((m) => [m.id, m]));
        // A status write can be in flight while this refresh is running. Keep
        // the locally visible receipt until the server response catches up;
        // otherwise the fast server payload briefly downgrades read → sent.
        const merged = mapped.map((m: any) => {
          const previous = previousById.get(m.id);
          return previous
            ? {
                ...m,
                status: previous.status ?? m.status,
                read_at: previous.read_at ?? m.read_at,
                delivered_at: previous.delivered_at ?? m.delivered_at,
              }
            : m;
        });
        return [...merged, ...notInServer].sort(
          (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
        );
      });

      saveMessages(chatId, mapped).catch(() => {});
      autoDownloadChatAttachments(mapped.slice(0, 50), {
        autoDownloadPref: chatPrefs.auto_download ? "wifi_only" : "never",
        saveToGallery: chatPrefs.save_to_gallery,
      });
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
          if (!isCurrentLoad()) return;
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
          const statusMap = new Map<string, { read_at: string | null; delivered_at: string | null }>();
          for (const s of (statuses || []) as any[]) {
            statusMap.set(s.message_id, { read_at: s.read_at || null, delivered_at: s.delivered_at || null });
          }
          const msgIdSet = new Set(msgIds);
          const readIds = (statuses || [])
            .filter((status: any) => status.read_at)
            .map((status: any) => status.message_id);
          if (readIds.length > 0) {
            void Promise.all(readIds.map((messageId: string) => markMessageRead(messageId)));
          }
          setMessages((prev) =>
            prev.map((m) => {
              if (!msgIdSet.has(m.id)) return m;
              const sInfo = statusMap.get(m.id);
              return {
                ...m,
                reactions: reactionMap[m.id] ?? m.reactions,
                status: m.sender_id === user.id
                  ? (sInfo?.read_at ? "read" : sInfo?.delivered_at ? "delivered" : (m.status || "sent"))
                  : m.status,
                // Never erase a receipt because this refresh raced the
                // recipient's upsert or the realtime event.
                read_at: m.sender_id === user.id ? (sInfo?.read_at || m.read_at || null) : m.read_at,
                delivered_at: m.sender_id === user.id ? (sInfo?.delivered_at || m.delivered_at || null) : m.delivered_at,
              };
            })
          );
        }).catch(() => {});
      }

      // ── Background: mark incoming messages as read ────────────────────────────
      const unreadFromOthers = data.filter((m: any) => m.sender_id !== user.id);
      if (unreadFromOthers.length > 0) {
        // System conversations must clear their unread badge when opened.
        // Regular chats still respect the user's read-receipt preference.
        const shouldMarkRead = isNotificationsChat || isAfuAiDirectChat || chatPrefs.read_receipts;
        const now = new Date().toISOString();
        const unreadIds = unreadFromOthers.map((m: any) => m.id);
        supabase.from("message_status")
          .select("message_id").eq("user_id", user.id).not("read_at", "is", null).in("message_id", unreadIds)
          .then(({ data: myReadRows }) => {
            if (!isCurrentLoad()) return;
            const alreadyRead = new Set((myReadRows || []).map((r: any) => r.message_id));
            const toMark = unreadFromOthers.filter((m: any) => !alreadyRead.has(m.id));
            if (toMark.length > 0) {
              void persistIncomingStatus(
                toMark.map((m: any) => m.id),
                chatId,
                user.id,
                shouldMarkRead,
              );
              // Always broadcast "delivered" so the sender gets double-grey ticks.
              // Only broadcast "read" if the user has read receipts enabled (privacy).
              const msgIds = toMark.map((m: any) => m.id);
              typingChannelRef.current?.send({ type: "broadcast", event: "delivered", payload: { reader_id: user.id, message_ids: msgIds, chat_id: id, delivered_at: now } });
              if (shouldMarkRead) {
                typingChannelRef.current?.send({ type: "broadcast", event: "read", payload: { reader_id: user.id, message_ids: msgIds, chat_id: id, read_at: now } });
              }
            }
          });
      }
    }
    if (isCurrentLoad()) setLoading(false);
  }, [
    id,
    user,
    isDraft,
    realChatId,
    chatPrefs.auto_download,
    chatPrefs.save_to_gallery,
    chatPrefs.read_receipts,
    isNotificationsChat,
    isAfuAiDirectChat,
  ]);

  const loadMoreMessages = useCallback(async () => {
    const chatId = isDraft ? realChatId : id;
    if (!chatId || !user || loadingMore || !hasMore || !oldestCursorRef.current) return;
    setLoadingMore(true);
    try {
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
        const statusMap2 = new Map<string, { read_at: string | null; delivered_at: string | null }>();
        for (const s of (statuses || []) as any[]) {
          statusMap2.set(s.message_id, { read_at: s.read_at || null, delivered_at: s.delivered_at || null });
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
              ? (statusMap2.get(m.id)?.read_at ? "read" : statusMap2.get(m.id)?.delivered_at ? "delivered" : "sent")
              : undefined,
            read_at: m.sender_id === user.id ? (statusMap2.get(m.id)?.read_at || null) : undefined,
            delivered_at: m.sender_id === user.id ? (statusMap2.get(m.id)?.delivered_at || null) : undefined,
            _isAi: isBot || undefined,
            _aiActions: aiParsed && aiParsed.actions.length > 0 ? aiParsed.actions : undefined,
            _aiInvoices: aiParsed && aiParsed.invoices.length > 0 ? aiParsed.invoices : undefined,
          };
        });
        oldestCursorRef.current = data[data.length - 1].sent_at;
        setHasMore(data.length >= 50);
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          return [...prev, ...mapped.filter((m: Message) => !existingIds.has(m.id))];
        });
      } else {
        setHasMore(false);
      }
    } catch {
      // load-more failed silently; user can scroll up again to retry
    } finally {
      setLoadingMore(false);
    }
  }, [id, user, isDraft, realChatId, loadingMore, hasMore]);

  useEffect(() => {
    // Native-only: web has no offline queue and no connectivity events to handle.
    const unsub = onConnectivityChange(async (online) => {
      setNetworkOnline(online);
      if (online && !isLocalNotes) {
        await syncPendingMessages().catch(() => {});
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
      // Web cleanup
      try { webAudioCtxRef.current?.close(); } catch {}
      webAnalyserRef.current = null;
      webAudioCtxRef.current = null;
      if (webMediaRecorderRef.current) {
        try { webMediaRecorderRef.current.stop(); } catch {}
        webMediaRecorderRef.current = null;
        webChunksRef.current = [];
      }
      if (webStreamRef.current) {
        webStreamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        webStreamRef.current = null;
      }
      // Native cleanup
      if (recordingActiveRef.current) {
        recordingActiveRef.current = false;
        recorderRef.current?.stopAndUnloadAsync().catch(() => {});
        recorderRef.current = null;
        // Restore audio session so the next playback attempt doesn't find it stuck.
        Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }).catch(() => {});
      }
    };
  }, []);

  const checkMessageGating = useCallback(async () => {
    if (!user) return;
    const checkId = ++messageGateCheckRef.current;
    const checkContextKey = messageGateContextKey;
    const applyGateState = (status: MessageGateStatus) => {
      if (
        messageGateCheckRef.current === checkId &&
        messageGateContextRef.current === checkContextKey
      ) {
        setMessageGateSnapshot({ contextKey: checkContextKey, status });
      }
    };
    const persistGateState = (chatId: string, status: Exclude<MessageGateStatus, "unknown">) => {
      storage.setString(messageGateStorageKey(user.id, chatId), status);
    };
    const fallbackStatus = (
      cachedStatus: MessageGateStatus,
      hasLocalOutgoingMessage: boolean,
    ): MessageGateStatus => {
      if (cachedStatus !== "unknown") return cachedStatus;
      return hasLocalOutgoingMessage ? "limited" : "unknown";
    };

    if (isNotificationsChat) {
      applyGateState("unlocked");
      return;
    }
    if (isLocalNotesId(id)) {
      applyGateState("unlocked");
      return;
    }
    const info = chatInfo;
    // Keep the gate unresolved while chat metadata is loading. This blocks
    // sending without showing a false limit notice for an unrelated chat.
    if (!info) return;
    if (info.is_group || info.is_channel || !info.other_id || info.other_id === AFUAI_BOT_ID || info.other_id === user.id) {
      applyGateState("unlocked");
      return;
    }
    const otherId = info.other_id;
    const chatId = isDraft ? realChatId : id;
    if (!chatId) {
      applyGateState(isDraft ? "unlocked" : "unknown");
      return;
    }
    const cachedStatus = readCachedMessageGate(user.id, chatId);
    const localReply = messages.some(
      (message) => message.chat_id === chatId && message.sender_id === otherId && !message._pending,
    );
    const localOutgoingMessage = messages.some(
      (message) => message.chat_id === chatId && message.sender_id === user.id,
    );

    // A locally cached reply is authoritative while offline and is scoped to
    // this exact conversation, not merely this other user.
    if (localReply) {
      persistGateState(chatId, "unlocked");
      applyGateState("unlocked");
      return;
    }

    // Known state is applied synchronously on the first render from MMKV.
    // This branch preserves it if the app is offline.
    if (!isOnline()) {
      if (cachedStatus !== "unknown") {
        applyGateState(cachedStatus);
      } else if (localOutgoingMessage) {
        persistGateState(chatId, "limited");
        applyGateState("limited");
      } else {
        applyGateState("unknown");
      }
      return;
    }

    const { data: theyFollowMe, error: followError } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", otherId)
      .eq("following_id", user.id)
      .maybeSingle();
    if (followError) {
      applyGateState(fallbackStatus(cachedStatus, localOutgoingMessage));
      return;
    }
    if (theyFollowMe) {
      persistGateState(chatId, "unlocked");
      applyGateState("unlocked");
      return;
    }

    const { data: theirReplies, error: replyError } = await supabase
      .from("messages")
      .select("id")
      .eq("chat_id", chatId)
      .eq("sender_id", otherId)
      .limit(1);
    if (replyError) {
      applyGateState(fallbackStatus(cachedStatus, localOutgoingMessage));
      return;
    }
    if (theirReplies && theirReplies.length > 0) {
      persistGateState(chatId, "unlocked");
      applyGateState("unlocked");
      return;
    }

    // The existing product limit is one outgoing message until the recipient
    // replies or follows. A chat with no outgoing message has no limit.
    const { count: outgoingCount, error: outgoingError } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId)
      .eq("sender_id", user.id);
    if (outgoingError) {
      applyGateState(fallbackStatus(cachedStatus, localOutgoingMessage));
      return;
    }
    const hasLimit = localOutgoingMessage || (outgoingCount ?? 0) > 0;
    const nextStatus: Exclude<MessageGateStatus, "unknown"> = hasLimit ? "limited" : "unlocked";
    persistGateState(chatId, nextStatus);
    applyGateState(nextStatus);
  }, [user, chatInfo, isDraft, realChatId, id, isNotificationsChat, messages, messageGateContextKey]);

  const checkIfStranger = useCallback(async () => {
    if (!user) return;
    if (isNotificationsChat) {
      setIsStranger(false);
      setStrangerCountry(null);
      return;
    }
    if (isLocalNotesId(id)) {
      setIsStranger(false);
      return;
    }
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
  }, [user, chatInfo, isDraft, realChatId, id, isNotificationsChat]);

  useEffect(() => {
    checkMessageGating();
    checkIfStranger();
  }, [checkMessageGating, checkIfStranger, messages.length, networkOnline]);

  // A recipient can unlock the request by following or replying while this
  // screen is open. Poll only while locked; failed/offline checks remain
  // fail-closed and are retried after connectivity returns.
  useEffect(() => {
    if (!messageGateBlocked || !user || !networkOnline) return;
    const timer = setInterval(() => {
      void checkMessageGating();
    }, 5000);
    return () => clearInterval(timer);
  }, [messageGateBlocked, user, networkOnline, checkMessageGating]);

  const blockMessageAction = useCallback(() => {
    if (!messageGateBlocked) return false;
    // Do not show a limit alert while the exact chat's gate is unresolved.
    // Unknown state is still blocked, but it must not borrow another chat's
    // limit text while metadata/network state is loading.
    if (messageLimited) {
      showAlert(messageLimitTitle, messageLimitAlert);
    }
    return true;
  }, [messageGateBlocked, messageLimited, messageLimitTitle, messageLimitAlert]);


  useEffect(() => {
    const activeChatId = isDraft ? realChatId : id;
    if (!activeChatId) return;
    const loadToken = ++chatLoadGenerationRef.current;
    const isCurrentSubscription = () => chatLoadGenerationRef.current === loadToken;

    // Set this synchronously, before any async load. ChatsScreen may refresh
    // while this screen is opening; the RPC then excludes this chat's unread
    // rows instead of racing the loader and briefly restoring the badge.
    markChatVisited(activeChatId);
    setActiveChatId(activeChatId);
    loadChatInfo(loadToken);
    loadMessages(loadToken);

    if (isLocalNotesId(activeChatId)) {
      return () => {
        clearActiveChatId();
      };
    }

    // ── Fast-path: messages delivered via GlobalInboxListener broadcast ──────
    // This fires ~20 ms after send (before Postgres Changes arrives).
    // We render the message immediately and deduplicate when Postgres fires.
    const unsubFastPath = subscribeToChat(activeChatId, (gMsg) => {
      if (!isCurrentSubscription() || !user || gMsg.sender_id === user.id) return;
      const cachedSender = getProfileCache(gMsg.sender_id);
      const senderSnap = cachedSender
        ? { display_name: cachedSender.display_name, avatar_url: cachedSender.avatar_url ?? null, handle: cachedSender.handle }
        : { display_name: gMsg.sender_display_name || "User", avatar_url: gMsg.sender_avatar_url ?? null, handle: gMsg.sender_handle || "" };
      setMessages((prev) => {
        if (prev.some((m) => m.id === gMsg.id)) return prev;
        return [{ ...gMsg, encrypted_content: gMsg.encrypted_content ?? "", sender: senderSnap as any, reactions: [], status: undefined }, ...prev];
      });
    });

    // Evict any stale channel with this name before creating a fresh one.
    // Supabase caches channels by name; if a previous effect run left one
    // subscribed (e.g. React Strict Mode double-invoke, dep change), calling
    // .on() on the already-subscribed instance throws the
    // "cannot add postgres_changes callbacks after subscribe()" error.
    const _staleMsgCh = supabase.getChannels().find(
      (ch) => ch.topic === `realtime:chat:${activeChatId}`
    );
    if (_staleMsgCh) supabase.removeChannel(_staleMsgCh);

    const msgSub = supabase
      .channel(`chat:${activeChatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${activeChatId}` },
        async (payload) => {
          if (!isCurrentSubscription()) return;
          const newMsg = payload.new as any;
          if (newMsg.sender_id === user?.id) return;
          if (newMsg.sender_id === AFUAI_BOT_ID) return;

          // ── Content filter — drop messages with blocked keywords ──────────
          const kf = advancedFeaturesRef.current;
          if (kf.content_filter_topics && kf.content_filter_keywords && newMsg.encrypted_content) {
            const blocked = kf.content_filter_keywords.split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);
            const msgLower = (newMsg.encrypted_content as string).toLowerCase();
            if (blocked.length > 0 && blocked.some((b: string) => msgLower.includes(b))) return;
          }

          // Cache-first: show the message instantly with cached sender data;
          // only fire a Supabase round-trip when we haven't seen this sender before.
          const _cachedSender = getProfileCache(newMsg.sender_id);
          const _senderSnap = _cachedSender
            ? { display_name: _cachedSender.display_name, avatar_url: _cachedSender.avatar_url ?? null, handle: _cachedSender.handle }
            : { display_name: "User", avatar_url: null, handle: "" };
          const fetchNotificationData = async () => {
            if (!isNotificationsChat || !user) return null;
            const { data: event } = await supabase
              .from("notification_events")
              .select("id, message_id, kind, cta_label, cta_route, entity_id, metadata, read_at")
              .eq("recipient_id", user.id)
              .eq("message_id", newMsg.id)
              .maybeSingle();
            return event ? ({ ...event } as NotificationMessageData) : undefined;
          };
          const notificationData = await fetchNotificationData();
          if (!isCurrentSubscription()) return;
          setMessages((prev) => {
            // Deduplicate — broadcast fast-path may have already inserted this message
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [{ ...newMsg, sender: _senderSnap as any, reactions: [], status: undefined, _notification: notificationData }, ...prev];
          });
          // The messages and notification_events rows are created in one
          // transaction, but their realtime events can arrive in either order.
          // Retry the metadata lookup so the CTA is not permanently lost when
          // the message event wins the race.
          if (isNotificationsChat && !notificationData && user) {
            void (async () => {
              for (const delay of [150, 400, 900]) {
                await new Promise((resolve) => setTimeout(resolve, delay));
                if (!isCurrentSubscription()) return;
                const latest = await fetchNotificationData();
                if (latest && isCurrentSubscription()) {
                  setMessages((prev) => prev.map((m) =>
                    m.id === newMsg.id ? { ...m, _notification: latest } : m
                  ));
                  return;
                }
              }
            })();
          }
          if (!_cachedSender) {
            supabase.from("profiles").select("display_name, avatar_url, handle").eq("id", newMsg.sender_id).single().then(({ data: _sp }) => {
              if (_sp && isCurrentSubscription()) {
                setProfileCache(newMsg.sender_id, _sp as any);
                setMessages((prev) => prev.map((m) => m.id === newMsg.id ? { ...m, sender: _sp as any } : m));
              }
            });
          }
          // Auto-download images/gifs/audio on incoming messages (NOT files — user must tap)
          if (chatPrefs.auto_download && newMsg.attachment_url && newMsg.attachment_type &&
              newMsg.attachment_type !== "video" && newMsg.attachment_type !== "file") {
            ensureChatAttachmentDownloaded(newMsg.attachment_url, newMsg.attachment_type).catch(() => {});
          }
          // ── Auto-reply — respond automatically for DMs ───────────────────
          const currentChatInfo = chatInfoStateRef.current;
          if (
            kf.auto_reply_enabled &&
            kf.auto_reply_message &&
            !currentChatInfo?.is_group &&
            !currentChatInfo?.is_channel &&
            user
          ) {
            const autoReplyText = kf.auto_reply_message;
            const replyChatId = activeChatId;
            try {
              const { data: autoMsg } = await supabase
                .from("messages")
                .insert({ chat_id: replyChatId, sender_id: user.id, encrypted_content: autoReplyText })
                .select("id, chat_id, sender_id, encrypted_content, sent_at, attachment_type")
                .single();
              if (autoMsg) {
                const autoMsgFull = {
                  ...autoMsg,
                  sender: { display_name: profile?.display_name || "You", avatar_url: profile?.avatar_url || null, handle: profile?.handle || "" },
                  reactions: [],
                  status: "sent" as const,
                };
                setMessages((prev) => [autoMsgFull, ...prev]);
              }
            } catch {}
          }
          if (showScrollBtnRef.current) {
            setNewMsgCount((c) => c + 1);
          }

          if (user) {
            const _rtNow = new Date().toISOString();
            void persistIncomingStatus(
              [newMsg.id],
              activeChatId,
              user.id,
              chatPrefs.read_receipts,
            );
            // Always tell the sender we received it (double-grey) —
            // only tell them we read it if read receipts are enabled (double-blue).
            typingChannelRef.current?.send({ type: "broadcast", event: "delivered", payload: { reader_id: user.id, message_ids: [newMsg.id], chat_id: activeChatId, delivered_at: _rtNow } });
            if (chatPrefs.read_receipts) {
              typingChannelRef.current?.send({ type: "broadcast", event: "read", payload: { reader_id: user.id, message_ids: [newMsg.id], chat_id: activeChatId, read_at: _rtNow } });
            }
            markChatVisited(activeChatId);
          }
        }
      )
      // Real-time reaction sync — someone added a reaction
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          if (!isCurrentSubscription()) return;
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
          if (!isCurrentSubscription()) return;
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
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          if (msgSubDroppedRef.current) {
            // Reconnected after a drop — re-fetch to catch any missed messages
            msgSubDroppedRef.current = false;
            loadMessages(loadToken);
          }
        } else if (
          status === "CLOSED" ||
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          msgSubDroppedRef.current = true;
        }
      });

    return () => {
      chatLoadGenerationRef.current += 1;
      unsubFastPath();
      clearActiveChatId();
      supabase.removeChannel(msgSub);
    };
  }, [id, isDraft, realChatId, loadChatInfo, loadMessages, isNotificationsChat]);

  // Channel membership changes update the bottom bar directly. This keeps
  // Join/Mute state live without refreshing the chat list or reloading messages.
  useEffect(() => {
    const isChannelChat = chatInfo?.is_channel || isChannel === "true";
    if (!user || !id || !isChannelChat) return;

    const topic = `channel-membership:${id}:${user.id}`;
    const staleChannel = supabase.getChannels().find((ch) => ch.topic === `realtime:${topic}`);
    if (staleChannel) supabase.removeChannel(staleChannel);

    const membershipSub = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "channel_subscriptions", filter: `channel_id=eq.${id}` },
        (payload: any) => {
          if (payload.new?.user_id !== user.id) return;
          setChatInfo((prev) => prev ? {
            ...prev,
            channel_is_member: true,
            channel_role: prev.channel_role ?? "member",
            channel_subscriber_count: prev.channel_subscriber_count == null || prev.channel_is_member
              ? prev.channel_subscriber_count
              : prev.channel_subscriber_count + 1,
          } : prev);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "channel_subscriptions", filter: `channel_id=eq.${id}` },
        (payload: any) => {
          if (payload.old?.user_id !== user.id) return;
          setChatInfo((prev) => {
            if (!prev) return prev;
            const isOwner = prev.channel_role === "owner" || prev.channel_owner_id === user.id;
            const wasMember = prev.channel_is_member === true;
            return {
              ...prev,
              channel_is_member: isOwner,
              channel_role: isOwner ? "owner" : undefined,
              channel_subscriber_count: wasMember && prev.channel_subscriber_count != null
                ? Math.max(0, prev.channel_subscriber_count - 1)
                : prev.channel_subscriber_count,
            };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(membershipSub);
    };
  }, [user, id, isChannel, chatInfo?.is_channel]);

  // ── Realtime: typing indicators + read receipts (user-scoped for DMs) ─────
  useEffect(() => {
    if (!user || !id || isLocalNotesId(id) || isNotificationsChat) return;
    const isDM = !!chatInfo && !chatInfo.is_group && !chatInfo.is_channel && !!chatInfo.other_id;
    const otherId = chatInfo?.other_id;

    const handleTypingEvent = (payload: any) => {
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
    };

    const handleDeliveredEvent = (payload: any) => {
      const { reader_id, message_ids, delivered_at: rawDeliveredAt } = (payload.payload || {}) as { reader_id: string; message_ids: string[]; delivered_at?: string };
      if (!reader_id || reader_id === user?.id || !Array.isArray(message_ids)) return;
      const deliveredSet = new Set(message_ids);
      const deliveredAt = rawDeliveredAt || new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) =>
          // Only upgrade "sent" → "delivered"; never downgrade from "read"
          m.sender_id === user?.id && deliveredSet.has(m.id) && m.status === "sent"
            ? { ...m, status: "delivered" as const, delivered_at: deliveredAt }
            : m
        )
      );
    };

    const handleReadEvent = (payload: any) => {
      const { reader_id, message_ids, read_at: rawReadAt } = (payload.payload || {}) as { reader_id: string; message_ids: string[]; read_at?: string };
      if (!reader_id || reader_id === user?.id || !Array.isArray(message_ids)) return;
      const readSet = new Set(message_ids);
      const readAt = rawReadAt || new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) =>
          m.sender_id === user?.id && readSet.has(m.id)
            ? { ...m, status: "read" as const, read_at: readAt }
            : m
        )
      );
      void Promise.all(message_ids.map((messageId) => markMessageRead(messageId)));
    };

    let receiveChannel: ReturnType<typeof supabase.channel>;
    let sendChannel: ReturnType<typeof supabase.channel> | null = null;

    if (isDM && otherId) {
      receiveChannel = supabase.channel(`user-typing-${user.id}`, { config: { broadcast: { self: false } } });
      receiveChannel
        .on("broadcast", { event: "typing" }, (payload: any) => {
          if ((payload.payload?.chat_id ?? id) !== id) return;
          handleTypingEvent(payload);
        })
        .on("broadcast", { event: "delivered" }, (payload: any) => {
          if ((payload.payload?.chat_id ?? id) !== id) return;
          handleDeliveredEvent(payload);
        })
        .on("broadcast", { event: "read" }, (payload: any) => {
          if ((payload.payload?.chat_id ?? id) !== id) return;
          handleReadEvent(payload);
        })
        .subscribe();
      sendChannel = supabase.channel(`user-typing-${otherId}`, { config: { broadcast: { self: false } } });
      sendChannel.subscribe();
      typingChannelRef.current = sendChannel;
    } else {
      receiveChannel = supabase.channel(`typing:${id}`, { config: { broadcast: { self: false } } });
      receiveChannel
        .on("broadcast", { event: "typing" }, handleTypingEvent)
        .on("broadcast", { event: "delivered" }, handleDeliveredEvent)
        .on("broadcast", { event: "read" }, handleReadEvent)
        .subscribe();
      typingChannelRef.current = receiveChannel;
    }

    return () => {
      supabase.removeChannel(receiveChannel);
      if (sendChannel) supabase.removeChannel(sendChannel);
      typingChannelRef.current = null;
      typingTimersRef.current.forEach((t) => clearTimeout(t));
      typingTimersRef.current.clear();
      typingMapRef.current.clear();
    };
  }, [
    user,
    id,
    chatInfo?.other_id,
    chatInfo?.is_group,
    chatInfo?.is_channel,
    chatPrefs.read_receipts,
    isNotificationsChat,
  ]);

  // ── Realtime: message_status DB changes → update sender's tick colour ────────
  // Handles the "recipient was offline when message was sent, then comes back
  // online later" case — broadcasts are ephemeral and can't bridge that gap.
  // We subscribe without a row filter (no IN support in Supabase realtime)
  // and do a lightweight client-side check inside setMessages.
  useEffect(() => {
    if (!user || !id || isLocalNotes || isNotificationsChat) return;
    // Evict stale channel — double-tap can mount this effect twice for the same
    // chat before the first cleanup fires, leaving an already-subscribed channel.
    const _staleStatus = supabase.getChannels().find(
      (ch) => ch.topic === `realtime:msg-status-watch:${id}:${user.id}`
    );
    if (_staleStatus) supabase.removeChannel(_staleStatus);
    const statusSub = supabase
      .channel(`msg-status-watch:${id}:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_status" },
        (payload: any) => {
          const { message_id, user_id: actorId, delivered_at, read_at } = payload.new || {};
          if (!message_id || actorId === user.id) return; // ignore my own receipts
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== message_id || m.sender_id !== user.id) return m;
              const nextStatus: Message["status"] = read_at ? "read" : delivered_at ? "delivered" : m.status;
              if (nextStatus === m.status) return m;
              return { ...m, status: nextStatus, delivered_at: delivered_at || m.delivered_at, read_at: read_at || m.read_at };
            })
          );
          if (read_at) void markMessageRead(message_id);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "message_status" },
        (payload: any) => {
          const { message_id, user_id: actorId, delivered_at, read_at } = payload.new || {};
          if (!message_id || actorId === user.id) return;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== message_id || m.sender_id !== user.id) return m;
              const nextStatus: Message["status"] = read_at ? "read" : delivered_at ? "delivered" : m.status;
              if (nextStatus === m.status) return m;
              return { ...m, status: nextStatus, delivered_at: delivered_at || m.delivered_at, read_at: read_at || m.read_at };
            })
          );
          if (read_at) void markMessageRead(message_id);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(statusSub); };
  }, [user, id, isLocalNotes, isNotificationsChat]);

  // ── Realtime: online status (1-on-1 chats only) ───────────────────────────
  useEffect(() => {
    const otherId = chatInfo?.other_id;
    if (!otherId || chatInfo?.is_group || chatInfo?.is_channel || isDraft || isLocalNotesId(id) || isNotificationsChat) return;

    const _stalePresence = supabase.getChannels().find(
      (ch) => ch.topic === `realtime:presence-watch:${id}:${otherId}`
    );
    if (_stalePresence) supabase.removeChannel(_stalePresence);

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
  }, [chatInfo?.other_id, chatInfo?.is_group, chatInfo?.is_channel, id, isDraft, isNotificationsChat]);

  function handleTyping() {
    if (!user || !id || isDraft || isLocalNotesId(id)) return;
    if (!chatPrefs.typing_indicators) return;
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    const isDM = !!chatInfo && !chatInfo.is_group && !chatInfo.is_channel;
    const basePayload: Record<string, any> = { user_id: user.id, display_name: profile?.display_name || "Someone", is_typing: true };
    if (isDM) basePayload.chat_id = id;
    typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: basePayload });
    typingTimeout.current = setTimeout(() => {
      typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { ...basePayload, is_typing: false } });
    }, 3000);
  }

  function saveDraft(text: string) {
    if (!id) return;
    const notesChat = isLocalNotesId(id);
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      const key = `chat_draft_${id}`;
      if (!text.trim()) {
        // Always clear — even if the offline_drafts feature flag is off —
        // so an empty input never shows as a draft in the chats list.
        AsyncStorage.removeItem(key).catch(() => {});
        if (user && !notesChat) {
          supabase.from("chat_drafts")
            .delete().eq("user_id", user.id).eq("chat_id", id)
            .then(() => {});
        }
        return;
      }
      if (!advancedFeatures.offline_drafts && !notesChat) return;
      // Write to AsyncStorage immediately so the chats list can reflect the
      // draft on the next focus without waiting for Supabase.
      AsyncStorage.setItem(key, text).catch(() => {});
      if (user && !notesChat) {
        supabase.from("chat_drafts")
          .upsert(
            { user_id: user.id, chat_id: id, content: text, updated_at: new Date().toISOString() },
            { onConflict: "user_id,chat_id" }
          )
          .then(() => {});
      }
    }, 800);
  }

  useEffect(() => {
    if (!id) return;
    if (user && !isLocalNotesId(id)) {
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

  // Incoming shares open the normal composer with the media ready for review.
  // The user still controls the final upload by tapping Send.
  useEffect(() => {
    if (sharedFilesJson && !sharedImageInjectedRef.current) {
      try {
        const parsed = JSON.parse(sharedFilesJson as string);
        if (Array.isArray(parsed)) {
          const files = parsed
            .filter((file) => file?.path)
            .slice(0, 6)
            .map((file) => {
              const mimeType = String(file.mimeType || "application/octet-stream");
              return {
                uri: String(file.path),
                type: mimeType.startsWith("image/")
                  ? "image"
                  : mimeType.startsWith("video/")
                    ? "video"
                    : "file",
                name: file.name ? String(file.name) : "Shared file",
                mimeType,
              };
            });
          if (files.length > 0) {
            sharedImageInjectedRef.current = true;
            setSelectedImages(files);
            return;
          }
        }
      } catch {}
    }
    if ((!sharedImageUri && !sharedImageUris) || sharedImageInjectedRef.current) return;
    sharedImageInjectedRef.current = true;
    let uris: string[] = [];
    try {
      if (sharedImageUris) {
        const parsed = JSON.parse(sharedImageUris as string);
        if (Array.isArray(parsed)) uris = parsed.filter((uri) => typeof uri === "string");
      }
    } catch {}
    if (uris.length === 0 && sharedImageUri) {
      uris = [decodeURIComponent(sharedImageUri as string)];
    }
    setSelectedImages(uris.slice(0, 6).map((uri) => ({
      uri,
      type: "image",
      mimeType: "image/jpeg",
    })));
  }, [sharedImageUri, sharedImageUris, sharedFilesJson]);

  useEffect(() => {
    if (!sharedFileUri || sharedImageUri || sharedImageUris || sharedFilesJson || sharedImageInjectedRef.current) return;
    sharedImageInjectedRef.current = true;
    const mimeType = decodeURIComponent((sharedFileType as string) || "application/octet-stream");
    const isVideo = mimeType.startsWith("video/");
    setAttachmentPreview({
      uri: decodeURIComponent(sharedFileUri as string),
      type: isVideo ? "video" : "file",
      name: sharedFileName ? decodeURIComponent(sharedFileName as string) : "Shared file",
      mimeType,
    });
  }, [sharedFileUri, sharedFileType, sharedFileName, sharedImageUri, sharedImageUris]);

  // Auto-send a pre-filled message (e.g. from AI Lens "Ask AfuAI" button).
  // Fires once after the chat finishes loading and only for AfuAI direct chats.
  useEffect(() => {
    if (!initialMessage || !user || loading || autoSentInitialRef.current) return;
    if (chatInfo?.other_id !== AFUAI_BOT_ID) return;
    autoSentInitialRef.current = true;
    const t = setTimeout(() => {
      sendMessage(decodeURIComponent(initialMessage as string));
    }, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, chatInfo?.other_id, initialMessage]);

  // AI Lens → Chat: show a rich LensContextCard message, then trigger an
  // AfuAI response that dives deep into the scanned subject.
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
        // Persist in ref so every subsequent AI reply keeps the lens context
        lensContextRef.current = ctx;
        const cardMsg: Message = {
          id: `lens_card_${Date.now()}`,
          chat_id: id as string,
          sender_id: AFUAI_BOT_ID,
          encrypted_content: ctx.title,
          sent_at: new Date(0).toISOString(),
          sender: { display_name: "AfuAI", avatar_url: null, handle: "afuai" },
          reactions: [],
          _isAi: true,
          _isLensCard: true,
          _lensData: ctx,
        };
        // Keep the lens card in its own state so it's never wiped by
        // any setMessages call (SQLite preload, network merge, realtime, etc.)
        setLensCardMsg({ ...cardMsg, sent_at: new Date().toISOString() });
        // Immediately generate a rich AfuAI response about the scanned item
        setTimeout(() => handleAfuAiLensIntro(ctx, id as string), 0);
      } catch {}
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, chatInfo?.other_id, lensIntro]);

  async function handleAfuAiLensIntro(ctx: NonNullable<typeof lensContextRef.current>, chatId: string) {
    setIsAfuAiTyping(true);

    const contextLines = [
      `Title: ${ctx.title}`,
      `Category: ${ctx.category}`,
      `Description: ${ctx.description}`,
      ctx.facts?.length ? `Key facts: ${ctx.facts.join("; ")}` : null,
      ctx.answer ? `Initial lens analysis: ${ctx.answer}` : null,
      ctx.history?.length
        ? `Questions the user already asked in the Lab session:\n${ctx.history.map(h => `  Q: ${h.q}\n  A: ${h.a}`).join("\n")}`
        : null,
    ].filter(Boolean).join("\n");

    try {
      const rawReply = (await requestAfuAiReply([
        {
          role: "system",
          content: `You are AfuAI. The user scanned something with AI Lens and has brought the result into this conversation. Give a rich, expert, engaging introduction to the subject. Be informative, warm and enthusiastic. Highlight the most interesting aspects. End by inviting the user to ask more. Use up to 3 [SUGGEST:...] tags for great follow-up questions.`,
        },
        {
          role: "user",
          content: `I scanned this with AfuChat AI Lens:\n\n${contextLines}\n\nGive me a detailed, expert breakdown with the most fascinating details.`,
        },
      ], 600)) || "I've reviewed your scan. What would you like to know?";
      const parsed = parseAfuAiTags(rawReply);
      setMessages(prev => [{
        id: `afuai_lens_${Date.now()}`,
        chat_id: chatId,
        sender_id: AFUAI_BOT_ID,
        encrypted_content: parsed.text || rawReply,
        sent_at: new Date().toISOString(),
        sender: { display_name: "AfuAI", avatar_url: null, handle: "afuai" },
        reactions: [],
        _isAi: true,
        _aiSuggestions: parsed.suggestions.length > 0 ? parsed.suggestions : [
          `Tell me more about ${ctx.title}`,
          `What are the main uses of ${ctx.title}?`,
          `Any interesting history or origin?`,
        ],
      }, ...prev]);
      // Do not keep the visible reply waiting on persistence.
      void supabase.rpc("insert_afuai_message", { p_chat_id: chatId, p_content: rawReply }).then(undefined, () => {});
    } catch {
      setMessages(prev => [{
        id: `afuai_lens_err_${Date.now()}`,
        chat_id: chatId,
        sender_id: AFUAI_BOT_ID,
        encrypted_content: "I couldn't analyse that right now. Please try again.",
        sent_at: new Date().toISOString(),
        sender: { display_name: "AfuAI", avatar_url: null, handle: "afuai" },
        reactions: [],
        _isAi: true,
      }, ...prev]);
    } finally {
      setIsAfuAiTyping(false);
    }
  }

  function handleSmartReply(text: string) {
    if (chatPrefs.send_haptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
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
      const afuId = profile.id ? String(parseInt(profile.id.replace(/-/g, "").slice(0, 8), 16) % 100000000).padStart(8, "0") : "00000000";
      return `USER CONTEXT:\n- Name: ${profile.display_name}\n- Handle: @${profile.handle}\n- AfuID: ${afuId}\n- Profile URL: https://afuchat.com/id/${afuId}\n- Nexa (XP): ${profile.xp || 0}\n- ACoin: ${profile.acoin || 0}\n- Grade: ${profile.current_grade || "Newcomer"}\n- Followers: ${followersCount || 0}, Following: ${followingCount || 0}, Posts: ${postsCount || 0}\n- Premium: ${premium}\nRECENT TRANSACTIONS:\n${txLines.join("\n") || "  None"}`;
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
        const { error: dedErr } = await supabase.rpc("deduct_acoin", { p_user_id: user.id, p_amount: p.acoin_price }).maybeSingle();
        if (dedErr) return { success: false, message: "Could not deduct ACoin" };
        const exp = new Date(); exp.setDate(exp.getDate() + p.duration_days);
        const { error: subErr } = await supabase.from("user_subscriptions").upsert({ user_id: user.id, plan_id: p.id, started_at: new Date().toISOString(), expires_at: exp.toISOString(), is_active: true, acoin_paid: p.acoin_price }, { onConflict: "user_id" });
        if (subErr) {
          try {
            await supabase.rpc("credit_acoin", { p_user_id: user.id, p_amount: p.acoin_price });
          } catch {}
          return { success: false, message: "Could not activate subscription. ACoin was refunded." };
        }
        const { error: txErr } = await supabase.from("acoin_transactions").insert({ user_id: user.id, amount: -p.acoin_price, transaction_type: "subscription", metadata: { plan_name: p.name, plan_tier: p.tier, duration_days: p.duration_days } });
        if (txErr) {
          // Entitlement is already active, so do not claim the purchase failed.
          // The missing ledger row can be repaired by the server/admin audit.
        }
        return { success: true, message: `Subscribed to ${p.name}! Active for ${p.duration_days} days.`, invoice: { type: "Premium Subscription", date: new Date().toISOString(), amount: p.acoin_price, currency: "ACoin", reference: `SUB-${Date.now().toString(36).toUpperCase()}`, status: "Completed", description: `${p.name}. ${p.duration_days} days` } };
      }
      case "cancel_subscription": {
        const { error } = await supabase.rpc("cancel_my_subscription");
        if (error) return { success: false, message: error.message };
        return { success: true, message: "Subscription cancelled. You're now on the free plan." };
      }
      case "convert_nexa": {
        return { success: false, message: "Nexa conversion is temporarily unavailable while we move it to a server-side transaction." };
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
    if (isLocalNotesId(chatId)) {
      setMuteUntil(undefined);
      AsyncStorage.getItem(`afu_disappearing_${chatId}`).then((v) => setDisappearingEnabled(v === "1")).catch(() => {});
      AsyncStorage.getItem(`afu_disappearing_timer_${chatId}`).then((v) => { if (v) setDisappearingTimer(parseInt(v, 10)); }).catch(() => {});
      return;
    }
    supabase.from("chat_mutes").select("muted_until").eq("user_id", user.id).eq("chat_id", chatId).maybeSingle()
      .then(({ data }) => {
        if (!data) { setMuteUntil(undefined); return; }
        setMuteUntil(data.muted_until ?? null);
      }, () => {});
    AsyncStorage.getItem(`afu_disappearing_${chatId}`).then((v) => setDisappearingEnabled(v === "1")).catch(() => {});
    AsyncStorage.getItem(`afu_disappearing_timer_${chatId}`).then((v) => { if (v) setDisappearingTimer(parseInt(v, 10)); }).catch(() => {});
    if (chatInfo?.other_id && !chatInfo.is_group && !chatInfo.is_channel) {
      supabase.from("blocks").select("id").eq("blocker_id", user.id).eq("blocked_id", chatInfo.other_id).maybeSingle()
        .then(({ data }: any) => setIsBlocked(!!data), () => {});
    }
  }, [id, realChatId, isDraft, user?.id, chatInfo?.other_id]);

  useEffect(() => {
    if (!chatInfo || chatInfo.is_group || chatInfo.is_channel) return;
    if (!advancedFeatures.temp_chat_enabled) return;
    const chatId = isDraft ? realChatId : id;
    if (!chatId || disappearingEnabled) return;
    const secs = (advancedFeatures.temp_chat_default_minutes || 60) * 60;
    setDisappearingEnabled(true);
    setDisappearingTimer(secs);
    AsyncStorage.setItem(`afu_disappearing_${chatId}`, "1").catch(() => {});
    AsyncStorage.setItem(`afu_disappearing_timer_${chatId}`, String(secs)).catch(() => {});
  }, [advancedFeatures.temp_chat_enabled, chatInfo?.is_group, chatInfo?.is_channel]);

  async function handleMuteChat(hours: number | null) {
    const chatId = isDraft ? realChatId : id;
    if (!chatId || !user) return;
    if (isLocalNotesId(chatId)) return;
    const muteUntilVal = hours === null ? null : new Date(Date.now() + hours * 3600_000).toISOString();
    setMuteUntil(muteUntilVal);
    setShowMutePicker(false);
    await supabase.from("chat_mutes").upsert(
      { user_id: user.id, chat_id: chatId, muted_until: muteUntilVal, created_at: new Date().toISOString() },
      { onConflict: "user_id,chat_id" },
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleUnmuteChat() {
    const chatId = isDraft ? realChatId : id;
    if (!chatId || !user) return;
    if (isLocalNotesId(chatId)) return;
    setMuteUntil(undefined);
    setShowMutePicker(false);
    await supabase.from("chat_mutes").delete().eq("user_id", user.id).eq("chat_id", chatId);
    Haptics.selectionAsync();
  }

  function muteLabel(): string {
    if (!isMuted || muteUntil === undefined) return "";
    if (muteUntil === null) return "Muted forever";
    const diff = new Date(muteUntil).getTime() - Date.now();
    if (diff <= 0) return "";
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h >= 24 * 6) return `Muted for ${Math.floor(h / 24)}d`;
    if (h > 0) return `Muted for ${h}h ${m}m`;
    return `Muted for ${m}m`;
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
    if (isLocalNotesId(id)) return;
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
    if (isLocalNotesId(id)) return;
    showAlert("Report User", `Why are you reporting ${headerTitle}?`, [
      { text: "Spam", onPress: async () => { try { await supabase.from("user_reports").insert({ reporter_id: user.id, reported_id: chatInfo.other_id, reason: "spam" }); setShowChatOptions(false); showAlert("Reported", "Thank you. We'll review this report."); } catch (_) {} } },
      { text: "Harassment", onPress: async () => { try { await supabase.from("user_reports").insert({ reporter_id: user.id, reported_id: chatInfo.other_id, reason: "harassment" }); setShowChatOptions(false); showAlert("Reported", "Thank you. We'll review this report."); } catch (_) {} } },
      { text: "Inappropriate Content", onPress: async () => { try { await supabase.from("user_reports").insert({ reporter_id: user.id, reported_id: chatInfo.other_id, reason: "inappropriate" }); setShowChatOptions(false); showAlert("Reported", "Thank you. We'll review this report."); } catch (_) {} } },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function handleClearChatMessages() {
    const chatId = isDraft ? realChatId : id;
    if (!chatId || !user) return;
    const isGroupOrChannel = chatInfo?.is_group || chatInfo?.is_channel;
    const subtitle = isGroupOrChannel
          ? "This clears the chat for you only. Other members won't be affected. This cannot be undone."
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
            await deleteAllLocalMessages(chatId);
            if (isLocalNotesId(chatId)) {
              await clearLocalNotesMessages(user.id);
            }
            if (chatInfo?.other_id === AFUAI_BOT_ID) {
              try { await supabase.rpc("clear_afuai_chat", { p_chat_id: chatId }); } catch {}
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
    const isChannelChat = !!chatInfo?.is_channel;
    showAlert(
      isChannelChat ? "Leave Channel" : isGroup ? "Leave Group" : "Delete Chat",
      isGroup
        ? `Leave this ${chatInfo?.is_channel ? "channel" : "group"}? You won't receive messages anymore.`
        : "Delete this conversation? All messages will be removed for you.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isChannelChat ? "Leave Channel" : isGroup ? "Leave" : "Delete",
          style: "destructive",
          onPress: async () => {
            setShowChatOptions(false);
            try {
              if (isLocalNotes) {
                await removeLocalNotesConversation(user.id);
              } else if (isGroup) {
                const { error: memberError } = await supabase
                  .from("chat_members")
                  .delete()
                  .eq("chat_id", chatId)
                  .eq("user_id", user.id);
                if (memberError) throw memberError;
                if (isChannelChat) {
                  const { error: subscriptionError } = await supabase
                    .from("channel_subscriptions")
                    .delete()
                    .eq("channel_id", chatId)
                    .eq("user_id", user.id);
                  if (subscriptionError) throw subscriptionError;
                }
              } else {
                await supabase.from("messages").delete().eq("chat_id", chatId);
                await supabase.from("chats").delete().eq("id", chatId);
              }
              if (router.canGoBack()) router.back(); else router.replace("/(tabs)/chats" as any);
            } catch {
              showAlert("Error", "Could not complete this action. Please try again.");
            }
          },
        },
      ]
    );
  }

  // ── Invite Link helpers ───────────────────────────────────────────────────

  // Memoised so the JSX render path never throws during React's render phase
  // even in dev mode where concurrent-renderer error boundaries can re-throw
  // caught exceptions.  Event handlers (copy / share) also use this value.
  const inviteLink = useMemo((): string => {
    const chatId = isDraft ? realChatId : id;
    if (!chatId) return "";
    try {
      return generateGroupInviteLink(String(chatId));
    } catch {
      return "";
    }
  }, [isDraft, realChatId, id]);

  function getInviteLink(): string { return inviteLink; }

  async function handleCopyInviteLink() {
    const link = getInviteLink();
    if (!link) return;
    try {
      await Clipboard.setStringAsync(link);
      Haptics.selectionAsync();
      setInviteLinkCopied(true);
      if (inviteCopiedTimer.current) clearTimeout(inviteCopiedTimer.current);
      inviteCopiedTimer.current = setTimeout(() => setInviteLinkCopied(false), 2500);
    } catch {}
  }

  async function handleShareInviteLink() {
    const link = getInviteLink();
    if (!link) return;
    try {
      await Share.share({
        title:   `Join ${chatInfo?.name ?? "our group"} on AfuChat`,
        message: `Join ${chatInfo?.name ?? "our group"} on AfuChat: ${link}`,
        url:     link,
      });
    } catch {}
  }

  // ── Add Members handlers ──────────────────────────────────────────────────

  async function handleOpenAddMembers() {
    const chatId = isDraft ? realChatId : id;
    if (!chatId) return;
    const { data } = await supabase.from("chat_members").select("user_id").eq("chat_id", chatId);
    setExistingMemberIds(new Set((data || []).map((m: any) => m.user_id)));
    setAddMemberSearch("");
    setAddMemberResults([]);
    setAddMemberSelected(new Set());
    setShowAddMembers(true);
  }

  async function searchUsersToAdd(q: string) {
    setAddMemberSearch(q);
    if (!q.trim()) { setAddMemberResults([]); return; }
    setAddMemberLoading(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, is_verified")
        .or(`display_name.ilike.%${q}%,handle.ilike.%${q}%`)
        .neq("id", user?.id || "")
        .limit(25);
      setAddMemberResults((data || []).filter((u: any) => !existingMemberIds.has(u.id)));
    } finally {
      setAddMemberLoading(false);
    }
  }

  async function handleConfirmAddMembers() {
    const chatId = isDraft ? realChatId : id;
    if (!chatId || addMemberSelected.size === 0 || addMemberAdding) return;
    setAddMemberAdding(true);
    try {
      const uids = Array.from(addMemberSelected);
      const { data: rpcResult, error } = await supabase.rpc("add_group_members", {
        p_chat_id: chatId,
        p_user_ids: uids,
      });
      if (error) throw error;
      if (rpcResult && !rpcResult.ok) {
        throw new Error(
          rpcResult.error === "not_admin"
            ? "Only group admins can add members."
            : rpcResult.error === "not_a_group"
            ? "This is not a group chat."
            : "Failed to add members."
        );
      }
      globalShowToast(`Added ${uids.length} member${uids.length > 1 ? "s" : ""}`, { type: "success", icon: "people" });
      setShowAddMembers(false);
    } catch (e: any) {
      showAlert("Error", e?.message || "Failed to add members. They may already be in the group.");
    } finally {
      setAddMemberAdding(false);
    }
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
      const systemPrompt = `You are AfuAI, the official AI assistant of AfuChat — a social super-app from Uganda. You focus entirely on the AfuChat platform: helping users navigate features, understand how things work, manage their account, connect with others, and get the most out of the app. You can also help with general topics like writing, research, advice, and creative tasks.

You do NOT assist with coding, programming, or software development. If asked about code, politely say you are focused on AfuChat and general assistance, and suggest a dedicated coding tool instead.

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
  · subscribe: {"tier":"silver"} — Silver · 500 ACoin (~$5) · 30 days · 50 AI msgs/day, verified badge, ad-free
  · subscribe: {"tier":"gold"} — Gold · 1200 ACoin (~$12) · 30 days · 200 AI msgs/day, creator tools, priority discover
  · subscribe: {"tier":"platinum"} — Platinum · 2500 ACoin (~$25) · 30 days · Unlimited AI, elite social, all perks
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

RESPONSE QUALITY RULES:
- BREVITY FIRST — match length to complexity:
  · Greeting / small talk → 1 sentence max.
  · Simple question → 1-2 sentences, direct answer only.
  · Factual / how-to → max 5 short bullets or steps, no prose padding.
  · Complex / technical → use headers + short bullets. Still concise.
- HARD LIMITS: 150 words for most answers. Never exceed 250 words unless writing code or a document.
- NEVER pad. If the answer is one line, write one line.
- NEVER start with "Great question!", "Absolutely!", "Of course!", "Certainly!" — start with the answer.
- LISTS MUST USE LINE BREAKS — each bullet/numbered item on its OWN line. Never write "1. A 2. B 3. C" on a single line.
- PER LIST ITEM: one short phrase or one sentence max (≤ 15 words). Do NOT explain each item in depth.
- Use formatting (bold, bullets, headers) only for structured content. Plain prose for casual chat.
- Tone: sharp, warm, direct. Like a brilliant friend — not a textbook.
- PROACTIVE HELP: one short follow-up suggestion max, only when clearly useful.

STRICT RULES:
- NEVER write raw route paths in your text body. If navigation is needed, use [ACTION:...] tags only.
- When the user asks "how do I [feature]" or "where is [feature]", give clear step-by-step guidance AND add an [ACTION:...] button to navigate there directly.
- When the user asks about a specific person by name or @handle, always add a [ACTION:View @handle:/@handle] button AND a [ACTION:Search for handle:/search?q=handle] button.
- Only emit [EXEC:...] tags when the user explicitly requests an action. Never act without clear intent.
- [SUGGEST:...] tags should offer meaningful next steps, not repeat the same question.
- Never be dismissive, preachy, or overly promotional.`;

      let lensAddition = "";
      const lensCtx = lensContextRef.current;
      if (lensCtx) {
        lensAddition =
          `\n\n[AI LENS CONTEXT — active for this conversation]\n` +
          `The user scanned something with AI Lens. Use this context for all answers about the subject:\n` +
          `Title: ${lensCtx.title}\n` +
          `Category: ${lensCtx.category}\n` +
          `Description: ${lensCtx.description}` +
          (lensCtx.facts?.length ? `\nKey facts:\n${lensCtx.facts.map(f => `• ${f}`).join("\n")}` : "") +
          (lensCtx.answer ? `\nInitial analysis: ${lensCtx.answer}` : "") +
          (lensCtx.history?.length
            ? `\nPrevious Q&A from Lab:\n${lensCtx.history.map(h => `  Q: ${h.q}\n  A: ${h.a}`).join("\n")}`
            : "") +
          `\n\nBe specific, expert and genuinely helpful. The user may ask multiple questions about this item.`;
      }

      const conversationMessages = currentMessages
        .filter(m => !m._pending && m.encrypted_content)
        .slice(0, 10)
        .reverse()
        .map(m => ({ role: m.sender_id === user?.id ? "user" as const : "assistant" as const, content: m.encrypted_content }));
      conversationMessages.push({ role: "user", content: userText.replace(/@afuai/gi, "").trim() || userText });

      const rawReply = (await requestAfuAiReply([
        { role: "system", content: systemPrompt + lensAddition },
        ...conversationMessages,
      ], 500)) || "Sorry, I couldn't process that. Please try again.";
      const parsed = parseAfuAiTags(rawReply);
      const cleanText = parsed.text || rawReply;
      const sentAt = new Date().toISOString();

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
        id: `afuai_${Date.now()}`,
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
      // Persistence is intentionally not on the critical path for rendering.
      void supabase.rpc("insert_afuai_message", {
        p_chat_id: chatId,
        p_content: rawReply,
      }).then(undefined, () => {});
    } catch {
      setMessages((prev) => [{
        id: `afuai_err_${Date.now()}`,
        chat_id: chatId,
        sender_id: AFUAI_BOT_ID,
        encrypted_content: "Sorry, I couldn't respond right now. Please try again.",
        sent_at: new Date().toISOString(),
        sender: { display_name: "AfuAI", avatar_url: null, handle: "afuai" },
        reactions: [],
        _isAi: true,
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
    if (isLocalNotes) return;
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
    if (isLocalNotes) return;
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

  async function handleViewEditHistory(msg: Message) {
    if (isLocalNotes) return;
    setEditHistoryMsg(msg);
    setEditHistoryLoading(true);
    setShowReactions(null);
    const { data } = await supabase
      .from("message_edit_history")
      .select("id, previous_content, edited_at")
      .eq("message_id", msg.id)
      .order("edited_at", { ascending: false });
    setEditHistoryItems(data ?? []);
    setEditHistoryLoading(false);
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
    if (isLocalNotes) {
      const editedAt = new Date().toISOString();
      await updateLocalNotesMessage(user.id, editingMessage.id, text);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editingMessage.id
            ? { ...m, encrypted_content: text, edited_at: editedAt }
            : m,
        ),
      );
      setEditingMessage(null);
      setInput("");
      setSending(false);
      return;
    }
    await supabase.from("message_edit_history").insert({
      message_id: editingMessage.id,
      edited_by: user.id,
      previous_content: editingMessage.encrypted_content,
      edited_at: new Date().toISOString(),
    });
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
          if (isLocalNotes) {
            await deleteLocalNotesMessage(user?.id || "", msg.id);
            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            globalShowToast("Message deleted", { type: "info", icon: "trash" });
            return;
          }
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
            globalShowToast("Message deleted", { type: "info", icon: "trash" });
          }
        },
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  async function handleStarMessage(msg: Message) {
    if (!user || isLocalNotes) return;
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
    if (!translateMsg || translatingLang || isLocalNotes) return;
    setTranslatingLang(true);
    setAiResultType("translate");
    setAiResult(null);
    try {
      const result = await translateUserContent(translateMsg.encrypted_content, langCode);
      setAiResult(result);
    } catch {
      setAiResult("Could not translate. Please try again.");
    } finally {
      setTranslatingLang(false);
    }
  }

  async function fetchMentionSuggestions(query: string) {
    if (!chatInfo) return;
    const memberIds = chatInfo.member_ids || (chatInfo.other_id ? [chatInfo.other_id] : []);
    if (memberIds.length === 0) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url")
        .in("id", memberIds)
        .ilike("handle", `${query}%`)
        .limit(6);
      setMentionSuggestions(data || []);
    } catch {}
  }

  async function handleChatSummaryFull() {
    if (isLocalNotes || (!chatInfo?.is_group && !chatInfo?.is_channel)) return;
    setShowChatOptions(false);
    const recent = [...messages].slice(0, 30).reverse();
    const usable = recent.filter(
      (m) =>
        m.encrypted_content &&
        !m.encrypted_content.startsWith("🎁") &&
        !m.encrypted_content.startsWith("🧧") &&
        !["📷 Photo", "🎥 Video", "GIF"].includes(m.encrypted_content)
    );
    if (usable.length < 3) {
      showAlert("Too few messages", "There aren't enough text messages to summarize yet.");
      return;
    }
    const formatted = usable
      .map((m) => `${m.sender?.display_name || "User"}: ${m.encrypted_content}`)
      .join("\n");
    try {
      const result = await askAi(
        `Summarize this conversation in 3-5 bullet points. Focus on the key topics and what was agreed:\n\n${formatted}`,
        "You are a concise chat summarizer. Return ONLY bullet points, no intro or outro.",
        { fast: true, maxTokens: 250 }
      );
      showAlert("Chat Summary", result);
    } catch {
      showAlert("Error", "Could not summarize the chat. Please try again.");
    }
  }

  async function handleExportChat() {
    setShowChatOptions(false);
    const fmt = advancedFeatures.chat_export_format || "txt";
    const sorted = [...messages].reverse();
    if (sorted.length === 0) {
      showAlert("Nothing to export", "This chat has no messages yet.");
      return;
    }
    try {
      const { Share } = await import("react-native");
      const lines = sorted
        .map(
          (m) =>
            `[${m.sent_at ? new Date(m.sent_at).toLocaleString() : ""}] ${m.sender?.display_name || "Unknown"}: ${m.encrypted_content || `[${m.attachment_type || "attachment"}]`}`
        )
        .join("\n");
      await Share.share({ message: lines, title: `Chat with ${headerTitle}` });
    } catch {}
  }

  async function openForward(msg: Message) {
    if (isLocalNotes) return;
    setForwardMsg(msg);
    const { data } = await supabase
      .from("chats")
      .select(`
        id, name, avatar_url,
        chat_members!inner(user_id),
        all_members:chat_members(user_id, profiles(display_name, avatar_url))
      `)
      .eq("chat_members.user_id", user?.id || "")
      .order("updated_at", { ascending: false })
      .limit(30);
    const uid = user?.id || "";
    const mapped = (data || []).map((c: any) => {
      if (c.name) {
        return { id: c.id, name: c.name, avatar: c.avatar_url || null };
      }
      // For DM chats (no name), find the OTHER member's profile
      const other = (c.all_members || []).find((m: any) => m.user_id !== uid);
      return {
        id: c.id,
        name: other?.profiles?.display_name || "Chat",
        avatar: other?.profiles?.avatar_url || null,
      };
    });
    setForwardChats(mapped);
  }

  async function sendForward(targetChatId: string) {
    if (!forwardMsg || !user) return;
    setForwardSending(true);

    // Build the forwarded content.  For lens cards we serialise the full
    // analysis data so the recipient sees the complete scan result, not just
    // the title.
    let content: string;
    if (forwardMsg._isLensCard && forwardMsg._lensData) {
      const d = forwardMsg._lensData;
      const parts: string[] = [`📷 AI Lens: ${d.title}`];
      if (d.description) parts.push(d.description);
      if (d.answer) parts.push(`Analysis: ${d.answer}`);
      if (d.facts?.length) parts.push(`Facts:\n${d.facts.map((f: string) => `• ${f}`).join("\n")}`);
      content = `↪ Forwarded\n${parts.join("\n\n")}`;
    } else {
      content = `↪ Forwarded\n${forwardMsg.encrypted_content}`;
    }

    try {
      const { error } = await supabase.from("messages").insert({
        chat_id: targetChatId,
        sender_id: user.id,
        encrypted_content: content,
      });
      if (error) throw error;
      setForwardMsg(null);
      setForwardChats([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setForwardSending(false);
    }
  }

  async function addReaction(msg: Message, emoji: string) {
    if (!user || isLocalNotes) return;
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

    if (creatingChatIdRef.current) return creatingChatIdRef.current;

    const createPromise = (async () => {
      const { data: chatId, error } = await supabase.rpc("get_or_create_direct_chat", {
        other_user_id: contactId,
      });

      if (error || !chatId) {
        console.error("[getOrCreateChatId] RPC error:", error?.message);
        return null;
      }

      setRealChatId(chatId);
      return chatId;
    })();

    creatingChatIdRef.current = createPromise;
    try {
      return await createPromise;
    } finally {
      if (creatingChatIdRef.current === createPromise) {
        creatingChatIdRef.current = null;
      }
    }
  }

  async function notifyInsertedChatMessage(params: {
    chatId: string;
    messageId?: string | null;
    body: string;
    attachmentUrl?: string | null;
    attachmentType?: string | null;
  }) {
    if (!user || !params.messageId || isLocalNotesId(params.chatId)) return;
    let recipientIds = (
      chatInfo?.member_ids?.length
        ? chatInfo.member_ids
        : chatInfo?.other_id
          ? [chatInfo.other_id]
          : []
    ).filter((recipientId: string) => recipientId !== user.id);

    // Chat metadata can still be loading when the first message is sent.
    // Resolve members from Supabase rather than silently dropping delivery.
    if (recipientIds.length === 0) {
      const { data: members, error } = await supabase
        .from("chat_members")
        .select("user_id")
        .eq("chat_id", params.chatId);
      if (error) {
        console.warn("[push] recipient lookup failed:", error.message);
        return;
      }
      recipientIds = (members ?? [])
        .map((member) => member.user_id)
        .filter((recipientId): recipientId is string => Boolean(recipientId) && recipientId !== user.id);
    }
    if (recipientIds.length === 0) return;
    void notifyChatRecipients({
      recipientIds,
      senderId: user.id,
      senderName: profile?.display_name || "Someone",
      senderAvatarUrl: profile?.avatar_url ?? null,
      body: params.body,
      chatId: params.chatId,
      messageId: params.messageId,
      attachmentUrl: params.attachmentUrl,
      attachmentType: params.attachmentType,
    });
  }

  async function handleInlineSendMoney() {
    if (!user || !session || !profile || !chatInfo?.other_id || walletSending) return;
    const amt = parseInt(walletAmount, 10);
    if (isNaN(amt) || amt <= 0) { showAlert("Invalid amount", "Please enter a valid amount greater than zero."); return; }
    const currentBalance = walletCurrency === "acoin" ? (profile.acoin ?? 0) : (profile.xp ?? 0);
    const coinLabel = walletCurrency === "acoin" ? "ACoin" : "Nexa";
    if (amt > currentBalance) { showAlert("Insufficient balance", `You only have ${currentBalance.toLocaleString()} ${coinLabel}.`); return; }
    setWalletSending(true);
    try {
      const { data: recipient } = await supabase.from("profiles").select("id,display_name,handle,acoin,xp").eq("id", chatInfo.other_id).single();
      if (!recipient) { showAlert("Error", "Recipient not found."); setWalletSending(false); return; }
      const noteText = walletNote.trim() || null;
      if (walletCurrency === "nexa") {
        const { data: deducted, error: deductErr } = await supabase
          .from("profiles")
          .update({ xp: (profile.xp || 0) - amt })
          .eq("id", user.id)
          .gte("xp", amt)
          .select("id")
          .maybeSingle();
        if (deductErr || !deducted) {
          showAlert("Error", "Could not deduct Nexa. Please check your balance and try again.");
          setWalletSending(false);
          return;
        }
        const { data: creditResult, error: creditErr } = await supabase.rpc("award_xp", {
          p_user_id: recipient.id,
          p_action_type: "nexa_transfer_received",
          p_xp_amount: amt,
          p_metadata: { from_user_id: user.id },
        });
        if (creditErr || !(creditResult as any)?.success) {
          try {
            await supabase.rpc("award_xp", {
              p_user_id: user.id,
              p_action_type: "nexa_transfer_rollback",
              p_xp_amount: amt,
              p_metadata: { recipient_id: recipient.id },
            });
          } catch {}
          showAlert("Error", "Could not credit the recipient. Your Nexa was restored.");
          setWalletSending(false);
          return;
        }
        const { error: transferErr } = await supabase
          .from("xp_transfers")
          .insert({ sender_id: user.id, receiver_id: recipient.id, amount: amt, message: noteText });
        if (transferErr) {
          await Promise.all([
            supabase.rpc("award_xp", {
              p_user_id: user.id,
              p_action_type: "nexa_transfer_rollback",
              p_xp_amount: amt,
              p_metadata: { recipient_id: recipient.id },
            }),
            supabase.rpc("award_xp", {
              p_user_id: recipient.id,
              p_action_type: "nexa_transfer_reversal",
              p_xp_amount: -amt,
              p_metadata: { sender_id: user.id },
            }),
          ]).catch(() => {});
          showAlert("Error", "The transfer could not be recorded. Your Nexa was restored.");
          setWalletSending(false);
          return;
        }
      } else {
        const { error: deductErr } = await supabase.rpc("deduct_acoin", { p_user_id: user.id, p_amount: amt }).maybeSingle();
        if (deductErr) { showAlert("Error", "Could not deduct ACoin. Please check your balance and try again."); setWalletSending(false); return; }
        const { error: creditErr } = await supabase.rpc("credit_acoin", { p_user_id: recipient.id, p_amount: amt });
        if (creditErr) {
          try {
            await supabase.rpc("credit_acoin", { p_user_id: user.id, p_amount: amt });
          } catch {}
          showAlert("Error", "Could not credit the recipient. Your ACoin was restored.");
          setWalletSending(false);
          return;
        }
        await Promise.all([
          supabase.from("acoin_transactions").insert({ user_id: user.id, amount: -amt, transaction_type: "acoin_transfer_sent", metadata: { to_user_id: recipient.id, to_handle: recipient.handle, message: noteText } }),
          supabase.from("acoin_transactions").insert({ user_id: recipient.id, amount: amt, transaction_type: "acoin_transfer_received", metadata: { from_user_id: user.id, from_handle: profile.handle, message: noteText } }),
        ]).catch(() => {});
      }
      const activeChatId = await getOrCreateChatId();
      if (activeChatId) {
        const payloadStr = JSON.stringify({ currency: walletCurrency, amount: amt, note: noteText, sender_handle: profile.handle, recipient_handle: recipient.handle, recipient_name: recipient.display_name });
        const msgResult = await supabase.from("messages").insert({ chat_id: activeChatId, sender_id: user.id, encrypted_content: payloadStr, attachment_type: "payment" }).select("id, chat_id, sender_id, encrypted_content, sent_at, attachment_type").single();
        if (msgResult.data) {
          const newMsg: Message = { ...msgResult.data, sender: { display_name: profile.display_name || "You", avatar_url: profile.avatar_url || null, handle: profile.handle || "" }, reactions: [], status: "sent" };
          setMessages((prev) => [newMsg, ...prev]);
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          notifyInsertedChatMessage({
            chatId: activeChatId,
            messageId: msgResult.data.id,
            body: `🪙 Sent ${amt.toLocaleString()} ${coinLabel}${noteText ? `: ${noteText}` : ""}`,
          });
        }
      }
      refreshProfile?.();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWalletAmount("");
      setWalletNote("");
      setShowAttachPanel(false);
      showAlert("Sent!", `${amt.toLocaleString()} ${coinLabel} sent to ${recipient.display_name}.`);
    } catch {
      showAlert("Error", "Payment failed. Please try again.");
    }
    setWalletSending(false);
  }

  async function sendMessage(directText?: string) {
    const text = (directText ?? input).trim();
    if (!text || !user || sending || (!session && !isLocalNotesId(id))) return;
    if (blockMessageAction()) return;
    setSending(true);
    if (draftSaveTimer.current) { clearTimeout(draftSaveTimer.current); draftSaveTimer.current = null; }
    if (!directText) setInput("");
    if (id) {
      AsyncStorage.removeItem(`chat_draft_${id}`).catch(() => {});
      if (user && !isLocalNotesId(id)) {
        supabase.from("chat_drafts").delete().eq("user_id", user.id).eq("chat_id", id).then(() => {});
      }
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

    if (isLocalNotesId(activeChatId)) {
      await saveLocalNotesMessage(user.id, {
        id: msgId,
        sender_id: user.id,
        encrypted_content: text,
        sent_at: now,
        reply_to_message_id: userMsg.reply_to_message_id || null,
        attachment_url: null,
        attachment_type: null,
        status: "sent",
      });
      return;
    }

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

      const { data: inserted, error: aiInsertErr } = await supabase.from("messages").insert(insertPayload).select("id").single();
      if (aiInsertErr) {
        console.error("[sendMessage/afuai] insert error:", JSON.stringify(aiInsertErr));
      }
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
    } else {
      console.error("[sendMessage] insert failed — code:", error?.code, "message:", error?.message);
      setMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, status: "failed" as const } : m)
      );
    }

    if (!error && inserted) {
      const recipientIds = (
        chatInfo?.member_ids?.length ? chatInfo.member_ids : chatInfo?.other_id ? [chatInfo.other_id] : []
      ).filter((rid: string) => rid !== user.id);

      if (recipientIds.length > 0) {
        // ── Broadcast fast-path: deliver instantly to every recipient's inbox ─
        // Recipients subscribed to user-inbox:${recipientId} receive this in
        // ~20 ms via Supabase Broadcast, before Postgres Changes fires.
        const broadcastPayload = {
          id: inserted.id,
          chat_id: activeChatId,
          sender_id: user.id,
          encrypted_content: text,
          sent_at: new Date().toISOString(),
          reply_to_message_id: replyTo?.id ?? null,
          sender_display_name: profile?.display_name || "Someone",
          sender_avatar_url: profile?.avatar_url ?? null,
          sender_handle: profile?.handle ?? "",
        };
        recipientIds.forEach((rid: string) => broadcastToUserInbox(rid, broadcastPayload));
      }
      notifyInsertedChatMessage({ chatId: activeChatId, messageId: inserted.id, body: text });
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
    if (isLocalNotes) {
      showAlert("My Notes", "Notes stay text-only and fully offline.");
      return;
    }
    if (blockMessageAction()) return;
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
    const { data: insertedEnvelope } = await supabase.from("messages").insert({
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: `🧧 Red Envelope [${envId}] - ${envelopeMsg || "Good luck!"}`,
    }).select("id").single();
    notifyInsertedChatMessage({
      chatId: activeChatId,
      messageId: insertedEnvelope?.id,
      body: `🧧 Red Envelope - ${envelopeMsg || "Good luck!"}`,
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
    if (isLocalNotes) {
      showAlert("My Notes", "Notes stay text-only and fully offline.");
      return;
    }
    if (blockMessageAction()) return;

    const { data: senderProfile } = await supabase.from("profiles").select("acoin").eq("id", user.id).single();
    if (!senderProfile || (senderProfile.acoin || 0) < price) {
      showAlert("Insufficient ACoins", `You need ${formatCompactAmount(price)} ACoins to send this gift. Your balance: ${formatCompactAmount(senderProfile?.acoin)} ACoins.`);
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
      await supabase.rpc("credit_acoin", { p_user_id: user.id, p_amount: price }).then(null, () => {});
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

    const { data: insertedGift } = await supabase.from("messages").insert({
      chat_id: activeChatId,
      sender_id: user.id,
      encrypted_content: `🎁 ${gift.emoji} ${gift.name}${message.trim() ? ` - ${message.trim()}` : ""}|giftId:${gift.id}|receiverId:${receiverId}`,
    }).select("id").single();
    notifyInsertedChatMessage({
      chatId: activeChatId,
      messageId: insertedGift?.id,
      body: `🎁 ${gift.emoji} ${gift.name}${message.trim() ? ` - ${message.trim()}` : ""}`,
    });

    try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("gift_sent"); } catch (_) {}
    setShowGiftPicker(false);
    setGiftSending(false);
    loadMessages();
  }

  async function pickFromCamera() {
    setShowAttachMenu(false);
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (camPerm.status !== "granted") { showAlert("Permission needed", "Camera access is required to take photos and videos."); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      quality: pickerQuality,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const isVideo = asset.type === "video";
      if (isVideo) {
        setSelectedImages([]);
        setPendingVideoUri({ uri: asset.uri, mimeType: asset.mimeType || "video/mp4" });
        setShowVideoTrimmer(true);
      } else {
        setSelectedImages([]);
        setAttachmentPreview({ uri: asset.uri, type: "image", mimeType: asset.mimeType || "image/jpeg" });
      }
    }
  }

  async function pickFromGallery() {
    setShowAttachMenu(false);
    const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (libPerm.status !== "granted") { showAlert("Permission needed", "Gallery access is required to pick photos and videos."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: pickerQuality,
      allowsMultipleSelection: true,
      selectionLimit: 6,
    });
    if (!result.canceled && result.assets?.length) {
      setAttachmentPreview(null);
      setSelectedImages(result.assets.slice(0, 6).map((asset) => ({
        uri: asset.uri,
        type: "image",
        mimeType: asset.mimeType || "image/jpeg",
      })));
    }
  }

  async function pickDocument() {
    setShowAttachMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const doc = result.assets[0];
        setSelectedImages([]);
        setAttachmentPreview({ uri: doc.uri, type: "file", name: doc.name, mimeType: doc.mimeType });
      }
    } catch {
      showAlert("Error", "Could not open file picker.");
    }
  }

  async function applyImageEdit(action: "rotate" | "flip") {
    if (editingImageIndex == null) return;
    const image = selectedImages[editingImageIndex];
    if (!image) return;
    try {
      const edited = await ImageManipulator.manipulateAsync(
        image.uri,
        action === "rotate" ? [{ rotate: 90 }] : [{ flip: ImageManipulator.FlipType.Horizontal }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
      );
      setSelectedImages((prev) => prev.map((item, index) =>
        index === editingImageIndex ? { ...item, uri: edited.uri, mimeType: "image/jpeg" } : item
      ));
    } catch {
      showAlert("Edit failed", "Could not edit this image.");
    }
  }

  async function sendAttachment() {
    if (!user || (!attachmentPreview && selectedImages.length === 0)) return;
    if (isLocalNotes) {
      showAlert("My Notes", "Notes stay text-only and fully offline.");
      setAttachmentPreview(null);
      setSelectedImages([]);
      return;
    }
    if (blockMessageAction()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const activeChatId = await getOrCreateChatId();
    if (!activeChatId) return;

    // Upload an all-image selection as one grouped gallery in the chat.
    if (selectedImages.length > 0 && selectedImages.every((image) => image.type === "image")) {
      const images = selectedImages.slice(0, 6);
      const caption = input.trim();
      const tempId = `pending-${Date.now()}`;
      const localUrls = images.map((image) => image.uri);
      setMessages((prev) => [{
        id: tempId,
        chat_id: activeChatId,
        sender_id: user.id,
        encrypted_content: caption || "📷 Photo",
        sent_at: new Date().toISOString(),
        sender: { display_name: profile?.display_name || "You", avatar_url: profile?.avatar_url || null, handle: profile?.handle || "" },
        attachment_url: JSON.stringify(localUrls),
        attachment_type: "image_group",
        _pending: true,
        reactions: [],
      }, ...prev]);
      setSelectedImages([]);
      setInput("");
      saveDraft("");

      try {
        const uploaded = await Promise.all(images.map(async (image) => {
          const result = await uploadChatMedia(
            "chat-attachments", activeChatId, user.id, image.uri, undefined, image.mimeType,
          );
          if (result.error || !result.publicUrl) {
            throw new Error(result.error || "Could not upload image. Please try again.");
          }
          return result.publicUrl;
        }));
        // Never send a partial or malformed gallery. Promise.all preserves the
        // selected order; this check guarantees one URL for every selected image.
        if (uploaded.length !== images.length || uploaded.some((url) => !url)) {
          throw new Error("One or more images could not be uploaded. Please try again.");
        }
        const label = caption || "📷 Photo";
        const { data: inserted, error: insertError } = await supabase.from("messages").insert({
          chat_id: activeChatId,
          sender_id: user.id,
          encrypted_content: label,
          attachment_url: JSON.stringify(uploaded),
          attachment_type: "image_group",
        }).select("id").single();
        if (insertError) throw insertError;
        setMessages((prev) => prev.map((m) =>
          m.id === tempId
            ? { ...m, id: inserted?.id || tempId, attachment_url: JSON.stringify(uploaded), _pending: false }
            : m
        ));
      } catch (error: any) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        showAlert("Upload failed", error?.message || "Could not upload images. Please try again.");
      }
      return;
    }

    // Shares can contain a mix of images, videos, audio, and documents. Keep
    // every selected item instead of silently reducing the selection to one
    // non-image attachment.
    if (selectedImages.length > 0) {
      const attachments = selectedImages.slice(0, 6);
      const caption = input.trim();
      const pendingIds = attachments.map((_, index) => `pending-${Date.now()}-${index}`);
      setMessages((prev) => [
        ...attachments.map((attachment, index) => ({
          id: pendingIds[index],
          chat_id: activeChatId,
          sender_id: user.id,
          encrypted_content: caption || (
            attachment.type === "video"
              ? "Video"
              : attachment.type === "file"
                ? `File · ${attachment.name || "Shared file"}`
                : "Shared media"
          ),
          sent_at: new Date().toISOString(),
          sender: { display_name: profile?.display_name || "You", avatar_url: profile?.avatar_url || null, handle: profile?.handle || "" },
          attachment_url: attachment.uri,
          attachment_type: attachment.type,
          _pending: true,
          reactions: [],
        })),
        ...prev,
      ]);
      setSelectedImages([]);
      setInput("");
      saveDraft("");

      try {
        const uploaded = await Promise.all(attachments.map(async (attachment) => {
          const result = await uploadChatMedia(
            "chat-attachments",
            activeChatId,
            user.id,
            attachment.uri,
            attachment.name || undefined,
            attachment.mimeType,
          );
          if (result.error || !result.publicUrl) {
            throw new Error(result.error || "Could not upload one of the shared files.");
          }
          return result.publicUrl;
        }));
        await Promise.all(uploaded.map(async (publicUrl, index) => {
          const attachment = attachments[index];
          const label = caption || (
            attachment.type === "video"
              ? "Video"
              : attachment.type === "file"
                ? `File · ${attachment.name || "Shared file"}`
                : "Shared media"
          );
          const { data: inserted, error: insertError } = await supabase.from("messages").insert({
            chat_id: activeChatId,
            sender_id: user.id,
            encrypted_content: label,
            attachment_url: publicUrl,
            attachment_type: attachment.type,
          }).select("id").single();
          if (insertError) throw insertError;
          setMessages((prev) => prev.map((message) =>
            message.id === pendingIds[index]
              ? { ...message, id: inserted?.id || pendingIds[index], attachment_url: publicUrl, _pending: false }
              : message
          ));
        }));
      } catch (error: any) {
        setMessages((prev) => prev.filter((message) => !pendingIds.includes(message.id)));
        showAlert("Upload failed", error?.message || "Could not upload the shared files.");
      }
      return;
    }

    // Capture all values before clearing preview state
    if (!attachmentPreview) return;
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

      // Delete the DocumentPicker temp copy from cacheDirectory now that upload is done
      if (uri) {
        const cacheDir = (FileSystem as any).cacheDirectory ?? "";
        if (cacheDir && uri.startsWith(cacheDir)) {
          FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        }
      }

    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      showAlert("Upload failed", e?.message || "Could not upload file");
    }
  }

  async function sendStickerMessage(emoji: string) {
    if (!user) return;
    if (isLocalNotes) {
      setShowEmojiStickerPicker(false);
      await sendMessage(emoji);
      return;
    }
    if (blockMessageAction()) return;
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
      notifyInsertedChatMessage({
        chatId: activeChatId,
        messageId: inserted.id,
        body: emoji,
        attachmentType: "sticker",
      });
    }
  }

  function startRecordingClock() {
    clearInterval(recordingTimer.current);
    recordingTimer.current = setInterval(() => {
      setRecordingTenths((t) => {
        if (t >= 9) {
          setRecordingDuration((d) => {
            const next = d + 1;
            recordingDurationRef.current = next;
            return next;
          });
          return 0;
        }
        return t + 1;
      });
    }, 100);
  }

  async function startVoiceRecordingHold() {
    // The normal composer remains visible while an exact-chat gate is being
    // resolved, but recording must obey the same fail-closed send guard.
    if (blockMessageAction()) return;
    if (recordingActiveRef.current) return;
    // Microphone input owns the audio session. Stop any voice message (and
    // every other registered speaker playback) before asking for the mic so
    // recording starts without speaker bleed or an audio-session race.
    audioFocus.claimRecording();
    recordingStartingRef.current = true;
    recLockedSV.value = true;
    setIsRecordingPaused(false);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    // Show the recording surface immediately. Permission and recorder setup
    // continue underneath it, so the send control never appears late.
    setIsRecording(true);
    setRecLocked(true);
    // Guard: Audio is null on web (lazy import) — delegate to web recorder path.
    if (!Audio) { startVoiceRecordingWeb(); return; }
    const safetyTimer = setTimeout(() => {
      if (!recStartedSV.value && recPressActiveSV.value) {
        recPressActiveSV.value = false;
        recCancelledSV.value = false;
        recLockedSV.value = false;
        setIsRecording(false);
        setRecLocked(false);
        recordingStartingRef.current = false;
      }
    }, 5000);
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        clearTimeout(safetyTimer);
        recPressActiveSV.value = false;
        showAlert("Microphone permission needed", "Go to Settings and allow AfuChat to access your microphone.");
        return;
      }
      // Claim the audio session for recording BEFORE creating the Recording
      // object.  Skipping this setAudioModeAsync call is what causes
      // "Could not start recording" on both iOS and Android — the OS rejects
      // the session because it is still configured for playback.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      // Use the single-step createAsync API (matches post/[id] and VideoCommentsSheet).
      // The old new Recording() + prepareToRecordAsync + startAsync sequence is
      // more fragile and has been deprecated in newer expo-av builds.
      // isMeteringEnabled exposes status.metering (dBFS) for the live waveform.
      const { recording: _rec } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recorderRef.current = _rec;
      recordingStartingRef.current = false;
      // Seed history with silence so bars render immediately at min height
      recAmpHistoryRef.current = new Array(20).fill(0);
      setRecAmplitudes([...recAmpHistoryRef.current]);
      _rec.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording) return;
        // dBFS: roughly −160 (silence) → 0 (peak). Normalise to 0–1.
        const db = (status as any).metering ?? -60;
        const amp = Math.min(1, Math.max(0, (db + 60) / 60));
        recAmpHistoryRef.current = [...recAmpHistoryRef.current.slice(-19), amp];
        setRecAmplitudes([...recAmpHistoryRef.current]);
      });
      recordingActiveRef.current = true;
      recStartedSV.value = true;
      clearTimeout(safetyTimer);

      if (!recPressActiveSV.value && !recLockedSV.value) {
        try {
          await recorderRef.current?.stopAndUnloadAsync();
          recorderRef.current = null;
        } catch (_) {}
        recordingActiveRef.current = false;
        recStartedSV.value = false;
        return;
      }

      setIsRecording(true);
      setRecLocked(true);
      setRecordingDuration(0);
      setRecordingTenths(0);
      recordingDurationRef.current = 0;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      startRecordingClock();
    } catch (err) {
      clearTimeout(safetyTimer);
      recPressActiveSV.value = false;
      recStartedSV.value = false;
      recCancelledSV.value = false;
      recLockedSV.value = false;
      recordingActiveRef.current = false;
      recordingStartingRef.current = false;
      setIsRecording(false);
      setRecLocked(false);
      showAlert("Error", "Could not start recording.");
    }
  }

  async function startVoiceRecordingWeb() {
    if (recordingActiveRef.current) return;
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        showAlert("Not supported", "Audio recording is not supported in this browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      webStreamRef.current = stream;
      webChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      webMediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) webChunksRef.current.push(e.data);
      };

      recorder.start(100);
      // Live waveform via Web Audio AnalyserNode — samples RMS every 80ms
      try {
        const audioCtx = new AudioContext();
        webAudioCtxRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        webAnalyserRef.current = analyser;
        const dataArr = new Uint8Array(analyser.frequencyBinCount);
        recAmpHistoryRef.current = new Array(20).fill(0);
        setRecAmplitudes([...recAmpHistoryRef.current]);
        meterInterval.current = setInterval(() => {
          if (!webAnalyserRef.current) return;
          webAnalyserRef.current.getByteFrequencyData(dataArr);
          const avg = dataArr.reduce((a: number, b: number) => a + b, 0) / dataArr.length / 255;
          recAmpHistoryRef.current = [...recAmpHistoryRef.current.slice(-19), avg];
          setRecAmplitudes([...recAmpHistoryRef.current]);
        }, 80);
      } catch (_) {}
      recordingActiveRef.current = true;
      recordingStartingRef.current = false;
      recStartedSV.value = true;
      recLockedSV.value = true;
      setIsRecording(true);
      setRecLocked(true);
      setRecordingDuration(0);
      setRecordingTenths(0);
      recordingDurationRef.current = 0;
      startRecordingClock();
    } catch {
      recStartedSV.value = false;
      recLockedSV.value = false;
      recordingActiveRef.current = false;
      recordingStartingRef.current = false;
      setIsRecording(false);
      setRecLocked(false);
      showAlert("Microphone permission needed", "Please allow microphone access in your browser settings, then try again.");
    }
  }

  async function toggleRecordingPause() {
    if (!recordingActiveRef.current || recordingStartingRef.current) return;
    try {
      if (isRecordingPaused) {
        if (webMediaRecorderRef.current) {
          webMediaRecorderRef.current.resume();
        } else {
          await (recorderRef.current as any)?.startAsync();
        }
        setIsRecordingPaused(false);
        startRecordingClock();
      } else {
        if (webMediaRecorderRef.current) {
          webMediaRecorderRef.current.pause();
        } else {
          await (recorderRef.current as any)?.pauseAsync();
        }
        clearInterval(recordingTimer.current);
        setIsRecordingPaused(true);
      }
    } catch {
      showAlert("Recording unavailable", "Could not change the recording state. Please try again.");
    }
  }

  async function stopVoiceRecording() {
    // The gate can change while the microphone is open (for example after a
    // reconnect). Cancel rather than allowing an unresolved chat to bypass it.
    if (blockMessageAction()) {
      await cancelVoiceRecording();
      return;
    }
    if (!recordingActiveRef.current) {
      if (recordingStartingRef.current) await cancelVoiceRecording();
      return;
    }
    const capturedDuration = recordingDurationRef.current;
    clearInterval(recordingTimer.current);
    clearInterval(meterInterval.current);
    recAmpHistoryRef.current = [];
    setRecAmplitudes([]);
    try { webAudioCtxRef.current?.close(); } catch (_) {}
    webAnalyserRef.current = null;
    webAudioCtxRef.current = null;
    setIsRecording(false);
    setRecLocked(false);
    setIsRecordingPaused(false);
    recLockedSV.value = false;
    recStartedSV.value = false;
    recPressActiveSV.value = false;
    recCancelledSV.value = false;
    setRecordingDuration(0);
    setRecordingTenths(0);
    recordingDurationRef.current = 0;
    slideX.value = 0;
    slideY.value = 0;
    directionLock.value = "none";

    // ── Discard short recordings (< 1 s) ────────────────────────────────────
    if (capturedDuration < 1) {
      if (webMediaRecorderRef.current) {
        try { webMediaRecorderRef.current.stop(); } catch {}
        webMediaRecorderRef.current = null;
        webChunksRef.current = [];
      }
      if (webStreamRef.current) {
        webStreamRef.current.getTracks().forEach((t) => t.stop());
        webStreamRef.current = null;
      }
      try { await recorderRef.current?.stopAndUnloadAsync(); } catch (_) {}
      recorderRef.current = null;
      recordingActiveRef.current = false;
    recordingStartingRef.current = false;
      Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }).catch(() => {});
      return;
    }

    // ── Web path (MediaRecorder → Blob → upload) ─────────────────────────────
    if (webMediaRecorderRef.current) {
      try {
        const recorder = webMediaRecorderRef.current;
        const mimeType = recorder.mimeType || "audio/webm";
        // Wait for onstop so all ondataavailable chunks are flushed before we build the blob.
        const blob = await new Promise<Blob>((resolve, reject) => {
          recorder.onstop = () => resolve(new Blob(webChunksRef.current, { type: mimeType }));
          recorder.onerror = (e: any) => reject(e?.error || new Error("recorder error"));
          try { recorder.stop(); } catch (e) { reject(e); }
        });
        webMediaRecorderRef.current = null;
        webChunksRef.current = [];
        webStreamRef.current?.getTracks().forEach((t) => t.stop());
        webStreamRef.current = null;
        recordingActiveRef.current = false;

        if (!blob.size || !user) return;

        const activeChatId = await getOrCreateChatId();
        if (!activeChatId) return;

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
          attachment_url: URL.createObjectURL(blob),
          attachment_type: "audio",
          _pending: true,
        };
        setMessages((prev) => [optimisticMsg, ...prev]);
        setSending(true);

        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const blobUrl = URL.createObjectURL(blob);
        const { publicUrl, error: uploadErr } = await uploadChatMedia(
          "voice-messages", activeChatId, user.id,
          blobUrl, `voice_${Date.now()}.${ext}`, mimeType,
        );
        URL.revokeObjectURL(blobUrl);

        if (uploadErr || !publicUrl) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          showAlert("Upload failed", uploadErr || "Could not upload voice message. Please try again.");
          setSending(false);
          return;
        }

        const { data: insertedVoice, error: insertErr } = await supabase.from("messages").insert({
          chat_id: activeChatId,
          sender_id: user.id,
          encrypted_content: "🎤 Voice message",
          attachment_url: publicUrl,
          attachment_type: "audio",
        }).select("id").single();
        if (insertErr) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          showAlert("Error", "Failed to send voice message.");
          setSending(false);
          return;
        }
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, _pending: false } : m));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        loadMessages();
        setSending(false);
        notifyInsertedChatMessage({
          chatId: activeChatId,
          messageId: insertedVoice?.id,
          body: "🎤 Voice message",
          attachmentUrl: publicUrl,
          attachmentType: "audio",
        });
      } catch (err: any) {
        console.warn("[Voice/web] Error:", err?.message || err);
        webMediaRecorderRef.current = null;
        webChunksRef.current = [];
        webStreamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        webStreamRef.current = null;
        recordingActiveRef.current = false;
        setSending(false);
        showAlert("Error", "Failed to send voice message.");
      }
      return; // never fall through to native path
    }

    // ── Native path (expo-av → m4a → upload) ────────────────────────────────
    try {
      let uri: string | null = null;
      await recorderRef.current?.stopAndUnloadAsync();
      uri = recorderRef.current?.getURI() ?? null;
      recorderRef.current = null;
      // Restore audio session to playback mode so sound effects and video
      // audio work normally after the voice message is sent.
      Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }).catch(() => {});
      recordingActiveRef.current = false;

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

      const ext = "m4a";
      const voiceMime = "audio/mp4";
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

      const { data: insertedVoice, error: insertErr } = await supabase.from("messages").insert({
        chat_id: activeChatId,
        sender_id: user.id,
        encrypted_content: "🎤 Voice message",
        attachment_url: publicUrl,
        attachment_type: "audio",
      }).select("id").single();
      if (insertErr) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        showAlert("Error", "Failed to send voice message.");
        setSending(false);
        return;
      }
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, _pending: false } : m));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadMessages();
      setSending(false);
      if (insertedVoice?.id && chatInfo) {
        notifyInsertedChatMessage({
          chatId: activeChatId,
          messageId: insertedVoice.id,
          body: "🎤 Voice message",
          attachmentUrl: publicUrl,
          attachmentType: "audio",
        });
      }
      // Delete the local recording from cacheDirectory now that upload is complete
      if (uri) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    } catch (err: any) {
      console.warn("[Voice] Error:", err?.message || err);
      recorderRef.current = null;
      recordingActiveRef.current = false;
      Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }).catch(() => {});
      setSending(false);
      showAlert("Error", "Failed to send voice message.");
    }
  }

  async function cancelVoiceRecording() {
    clearInterval(recordingTimer.current);
    clearInterval(meterInterval.current);
    recAmpHistoryRef.current = [];
    setRecAmplitudes([]);
    try { webAudioCtxRef.current?.close(); } catch (_) {}
    webAnalyserRef.current = null;
    webAudioCtxRef.current = null;
    setIsRecording(false);
    setRecLocked(false);
    setIsRecordingPaused(false);
    recLockedSV.value = false;
    recStartedSV.value = false;
    recPressActiveSV.value = false;
    recCancelledSV.value = false;
    setRecordingDuration(0);
    setRecordingTenths(0);
    recordingDurationRef.current = 0;
    slideX.value = 0;
    slideY.value = 0;
    directionLock.value = "none";
    if (recordingActiveRef.current) {
      // Web cleanup
      if (webMediaRecorderRef.current) {
        try { webMediaRecorderRef.current.stop(); } catch {}
        webMediaRecorderRef.current = null;
        webChunksRef.current = [];
      }
      if (webStreamRef.current) {
        webStreamRef.current.getTracks().forEach((t) => t.stop());
        webStreamRef.current = null;
      }
      // Native cleanup
      try {
        const cancelUri = recorderRef.current?.getURI();
        await recorderRef.current?.stopAndUnloadAsync();
        if (cancelUri) FileSystem.deleteAsync(cancelUri, { idempotent: true }).catch(() => {});
      } catch (_) {}
      recorderRef.current = null;
      // Restore audio session to playback mode after cancellation.
      Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }).catch(() => {});
      recordingActiveRef.current = false;
      recordingStartingRef.current = false;
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
      // The claim is persisted by the red-envelope RPC; no notification row is created.
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

  // lensCardMsg is placed at index 0 (the bottom of the inverted FlatList)
  // so it always appears as the most-recent item — never jumps to the top.
  // All render helpers must index into this combined list — never into
  // `messages` alone — otherwise the out-of-bounds index crashes on
  // `undefined.sent_at` when the lens card is the active item.
  const listData: Message[] = useMemo(
    () => lensCardMsg ? [lensCardMsg, ...messages] : messages,
    [messages, lensCardMsg]
  );

  // ── In-chat search: indices into listData (inverted list, 0 = newest) ───────
  const searchMatchIndices: number[] = useMemo(() => {
    if (!searchActive || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    const hits: number[] = [];
    listData.forEach((msg, idx) => {
      const text = (msg.encrypted_content || "").toLowerCase();
      if (text.includes(q)) hits.push(idx);
    });
    return hits;
  }, [searchActive, searchQuery, listData]);

  // Scroll to focused match and drive highlightedMsgId whenever cursor moves.
  useEffect(() => {
    if (!searchActive || searchMatchIndices.length === 0) {
      if (!searchActive) setHighlightedMsgId(null);
      return;
    }
    const idx = searchMatchIndices[searchCursor] ?? searchMatchIndices[0];
    const msg = listData[idx];
    if (!msg) return;
    setHighlightedMsgId(msg.id);
    try {
      flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    } catch {}
  }, [searchActive, searchCursor, searchMatchIndices]);

  function shouldShowTail(index: number): boolean {
    const current = listData[index];
    if (!chatPrefs.message_grouping) return true;
    // Replied messages always show a tail regardless of group position
    if (current?.reply_to_message_id) return true;
    // The FlatList is inverted: index 0 = bottom (most recent).
    // We want the tail on the BOTTOM message of each consecutive group —
    // i.e. when the message rendered BELOW (index - 1, more recent) belongs
    // to a different sender, or when this is already the bottom-most message.
    if (index === 0) return true;
    const below = listData[index - 1]; // newer, rendered below this one
    if (!current || !below) return true;
    return current.sender_id !== below.sender_id;
  }

  function shouldShowName(index: number): boolean {
    if (!chatInfo?.is_group && !chatInfo?.is_channel) return false;
    if (!chatPrefs.message_grouping) return true;
    // Show sender name on the TOP message of each group (oldest in sequence).
    // In the inverted list that's when the message ABOVE (index + 1, older)
    // belongs to a different sender.
    if (index >= listData.length - 1) return true;
    const current = listData[index];
    const above = listData[index + 1]; // older, rendered above this one
    if (!current || !above) return true;
    return current.sender_id !== above.sender_id;
  }

  function shouldShowDate(index: number): boolean {
    // FlatList is inverted: index 0 = bottom/newest, higher index = older/top.
    // The date badge renders ABOVE the message (visually), which in an inverted
    // list means we want it on the OLDEST message of each day group — i.e. when
    // the next-older message (index + 1) is on a different calendar day.
    const current = listData[index];
    const older = listData[index + 1]; // one step older in the inverted list
    if (!current?.sent_at) return false;
    if (!older?.sent_at) return true; // oldest message in the list — always show
    return new Date(current.sent_at).toDateString() !== new Date(older.sent_at).toDateString();
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
    const index = listData.findIndex((m) => m.id === msgId);
    if (index === -1) return;
    flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedMsgId(msgId);
    highlightTimerRef.current = setTimeout(() => setHighlightedMsgId(null), 1500);
  }, [listData]);

  // A push can target an older message that is not in the first page or the
  // local cache. Fetch that exact row so tapping the notification never lands
  // on an approximate point in the conversation.
  useEffect(() => {
    const chatId = isDraft ? realChatId : id;
    if (
      !messageId ||
      !user ||
      !chatId ||
      isLocalNotesId(chatId) ||
      notificationTargetLoadRef.current === messageId ||
      messages.some((message) => message.id === messageId)
    ) {
      return;
    }
    notificationTargetLoadRef.current = messageId;
    let cancelled = false;
    supabase
      .from("messages")
      .select(`id, chat_id, sender_id, encrypted_content, sent_at, reply_to_message_id, attachment_url, attachment_type, edited_at, profiles!messages_sender_id_fkey(display_name, avatar_url, handle)`)
      .eq("id", messageId)
      .eq("chat_id", chatId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const row = data as any;
        const isBot = row.sender_id === AFUAI_BOT_ID;
        const aiParsed = isBot ? parseAfuAiTags(row.encrypted_content || "") : null;
        const targetMessage: Message = {
          id: row.id,
          chat_id: row.chat_id,
          sender_id: row.sender_id,
          encrypted_content: aiParsed ? (aiParsed.text || row.encrypted_content) : row.encrypted_content,
          sent_at: row.sent_at,
          reply_to_message_id: row.reply_to_message_id,
          attachment_url: row.attachment_url,
          attachment_type: row.attachment_type,
          edited_at: row.edited_at,
          sender: row.profiles,
          reactions: [],
          _isAi: isBot || undefined,
          _aiActions: aiParsed && aiParsed.actions.length > 0 ? aiParsed.actions : undefined,
          _aiInvoices: aiParsed && aiParsed.invoices.length > 0 ? aiParsed.invoices : undefined,
        };
        setMessages((previous) => {
          if (previous.some((message) => message.id === targetMessage.id)) return previous;
          return [...previous, targetMessage].sort(
            (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
          );
        });
      }, () => {});
    return () => {
      cancelled = true;
    };
  }, [messageId, id, realChatId, isDraft, user?.id, messages.length]);

  useEffect(() => {
    if (
      !messageId ||
      notificationTargetHandledRef.current === messageId ||
      !messages.some((message) => message.id === messageId)
    ) {
      return;
    }
    notificationTargetHandledRef.current = messageId;
    const timer = setTimeout(() => scrollToMessage(messageId), 0);
    return () => clearTimeout(timer);
  }, [messageId, messages, scrollToMessage]);

  const handleNotificationAction = useCallback(async (notification: NotificationMessageData) => {
    const route = getNotificationRoute(notification);
    if (!route) return;
    if (!notification.read_at && user?.id) {
      void supabase
        .from("notification_events")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notification.id)
        .eq("recipient_id", user.id);
      setMessages((previous) => previous.map((message) =>
        message._notification?.id === notification.id
          ? { ...message, _notification: { ...message._notification, read_at: new Date().toISOString() } }
          : message
      ));
    }
    router.push(route as any);
  }, [user?.id]);

  // Load phone-book name once we know who the other person is.
  useEffect(() => {
    const otherId = chatInfo?.other_id;
    if (!otherId || chatInfo?.is_group || chatInfo?.is_channel) return;
    getPhonebookName(otherId).then(setPhonebookName).catch(() => {});
  }, [chatInfo?.other_id, chatInfo?.is_group, chatInfo?.is_channel]);

  const headerTitle = chatInfo?.is_group || chatInfo?.is_channel
    ? chatInfo.name || "Group"
    : isNotificationsChat
      ? "AfuChat Updates"
    : isSelfChat
      ? "My Notes"
      : (phonebookName || chatInfo?.other_name || "Chat");
  const headerAvatar = chatInfo?.is_group || chatInfo?.is_channel ? chatInfo?.avatar_url : isSelfChat ? null : chatInfo?.other_avatar;
  const isChannelOwner =
    !!chatInfo?.is_channel &&
    !!user?.id &&
    chatInfo.channel_owner_id === user.id;
  const isChannelMember = chatInfo?.channel_is_member === true;
  const channelMembershipKnown = !chatInfo?.is_channel || typeof chatInfo.channel_is_member === "boolean";
  const canPostToChannel = !chatInfo?.is_channel || (isChannelMember && (iAmChatAdmin || isChannelOwner));
  const headerSubtitle = chatInfo?.is_channel
    ? (chatInfo.channel_is_public === false ? "Private" : "Public")
    : null;
  const isNonOwnerChannel = !!chatInfo?.is_channel && !isChannelOwner;
  const canOpenDirectProfile = !!chatInfo?.other_id && !chatInfo.is_group && !chatInfo.is_channel && !isSelfChat && !isNotificationsChat;
  const canOpenChatInfo = !!chatInfo?.is_group || !!chatInfo?.is_channel;
  const handleOpenDirectProfile = useCallback(() => {
    if (!canOpenDirectProfile || !chatInfo?.other_id) return;
    router.push({
      pathname: "/contact/[id]",
      params: {
        id: chatInfo.other_id,
        init_name: headerTitle,
        init_avatar: headerAvatar ?? "",
        init_verified: chatInfo.is_verified ? "1" : "0",
        init_org_verified: chatInfo.is_organization_verified ? "1" : "0",
      },
    } as any);
  }, [canOpenDirectProfile, chatInfo?.other_id, chatInfo?.is_verified, chatInfo?.is_organization_verified, headerTitle, headerAvatar]);

  const joinCurrentChannel = useCallback(async () => {
    if (!user || !id || !chatInfo?.is_channel || joiningChannel || isChannelMember) return;
    setJoiningChannel(true);
    try {
      const { error } = await supabase
        .from("channel_subscriptions")
        .insert({ channel_id: id, user_id: user.id });
      if (error && error.code !== "23505") throw error;
      if (!error) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setChatInfo((prev) => prev ? {
        ...prev,
        channel_is_member: true,
        channel_subscriber_count: error ? prev.channel_subscriber_count : (prev.channel_subscriber_count ?? 0) + 1,
      } : prev);
    } catch {
      showAlert("Couldn't join channel", "Please try again.");
    } finally {
      setJoiningChannel(false);
    }
  }, [user, id, chatInfo?.is_channel, joiningChannel, isChannelMember]);

  const getMessageSpacing = useCallback((index: number): number => {
    if (index === 0) return 0;
    if (!chatPrefs.message_grouping) return 8;
    const current = listData[index];
    const prev = listData[index - 1];
    if (!current || !prev) return 8;
    return current.sender_id === prev.sender_id ? 2 : 8;
  }, [listData, chatPrefs.message_grouping]);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender_id === user?.id;
    // AfuAI chat: suppress date separators and per-message timestamps entirely.
    const showDate = !isAfuAiDirectChat && shouldShowDate(index);
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
        {item._isLensCard ? (
          <TouchableOpacity
            activeOpacity={1}
            delayLongPress={500}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setForwardMsg(item);
              openForward(item);
            }}
          >
            <LensContextCard
              msg={item}
              onSuggestionTap={(text) => sendMessage(text)}
            />
          </TouchableOpacity>
        ) : (
          <MessageBubble
            msg={item}
            isMe={isMe}
            isChannel={!!chatInfo?.is_channel}
            showTail={shouldShowTail(index)}
            showName={shouldShowName(index) && !chatInfo?.is_channel}
            onLongPress={(m) => {
              if (chatPrefs.send_haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setTextSelectionMessageId(null);
              setShowReactions(m);
            }}
            onReply={(m) => { setReplyTo(m); setTimeout(() => chatInputRef.current?.focus(), 50); }}
            replyPreview={getReplyPreview(item.reply_to_message_id)}
            onTapReply={item.reply_to_message_id ? () => scrollToMessage(item.reply_to_message_id!) : undefined}
            isHighlighted={item.id === highlightedMsgId}
            onTapEnvelope={handleTapEnvelope}
            onTapGift={handleTapGift}
            onImageTap={imgViewer.openViewer}
            onConfirmExec={handleConfirmAiExec}
            onCancelExec={handleCancelAiExec}
            onSuggestionTap={(text) => sendMessage(text)}
            onSenderPress={advancedFeatures.mini_profile_popup && !isMe && !chatInfo?.is_channel ? (id) => setMiniProfileUserId(id) : undefined}
            onReactionPress={addReaction}
            onStatusPress={isMe ? (m) => setMsgInfoTarget(m) : undefined}
             onNotificationAction={isNotificationsChat ? handleNotificationAction : undefined}
            brandColor={colors.accent}
            hideTimestamp={isAfuAiDirectChat}
            isTextSelectionEnabled={item.id === textSelectionMessageId}
          />
        )}
      </View>
    );
  }, [listData, messages, user, colors, highlightedMsgId, scrollToMessage, advancedFeatures.mini_profile_popup, textSelectionMessageId, isNotificationsChat, handleNotificationAction]);

  // Single source of truth for the bottom offset.
  // The floatingInputContainer is position:absolute so it cannot rely on
  // softwareKeyboardLayoutMode:"resize" (Expo Router's screen container does not
  // propagate the activity resize to absolutely-positioned children).
  // We therefore apply keyboardHeight manually on BOTH platforms, same as iOS.
  // Custom emoji picker: use emojiKeyboardHeight (system keyboard is closed then).
  // When the keyboard is open, always keep at least insets.bottom of clearance
  // so the input bar never intrudes into the gesture-navigation area on
  // devices where keyboardHeight does not already include that inset.
  const effectiveBottom = showEmojiStickerPicker && !keyboardHeight
    ? emojiKeyboardHeight + insets.bottom
    : keyboardHeight > 0
      ? Math.max(keyboardHeight, insets.bottom)
      : insets.bottom;

  return (
    <ChatFontSizeCtx.Provider value={effectiveChatFontSize}>
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <WallpaperOverlay wallpaper={chatAppearance?.wallpaper} dark={isDark} />
      <View style={[st.header, { backgroundColor: colors.surface, paddingTop: insets.top + 4, borderBottomColor: colors.border }]}>
        {(
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={st.headerProfile}
           onPress={() => {
             if (canOpenChatInfo) {
               router.push({ pathname: "/chat-info/[id]", params: {
                 id: id as string,
                 name: headerTitle,
                 avatar: headerAvatar ?? "",
                 isGroup: chatInfo?.is_group ? "1" : "0",
                 isChannel: chatInfo?.is_channel ? "1" : "0",
               } } as any);
             } else {
               handleOpenDirectProfile();
             }
           }}
           disabled={!canOpenDirectProfile && !canOpenChatInfo}
          activeOpacity={0.7}
        >
          <Avatar uri={headerAvatar} name={headerTitle} size={38} square={!!(chatInfo?.is_organization_verified)} userId={(!chatInfo?.is_group && !chatInfo?.is_channel) ? chatInfo?.other_id : undefined} />
          <View style={st.headerInfo}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {(!chatInfo?.is_group && !chatInfo?.is_channel && chatInfo?.other_id) ? (
                <UserName
                  userId={chatInfo.other_id}
                  name={headerTitle}
                  style={[st.headerName, { color: colors.text }]}
                  numberOfLines={1}
                  suppressStar
                />
              ) : (
                <Text style={[st.headerName, { color: colors.text }]} numberOfLines={1}>{headerTitle}</Text>
              )}
              <VerifiedBadge isVerified={chatInfo?.is_verified} isOrganizationVerified={chatInfo?.is_organization_verified} size={16} />
            </View>
            {typingUsers.length > 0 ? (
              <Text style={[st.headerSub, { color: BRAND }]}>
                {`${typingUsers.join(", ")} typing...`}
              </Text>
            ) : isNotificationsChat ? (
              <Text style={[st.headerSub, { color: colors.accent }]}>Official · updates & actions</Text>
            ) : isLocalNotes ? (
              <Text style={[st.headerSub, { color: colors.textMuted }]}>Private · stored on this device</Text>
            ) : !networkOnline && !canPostToChannel ? (
              <Text style={[st.headerSub, { color: "#FF9500" }]}>Waiting for network...</Text>
             ) : chatInfo?.is_channel ? (
              <Text style={[st.headerSub, { color: colors.textMuted }]}>
                {headerSubtitle ?? "Public"}
              </Text>
            ) : chatInfo?.is_group ? (
              <Text style={[st.headerSub, { color: colors.textMuted }]}>Group chat</Text>
            ) : (() => {
              const ls = formatLastSeen(chatInfo?.other_last_seen, chatInfo?.other_show_online_status);
              return <Text style={[st.headerSub, { color: ls.isOnline ? "#34C759" : colors.textMuted }]}>{ls.text}</Text>;
            })()}
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          {chatInfo?.is_group && iAmChatAdmin && (
            <TouchableOpacity style={st.headerAction} hitSlop={8} onPress={handleOpenAddMembers}>
              <Ionicons name="person-add" size={20} color={colors.text} />
            </TouchableOpacity>
          )}
          {/* Voice calls are available for direct AfuChat conversations. */}
          {chatInfo &&
            !chatInfo.is_group &&
            !chatInfo.is_channel &&
             !isLocalNotes &&
            !isSelfChat &&
            !isAfuAiDirectChat &&
            !isNotificationsChat &&
            chatInfo.other_id &&
            Platform.OS !== "web" &&
            !isExpoGo() &&
            callAvailable &&
            callStatus === "idle" &&
            (
            <TouchableOpacity
              hitSlop={12}
              activeOpacity={0.5}
              onPress={() => {
                if (callStartingRef.current) return;
                callStartingRef.current = true;
                const targetId = chatInfo.other_id;
                void callStart({
                  calleeId: targetId,
                  calleeName: chatInfo.other_name ?? "AfuChat user",
                  calleeAvatar: chatInfo.other_avatar ?? null,
                  chatId: (isDraft ? realChatId : id as string) ?? null,
                }).then((callId) => {
                  router.push({ pathname: "/call/[id]", params: { id: callId } } as any);
                }).catch(() => {}).finally(() => {
                  callStartingRef.current = false;
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Call ${chatInfo.other_name ?? "this user"}`}
            >
              <Ionicons
                name="call-outline"
                size={22}
                color={colors.text}
              />
            </TouchableOpacity>
          )}
          {chatInfo && (
            <TouchableOpacity style={st.headerAction} hitSlop={8} onPress={() => setShowChatOptions(true)}>
              <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── In-chat search bar ─────────────────────────────────────────────── */}
      {searchActive && (
        <Animated.View style={[st.searchBar, {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          opacity: chatSearchAnim,
          transform: [
            { translateX: chatSearchAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            { scaleX: chatSearchAnim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
          ],
        }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            ref={searchInputRef}
            style={[st.searchInput, { color: colors.text }]}
            placeholder="Search messages…"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={(t) => { setSearchQuery(t); setSearchCursor(0); }}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Text style={[st.searchCount, { color: colors.textMuted }]}>
              {searchMatchIndices.length > 0
                ? `${searchCursor + 1} / ${searchMatchIndices.length}`
                : "No results"}
            </Text>
          )}
          <TouchableOpacity
            hitSlop={8}
            disabled={searchMatchIndices.length === 0}
            onPress={() => setSearchCursor((c) => (c - 1 + searchMatchIndices.length) % searchMatchIndices.length)}
          >
            <Ionicons name="chevron-up" size={20}
              color={searchMatchIndices.length > 0 ? colors.text : colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            hitSlop={8}
            disabled={searchMatchIndices.length === 0}
            onPress={() => setSearchCursor((c) => (c + 1) % searchMatchIndices.length)}
          >
            <Ionicons name="chevron-down" size={20}
              color={searchMatchIndices.length > 0 ? colors.text : colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            hitSlop={8}
            onPress={() => { setSearchActive(false); setSearchQuery(""); setSearchCursor(0); setHighlightedMsgId(null); }}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Stranger message-request banner ── */}
      {isStranger && chatInfo?.other_id && !isNotificationsChat && (
        <View style={[st.strangerBanner, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <View style={[st.strangerIconWrap, { backgroundColor: "#FF9500" + "18" }]}>
              <Ionicons name="person-add" size={18} color="#FF9500" />
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
              <Ionicons name="chatbubble" size={13} color="#fff" />
              <Text style={st.strangerBtnText}>Accept & Reply</Text>
            </TouchableOpacity>
            {(
              <TouchableOpacity
                style={[st.strangerBtnOutline, { borderColor: colors.border }]}
                onPress={async () => {
                  try {
                    const Contacts = await import("expo-contacts");
                    const { status } = await Contacts.requestPermissionsAsync();
                    if (status !== "granted") { showAlert("Permission needed", "Allow contacts access to save this person."); return; }
                    const rawName: string = chatInfo?.other_name || "Unknown";
                    const parts = rawName.trim().split(/\s+/);
                    const firstName = parts[0] ?? rawName;
                    const lastName = parts.slice(1).join(" ") || undefined;
                    const contactData: any = {
                      [Contacts.Fields.FirstName]: firstName,
                      ...(lastName ? { [Contacts.Fields.LastName]: lastName } : {}),
                    };
                    await Contacts.presentFormAsync(null, contactData, { isNew: true });
                    setIsStranger(false);
                  } catch {}
                }}
              >
                <Ionicons name="person-add" size={13} color={colors.text} />
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
              <Ionicons name="person" size={13} color={colors.text} />
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
                    if (router.canGoBack()) router.back(); else router.replace("/(tabs)/chats" as any);
                  }},
                ]);
              }}
            >
              <Ionicons name="ban" size={13} color="#FF3B30" />
              <Text style={[st.strangerBtnOutlineText, { color: "#FF3B30" }]}>Block</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Message list — fills remaining space, padded so content clears the floating input ── */}
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {loading ? (
          <ChatLoadingSkeleton />
        ) : messages.length === 0 ? (
          <View style={[st.emptyState, { paddingBottom: floatingInputHeight + 16 }]}>
            {isSelfChat ? (
              <>
                <View style={[st.emptyIconWrap, { backgroundColor: "#5856D614" }]}>
                  <Ionicons name="bookmark" size={48} color="#5856D6" />
                </View>
                <Text style={[st.emptyTitle, { color: colors.text }]}>My Notes</Text>
                <Text style={[st.emptySub, { color: colors.textMuted }]}>
                  Send yourself messages, links, ideas or reminders. Only you can see this.
                </Text>
              </>
            ) : (
              <>
                <View style={[st.emptyIconWrap, { backgroundColor: BRAND + "14" }]}>
                  <Ionicons name="chatbubbles" size={48} color={BRAND} />
                </View>
                <Text style={[st.emptyTitle, { color: colors.text }]}>No messages yet</Text>
                <Text style={[st.emptySub, { color: colors.textMuted }]}>
                  Say hello to start the conversation
                </Text>
              </>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <FlatList
              ref={flatListRef}
              data={listData}
              keyExtractor={(m) => m.id}
              extraData={[highlightedMsgId, lensCardMsg?.id, searchActive, searchMatchIndices.length, searchCursor, isAfuAiTyping]}
              renderItem={renderMessage}
              inverted
              contentContainerStyle={[st.listContent, { paddingTop: floatingInputHeight + effectiveBottom + 16 }]}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="none"
              keyboardShouldPersistTaps="always"
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onEndReached={loadMoreMessages}
              onEndReachedThreshold={0.3}
              windowSize={5}
              initialNumToRender={20}
              maxToRenderPerBatch={8}
              updateCellsBatchingPeriod={50}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                }, 300);
              }}
              ListHeaderComponent={
                <>
                  {(typingUsers.length > 0 || (isAfuAiDirectChat && isAfuAiTyping)) && (
                    <TypingBubble colors={colors} />
                  )}
                </>
              }
              ListFooterComponent={
                loadingMore
                  ? <View style={{ paddingTop: 8, gap: 2 }}>
                      <ChatBubbleSkeleton align="left" width={180} />
                      <ChatBubbleSkeleton align="right" width={140} />
                      <ChatBubbleSkeleton align="left" width={200} />
                    </View>
                  : null
              }
            />
            <Animated.View
              style={[st.scrollFab, { opacity: scrollBtnOpacity, backgroundColor: colors.surface, bottom: effectiveBottom + floatingInputHeight + 8, pointerEvents: showScrollBtn ? "auto" : "none" }]}
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
      <Animated.View
        style={[st.floatingInputContainer, {
          bottom: showEmojiStickerPicker && !keyboardHeight ? effectiveBottom : keyboardOffsetAnim,
          display: isNotificationsChat ? "none" : "flex",
          pointerEvents: "box-none",
        }]}
        onLayout={(e) => setFloatingInputHeight(e.nativeEvent.layout.height)}
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

        {advancedFeatures.user_tagging && mentionQuery !== null && mentionSuggestions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            style={{ maxHeight: 52, borderTopColor: colors.border, backgroundColor: colors.surface }}
            contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 7, gap: 8, flexDirection: "row" }}
          >
            {mentionSuggestions.map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => {
                  const replaced = input.replace(/@\w*$/, `@${s.handle} `);
                  setInput(replaced);
                  setMentionQuery(null);
                  setMentionSuggestions([]);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.inputBg, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 }}
                activeOpacity={0.7}
              >
                <Avatar uri={s.avatar_url} name={s.display_name} size={22} />
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }}>@{s.handle}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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

        {(attachmentPreview || selectedImages.length > 0) && (
          <View style={[st.attachPreviewBar, {
            // Keep the attachment section opaque; only its controls adapt
            // their ink color to the current theme.
            backgroundColor: isDark ? "#1C1C1E" : colors.inputBg,
            borderColor: isDark ? "rgba(255,255,255,0.22)" : colors.border,
          }]}>
            {selectedImages.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.multiAttachScroll}>
                {selectedImages.map((image, index) => (
                  <TouchableOpacity
                    key={`${image.uri}-${index}`}
                    style={st.multiAttachItem}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (image.type === "image") setEditingImageIndex(index);
                    }}
                  >
                    {image.type === "image" ? (
                      <Image source={{ uri: image.uri }} style={st.attachPreviewImg} />
                    ) : (
                      <View style={[st.attachPreviewFile, { backgroundColor: isDark ? "#1C1C1E" : colors.inputBg }]}>
                        <Ionicons
                          name={image.type === "video" ? "videocam" : "document"}
                          size={22}
                          color={isDark ? "#fff" : "#000"}
                        />
                        <Text style={[st.attachPreviewName, { color: isDark ? "#fff" : "#000" }]} numberOfLines={2}>
                          {image.name || (image.type === "video" ? "Video" : "Shared file")}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={st.multiAttachRemove}
                      onPress={(event) => {
                        event.stopPropagation();
                        setSelectedImages((prev) => prev.filter((_, i) => i !== index));
                      }}
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={13} color="#fff" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : attachmentPreview?.type === "image" ? (
              <Image source={{ uri: attachmentPreview.uri }} style={st.attachPreviewImg} />
            ) : attachmentPreview?.type === "video" ? (
              <View style={[st.attachPreviewFile, { backgroundColor: isDark ? "#1C1C1E" : colors.inputBg }]}>
                <Ionicons name="videocam" size={20} color={isDark ? "#fff" : "#000"} />
                {attachmentPreview.trimStart != null && attachmentPreview.trimEnd != null && (
                  <Text style={[st.attachPreviewName, { color: isDark ? "#fff" : "#000", fontSize: 11 }]}>
                    {(() => { const d = attachmentPreview.trimEnd! - attachmentPreview.trimStart!; const m = Math.floor(d/60); const s = Math.floor(d%60); return `${m}:${s.toString().padStart(2,"0")}`; })()}
                  </Text>
                )}
              </View>
            ) : (
              <View style={[st.attachPreviewFile, { backgroundColor: isDark ? "#1C1C1E" : colors.inputBg }]}>
                <Ionicons name="document" size={20} color={isDark ? "#fff" : "#000"} />
                <Text style={[st.attachPreviewName, { color: isDark ? "#fff" : "#000" }]} numberOfLines={1}>{attachmentPreview?.name || "File"}</Text>
              </View>
            )}
            {selectedImages.length === 0 && <View style={{ flex: 1, paddingHorizontal: 10 }}>
               <Text style={{ color: isDark ? "#fff" : "#000", fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
                {attachmentPreview?.type === "image" ? "Photo"
                  : attachmentPreview?.type === "video" ? (attachmentPreview.trimStart != null ? "Trimmed clip" : "Video")
                  : attachmentPreview?.name || "File"}
              </Text>
            </View>}
            {attachmentPreview?.type === "video" && (
              <TouchableOpacity
                onPress={() => {
                  if (!attachmentPreview) return;
                  setPendingVideoUri({ uri: attachmentPreview.uri, mimeType: attachmentPreview.mimeType || "video/mp4" });
                  setShowVideoTrimmer(true);
                }}
                 style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: isDark ? "#2A2A2E" : "#E8E8E8", marginRight: 4 }}
                hitSlop={8}
              >
                 <Ionicons name="cut" size={16} color={isDark ? "#fff" : "#000"} />
              </TouchableOpacity>
            )}
            {selectedImages.length === 0 && (
              <TouchableOpacity onPress={() => setAttachmentPreview(null)} style={st.attachPreviewClose} hitSlop={8}>
                 <Ionicons name="close-circle" size={22} color={isDark ? "#fff" : "#000"} />
              </TouchableOpacity>
            )}
          </View>
        )}

        <Modal
          visible={editingImageIndex !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingImageIndex(null)}
        >
          <View style={st.imageEditorBackdrop}>
            {editingImageIndex !== null && selectedImages[editingImageIndex] && (
              <Image
                source={{ uri: selectedImages[editingImageIndex].uri }}
                style={st.imageEditorImage}
                resizeMode="contain"
              />
            )}
            <View style={st.imageEditorTools}>
              <TouchableOpacity
                onPress={() => applyImageEdit("rotate")}
                style={st.imageEditorTool}
                accessibilityLabel="Rotate image"
              >
                <Ionicons name="refresh" size={22} color="#fff" />
                <Text style={st.imageEditorToolText}>Rotate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => applyImageEdit("flip")}
                style={st.imageEditorTool}
                accessibilityLabel="Flip image"
              >
                <Ionicons name="swap-horizontal" size={22} color="#fff" />
                <Text style={st.imageEditorToolText}>Flip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditingImageIndex(null)}
                style={[st.imageEditorTool, st.imageEditorDone]}
              >
                <Text style={st.imageEditorDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {messageGateStatus === "limited" ? (
          <View style={[st.inputFloatOuter, st.limitedFloatOuter, { paddingBottom: Math.max(insets.bottom + 6, 14) }]}>
            <View style={[st.limitedGlass, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="lock-closed" size={15} color={colors.textMuted} style={{ marginRight: 8 }} />
              <Text
                style={[st.limitedText, { color: colors.textSecondary }]}
                numberOfLines={3}
                ellipsizeMode="tail"
              >
                {messageLimitNotice}
              </Text>
            </View>
          </View>
        ) : isRecording && recLocked ? (
          <View style={[st.inputFloatOuter, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <View style={[st.inputGlassPill, {
              backgroundColor: isDark ? "rgba(255,255,255,0.12)" : colors.inputBg,
              borderColor: isDark ? "rgba(255,255,255,0.22)" : colors.border,
            }]}>
              <View style={st.recLockedInner}>
                <TouchableOpacity onPress={cancelVoiceRecording} hitSlop={12} style={st.recLockedTrash}>
                  <Ionicons name="trash" size={20} color="#FF3B30" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={toggleRecordingPause}
                  hitSlop={10}
                  style={[st.recPauseBtn, { backgroundColor: isRecordingPaused ? BRAND + "20" : colors.inputBg }]}
                >
                  <Ionicons name={isRecordingPaused ? "play" : "pause"} size={17} color={isRecordingPaused ? BRAND : colors.textSecondary} />
                </TouchableOpacity>
                <VoiceWaveform active={isRecording} color={BRAND} amplitudes={recAmplitudes} />
                <Text style={[st.recordingText, { color: colors.text, marginLeft: 8, flex: 1 }]}>
                  {isRecordingPaused ? "Paused · " : ""}
                  {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")}
                </Text>
                <TouchableOpacity onPress={stopVoiceRecording} style={[st.sendBtn, { backgroundColor: BRAND }]}>
                  <Ionicons name="send" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : chatInfo?.is_channel && !canPostToChannel ? (
          !channelMembershipKnown ? (
            // Keep membership resolution invisible. The chat remains usable
            // while access is checked, then the correct bottom action appears
            // once the result is known.
            null
          ) : !isChannelMember ? (
            <View style={[st.channelJoinBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[st.channelJoinTitle, { color: colors.text }]}>Join this channel</Text>
                <Text style={[st.channelReadOnlyText, { color: colors.textMuted }]}>Join to receive channel updates.</Text>
              </View>
              <TouchableOpacity
                onPress={() => void joinCurrentChannel()}
                disabled={joiningChannel}
                style={[st.channelJoinButton, { backgroundColor: BRAND }]}
                activeOpacity={0.8}
              >
                {joiningChannel ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.channelJoinButtonText}>Join</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[st.channelReadOnlyBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <Ionicons name={isMuted ? "volume-mute" : "megaphone"} size={16} color={colors.textMuted} />
              <Text style={[st.channelReadOnlyText, { color: colors.textMuted, flex: 1 }]}>
                {isMuted ? "Channel muted" : "Channel updates"}
              </Text>
              <TouchableOpacity
                onPress={() => void (isMuted ? handleUnmuteChat() : handleMuteChat(null))}
                style={[st.channelMuteButton, { backgroundColor: colors.inputBg }]}
                activeOpacity={0.7}
              >
                <Ionicons name={isMuted ? "notifications-outline" : "notifications-off-outline"} size={15} color={colors.textSecondary} />
                <Text style={[st.channelMuteButtonText, { color: colors.textSecondary }]}>
                  {isMuted ? "Unmute" : "Mute"}
                </Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          <>
            {!isRecording && (chatInfo?.is_group || chatInfo?.is_channel) && (
              <SmartReplyBar messages={messages} myId={user?.id || ""} input={input} onSend={handleSmartReply} colors={colors} />
            )}
            <View style={[st.inputFloatOuter, { paddingBottom: Math.max(insets.bottom, 8) }]}>
              <FormatToolbar
                visible={inputSelection.start < inputSelection.end && input.length > 0}
                selection={inputSelection}
                value={input}
                onFormat={(newText) => { setInput(newText); saveDraft(newText); setInputSelection({ start: 0, end: 0 }); }}
                onClose={() => setInputSelection({ start: 0, end: 0 })}
              />
              {/* Pill + action button sit side-by-side; mic/send is outside the pill */}
              <View style={st.inputRowOuter}>
                <View style={[st.inputGlassPill, {
                  flex: 1,
                  backgroundColor: isDark ? "rgba(255,255,255,0.12)" : colors.inputBg,
                  borderColor: isDark ? "rgba(255,255,255,0.22)" : colors.border,
                  }, isRecording && !recLocked ? st.recHoldGlass : undefined]}>
                  <View style={st.inputBarRow}>
                    {isRecording && !recLocked ? (
                      <>
                        <TouchableOpacity onPress={cancelVoiceRecording} hitSlop={12} style={st.recTrashBtn}>
                          <Ionicons name="trash" size={20} color="#FF3B30" />
                        </TouchableOpacity>
                        <View style={st.recWaveRow}>
                          <VoiceWaveform active={isRecording} color={BRAND} amplitudes={recAmplitudes} />
                          <Text style={[st.recordingText, { color: colors.text, marginLeft: 8 }]}>
                            {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")}.{recordingTenths}
                          </Text>
                        </View>
                        <View style={st.recCancelHint}>
                          <Ionicons name="chevron-back" size={12} color={colors.textMuted} />
                          <Text style={[st.recSlideText, { color: colors.textMuted }]}>Cancel</Text>
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
                            setShowAttachPanel(false);
                            setShowEmojiStickerPicker(true);
                          }
                        }}>
                          <Ionicons name={showEmojiStickerPicker ? "keypad" : "happy"} size={23} color={colors.textMuted} />
                        </TouchableOpacity>
                        <TextInput
                          ref={chatInputRef}
                          style={[st.input, { color: colors.text }]}
                          placeholder="Message"
                          placeholderTextColor={colors.textMuted}
                          value={input}
                          onChangeText={(t) => {
                            setInput(t);
                            handleTyping();
                            saveDraft(t);
                            if (advancedFeatures.user_tagging) {
                              const atMatch = t.match(/@(\w*)$/);
                              if (atMatch) {
                                setMentionQuery(atMatch[1]);
                                fetchMentionSuggestions(atMatch[1]);
                              } else {
                                setMentionQuery(null);
                                setMentionSuggestions([]);
                              }
                            }
                          }}
                          onFocus={() => {
                            if (showEmojiStickerPicker) setShowEmojiStickerPicker(false);
                            if (showAttachPanel) setShowAttachPanel(false);
                          }}
                          onSelectionChange={(e) => {
                            const sel = e.nativeEvent.selection;
                            // Always debounce — never fire setInputSelection synchronously.
                            // Keyboard autocomplete on Android selects the word it will
                            // replace BEFORE firing onChangeText. An immediate setState here
                            // causes a re-render that forces value={input} back onto the
                            // native text mid-replacement, cutting the autocomplete suggestion.
                            if (selectionClearTimer.current) clearTimeout(selectionClearTimer.current);
                            selectionClearTimer.current = setTimeout(() => setInputSelection(sel), 150);
                          }}
                          multiline
                          maxLength={4000}
                          returnKeyType={chatPrefs.enter_to_send ? "send" : "default"}
                          blurOnSubmit={false}
                          onSubmitEditing={chatPrefs.enter_to_send ? () => sendMessage() : undefined}
                        />
                        {!input.trim() && (
                          <>
                            {!chatInfo?.is_group && !chatInfo?.is_channel && !isAfuAiDirectChat && !isLocalNotes && (
                              <TouchableOpacity onPress={() => setShowGiftPicker(true)} hitSlop={8} style={st.pillIcon}>
                                <Ionicons name="gift" size={22} color={colors.textMuted} />
                              </TouchableOpacity>
                            )}
                            {(chatInfo?.is_group || chatInfo?.is_channel) && (
                              <TouchableOpacity onPress={() => setShowRedEnvelope(true)} hitSlop={8} style={st.pillIcon}>
                                <Text style={{ fontSize: 19 }}>🧧</Text>
                              </TouchableOpacity>
                            )}
                            {!isAfuAiDirectChat && !isLocalNotes && (
                              <TouchableOpacity onPress={() => {
                                Keyboard.dismiss();
                                setShowEmojiStickerPicker(false);
                                setShowAttachPanel((v) => !v);
                              }} hitSlop={8} style={st.pillIcon}>
                                {/* Bigger attach icon — easier to tap */}
                                <Ionicons name={showAttachPanel ? "close" : "attach"} size={26} color={showAttachPanel ? colors.accent : colors.textMuted} style={showAttachPanel ? undefined : { transform: [{ rotate: "-45deg" }] }} />
                              </TouchableOpacity>
                            )}
                          </>
                        )}
                      </View>
                    )}
                  </View>
                </View>

                {/* ── Mic / Send button — separated from the input pill ── */}
                <View style={st.outerActionBtn}>
                  {isRecording && !recLocked && (
                    <View style={st.recLockHint}>
                      <Ionicons name="chevron-up" size={14} color={colors.textMuted} />
                    </View>
                  )}
                  {(input.trim() || attachmentPreview || selectedImages.length > 0) && !isRecording ? (
                    <View style={st.sendBtnCol}>
                      {input.trim().length > 50 && !editingMessage && !attachmentPreview && selectedImages.length === 0
                        ? (
                          <TouchableOpacity
                            onPress={() => { Keyboard.dismiss(); setShowAiEditor(true); }}
                            hitSlop={8}
                            style={[st.aiAboveSendBtn, { backgroundColor: BRAND + "18", borderColor: BRAND + "50" }]}
                          >
                            <Text style={{ color: BRAND, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>Ai</Text>
                            <Text style={[st.wordCountLabel, { color: BRAND }]}>{input.trim().split(/\s+/).filter(Boolean).length}w</Text>
                          </TouchableOpacity>
                        ) : <View />}
                      <TouchableOpacity
                        onPress={editingMessage ? saveEditMessage : (attachmentPreview || selectedImages.length > 0) ? sendAttachment : () => sendMessage()}
                        disabled={sending}
                        style={[st.sendBtn, { backgroundColor: editingMessage ? "#FF9500" : BRAND }]}
                      >
                        {sending ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Ionicons
                            name={editingMessage ? "checkmark" : "send"}
                            size={18}
                            color="#fff"
                            style={editingMessage ? undefined : { transform: [{ rotate: "-45deg" }] }}
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : isLocalNotes ? (
                    <View style={[st.sendBtn, { backgroundColor: colors.textMuted + "28" }]}>
                      <Ionicons name="lock-closed" size={17} color={colors.textMuted} />
                    </View>
                  ) : (
                    <View style={isRecording && !recLocked ? st.recMicWrap : undefined}>
                      {_reanimatedEnabled ? (
                        <GestureDetector gesture={micGesture}>
                          <View style={isRecording && !recLocked ? [st.recMicBtn, { backgroundColor: BRAND, ...Platform.select({ default: { shadowColor: BRAND } }) }] : [st.sendBtn, { backgroundColor: BRAND }]}>
                            <Ionicons name="mic" size={isRecording ? 24 : 20} color="#fff" />
                          </View>
                        </GestureDetector>
                      ) : (
                        <Pressable
                          onPressIn={onRecStart}
                          onPressOut={() => { if (recStartedSV.value) onRecLock(); else onRecCancel(); }}
                          style={isRecording && !recLocked ? [st.recMicBtn, { backgroundColor: BRAND }] : [st.sendBtn, { backgroundColor: BRAND }]}
                        >
                          <Ionicons name="mic" size={isRecording ? 24 : 20} color="#fff" />
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </View>
          </>
        )}

      </Animated.View>

      {/* ── Emoji / sticker keyboard — anchored to screen bottom, same position as system keyboard ── */}
      {/* NOTE: always keep this mounted while showEmojiStickerPicker=true so the
          inner tab/search state is never reset by an unmount/remount cycle.
          Closing on unexpected keyboard events is handled by the useEffect above. */}
      {showEmojiStickerPicker && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            // Float above system keyboard when search is open; sit at bottom otherwise.
            bottom: keyboardHeight,
            height: emojiKeyboardHeight + (keyboardHeight ? 0 : insets.bottom),
            backgroundColor: colors.surface,
            zIndex: 50,
          }}
        >
          <EmojiStickerPicker
            height={emojiKeyboardHeight}
            onEmojiSelected={(emoji) => setInput((prev) => prev + emoji)}
            onSendSticker={sendStickerMessage}
            onSendGif={async (url) => {
              setShowEmojiStickerPicker(false);
              if (!user) return;
              if (isLocalNotes) {
                showAlert("My Notes", "GIFs are available only in online chats.");
                return;
              }
              if (blockMessageAction()) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const activeChatId = await getOrCreateChatId();
              if (!activeChatId) return;
              const { data: insertedGif, error: gifError } = await supabase
                .from("messages")
                .insert({ chat_id: activeChatId, sender_id: user.id, encrypted_content: "GIF", attachment_url: url, attachment_type: "gif" })
                .select("id")
                .single();
              if (!gifError && insertedGif?.id) {
                notifyInsertedChatMessage({
                  chatId: activeChatId,
                  messageId: insertedGif.id,
                  body: "GIF",
                  attachmentUrl: url,
                  attachmentType: "gif",
                });
              }
              loadMessages();
            }}
            onDelete={() => setInput((prev) => {
              if (!prev) return prev;
              // slice(0, -1) only removes 1 UTF-16 code unit — emojis are
              // multi-codepoint grapheme clusters (e.g. 👨‍👩‍👧 = 12 units).
              // Intl.Segmenter (supported in Hermes RN 0.73+) segments by
              // grapheme cluster so we always delete exactly one visible character.
              try {
                const segs = [...new Intl.Segmenter().segment(prev)];
                return segs.length ? prev.slice(0, segs[segs.length - 1].index) : "";
              } catch {
                // Fallback: strip the last Unicode code point (handles basic emoji)
                return prev.replace(/[\s\S]$/u, "");
              }
            })}
             onClose={() => { setShowEmojiStickerPicker(false); }}
          />
          {insets.bottom > 0 && (
            <View style={{ height: insets.bottom, backgroundColor: colors.surface }} />
          )}
        </View>
      )}

      {/* ── Attachment actions — separate surface above the composer ─────── */}
      {showAttachPanel && (
        (() => {
          const contentH = attachTab === "Gallery" ? 126 : 330;

          const isDM = !!chatInfo && !chatInfo.is_group && !chatInfo.is_channel;
          const renderContent = () => {
            if (attachTab === "Gallery") {
              // Native: clean picker cards — opens the device's native gallery/file picker
              const NATIVE_PICKS = [
                {
                  label: "Photos (up to 6)",
                  icon: "images" as const,
                  color: "#007AFF",
                  onPress: async () => {
                    setShowAttachPanel(false);
                    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (!perm.granted) return;
                    const res = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ["images"] as any,
                      allowsEditing: false,
                      allowsMultipleSelection: true,
                      selectionLimit: 6,
                      quality: pickerQuality,
                    });
                    if (!res.canceled && res.assets?.length) {
                      setAttachmentPreview(null);
                      setSelectedImages(res.assets.slice(0, 6).map((a) => ({
                        uri: a.uri, type: "image", mimeType: a.mimeType || "image/jpeg",
                      })));
                    }
                  },
                },
                {
                  label: "Camera",
                  icon: "camera" as const,
                  color: "#FF3B30",
                  onPress: () => { setShowAttachPanel(false); pickFromCamera(); },
                },
                {
                  label: "Audio File",
                  icon: "musical-notes" as const,
                  color: "#30D158",
                  onPress: async () => {
                    setShowAttachPanel(false);
                    try {
                      const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
                      if (!res.canceled && res.assets?.[0]) {
                        const d = res.assets[0];
                        setAttachmentPreview({ uri: d.uri, type: "file", name: d.name, mimeType: d.mimeType ?? "audio/mpeg" });
                      }
                    } catch { /* ignore */ }
                  },
                },
                {
                  label: "Document",
                  icon: "document-text" as const,
                  color: "#5E5CE6",
                  onPress: async () => {
                    setShowAttachPanel(false);
                    try {
                      const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
                      if (!res.canceled && res.assets?.[0]) {
                        const d = res.assets[0];
                        setAttachmentPreview({ uri: d.uri, type: "file", name: d.name, mimeType: d.mimeType ?? "application/octet-stream" });
                      }
                    } catch { /* ignore */ }
                  },
                },
                {
                  label: "Wallet",
                  icon: "wallet" as const,
                  color: "#34C759",
                  onPress: () => {
                    if (!chatInfo?.other_id || chatInfo.is_group || chatInfo.is_channel) {
                      showAlert("Wallet", "Payments are available only in direct chats.");
                      return;
                    }
                    setShowAttachPanel(false);
                    Keyboard.dismiss();
                    openApp("afupay", {
                      initialRecipientId: chatInfo.other_id,
                      paymentReference: `Payment to ${chatInfo.other_name || "this user"}`,
                    });
                  },
                },
              ];
                return (
                  <View style={{ flex: 1, backgroundColor: colors.surface }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 11, paddingBottom: 7 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: BRAND }} />
                        <Text style={{ color: colors.text, fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>
                          ATTACHMENTS
                        </Text>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" }}>
                        Choose an option
                      </Text>
                    </View>
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "stretch", gap: 7, paddingHorizontal: 10, paddingBottom: 10 }}>
                      {NATIVE_PICKS.map((pick) => (
                        <TouchableOpacity
                          key={pick.label}
                          activeOpacity={0.78}
                          onPress={pick.onPress}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            alignItems: "center",
                            justifyContent: "center",
                            paddingHorizontal: 2,
                            borderRadius: 14,
                            backgroundColor: isDark ? `${pick.color}20` : `${pick.color}12`,
                            borderWidth: 1,
                            borderColor: isDark ? `${pick.color}70` : `${pick.color}45`,
                          }}
                        >
                          <View style={{ marginBottom: 5 }}>
                            <NativeAttachmentIcon name={pick.icon} color={pick.color} />
                          </View>
                          <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.75}
                            style={{ color: colors.text, fontSize: 10.5, lineHeight: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" }}
                          >
                            {pick.label === "Photos (up to 6)" ? "Photos" : pick.label}
                          </Text>
                          {pick.label === "Photos (up to 6)" && (
                            <Text style={{ color: colors.textMuted, fontSize: 8.5, lineHeight: 11, fontFamily: "Inter_400Regular" }}>Up to 6</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
            }


            if (attachTab === "Contact") {
              if (contactsLoading) {
                return (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator color="#007AFF" size="large" />
                    <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 10, fontFamily: "Inter_400Regular" }}>Loading contacts…</Text>
                  </View>
                );
              }
              if (contactList.length === 0) {
                return (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 }}>
                    <Ionicons name="people" size={40} color={colors.textMuted} />
                    <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.text }}>No contacts found</Text>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center" }}>
                      Allow contacts access in your device settings to share contacts here.
                    </Text>
                  </View>
                );
              }
              const q = contactSearch.toLowerCase().trim();
              const filtered = q
                ? contactList.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
                : contactList;
              return (
                <View style={{ flex: 1 }}>
                  {/* Search bar */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 12, height: 38, borderRadius: 12, backgroundColor: colors.inputBg, gap: 8 }}>
                    <Ionicons name="search" size={16} color={colors.textMuted} />
                    <TextInput
                      value={contactSearch}
                      onChangeText={setContactSearch}
                      placeholder="Search contacts…"
                      placeholderTextColor={colors.textMuted}
                      style={{ flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.text, outlineStyle: "none" as any }}
                    />
                    {contactSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setContactSearch("")} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <FlatList
                    data={filtered}
                    keyExtractor={(c) => c.id}
                    key="contacts-share"
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                      <View style={{ alignItems: "center", paddingTop: 32 }}>
                        <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" }}>No contacts match "{contactSearch}"</Text>
                      </View>
                    }
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        disabled={contactSending === item.id}
                        onPress={async () => {
                          setContactSending(item.id);
                          try {
                            const activeChatId = await getOrCreateChatId();
                            if (!activeChatId || !user) return;
                            const { data: insertedContact } = await supabase.from("messages").insert({
                              chat_id: activeChatId,
                              sender_id: user.id,
                              encrypted_content: `👤 ${item.name}${item.phone ? `\n${item.phone}` : ""}`,
                            }).select("id").single();
                            notifyInsertedChatMessage({
                              chatId: activeChatId,
                              messageId: insertedContact?.id,
                              body: `👤 ${item.name}${item.phone ? `\n${item.phone}` : ""}`,
                              attachmentType: "contact",
                            });
                            setShowAttachPanel(false);
                          } catch { showAlert("Error", "Could not send contact."); }
                          setContactSending(null);
                        }}
                        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, gap: 12 }}
                      >
                        {/* Avatar / initials */}
                        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#007AFF22", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#007AFF" }}>{item.initials}</Text>
                        </View>
                        {/* Name + phone */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }} numberOfLines={1}>{item.name}</Text>
                          {item.phone ? <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>{item.phone}</Text> : null}
                        </View>
                        {/* Send indicator */}
                        {contactSending === item.id ? (
                          <ActivityIndicator size="small" color="#007AFF" />
                        ) : (
                          <Ionicons name="arrow-forward-circle" size={22} color="#007AFF" />
                        )}
                      </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: colors.border, marginLeft: 70 }} />}
                  />
                </View>
              );
            }

            if (attachTab === "Poll") {
              return (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#FF6B3520", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="bar-chart" size={32} color="#FF6B35" />
                  </View>
                  <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.text }}>Create a Poll</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textMuted, textAlign: "center" }}>
                    Coming soon. Polls let everyone vote on a question.
                  </Text>
                </View>
              );
            }

            if (attachTab === "Wallet") {
              const isGroup = chatInfo?.is_group || chatInfo?.is_channel;
              if (isGroup) {
                return (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 }}>
                    <Ionicons name="wallet-outline" size={44} color={colors.textMuted} />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.textMuted, textAlign: "center", lineHeight: 20 }}>Payments are only available{"\n"}in direct messages.</Text>
                  </View>
                );
              }
              const acoinBal = profile?.acoin ?? 0;
              const nexaBal = profile?.xp ?? 0;
              const currentBal = walletCurrency === "acoin" ? acoinBal : nexaBal;
              const acoinColor = "#10B981";
              const nexaColor = "#FF9500";
              const activeColor = walletCurrency === "acoin" ? acoinColor : nexaColor;
              const amtNum = parseInt(walletAmount || "0", 10);
              const overLimit = walletAmount !== "" && amtNum > currentBal;
              const canSend = !walletSending && walletAmount !== "" && amtNum > 0 && !overLimit;
              return (
                <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 6 }}>

                  {/* ── Currency pill toggle ── */}
                  <View style={{ flexDirection: "row", backgroundColor: colors.inputBg, borderRadius: 14, padding: 3, marginBottom: 16 }}>
                    {(["acoin", "nexa"] as const).map((cur) => {
                      const active = walletCurrency === cur;
                      const c = cur === "acoin" ? acoinColor : nexaColor;
                      const bal = cur === "acoin" ? acoinBal : nexaBal;
                      return (
                        <TouchableOpacity
                          key={cur}
                          activeOpacity={0.75}
                          onPress={() => { setWalletCurrency(cur); setWalletAmount(""); }}
                          style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 11, backgroundColor: active ? c : "transparent" }}
                        >
                          <Ionicons name={cur === "acoin" ? "cash" : "flash"} size={15} color={active ? "#fff" : colors.textMuted} />
                          <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: active ? "#fff" : colors.textMuted }}>
                            {cur === "acoin" ? "ACoin" : "Nexa"}
                          </Text>
                          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: active ? "rgba(255,255,255,0.72)" : colors.textMuted }}>
                            {bal.toLocaleString()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* ── Big amount display ── */}
                  <View style={{ alignItems: "center", marginBottom: 16 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name={walletCurrency === "acoin" ? "cash" : "flash"} size={22} color={overLimit ? "#FF3B30" : activeColor} />
                      <TextInput
                        value={walletAmount}
                        onChangeText={(v) => setWalletAmount(v.replace(/[^0-9]/g, ""))}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        style={{ fontSize: 40, fontFamily: "Inter_700Bold", color: overLimit ? "#FF3B30" : colors.text, minWidth: 60, outlineStyle: "none" as any, textAlign: "center" }}
                      />
                    </View>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: overLimit ? "#FF3B30" : colors.textMuted, marginTop: 2 }}>
                      {overLimit
                        ? `Max ${currentBal.toLocaleString()} available`
                        : `Balance: ${currentBal.toLocaleString()} ${walletCurrency === "acoin" ? "ACoin" : "Nexa"}`}
                    </Text>
                  </View>

                  {/* ── Note input ── */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, height: 44, borderRadius: 22, backgroundColor: colors.inputBg, marginBottom: 14 }}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.textMuted} />
                    <TextInput
                      value={walletNote}
                      onChangeText={setWalletNote}
                      placeholder="Add a note…"
                      placeholderTextColor={colors.textMuted}
                      maxLength={120}
                      style={{ flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.text, outlineStyle: "none" as any }}
                    />
                    {walletNote !== "" && (
                      <TouchableOpacity onPress={() => setWalletNote("")} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* ── Send button ── */}
                  <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={handleInlineSendMoney}
                    disabled={!canSend}
                    style={{ height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: canSend ? activeColor : colors.inputBg }}
                  >
                    {walletSending
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <>
                          <Ionicons name="paper-plane" size={17} color={canSend ? "#fff" : colors.textMuted} />
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: canSend ? "#fff" : colors.textMuted }}>
                            {walletAmount && amtNum > 0
                              ? `Send ${amtNum.toLocaleString()} ${walletCurrency === "acoin" ? "ACoin" : "Nexa"}`
                              : "Send"}
                          </Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>
              );
            }

            return null;
          };

          return (
            <View style={[StyleSheet.absoluteFill, { pointerEvents: "box-none" }]}>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => setShowAttachPanel(false)}
              />
               <View style={{
                position: "absolute",
                  // This is intentionally an independent card. Keep clear
                  // space between it and the input so attachment actions do
                  // not look like part of the text field.
                 left: 12,
                 right: 12,
                 bottom: effectiveBottom + floatingInputHeight + 10,
                 maxHeight: 400,
                 backgroundColor: colors.inputBg,
                 borderRadius: 22,
                 borderWidth: 0.5,
                 borderColor: isDark ? "rgba(255,255,255,0.22)" : colors.border,
                 overflow: "hidden",
                 ...Platform.select({
                   web: { boxShadow: `0 5px 12px rgba(0,0,0,${isDark ? 0.24 : 0.12})` } as any,
                   default: {
                     shadowColor: "#000",
                     shadowOpacity: isDark ? 0.24 : 0.12,
                     shadowRadius: 12,
                     shadowOffset: { width: 0, height: 5 },
                     elevation: 8,
                   },
                 }),
              }}>
                <View style={{ height: contentH, overflow: "hidden" }}>
                  {renderContent()}
                </View>
              </View>
            </View>
          );
        })()
      )}

      <MiniProfilePopup
        userId={miniProfileUserId}
        visible={!!miniProfileUserId}
        onClose={() => setMiniProfileUserId(null)}
        currentChatId={chatInfo && !chatInfo.is_group && chatInfo.other_id === miniProfileUserId ? chatInfo.other_id : null}
      />

      {/* ── Message actions modal ─────────────────────────────────────── */}
      <Modal
        visible={!!showReactions}
        transparent
        animationType="fade"
        onRequestClose={closeMessageOptions}
      >
        <View style={st.messageOptionsOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMessageOptions} />
          {!isLocalNotes && chatPrefs.reactions_enabled && (
            <View style={[st.reactionFloatingGroup, { backgroundColor: colors.inputBg }]}>
              <View style={st.reactEmojiRow}>
                {REACTION_EMOJIS.map((emoji) => {
                  const alreadyReacted = showReactions?.reactions?.some((r) => r.emoji === emoji && r.myReaction);
                  return (
                    <TouchableOpacity
                      key={emoji}
                      style={[st.reactEmojiPillBtn, alreadyReacted && { transform: [{ scale: 1.18 }] }]}
                      onPress={() => {
                        if (!showReactions) return;
                        if (chatPrefs.send_haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        addReaction(showReactions, emoji);
                        setShowReactions(null);
                        setShowMoreEmojis(false);
                      }}
                    >
                      <Text style={st.reactEmojiPillText}>{emoji}</Text>
                      {alreadyReacted && <View style={[st.reactEmojiActiveDot, { backgroundColor: BRAND }]} />}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[st.reactEmojiPillBtn, showMoreEmojis && { transform: [{ scale: 1.08 }] }]}
                  onPress={() => setShowMoreEmojis((v) => !v)}
                >
                  <Ionicons name={showMoreEmojis ? "chevron-up" : "add"} size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              {showMoreEmojis && (
                <View style={st.reactMoreGridInline}>
                  {REACTION_EMOJIS_ADVANCED.filter((e) => !REACTION_EMOJIS.includes(e)).map((emoji) => {
                    const alreadyReacted = showReactions?.reactions?.some((r) => r.emoji === emoji && r.myReaction);
                    return (
                      <TouchableOpacity
                        key={emoji}
                        style={[st.reactMoreGridBtn, alreadyReacted && { transform: [{ scale: 1.14 }] }]}
                        onPress={() => {
                          if (!showReactions) return;
                          if (chatPrefs.send_haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          addReaction(showReactions, emoji);
                          setShowReactions(null);
                          setShowMoreEmojis(false);
                        }}
                      >
                        <Text style={st.reactEmojiPillText}>{emoji}</Text>
                        {alreadyReacted && <View style={[st.reactEmojiActiveDot, { backgroundColor: BRAND }]} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}
          <View style={[st.messageOptionsCard, { backgroundColor: colors.surface, maxHeight: Math.min(380, Dimensions.get("window").height * 0.52) }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
         {/* Select is intentionally a single compact action with no helper copy. */}
         {showReactions?.encrypted_content?.trim() && (
           <TouchableOpacity
             style={st.reactRow}
             activeOpacity={0.65}
             onPress={() => {
               if (!showReactions) return;
               setTextSelectionMessageId(showReactions.id);
               closeMessageOptions();
             }}
           >
             <Ionicons name="text-outline" size={21} color={colors.text} style={st.reactRowIcon} />
             <Text style={[st.reactRowLabel, { color: colors.text }]}>Select</Text>
           </TouchableOpacity>
         )}

         <View style={[st.reactRowSep, { backgroundColor: colors.border }]} />

        {/* Reply */}
        <TouchableOpacity style={st.reactRow} activeOpacity={0.65} onPress={() => { if (showReactions) { setReplyTo(showReactions); setTimeout(() => chatInputRef.current?.focus(), 50); setShowReactions(null); } }}>
          <Ionicons name="arrow-undo" size={24} color={colors.text} style={st.reactRowIcon} />
          <Text style={[st.reactRowLabel, { color: colors.text }]}>Reply</Text>
        </TouchableOpacity>

        {/* Copy Text */}
        {showReactions && (() => {
          const txt = showReactions.encrypted_content?.trim();
          const isGift = !txt || txt.startsWith("🎁 ") || txt.startsWith("🧧") || txt.includes("|giftId:");
          if (isGift) return null;
          return (
            <TouchableOpacity style={st.reactRow} activeOpacity={0.65} onPress={async () => { try { await Clipboard.setStringAsync(txt); } catch (_) {} setShowReactions(null); showAlert("Copied", "Message text copied to clipboard."); }}>
              <Ionicons name="copy" size={24} color={colors.text} style={st.reactRowIcon} />
              <Text style={[st.reactRowLabel, { color: colors.text }]}>Copy Text</Text>
            </TouchableOpacity>
          );
        })()}

         {/* Forward — online chats only */}
         {!isLocalNotes && (
           <TouchableOpacity style={st.reactRow} activeOpacity={0.65} onPress={() => { if (showReactions) { openForward(showReactions); setShowReactions(null); } }}>
             <Ionicons name="arrow-redo" size={24} color={colors.text} style={st.reactRowIcon} />
             <Text style={[st.reactRowLabel, { color: colors.text }]}>Forward</Text>
           </TouchableOpacity>
         )}

         {/* Star Message — online chats only */}
         {!isLocalNotes && showReactions && (() => {
          const txt = showReactions.encrypted_content?.trim();
          const isGift = !txt || txt.startsWith("🎁 ") || txt.startsWith("🧧") || txt.includes("|giftId:");
          if (isGift) return null;
          return (
            <TouchableOpacity style={st.reactRow} activeOpacity={0.65} onPress={() => { if (showReactions) handleStarMessage(showReactions); }}>
              <Ionicons name="star" size={24} color={colors.text} style={st.reactRowIcon} />
              <Text style={[st.reactRowLabel, { color: colors.text }]}>Star Message</Text>
            </TouchableOpacity>
          );
        })()}

        {/* Save to Phone */}
         {!isLocalNotes && showReactions?.attachment_url && showReactions.attachment_type !== "video" && (
          <TouchableOpacity style={st.reactRow} activeOpacity={0.65} onPress={() => { if (showReactions) handleSaveToPhone(showReactions); }}>
            <Ionicons name="download" size={24} color={colors.text} style={st.reactRowIcon} />
            <Text style={[st.reactRowLabel, { color: colors.text }]}>Save to Phone</Text>
          </TouchableOpacity>
        )}

         {/* Translate — only for non-English messages, unless English is the
             user's explicitly selected translation language. */}
          {!isLocalNotes &&
            advancedFeatures.message_translation &&
           !!preferredLang &&
           !!messageSourceLanguage &&
           (preferredLang === "en" || messageSourceLanguage !== "en") && (
           <TouchableOpacity style={st.reactRow} activeOpacity={0.65} onPress={() => { if (showReactions) openTranslatePicker(showReactions); }}>
             <Ionicons name="language" size={24} color={colors.text} style={st.reactRowIcon} />
             <Text style={[st.reactRowLabel, { color: colors.text }]}>Translate</Text>
             <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
           </TouchableOpacity>
         )}

        {/* Edit (own non-gift messages) */}
        {showReactions?.sender_id === user?.id && !showReactions?.attachment_url && !showReactions?.encrypted_content.startsWith("🎁 ") && !showReactions?.encrypted_content.startsWith("🧧") && !showReactions?.encrypted_content.includes("|giftId:") && (
          <TouchableOpacity style={st.reactRow} activeOpacity={0.65} onPress={() => { if (showReactions) startEditMessage(showReactions); }}>
            <Ionicons name="pencil" size={24} color={colors.text} style={st.reactRowIcon} />
            <Text style={[st.reactRowLabel, { color: colors.text }]}>Edit</Text>
          </TouchableOpacity>
        )}

         {/* Message Info — delivery receipts are not used by local Notes */}
         {!isLocalNotes && showReactions?.sender_id === user?.id && (
          <TouchableOpacity style={st.reactRow} activeOpacity={0.65} onPress={() => { setMsgInfoTarget(showReactions); setShowReactions(null); setAiResult(null); setAiResultType(null); setAiReplies([]); }}>
            <Ionicons name="information-circle" size={24} color={colors.text} style={st.reactRowIcon} />
            <Text style={[st.reactRowLabel, { color: colors.text }]}>Message Info</Text>
          </TouchableOpacity>
        )}

        {/* View Edit History */}
         {!isLocalNotes && advancedFeatures.message_edit_history && showReactions?.edited_at && (
          <TouchableOpacity style={st.reactRow} activeOpacity={0.65} onPress={() => { if (showReactions) handleViewEditHistory(showReactions); }}>
            <Ionicons name="time" size={24} color={colors.text} style={st.reactRowIcon} />
            <Text style={[st.reactRowLabel, { color: colors.text }]}>View Edit History</Text>
          </TouchableOpacity>
        )}

        {/* Share to Feed */}
         {!isLocalNotes && advancedFeatures.chat_to_post && showReactions && (() => {
          const txt = showReactions.encrypted_content?.trim();
          const isGift = !txt || txt.startsWith("🎁 ") || txt.startsWith("🧧") || txt.includes("|giftId:");
          if (isGift) return null;

          // Detect image/gif attachments so the real URL is imported into the
          // post composer instead of the "📷 Photo" placeholder text.
          const hasImage =
            !!showReactions.attachment_url &&
            (showReactions.attachment_type === "image" ||
              showReactions.attachment_type === "gif");

          // "📷 Photo" / "🎥 Video" / "GIF" are UI-only placeholders — strip them
          // from the text prefill so they don't appear as post content.
          const isMediaPlaceholder = ["📷 Photo", "🎥 Video", "GIF"].includes(txt ?? "");
          const shareText = isMediaPlaceholder ? "" : (txt ?? "");
          const shareImageUrl = hasImage ? showReactions.attachment_url : undefined;

          // Nothing meaningful to share (video-only has no importable URL yet)
          if (!shareText && !shareImageUrl) return null;

          return (
            <TouchableOpacity
              style={st.reactRow}
              activeOpacity={0.65}
              onPress={() => {
                setShowReactions(null);
                setAiResult(null);
                setAiResultType(null);
                setAiReplies([]);
                const params: Record<string, string> = {};
                if (shareText) params.prefill = shareText;
                if (shareImageUrl) params.imageUrl = shareImageUrl;
                router.push({ pathname: "/create-post", params } as any);
              }}
            >
              <Ionicons name="share-social" size={24} color={colors.text} style={st.reactRowIcon} />
              <Text style={[st.reactRowLabel, { color: colors.text }]}>Share to Feed</Text>
            </TouchableOpacity>
          );
        })()}

        {/* Separator before destructive */}
        <View style={[st.reactRowSep, { backgroundColor: colors.border }]} />

        {/* Delete (own messages) */}
        {showReactions?.sender_id === user?.id && (
          <TouchableOpacity style={st.reactRow} activeOpacity={0.65} onPress={() => { if (showReactions) handleDeleteMessage(showReactions); }}>
            <Ionicons name="trash" size={24} color="#FF3B30" style={st.reactRowIcon} />
            <Text style={[st.reactRowLabel, { color: "#FF3B30" }]}>Delete</Text>
          </TouchableOpacity>
        )}

        {/* Report Message (others' messages) */}
         {!isLocalNotes && showReactions?.sender_id !== user?.id && (
          <TouchableOpacity style={st.reactRow} activeOpacity={0.65} onPress={() => { if (showReactions) handleReportMessage(showReactions); }}>
            <Ionicons name="flag" size={24} color="#FF3B30" style={st.reactRowIcon} />
            <Text style={[st.reactRowLabel, { color: "#FF3B30" }]}>Report Message</Text>
          </TouchableOpacity>
        )}

        {/* AI Features — group/channel chats only */}
         {!isLocalNotes && (chatInfo?.is_group || chatInfo?.is_channel) && (
          <>
            <View style={[st.reactRowSep, { backgroundColor: colors.border }]} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10 }}>
              <Ionicons name="bulb-outline" size={12} color={colors.accent} />
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>AI Features</Text>
            </View>
            {showReactions && showReactions.encrypted_content.length >= 500 && (
              <TouchableOpacity style={[st.reactRow, { opacity: aiLoading && aiResultType === "summary" ? 0.5 : 1 }]} activeOpacity={0.65} disabled={aiLoading} onPress={() => { if (showReactions) handleAiSummarize(showReactions); }}>
                <Ionicons name="document-text" size={24} color={colors.text} style={st.reactRowIcon} />
                <Text style={[st.reactRowLabel, { color: colors.text }]}>Summarize Message</Text>
                {aiLoading && aiResultType === "summary" && <ActivityIndicator color={colors.accent} size="small" />}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[st.reactRow, { opacity: aiLoading && aiResultType === "replies" ? 0.5 : 1 }]} activeOpacity={0.65} disabled={aiLoading} onPress={handleAiSuggestReply}>
              <Ionicons name="chatbubbles" size={24} color={colors.text} style={st.reactRowIcon} />
              <Text style={[st.reactRowLabel, { color: colors.text }]}>Smart Replies</Text>
              {aiLoading && aiResultType === "replies" && <ActivityIndicator color={colors.accent} size="small" />}
            </TouchableOpacity>

            {aiResult && aiResultType === "summary" && (
              <View style={{ marginHorizontal: 20, marginTop: 4, marginBottom: 8, backgroundColor: colors.accent + "0A", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.accent + "18" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Ionicons name="bulb-outline" size={12} color={colors.accent} />
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>Summary</Text>
                </View>
                <Text style={{ fontSize: 14, color: colors.text, fontFamily: "Inter_400Regular", lineHeight: 20 }}>{aiResult}</Text>
              </View>
            )}

            {aiReplies.length > 0 && aiResultType === "replies" && (
              <View style={{ marginHorizontal: 20, marginTop: 4, marginBottom: 8, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <Ionicons name="flash" size={12} color="#D4A853" />
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#D4A853", textTransform: "uppercase", letterSpacing: 0.5 }}>Tap to use</Text>
                </View>
                {aiReplies.map((reply, i) => (
                  <TouchableOpacity key={i} onPress={() => { setInput(reply); setShowReactions(null); setAiResult(null); setAiResultType(null); setAiReplies([]); if (chatPrefs.send_haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} style={{ backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#D4A853" + "25", flexDirection: "row", alignItems: "center", gap: 8 }} activeOpacity={0.6}>
                    <Text style={{ flex: 1, fontSize: 14, color: colors.text, fontFamily: "Inter_400Regular", lineHeight: 19 }}>{reply}</Text>
                    <Ionicons name="arrow-forward-circle" size={16} color="#D4A853" style={{ opacity: 0.5 }} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ChatAppearanceSheet
        visible={showAppearanceSheet}
        chatId={id as string}
        appearance={chatAppearance}
        onUpdate={updateChatAppearance}
        onClose={() => setShowAppearanceSheet(false)}
      />

      <BottomSheet visible={showAfuAiMenu} onClose={() => setShowAfuAiMenu(false)}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 12, borderBottomColor: colors.border }}>
            <Ionicons name="bulb-outline" size={18} color={Colors.brand} />
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text }}>AfuAI Options</Text>
          </View>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 }}
            activeOpacity={0.7}
            onPress={clearAfuAiChatHistory}
          >
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#FF3B3018", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="trash" size={19} color="#FF3B30" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FF3B30" }}>Clear chat history</Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 2 }}>Delete all messages and start a new thread</Text>
            </View>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={showLangPicker} onClose={() => { setShowLangPicker(false); setTranslateMsg(null); setAiResult(null); setAiResultType(null); }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity onPress={() => { setShowLangPicker(false); setTranslateMsg(null); setAiResult(null); setAiResultType(null); }} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Ionicons name="language" size={20} color={colors.accent} />
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text }}>Translate to</Text>
          </View>
          {translatingLang && <ActivityIndicator color={colors.accent} size="small" />}
        </View>
        {translateMsg && (
          <View style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 6, backgroundColor: colors.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                fontFamily: "Inter_400Regular",
                lineHeight: 18,
                textAlign: "left",
                writingDirection: "ltr",
                flexShrink: 1,
              }}
              numberOfLines={3}
            >
              {translateMsg.encrypted_content}
            </Text>
          </View>
        )}
        {aiResult && aiResultType === "translate" && (
          <View style={{ marginHorizontal: 16, marginTop: 6, marginBottom: 6, backgroundColor: colors.accent + "0A", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.accent + "18" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.accent, textTransform: "uppercase", letterSpacing: 0.4 }}>Translation</Text>
            </View>
            <Text
              style={{
                fontSize: 14,
                color: colors.text,
                fontFamily: "Inter_400Regular",
                lineHeight: 21,
                textAlign: "left",
                writingDirection: "ltr",
                flexShrink: 1,
              }}
            >
              {aiResult}
            </Text>
          </View>
        )}
        <ScrollView style={{ maxHeight: 320, marginTop: 4 }} showsVerticalScrollIndicator={false} bounces={false}>
          {BUNDLED_UI_LANGUAGES.map((code) => (
            <TouchableOpacity
              key={code}
              style={{
                flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12,
                borderBottomColor: colors.border + "40",
              }}
              onPress={() => handleTranslateToLang(code)}
              disabled={translatingLang}
              activeOpacity={0.6}
            >
              <Text style={{ flex: 1, fontSize: 15, color: colors.text, fontFamily: "Inter_500Medium" }}>{LANG_LABELS[code]}</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, fontFamily: "Inter_400Regular" }}>{code.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>

      {/* ── Video Trimmer ── */}
      {pendingVideoUri && (
        <VideoTrimmerModal
          visible={showVideoTrimmer}
          uri={pendingVideoUri.uri}
          mimeType={pendingVideoUri.mimeType}
          accent={BRAND}
          colors={colors}
          onCancel={() => { setShowVideoTrimmer(false); setPendingVideoUri(null); }}
          onConfirm={(result) => {
            setShowVideoTrimmer(false);
            setAttachmentPreview({
              uri: pendingVideoUri.uri,
              type: "video",
              mimeType: pendingVideoUri.mimeType,
              trimStart: result.trimStart,
              trimEnd: result.trimEnd,
            });
            setPendingVideoUri(null);
          }}
        />
      )}

      <BottomSheet visible={showRedEnvelope} onClose={() => setShowRedEnvelope(false)}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
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
        </ScrollView>
      </BottomSheet>

      <GiftPickerSheet
        visible={showGiftPicker}
        onClose={() => setShowGiftPicker(false)}
        onSend={sendGift}
        sending={giftSending}
        acoinBalance={profile?.acoin ?? 0}
        recipientName={chatInfo?.other_name}
      />

      <AiEditorSheet
        visible={showAiEditor}
        text={input}
        onClose={() => setShowAiEditor(false)}
        onApply={(t) => { setInput(t); setShowAiEditor(false); saveDraft(t); }}
        onApplyAndSend={(t) => { setInput(t); setShowAiEditor(false); saveDraft(t); sendMessage(t); }}
      />


      <BottomSheet visible={!!msgInfoTarget} onClose={() => setMsgInfoTarget(null)}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          <Text style={[st.sheetTitle, { color: colors.text }]}>Message Info</Text>
          <View style={{ gap: 18, marginTop: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.inputBg, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark" size={18} color={colors.textMuted} />
              </View>
              <View>
                <Text style={{ fontSize: 12, color: colors.textMuted, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.5 }}>Sent</Text>
                <Text style={{ fontSize: 15, color: colors.text, fontFamily: "Inter_500Medium", marginTop: 2 }}>
                  {msgInfoTarget ? formatMsgInfoTime(msgInfoTarget.sent_at) : ""}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, opacity: msgInfoTarget?.delivered_at ? 1 : 0.4 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.inputBg, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark-done" size={18} color={colors.textMuted} />
              </View>
              <View>
                <Text style={{ fontSize: 12, color: colors.textMuted, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.5 }}>Delivered</Text>
                <Text style={{ fontSize: 15, color: colors.text, fontFamily: "Inter_500Medium", marginTop: 2 }}>
                  {msgInfoTarget?.delivered_at ? formatMsgInfoTime(msgInfoTarget.delivered_at) : "Awaiting delivery"}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, opacity: msgInfoTarget?.read_at ? 1 : 0.4 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: msgInfoTarget?.read_at ? "#53BDEB22" : colors.inputBg, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark-done" size={18} color={msgInfoTarget?.read_at ? "#53BDEB" : colors.textMuted} />
              </View>
              <View>
                <Text style={{ fontSize: 12, color: colors.textMuted, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.5 }}>Read</Text>
                <Text style={{ fontSize: 15, color: msgInfoTarget?.read_at ? colors.text : colors.textMuted, fontFamily: msgInfoTarget?.read_at ? "Inter_500Medium" : "Inter_400Regular", marginTop: 2 }}>
                  {msgInfoTarget?.read_at ? formatMsgInfoTime(msgInfoTarget.read_at) : "Not yet read"}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </BottomSheet>

      <Modal visible={!!envReveal} transparent animationType="none" onRequestClose={() => setEnvReveal(null)}>
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

      <Modal visible={!!giftReveal} transparent animationType="none" onRequestClose={() => setGiftReveal(null)}>
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
                <TouchableOpacity style={[st.giftRevealBtn, { backgroundColor: BRAND }]} onPress={() => { setGiftReveal(null); router.push("/app/afugifts"); }}>
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


      {/* ── Chat Options Dropdown (⋮ menu) — WhatsApp/Telegram style ──── */}
      {showChatOptions && (
        <Modal
          visible
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={() => { setShowChatOptions(false); setShowMutePicker(false); setShowDisappearingPicker(false); }}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => { setShowChatOptions(false); setShowMutePicker(false); setShowDisappearingPicker(false); }}
          />
          <View style={[st.ddCard, { backgroundColor: colors.surface, top: insets.top + 54 }]}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
              {/* Search */}
              <DdRow colors={colors} icon="search" label="Search"
                onPress={() => {
                  setShowChatOptions(false);
                  setSearchActive(true);
                  setSearchQuery("");
                  setSearchCursor(0);
                  setTimeout(() => searchInputRef.current?.focus(), 250);
                }} />
              <DdDivider colors={colors} />
              {/* Group info; channel members only need Search and Leave Channel */}
              {chatInfo?.is_group && !chatInfo?.is_channel && (
                <DdRow colors={colors} icon="people"
                  label="Group Info & Members"
                  onPress={() => {
                    setShowChatOptions(false);
                    router.push({ pathname: "/group/[id]", params: { id: id as string } });
                  }} />
              )}
              {isNonOwnerChannel && (
                <>
                  <DdDivider colors={colors} />
                  <DdRow colors={colors} icon="exit" label="Leave Channel"
                    onPress={() => handleDeleteChat()} />
                </>
              )}
              {/* Invite via link — group admins only */}
              {!isNonOwnerChannel && chatInfo?.is_group && iAmChatAdmin && (
                <DdRow colors={colors} icon="link"
                  label="Invite via Link"
                  onPress={() => { setShowChatOptions(false); setShowInviteLink(true); }} />
              )}
                {!isNonOwnerChannel && advancedFeatures.chat_summary && !isLocalNotes && (chatInfo?.is_group || chatInfo?.is_channel) && (
                <DdRow colors={colors} icon="bulb-outline" label="Summarize Chat"
                  onPress={() => { setShowChatOptions(false); handleChatSummaryFull(); }} />
              )}
              {/* Per-chat appearance — channel owners only */}
              {!isNonOwnerChannel && (!chatInfo?.is_channel || isChannelOwner) && (
                <DdRow
                  colors={colors}
                  icon="color-palette"
                  label="Chat Appearance"
                  sub="Wallpaper & bubble colour"
                  onPress={() => {
                    setShowChatOptions(false);
                    router.push({ pathname: "/chat-info/appearance/[id]", params: { id: id as string, displayName: headerTitle } } as any);
                  }}
                />
              )}
              <DdDivider colors={colors} />
              {/* Single entry → dedicated per-chat settings page */}
              {!isNonOwnerChannel && <DdRow colors={colors} icon="information-circle" label="Chat Info & Settings"
                onPress={() => {
                  setShowChatOptions(false);
                  router.push({
                    pathname: "/chat-info/[id]",
                    params: {
                      id: id as string,
                      name: headerTitle,
                      avatar: headerAvatar ?? "",
                      otherId: chatInfo?.other_id ?? "",
                      isGroup: chatInfo?.is_group ? "1" : "0",
                      isChannel: chatInfo?.is_channel ? "1" : "0",
                    },
                  });
                }} />}
            </ScrollView>
          </View>
        </Modal>
      )}

      {forwardMsg && (
        <Modal
          visible
          transparent
          animationType="none"
          onRequestClose={() => { setForwardMsg(null); setForwardChats([]); }}
        >
          <View style={[st.forwardOverlay]}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => { setForwardMsg(null); setForwardChats([]); }} />
            <View style={[st.forwardSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
              <View style={[st.forwardHeader, { borderBottomColor: colors.border }]}>
                <Text style={[st.forwardTitle, { color: colors.text }]}>Forward to…</Text>
                <TouchableOpacity onPress={() => { setForwardMsg(null); setForwardChats([]); }} hitSlop={12}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={[st.forwardPreview, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="arrow-redo" size={14} color={colors.textMuted} style={{ marginTop: 1 }} />
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

      {/* ── Add Members Modal ───────────────────────────────────────────── */}
      <Modal
        visible={showAddMembers}
        transparent
        animationType="none"
        onRequestClose={() => setShowAddMembers(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAddMembers(false)} />
          <View style={[st.addMembersSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 }]}>
            {/* Header */}
            <View style={[st.addMembersHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowAddMembers(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
              <Text style={[st.addMembersTitle, { color: colors.text }]}>Add Members</Text>
              <TouchableOpacity
                onPress={handleConfirmAddMembers}
                disabled={addMemberSelected.size === 0 || addMemberAdding}
                style={[
                  st.addMembersAddBtn,
                  {
                    backgroundColor: addMemberSelected.size > 0 ? BRAND : colors.border,
                    opacity: addMemberAdding ? 0.6 : 1,
                  },
                ]}
              >
                {addMemberAdding
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={st.addMembersAddBtnText}>{addMemberSelected.size > 0 ? `Add (${addMemberSelected.size})` : "Add"}</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Search input */}
            <View style={[st.addMembersSearchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={[st.addMembersSearchInput, { color: colors.text }]}
                placeholder="Search by name or @handle"
                placeholderTextColor={colors.textMuted}
                value={addMemberSearch}
                onChangeText={searchUsersToAdd}
                autoFocus
                returnKeyType="search"
              />
              {addMemberSearch.length > 0 && (
                <TouchableOpacity onPress={() => searchUsersToAdd("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Selected chips */}
            {addMemberSelected.size > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.addMembersChips} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
                {addMemberResults.filter(u => addMemberSelected.has(u.id)).map((u: any) => (
                  <TouchableOpacity
                    key={u.id}
                    style={[st.addMembersChip, { backgroundColor: BRAND + "18", borderColor: BRAND + "55" }]}
                    onPress={() => setAddMemberSelected(prev => { const s = new Set(prev); s.delete(u.id); return s; })}
                    activeOpacity={0.7}
                  >
                    <Avatar uri={u.avatar_url} name={u.display_name} size={20} />
                    <Text style={[st.addMembersChipText, { color: BRAND }]} numberOfLines={1}>{u.display_name}</Text>
                    <Ionicons name="close" size={12} color={BRAND} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Results list */}
            <FlatList
              data={addMemberResults}
              keyExtractor={(u: any) => u.id}
              style={{ maxHeight: 380 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
                  {addMemberLoading
                    ? <ActivityIndicator color={BRAND} />
                    : addMemberSearch.length > 0
                      ? <>
                          <Ionicons name="search" size={36} color={colors.textMuted} />
                          <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" }}>No users found</Text>
                        </>
                      : <>
                          <Ionicons name="people" size={40} color={colors.textMuted} />
                          <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" }}>Search for people to add</Text>
                        </>
                  }
                </View>
              }
              renderItem={({ item: u }: { item: any }) => {
                const selected = addMemberSelected.has(u.id);
                return (
                  <TouchableOpacity
                    style={[st.addMembersRow, { borderBottomColor: colors.border, backgroundColor: selected ? BRAND + "08" : "transparent" }]}
                    activeOpacity={0.7}
                    onPress={() => setAddMemberSelected(prev => {
                      const s = new Set(prev);
                      if (s.has(u.id)) s.delete(u.id); else s.add(u.id);
                      return s;
                    })}
                  >
                    <View style={st.addMembersRowAvatar}>
                      <Avatar uri={u.avatar_url} name={u.display_name} size={44} />
                      {selected && (
                        <View style={[st.addMembersSelectedBadge, { backgroundColor: BRAND }]}>
                          <Ionicons name="checkmark" size={11} color="#fff" />
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={[st.addMembersRowName, { color: colors.text }]} numberOfLines={1}>{u.display_name}</Text>
                        {u.is_verified && <VerifiedBadge size={13} />}
                      </View>
                      {u.handle ? <Text style={[st.addMembersRowHandle, { color: colors.textMuted }]}>@{u.handle}</Text> : null}
                    </View>
                    <View style={[st.addMembersCheckCircle, {
                      borderColor: selected ? BRAND : colors.border,
                      backgroundColor: selected ? BRAND : "transparent",
                    }]}>
                      {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Invite Link Sheet ───────────────────────────────────────────── */}
      <Modal
        visible={showInviteLink}
        transparent
        animationType="none"
        onRequestClose={() => { setShowInviteLink(false); setInviteLinkCopied(false); }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { setShowInviteLink(false); setInviteLinkCopied(false); }} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20, paddingHorizontal: 20, paddingTop: 12 }}>
            {/* Handle bar */}
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>

            {/* Title row */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: BRAND + "18", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Ionicons name="link" size={18} color={BRAND} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.text }}>Invite via Link</Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 1 }}>
                  Anyone with this link can join {chatInfo?.is_channel ? "this channel" : "this group"}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setShowInviteLink(false); setInviteLinkCopied(false); }} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 16 }} />

            {/* Link display box */}
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              Invite Link
            </Text>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.inputBg,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 16,
            }}>
              <Ionicons name="link" size={15} color={colors.textMuted} style={{ marginRight: 8 }} />
              <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary }} numberOfLines={1} ellipsizeMode="middle">
                {getInviteLink()}
              </Text>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
              {/* Copy */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor: inviteLinkCopied ? "#34C75918" : BRAND + "18",
                  borderWidth: 1,
                  borderColor: inviteLinkCopied ? "#34C759" : BRAND + "55",
                }}
                onPress={handleCopyInviteLink}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={inviteLinkCopied ? "checkmark-circle" : "copy"}
                  size={18}
                  color={inviteLinkCopied ? "#34C759" : BRAND}
                />
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: inviteLinkCopied ? "#34C759" : BRAND }}>
                  {inviteLinkCopied ? "Copied!" : "Copy Link"}
                </Text>
              </TouchableOpacity>

              {/* Share */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor: BRAND,
                }}
                onPress={handleShareInviteLink}
                activeOpacity={0.85}
              >
                <Ionicons name="share-social" size={18} color="#fff" />
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Share</Text>
              </TouchableOpacity>
            </View>

            {/* Info note */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, backgroundColor: colors.inputBg, borderRadius: 12 }}>
              <Ionicons name="information-circle" size={15} color={colors.textMuted} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, lineHeight: 17 }}>
                This link is permanent and unique to this {chatInfo?.is_channel ? "channel" : "group"}. Anyone who taps it can join directly without needing approval.
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit History Modal ──────────────────────────────────────────── */}
      <Modal
        visible={!!editHistoryMsg}
        transparent
        animationType="none"
        onRequestClose={() => { setEditHistoryMsg(null); setEditHistoryItems([]); }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { setEditHistoryMsg(null); setEditHistoryItems([]); }} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 16, maxHeight: "80%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="time" size={20} color={colors.accent} />
                <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: colors.text }}>Edit History</Text>
              </View>
              <TouchableOpacity onPress={() => { setEditHistoryMsg(null); setEditHistoryItems([]); }} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {editHistoryLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 40 }} />
            ) : (
              <ScrollView style={{ paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
                {/* Current version */}
                <View style={{ marginTop: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#34C759" }} />
                    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#34C759", textTransform: "uppercase", letterSpacing: 0.5 }}>Current</Text>
                  </View>
                  <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: "#34C759" }}>
                    <Text style={{ fontSize: 14, color: colors.text, fontFamily: "Inter_400Regular", lineHeight: 20 }}>
                      {editHistoryMsg?.encrypted_content}
                    </Text>
                    {editHistoryMsg?.edited_at && (
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 6 }}>
                        Last edited {new Date(editHistoryMsg.edited_at).toLocaleString()}
                      </Text>
                    )}
                  </View>
                </View>

                {editHistoryItems.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 32 }}>
                    <Ionicons name="document-text" size={36} color={colors.textMuted} />
                    <Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 8, textAlign: "center" }}>
                      No previous versions found.{"\n"}History is recorded from this point on.
                    </Text>
                  </View>
                ) : (
                  editHistoryItems.map((item, idx) => {
                    const isLast = idx === editHistoryItems.length - 1;
                    return (
                      <View key={item.id} style={{ marginTop: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isLast ? colors.textMuted : colors.accent }} />
                          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: isLast ? colors.textMuted : colors.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            {isLast ? "Original" : `Version ${editHistoryItems.length - idx}`}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textMuted, marginLeft: "auto" }}>
                            Edited {new Date(item.edited_at).toLocaleString()}
                          </Text>
                        </View>
                        <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: isLast ? colors.border : colors.accent + "66" }}>
                          <Text style={{ fontSize: 14, color: colors.text, fontFamily: "Inter_400Regular", lineHeight: 20 }}>
                            {item.previous_content}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
                <View style={{ height: 24 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
    </ChatFontSizeCtx.Provider>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingBottom: 10,
    
    gap: 2,
  },
  backBtn: { padding: 6 },

  optionsOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  messageOptionsOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  messageOptionsCard: {
    width: "100%",
    maxWidth: 300,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 18,
    ...Platform.select({
      web: { boxShadow: "0 14px 38px rgba(0,0,0,0.28)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.28, shadowRadius: 22 },
    }),
  },
  messageOptionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  messageOptionsEyebrow: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  messageOptionsPreview: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  optionsSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
  },
  optionsHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
  optionsIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    
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
    ...Platform.select({
      web: { boxShadow: "0 1px 2px rgba(0,0,0,0.06)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2 },
    }),
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
    ...Platform.select({
      web: { boxShadow: "0 2px 6px rgba(0,0,0,0.15)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
    }),
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
    backgroundColor: Colors.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  scrollFabBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },

  msgRow: { flexDirection: "row", paddingHorizontal: 10, marginVertical: 2 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },

  bubbleContainer: { maxWidth: "78%", position: "relative", flexShrink: 1, minWidth: 0, alignSelf: "flex-start" },
  bubbleContainerMe: { alignItems: "flex-end" },
  bubbleContainerOther: { alignItems: "flex-start" },

  // A slim triangle keeps the tail visible without the old rotated-square
  // diamond/spark shape.
  tailBase: {
    position: "absolute",
    width: 0,
    height: 0,
    bottom: 0,
    zIndex: 0,
    borderStyle: "solid",
    borderTopWidth: 10,
  },
  tailMe: { right: -9, borderLeftWidth: 10, borderLeftColor: "transparent" },
  tailOther: { left: -9, borderRightWidth: 10, borderRightColor: "transparent" },

  bubble: {
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 3,
    borderRadius: 18,
    minWidth: 42,
    overflow: "hidden",
    flexShrink: 1,
  },
  bubbleWithReply: {
    alignSelf: "stretch",
  },
  notificationCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  notificationCtaText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  // When no tail: all four corners stay at the full radius (set above).
  bubbleMe: {},
  bubbleOther: {},
  // When the tail IS shown: flatten the corner the tail attaches to so the
  // tail and bubble meet seamlessly, matching iMessage style.
  bubbleTailMe: {
    borderBottomRightRadius: 0,
    zIndex: 1,
  },
  bubbleTailOther: {
    borderBottomLeftRadius: 0,
    zIndex: 1,
  },

  senderName: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 2 },

  replyPreview: { flexDirection: "row", alignItems: "stretch", borderRadius: 8, marginBottom: 6, alignSelf: "stretch", overflow: "hidden" },
  replyBarLine: { width: 3, flexShrink: 0, borderRadius: 0 },
  replyTextWrap: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 6, justifyContent: "center" },
  replyPreviewText: { fontSize: 12.5, fontFamily: "Inter_500Medium", flexShrink: 1, minWidth: 0 },

  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 18 },

  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 1, gap: 3 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular" },

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
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 1,
    borderWidth: 0,
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
  imageGroupGrid: {
    width: ATTACH_W,
    maxWidth: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    borderRadius: 10,
    overflow: "hidden",
  },
  imageGroupTile: {
    width: (ATTACH_W - 2) / 2,
    height: (ATTACH_H - 2) / 2,
  },
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

  replyBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  replyBarAccent: { width: 3, height: 32, borderRadius: 2 },
  replyBannerName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyBannerText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  attachPreviewBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
    borderWidth: 0.5,
    borderBottomWidth: 0.5,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: "hidden",
    marginBottom: 6,
  },
  multiAttachScroll: { gap: 8, paddingRight: 4 },
  multiAttachItem: { position: "relative" },
  multiAttachEdit: { position: "absolute", left: 5, bottom: 5, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.68)" },
  multiAttachRemove: { position: "absolute", right: -5, top: -5, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.78)" },
  imageEditorBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center", padding: 20 },
  imageEditorImage: { width: "100%", height: "72%" },
  imageEditorTools: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 24 },
  imageEditorTool: { minWidth: 68, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.14)" },
  imageEditorToolText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  imageEditorDone: { backgroundColor: "#007AFF" },
  imageEditorDoneText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  attachPreviewImg: { width: 68, height: 68, borderRadius: 10 },
  attachPreviewFile: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  attachPreviewName: { fontSize: 13, fontFamily: "Inter_500Medium", maxWidth: 160 },
  attachPreviewClose: { marginLeft: "auto" },

  limitedText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
    width: undefined,
    minWidth: 0,
    lineHeight: 18,
    textAlign: "center",
    includeFontPadding: false,
  },
  limitedFloatOuter: {
    paddingTop: 0,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  limitedGlass: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 360,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 0,
    marginHorizontal: 0,
    marginBottom: 0,
    ...Platform.select({
      web: {
        boxShadow: "0 4px 14px rgba(0,0,0,0.14)",
      } as any,
      default: { elevation: 5, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 8 },
    }),
  },
  strangerBanner: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    
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
    left: 12,
    right: 12,
    bottom: 0,
  },
  channelReadOnlyBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  channelJoinBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  channelJoinTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  channelJoinButton: {
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
  },
  channelJoinButtonText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  channelReadOnlyText: {
    fontSize: 13,
    fontWeight: "500",
  },
  channelMuteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
  },
  channelMuteButtonText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  inputFloatOuter: {
    paddingTop: 4,
    ...Platform.select({ web: { paddingHorizontal: 8 } }),
  },
  inputGlassPill: {
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: "rgba(120,120,128,0.22)",
    overflow: "hidden",
    marginBottom: 6,
  },
  inputBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    paddingVertical: 2,
    gap: 4,
  },
  inputInnerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    ...Platform.select({ web: { minHeight: 34 } }),
  },
  pillIcon: { paddingHorizontal: 5 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 20, outlineStyle: "none" as any, paddingTop: 6, paddingBottom: 6, minHeight: 24, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sendBtnCol: { alignSelf: "stretch", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  aiAboveSendBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center", minWidth: 32, gap: 1 },
  wordCountLabel: { fontSize: 8, fontFamily: "Inter_600SemiBold", opacity: 0.75 },
  recHoldGlass: { minHeight: 56 },
  recWaveRow: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  recCancelHint: { flexDirection: "row", alignItems: "center", gap: 2, paddingRight: 6 },
  recTrashBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,59,48,0.1)", alignItems: "center", justifyContent: "center", marginLeft: 4 },
  recSlideText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  inputRowOuter: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  outerActionBtn: { alignItems: "center", justifyContent: "flex-end", marginBottom: 6 },
  recMicWrap: { alignItems: "center", justifyContent: "flex-end" },
  recLockHint: { alignItems: "center", marginBottom: 4, opacity: 0.55 },
  recMicBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: BRAND_FALLBACK, alignItems: "center", justifyContent: "center" },
  recLockedInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 8, minHeight: 56 },
  recLockedTrash: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,59,48,0.12)", alignItems: "center", justifyContent: "center" },
  recPauseBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  recordingText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  sheetOverlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetContent: { position: "absolute", bottom: 0, left: 8, right: 8, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#CCC", alignSelf: "center", marginBottom: 8 },
  desktopSheetOverlay: { backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  desktopSheetCard: { width: "90%", maxWidth: 480, borderRadius: 16, padding: 24, gap: 14, ...Platform.select({ web: { boxShadow: "0 8px 40px rgba(0,0,0,0.22)" } as any }) },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  sheetInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },

  reactModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.52)", justifyContent: "center", alignItems: "center", paddingHorizontal: 20, gap: 8 },
  reactModalContainer: { width: "100%", borderRadius: 20, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, elevation: 10, ...Platform.select({ web: { boxShadow: "0 8px 20px rgba(0,0,0,0.25)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20 } }), maxHeight: "70%" },
  reactModalEmojiRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 12 },
  reactModalEmojiBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  reactModalEmojiText: { fontSize: 24 },
  reactModalDivider: { height: 1, marginVertical: 8 },
  reactModalAction: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  reactModalActionText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  reactionPicker: { flexDirection: "row", justifyContent: "center", paddingVertical: 8, gap: 6 },
  reactionOption: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  reactionOptionEmoji: { fontSize: 24 },
  reactEmojiPill: {
    flexDirection: "row", alignItems: "center", gap: 2,
    borderRadius: 40, paddingHorizontal: 6, paddingVertical: 6,
    elevation: 16,
    ...Platform.select({ web: { boxShadow: "0 4px 20px rgba(0,0,0,0.28)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 16 } }),
  },
  reactEmojiPillBtn: { width: 40, height: 40, borderRadius: 0, backgroundColor: "transparent", alignItems: "center", justifyContent: "center" },
  reactEmojiPillText: { fontSize: 26 },
  reactEmojiActiveDot: { position: "absolute", bottom: 1, alignSelf: "center", width: 5, height: 5, borderRadius: 2.5 },
  reactMoreGrid: {
    width: "100%", flexDirection: "row", flexWrap: "wrap",
    justifyContent: "center", gap: 4,
    borderRadius: 20, padding: 10,
    elevation: 10,
    ...Platform.select({ web: { boxShadow: "0 4px 12px rgba(0,0,0,0.18)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12 } }),
  },
  reactMoreGridBtn: { width: 40, height: 40, borderRadius: 0, backgroundColor: "transparent", alignItems: "center", justifyContent: "center" },

  reactEmojiRow:       { flexDirection: "row", justifyContent: "center", alignItems: "center", marginHorizontal: 10, marginTop: 2, marginBottom: 7, borderRadius: 22, paddingVertical: 3, paddingHorizontal: 5, gap: 2 },
  reactMoreGridInline: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginHorizontal: 10, paddingHorizontal: 8, paddingBottom: 7, gap: 3 },
  reactionFloatingGroup: {
    maxWidth: 300,
    marginBottom: 8,
    borderRadius: 24,
    overflow: "hidden",
    elevation: 16,
    ...Platform.select({
      web: { boxShadow: "0 6px 22px rgba(0,0,0,0.26)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.26, shadowRadius: 16 },
    }),
  },
  reactRowSep:         { height: StyleSheet.hairlineWidth, marginVertical: 1 },
  reactRow:            { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 9, minHeight: 43 },
  reactRowIcon:        { marginRight: 12, width: 20, textAlign: "center" },
  reactRowLabel:       { flex: 1, fontSize: 14.5, fontFamily: "Inter_600SemiBold" },
  reactRowHint:        { fontSize: 10.5, fontFamily: "Inter_400Regular", marginTop: 1 },
  sheetActionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  sheetActionText: { fontSize: 16, fontFamily: "Inter_500Medium" },

  swipeReplyIcon: { position: "absolute", top: "50%", marginTop: -12, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(128,128,128,0.12)", alignItems: "center", justifyContent: "center" },
  specialMsgTap: { padding: 4 },
  specialMsgEmoji: { fontSize: 56 },
  redEnvBtn: { backgroundColor: "#FF3B30", borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  redEnvBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  envRevealOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  envRevealCard: { width: "100%", borderRadius: 20, overflow: "hidden", elevation: 10, ...Platform.select({ web: { boxShadow: "0 8px 20px rgba(0,0,0,0.3)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20 } }) },
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
  envRevealBtn: { backgroundColor: "#FF3B30", marginHorizontal: 24, marginBottom: 20, paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  envRevealBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  giftRevealOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  giftRevealContainer: { width: "100%", borderRadius: 20, padding: 24, elevation: 10, ...Platform.select({ web: { boxShadow: "0 8px 20px rgba(0,0,0,0.25)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20 } }) },

  giftModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  giftModalContainer: { width: "100%", height: "80%", borderRadius: 20, padding: 20, elevation: 10, ...Platform.select({ web: { boxShadow: "0 8px 20px rgba(0,0,0,0.25)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 20 } }) },
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
  forwardSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  forwardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  forwardTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  forwardPreview: { flexDirection: "row", gap: 8, padding: 12, marginHorizontal: 16, marginVertical: 10, borderRadius: 10 },
  forwardPreviewText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  forwardChatRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  forwardChatName: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },

  // ── WhatsApp/Telegram-style ⋮ dropdown ──────────────────────────────
  ddCard: {
    position: "absolute",
    right: 10,
    width: 252,
    borderRadius: 10,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 8px 32px rgba(0,0,0,0.22)" } as any,
      default: { elevation: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 20 },
    }),
  },
  ddRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  ddLabel: { fontSize: 14.5, fontFamily: "Inter_400Regular" },
  ddSubText: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  ddSubGroup: { borderTopWidth: StyleSheet.hairlineWidth },
  ddDivider: { height: StyleSheet.hairlineWidth },

  // ── In-chat search bar ────────────────────────────────────────────────────
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: 38,
    paddingVertical: 0,
  },
  searchCount: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    minWidth: 70,
    textAlign: "center",
  },

  addMembersSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
    minHeight: 360,
    maxHeight: "88%",
  },
  addMembersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addMembersTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    flex: 1,
    textAlign: "center",
  },
  addMembersAddBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  addMembersAddBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  addMembersSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addMembersSearchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },
  addMembersChips: {
    maxHeight: 54,
  },
  addMembersChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 140,
  },
  addMembersChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    maxWidth: 90,
  },
  addMembersRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addMembersRowAvatar: {
    position: "relative",
  },
  addMembersSelectedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  addMembersRowName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  addMembersRowHandle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  addMembersCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
