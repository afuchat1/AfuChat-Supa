import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";

const GOLD = "#D4A853";

type PageRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  industry: string | null;
  org_type: string | null;
  followers_count: number;
  is_verified: boolean;
  admin_id: string;
};

export default function CompanyIndexScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const headerTop = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 16);

  const [pages, setPages] = useState<PageRow[]>([]);
  const [myPages, setMyPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"discover" | "mine">("discover");

  const load = useCallback(async () => {
    const [{ data: allPages }, { data: owned }] = await Promise.all([
      supabase
        .from("organization_pages")
        .select("id, slug, name, tagline, logo_url, industry, org_type, followers_count, is_verified, admin_id")
        .order("followers_count", { ascending: false })
        .limit(50),
      user
        ? supabase
            .from("organization_pages")
            .select("id, slug, name, tagline, logo_url, industry, org_type, followers_count, is_verified, admin_id")
            .eq("admin_id", user.id)
        : Promise.resolve({ data: [] }),
    ]);
    setPages((allPages ?? []) as PageRow[]);
    setMyPages((owned ?? []) as PageRow[]);
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };
  const displayedPages = tab === "mine" ? myPages : pages;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.navBar, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Company Pages</Text>
        {(profile?.is_verified || profile?.is_organization_verified) ? (
          <TouchableOpacity onPress={() => router.push("/company/create")} hitSlop={12}>
            <Ionicons name="add" size={26} color={colors.accent} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["discover", "mine"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, { borderBottomColor: tab === t ? colors.accent : "transparent" }]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? colors.accent : colors.textMuted, fontFamily: tab === t ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
              {t === "discover" ? "Discover" : "My Pages"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={displayedPages}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 10 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={44} color={colors.textMuted} />
              {tab === "mine" ? (
                <>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No pages yet</Text>
                  {(profile?.is_verified || profile?.is_organization_verified) ? (
                    <>
                      <Text style={[styles.emptySub, { color: colors.textMuted }]}>Create your first organization page.</Text>
                      <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.accent }]} onPress={() => router.push("/company/create")} activeOpacity={0.8}>
                        <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Create a Page</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.emptySub, { color: colors.textMuted }]}>Get a verified account to create organization pages.</Text>
                      <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.accent }]} onPress={() => router.push("/premium")} activeOpacity={0.8}>
                        <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Get Verified</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              ) : (
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>No organization pages yet. Be the first!</Text>
              )}
            </View>
          }
          ListHeaderComponent={
            tab === "discover" && (profile?.is_verified || profile?.is_organization_verified) ? (
              <TouchableOpacity
                style={[styles.verifyBanner, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "40" }]}
                onPress={() => router.push("/company/create")}
                activeOpacity={0.85}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + "22", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="add" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Create a company page</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" }}>Build your organization's presence on AfuChat</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.accent} />
              </TouchableOpacity>
            ) : tab === "discover" && !profile?.is_verified ? (
              <TouchableOpacity
                style={[styles.verifyBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push("/premium")}
                activeOpacity={0.85}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent + "22", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Get verified to create a page</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" }}>Verified accounts can create organization pages</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push(`/company/${item.slug}` as any)}
              activeOpacity={0.8}
            >
              <View style={[styles.cardLogo, { backgroundColor: colors.accent }]}>
                {item.logo_url
                  ? <Image source={{ uri: item.logo_url }} style={{ width: "100%", height: "100%", borderRadius: 12 }} resizeMode="cover" />
                  : <Text style={styles.cardLogoText}>{item.name.slice(0, 1).toUpperCase()}</Text>
                }
              </View>
              <View style={styles.cardInfo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                  {item.is_verified && <Ionicons name="checkmark-circle" size={14} color={GOLD} />}
                  {item.admin_id === user?.id && (
                    <View style={[styles.adminBadge, { backgroundColor: colors.accent + "20" }]}>
                      <Text style={[styles.adminBadgeText, { color: colors.accent }]}>Admin</Text>
                    </View>
                  )}
                </View>
                {item.tagline ? <Text style={[styles.cardTagline, { color: colors.textSecondary }]} numberOfLines={1}>{item.tagline}</Text> : null}
                <View style={styles.cardMeta}>
                  {item.industry ? (
                    <View style={styles.metaChip}>
                      <Ionicons name="briefcase-outline" size={11} color={colors.textMuted} />
                      <Text style={[styles.metaChipText, { color: colors.textMuted }]}>{item.industry}</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.cardFollowers, { color: colors.textMuted }]}>
                    {item.followers_count.toLocaleString()} followers
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "center" },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2 },
  tabText: { fontSize: 14 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  cardLogo: { width: 52, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  cardLogoText: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  cardInfo: { flex: 1, gap: 4 },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardTagline: { fontSize: 13, fontFamily: "Inter_400Regular" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardFollowers: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaChipText: { fontSize: 12 },
  adminBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  adminBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  verifyBanner: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  empty: { alignItems: "center", padding: 48, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
});
