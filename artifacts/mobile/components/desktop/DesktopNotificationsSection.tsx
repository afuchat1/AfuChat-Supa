import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";

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

function NotifRow({ item, colors, onPress, onMarkRead }: {
  item: NotifItem;
  colors: any;
  onPress: () => void;
  onMarkRead: (id: string) => void;
}) {
  const cfg = getConfig(item.type);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.notifRow,
        { backgroundColor: item.is_read ? "transparent" : colors.accent + "08", borderBottomColor: colors.border },
      ]}
    >
      {!item.is_read && <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />}

      <View style={[styles.notifIcon, { backgroundColor: cfg.color + "18" }]}>
        <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
      </View>

      <View style={styles.notifBody}>
        <View style={styles.notifTop}>
          {item.actor && (
            <Avatar uri={item.actor.avatar_url} name={item.actor.display_name} size={28} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.notifText, { color: colors.text }]}>
              {item.actor ? (
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>{item.actor.display_name} </Text>
              ) : null}
              <Text style={{ color: colors.textMuted }}>{cfg.label}</Text>
            </Text>
            <Text style={[styles.notifTime, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
          </View>
        </View>
      </View>

      {!item.is_read && (
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation?.(); onMarkRead(item.id); }}
          hitSlop={10}
          style={styles.markReadBtn}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export function DesktopNotificationsSection() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category>("all");
  const [unreadCount, setUnreadCount] = useState(0);

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
    setUnreadCount(items.filter((n) => !n.is_read).length);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  function handlePress(item: NotifItem) {
    if (!item.is_read) markRead(item.id);
    const cfg = getConfig(item.type);
    const route = cfg.getRoute?.(item);
    if (route) router.push(route as any);
  }

  const filtered = notifs.filter((n) => {
    if (category === "all") return true;
    return getConfig(n.type).category === category;
  });

  return (
    <View style={[styles.root, { backgroundColor: isDark ? "#0f0f12" : "#f8f9fc" }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? "#0f0f12" : "#ffffff", borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              {unreadCount} unread
            </Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={[styles.markAllBtn, { borderColor: colors.border }]}>
            <Ionicons name="checkmark-done-outline" size={15} color={colors.accent} />
            <Text style={[styles.markAllText, { color: colors.accent }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category tabs */}
      <View style={[styles.catRow, { backgroundColor: isDark ? "#0f0f12" : "#ffffff", borderBottomColor: colors.border }]}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            onPress={() => setCategory(cat.id)}
            style={[
              styles.catTab,
              category === cat.id && { borderBottomColor: colors.accent, borderBottomWidth: 2 },
            ]}
            activeOpacity={0.8}
          >
            <Ionicons
              name={cat.icon}
              size={14}
              color={category === cat.id ? colors.accent : colors.textMuted}
            />
            <Text
              style={[
                styles.catLabel,
                { color: category === cat.id ? colors.accent : colors.textMuted },
                category === cat.id && { fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <View style={styles.listWrap}>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(n) => n.id}
            renderItem={({ item }) => (
              <NotifRow
                item={item}
                colors={colors}
                onPress={() => handlePress(item)}
                onMarkRead={markRead}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No notifications</Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "column", overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  markAllText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  catRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  catTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  catLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  listWrap: { flex: 1, maxWidth: 760, alignSelf: "center", width: "100%" as any },
  listContent: { paddingBottom: 40 },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    left: 8,
    top: "50%" as any,
    transform: [{ translateY: -4 }],
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  notifIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  notifBody: { flex: 1, minWidth: 0 },
  notifTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  notifText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, flex: 1 },
  notifTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  markReadBtn: { padding: 6, flexShrink: 0 },
  emptyWrap: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium" },
});
