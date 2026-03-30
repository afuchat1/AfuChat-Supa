import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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
import Colors from "@/constants/colors";
import { clearBadge } from "@/lib/pushNotifications";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { NotificationSkeleton } from "@/components/ui/Skeleton";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { cacheNotifications, getCachedNotifications, isOnline } from "@/lib/offlineStore";

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
  { id: "all",        label: "All",        icon: "notifications-outline" },
  { id: "social",     label: "Social",     icon: "people-outline" },
  { id: "marketplace",label: "Shop",       icon: "storefront-outline" },
  { id: "payments",   label: "Payments",   icon: "wallet-outline" },
  { id: "system",     label: "System",     icon: "shield-outline" },
];

type TypeConfig = {
  icon: string;
  label: string;
  color: string;
  category: NotifCategory;
  getRoute?: (item: NotifItem) => string | null;
};

const TYPE_CONFIG: Record<string, TypeConfig> = {
  // Social
  new_like:           { icon: "heart",          label: "liked your post",           color: "#FF3B30", category: "social",  getRoute: (n) => n.post_id ? `/post/${n.post_id}` : null },
  new_follower:       { icon: "person-add",      label: "started following you",     color: BRAND,     category: "social",  getRoute: (n) => n.actor ? `/contact/${n.actor.id}` : null },
  new_reply:          { icon: "chatbubble",      label: "replied to your post",      color: "#007AFF", category: "social",  getRoute: (n) => n.post_id ? `/post/${n.post_id}` : null },
  new_mention:        { icon: "at",              label: "mentioned you",             color: "#FF9500", category: "social",  getRoute: (n) => n.post_id ? `/post/${n.post_id}` : null },
  gift:               { icon: "gift",            label: "sent you a gift",           color: "#AF52DE", category: "social",  getRoute: () => null },
  profile_view:       { icon: "eye",             label: "viewed your profile",       color: "#8E8E93", category: "social",  getRoute: (n) => n.actor ? `/contact/${n.actor.id}` : null },
  channel_post:       { icon: "megaphone",       label: "posted in a channel",       color: "#5856D6", category: "social",  getRoute: (n) => n.reference_id ? `/channel/${n.reference_id}` : null },
  live_started:       { icon: "radio",           label: "started a live stream",     color: "#FF3B30", category: "social",  getRoute: (n) => n.reference_id ? `/channel/${n.reference_id}` : null },
  // Marketplace
  order_placed:       { icon: "bag",             label: "placed a new order",        color: "#34C759", category: "marketplace", getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  order_shipped:      { icon: "cube",            label: "shipped your order",        color: "#AF52DE", category: "marketplace", getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  escrow_released:    { icon: "checkmark-done",  label: "confirmed delivery",        color: "#34C759", category: "marketplace", getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  dispute_raised:     { icon: "alert-circle",    label: "raised a dispute",          color: "#FF3B30", category: "marketplace", getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  refund_issued:      { icon: "return-down-back",label: "refund issued",             color: "#FF9500", category: "marketplace", getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  shop_review:        { icon: "star",            label: "left a shop review",        color: GOLD,      category: "marketplace", getRoute: (n) => n.reference_id ? `/shop/order/${n.reference_id}` : null },
  seller_approved:    { icon: "storefront",      label: "seller application approved",color: "#34C759", category: "system",  getRoute: () => "/shop/manage" },
  seller_rejected:    { icon: "storefront",      label: "seller application update", color: "#FF9500", category: "system",  getRoute: () => "/shop/apply" },
  // Payments
  acoin_received:     { icon: "wallet",          label: "ACoins received",           color: GOLD,      category: "payments", getRoute: () => "/me" },
  acoin_sent:         { icon: "wallet-outline",  label: "ACoins sent",               color: "#8E8E93", category: "payments", getRoute: () => "/me" },
  subscription_activated: { icon: "star",        label: "subscription activated",    color: "#FFD700", category: "payments", getRoute: () => "/monetize" },
  // System
  system:             { icon: "shield-checkmark","label": "system notification",     color: BRAND,     category: "system",  getRoute: () => null },
  verification_approved: { icon: "checkmark-circle", label: "verification approved", color: "#34C759", category: "system", getRoute: () => "/me" },
  verification_update: { icon: "information-circle", label: "verification update",   color: "#FF9500", category: "system", getRoute: () => "/me" },
};

function getFallbackConfig(type: string): TypeConfig {
  return { icon: "notifications", label: "notification", color: BRAND, category: "system", getRoute: () => null };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

function NotifRow({ item, onPress }: { item: NotifItem; onPress: () => void }) {
  const { colors } = useTheme();
  const cfg = TYPE_CONFIG[item.type] || getFallbackConfig(item.type);

  return (
    <TouchableOpacity
      style={[
        st.row,
        { backgroundColor: item.is_read ? colors.surface : colors.backgroundSecondary },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {!item.is_read && <View style={[st.unreadStripe, { backgroundColor: BRAND }]} />}
      <View style={st.iconCol}>
        {item.actor
          ? <Avatar uri={item.actor.avatar_url} name={item.actor.display_name} size={46} />
          : (
            <LinearGradient colors={[cfg.color + "30", cfg.color + "10"]} style={st.systemAvatar}>
              <Ionicons name={cfg.icon as any} size={22} color={cfg.color} />
            </LinearGradient>
          )}
        <View style={[st.typeBadge, { backgroundColor: cfg.color, borderColor: colors.surface }]}>
          <Ionicons name={cfg.icon as any} size={10} color="#fff" />
        </View>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
          {item.actor && (
            <>
              <Text style={[st.bold, { color: colors.text }]}>{item.actor.display_name}</Text>
              <VerifiedBadge
                isVerified={item.actor.is_verified}
                isOrganizationVerified={item.actor.is_organization_verified}
                size={13}
              />
            </>
          )}
          <Text style={[st.notifText, { color: colors.text }]}>
            {item.actor ? " " : ""}{cfg.label}
          </Text>
        </View>
        <Text style={[st.notifTime, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
      </View>

      {!item.is_read && <View style={[st.unreadDot, { backgroundColor: BRAND }]} />}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<NotifCategory>("all");

  const load = useCallback(async () => {
    if (!user) return;

    if (!isOnline()) {
      const cached = await getCachedNotifications();
      if (cached.length > 0) setItems(cached as any);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data } = await supabase
      .from("notifications")
      .select("id, type, is_read, created_at, post_id, reference_id, reference_type, profiles!notifications_actor_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      const mapped = data.map((n: any) => ({ ...n, actor: n.profiles }));
      setItems(mapped);
      cacheNotifications(mapped as any);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    load();
    if (Platform.OS !== "web") clearBadge();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-realtime:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
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
      router.push({ pathname: "/post/[id]", params: { id: item.post_id } });
    } else if (item.actor?.id) {
      router.push({ pathname: "/contact/[id]", params: { id: item.actor.id } });
    }
  }

  const filtered = items.filter(item => {
    if (category === "all") return true;
    const cfg = TYPE_CONFIG[item.type];
    return cfg ? cfg.category === category : category === "system";
  });

  const unreadCount = items.filter(n => !n.is_read).length;
  const grouped = groupByDate(filtered);

  const renderContent = () => {
    if (loading) {
      return <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <NotificationSkeleton key={i} />)}</View>;
    }

    if (filtered.length === 0) {
      return (
        <View style={st.emptyWrap}>
          <LinearGradient colors={[BRAND + "20", BRAND + "05"]} style={st.emptyIcon}>
            <Ionicons name="notifications-off-outline" size={40} color={BRAND} />
          </LinearGradient>
          <Text style={[st.emptyTitle, { color: colors.text }]}>
            {category === "all" ? "No notifications yet" : `No ${category} notifications`}
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={BRAND}
          />
        }
        renderItem={({ item: group }) => (
          <View>
            <View style={[st.dateHeader, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[st.dateHeaderText, { color: colors.textMuted }]}>{group.date}</Text>
            </View>
            {group.items.map(item => (
              <NotifRow key={item.id} item={item} onPress={() => handlePress(item)} />
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

      <View style={[st.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[st.headerTitle, { color: colors.text }]}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={[st.unreadSub, { color: BRAND }]}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={st.readAllBtn}>
            <Text style={[st.readAllText, { color: BRAND }]}>Read All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category filter */}
      <View style={[st.categoriesOuter, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.categoriesRow}>
          {CATEGORIES.map(cat => {
            const count = cat.id === "all"
              ? items.filter(n => !n.is_read).length
              : items.filter(n => !n.is_read && (TYPE_CONFIG[n.type]?.category === cat.id || (!TYPE_CONFIG[n.type] && cat.id === "system"))).length;
            const active = category === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[st.catTab, active && { backgroundColor: BRAND }]}
                onPress={() => { setCategory(cat.id); Haptics.selectionAsync(); }}
                activeOpacity={0.8}
              >
                <Ionicons name={cat.icon as any} size={14} color={active ? "#fff" : colors.textSecondary} />
                <Text style={[st.catLabel, { color: active ? "#fff" : colors.textSecondary }]}>{cat.label}</Text>
                {count > 0 && (
                  <View style={[st.catBadge, { backgroundColor: active ? "rgba(255,255,255,0.3)" : BRAND }]}>
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
  header: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  unreadSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  readAllBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  readAllText: { fontSize: 14, fontFamily: "Inter_500Medium" },
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
  dateHeader: { paddingHorizontal: 16, paddingVertical: 6 },
  dateHeaderText: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  unreadStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  iconCol: { position: "relative" },
  systemAvatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: "center", justifyContent: "center",
  },
  typeBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2,
  },
  notifText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  bold: { fontFamily: "Inter_600SemiBold" },
  notifTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  emptyWrap: { alignItems: "center", paddingTop: 72, paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
});
