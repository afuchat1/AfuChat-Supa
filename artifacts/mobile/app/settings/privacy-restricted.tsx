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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { ContactRowSkeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { useLanguage } from "@/context/LanguageContext";
import { Separator } from "@/components/ui/Separator";

type RestrictedUser = {
  id: string;
  restricted_at: string;
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null };
};

export default function PrivacyRestrictedScreen() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<RestrictedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("blocked_users")
      .select("id, blocked_at, blocked_profile:blocked_id(id, display_name, handle, avatar_url)")
      .eq("blocker_id", user.id)
      .order("blocked_at", { ascending: false });
    if (data) setItems(data.map((b: any) => ({ id: b.id, restricted_at: b.blocked_at, profile: b.blocked_profile })));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function unrestrict(item: RestrictedUser) {
    showAlert("Unrestrict", `Unrestrict ${item.profile.display_name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unrestrict",
        onPress: async () => {
          setRemoving(item.id);
          try {
            await supabase.from("blocked_users").delete().eq("id", item.id);
            setItems((prev) => prev.filter((r) => r.id !== item.id));
          } catch (_) {
            showAlert("Error", "Could not unrestrict. Please try again.");
          } finally {
            setRemoving(null);
          }
        },
      },
    ]);
  }

  const filtered = items.filter((i) =>
    i.profile.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    i.profile.handle?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader
        title="restricted.title"
        subtitle={!loading && items.length > 0 ? `${items.length} ${t("restricted")}` : undefined}
      />

      <GlassCard style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 16, overflow: "hidden" }} variant="subtle" noShadow>
        <View style={s.infoCard}>
          <View style={s.infoIcon}>
            <Ionicons name="information-circle-outline" size={22} color={colors.text} />
          </View>
          <Text style={[s.infoText, { color: colors.textSecondary }]}>
            {t("Restricted accounts can still see your posts but their comments are only visible to them. They can't see when you're online or when you've read their messages.")}
          </Text>
        </View>
      </GlassCard>

      {items.length > 3 && (
        <GlassCard style={{ marginHorizontal: 16, marginTop: 10, borderRadius: 12, overflow: "hidden" }} variant="subtle" noShadow>
          <View style={s.searchBar}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={[s.searchInput, { color: colors.text }]}
              placeholder={t("restricted.search")}
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </GlassCard>
      )}

      {loading ? (
        <View style={{ padding: 8, gap: 2 }}>{[1,2,3,4,5].map(i => <ContactRowSkeleton key={i} />)}</View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            filtered.length > 0 ? (
              <Text style={[s.listHeader, { color: colors.textMuted }]}>{t("restricted.accounts")}</Text>
            ) : null
          }
          renderItem={({ item, index }) => {
            const isLast = index === filtered.length - 1;
            return (
              <View style={[s.rowWrapper, { backgroundColor: colors.card, marginHorizontal: 16 }]}>
                <View style={s.row}>
                  <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{item.profile.display_name}</Text>
                    <Text style={[s.handle, { color: colors.textMuted }]}>@{item.profile.handle}</Text>
                  </View>
                  <TouchableOpacity
                    style={[s.unrestrictBtn, { borderColor: accent }]}
                    onPress={() => unrestrict(item)}
                    disabled={removing === item.id}
                    activeOpacity={0.7}
                  >
                    {removing === item.id ? (
                      <ActivityIndicator size="small" color={accent} />
                    ) : (
                      <Text style={[s.unrestrictText, { color: accent }]}>{t("restricted.action")}</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {!isLast && <Separator />}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: "#34C75918" }]}>
                <Ionicons name="shield-checkmark" size={40} color="#34C759" />
              </View>
              <Text style={[s.emptyTitle, { color: colors.text }]}>
                {search.trim() ? t("restricted.no_results") : t("restricted.none")}
              </Text>
              <Text style={[s.emptyDesc, { color: colors.textMuted }]}>
                {search.trim()
                  ? t("restricted.try_different")
                  : t("Restricting someone limits their ability to interact with you without blocking them.")}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  infoCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  infoIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", padding: 0 },
  listHeader: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  rowWrapper: { borderRadius: 0, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  unrestrictBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, minWidth: 84, alignItems: "center" },
  unrestrictText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
