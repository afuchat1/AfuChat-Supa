import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import {
  DesktopButton,
  DesktopChip,
  DesktopEmptyState,
  DesktopLoadingState,
  DesktopPageHeader,
  DesktopPanel,
  DesktopSectionShell,
  DesktopToolbar,
  useDesktopTheme,
  useHover,
} from "./ui";

const BRAND = "#00BCD4";

type NotifItem = {
  id: string;
  type: string;
  is_read: boolean;
  created_at: string;
  post_id: string | null;
  reference_id: string | null;
  actor: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    handle: string;
    is_verified?: boolean;
  } | null;
};

type Category = "all" | "social" | "marketplace" | "payments" | "system";

const CATEGORIES: { id: Category; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { id: "all",         label: "All",        icon: "notifications-outline" },
  { id: "social",      label: "Social",     icon: "people-outline" },
  { id: "marketplace", label: "Shop",       icon: "storefront-outline" },
  { id: "payments",    label: "Payments",   icon: "wallet-outline" },
  { id: "system",      label: "System",     icon: "shield-outline" },
];

type TypeConfig = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  color: string;
  category: Category;
  getRoute?: (item: NotifItem) => string | null;
};

const TYPE_CONFIG: Record<string, TypeConfig> = {
  new_like:        { icon: "heart",          label: "liked your post",        color: "#FF3B30", category: "social",      getRoute: (n) => n.post_id ? `/post/${n.post_id}` : null },
  new_follower:    { icon: "person-add",     label: "started following you",  color: BRAND,     category: "social",      getRoute: (n) => n.actor ? `/contact/${n.actor.id}` : null },
  new_reply:       { icon: "chatbubble",     label: "replied to your post",   color: "#007AFF", category: "social",      getRoute: (n) => n.post_id ? `/post/${n.post_id}` : null },
  new_mention:     { icon: "at",             label: "mentioned you",          color: "#FF9500", category: "social",      getRoute: (n) => n.post_id ? `/post/${n.post_id}` : null },
  gift:            { icon: "gift",           label: "sent you a gift",        color: "#AF52DE", category: "social",      getRoute: () => null },
  profile_view:    { icon: "eye",            label: "viewed your profile",    color: "#8E8E93", category: "social",      getRoute: (n) => n.actor ? `/contact/${n.actor.id}` : null },
  channel_post:    { icon: "megaphone",      label: "posted in a channel",    color: "#5856D6", category: "social",      getRoute: (n) => n.reference_id ? `/chat/${n.reference_id}` : null },
  order_placed:    { icon: "bag",            label: "placed a new order",     color: "#34C759", category: "marketplace", getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  order_shipped:   { icon: "cube",           label: "shipped your order",     color: "#AF52DE", category: "marketplace", getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  escrow_released: { icon: "checkmark-done", label: "confirmed delivery",     color: "#34C759", category: "marketplace", getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  payment_sent:    { icon: "arrow-up",       label: "sent you a payment",     color: "#34C759", category: "payments",    getRoute: () => `/wallet` },
  payment_received:{ icon: "arrow-down",     label: "received a payment",     color: BRAND,     category: "payments",    getRoute: () => `/wallet` },
  system:          { icon: "information-circle", label: "system notification", color: "#8E8E93", category: "system",     getRoute: () => null },
};

function getConfig(type: string): TypeConfig {
  return TYPE_CONFIG[type] || { icon: "notifications", label: type, color: "#8E8E93", category: "system" };
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function NotifRow({
  item,
  onPress,
  onMarkRead,
}: {
  item: NotifItem;
  onPress: () => void;
  onMarkRead: (id: string) => void;
}) {
  const t = useDesktopTheme();
  const cfg = getConfig(item.type);
  const [hovered, hp] = useHover();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.notifRow,
        {
          backgroundColor: !item.is_read
            ? t.accent + "0F"
            : hovered
              ? t.rowHover
              : "transparent",
          borderBottomColor: t.border,
        },
      ]}
      {...(hp as any)}
    >
      {!item.is_read && <View style={[styles.unreadDot, { backgroundColor: t.accent }]} />}

      <View style={[styles.notifIcon, { backgroundColor: cfg.color + "1A" }]}>
        <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
      </View>

      <View style={{ flexShrink: 0 }}>
        {item.actor ? (
          <Avatar uri={item.actor.avatar_url} name={item.actor.display_name} size={36} />
        ) : (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: t.chipBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="alert-circle-outline" size={18} color={t.textMuted} />
          </View>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.notifText, { color: t.text }]} numberOfLines={2}>
          {item.actor ? (
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>{item.actor.display_name} </Text>
          ) : null}
          <Text style={{ color: t.textMuted, fontFamily: "Inter_400Regular" }}>{cfg.label}</Text>
        </Text>
        <Text style={[styles.notifTime, { color: t.textMuted }]}>{timeAgo(item.created_at)}</Text>
      </View>

      {!item.is_read && (
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation?.(); onMarkRead(item.id); }}
          hitSlop={10}
          style={styles.markReadBtn}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color={t.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export function DesktopNotificationsSection() {
  const { user } = useAuth();
  const t = useDesktopTheme();

  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category>("all");

  const loadNotifs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select(`id, type, is_read, created_at, post_id, reference_id,
        profiles!notifications_actor_id_fkey(id, display_name, avatar_url, handle, is_verified)`)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    const items: NotifItem[] = (data || []).map((n: any) => ({
      ...n,
      actor: n.profiles || null,
    }));
    setNotifs(items);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  // realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`desktop-notifs:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => loadNotifs(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadNotifs]);

  const unreadCount = useMemo(() => notifs.filter((n) => !n.is_read).length, [notifs]);

  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  async function markAllRead() {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  function handlePress(item: NotifItem) {
    if (!item.is_read) markRead(item.id);
    const cfg = getConfig(item.type);
    const route = cfg.getRoute?.(item);
    if (route) router.push(route as any);
  }

  // category counts
  const counts = useMemo(() => {
    const m: Record<Category, number> = { all: notifs.length, social: 0, marketplace: 0, payments: 0, system: 0 };
    for (const n of notifs) {
      const c = getConfig(n.type).category;
      m[c] = (m[c] || 0) + 1;
    }
    return m;
  }, [notifs]);

  const filtered = notifs.filter((n) => category === "all" || getConfig(n.type).category === category);

  return (
    <DesktopSectionShell>
      <View
        style={{
          width: "100%",
          maxWidth: 880,
          alignSelf: "center",
          flex: 1,
          flexDirection: "column",
        }}
      >
        <DesktopPanel flex={1}>
          <DesktopPageHeader
            icon="notifications-outline"
            title="Notifications"
            subtitle={
              loading
                ? "Loading…"
                : unreadCount > 0
                  ? `${unreadCount} unread${notifs.length ? ` of ${notifs.length}` : ""}`
                  : `All caught up · ${notifs.length} total`
            }
            right={
              unreadCount > 0 ? (
                <DesktopButton
                  label="Mark all as read"
                  icon="checkmark-done-outline"
                  variant="secondary"
                  size="sm"
                  onPress={markAllRead}
                />
              ) : null
            }
          />

          <DesktopToolbar style={{ flexWrap: "wrap" as any, gap: 6 }}>
            {CATEGORIES.map((cat) => (
              <DesktopChip
                key={cat.id}
                icon={cat.icon}
                label={`${cat.label}${counts[cat.id] ? ` · ${counts[cat.id]}` : ""}`}
                active={category === cat.id}
                onPress={() => setCategory(cat.id)}
              />
            ))}
          </DesktopToolbar>

          {loading ? (
            <DesktopLoadingState label="Loading notifications" />
          ) : filtered.length === 0 ? (
            <DesktopEmptyState
              icon="notifications-off-outline"
              title="Nothing here yet"
              subtitle={
                category === "all"
                  ? "When someone interacts with you, you'll see it here."
                  : "No notifications match this filter."
              }
              action={
                category !== "all"
                  ? { label: "Show all", icon: "list-outline", onPress: () => setCategory("all") }
                  : undefined
              }
            />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(n) => n.id}
              renderItem={({ item }) => (
                <NotifRow item={item} onPress={() => handlePress(item)} onMarkRead={markRead} />
              )}
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          )}
        </DesktopPanel>
      </View>
    </DesktopSectionShell>
  );
}

const styles = StyleSheet.create({
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    left: 6,
    top: "50%" as any,
    transform: [{ translateY: -3 }],
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  notifIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginLeft: 4,
  },
  notifText: { fontSize: 13.5, lineHeight: 19 },
  notifTime: { fontSize: 11.5, fontFamily: "Inter_400Regular", marginTop: 3 },
  markReadBtn: { padding: 6, flexShrink: 0 },
});
