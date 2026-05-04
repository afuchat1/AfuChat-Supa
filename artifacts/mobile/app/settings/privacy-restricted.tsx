import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { ContactRowSkeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

type RestrictedUser = {
  id: string;
  restricted_at: string;
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null };
};

export default function PrivacyRestrictedScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<RestrictedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    // Use blocked_users table with a "restrict" type if available, else show info
    const { data } = await supabase
      .from("blocked_users")
      .select("id, blocked_at, blocked_profile:blocked_id(id, display_name, handle, avatar_url)")
      .eq("blocker_id", user.id)
      .order("blocked_at", { ascending: false });
    // Map blocked as restricted for now (same underlying mechanism)
    if (data) setItems(data.map((b: any) => ({ id: b.id, restricted_at: b.blocked_at, profile: b.blocked_profile })));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function unrestrict(item: RestrictedUser) {
    showAlert("Unrestrict", `Unrestrict ${item.profile.display_name}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Unrestrict", onPress: async () => {
        setRemoving(item.id);
        await supabase.from("blocked_users").delete().eq("id", item.id);
        setItems((prev) => prev.filter((r) => r.id !== item.id));
        setRemoving(null);
      }},
    ]);
  }

  const filtered = items.filter((i) =>
    i.profile.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    i.profile.handle?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Restricted Accounts</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 16 }]}>
        <Ionicons name="information-circle" size={20} color={colors.accent} />
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Restricted accounts can still see your posts but their comments are only visible to them. They can't see when you're online or when you've read their messages.
        </Text>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 12 }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search restricted…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={{ padding: 8, gap: 2 }}>{[1,2,3,4,5].map(i => <ContactRowSkeleton key={i} />)}</View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.surface }]}>
              <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{item.profile.display_name}</Text>
                <Text style={[styles.handle, { color: colors.textMuted }]}>@{item.profile.handle}</Text>
              </View>
              <TouchableOpacity
                style={[styles.unrestrictBtn, { borderColor: colors.accent }]}
                onPress={() => unrestrict(item)}
                disabled={removing === item.id}
              >
                {removing === item.id ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={[styles.unrestrictText, { color: colors.accent }]}>Unrestrict</Text>}
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No restricted accounts</Text>
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
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", padding: 0 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, marginHorizontal: 16, marginVertical: 4, borderRadius: 14 },
  name: { fontSize: 15, fontFamily: "Inter_500Medium" },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  unrestrictBtn: { borderWidth: 1, borderColor: Colors.brand, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, minWidth: 80, alignItems: "center" },
  unrestrictText: { color: Colors.brand, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
