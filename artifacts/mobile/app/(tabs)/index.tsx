import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
// PagerView gives true native 1:1 finger-tracking on Android/iOS.
const _PagerView: any = (() => { try { return require("react-native-pager-view").default; } catch { return null; } })();
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import AfuLogo from "@/components/ui/AfuLogo";
import Image from "@/components/ui/OptimizedImage";
const SafeFlashList: any = Platform.OS === "web"
  ? FlatList
  : (() => {
      try {
        return require("@shopify/flash-list").FlashList as any;
      } catch {
        return FlatList;
      }
    })();
import { LinearGradient } from "@/components/ui/SafeGradient";
import { Redirect, useFocusEffect, useNavigation, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CHAT_FAST_SPRING } from "@/lib/chatMotion";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { safeRouter } from "@/lib/navUtils";
import { Avatar } from "@/components/ui/Avatar";
import UserName from "@/components/ui/UserName";
import { Separator } from "@/components/ui/Separator";
import Colors from "@/constants/colors";
import { ChatRowSkeleton } from "@/components/ui/Skeleton";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { HomeBanner } from "@/components/ui/HomeBanner";
import { isOnline, onConnectivityChange, getCachedUserId } from "@/lib/offlineStore";
import { getLocalConversations, saveConversations, deleteLocalConversation, pruneConversations, clearUnread, updateConversationFlags } from "@/lib/storage/localConversations";
import {
  getLocalNotesConversation,
  isLocalNotesId,
  removeLocalNotesConversation,
  updateLocalNotesFlags,
  LOCAL_NOTES_NAME,
} from "@/lib/storage/localNotes";
import { getPreloadedConversations, hasPreloadedConversations, invalidateConversationsPreload } from "@/lib/conversationsPreload";
import { AFUAI_CONV_ID, AFUAI_BOT_ID, getAIChatSnapshot } from "@/lib/aiChatStore";
import { useSuperApp } from "@/lib/superapp/MiniAppRuntime";
import { addOnlineListener } from "@/lib/offlineSync";
import { wasChatRecentlyVisited, clearChatVisited, getActiveChatId, markChatVisited } from "@/lib/chatVisited";
import { showAlert, confirmAlert } from "@/lib/alert";
import { showToast, showActionToast } from "@/lib/toast";
import { useChatPreferences } from "@/context/ChatPreferencesContext";
import { useAdvancedFeatures } from "@/context/AdvancedFeaturesContext";
import {
  loadFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  type ChatFolder,
} from "@/lib/storage/chatFolders";
import { FolderModal } from "@/components/chat/FolderModal";
import {
  getStoryUploadState,
  subscribeStoryUpload,
} from "@/lib/storyUploadStore";
import PostUploadBannerShared from "@/components/ui/PostUploadBanner";
import { usePhonebookNames } from "@/hooks/usePhonebookNames";
import { setTotalUnread } from "@/lib/chatUnreadEvents";
import { prefetchListImages } from "@/lib/storage/imagePrefetcher";
import { updateNativeShareShortcuts } from "@/lib/nativeShareShortcuts";


