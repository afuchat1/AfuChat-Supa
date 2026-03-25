import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { clearBadge } from "@/lib/pushNotifications";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { NotificationSkeleton } from "@/components/ui/Skeleton";

type NotifItem = {
  id: string;
  type: string;
  is_read: boolean;
  created_at: string;
  post_id: string | null;
  actor: { id: string; display_name: string; avatar_url: string | null; handle: string; is_verified?: boolean; is_organization_verified?: boolean } | null;
};

const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
  like: { icon: "heart", label: "liked your post", color: "#FF3B30" },
  follow: { icon: "person-add", label: "started following you", color: Colors.brand },
  reply: { icon: "chatbubble", label: "replied to your post", color: "#007AFF" },
  mention: { icon: "at", label: "mentioned you", color: "#FF9500" },
  gift: { icon: "gift", label: "sent you a gift", color: "#AF52DE" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, type, is_read, created_at, post_id, profiles!notifications_actor_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      setItems(data.map((n: any) => ({ ...n, actor: n.profiles })));
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
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        <TouchableOpacity onPress={markAllRead}>
          <Text style={[styles.markAllText, { color: Colors.brand }]}>Read All</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <NotificationSkeleton key={i} />)}</View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const cfg = typeConfig[item.type] || { icon: "notifications", label: "notification", color: colors.textMuted };
            return (
              <TouchableOpacity
                style={[styles.row, { backgroundColor: item.is_read ? colors.surface : colors.backgroundSecondary }]}
                onPress={() => {
                  markRead(item.id);
                  if (item.post_id) router.push({ pathname: "/post/[id]", params: { id: item.post_id } });
                }}
                activeOpacity={0.7}
              >
                <View style={styles.iconCol}>
                  <Avatar uri={item.actor?.avatar_url} name={item.actor?.display_name} size={44} />
                  <View style={[styles.typeBadge, { backgroundColor: cfg.color }]}>
                    <Ionicons name={cfg.icon as any} size={10} color="#fff" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                    <Text style={[styles.bold, { color: colors.text }]}>{item.actor?.display_name || "Someone"}</Text>
                    <VerifiedBadge isVerified={item.actor?.is_verified} isOrganizationVerified={item.actor?.is_organization_verified} size={13} />
                    <Text style={[styles.notifText, { color: colors.text }]}> {cfg.label}</Text>
                  </View>
                  <Text style={[styles.notifTime, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
                </View>
                {!item.is_read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.brand} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="notifications-off-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  markAllText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  iconCol: { position: "relative" },
  typeBadge: { position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  notifText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  bold: { fontFamily: "Inter_600SemiBold" },
  notifTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brand },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
