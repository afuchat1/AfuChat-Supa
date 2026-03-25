import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { showAlert } from "@/lib/alert";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { ContactRowSkeleton } from "@/components/ui/Skeleton";

type BlockedItem = {
  id: string;
  blocked_at: string;
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null; is_verified?: boolean; is_organization_verified?: boolean };
};

export default function BlockedUsersScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<BlockedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("blocked_users")
      .select("id, blocked_at, profiles!blocked_users_blocked_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified)")
      .eq("blocker_id", user.id)
      .order("blocked_at", { ascending: false });
    if (data) setItems(data.map((b: any) => ({ ...b, profile: b.profiles })));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function unblock(item: BlockedItem) {
    showAlert("Unblock", `Unblock ${item.profile.display_name}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Unblock", onPress: async () => {
        await supabase.from("blocked_users").delete().eq("id", item.id);
        setItems((prev) => prev.filter((b) => b.id !== item.id));
      }},
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Blocked Users</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? <View style={{ padding: 8 }}>{[1,2,3,4].map(i => <ContactRowSkeleton key={i} />)}</View> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.surface }]}>
              <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={44} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.profile.display_name}</Text>
                  <VerifiedBadge isVerified={item.profile.is_verified} isOrganizationVerified={item.profile.is_organization_verified} size={13} />
                </View>
                <Text style={[styles.handle, { color: colors.textMuted }]}>@{item.profile.handle}</Text>
              </View>
              <TouchableOpacity style={styles.unblockBtn} onPress={() => unblock(item)}>
                <Text style={styles.unblockText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 90 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No blocked users</Text>
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
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  name: { fontSize: 16, fontFamily: "Inter_500Medium" },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  unblockBtn: { borderWidth: 1, borderColor: "#FF3B30", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  unblockText: { color: "#FF3B30", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
