import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
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
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router, useFocusEffect, useNavigation, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { Avatar } from "@/components/ui/Avatar";
import { StoryRing } from "@/components/ui/StoryRing";
import { Separator } from "@/components/ui/Separator";
import Colors from "@/constants/colors";
import { ChatRowSkeleton } from "@/components/ui/Skeleton";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { HomeBanner } from "@/components/ui/HomeBanner";
import { SuggestedUsers } from "@/components/ui/SuggestedUsers";
import { isOnline } from "@/lib/offlineStore";
import { getLocalConversations, saveConversations, hasLocalConversations } from "@/lib/storage/localConversations";
import { addOnlineListener } from "@/lib/offlineSync";
import { wasChatRecentlyVisited, clearChatVisited, getActiveChatId } from "@/lib/chatVisited";
import { showAlert, confirmAlert } from "@/lib/alert";
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
import {
  getViewedUserIds,
  subscribeStoryViewed,
} from "@/lib/storyViewedStore";
import { usePhonebookNames } from "@/hooks/usePhonebookNames";

type StoryUser = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  hasUnseen: boolean;
  storyCount: number;
  seenCount: number;
  latestAt: string;
};

type ChatItem = {
  id: string;
  name: string | null;
  is_group: boolean;
  is_channel: boolean;
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
};

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
    action: "togglePin" | "toggleArchive" | "delete" | "open",
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
  // Lazy import to avoid touching native paths.
  const { useContextMenu, ContextMenu } =
    require("@/components/desktop/ContextMenu") as typeof import("@/components/desktop/ContextMenu");
  const { bind, menuProps } = useContextMenu([
    [
      {
        key: "open",
        label: "Open chat",
        icon: "open-outline",
        onSelect: () => onAction?.("open", item),
      },
      {
        key: "pin",
        label: item.is_pinned ? "Unpin chat" : "Pin chat",
        icon: item.is_pinned ? "pin" : "pin-outline",
        onSelect: () => onAction?.("togglePin", item),
      },
      {
        key: "archive",
        label: item.is_archived ? "Unarchive" : "Archive",
        icon: item.is_archived ? "archive" : "archive-outline",
        onSelect: () => onAction?.("toggleArchive", item),
      },
    ],
    [
      {
        key: "delete",
        label: "Delete chat",
        icon: "trash-outline",
        destructive: true,
        onSelect: () => onAction?.("delete", item),
      },
    ],
  ]);
  const displayName = item.is_group || item.is_channel
    ? item.name
    : (phonebookName || item.other_display_name);
  const avatar = item.is_group || item.is_channel ? item.avatar_url : item.other_avatar;
  const hasUnread = item.unread_count > 0 && !wasChatRecentlyVisited(item.id);
  const isOnlineDot = !item.is_group && !item.is_channel && isUserOnline(item.other_last_seen, item.other_show_online);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (hasUnread) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.28, duration: 650, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulse.setValue(1);
    }
  }, [hasUnread]);

  return (
    <View {...bind}>
      <ContextMenu {...menuProps} />
    <TouchableOpacity
      style={[styles.row, { backgroundColor: isSelected ? colors.accent + "18" : isActive ? colors.backgroundSecondary : colors.surface }]}
      onPress={selectMode ? onToggleSelect : onPress}
      onLongPress={selectMode ? undefined : onEnterSelectMode}
      delayLongPress={320}
      activeOpacity={0.7}
    >
      {selectMode && (
        <View style={[
          selStyles.circle,
          { borderColor: isSelected ? colors.accent : colors.textMuted + "66" },
          isSelected && { backgroundColor: colors.accent },
        ]}>
          {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
        </View>
      )}
      <View style={{ position: "relative" }}>
        <Avatar uri={avatar} name={displayName || "Chat"} size={50} square={!!(item.is_organization_verified)} />
        {isOnlineDot && (
          <View style={[styles.onlineDot, { borderColor: colors.surface }]} />
        )}
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <View style={styles.nameRow}>
            {item.is_pinned && (
              <Ionicons name="pin" size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
            )}
            <Text
              style={[styles.name, { color: colors.text, fontFamily: hasUnread ? "Inter_700Bold" : "Inter_600SemiBold" }]}
              numberOfLines={1}
            >
              {displayName || "Chat"}
            </Text>
            {!item.is_group && (
              <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={14} />
            )}
            {item.is_channel && (
              <Ionicons name="megaphone" size={12} color={colors.accent} style={{ marginLeft: 4 }} />
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
          ) : (
          <Text
            style={[styles.preview, { color: hasUnread ? colors.text : colors.textSecondary, fontFamily: hasUnread ? "Inter_500Medium" : "Inter_400Regular", flex: 1 }]}
            numberOfLines={1}
          >
            {item.last_message || "No messages yet"}
          </Text>
          )}
          {hasUnread && (
            <Animated.View style={[styles.unreadBadge, { backgroundColor: colors.accent, transform: [{ scale: pulse }] }]}>
              <Text style={styles.unreadBadgeText}>
                {item.unread_count > 99 ? "99+" : item.unread_count}
              </Text>
            </Animated.View>
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

const uploadBannerStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  iconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, fontWeight: "600" },
  caption: { fontSize: 11, marginTop: 1 },
  pct: { fontSize: 12, fontWeight: "600", minWidth: 30, textAlign: "right" },
  track: { height: 3, borderRadius: 2, overflow: "hidden" },
  fill: { height: 3, borderRadius: 2 },
});

function StoriesBar({ userId, colors, isDesktop }: { userId: string; colors: any; isDesktop: boolean }) {
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  // Used to force re-render when storyViewedStore fires
  const [_viewedTick, setViewedTick] = useState(0);

  const loadStories = useCallback(async () => {
    const now = new Date().toISOString();
    const { data: storiesData } = await supabase
      .from("stories")
      .select("id, user_id, caption, privacy, created_at, profiles!stories_user_id_fkey(display_name, avatar_url)")
      .gt("expires_at", now)
      .order("created_at", { ascending: true })
      .limit(100);

    if (!storiesData || storiesData.length === 0) {
      setStoryUsers([]);
      return;
    }

    const filtered = storiesData.filter((s: any) => {
      const p = s.privacy || "everyone";
      if (p === "only_me" && s.user_id !== userId) return false;
      if (p === "close_friends" && s.user_id !== userId) return false;
      return true;
    });

    if (filtered.length === 0) {
      setStoryUsers([]);
      return;
    }

    const storyIds = filtered.map((s: any) => s.id);
    const { data: viewsData } = await supabase
      .from("story_views")
      .select("story_id")
      .eq("viewer_id", userId)
      .in("story_id", storyIds);

    const viewedSet = new Set((viewsData || []).map((v: any) => v.story_id));
    const sessionViewed = getViewedUserIds();

    const userMap = new Map<string, StoryUser>();
    for (const s of filtered as any[]) {
      const existing = userMap.get(s.user_id);
      // Own stories are always "seen" — you created them
      // Also mark as seen if the session store says this userId was visited
      const isOwnStory = s.user_id === userId;
      const sessionSeen = sessionViewed.has(s.user_id);
      const isSeen = isOwnStory || sessionSeen || viewedSet.has(s.id);
      if (existing) {
        existing.storyCount += 1;
        if (isSeen) existing.seenCount += 1;
        if (!isSeen) existing.hasUnseen = true;
        if (s.created_at > existing.latestAt) existing.latestAt = s.created_at;
      } else {
        userMap.set(s.user_id, {
          userId: s.user_id,
          displayName: s.profiles?.display_name || "User",
          avatarUrl: s.profiles?.avatar_url || null,
          hasUnseen: !isSeen,
          storyCount: 1,
          seenCount: isSeen ? 1 : 0,
          latestAt: s.created_at,
        });
      }
    }

    const users = Array.from(userMap.values());
    users.sort((a, b) => {
      if (a.hasUnseen && !b.hasUnseen) return -1;
      if (!a.hasUnseen && b.hasUnseen) return 1;
      return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
    });

    setStoryUsers(users);
  }, [userId]);

  // Refresh ring immediately when the view screen marks stories as viewed
  useEffect(() => {
    return subscribeStoryViewed(() => {
      setViewedTick((t) => t + 1);
      setStoryUsers((prev) =>
        prev.map((u) => {
          if (getViewedUserIds().has(u.userId)) {
            return { ...u, seenCount: u.storyCount, hasUnseen: false };
          }
          return u;
        })
      );
    });
  }, []);

  useFocusEffect(useCallback(() => { loadStories(); }, [loadStories]));

  useEffect(() => {
    const channel = supabase
      .channel("stories-bar-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stories" }, () => {
        loadStories();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadStories]);

  if (storyUsers.length === 0 && isDesktop) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={storyBarStyles.list} nestedScrollEnabled>
      {!isDesktop && (
        <TouchableOpacity
          style={storyBarStyles.item}
          onPress={() => router.push("/stories/camera")}
          activeOpacity={0.75}
        >
          <View style={[storyBarStyles.addCircle, { borderColor: colors.accent }]}>
            <Ionicons name="add" size={26} color={colors.accent} />
          </View>
          <Text style={[storyBarStyles.name, { color: colors.textSecondary }]}>Your Story</Text>
        </TouchableOpacity>
      )}
      {storyUsers.map((u) => (
        <TouchableOpacity
          key={u.userId}
          style={storyBarStyles.item}
          onPress={() => router.push({ pathname: "/stories/view", params: { userId: u.userId } })}
        >
          <StoryRing size={52} storyCount={u.storyCount} seenCount={u.seenCount}>
            <Avatar uri={u.avatarUrl} name={u.displayName} size={52} />
          </StoryRing>
          <Text style={[storyBarStyles.name, { color: colors.textSecondary }]} numberOfLines={1}>{u.displayName}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const storyBarStyles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingVertical: 10, gap: 14 },
  item: { alignItems: "center", width: 68 },
  addCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.brand, borderStyle: "dashed" },
  name: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" },
});

// ─── Compact Story Avatars for Header ────────────────────────────────────────
function CompactStoryHeader({ userId, colors, onExpand }: { userId: string; colors: any; onExpand: () => void }) {
  const [previews, setPreviews] = useState<Array<{ id: string; avatarUrl: string | null; displayName: string; hasUnseen: boolean }>>([]);

  useEffect(() => {
    const now = new Date().toISOString();
    supabase.from("stories")
      .select("user_id, profiles!stories_user_id_fkey(display_name, avatar_url)")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!data?.length) { setPreviews([]); return; }
        const seen = new Set<string>();
        const list: Array<{ id: string; avatarUrl: string | null; displayName: string; hasUnseen: boolean }> = [];
        for (const s of data as any[]) {
          if (seen.has(s.user_id)) continue;
          seen.add(s.user_id);
          list.push({
            id: s.user_id,
            avatarUrl: s.profiles?.avatar_url || null,
            displayName: s.profiles?.display_name || "User",
            hasUnseen: s.user_id !== userId,
          });
          if (list.length >= 3) break;
        }
        setPreviews(list);
      });
  }, [userId]);

  if (previews.length === 0) return null;

  return (
    <TouchableOpacity onPress={onExpand} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 2 }} activeOpacity={0.75}>
      {previews.map((p, i) => (
        <View
          key={p.id}
          style={{
            marginLeft: i === 0 ? 0 : -9,
            zIndex: 3 - i,
            width: 32, height: 32, borderRadius: 16,
            borderWidth: 2,
            borderColor: colors.background,
            overflow: "hidden",
          }}
        >
          <Avatar uri={p.avatarUrl} name={p.displayName} size={28} />
          {p.hasUnseen && (
            <View style={{ position: "absolute", bottom: 0, right: 0, width: 9, height: 9, borderRadius: 5, backgroundColor: "#00BCD4", borderWidth: 1.5, borderColor: colors.background }} />
          )}
        </View>
      ))}
    </TouchableOpacity>
  );
}