function stripMdPreview(s: string): string {
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

function buildMsgPreview(encrypted_content: string | null, attachment_type: string | null): string {
  const raw = encrypted_content || "";
  if (attachment_type === "story_reply") {
    let preview = raw;
    if (preview.startsWith("storyUserId:")) {
      const pipeIdx = preview.indexOf("|");
      preview = pipeIdx >= 0 ? preview.slice(pipeIdx + 1) : "Shared a story";
    }
    return `📸 ${preview || "Story"}`;
  }
  if (attachment_type === "image") return raw ? `📷 ${stripMdPreview(raw)}` : "📷 Photo";
  if (attachment_type === "video") return "🎥 Video";
  if (attachment_type === "audio") return "🎤 Voice message";
  if (attachment_type === "file") return raw ? `📎 ${stripMdPreview(raw)}` : "📎 File";
  if (attachment_type === "payment") {
    try {
      const pay = JSON.parse(raw);
      const coinLabel = pay.currency === "nexa" ? "Nexa" : "ACoin";
      const amt = pay.amount != null ? `${pay.amount} ${coinLabel}` : coinLabel;
      return `💸 ${amt} sent`;
    } catch { return "💸 Payment"; }
  }
  // Red envelope: strip internal UUID from "🧧 Red Envelope [uuid] - note"
  if (raw.startsWith("🧧")) {
    return raw.replace(/\[[0-9a-f-]{36}\]\s*-?\s*/i, "").trim() || "🧧 Red Envelope";
  }
  return stripMdPreview(raw);
}

type ChatItem = {
  id: string;
  name: string | null;
  is_group: boolean;
  is_channel: boolean;
  created_by?: string | null;
  /** "notes" = explicitly-created local Notes. */
  kind?: "notes";
  /** Profile handle for stable route classification before chat metadata loads. */
  other_handle?: string | null;
  other_display_name: string;
  other_avatar: string | null;
  other_id: string;
  last_message: string;
  last_message_at: string;
  last_message_is_mine: boolean;
  last_message_status: "sent" | "delivered" | "read";
  is_pinned: boolean;
  is_archived: boolean;
  avatar_url: string | null;
  unread_count: number;
  is_verified: boolean;
  is_organization_verified: boolean;
  other_last_seen: string | null;
  other_show_online: boolean;
  /** Unsent draft text for this chat (empty string = no draft) */
  draft?: string;
  /** null = muted forever; ISO string = muted until that time; undefined = not muted */
  muted_until?: string | null;
};

let chatListMemberChannelSequence = 0;

function isNotificationsChatItem(item: ChatItem): boolean {
  return [item.other_handle, item.other_display_name, item.name]
    .some((value) => value?.trim().toLowerCase() === "notifications");
}

function localNotesToChatItem(local: any): ChatItem {
  return {
    id: local.id,
    kind: "notes",
    name: LOCAL_NOTES_NAME,
    is_group: false,
    is_channel: false,
    other_display_name: LOCAL_NOTES_NAME,
    other_avatar: null,
    other_id: local.other_id || "",
    last_message: local.last_message || "",
    last_message_at: local.last_message_at || "",
    last_message_is_mine: !!local.last_message_is_mine,
    last_message_status: (local.last_message_status || "sent") as ChatItem["last_message_status"],
    is_pinned: !!local.is_pinned,
    is_archived: !!local.is_archived,
    avatar_url: null,
    unread_count: 0,
    is_verified: false,
    is_organization_verified: false,
    other_last_seen: null,
    other_show_online: false,
  };
}

function TypingDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: -4, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0,  duration: 280, useNativeDriver: true }),
          Animated.delay(300),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 2 }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: color,
            opacity: 0.75,
            transform: [{ translateY: dot }],
          }}
        />
      ))}
    </View>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function isUserOnline(lastSeen: string | null, showOnline: boolean): boolean {
  if (!showOnline || !lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

function ChatRow({
  item,
  onPress,
  onAction,
  isActive,
  isTyping,
  phonebookName,
  selectMode = false,
  isSelected = false,
  onEnterSelectMode,
  onToggleSelect,
}: {
  item: ChatItem;
  onPress: () => void;
  onAction?: (
    action: "togglePin" | "toggleArchive" | "delete" | "open" | "mute" | "unmute",
    item: ChatItem,
  ) => void;
  isActive?: boolean;
  isTyping?: boolean;
  phonebookName?: string;
  selectMode?: boolean;
  isSelected?: boolean;
  onEnterSelectMode?: () => void;
  onToggleSelect?: () => void;
}) {
  const { colors } = useTheme();
  const isChatMuted = item.muted_until !== undefined && (item.muted_until === null || new Date(item.muted_until) > new Date());
  const displayName = item.kind === "notes"
    ? "My Notes"
    : item.is_group || item.is_channel
      ? item.name
      : (phonebookName || item.other_display_name);
  const avatar = item.kind === "notes" ? null : item.is_group || item.is_channel ? item.avatar_url : item.other_avatar;
  const hasUnread = item.unread_count > 0 && !wasChatRecentlyVisited(item.id);
  const isOnlineDot = !item.is_group && !item.is_channel && isUserOnline(item.other_last_seen, item.other_show_online);

  return (
    <View>
    <TouchableOpacity
      style={[styles.row, { backgroundColor: isSelected ? colors.accent + "18" : isActive ? colors.backgroundSecondary : colors.surface }]}
      // Selection is intentionally avatar-only. The row itself always keeps
      // its normal navigation behavior, matching the New Chat contact picker.
      onPress={onPress}
      onLongPress={selectMode ? undefined : onEnterSelectMode}
      delayLongPress={320}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        disabled={!selectMode}
        onPress={onToggleSelect}
        activeOpacity={0.8}
        accessibilityRole={selectMode ? "checkbox" : undefined}
        accessibilityState={selectMode ? { checked: isSelected } : undefined}
        accessibilityLabel={selectMode ? `Select ${displayName || "chat"}` : undefined}
      >
      <View style={{ position: "relative" }}>
        {item.kind === "notes" ? (
          <LinearGradient
            colors={["#7B61FF", "#00C2CB"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="bookmark" size={24} color="#fff" />
          </LinearGradient>
        ) : (
          <Avatar uri={avatar} name={displayName || "Chat"} size={50} square={!!(item.is_organization_verified)} userId={!item.is_group && !item.is_channel ? item.other_id : undefined} />
        )}
        {isOnlineDot && (
          <View style={[styles.onlineDot, { borderColor: colors.surface }]} />
        )}
        {selectMode && (
          <View style={[
            selStyles.avatarRing,
            { borderColor: isSelected ? colors.accent : colors.surface },
            isSelected && { backgroundColor: colors.accent },
          ]}>
            {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
        )}
      </View>
      </TouchableOpacity>
      <View style={[styles.rowContent, item.is_archived && { opacity: 0.65 }]}>
        <View style={styles.rowTop}>
          <View style={styles.nameRow}>
            {item.is_pinned && (
              <Ionicons name="pin" size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
            )}
            {item.is_archived && (
              <Ionicons name="archive" size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
            )}
            {(!item.is_group && !item.is_channel && item.other_id) ? (
              <UserName
                userId={item.other_id}
                name={displayName || "Chat"}
                style={[styles.name, { color: colors.text, fontFamily: hasUnread ? "Inter_700Bold" : "Inter_600SemiBold" }]}
                numberOfLines={1}
              />
            ) : (
              <Text
                style={[styles.name, { color: colors.text, fontFamily: hasUnread ? "Inter_700Bold" : "Inter_600SemiBold" }]}
                numberOfLines={1}
              >
                {displayName || "Chat"}
              </Text>
            )}
            {!item.is_group && (
              <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={14} />
            )}
            {item.is_channel && (
              <Ionicons name="megaphone" size={12} color={colors.accent} style={{ marginLeft: 4 }} />
            )}
            {isChatMuted && (
              <Ionicons name="notifications-off" size={12} color={colors.textMuted} style={{ marginLeft: 4 }} />
            )}
          </View>
          <View style={styles.rowTopRight}>
            {item.last_message_is_mine && !hasUnread && (
              <Ionicons
                name={item.last_message_status === "read" ? "checkmark-done" : item.last_message_status === "delivered" ? "checkmark-done" : "checkmark"}
                size={14}
                color={item.last_message_status === "read" ? "#53BDEB" : colors.textMuted}
                style={{ marginRight: 2 }}
              />
            )}
            <Text style={[styles.time, { color: hasUnread ? colors.accent : colors.textMuted }]}>
              {item.last_message_at ? formatTime(item.last_message_at) : ""}
            </Text>
          </View>
        </View>
        <View style={styles.rowBottom}>
          {isTyping ? (
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[styles.preview, { color: colors.accent, fontFamily: "Inter_500Medium" }]}>
                typing
              </Text>
              <TypingDots color={colors.accent} />
            </View>
          ) : item.draft ? (
            <Text style={[styles.preview, { flex: 1 }]} numberOfLines={1}>
              <Text style={{ color: "#FF3B30", fontFamily: "Inter_600SemiBold" }}>Draft: </Text>
              <Text style={{ color: colors.textSecondary as string }}>{stripMdPreview(item.draft)}</Text>
            </Text>
          ) : (
          <Text
            style={[styles.preview, { color: hasUnread ? colors.text : colors.textSecondary, fontFamily: hasUnread ? "Inter_500Medium" : "Inter_400Regular", flex: 1 }]}
            numberOfLines={1}
          >
            {item.last_message || "No messages yet"}
          </Text>
          )}
          {hasUnread && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.unreadBadgeText}>
                {item.unread_count > 99 ? "99+" : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
    </View>
  );
}

function useStoryUpload() {
  return useSyncExternalStore(subscribeStoryUpload, getStoryUploadState, getStoryUploadState);
}

function StoryUploadBanner({ colors }: { colors: any }) {
  const upload = useStoryUpload();
  if (!upload) return null;

  const isDone = upload.done;
  const isFailed = upload.failed;
  const pct = Math.round(upload.progress * 100);

  return (
    <View style={[uploadBannerStyles.wrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={uploadBannerStyles.row}>
        <View style={[uploadBannerStyles.iconCircle, { backgroundColor: isDone ? "#22C55E20" : isFailed ? "#EF444420" : colors.accent + "22" }]}>
          <Ionicons
            name={isDone ? "checkmark-circle" : isFailed ? "alert-circle" : "camera"}
            size={16}
            color={isDone ? "#22C55E" : isFailed ? "#EF4444" : colors.accent}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[uploadBannerStyles.label, { color: colors.text }]}>
            {isDone ? "Story posted!" : isFailed ? "Story upload failed" : "Posting your story…"}
          </Text>
          {isFailed && upload.errorMessage ? (
            <Text style={[uploadBannerStyles.caption, { color: "#EF4444" }]} numberOfLines={2}>
              {upload.errorMessage}
            </Text>
          ) : upload.caption ? (
            <Text style={[uploadBannerStyles.caption, { color: colors.textMuted }]} numberOfLines={1}>
              {upload.caption}
            </Text>
          ) : null}
        </View>
        {!isDone && !isFailed && (
          <Text style={[uploadBannerStyles.pct, { color: colors.accent }]}>{pct}%</Text>
        )}
      </View>
      {!isDone && !isFailed && (
        <View style={[uploadBannerStyles.track, { backgroundColor: colors.border }]}>
          <View style={[uploadBannerStyles.fill, { width: `${pct}%` as any, backgroundColor: colors.accent }]} />
        </View>
      )}
    </View>
  );
}

function PostUploadBanner({ colors: _colors }: { colors?: any }) {
  return <PostUploadBannerShared />;
}

const uploadBannerStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  iconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, fontWeight: "600" },
  caption: { fontSize: 11, marginTop: 1 },
  pct: { fontSize: 12, fontWeight: "600", minWidth: 30, textAlign: "right" },
  track: { height: 3, borderRadius: 2, overflow: "hidden" },
  fill: { height: 3, borderRadius: 2 },
});



type ChatTabKey = "all" | "unread" | "personal" | "groups" | "channels";

const LOCAL_CHAT_HYDRATION_TIMEOUT_MS = 1500;
const CHAT_REQUEST_TIMEOUT_MS = 15000;

function waitForRequest<T>(
  request: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout();
      resolve(undefined);
    }, timeoutMs);

    request.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

/**
 * The chats screen. By default this renders as a full-page route (chats tab).
 * When mounted with `panelMode`, it renders as a fixed-width 360px column
 * suitable for a WhatsApp/Telegram-style master-detail layout (the chat list
 * stays sticky on the left, the chat conversation is rendered to its right).
 *
 * `DesktopShell` mounts `<ChatsListPanel />` (which is `<ChatsScreen panelMode />`)
 * for any `/chat/[id]` route so the chats list is persistent while a chat is
 * open. On the chats tab itself, `panelMode` is false and the list takes the
 * full route width as usual.
 */
export function ChatsScreen({ panelMode = false, onOpenChat }: { panelMode?: boolean; onOpenChat?: (item: ChatItem, chatId: string) => void } = {}) {
  const { colors, isDark } = useTheme();
  const { user, session, profile, signOut, loading: authLoading } = useAuth();
  // AuthContext may expose a cached "synthetic" user during Android startup so
  // the shell can render immediately. That identity is not authorized for
  // Supabase requests until the real session has been restored.
  const hasVerifiedSession = !!session?.user && session.user.id === user?.id;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const pathname = usePathname() || "/";
  const activeChatMatch = pathname.match(/^\/chat\/([^/]+)/);
  const activeChatId = activeChatMatch ? activeChatMatch[1] : null;

  // Phone-book name overrides: show the name the user saved in their contacts
  // inside chat rows instead of the registered display_name.
  const phonebookNames = usePhonebookNames();

  // Initialize from the in-memory preload cache if available (populated by _layout.tsx
  // before this component ever mounts). This makes the chat list appear instantly
  // for returning users — no skeleton, no SQLite wait on first render.
  const [chats, setChats] = useState<ChatItem[]>(() =>
    getPreloadedConversations()
      .filter((item: any) => !isLocalNotesId(item.id))
      .map((item: any) => item as ChatItem),
  );
  const chatsRef = useRef<ChatItem[]>([]);
  chatsRef.current = chats;
  const [loading, setLoading] = useState(() => !hasPreloadedConversations());
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);
  const [tabFilter, setTabFilter] = useState<ChatTabKey>("all");
  const [typingChatIds, setTypingChatIds] = useState<Record<string, boolean>>({});
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const realtimeReconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatLoadInFlightRef = useRef<Promise<void> | null>(null);
  const lastChatLoadAtRef = useRef(0);
  // When the device goes offline the realtime channel may replay buffered
  // INSERT events on reconnect, causing every chat to appear unread. We
  // suppress the +1 increment until loadChats() has finished reconciling
  // the correct unread counts from Supabase.
  const suppressUnreadIncrementRef = useRef(false);
  // Debounce guard — prevents a double-tap on the same chat row from pushing
  // the route twice, which causes the chat screen's Realtime channels to mount
  // a second time before the first cleanup runs (stale-channel crash).
  const lastChatNavRef = useRef<number>(0);
  const { prefs: chatPrefs } = useChatPreferences();
  const { features: advancedFeatures } = useAdvancedFeatures();
  const { width: windowWidth } = useWindowDimensions();

  const openChatSearch = useCallback(() => {
    setSearchOpen(true);
    Animated.spring(searchAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 190,
      mass: 0.75,
    }).start();
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }, [searchAnim]);

  const closeChatSearch = useCallback(() => {
    searchInputRef.current?.blur();
    Animated.timing(searchAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSearchOpen(false);
        setSearch("");
      }
    });
  }, [searchAnim]);

  // ── Folder state ────────────────────────────────────────────────────────────
  const [folders, setFolders]           = useState<ChatFolder[]>([]);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder]     = useState<ChatFolder | null>(null);
  const [pageIdx, setPageIdx]           = useState(0);
  const pagerRef        = useRef<any>(null);
  const folderScrollRef = useRef<ScrollView>(null);
  const tabLayoutsRef   = useRef<Record<number, { x: number; width: number }>>({});
  const folderPillX     = useRef(new Animated.Value(6)).current;
  const folderPillW     = useRef(new Animated.Value(52)).current;

  // ── Multi-select state ────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMenuVisible, setSelectionMenuVisible] = useState(false);

  // ── FAB hide-on-scroll ──────────────────────────────────────────────────────
  const fabAnim     = useRef(new Animated.Value(1)).current;
  const lastScrollY = useRef(0);
  const fabHidden   = useRef(false);

  const handleFabScroll = useCallback((e: any) => {
    const y  = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;

    if (dy > 6 && y > 60 && !fabHidden.current) {
      fabHidden.current = true;
      Animated.spring(fabAnim, { toValue: 0, ...CHAT_FAST_SPRING }).start();
    } else if (dy < -4 && fabHidden.current) {
      fabHidden.current = false;
      Animated.spring(fabAnim, { toValue: 1, ...CHAT_FAST_SPRING }).start();
    }
  }, [fabAnim]);

  const loadChatsImpl = useCallback(async (background = false) => {
    if (!user) return;
    const offline = !isOnline();

    // Offline users must be able to open the durable chat cache even when the
    // auth token has not yet been restored. Session verification is only
    // required before a server request, never before local hydration.
    // Native SQLite can be delayed by migrations on a release first launch.
    // Cache hydration is an enhancement, never a reason to block Supabase.
    const localNotes = await waitForRequest(
      getLocalNotesConversation(user.id),
      LOCAL_CHAT_HYDRATION_TIMEOUT_MS,
      () => {},
    );

    if (!background) {
      const cacheStartedAt = Date.now();
      const cached = hasPreloadedConversations()
        ? getPreloadedConversations()
        : await waitForRequest(getLocalConversations(), LOCAL_CHAT_HYDRATION_TIMEOUT_MS, () => {}) ?? [];
      const cachedItems = cached
        .filter((item: any) =>
          (localNotes || !isLocalNotesId(item.id)) &&
          !(item.other_id === user.id && !isLocalNotesId(item.id))
        )
        .map((item: any) => isLocalNotesId(item.id) ? { ...item, kind: "notes" as const } : item);
      if (localNotes && !cachedItems.some((item: any) => item.id === localNotes.id)) {
        cachedItems.push(localNotesToChatItem(localNotes));
      }
      if (cachedItems.length > 0) {
        setChats(cachedItems as any);
        setLoading(false);
      }
      if (__DEV__) {
        console.log("[ChatPerf] cache render", Date.now() - cacheStartedAt, "ms", "chats", cachedItems.length);
      }
    }

    if (offline) {
      setChats((prev) => {
        const withoutNotes = prev.filter((item) => !isLocalNotesId(item.id));
        return localNotes ? [...withoutNotes, localNotesToChatItem(localNotes)] : withoutNotes;
      });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // AuthContext can briefly lag behind Supabase's native session storage
    // after a sign-in or a cold start on a new device. Check the authoritative
    // session directly before the server query, but only after local hydration
    // has already made cached chats visible.
    if (!hasVerifiedSession) {
      let liveSessionUserId: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        liveSessionUserId = data.session?.user?.id ?? null;
      } catch {
        liveSessionUserId = null;
      }
      if (liveSessionUserId !== user.id) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }

    const unreadExcludedIds = [
      getActiveChatId(),
      ...chatsRef.current.filter((chat) => wasChatRecentlyVisited(chat.id)).map((chat) => chat.id),
    ].filter((id, index, ids): id is string => !!id && ids.indexOf(id) === index);

    const rpcStartedAt = Date.now();
    if (__DEV__) console.log("[ChatPerf] server RPC start");
    let chatRows: any[] | null = null;
    let chatError: { message?: string } | null = null;
    try {
      const result = await supabase.rpc(
        "get_chat_list",
        { p_unread_excluded_ids: unreadExcludedIds },
      );
      chatRows = result.data as any[] | null;
      chatError = result.error;
    } catch (error) {
      chatError = { message: error instanceof Error ? error.message : String(error) };
    }
    if (__DEV__) {
      console.log(
        "[ChatPerf] server RPC end",
        Date.now() - rpcStartedAt,
        "ms",
        "chats",
        chatRows?.length ?? 0,
      );
    }
    if (chatError) {
      if (localNotes) {
        setChats((prev) => [
          ...prev.filter((item) => !isLocalNotesId(item.id)),
          localNotesToChatItem(localNotes),
        ]);
      }
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!chatRows?.length) {
      // An empty response is not proof that the account has no chats. During
      // token refresh, a stale auth context or a transient RLS/network issue
      // can make the RPC return zero rows. Never erase a list already hydrated
      // from SQLite; keep it visible and let the next refresh reconcile it.
      if (localNotes) {
        setChats((prev) => {
          const withoutNotes = prev.filter((item) => !isLocalNotesId(item.id));
          return withoutNotes.length > 0
            ? [...withoutNotes, localNotesToChatItem(localNotes)]
            : [localNotesToChatItem(localNotes)];
        });
      } else if (chatsRef.current.length === 0) {
        setChats([]);
      }
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // The RPC includes chat membership, profile metadata, latest message,
    // delivery/read state, unread count, and mute state in one server query.
    const items: ChatItem[] = (chatRows as any[]).map((row: any): ChatItem => {
      const isSelfChat = !row.is_group && !row.is_channel && row.other_id === user.id;
      return {
        id: row.chat_id,
        name: row.chat_name ?? null,
        is_group: !!row.is_group,
        is_channel: !!row.is_channel,
         created_by: row.created_by || null,
        other_display_name: isSelfChat ? "My Notes" : (row.other_display_name || "Unknown"),
        other_handle: isSelfChat ? null : (row.other_handle || null),
        other_avatar: isSelfChat ? null : (row.other_avatar || null),
        other_id: isSelfChat ? user.id : (row.other_id || ""),
        last_message: row.last_message
          ? buildMsgPreview(row.last_message, row.last_message_attachment_type)
          : "",
        last_message_at: row.last_message_at || row.chat_updated_at || "",
        last_message_is_mine: !!row.last_message_is_mine,
        last_message_status: row.last_message_status === "read"
          ? "read"
          : row.last_message_status === "delivered"
            ? "delivered"
            : "sent",
        is_pinned: !!row.is_pinned,
        is_archived: !!row.is_archived,
        avatar_url: row.avatar_url || null,
        unread_count: Number(row.unread_count) || 0,
        is_verified: isSelfChat ? false : !!row.is_verified,
        is_organization_verified: isSelfChat ? false : !!row.is_organization_verified,
        other_last_seen: isSelfChat ? null : (row.other_last_seen || null),
        other_show_online: isSelfChat ? false : row.other_show_online !== false,
        muted_until: row.is_muted ? (row.muted_until || null) : undefined,
      };
    }).filter((item) =>
      item.is_group ||
      item.is_channel ||
      Boolean(item.other_id)
    );

    // My Notes is a local-only conversation. Hide any legacy server self-chat
    // instead of resurfacing the old auto-created version.
    const regularItems = items.filter(
      (item) =>
        !((!item.is_group && !item.is_channel && item.other_id === user.id))
    );

    regularItems.sort((a, b) => {
      // Pinned floats to top; archived sinks to bottom; otherwise newest-first
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      if (a.is_archived && !b.is_archived) return 1;
      if (!a.is_archived && b.is_archived) return -1;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });

    // ── Deduplicate DMs: one chat per other_id ────────────────────────────────
    // The list is already newest-first, so the FIRST occurrence of each other_id
    // is the canonical (most recent) chat. Stale duplicates are filtered out and
    // the user is silently removed from their chat_members so they never resurface.
    {
      const seenOtherIds = new Set<string>();
      const staleIds: string[] = [];
      const dedupedItems: ChatItem[] = [];
      for (const item of regularItems) {
        // Groups, channels, and self-chat are never duplicated — pass through.
        if (item.is_group || item.is_channel || !item.other_id || item.other_id === user.id) {
          dedupedItems.push(item);
          continue;
        }
        if (seenOtherIds.has(item.other_id)) {
          staleIds.push(item.id);
        } else {
          seenOtherIds.add(item.other_id);
          dedupedItems.push(item);
        }
      }
      regularItems.length = 0;
      regularItems.push(...dedupedItems);

      // Silently leave stale duplicate chats so they can't come back
      if (staleIds.length > 0) {
        Promise.all(
          staleIds.map((chatId) =>
            supabase.from("chat_members").delete().eq("chat_id", chatId).eq("user_id", user.id)
          )
        ).catch(() => {});
      }
    }

    // ── Load local unsent drafts ──────────────────────────────────────────────
    // Read all draft keys at once so we can (a) show "Draft:" labels and
    // (b) sort drafted chats above non-drafted ones.
    const notesItem = localNotes ? localNotesToChatItem(localNotes) : null;
    const combined = [
      ...regularItems,
      ...(notesItem ? [notesItem] : []),
    ];
    const allCombinedIds = combined.map((c) => c.id).filter(Boolean);
    let draftMap: Record<string, string> = {};
    try {
      const draftPairs = await AsyncStorage.multiGet(
        allCombinedIds.map((cid) => `chat_draft_${cid}`)
      );
      for (const [key, val] of draftPairs) {
        if (val && val.trim()) {
          draftMap[key.replace("chat_draft_", "")] = val;
        }
      }
    } catch {}

    // Sort: pinned → drafted (non-pinned, non-archived) → normal → archived
    combined.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      if (a.is_archived && !b.is_archived) return 1;
      if (!a.is_archived && b.is_archived) return -1;
      const aD = !a.is_pinned && !a.is_archived && !!draftMap[a.id];
      const bD = !b.is_pinned && !b.is_archived && !!draftMap[b.id];
      if (aD && !bD) return -1;
      if (!aD && bD) return 1;
      if (!a.last_message_at && b.last_message_at) return 1;
      if (a.last_message_at && !b.last_message_at) return -1;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });

    const finalItems: ChatItem[] = combined.map((item) => ({ ...item, draft: draftMap[item.id] || "" }));

    // Keep Android's native Direct Share targets in lockstep with the same
    // recent conversations rendered in this list. Groups use their chat
    // avatar; DMs use the other participant's profile avatar.
    updateNativeShareShortcuts(
      finalItems
        .filter((item) => item.kind !== "notes" && !item.is_archived)
        .map((item) => ({
          chatId: item.id,
          label: item.is_group || item.is_channel
            ? (item.name || "Group chat")
            : (item.other_display_name || "Chat"),
          avatarUrl: item.is_group || item.is_channel ? item.avatar_url : item.other_avatar,
          lastMessageAt: item.last_message_at,
          isGroup: item.is_group,
          isChannel: item.is_channel,
        })),
    );

    finalItems.forEach((item) => {
      if (item.unread_count === 0 && item.kind !== "notes") {
        clearChatVisited(item.id);
      }
    });

    setChats(finalItems);
    // Reconciliation complete — allow realtime events to increment unread again.
    suppressUnreadIncrementRef.current = false;
    // Persisting and image decoding are deliberately moved
    // off the navigation path. The list is useful as soon as setChats() runs;
    // these tasks can wait until the current gesture/transition is finished.
    InteractionManager.runAfterInteractions(() => {
      prefetchListImages(finalItems, { avatarFields: ["avatar_url", "other_avatar"] });
      invalidateConversationsPreload();
      const regularIds = [...regularItems.map((c) => c.id), ...(notesItem ? [notesItem.id] : [])];
      saveConversations(notesItem ? [...regularItems, notesItem] : regularItems).catch(() => {});
      pruneConversations(regularIds).catch(() => {});
    });
    setLoading(false);
    setRefreshing(false);
  }, [user, hasVerifiedSession]);

  // Initial mount and focus can fire together, and realtime can request a
  // refresh while the previous one is still running. Reuse the active promise
  // instead of starting another full Supabase/SQLite reconciliation. Also
  // throttle background focus refreshes so a tab switch cannot become a
  // network request storm.
  const loadChats = useCallback((background = false): Promise<void> => {
    if (!user) return Promise.resolve();
    if (chatLoadInFlightRef.current) return chatLoadInFlightRef.current;
    const now = Date.now();
    if (background && now - lastChatLoadAtRef.current < 5_000) {
      return Promise.resolve();
    }
    lastChatLoadAtRef.current = now;
    const refreshStartedAt = Date.now();
    const request = waitForRequest(
      loadChatsImpl(background),
      CHAT_REQUEST_TIMEOUT_MS,
      () => {
        setLoading(false);
        setRefreshing(false);
      },
    ).finally(() => {
      if (__DEV__) {
        console.log("[ChatPerf] total refresh", Date.now() - refreshStartedAt, "ms");
      }
      if (chatLoadInFlightRef.current === request) {
        chatLoadInFlightRef.current = null;
      }
    });
    chatLoadInFlightRef.current = request;
    return request;
  }, [user, hasVerifiedSession, loadChatsImpl]);

  // Realtime effects must not recreate their channels every time the chat
  // loader callback changes identity. Keep the latest loader behind a ref so
  // the member-insert channel has one lifecycle per authenticated user.
  const loadChatsRef = useRef(loadChats);
  loadChatsRef.current = loadChats;

  useEffect(() => { loadChats(); }, [loadChats]);
  useFocusEffect(useCallback(() => { loadChats(true); }, [loadChats]));

  // Push the latest total unread into the shared in-memory store so the tab
  // bar badge updates instantly without waiting for a SQLite round-trip.
  useEffect(() => {
    const total = chats.reduce((s, c) => s + (c.unread_count ?? 0), 0);
    setTotalUnread(total);
  }, [chats]);

  // Right-click context-menu actions on chat list rows.
  const handleChatAction = useCallback(
    async (
      action: "togglePin" | "toggleArchive" | "delete" | "open" | "mute" | "unmute",
      item: ChatItem,
    ) => {
      if (action === "open") {
        Haptics.selectionAsync();
        let chatId = item.id;
        safeRouter.push({
          pathname: "/chat/[id]",
          params: {
            id: chatId,
            otherName: item.kind === "notes" ? "My Notes" : (item.other_display_name || ""),
            otherAvatar: item.other_avatar || "",
            otherId: item.other_id || "",
            otherHandle: isNotificationsChatItem(item) ? "notifications" : (item.other_handle || ""),
            isGroup: item.is_group ? "true" : "false",
            isChannel: item.is_channel ? "true" : "false",
            chatName: item.name || "",
            chatAvatar: item.avatar_url || "",
          },
        });
        return;
      }
      if (action === "togglePin") {
        const next = !item.is_pinned;
        setChats((prev) =>
          prev.map((c) => (c.id === item.id ? { ...c, is_pinned: next } : c)),
        );
        const { error } = item.kind === "notes"
          ? { error: await (async () => {
               await updateLocalNotesFlags(user!.id, { is_pinned: next });
              return null;
            })() }
          : await supabase.from("chats").update({ is_pinned: next }).eq("id", item.id);
        if (error) {
          showAlert("Couldn't update pin", error.message);
          loadChats(true);
        } else {
          showActionToast(
            next ? "Chat pinned" : "Chat unpinned",
            "Undo",
            async () => {
              setChats((prev) =>
                prev.map((c) => (c.id === item.id ? { ...c, is_pinned: !next } : c)),
              );
              try {
                if (item.kind === "notes") {
                   await updateLocalNotesFlags(user!.id, { is_pinned: !next });
                } else {
                  await supabase.from("chats").update({ is_pinned: !next }).eq("id", item.id);
                }
              } catch {}
            },
            { type: "info", icon: next ? "pin" : "pin" },
          );
        }
        return;
      }
      if (action === "toggleArchive") {
        const next = !item.is_archived;
        setChats((prev) =>
          prev.map((c) => c.id === item.id ? { ...c, is_archived: next } : c),
        );
        const { error } = item.kind === "notes"
          ? { error: await (async () => {
               await updateLocalNotesFlags(user!.id, { is_archived: next });
              return null;
            })() }
          : await supabase.from("chats").update({ is_archived: next }).eq("id", item.id);
        if (error) {
          showAlert("Couldn't archive chat", error.message);
          loadChats(true);
        } else {
          showActionToast(
            next ? "Chat archived" : "Chat unarchived",
            "Undo",
            async () => {
              setChats((prev) =>
                prev.map((c) => (c.id === item.id ? { ...c, is_archived: !next } : c)),
              );
              try {
                if (item.kind === "notes") {
                   await updateLocalNotesFlags(user!.id, { is_archived: !next });
                } else {
                  await supabase.from("chats").update({ is_archived: !next }).eq("id", item.id);
                }
              } catch {}
            },
            { type: "info", icon: next ? "archive" : "archive" },
          );
        }
        return;
      }
      if (action === "delete") {
        const isGroup = item.is_group || item.is_channel;
        const ok = await confirmAlert(
          isGroup ? (item.is_channel ? "Leave channel?" : "Leave group?") : "Delete chat?",
          isGroup
            ? `You will leave this ${item.is_channel ? "channel" : "group"}. You can join again later.`
            : "This will permanently delete this conversation for everyone.",
          { confirmText: isGroup ? "Leave" : "Delete", destructive: true },
        );
        if (!ok) return;
        setChats((prev) => prev.filter((c) => c.id !== item.id));
        if (item.kind === "notes") {
          await removeLocalNotesConversation(user!.id);
          return;
        }
        deleteLocalConversation(item.id).catch(() => {});
        if (isGroup) {
          // Leave the group — remove only this user's membership
          const { error } = await supabase
            .from("chat_members")
            .delete()
            .eq("chat_id", item.id)
            .eq("user_id", user!.id);
          if (error) {
            showAlert("Couldn't leave group", error.message);
            loadChats(true);
          } else if (item.is_channel) {
            await supabase
              .from("channel_subscriptions")
              .delete()
              .eq("channel_id", item.id)
              .eq("user_id", user!.id);
          }
        } else {
          const { error } = await supabase
            .from("chats")
            .delete()
            .eq("id", item.id);
          if (error) {
            showAlert("Couldn't delete chat", error.message);
            loadChats(true);
          }
        }
        return;
      }
      if (action === "mute" || action === "unmute") {
        if (!user) return;
        if (item.kind === "notes") return;
        if (action === "unmute") {
          setChats((prev) => prev.map((c) => c.id === item.id ? { ...c, muted_until: undefined } : c));
          await supabase.from("chat_mutes").delete().eq("user_id", user.id).eq("chat_id", item.id);
          showToast("Notifications unmuted", { type: "info", icon: "notifications" });
        } else {
          // Quick mute: 8 hours by default from the list; full duration picker is inside the chat
          const until = new Date(Date.now() + 8 * 3600_000).toISOString();
          setChats((prev) => prev.map((c) => c.id === item.id ? { ...c, muted_until: until } : c));
          await supabase.from("chat_mutes").upsert(
            { user_id: user.id, chat_id: item.id, muted_until: until, created_at: new Date().toISOString() },
            { onConflict: "user_id,chat_id" },
          );
          showActionToast("Muted for 8 hours", "Undo", async () => {
            setChats((prev) => prev.map((c) => c.id === item.id ? { ...c, muted_until: undefined } : c));
            try { await supabase.from("chat_mutes").delete().eq("user_id", user.id).eq("chat_id", item.id); } catch {}
          }, { type: "info", icon: "notifications-off" });
        }
        return;
      }
    },
    [loadChats, user],
  );

  // ── Chat row press — shared handler with double-tap debounce ────────────────
  // A fast double-tap pushes the same route twice. The second mount runs its
  // useEffect setup (Supabase channel .on()) before the first mount's cleanup
  // fires, hitting the "cannot add postgres_changes after subscribe()" crash.
  // The 600 ms window matches a typical double-tap and is imperceptible to
  // deliberate navigation between different chats.
  const handleChatPress = useCallback((item: ChatItem) => {
    if (!user) return;
    const now = Date.now();
    if (now - lastChatNavRef.current < 600) return;
    lastChatNavRef.current = now;

    Haptics.selectionAsync();
    if (item.unread_count > 0) {
      markChatVisited(item.id);
      setChats((prev) => prev.map((c) => c.id === item.id ? { ...c, unread_count: 0 } : c));
      clearUnread(item.id).catch(() => {});
    }
    if (onOpenChat) { onOpenChat(item, item.id); return; }
    safeRouter.push({
      pathname: "/chat/[id]",
      params: {
        id: item.id,
        otherName: ((!item.is_group && !item.is_channel && phonebookNames.get(item.other_id)) || item.other_display_name || ""),
        otherAvatar: item.other_avatar || "",
        otherId: item.other_id || "",
        otherHandle: isNotificationsChatItem(item) ? "notifications" : (item.other_handle || ""),
        isGroup: item.is_group ? "true" : "false",
        isChannel: item.is_channel ? "true" : "false",
        channelRole: item.is_channel
          ? (item.created_by === user.id ? "owner" : "member")
          : "",
        chatName: item.name || "",
        chatAvatar: item.avatar_url || "",
      },
    });
  }, [user, onOpenChat, phonebookNames]);

  // ── Multi-select handlers ─────────────────────────────────────────────────
  const enterSelectMode = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectionMenuVisible(false);
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback((items: ChatItem[]) => {
    Haptics.selectionAsync();
    setSelectedIds(new Set(items.map((c) => c.id)));
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const ok = await confirmAlert(
      `Delete ${count} chat${count !== 1 ? "s" : ""}?`,
      "This removes the selected conversations from your chat list. Online chats are removed from the server; My Notes stays on this device only.",
      { confirmText: "Delete", destructive: true },
    );
    if (!ok) return;
    const ids = Array.from(selectedIds);
    const chatMap = new Map(chats.map((c) => [c.id, c]));
    setChats((prev) => prev.filter((c) => !ids.includes(c.id)));
    exitSelectMode();
    await Promise.all([
      ...ids.map((id) => {
        const c = chatMap.get(id);
        if (c?.kind === "notes") {
          return removeLocalNotesConversation(user!.id);
        }
        if (c?.is_group && !c?.is_channel) {
          // Leave the group — remove only this user's membership
          return supabase.from("chat_members").delete().eq("chat_id", id).eq("user_id", user!.id);
        }
        return supabase.from("chats").delete().eq("id", id);
      }),
      ...ids.map((id) => deleteLocalConversation(id)),
    ]);
  }, [selectedIds, exitSelectMode, chats, user]);

  // The confirmation alert lives in the app root, while the selection menu is
  // a native Modal. Close the native Modal before opening the alert, otherwise
  // the alert is mounted underneath it and the user cannot reach its buttons.
  const handleDeleteFromSelectionMenu = useCallback(() => {
    setSelectionMenuVisible(false);
    requestAnimationFrame(() => {
      handleBulkDelete();
    });
  }, [handleBulkDelete]);

  useEffect(() => {
    if (!user) return;
    import("../../lib/rewardXp").then(({ rewardXp }) => rewardXp("daily_login")).catch(() => {});
  }, [user]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    // Listen for new chats being created (new chat_member rows for this user).
    // Keep this effect keyed only to the authenticated user. Re-running it
    // whenever loadChats changes can race Supabase's async removeChannel()
    // cleanup and return an already-subscribed channel from the registry.
    const channelName = `chatlist-member-inserts:${userId}:${++chatListMemberChannelSequence}`;
    const memberChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_members", filter: `user_id=eq.${userId}` },
        () => { void loadChatsRef.current(true); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(memberChannel); };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    return addOnlineListener(() => loadChats());
  }, [user, loadChats]);

  // Suppress realtime unread increments while offline / reconnecting so that
  // replayed buffered messages don't mark every chat as unread. The flag is
  // cleared by loadChats() after it has reconciled correct counts from Supabase.
  useEffect(() => {
    return onConnectivityChange((online) => {
      if (!online) suppressUnreadIncrementRef.current = true;
    });
  }, []);


  const chatIdsKey = chats.map((c) => c.id).sort().join(",");

  useEffect(() => {
    if (!user || !chatIdsKey) return;

    const chatIds = chatIdsKey.split(",");

    // One filtered callback is much cheaper than registering one callback per
    // chat. The client still verifies the chat ID below, while Supabase does
    // the first-stage filtering server-side.
    const realtimeChatIds = chatIds.slice(0, 100);
    const msgChannel = supabase.channel(`chatlist-messages:${user.id}:${Date.now()}`);
    msgChannel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=in.(${realtimeChatIds.join(",")})`,
        },
        (payload: any) => {
          const msg = payload.new as {
            id: string;
            chat_id: string;
            encrypted_content: string | null;
            sent_at: string;
            attachment_type: string | null;
            sender_id: string;
          } | null;

          if (msg?.chat_id) {
            const preview = buildMsgPreview(msg.encrypted_content, msg.attachment_type);
            const isFromMe = msg.sender_id === user.id;
            const activeChatId = getActiveChatId();

            // Instantly patch the matching conversation in state — no network call needed.
            setChats((prev) => {
              const updated = prev.map((c) => {
                if (c.id !== msg.chat_id) return c;
                return {
                  ...c,
                  last_message: preview,
                  last_message_at: msg.sent_at,
                  last_message_is_mine: isFromMe,
                  // Increment unread only when the message is from someone else,
                  // this chat isn't the one currently open, and we are not in
                  // the suppression window (offline / reconnecting). Realtime
                  // replays buffered messages on reconnect which would otherwise
                  // mark every chat unread; loadChats() clears the suppression
                  // after it reconciles the correct counts from Supabase.
                  unread_count:
                    !isFromMe && msg.chat_id !== activeChatId && !wasChatRecentlyVisited(msg.chat_id) && !suppressUnreadIncrementRef.current
                      ? c.unread_count + 1
                      : c.unread_count,
                };
              });

              // Re-sort like every other conversation: user-pinned first,
              // archived last, then newest activity. Notes is not special here.
              updated.sort((a, b) => {
                if (a.is_pinned && !b.is_pinned) return -1;
                if (!a.is_pinned && b.is_pinned) return 1;
                if (a.is_archived && !b.is_archived) return 1;
                if (!a.is_archived && b.is_archived) return -1;
                if (!a.last_message_at && b.last_message_at) return 1;
                if (a.last_message_at && !b.last_message_at) return -1;
                return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
              });
              return updated;
            });
          }

          // Debounced full reconciliation (unread counts, read receipts, deleted messages, etc.)
          if (realtimeReconcileTimer.current) clearTimeout(realtimeReconcileTimer.current);
          realtimeReconcileTimer.current = setTimeout(() => loadChats(true), 2000);
        }
      );
    // The status callback fires synchronously when the WebSocket closes —
    // BEFORE Supabase replays any buffered events. This closes the race window
    // where NetInfo fires `offline` too late and buffered INSERTs slip through
    // and falsely mark every chat as unread.
    msgChannel.subscribe((status: string) => {
      if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        suppressUnreadIncrementRef.current = true;
      }
    });

    // Also subscribe to chat-level updates (pinning, archiving, name changes)
    // We filter client-side since Supabase realtime doesn't support IN filters
    const chatChannel = supabase
      .channel(`chatlist-chats:${user.id}:${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chats" },
        (payload: any) => {
          if (chatIds.includes(payload.new?.id)) {
            loadChats(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(chatChannel);
    };
  }, [user, chatIdsKey, loadChats]);

  useEffect(() => {
    if (!user || !chatPrefs.typing_indicators) return;
    const ch = supabase.channel(`user-typing-${user.id}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "typing" }, (payload) => {
      const { chat_id: chatId, user_id: uid, is_typing } = (payload.payload || {}) as any;
      if (!uid || uid === user.id || !chatId) return;
      if (is_typing) {
        if (typingTimersRef.current[chatId]) clearTimeout(typingTimersRef.current[chatId]);
        setTypingChatIds((prev) => ({ ...prev, [chatId]: true }));
        typingTimersRef.current[chatId] = setTimeout(() => {
          setTypingChatIds((prev) => { const next = { ...prev }; delete next[chatId]; return next; });
        }, 6000);
      } else {
        if (typingTimersRef.current[chatId]) { clearTimeout(typingTimersRef.current[chatId]); delete typingTimersRef.current[chatId]; }
        setTypingChatIds((prev) => { const next = { ...prev }; delete next[chatId]; return next; });
      }
    }).subscribe();
    return () => {
      supabase.removeChannel(ch);
      Object.values(typingTimersRef.current).forEach((t) => clearTimeout(t));
      typingTimersRef.current = {};
      setTypingChatIds({});
    };
  }, [user, chatPrefs.typing_indicators]);

  const tabFiltered = chats.filter((c) => {
    if (tabFilter === "unread") return c.unread_count > 0;
    if (tabFilter === "personal") return !c.is_group && !c.is_channel;
    if (tabFilter === "groups") return c.is_group && !c.is_channel;
    if (tabFilter === "channels") return c.is_channel;
    return true;
  });

  const filtered = search
    ? tabFiltered.filter((c) => {
        const name = c.is_group || c.is_channel ? c.name : c.other_display_name;
        return name?.toLowerCase().includes(search.toLowerCase());
      })
    : tabFiltered;

  const totalUnread = chats.reduce((sum, c) => sum + c.unread_count, 0);
    const personalCount = chats.filter((c) => !c.is_group && !c.is_channel).length;
  const groupsCount = chats.filter((c) => c.is_group && !c.is_channel).length;
    const channelsCount = chats.filter((c) => c.is_channel).length;

  const TABS: { key: ChatTabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: "all", label: "All chats", icon: "chatbubbles", count: chats.length },
    { key: "unread", label: "Unread", icon: "mail-unread", count: totalUnread },
    { key: "personal", label: "Personal", icon: "person", count: personalCount },
    { key: "groups", label: "Groups", icon: "people", count: groupsCount },
    { key: "channels", label: "Channels", icon: "megaphone", count: channelsCount },
  ];

  // ── Folder system ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadFolders().then(setFolders).catch(() => {});
  }, [user?.id]);

  // ── Folder pill animation + tab-bar auto-scroll ───────────────────────────
  // Fires on tap-to-switch; for swipe, the pill tracks in real-time via onPageScroll.
  useEffect(() => {
    const layout = tabLayoutsRef.current[pageIdx];
    if (!layout) return;
    Animated.spring(folderPillX, { toValue: layout.x - 4, damping: 22, stiffness: 200, useNativeDriver: false }).start();
    Animated.spring(folderPillW, { toValue: layout.width + 8, damping: 22, stiffness: 200, useNativeDriver: false }).start();
    folderScrollRef.current?.scrollTo({ x: Math.max(0, layout.x - 40), animated: true });
  }, [pageIdx]);

  // Real-time pill tracking during a PagerView swipe (position=int, offset=0..1)
  const handlePageScroll = useCallback((e: any) => {
    const { position, offset } = e.nativeEvent;
    const fromLayout = tabLayoutsRef.current[position];
    const toLayout   = tabLayoutsRef.current[position + 1];
    if (!fromLayout) return;
    if (!toLayout || offset === 0) {
      folderPillX.setValue(fromLayout.x - 4);
      folderPillW.setValue(fromLayout.width + 8);
      return;
    }
    folderPillX.setValue(fromLayout.x + (toLayout.x - fromLayout.x) * offset - 4);
    folderPillW.setValue(fromLayout.width + (toLayout.width - fromLayout.width) * offset + 8);
    folderScrollRef.current?.scrollTo({
      x: Math.max(0, fromLayout.x + (toLayout.x - fromLayout.x) * offset - 40),
      animated: false,
    });
  }, [folderPillX, folderPillW]);

  const handlePageSelected = useCallback((e: any) => {
    setPageIdx(e.nativeEvent.position);
  }, []);

  // Show the folder tab bar on mobile only when the feature is enabled or
  // the user already has folders (so their data is never hidden).
  const showFolderUI = !panelMode && (advancedFeatures.chat_folders || folders.length > 0);
  const hasFolders   = folders.length > 0;

  type AllPage = { key: "all" };
  const pages: (AllPage | ChatFolder)[] = [{ key: "all" }, ...folders];

  const getPageChats = useCallback(
    (page: AllPage | ChatFolder): ChatItem[] => {
      let result = chats;
      if ("filter" in page) {
        if (page.filter === "unread")   result = chats.filter((c) => c.unread_count > 0);
        else if (page.filter === "personal") result = chats.filter((c) => !c.is_group && !c.is_channel);
        else if (page.filter === "groups")   result = chats.filter((c) => c.is_group && !c.is_channel);
        else if (page.filter === "channels") result = chats.filter((c) => c.is_channel);
      }
      if (search) {
        result = result.filter((c) => {
          const name = c.is_group || c.is_channel ? c.name : c.other_display_name;
          return name?.toLowerCase().includes(search.toLowerCase());
        });
      }
      return result;
    },
    [chats, search],
  );

  useEffect(() => {
    if (panelMode) return;
    navigation.setOptions({
      tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? "99+" : totalUnread) : undefined,
    });
  }, [navigation, totalUnread, panelMode]);

  // Chats currently visible — used by "Select All" to know what to select.
  const currentPageChats: ChatItem[] = showFolderUI && hasFolders
    ? getPageChats(pages[pageIdx] ?? { key: "all" })
    : filtered;

  if (!user) {
    // Auth is still resolving — don't redirect yet. Avoids a race on desktop
    // where ChatsScreen mounts before the auth context has set the user.
    if (authLoading) return null;

    // Belt-and-suspenders: MMKV still has a userId → session is still being
    // restored in the background (token refresh in flight). Redirecting here
    // would kick a logged-in user to the login screen. Hold until the synthetic
    // user is set by AuthContext or the restore completes.
    if (getCachedUserId()) return null;

    if (panelMode) {
      // Inside the desktop master-detail panel (or any desktop context) — keep
      // the layout intact and show a tasteful "sign in" placeholder instead of
      // redirecting to Discover and breaking the desktop shell layout.
      return (
        <View style={[styles.root, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24 }]}>
          <AfuLogo size={88} />
          <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12 }]}>Sign in to chat</Text>
        </View>
      );
    }
    // Mobile / non-desktop only — redirect to login.
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          width: panelMode ? 360 : undefined,
          borderRightWidth: panelMode ? 0.5 : 0,
          borderRightColor: colors.border,
        },
      ]}
    >
      {panelMode ? (
        <View style={[styles.panelHeader, { backgroundColor: colors.background }]}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Chats</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TouchableOpacity
              onPress={() => safeRouter.push("/chat/new" as any)}
              style={[styles.panelHeaderBtn, { backgroundColor: colors.backgroundSecondary }]}
              activeOpacity={0.7}
            >
              <Ionicons name="create" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8 },
        ]}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: 0 }]} />
         {!selectMode && !panelMode && (
           <Animated.View
             style={[
               styles.headerSearchOverlay,
               {
                 backgroundColor: colors.backgroundSecondary,
                 borderColor: colors.border,
                 opacity: searchAnim,
                  pointerEvents: searchOpen ? "auto" : "none",
                 transform: [
                   { translateX: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                   { scaleX: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
                 ],
               },
             ]}
           >
             <Ionicons name="search" size={18} color={colors.textMuted} />
             <TextInput
               ref={searchInputRef}
               value={search}
               onChangeText={setSearch}
               placeholder="Search chats"
               placeholderTextColor={colors.textMuted}
               style={[styles.headerSearchInput, { color: colors.text }]}
               autoCorrect={false}
               returnKeyType="search"
             />
             {search.length > 0 && (
               <TouchableOpacity
                 onPress={() => setSearch("")}
                 hitSlop={8}
                 style={styles.headerSearchClear}
               >
                 <Ionicons name="close-circle" size={17} color={colors.textMuted} />
               </TouchableOpacity>
             )}
             <TouchableOpacity onPress={closeChatSearch} hitSlop={8} style={styles.headerSearchClose}>
               <Ionicons name="close" size={21} color={colors.text} />
             </TouchableOpacity>
           </Animated.View>
         )}
        {/* Left side: Cancel in select mode, else user profile avatar */}
        {selectMode ? (
          <TouchableOpacity
            onPress={exitSelectMode}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={[selStyles.cancelText, { color: colors.accent }]}>Cancel</Text>
          </TouchableOpacity>
        ) : user ? (
          <TouchableOpacity
            onPress={() => safeRouter.push("/(tabs)/me" as any)}
            activeOpacity={0.8}
            hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
          >
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={{ width: 34, height: 34, borderRadius: 17 }}
              />
            ) : (
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" }}>
                  {(profile?.display_name?.[0] ?? profile?.handle?.[0] ?? "A").toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
           ) : null}

        {/* Title — absolutely centered so it stays in the middle
            regardless of how wide the left/right elements are */}
        <View
          style={{ position: "absolute", left: 0, right: 0, bottom: 12, alignItems: "center", pointerEvents: "none" }}
        >
          {selectMode ? (
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select chats"}
            </Text>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Afu</Text>
              <Text style={[styles.headerTitle, { color: colors.accent }]}>Chat</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {selectMode ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <TouchableOpacity
                onPress={() => selectAll(currentPageChats)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                disabled={selectedIds.size === currentPageChats.length && currentPageChats.length > 0}
                accessibilityRole="button"
                accessibilityLabel="Select all chats"
              >
                <Text style={[selStyles.selectAllText, { color: selectedIds.size === currentPageChats.length && currentPageChats.length > 0 ? colors.textMuted : colors.accent }]}>
                  All
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSelectionMenuVisible(true)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                accessibilityRole="button"
                accessibilityLabel="More actions for selected chats"
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
           ) : (
             <TouchableOpacity
               onPress={openChatSearch}
               hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
               style={styles.headerSearchButton}
               activeOpacity={0.7}
               accessibilityRole="button"
               accessibilityLabel="Search chats"
             >
               <Ionicons name="search" size={20} color={colors.text} />
             </TouchableOpacity>
           )}
        </View>
      </View>
      )}
      <OfflineBanner />

      {!panelMode && !selectMode && <HomeBanner />}




      <View style={styles.body}>

        {/* ── Folder tab bar — fixed, always visible regardless of list content ── */}
        {showFolderUI && (
          <View style={{ backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
            <ScrollView
              ref={folderScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.folderTabBarContent}
              keyboardShouldPersistTaps="handled"
            >
              {pages.map((p, idx) => {
                const isA = !("filter" in p);
                const lbl = isA ? "All" : p.name;
                const ico = isA ? null : p.icon;
                const act = pageIdx === idx;
                const cnt = isA ? chats.length : getPageChats(p).length;
                return (
                  <TouchableOpacity
                    key={isA ? "all" : p.id}
                    onLayout={(e) => {
                      tabLayoutsRef.current[idx] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
                      if (idx === pageIdx) { folderPillX.setValue(e.nativeEvent.layout.x); folderPillW.setValue(e.nativeEvent.layout.width); }
                    }}
                    onPress={() => {
                      setPageIdx(idx);
                      if (hasFolders) {
                        _PagerView ? pagerRef.current?.setPage(idx) : pagerRef.current?.scrollToIndex({ index: idx, animated: true });
                      }
                    }}
                    onLongPress={() => {
                      if (!isA) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setEditingFolder(p as ChatFolder); setShowFolderModal(true); }
                    }}
                    activeOpacity={0.75}
                    style={styles.folderPillWrap}
                  >
                    <View style={[styles.folderGlassPill, { borderColor: act ? colors.accent + "55" : isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)", backgroundColor: act ? colors.accent + "18" : colors.backgroundSecondary }]}>
                      <View style={styles.folderTabInner}>
                        {ico && <Text style={styles.folderTabIcon}>{ico}</Text>}
                        <Text style={[styles.folderTabLabel, { color: act ? colors.accent : colors.textMuted, fontFamily: act ? "Inter_700Bold" : "Inter_500Medium" }]}>{lbl}</Text>
                        {cnt > 0 && <View style={[styles.folderTabBadge, { backgroundColor: act ? colors.accent + "30" : isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)" }]}><Text style={[styles.folderTabBadgeText, { color: act ? colors.accent : colors.textMuted }]}>{cnt > 99 ? "99+" : cnt}</Text></View>}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {advancedFeatures.chat_folders && (
                <TouchableOpacity style={styles.folderPillWrap} onPress={() => { setEditingFolder(null); setShowFolderModal(true); }} activeOpacity={0.7}>
                  <View style={[styles.folderAddBtn, { borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)", backgroundColor: colors.backgroundSecondary }]}>
                    <Ionicons name="add" size={18} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}

        {/* ── Mobile swipeable pager (only when folders exist) ──────────── */}
        {showFolderUI && hasFolders ? (
          _PagerView ? (
            /* Native PagerView — true 1:1 finger tracking, content visible while swiping */
            <_PagerView
              ref={pagerRef}
              style={{ flex: 1 }}
              initialPage={0}
              onPageScroll={handlePageScroll}
              onPageSelected={handlePageSelected}
              overdrag={false}
            >
              {pages.map((page) => {
                const isAll     = !("filter" in page);
                const pageKey   = isAll ? "all" : (page as any).id;
                const pageChats = getPageChats(page);
                return (
                  <View key={pageKey} style={{ flex: 1, paddingTop: 0 }}>
                    {loading ? (
                      <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <ChatRowSkeleton key={i} />)}</View>
                    ) : pageChats.length === 0 ? (
                      <View style={styles.center}>
                        <AfuLogo size={80} />
                        <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12 }]}>
                          {isAll ? "No chats yet" : `No ${"filter" in page ? page.name : ""} chats`}
                        </Text>
                        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                          {isAll ? "Start a conversation from Contacts" : "Try another filter"}
                        </Text>
                      </View>
                    ) : (
                      <SafeFlashList
                        data={pageChats}
                        keyExtractor={(item: ChatItem) => item.id}
                        estimatedItemSize={74}
                        renderItem={({ item }: { item: ChatItem }) => (
                          <ChatRow
                            item={item}
                            phonebookName={!item.is_group && !item.is_channel ? phonebookNames.get(item.other_id) : undefined}
                            isTyping={chatPrefs.typing_indicators && !!typingChatIds[item.id]}
                            selectMode={selectMode}
                            isSelected={selectedIds.has(item.id)}
                            onEnterSelectMode={() => enterSelectMode(item.id)}
                            onToggleSelect={() => toggleSelect(item.id)}
                            onPress={() => handleChatPress(item)}
                          onAction={handleChatAction}
                          />
                        )}
                        ItemSeparatorComponent={() => <Separator indent={74} />}
                        ListHeaderComponent={(
                          isAll && !search && user ? (
                            <>
                              <StoryUploadBanner colors={colors} />
                              <PostUploadBanner colors={colors} />
                            </>
                          ) : null
                        )}
                        refreshControl={
                          <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); loadChats(); }}
                            tintColor={colors.accent}
                          />
                        }
                        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                        showsVerticalScrollIndicator={false}
                        onScroll={handleFabScroll}
                        scrollEventThrottle={16}
                      />
                    )}
                  </View>
                );
              })}
            </_PagerView>
          ) : (
            /* Web / PagerView-unavailable fallback — horizontal FlatList pager */
            <FlatList
              ref={pagerRef}
              data={pages}
              keyExtractor={(p) => ("filter" in p ? p.id : "all")}
              horizontal
              pagingEnabled
              scrollEnabled
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              getItemLayout={(_, index) => ({ length: windowWidth, offset: windowWidth * index, index })}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
                setPageIdx(idx);
              }}
              renderItem={({ item: page }) => {
                const isAll     = !("filter" in page);
                const pageChats = getPageChats(page);
                return (
                  <View style={{ width: windowWidth, flex: 1, paddingTop: 0 }}>
                    {loading ? (
                      <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <ChatRowSkeleton key={i} />)}</View>
                    ) : pageChats.length === 0 ? (
                      <View style={styles.center}>
                        <AfuLogo size={80} />
                        <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12 }]}>
                          {isAll ? "No chats yet" : `No ${"filter" in page ? page.name : ""} chats`}
                        </Text>
                        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                          {isAll ? "Start a conversation from Contacts" : "Try another filter"}
                        </Text>
                      </View>
                    ) : (
                      <SafeFlashList
                        data={pageChats}
                        keyExtractor={(item: ChatItem) => item.id}
                        estimatedItemSize={74}
                        renderItem={({ item }: { item: ChatItem }) => (
                          <ChatRow
                            item={item}
                            phonebookName={!item.is_group && !item.is_channel ? phonebookNames.get(item.other_id) : undefined}
                            isTyping={chatPrefs.typing_indicators && !!typingChatIds[item.id]}
                            selectMode={selectMode}
                            isSelected={selectedIds.has(item.id)}
                            onEnterSelectMode={() => enterSelectMode(item.id)}
                            onToggleSelect={() => toggleSelect(item.id)}
                            onPress={() => handleChatPress(item)}
                          onAction={handleChatAction}
                          />
                        )}
                        ItemSeparatorComponent={() => <Separator indent={74} />}
                        ListHeaderComponent={(
                          isAll && !search && user ? (
                            <>
                              <StoryUploadBanner colors={colors} />
                              <PostUploadBanner colors={colors} />
                            </>
                          ) : null
                        )}
                        refreshControl={
                          <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); loadChats(); }}
                            tintColor={colors.accent}
                          />
                        }
                        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                        showsVerticalScrollIndicator={false}
                        onScroll={handleFabScroll}
                        scrollEventThrottle={16}
                      />
                    )}
                  </View>
                );
              }}
            />
          )
        ) : (
          /* ── Single-page list (no folders, or desktop/panel mode) ──── */
          <View style={{ flex: 1, paddingTop: 0 }}>
            {loading ? (
              <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <ChatRowSkeleton key={i} />)}</View>
                    ) : filtered.length === 0 ? (
              <View style={styles.center}>
                <AfuLogo size={80} />
                <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12 }]}>
                  {tabFilter === "all" ? "No chats yet" : `No ${TABS.find(t => t.key === tabFilter)?.label.toLowerCase()}`}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  {tabFilter === "all" ? "Start a conversation from Contacts" : "Try another filter"}
                </Text>
              </View>
            ) : (
              <SafeFlashList
                data={filtered}
                keyExtractor={(item: ChatItem) => item.id}
                estimatedItemSize={74}
                renderItem={({ item }: { item: ChatItem }) => (
                  <ChatRow
                    item={item}
                    phonebookName={!item.is_group && !item.is_channel ? phonebookNames.get(item.other_id) : undefined}
                    isActive={panelMode && item.id === activeChatId}
                    isTyping={chatPrefs.typing_indicators && !!typingChatIds[item.id]}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(item.id)}
                    onEnterSelectMode={() => enterSelectMode(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onPress={() => handleChatPress(item)}
                    onAction={handleChatAction}
                  />
                )}
                ItemSeparatorComponent={() => <Separator indent={74} />}
                ListHeaderComponent={(
                  user && tabFilter === "all" && !search ? (
                    <>
                      <StoryUploadBanner colors={colors} />
                      <PostUploadBanner colors={colors} />
                    </>
                  ) : null
                )}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => { setRefreshing(true); loadChats(); }}
                    tintColor={colors.accent}
                  />
                }
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                showsVerticalScrollIndicator={false}
                onScroll={handleFabScroll}
                scrollEventThrottle={16}
              />
            )}
          </View>
        )}


      </View>

      {/* ── Folder create / edit modal ────────────────────────────────────── */}
      <FolderModal
        visible={showFolderModal}
        initial={editingFolder}
        onClose={() => { setShowFolderModal(false); setEditingFolder(null); }}
        onSave={async (data) => {
          if (editingFolder) {
            await updateFolder(editingFolder.id, data);
          } else {
            await createFolder(data);
          }
          const updated = await loadFolders();
          setFolders(updated);
          setShowFolderModal(false);
          setEditingFolder(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        onDelete={editingFolder ? async () => {
          await deleteFolder(editingFolder.id);
          const updated = await loadFolders();
          setFolders(updated);
          const newIdx = Math.min(pageIdx, updated.length);
          setPageIdx(newIdx);
          if (newIdx < updated.length + 1) {
            _PagerView
              ? pagerRef.current?.setPage(newIdx)
              : pagerRef.current?.scrollToIndex({ index: newIdx, animated: false });
          }
          setShowFolderModal(false);
          setEditingFolder(null);
        } : undefined}
      />

      {/* ── Hidden selection actions ──────────────────────────────────────────
          Actions stay out of the way while selecting. They appear only after
          tapping the discreet ellipsis in the selection header. */}
      <Modal
        visible={selectionMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectionMenuVisible(false)}
      >
        <Pressable
          style={selStyles.menuBackdrop}
          onPress={() => setSelectionMenuVisible(false)}
        >
          <Pressable
            style={[selStyles.menuCard, { backgroundColor: colors.surface }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={selStyles.menuHandle} />
            <Text style={[selStyles.menuTitle, { color: colors.text }]}>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Chat actions"}
            </Text>
            {selectedIds.size > 0 ? (
              <TouchableOpacity
                style={selStyles.menuAction}
                onPress={handleDeleteFromSelectionMenu}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Delete selected chats"
              >
                <View style={[selStyles.menuIcon, { backgroundColor: "rgba(255,59,48,0.14)" }]}>
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[selStyles.menuActionTitle, { color: "#FF3B30" }]}>Delete chats</Text>
                  <Text style={[selStyles.menuActionSub, { color: colors.textMuted }]}>
                    Remove the selected conversations
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <Text style={[selStyles.menuHint, { color: colors.textMuted }]}>
                Select one or more chats first.
              </Text>
            )}
            <TouchableOpacity
              style={[selStyles.menuCancel, { backgroundColor: colors.backgroundSecondary }]}
              onPress={() => setSelectionMenuVisible(false)}
              activeOpacity={0.75}
            >
              <Text style={[selStyles.menuCancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

/**
 * Default route export — the chats screen as it appears at /(tabs).
 *
 * On desktop (web ≥ 1024px or ?view=desktop), renders a two-pane layout:
 *   Left  (360px) — persistent chats list in panel mode
 *   Right (flex 1) — tabbed conversation area; clicking a chat opens it
 *                    in a tab instead of navigating to /chat/[id].
 * On mobile, renders the full-screen chats list as usual.
 */
export default function ChatsRoute() {
  return <Redirect href="/(tabs)/discover" />;
}

/**
 * Named export used by `DesktopShell` to render the chats list as a sticky
 * 360px column on the left of any /(tabs) or /chat/* route. Includes its
 * own data fetching, search, filter rail, and active-chat highlighting.
 */
export function ChatsListPanel() {
  return <ChatsScreen panelMode />;
}

const selStyles = StyleSheet.create({
  avatarRing: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  selectAllText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 4,
  },
  menuBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.52)",
    justifyContent: "flex-end",
  },
  menuCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  menuHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.45)",
    marginBottom: 18,
  },
  menuTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 14,
  },
  menuAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  menuActionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  menuActionSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
  },
  menuHint: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 12,
  },
  menuCancel: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  menuCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  body: { flex: 1 },
  bodyRow: { flexDirection: "row" },

  folderTabBarContent: {
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
  },
  folderPillWrap: {
    alignSelf: "center",
    borderRadius: 999,
    overflow: "hidden",
  },
  folderGlassPill: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  folderTab: {
    paddingHorizontal: 10,
    alignItems: "center",
    minWidth: 52,
  },
  folderTabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  folderTabIcon: {
    fontSize: 14,
    lineHeight: 18,
  },
  folderTabLabel: {
    fontSize: 13,
    letterSpacing: 0.1,
  },
  folderTabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  folderTabBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
  folderTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 10,
    right: 10,
    height: 2.5,
    borderRadius: 2,
  },
  folderAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  rail: {
    width: 88,
    paddingTop: 4,
    paddingHorizontal: 4,
    gap: 2,
  },
  railTab: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    gap: 4,
  },
  railIconWrap: {
    width: 36,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  railLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
    textAlign: "center",
  },
  railBadge: {
    position: "absolute",
    top: -4,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  railBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", fontWeight: "700" },
  headerSearchOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 7,
    height: 42,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 13,
    gap: 8,
  },
  headerSearchInput: {
    flex: 1,
    height: 40,
    paddingVertical: 0,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.1,
  },
  headerSearchButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSearchClear: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSearchClose: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  panelTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  panelHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  headerIcon: { padding: 4, position: "relative" },
  notifBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#FF3B30",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notifBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  searchWrap: { paddingHorizontal: 14, paddingVertical: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 40,
    gap: 9,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 40, letterSpacing: 0.1 },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  aiBtn: {
    borderRadius: 8,
    overflow: "hidden",
  },
  aiBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 3,
    borderRadius: 8,
  },
  aiBtnText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowContent: { flex: 1 },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  nameRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  rowTopRight: { flexDirection: "row", alignItems: "center", gap: 2 },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 6 },
  preview: { fontSize: 14, fontFamily: "Inter_400Regular" },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", lineHeight: 14 },
  onlineDot: { position: "absolute", bottom: 1, right: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: "#34C759", borderWidth: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  fab: {
    position: "absolute",
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraFab: {
    position: "absolute",
    right: 24,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
