import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";

const GOLD = "#D4A853";

const CATEGORIES = [
  { label: "All", icon: "apps-outline" },
  { label: "Technology", icon: "laptop-outline" },
  { label: "Finance", icon: "card-outline" },
  { label: "Healthcare", icon: "medkit-outline" },
  { label: "Education", icon: "school-outline" },
  { label: "Media", icon: "newspaper-outline" },
  { label: "NGO", icon: "heart-outline" },
  { label: "Government", icon: "flag-outline" },
  { label: "Retail", icon: "storefront-outline" },
  { label: "Other", icon: "ellipsis-horizontal-circle-outline" },
];

type PageRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  cover_url: string | null;
  industry: string | null;
  org_type: string | null;
  followers_count: number;
  is_verified: boolean;
  admin_id: string;
};

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export default function CompanyIndexScreen() {
  const { colors, isDark } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const headerTop = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 16);

  const [pages, setPages] = useState<PageRow[]>([]);
  const [myPages, setMyPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"discover" | "mine">("discover");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const load = useCallback(async () => {
    const [{ data: allPages }, { data: owned }] = await Promise.all([
      supabase
        .from("organization_pages")
        .select("id, slug, name, tagline, logo_url, cover_url, industry, org_type, followers_count, is_verified, admin_id")
        .order("followers_count", { ascending: false })
        .limit(80),
      user
        ? supabase
            .from("organization_pages")
            .select("id, slug, name, tagline, logo_url, cover_url, industry, org_type, followers_count, is_verified, admin_id")
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

  const displayedPages = useMemo(() => {
    let list = tab === "mine" ? myPages : pages;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.tagline ?? "").toLowerCase().includes(q) ||
        (p.industry ?? "").toLowerCase().includes(q)
      );
    }
    if (category !== "All" && tab !== "mine") {
      list = list.filter((p) =>
        (p.industry ?? "").toLowerCase().includes(category.toLowerCase()) ||
        (p.org_type ?? "").toLowerCase().includes(category.toLowerCase())
      );
    }
    return list;
  }, [tab, pages, myPages, search, category]);

  const canCreate = !!(profile?.is_verified || profile?.is_organization_verified);

  const renderPageCard = ({ item, index }: { item: PageRow; index: number }) => {
    const isOwned = item.admin_id === user?.id;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push(`/company/${item.slug}` as any)}
        activeOpacity={0.88}
      >
        {/* Cover strip */}
        <View style={[styles.cardCover, { backgroundColor: isDark ? "#1a1a2e" : "#e8f4f8" }]}>
          {item.cover_url ? (
            <Image source={{ uri: item.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={isDark ? ["#1a1a2e", "#0d0d1a"] : ["#e8f4f8", "#cce8f0"]}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.35)"]}
            style={StyleSheet.absoluteFill}
          />
          {/* Rank badge on discover tab */}
          {tab === "discover" && index < 3 && (
            <View style={[styles.rankBadge, { backgroundColor: index === 0 ? GOLD : index === 1 ? "#C0C0C0" : "#CD7F32" }]}>
              <Text style={styles.rankText}>#{index + 1}</Text>
            </View>
          )}
        </View>

        {/* Logo overlapping cover */}
        <View style={[styles.cardLogoWrap, { borderColor: colors.background }]}>
          <View style={[styles.cardLogo, { backgroundColor: colors.accent }]}>
            {item.logo_url ? (
              <Image source={{ uri: item.logo_url }} style={{ width: "100%", height: "100%", borderRadius: 10 }} resizeMode="cover" />
            ) : (
              <Text style={styles.cardLogoText}>{item.name.slice(0, 1).toUpperCase()}</Text>
            )}
          </View>
        </View>

        {/* Info section */}
        <View style={styles.cardInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            {item.is_verified && <Ionicons name="checkmark-circle" size={15} color={GOLD} />}
            {isOwned && (
              <View style={[styles.adminBadge, { backgroundColor: colors.accent + "20" }]}>
                <Text style={[styles.adminBadgeText, { color: colors.accent }]}>Admin</Text>
              </View>
            )}
          </View>

          {item.tagline ? (
            <Text style={[styles.cardTagline, { color: colors.textSecondary }]} numberOfLines={2}>{item.tagline}</Text>
          ) : null}

          <View style={styles.cardMeta}>
            {item.industry ? (
              <View style={[styles.industryChip, { backgroundColor: colors.accent + "15" }]}>
                <Text style={[styles.industryChipText, { color: colors.accent }]} numberOfLines={1}>{item.industry}</Text>
              </View>
            ) : null}
            <View style={styles.followerRow}>
              <Ionicons name="people-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.cardFollowers, { color: colors.textMuted }]}>{fmtCount(item.followers_count)}</Text>
            </View>
            {isOwned && (
              <TouchableOpacity
                style={[styles.manageBtn, { borderColor: colors.border }]}
                onPress={() => router.push(`/company/manage?slug=${item.slug}` as any)}
                hitSlop={8}
              >
                <Ionicons name="settings-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.manageBtnText, { color: colors.textMuted }]}>Manage</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.accent} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Company Pages</Text>
          {canCreate && myPages.length === 0 && !loading ? (
            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: colors.accent }]}
              onPress={() => router.push("/company/create")}
              hitSlop={8}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.createBtnText}>Create</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search pages…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={[styles.tabs, { borderTopColor: colors.border }]}>
          {(["discover", "mine"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && { borderBottomColor: colors.accent }]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, { color: tab === t ? colors.accent : colors.textMuted, fontFamily: tab === t ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                {t === "discover" ? "Discover" : `My Pages${myPages.length > 0 ? ` (${myPages.length})` : ""}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Category filter chips — discover only */}
      {tab === "discover" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}
          style={[styles.categoryScroll, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.label}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: category === cat.label ? colors.accent : colors.background,
                  borderColor: category === cat.label ? colors.accent : colors.border,
                },
              ]}
              onPress={() => setCategory(cat.label)}
              activeOpacity={0.8}
            >
              <Ionicons name={cat.icon as any} size={13} color={category === cat.label ? "#fff" : colors.textMuted} />
              <Text style={[styles.categoryChipText, { color: category === cat.label ? "#fff" : colors.textMuted }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={displayedPages}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 32, gap: 12 }}
          renderItem={renderPageCard}
          ListHeaderComponent={
            tab === "discover" && !loading ? (
              canCreate && myPages.length === 0 ? (
                <TouchableOpacity
                  style={[styles.ctaBanner, { backgroundColor: colors.accent + "12", borderColor: colors.accent + "40" }]}
                  onPress={() => router.push("/company/create")}
                  activeOpacity={0.85}
                >
                  <View style={[styles.ctaIcon, { backgroundColor: colors.accent + "22" }]}>
                    <Ionicons name="add" size={22} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 14 }}>Create a company page</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }}>Build your organization's presence on AfuChat</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                </TouchableOpacity>
              ) : !canCreate && myPages.length === 0 ? (
                <TouchableOpacity
                  style={[styles.ctaBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => router.push("/premium")}
                  activeOpacity={0.85}
                >
                  <View style={[styles.ctaIcon, { backgroundColor: GOLD + "20" }]}>
                    <Ionicons name="checkmark-circle-outline" size={22} color={GOLD} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontFamily: "Inter_700Bold", fontSize: 14 }}>Get verified to create a page</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }}>Verified accounts can create organization pages</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ) : null
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name="business-outline" size={36} color={colors.textMuted} />
              </View>
              {search.trim() ? (
                <>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No results</Text>
                  <Text style={[styles.emptySub, { color: colors.textMuted }]}>No pages match "{search}"</Text>
                  <TouchableOpacity onPress={() => setSearch("")} style={[styles.emptyBtn, { backgroundColor: colors.accent }]}>
                    <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Clear search</Text>
                  </TouchableOpacity>
                </>
              ) : tab === "mine" ? (
                <>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No pages yet</Text>
                  {canCreate ? (
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
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>No organization pages yet.</Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 0 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  createBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  tabs: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 14 },
  categoryScroll: { borderBottomWidth: StyleSheet.hairlineWidth },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  categoryChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  cardCover: { height: 80, position: "relative" },
  rankBadge: { position: "absolute", top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  rankText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  cardLogoWrap: { marginTop: -22, marginLeft: 14, width: 52, height: 52, borderRadius: 12, borderWidth: 3, overflow: "hidden" },
  cardLogo: { width: "100%", height: "100%", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardLogoText: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  cardInfo: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 6, gap: 5 },
  cardName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardTagline: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 },
  cardFollowers: { fontSize: 12, fontFamily: "Inter_400Regular" },
  followerRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  industryChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  industryChipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  adminBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  adminBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  manageBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  manageBtnText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  ctaBanner: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 4 },
  ctaIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  empty: { alignItems: "center", padding: 48, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
});