type ChatTabKey = "all" | "unread" | "personal" | "groups" | "channels";

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
function ChatsScreen({ panelMode = false }: { panelMode?: boolean } = {}) {
  const { colors, isDark } = useTheme();
  const { user, profile, linkedAccounts, switchAccount } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isDesktop } = useIsDesktop();
  const pathname = usePathname() || "/";
  const activeChatMatch = pathname.match(/^\/chat\/([^/]+)/);
  const activeChatId = activeChatMatch ? activeChatMatch[1] : null;

  // Phone-book name overrides: show the name the user saved in their contacts
  // inside chat rows instead of the registered display_name.
  const phonebookNames = usePhonebookNames();

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [tabFilter, setTabFilter] = useState<ChatTabKey>("all");
  const [typingChatIds, setTypingChatIds] = useState<Record<string, boolean>>({});
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const { prefs: chatPrefs } = useChatPreferences();
  const { features: advancedFeatures } = useAdvancedFeatures();
  const { width: windowWidth } = useWindowDimensions();

  // ── Folder state ────────────────────────────────────────────────────────────
  const [folders, setFolders]           = useState<ChatFolder[]>([]);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder]     = useState<ChatFolder | null>(null);
  const [pageIdx, setPageIdx]           = useState(0);
  const pagerRef = useRef<FlatList<any>>(null);

  // ── Multi-select state ────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── FAB hide-on-scroll ──────────────────────────────────────────────────────
  const fabAnim     = useRef(new Animated.Value(1)).current;
  const lastScrollY = useRef(0);
  const fabHidden   = useRef(false);

  // ── Collapsible stories bar (hard pull-down to reveal) ──────────────────
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const storiesExpandedRef = useRef(false);
  const storiesHeightAnim  = useRef(new Animated.Value(0)).current;
  // Drives compact avatar opacity/scale in header (1=visible, 0=hidden)
  const compactAvatarAnim  = useRef(new Animated.Value(1)).current;
  const pullRevealFiredRef  = useRef(false);

  const expandStories = useCallback(() => {
    if (storiesExpandedRef.current) return;
    storiesExpandedRef.current = true;
    setStoriesExpanded(true);
    Animated.parallel([
      Animated.spring(storiesHeightAnim, { toValue: 1, useNativeDriver: false, speed: 18, bounciness: 4 }),
      Animated.timing(compactAvatarAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [storiesHeightAnim, compactAvatarAnim]);

  const collapseStories = useCallback(() => {
    Animated.parallel([
      Animated.spring(storiesHeightAnim, { toValue: 0, useNativeDriver: false, speed: 24, bounciness: 0 }),
      Animated.timing(compactAvatarAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      storiesExpandedRef.current = false;
      setStoriesExpanded(false);
    });
  }, [storiesHeightAnim, compactAvatarAnim]);

  const handleFabScroll = useCallback((e: any) => {
    const y  = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;

    // Hard pull-down past threshold → expand stories bar
    if (y < -50 && !storiesExpandedRef.current && !pullRevealFiredRef.current) {
      pullRevealFiredRef.current = true;
      expandStories();
    }
    if (y >= 0) pullRevealFiredRef.current = false;

    if (dy > 6 && y > 60 && !fabHidden.current) {
      fabHidden.current = true;
      Animated.spring(fabAnim, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 0 }).start();
      if (storiesExpandedRef.current) collapseStories();
    } else if (dy < -4 && fabHidden.current) {
      fabHidden.current = false;
      Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
    }
  }, [fabAnim, expandStories, collapseStories]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, type, is_read, created_at, post_id, reference_id, actor_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!data) return;
    const seen = new Map<string, any>();
    for (const item of data) {
      const key = [item.type, item.actor_id ?? "", item.post_id ?? "", item.reference_id ?? ""].join("|");
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, item);
      } else {
        const diff = Math.abs(new Date(item.created_at).getTime() - new Date(existing.created_at).getTime());
        if (diff < 5 * 60 * 1000) {
          if (new Date(item.created_at) > new Date(existing.created_at)) seen.set(key, item);
        } else {
          seen.set(key + "|" + item.created_at, item);
        }
      }
    }
    const unread = Array.from(seen.values()).filter(n => !n.is_read).length;
    setUnreadNotifCount(unread);
  }, [user]);

  useFocusEffect(useCallback(() => { fetchUnreadCount(); }, [fetchUnreadCount]));

  useEffect(() => {
    if (!user) return;

    const notifChannel = supabase
      .channel(`notif-badge:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => fetchUnreadCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(notifChannel); };
  }, [user, fetchUnreadCount]);

  const loadChats = useCallback(async (background = false) => {
    if (!user) return;

    if (!background) {
      const cached = await getLocalConversations();
      if (cached.length > 0) {
        setChats(cached as any);
        setLoading(false);
      }
    }

    if (!isOnline()) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: memberRows } = await supabase
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", user.id);

    if (!memberRows || memberRows.length === 0) {
      setChats([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const chatIds = memberRows.map((m: any) => m.chat_id);

    // Pre-compute which chats need unread counting — skip currently-open and recently-visited chats.
    // This resolves the race condition where mark-as-read writes from the chat screen haven't
    // landed in message_status yet by the time loadChats(true) fires.
    const activeChatId = getActiveChatId();
    const unreadCheckIds = chatIds.filter(
      (id) => id !== activeChatId && !wasChatRecentlyVisited(id),
    );

    const [chatResult, lastMsgsResult, unreadMsgsResult] = await Promise.all([
      supabase
        .from("chats")
        .select(`
          id, name, is_group, is_channel, is_pinned, is_archived, avatar_url, updated_at,
          chat_members(user_id, profiles(id, display_name, avatar_url, is_verified, is_organization_verified, last_seen, show_online_status))
        `)
        .in("id", chatIds)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false }),
      supabase
        .from("messages")
        .select("id, chat_id, encrypted_content, sent_at, attachment_type, sender_id")
        .in("chat_id", chatIds)
        .order("sent_at", { ascending: false })
        .limit(chatIds.length * 3),
      unreadCheckIds.length > 0
        ? supabase
            .from("messages")
            .select("id, chat_id")
            .in("chat_id", unreadCheckIds)
            .neq("sender_id", user.id)
            .order("sent_at", { ascending: false })
            .limit(2000)
        : Promise.resolve({ data: [] }),
    ]);

    const chatRows = chatResult.data;
    if (!chatRows) { setLoading(false); setRefreshing(false); return; }

    const lastMsgMap: Record<string, { lastMessage: string; lastMessageAt: string; isFromMe: boolean; lastMsgId: string }> = {};
    for (const m of (lastMsgsResult.data || [])) {
      if (!lastMsgMap[m.chat_id]) {
        let preview = m.encrypted_content || "";
        if (m.attachment_type === "story_reply") {
          if (preview.startsWith("storyUserId:")) {
            const pipeIdx = preview.indexOf("|");
            preview = pipeIdx >= 0 ? preview.slice(pipeIdx + 1) : "Shared a story";
          }
          preview = `📸 ${preview || "Story"}`;
        }
        lastMsgMap[m.chat_id] = { lastMessage: preview, lastMessageAt: m.sent_at, isFromMe: m.sender_id === user.id, lastMsgId: m.id };
      }
    }

    const myLastMsgIds = Object.values(lastMsgMap).filter(v => v.isFromMe).map(v => v.lastMsgId);
    const lastMsgStatusMap: Record<string, "read" | "delivered" | "sent"> = {};
    if (myLastMsgIds.length > 0) {
      const { data: statusRows } = await supabase
        .from("message_status")
        .select("message_id, read_at, delivered_at")
        .in("message_id", myLastMsgIds);
      for (const s of (statusRows || []) as any[]) {
        lastMsgStatusMap[s.message_id] = s.read_at ? "read" : s.delivered_at ? "delivered" : "sent";
      }
    }

    const unreadMsgRows = unreadMsgsResult.data || [];
    const unreadMsgIds = unreadMsgRows.map((m: any) => m.id);
    let readSet = new Set<string>();
    if (unreadMsgIds.length > 0) {
      const batchSize = 200;
      const readPromises = [];
      for (let i = 0; i < unreadMsgIds.length; i += batchSize) {
        readPromises.push(
          supabase
            .from("message_status")
            .select("message_id")
            .eq("user_id", user.id)
            .not("read_at", "is", null)
            .in("message_id", unreadMsgIds.slice(i, i + batchSize))
        );
      }
      const readResults = await Promise.all(readPromises);
      for (const { data: readRows } of readResults) {
        for (const r of (readRows || [])) {
          readSet.add(r.message_id);
        }
      }
    }

    // unreadMsgRows is already pre-filtered to only non-visited, non-active chats
    // (see unreadCheckIds above) — no need to re-check activeChatId here.
    const unreadMap: Record<string, number> = {};
    for (const msg of unreadMsgRows) {
      if (!readSet.has(msg.id)) {
        unreadMap[msg.chat_id] = (unreadMap[msg.chat_id] || 0) + 1;
      }
    }

    const items: ChatItem[] = chatRows.map((c: any) => {
      const others = (c.chat_members || []).filter((m: any) => m.user_id !== user.id);
      const other = others[0]?.profiles;
      const lm = lastMsgMap[c.id];
      return {
        id: c.id,
        name: c.name,
        is_group: !!c.is_group,
        is_channel: !!c.is_channel,
        other_display_name: other?.display_name || "Unknown",
        other_avatar: other?.avatar_url || null,
        other_id: other?.id || "",
        last_message: lm?.lastMessage || "",
        last_message_at: lm?.lastMessageAt || c.updated_at || "",
        last_message_is_mine: lm?.isFromMe ?? false,
        last_message_status: lm?.isFromMe ? (lastMsgStatusMap[lm.lastMsgId] || "sent") : "sent",
        is_pinned: !!c.is_pinned,
        is_archived: !!c.is_archived,
        avatar_url: c.avatar_url,
        unread_count: unreadMap[c.id] || 0,
        is_verified: !!other?.is_verified,
        is_organization_verified: !!other?.is_organization_verified,
        other_last_seen: other?.last_seen || null,
        other_show_online: other?.show_online_status !== false,
      };
    });

    items.forEach((item) => {
      if (item.unread_count === 0) clearChatVisited(item.id);
    });

    items.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });

    setChats(items);
    saveConversations(items).catch(() => {});
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadChats(); }, [loadChats]);
  useFocusEffect(useCallback(() => { loadChats(true); }, [loadChats]));

  // Right-click context-menu actions on chat list rows.
  const handleChatAction = useCallback(
    async (
      action: "togglePin" | "toggleArchive" | "delete" | "open",
      item: ChatItem,
    ) => {
      if (action === "open") {
        Haptics.selectionAsync();
        router.push({
          pathname: "/chat/[id]",
          params: {
            id: item.id,
            otherName: item.other_display_name || "",
            otherAvatar: item.other_avatar || "",
            otherId: item.other_id || "",
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
        const { error } = await supabase
          .from("chats")
          .update({ is_pinned: next })
          .eq("id", item.id);
        if (error) {
          showAlert("Couldn't update pin", error.message);
          loadChats(true);
        }
        return;
      }
      if (action === "toggleArchive") {
        const next = !item.is_archived;
        // Archived chats are filtered out of the list (loadChats uses
        // is_archived=false), so just remove locally for instant feedback.
        setChats((prev) =>
          next ? prev.filter((c) => c.id !== item.id) : prev,
        );
        const { error } = await supabase
          .from("chats")
          .update({ is_archived: next })
          .eq("id", item.id);
        if (error) {
          showAlert("Couldn't archive chat", error.message);
          loadChats(true);
        }
        return;
      }
      if (action === "delete") {
        const ok = await confirmAlert(
          "Delete chat?",
          "This will permanently delete this conversation for everyone.",
          { confirmText: "Delete", destructive: true },
        );
        if (!ok) return;
        setChats((prev) => prev.filter((c) => c.id !== item.id));
        const { error } = await supabase
          .from("chats")
          .delete()
          .eq("id", item.id);
        if (error) {
          showAlert("Couldn't delete chat", error.message);
          loadChats(true);
        }
        return;
      }
    },
    [loadChats],
  );

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
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
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
      "This will permanently delete the selected conversations for everyone.",
      { confirmText: "Delete", destructive: true },
    );
    if (!ok) return;
    const ids = Array.from(selectedIds);
    setChats((prev) => prev.filter((c) => !ids.includes(c.id)));
    exitSelectMode();
    await Promise.all(ids.map((id) => supabase.from("chats").delete().eq("id", id)));
  }, [selectedIds, exitSelectMode]);

  useEffect(() => {
    if (!user) return;
    import("../../lib/rewardXp").then(({ rewardXp }) => rewardXp("daily_login")).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // Listen for new chats being created (new chat_member rows for this user)
    const memberChannel = supabase
      .channel(`chatlist-member-inserts:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_members", filter: `user_id=eq.${user.id}` },
        () => loadChats(true)
      )
      .subscribe();
    return () => { supabase.removeChannel(memberChannel); };
  }, [user, loadChats]);

  useEffect(() => {
    if (!user) return;
    return addOnlineListener(() => loadChats());
  }, [user, loadChats]);

  // Periodic background refresh — ensures the list stays current even if
  // a realtime event is missed or the channel briefly disconnects
  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(() => loadChats(true), 15000);
      return () => clearInterval(interval);
    }, [loadChats])
  );

  const chatIdsKey = chats.map((c) => c.id).sort().join(",");

  useEffect(() => {
    if (!user || !chatIdsKey) return;

    const chatIds = chatIdsKey.split(",");

    // Subscribe to new messages in each known chat
    const msgChannel = supabase.channel(`chatlist-messages:${user.id}`);
    chatIds.forEach((chatId) => {
      msgChannel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        () => loadChats(true)
      );
    });
    msgChannel.subscribe();

    // Also subscribe to chat-level updates (pinning, archiving, name changes)
    // We filter client-side since Supabase realtime doesn't support IN filters
    const chatChannel = supabase
      .channel(`chatlist-chats:${user.id}`)
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
    if (!user || !chatIdsKey || !chatPrefs.typing_indicators) return;
    const chatIds = chatIdsKey.split(",");
    const channels = chatIds.map((chatId) => {
      const ch = supabase.channel(`typing:${chatId}`, { config: { broadcast: { self: false } } });
      ch.on("broadcast", { event: "typing" }, (payload) => {
        const { user_id: uid, is_typing } = (payload.payload || {}) as any;
        if (!uid || uid === user.id) return;
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
      });
      ch.subscribe();
      return ch;
    });

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
      Object.values(typingTimersRef.current).forEach((t) => clearTimeout(t));
      typingTimersRef.current = {};
      setTypingChatIds({});
    };
  }, [user, chatIdsKey, chatPrefs.typing_indicators]);

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
    { key: "all", label: "All chats", icon: "chatbubbles-outline", count: chats.length },
    { key: "unread", label: "Unread", icon: "mail-unread-outline", count: totalUnread },
    { key: "personal", label: "Personal", icon: "person-outline", count: personalCount },
    { key: "groups", label: "Groups", icon: "people-outline", count: groupsCount },
    { key: "channels", label: "Channels", icon: "megaphone-outline", count: channelsCount },
  ];

  // ── Folder system ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadFolders().then(setFolders);
  }, [user?.id]);

  // Show the folder tab bar on mobile only when the feature is enabled or
  // the user already has folders (so their data is never hidden).
  const showFolderUI = !panelMode && !isDesktop && (advancedFeatures.chat_folders || folders.length > 0);
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
    if (panelMode) {
      // Inside the desktop master-detail panel — keep the layout intact and
      // show a tasteful "sign in" placeholder instead of redirecting.
      return (
        <View style={[styles.root, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24 }]}>
          <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12 }]}>Sign in to chat</Text>
        </View>
      );
    }
    // Chats are private — gate behind auth. Send anyone without a session to discover.
    return <Redirect href="/discover" />;
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          width: panelMode ? 360 : undefined,
          borderRightWidth: panelMode ? StyleSheet.hairlineWidth : 0,
          borderRightColor: colors.border,
        },
      ]}
    >
      <OfflineBanner />
      {panelMode ? (
        <View style={[styles.panelHeader, { backgroundColor: colors.background }]}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Chats</Text>
          <TouchableOpacity
            onPress={() => router.push("/chat/new" as any)}
            style={[styles.panelHeaderBtn, { backgroundColor: colors.backgroundSecondary }]}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      ) : (
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8 },
        ]}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: 0 }]} />
        {/* Compact story previews — left side (hidden in select mode) */}
        {selectMode ? (
          <TouchableOpacity
            onPress={exitSelectMode}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={[selStyles.cancelText, { color: colors.accent }]}>Cancel</Text>
          </TouchableOpacity>
        ) : user ? (
          <Animated.View style={{ opacity: compactAvatarAnim, transform: [{ scale: compactAvatarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}>
            <CompactStoryHeader userId={user.id} colors={colors} onExpand={expandStories} />
          </Animated.View>
        ) : null}

        {/* Title — absolutely centered so it stays in the middle
            regardless of how wide the left/right elements are */}
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, bottom: 12, alignItems: "center" }}
        >
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {selectMode
              ? (selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select chats")
              : "AfuChat"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {selectMode ? (
            <TouchableOpacity
              onPress={() => selectAll(currentPageChats)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              disabled={selectedIds.size === currentPageChats.length && currentPageChats.length > 0}
            >
              <Text style={[selStyles.selectAllText, { color: selectedIds.size === currentPageChats.length && currentPageChats.length > 0 ? colors.textMuted : colors.accent }]}>
                All
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={() => router.push("/notifications")} style={styles.headerIcon}>
                <Ionicons name="notifications-outline" size={22} color={colors.text} />
                {unreadNotifCount > 0 && (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>{unreadNotifCount > 99 ? "99+" : unreadNotifCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
      )}

      {!panelMode && !selectMode && <HomeBanner />}

      {/* Stories expansion area — slides in on hard pull-down, above search bar */}
      {!panelMode && !selectMode && (
        <Animated.View style={{
          height: storiesHeightAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }),
          overflow: "hidden",
          opacity: storiesHeightAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.6, 1] }),
        }}>
          {user && (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <StoriesBar userId={user.id} colors={colors} isDesktop={false} />
              </View>
              {/* Collapse chevron — tap to close stories bar */}
              <TouchableOpacity
                onPress={collapseStories}
                style={{ paddingRight: 12, paddingLeft: 4, alignSelf: "center", paddingVertical: 8 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.65}
              >
                <Ionicons name="chevron-up" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}

      {!selectMode && (
        <View style={styles.searchWrap}>
          <View style={[
            styles.searchBox,
            { backgroundColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.06)", borderWidth: StyleSheet.hairlineWidth, borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)" },
          ]}>
            <Ionicons name="search-outline" size={19} color={colors.textMuted} />
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => router.push("/chat-search" as any)}
              activeOpacity={1}
            >
              <Text
                style={[styles.searchInput, { color: colors.textMuted, lineHeight: 40, marginTop: 0 }]}
                numberOfLines={1}
              >
                Search conversations…
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(("/chat-search?ai=true") as any)}
              activeOpacity={0.75}
              style={styles.aiBtn}
            >
              <LinearGradient
                colors={["#7B61FF", "#00C2CB"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.aiBtnGrad}
              >
                <Ionicons name="sparkles" size={11} color="#fff" />
                <Text style={styles.aiBtnText}>AI</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      )}


      <View style={[styles.body, isDesktop && styles.bodyRow]}>
        {isDesktop && (
          <View style={styles.rail}>
            {TABS.map((tab) => {
              const active = tabFilter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={styles.railTab}
                  onPress={() => setTabFilter(tab.key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.railIconWrap}>
                    <Ionicons
                      name={tab.icon}
                      size={22}
                      color={active ? colors.text : colors.textMuted}
                    />
                    {tab.count > 0 && (
                      <View style={[styles.railBadge, { backgroundColor: tab.key === "unread" ? "#FF3B30" : colors.backgroundSecondary }]}>
                        <Text style={[styles.railBadgeText, { color: tab.key === "unread" ? "#fff" : colors.textSecondary }]}>
                          {tab.count > 99 ? "99+" : tab.count}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.railLabel,
                      {
                        color: active ? colors.text : colors.textMuted,
                        fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Mobile swipeable pager (only when folders exist) ──────────── */}
        {showFolderUI && hasFolders ? (
          <FlatList
            ref={pagerRef}
            data={pages}
            keyExtractor={(p) => ("filter" in p ? p.id : "all")}
            horizontal
            pagingEnabled
            scrollEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            getItemLayout={(_, index) => ({
              length: windowWidth,
              offset: windowWidth * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
              setPageIdx(idx);
            }}
            renderItem={({ item: page }) => {
              const isAll      = !("filter" in page);
              const pageChats  = getPageChats(page);
              return (
                <View style={{ width: windowWidth, flex: 1, paddingTop: showFolderUI ? 54 : 0 }}>
                  {loading ? (
                    <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <ChatRowSkeleton key={i} />)}</View>
                  ) : pageChats.length === 0 ? (
                    <View style={styles.center}>
                      <Ionicons name="chatbubbles-outline" size={64} color={colors.textMuted} />
                      <Text style={[styles.emptyTitle, { color: colors.text }]}>
                        {isAll ? "No chats yet" : `No ${"filter" in page ? page.name : ""} chats`}
                      </Text>
                      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                        {isAll ? "Start a conversation from Contacts" : "Try another filter"}
                      </Text>
                    </View>
                  ) : (
                    <FlatList
                      data={pageChats}
                      keyExtractor={(item) => item.id}
                      nestedScrollEnabled
                      renderItem={({ item }) => (
                        <ChatRow
                          item={item}
                          phonebookName={!item.is_group && !item.is_channel ? phonebookNames.get(item.other_id) : undefined}
                          isTyping={chatPrefs.typing_indicators && !!typingChatIds[item.id]}
                          selectMode={selectMode}
                          isSelected={selectedIds.has(item.id)}
                          onEnterSelectMode={() => enterSelectMode(item.id)}
                          onToggleSelect={() => toggleSelect(item.id)}
                          onPress={() => {
                            Haptics.selectionAsync();
                            router.push({
                              pathname: "/chat/[id]",
                              params: {
                                id: item.id,
                                otherName: (!item.is_group && !item.is_channel && phonebookNames.get(item.other_id)) || item.other_display_name || "",
                                otherAvatar: item.other_avatar || "",
                                otherId: item.other_id || "",
                                isGroup: item.is_group ? "true" : "false",
                                isChannel: item.is_channel ? "true" : "false",
                                chatName: item.name || "",
                                chatAvatar: item.avatar_url || "",
                              },
                            });
                          }}
                          onAction={handleChatAction}
                        />
                      )}
                      ItemSeparatorComponent={() => <Separator indent={74} />}
                      ListHeaderComponent={isAll && !search && user ? (
                        <>
                          <StoryUploadBanner colors={colors} />
                          {chats.length < 8 && <SuggestedUsers compact maxCards={10} />}
                        </>
                      ) : null}
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
        ) : (
          /* ── Single-page list (no folders, or desktop/panel mode) ──── */
          <View style={{ flex: 1, paddingTop: showFolderUI ? 54 : 0 }}>
            {loading ? (
              <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <ChatRowSkeleton key={i} />)}</View>
            ) : filtered.length === 0 ? (
              <View style={styles.center}>
                <Ionicons name="chatbubbles-outline" size={64} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {tabFilter === "all" ? "No chats yet" : `No ${TABS.find(t => t.key === tabFilter)?.label.toLowerCase()}`}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  {tabFilter === "all" ? "Start a conversation from Contacts" : "Try another filter"}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <ChatRow
                    item={item}
                    phonebookName={!item.is_group && !item.is_channel ? phonebookNames.get(item.other_id) : undefined}
                    isActive={panelMode && item.id === activeChatId}
                    isTyping={chatPrefs.typing_indicators && !!typingChatIds[item.id]}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(item.id)}
                    onEnterSelectMode={() => enterSelectMode(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onPress={() => {
                      Haptics.selectionAsync();
                      router.push({
                        pathname: "/chat/[id]",
                        params: {
                          id: item.id,
                          otherName: (!item.is_group && !item.is_channel && phonebookNames.get(item.other_id)) || item.other_display_name || "",
                          otherAvatar: item.other_avatar || "",
                          otherId: item.other_id || "",
                          isGroup: item.is_group ? "true" : "false",
                          isChannel: item.is_channel ? "true" : "false",
                          chatName: item.name || "",
                          chatAvatar: item.avatar_url || "",
                        },
                      });
                    }}
                    onAction={handleChatAction}
                  />
                )}
                ItemSeparatorComponent={() => <Separator indent={74} />}
                ListHeaderComponent={user && tabFilter === "all" && !search ? (
                  <>
                    <StoryUploadBanner colors={colors} />
                    {chats.length < 8 && <SuggestedUsers compact maxCards={10} />}
                  </>
                ) : null}
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

        {/* ── Floating folder tab bar ──────────────────────────────────────── */}
        {showFolderUI && (
          <View
            style={[
              styles.folderBarFloat,
              {
                backgroundColor: isDark ? "rgba(20,20,26,0.93)" : "rgba(252,252,255,0.93)",
                borderColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)",
                shadowColor: "#000",
              },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.folderTabBarContent}
              keyboardShouldPersistTaps="handled"
            >
              {pages.map((page, idx) => {
                const isAll  = !("filter" in page);
                const label  = isAll ? "All" : page.name;
                const icon   = isAll ? null : page.icon;
                const active = pageIdx === idx;
                const count  = isAll ? chats.length : getPageChats(page).length;
                return (
                  <TouchableOpacity
                    key={isAll ? "all" : page.id}
                    style={styles.folderTab}
                    onPress={() => {
                      setPageIdx(idx);
                      if (hasFolders) {
                        pagerRef.current?.scrollToIndex({ index: idx, animated: true });
                      }
                    }}
                    onLongPress={() => {
                      if (!isAll) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setEditingFolder(page as ChatFolder);
                        setShowFolderModal(true);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.folderTabInner}>
                      {icon && <Text style={styles.folderTabIcon}>{icon}</Text>}
                      <Text
                        style={[
                          styles.folderTabLabel,
                          { color: active ? colors.accent : colors.textMuted,
                            fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" },
                        ]}
                      >
                        {label}
                      </Text>
                      {count > 0 && (
                        <View
                          style={[
                            styles.folderTabBadge,
                            { backgroundColor: active ? colors.accent + "22" : colors.backgroundSecondary },
                          ]}
                        >
                          <Text style={[styles.folderTabBadgeText, { color: active ? colors.accent : colors.textMuted }]}>
                            {count > 99 ? "99+" : count}
                          </Text>
                        </View>
                      )}
                    </View>
                    {active && (
                      <View style={[styles.folderTabUnderline, { backgroundColor: colors.accent }]} />
                    )}
                  </TouchableOpacity>
                );
              })}

              {advancedFeatures.chat_folders && (
                <TouchableOpacity
                  style={[styles.folderAddBtn, { backgroundColor: colors.backgroundSecondary }]}
                  onPress={() => {
                    setEditingFolder(null);
                    setShowFolderModal(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </ScrollView>
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
            pagerRef.current?.scrollToIndex({ index: newIdx, animated: false });
          }
          setShowFolderModal(false);
          setEditingFolder(null);
        } : undefined}
      />

      {/* ── Multi-select bulk-delete action bar ─────────────────────────────── */}
      {selectMode && !panelMode && (
        <View
          style={[
            selStyles.actionBar,
            {
              bottom: insets.bottom + 90,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: "#000",
            },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={[selStyles.deleteBtn, { backgroundColor: selectedIds.size > 0 ? "#FF3B30" : colors.backgroundSecondary }]}
            onPress={handleBulkDelete}
            disabled={selectedIds.size === 0}
            activeOpacity={0.82}
          >
            <Ionicons name="trash-outline" size={18} color={selectedIds.size > 0 ? "#fff" : colors.textMuted} />
            <Text style={[selStyles.deleteBtnText, { color: selectedIds.size > 0 ? "#fff" : colors.textMuted }]}>
              {selectedIds.size > 0
                ? `Delete ${selectedIds.size} chat${selectedIds.size !== 1 ? "s" : ""}`
                : "Select chats to delete"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {user && panelMode && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.accent, bottom: 24, right: 24 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/chat/new" as any); }}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {user && !panelMode && !selectMode && (
        <Animated.View
          style={[
            styles.fab,
            {
              backgroundColor: colors.accent,
              bottom: (insets.bottom > 0 ? insets.bottom : 14) + 6 + 64 + 20,
              opacity: fabAnim,
              transform: [
                {
                  translateY: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [28, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/chat/new" as any); }}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Default route export — the chats screen as it appears at /(tabs).
 *
 * On mobile we render the full chats list. On desktop we render a tiny
 * stub: `DesktopShell` mounts the persistent `ChatsListPanel` on the left
 * and the `ChatHomePlaceholder` empty state on the right, so this route
 * just needs to occupy the slot and not render its own duplicate list.
 */
export default function ChatsRoute() {
  const { isDesktop } = useIsDesktop();
  // On desktop the shell takes over rendering for the chats home; return
  // an empty fragment to avoid mounting the chats screen twice.
  if (isDesktop) return <View style={{ flex: 1 }} />;
  return <ChatsScreen />;
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
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
  actionBar: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    alignItems: "center",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    width: "100%",
    justifyContent: "center",
  },
  deleteBtnText: {
    fontSize: 16,
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

  // ── Floating folder tab bar ──────────────────────────────────────────────
  folderBarFloat: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    zIndex: 20,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 8,
  },
  folderTabBarContent: {
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 2,
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
    paddingVertical: 10,
  },
  folderTabIcon: {
    fontSize: 14,
    lineHeight: 18,
  },
  folderTabLabel: {
    fontSize: 14,
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
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginHorizontal: 6,
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
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
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
  accountStack: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
  },
  stackAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  stackAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: "hidden",
  },
  stackExtra: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  stackExtraText: { fontSize: 10, fontFamily: "Inter_700Bold" },
});
