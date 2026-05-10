import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { clearBadge } from "@/lib/pushNotifications";
import { preloadNotificationSound } from "@/lib/soundManager";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { NotificationSkeleton } from "@/components/ui/Skeleton";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { isOnline } from "@/lib/offlineStore";
import { getLocalNotifications, saveNotifications, markNotificationRead as markLocalRead, markAllNotificationsRead as markAllLocalRead } from "@/lib/storage/localNotifications";
import { encodeId } from "@/lib/shortId";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const BRAND = "#00BCD4";
const GOLD = "#D4A853";

type NotifItem = {
  id: string;
  type: string;
  is_read: boolean;
  created_at: string;
  post_id: string | null;
  reference_id: string | null;
  reference_type: string | null;
  actor: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    handle: string;
    is_verified?: boolean;
    is_organization_verified?: boolean;
  } | null;
};

type NotifCategory = "all" | "social" | "marketplace" | "payments" | "system";

const CATEGORIES: { id: NotifCategory; label: string; icon: string }[] = [
  { id: "all",         label: "All",      icon: "notifications-outline" },
  { id: "social",      label: "Social",   icon: "people-outline" },
  { id: "marketplace", label: "Shop",     icon: "storefront-outline" },
  { id: "payments",    label: "Payments", icon: "wallet-outline" },
  { id: "system",      label: "System",   icon: "shield-outline" },
];

type TypeConfig = {
  icon: string;
  label: string;
  color: string;
  category: NotifCategory;
  bodyText: string;
  canReply?: boolean;
  getRoute?: (item: NotifItem) => string | null;
};

