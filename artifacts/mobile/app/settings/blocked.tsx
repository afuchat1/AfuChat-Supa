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
import {
  ACCOUNT_PROFILE_FOLLOWER_COLUMNS,
  fetchAccountProfileMap,
} from "@/lib/sharedProfiles";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { ContactRowSkeleton } from "@/components/ui/Skeleton";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { useLanguage } from "@/context/LanguageContext";
import { registerUiTexts } from "@/lib/i18n";

type BlockedItem = {
  id: string;
  blocked_at: string;
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null; is_verified?: boolean; is_organization_verified?: boolean };
};

registerUiTexts(["Today", "Yesterday", "days ago", "w ago", "mo ago", "y ago", "person", "people", "blocked"]);

function timeAgo(iso: string, t: (text: string) => string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return t("Today");
  if (days === 1) return t("Yesterday");
  if (days < 7) return `${days} ${t("days ago")}`;
  if (days < 30) return `${Math.floor(days / 7)}${t("w ago")}`;
  if (days < 365) return `${Math.floor(days / 30)}${t("mo ago")}`;
  return `${Math.floor(days / 365)}${t("y ago")}`;
}

export default function BlockedUsersScreen() {
  const { colors, accent } = useTheme();
  const { t } = useLanguage();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<BlockedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("blocked_users")
      .select("id, blocked_id, blocked_at")
      .eq("blocker_id", user.id)
      .order("blocked_at", { ascending: false });
    if (!error && data) {
      const { profiles } = await fetchAccountProfileMap(
        data.map((row: any) => row.blocked_id),
        ACCOUNT_PROFILE_FOLLOWER_COLUMNS,
      );
      setItems(data.map((row: any) => {
        const profile = profiles.get(row.blocked_id);
        return {
          id: row.id,
          blocked_at: row.blocked_at,
          profile: {
            id: row.blocked_id,
            display_name: profile?.display_name || "Unknown",
            handle: profile?.handle || "",
            avatar_url: profile?.avatar_url ?? null,
            is_verified: !!profile?.is_verified,
            is_organization_verified: !!profile?.is_organization_verified,
          },
        };
      }));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function unblock(item: BlockedItem) {
    showAlert("Unblock", `Unblock ${item.profile.display_name}? They will be able to see your profile and message you again.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unblock",
        style: "destructive",
        onPress: async () => {
          setUnblocking(item.id);
          try {
            await supabase.from("blocked_users").delete().eq("id", item.id);
            setItems((prev) => prev.filter((b) => b.id !== item.id));
          } catch (_) {
            showAlert("Error", "Could not unblock. Please try again.");
          } finally {
            setUnblocking(null);
          }
        },
      },
    ]);
  }

  const filtered = search.trim()
    ? items.filter((i) =>
        i.profile.display_name?.toLowerCase().includes(search.toLowerCase()) ||
        i.profile.handle?.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader
        title="blocked.title"
         subtitle={!loading && items.length > 0 ? `${items.length} ${t(items.length === 1 ? "person" : "people")} ${t("blocked")}` : undefined}
      />

      {loading ? (
        <View style={{ padding: 8, gap: 2 }}>{[1,2,3,4,5].map(i => <ContactRowSkeleton key={i} />)}</View>
      ) : (
        <>
          {items.length > 3 && (
            <GlassCard style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 14, overflow: "hidden" }} variant="subtle" noShadow>
              <View style={[s.searchBar, { backgroundColor: "transparent" }]}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  style={[s.searchInput, { color: colors.text }]}
                  placeholder="Search blocked…"
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

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 12 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              !loading && items.length === 0 ? (
                <View style={{ alignItems: "center", paddingTop: 64, gap: 12 }}>
                  <Ionicons name="shield-checkmark-outline" size={48} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 15 }}>{t("blocked.none")}</Text>
                </View>
              ) : search.trim() && filtered.length === 0 ? (
                <View style={{ alignItems: "center", paddingTop: 32 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>{t("blocked.no_results", { query: search })}</Text>
                </View>
              ) : null
            }
            ListHeaderComponent={
              filtered.length > 0 ? (
                <Text style={[s.listHeader, { color: colors.textMuted }]}>{t("blocked.accounts")}</Text>
              ) : null
            }
            renderItem={({ item, index }) => {
              const isLast = index === filtered.length - 1;
              return (
                <View style={[s.rowWrapper, { backgroundColor: colors.card, marginHorizontal: 16 }]}>
                  <View style={s.row}>
                    <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={46} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{item.profile.display_name}</Text>
                        <VerifiedBadge isVerified={item.profile.is_verified} isOrganizationVerified={item.profile.is_organization_verified} size={13} />
                      </View>
                      <Text style={[s.handle, { color: colors.textMuted }]}>@{item.profile.handle}</Text>
                       <Text style={[s.blockedAt, { color: colors.textMuted }]}>{t("Blocked")} {timeAgo(item.blocked_at, t)}</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.unblockBtn, { borderColor: colors.border }]}
                      onPress={() => unblock(item)}
                      disabled={unblocking === item.id}
                      activeOpacity={0.7}
                    >
                      {unblocking === item.id ? (
                        <ActivityIndicator size="small" color="#FF3B30" />
                      ) : (
                        <Text style={s.unblockText}>{t("blocked.action")}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {!isLast && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                </View>
              );
            }}
          />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
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
  sep: { height: 0.5, marginLeft: 74 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  blockedAt: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  unblockBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 76,
    alignItems: "center",
  },
  unblockText: { color: "#FF3B30", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingTop: 72, paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