const TYPE_CONFIG: Record<string, TypeConfig> = {
  new_like:      { icon: "heart",            label: "liked your post",              color: "#FF3B30", category: "social",      bodyText: "Tap to view the post",                    canReply: false, getRoute: (n) => n.post_id ? `/p/${encodeId(n.post_id)}` : null },
  new_follower:  { icon: "person-add",       label: "started following you",        color: BRAND,     category: "social",      bodyText: "Tap to view their profile",               canReply: false, getRoute: (n) => n.actor ? `/contact/${n.actor.id}` : null },
  new_reply:     { icon: "chatbubble",       label: "replied to your post",         color: "#007AFF", category: "social",      bodyText: "Tap to read the reply or respond inline", canReply: true,  getRoute: (n) => n.post_id ? `/p/${encodeId(n.post_id)}` : null },
  new_mention:   { icon: "at",              label: "mentioned you",                color: "#FF9500", category: "social",      bodyText: "You were mentioned — tap to join",        canReply: true,  getRoute: (n) => n.post_id ? `/p/${encodeId(n.post_id)}` : null },
  gift:          { icon: "gift",             label: "sent you a gift",              color: "#AF52DE", category: "social",      bodyText: "Open to claim your gift 🎁",              canReply: false, getRoute: () => null },
  profile_view:  { icon: "eye",              label: "viewed your profile",          color: "#8E8E93", category: "social",      bodyText: "Someone checked you out",                 canReply: false, getRoute: (n) => n.actor ? `/contact/${n.actor.id}` : null },
  channel_post:  { icon: "megaphone",        label: "posted in a channel",          color: "#5856D6", category: "social",      bodyText: "New content is waiting for you",          canReply: false, getRoute: (n) => n.reference_id ? `/chat/${n.reference_id}` : null },
  live_started:  { icon: "radio",            label: "started a live stream",        color: "#FF3B30", category: "social",      bodyText: "They are live now — join before it ends 🔴",canReply: false, getRoute: (n) => n.reference_id ? `/chat/${n.reference_id}` : null },
  order_placed:  { icon: "bag",              label: "placed a new order",           color: "#34C759", category: "marketplace", bodyText: "Review and prepare the order 🛍️",         canReply: false, getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  order_shipped: { icon: "cube",             label: "shipped your order",           color: "#AF52DE", category: "marketplace", bodyText: "Your item is on its way 📦",               canReply: false, getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  escrow_released:{ icon: "checkmark-done", label: "confirmed delivery",           color: "#34C759", category: "marketplace", bodyText: "Payment has been released 💰",             canReply: false, getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  dispute_raised:{ icon: "alert-circle",    label: "raised a dispute",             color: "#FF3B30", category: "marketplace", bodyText: "A dispute needs your attention ⚠️",        canReply: false, getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  refund_issued: { icon: "return-down-back",label: "refund issued",                color: "#FF9500", category: "marketplace", bodyText: "ACoins returned to your wallet",           canReply: false, getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  shop_review:   { icon: "star",             label: "left a shop review",           color: GOLD,      category: "marketplace", bodyText: "See what customers are saying ⭐",          canReply: false, getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  seller_approved:{ icon: "storefront",     label: "seller application approved",  color: "#34C759", category: "system",      bodyText: "You can now list products on AfuMarket",  canReply: false, getRoute: () => "/shop/manage" },
  seller_rejected:{ icon: "storefront",     label: "seller application update",    color: "#FF9500", category: "system",      bodyText: "Your application needs more information", canReply: false, getRoute: () => "/shop/apply" },
  acoin_received:{ icon: "wallet",          label: "ACoins received",              color: GOLD,      category: "payments",    bodyText: "ACoins have been credited to your wallet 💰",canReply: false, getRoute: () => "/me" },
  acoin_sent:    { icon: "wallet-outline",   label: "ACoins sent",                  color: "#8E8E93", category: "payments",    bodyText: "ACoins were sent from your wallet",       canReply: false, getRoute: () => "/me" },
  subscription_activated:{ icon: "star",   label: "subscription activated",       color: "#FFD700", category: "payments",    bodyText: "Premium features are now unlocked 🌟",    canReply: false, getRoute: () => "/monetize" },
  system:        { icon: "shield-checkmark",label: "system notification",          color: BRAND,     category: "system",      bodyText: "Tap to view details",                     canReply: false, getRoute: () => null },
  verification_approved:{ icon: "checkmark-circle", label: "verification approved",color: "#34C759", category: "system",     bodyText: "Your verified badge is now live ✅",       canReply: false, getRoute: () => "/me" },
  verification_update:{ icon: "information-circle", label: "verification update",  color: "#FF9500", category: "system",      bodyText: "More information needed for verification",canReply: false, getRoute: () => "/me" },
};

function getFallbackConfig(_type: string): TypeConfig {
  return { icon: "notifications", label: "notification", color: BRAND, category: "system", bodyText: "Tap to view", canReply: false, getRoute: () => null };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function deduplicateNotifs(items: NotifItem[]): NotifItem[] {
  const seen = new Map<string, NotifItem>();
  for (const item of items) {
    const key = [item.type, item.actor?.id ?? "", item.post_id ?? "", item.reference_id ?? ""].join("|");
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, item);
    } else {
      const existingDiff = Math.abs(
        new Date(item.created_at).getTime() - new Date(existing.created_at).getTime()
      );
      if (existingDiff < 5 * 60 * 1000) {
        if (new Date(item.created_at) > new Date(existing.created_at)) seen.set(key, item);
      } else {
        seen.set(key + "|" + item.created_at, item);
      }
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function groupByDate(items: NotifItem[]): { date: string; items: NotifItem[] }[] {
  const groups: Map<string, NotifItem[]> = new Map();
  for (const item of items) {
    const d = new Date(item.created_at);
    const now = new Date();
    let label = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    if (d.toDateString() === now.toDateString()) label = "Today";
    else {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }
  return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
}

type NotifRowProps = {
  item: NotifItem;
  isExpanded: boolean;
  replyText: string;
  sendingReply: boolean;
  isFollowingActor?: boolean;
  onPress: () => void;
  onToggleReply: () => void;
  onReplyChange: (text: string) => void;
  onReplySend: () => void;
  onFollowBack?: () => void;
};

function NotifRow({
  item,
  isExpanded,
  replyText,
  sendingReply,
  isFollowingActor,
  onPress,
  onToggleReply,
  onReplyChange,
  onReplySend,
  onFollowBack,
}: NotifRowProps) {
  const { colors, accent } = useTheme();
  const cfg = TYPE_CONFIG[item.type] || getFallbackConfig(item.type);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (isExpanded) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [isExpanded]);

  return (
    <View style={{ overflow: "hidden" }}>
      {/* ── Main row ── */}
      <TouchableOpacity
        style={[
          st.row,
          { backgroundColor: item.is_read ? colors.surface : colors.backgroundSecondary },
        ]}
        onPress={onPress}
        activeOpacity={0.78}
      >
        {/* Unread left stripe */}
        {!item.is_read && (
          <View style={[st.unreadStripe, { backgroundColor: accent }]} />
        )}

        {/* Avatar column */}
        <View style={st.avatarCol}>
          {item.actor ? (
            <Avatar
              uri={item.actor.avatar_url}
              name={item.actor.display_name}
              size={56}
              style={st.avatar}
            />
          ) : (
            <LinearGradient
              colors={[cfg.color + "30", cfg.color + "10"]}
              style={st.systemAvatar}
            >
              <Ionicons name={cfg.icon as any} size={26} color={cfg.color} />
            </LinearGradient>
          )}
          {/* Type badge */}
          <View style={[st.typeBadge, { backgroundColor: cfg.color, borderColor: colors.surface }]}>
            <Ionicons name={cfg.icon as any} size={11} color="#fff" />
          </View>
        </View>

        {/* Content column */}
        <View style={st.contentCol}>
          {/* Actor name + verified + action */}
          <View style={st.nameRow}>
            {item.actor && (
              <>
                <Text style={[st.actorName, { color: colors.text }]} numberOfLines={1}>
                  {item.actor.display_name}
                </Text>
                <VerifiedBadge
                  isVerified={item.actor.is_verified}
                  isOrganizationVerified={item.actor.is_organization_verified}
                  size={13}
                />
              </>
            )}
            <Text style={[st.actionLabel, { color: item.actor ? colors.textSecondary : colors.text }]} numberOfLines={1}>
              {item.actor ? ` ${cfg.label}` : cfg.label}
            </Text>
          </View>

          {/* Body preview bubble */}
          <View style={[st.bodyBubble, { backgroundColor: cfg.color + "12", borderLeftColor: cfg.color + "60" }]}>
            <Text style={[st.bodyText, { color: colors.textSecondary }]} numberOfLines={2}>
              {cfg.bodyText}
            </Text>
          </View>

          {/* Timestamp + handle row */}
          <View style={st.metaRow}>
            <Text style={[st.timeText, { color: colors.textMuted }]}>
              {timeAgo(item.created_at)}
            </Text>
            {item.actor?.handle && (
              <Text style={[st.handleText, { color: colors.textMuted }]}>
                · @{item.actor.handle}
              </Text>
            )}
          </View>
        </View>

        {/* Right: unread dot + follow-back / reply button */}
        <View style={st.rightCol}>
          {!item.is_read && (
            <View style={[st.unreadDot, { backgroundColor: accent }]} />
          )}
          {item.type === "new_follower" && item.actor && onFollowBack && (
            <TouchableOpacity
              style={[
                st.followBackBtn,
                isFollowingActor
                  ? { backgroundColor: "transparent", borderWidth: 1, borderColor: "#34C759" }
                  : { backgroundColor: "#FF9500" },
              ]}
              onPress={(e) => {
                e.stopPropagation();
                if (!isFollowingActor) onFollowBack();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              disabled={isFollowingActor}
            >
              <Ionicons
                name={isFollowingActor ? "heart" : "person-add"}
                size={11}
                color={isFollowingActor ? "#34C759" : "#fff"}
              />
              <Text
                style={[
                  st.followBackBtnText,
                  { color: isFollowingActor ? "#34C759" : "#fff" },
                ]}
              >
                {isFollowingActor ? "Friends" : "Follow Back"}
              </Text>
            </TouchableOpacity>
          )}
          {cfg.canReply && item.post_id && (
            <TouchableOpacity
              style={[st.replyBtn, { borderColor: colors.border }]}
              onPress={(e) => {
                e.stopPropagation();
                onToggleReply();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={isExpanded ? "chevron-up" : "return-down-forward-outline"}
                size={15}
                color={isExpanded ? accent : colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      {/* ── Inline reply input (expandable) ── */}
      {cfg.canReply && item.post_id && isExpanded && (
        <View style={[st.replyBox, { backgroundColor: colors.backgroundSecondary, borderTopColor: colors.border }]}>
          {/* Replying-to banner */}
          <View style={[st.replyToBar, { backgroundColor: accent + "15", borderLeftColor: accent }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={13} color={accent} />
            <Text style={[st.replyToText, { color: accent }]}>
              Replying to {item.actor?.display_name ?? "post"}
            </Text>
          </View>

          {/* Input row */}
          <View style={[st.replyInputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[st.replyInput, { color: colors.text }]}
              placeholder={`Reply to ${item.actor?.display_name ?? "post"}…`}
              placeholderTextColor={colors.textMuted}
              value={replyText}
              onChangeText={onReplyChange}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={onReplySend}
            />
            <TouchableOpacity
              style={[
                st.sendBtn,
                { backgroundColor: replyText.trim() ? accent : colors.border },
              ]}
              onPress={onReplySend}
              disabled={!replyText.trim() || sendingReply}
              activeOpacity={0.8}
            >
              {sendingReply ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={15} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export default function NotificationsScreen() {
  if (Platform.OS === "web") return null;

  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<NotifCategory>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [followedActors, setFollowedActors] = useState<Set<string>>(new Set());

  useEffect(() => {
    preloadNotificationSound();
  }, []);

  // Map a SQLite local notification row to the NotifItem shape the UI expects.
  function localToNotifItem(n: any): NotifItem {
    return {
      id: n.id,
      type: n.type,
      is_read: n.is_read === 1 || n.is_read === true,
      created_at: n.created_at,
      post_id: n.post_id ?? null,
      reference_id: n.reference_id ?? null,
      reference_type: n.reference_type ?? null,
      actor: n.actor_id ? {
        id: n.actor_id,
        display_name: n.actor_name ?? "",
        avatar_url: n.actor_avatar ?? null,
        handle: n.actor_handle ?? "",
        is_verified: n.actor_is_verified === 1 || n.actor_is_verified === true,
        is_organization_verified: n.actor_is_org_verified === 1 || n.actor_is_org_verified === true,
      } : null,
    };
  }

  const load = useCallback(async (background = false) => {
    if (!user) return;

    if (!background) {
      // Show local SQLite data immediately — no spinner, no wait.
      const local = await getLocalNotifications(100);
      if (local.length > 0) {
        setItems(local.map(localToNotifItem));
        setLoading(false);
      }
    }

    if (!isOnline()) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, type, is_read, created_at, post_id, reference_id, reference_type, profiles!notifications_actor_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      if (data) {
        const mapped = data.map((n: any) => ({ ...n, actor: n.profiles }));
        const deduped = deduplicateNotifs(mapped);
        setItems(deduped);
        // Save permanently to SQLite so they're available offline.
        saveNotifications(deduped).catch(() => {});

        // Load which new_follower actors the current user already follows back
        const followerActorIds = deduped
          .filter((n) => n.type === "new_follower" && n.actor?.id)
          .map((n) => n.actor!.id);
        if (followerActorIds.length > 0) {
          supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", user.id)
            .in("following_id", followerActorIds)
            .then(({ data: fData }) => {
              if (fData) {
                setFollowedActors(new Set(fData.map((f: any) => f.following_id)));
              }
            });
        }
      }
    } catch (e) {
      console.warn("[Notifications] Load failed:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    if (Platform.OS !== "web") clearBadge();
  }, [load]);

  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-realtime:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          if (isFirstLoad.current) { isFirstLoad.current = false; return; }
          load(true);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  useEffect(() => {
    isFirstLoad.current = false;
  }, []);

  async function handleFollowBack(actorId: string) {
    if (!user) return;
    setFollowedActors((prev) => new Set([...prev, actorId]));
    await supabase.from("follows").insert({ follower_id: user.id, following_id: actorId });
    try {
      const { rewardXp } = await import("../lib/rewardXp");
      rewardXp("follow_user");
    } catch {}
  }

  async function markRead(id: string) {
    supabase.from("notifications").update({ is_read: true }).eq("id", id).then(() => {});
    markLocalRead(id).catch(() => {});
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    if (!user) return;
    supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false).then(() => {});
    markAllLocalRead().catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function handlePress(item: NotifItem) {
    markRead(item.id);
    Haptics.selectionAsync();
    const cfg = TYPE_CONFIG[item.type] || getFallbackConfig(item.type);
    const route = cfg.getRoute?.(item);
    if (route) {
      router.push(route as any);
    } else if (item.post_id) {
      router.push({ pathname: "/p/[id]", params: { id: encodeId(item.post_id) } });
    } else if (item.actor?.id) {
      router.push({ pathname: "/contact/[id]", params: { id: item.actor.id, init_name: item.actor.display_name, init_handle: item.actor.handle, init_avatar: item.actor.avatar_url ?? "" } });
    }
  }

  function handleToggleReply(item: NotifItem) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedId === item.id) {
      setExpandedId(null);
      setReplyText("");
      Keyboard.dismiss();
    } else {
      setExpandedId(item.id);
      setReplyText("");
      markRead(item.id);
      Haptics.selectionAsync();
    }
  }

  async function handleReplySend(item: NotifItem) {
    if (!replyText.trim() || !item.post_id) return;
    setSendingReply(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const encoded = encodeId(item.post_id);
      setExpandedId(null);
      setReplyText("");
      Keyboard.dismiss();
      router.push({ pathname: "/p/[id]", params: { id: encoded, prefillReply: replyText.trim() } } as any);
    } finally {
      setSendingReply(false);
    }
  }

  const filtered = items.filter((item) => {
    if (category === "all") return true;
    const cfg = TYPE_CONFIG[item.type];
    return cfg ? cfg.category === category : category === "system";
  });

  const unreadCount = items.filter((n) => !n.is_read).length;
  const grouped = groupByDate(filtered);

  const renderContent = () => {
    if (loading) {
      return (
        <View style={{ padding: 8 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => <NotificationSkeleton key={i} />)}
        </View>
      );
    }

    if (filtered.length === 0) {
      return (
        <View style={st.emptyWrap}>
          <LinearGradient colors={[accent + "25", accent + "08"]} style={st.emptyIconWrap}>
            <Ionicons name="notifications-off-outline" size={44} color={accent} />
          </LinearGradient>
          <Text style={[st.emptyTitle, { color: colors.text }]}>
            {category === "all" ? "Nothing here yet" : `No ${category} notifications`}
          </Text>
          <Text style={[st.emptySub, { color: colors.textSecondary }]}>
            {category === "all"
              ? "When someone interacts with you, orders from your shop, or sends you AC, it'll appear here."
              : "Nothing here yet — check back soon."}
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={grouped}
        keyExtractor={(g) => g.date}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={accent}
          />
        }
        renderItem={({ item: group }) => (
          <View>
            {/* Date section header */}
            <View style={st.dateHeaderRow}>
              <View style={[st.dateLine, { backgroundColor: colors.border }]} />
              <View style={[st.datePill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <Text style={[st.datePillText, { color: colors.textMuted }]}>{group.date}</Text>
              </View>
              <View style={[st.dateLine, { backgroundColor: colors.border }]} />
            </View>

            {group.items.map((item) => (
              <NotifRow
                key={item.id}
                item={item}
                isExpanded={expandedId === item.id}
                replyText={expandedId === item.id ? replyText : ""}
                sendingReply={sendingReply}
                isFollowingActor={item.actor ? followedActors.has(item.actor.id) : false}
                onPress={() => handlePress(item)}
                onToggleReply={() => handleToggleReply(item)}
                onReplyChange={setReplyText}
                onReplySend={() => handleReplySend(item)}
                onFollowBack={item.actor ? () => handleFollowBack(item.actor!.id) : undefined}
              />
            ))}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      />
    );
  };

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
      <OfflineBanner />

      {/* Header */}
      <View
        style={[
          st.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={st.headerCenter}>
          <View style={st.headerTitleRow}>
            <Text style={[st.headerTitle, { color: colors.text }]}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={[st.headerBadge, { backgroundColor: accent }]}>
                <Text style={st.headerBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
              </View>
            )}
          </View>
          {unreadCount > 0 && (
            <Text style={[st.unreadSub, { color: colors.textMuted }]}>
              {unreadCount} unread
            </Text>
          )}
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={[st.readAllBtn, { backgroundColor: accent + "15", borderColor: accent + "40" }]}>
            <Ionicons name="checkmark-done-outline" size={14} color={accent} />
            <Text style={[st.readAllText, { color: accent }]}>Read all</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* AfuChat accent line under header */}
      <View style={[st.accentLine, { backgroundColor: accent }]} />

      {/* Category filter tabs */}
      <View style={[st.categoriesOuter, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.categoriesRow}>
          {CATEGORIES.map((cat) => {
            const count =
              cat.id === "all"
                ? items.filter((n) => !n.is_read).length
                : items.filter(
                    (n) =>
                      !n.is_read &&
                      (TYPE_CONFIG[n.type]?.category === cat.id ||
                        (!TYPE_CONFIG[n.type] && cat.id === "system"))
                  ).length;
            const active = category === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[st.catTab, active && { backgroundColor: accent }]}
                onPress={() => { setCategory(cat.id); Haptics.selectionAsync(); }}
                activeOpacity={0.8}
              >
                <Ionicons name={cat.icon as any} size={14} color={active ? "#fff" : colors.textSecondary} />
                <Text style={[st.catLabel, { color: active ? "#fff" : colors.textSecondary }]}>{cat.label}</Text>
                {count > 0 && (
                  <View style={[st.catBadge, { backgroundColor: active ? "rgba(255,255,255,0.35)" : accent }]}>
                    <Text style={st.catBadgeText}>{count > 9 ? "9+" : count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {renderContent()}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  backBtn: { padding: 4, marginBottom: 2 },
  headerCenter: { flex: 1, gap: 1 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  headerBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  unreadSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  readAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 14, borderWidth: 1,
  },
  readAllText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  accentLine: { height: 2, opacity: 0.85 },

  // Category tabs
  categoriesOuter: { borderBottomWidth: StyleSheet.hairlineWidth },
  categoriesRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  catTab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  catLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  catBadge: {
    minWidth: 17, height: 17, borderRadius: 9,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  catBadgeText: { fontSize: 10, color: "#fff", fontFamily: "Inter_700Bold" },

  // Notification row
  row: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  unreadStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, borderRadius: 0 },
  avatarCol: { position: "relative", flexShrink: 0 },
  avatar: { borderRadius: 28 },
  systemAvatar: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
  },
  typeBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2,
  },

  // Content
  contentCol: { flex: 1, gap: 4, paddingTop: 2 },
  nameRow: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 2,
  },
  actorName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  actionLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  bodyBubble: {
    borderLeftWidth: 3, borderRadius: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    marginTop: 2,
  },
  bodyText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  timeText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  handleText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Right column
  rightCol: { alignItems: "center", gap: 8, paddingTop: 2 },
  unreadDot: { width: 9, height: 9, borderRadius: 5 },
  followBackBtn: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 12, paddingHorizontal: 7, paddingVertical: 4,
  },
  followBackBtnText: { fontSize: 10, fontWeight: "600" },
  replyBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },

  // Reply box
  replyBox: {
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  replyToBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderLeftWidth: 3, borderRadius: 4,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  replyToText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  replyInputRow: {
    flexDirection: "row", alignItems: "flex-end",
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 8, gap: 8,
  },
  replyInput: {
    flex: 1, fontSize: 14, fontFamily: "Inter_400Regular",
    maxHeight: 100, paddingVertical: 0,
  },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },

  // Date section header
  dateHeaderRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  dateLine: { flex: 1, height: StyleSheet.hairlineWidth },
  datePill: {
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  datePillText: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },

  // Empty state
  emptyWrap: { alignItems: "center", paddingTop: 72, paddingHorizontal: 32, gap: 14 },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyTitle: { fontSize: 19, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
});
