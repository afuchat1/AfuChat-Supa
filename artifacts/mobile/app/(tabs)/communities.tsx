/**
 * Communities tab — landing surface for paid + free communities.
 *
 * On both desktop and mobile this screen lists the communities the user
 * already belongs to and offers a browsable directory of suggested ones.
 * Joining and creating still happens inside the existing
 * `/paid-communities` screen (linked from the header).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useIsDesktop } from "@/hooks/useIsDesktop";

type Community = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  member_count: number;
  creator_id: string;
  creator_name: string;
  creator_handle: string;
  is_member: boolean;
  tags: string[];
};

export default function CommunitiesScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { isDesktop, width } = useIsDesktop();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("paid_communities")
      .select(`
        id, name, description, emoji, price, member_count, creator_id, tags,
        profiles!paid_communities_creator_id_fkey(display_name, handle)
      `)
      .order("member_count", { ascending: false })
      .limit(50);

    if (error || !data) {
      setCommunities([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    let memberSet = new Set<string>();
    if (user) {
      const { data: memberships } = await supabase
        .from("community_members")
        .select("community_id")
        .eq("user_id", user.id);
      memberSet = new Set((memberships || []).map((m: any) => m.community_id));
    }

    setCommunities(
      data.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description || "",
        emoji: c.emoji || "🏰",
        price: c.price,
        member_count: c.member_count || 0,
        creator_id: c.creator_id,
        creator_name: c.profiles?.display_name || "Creator",
        creator_handle: c.profiles?.handle || "creator",
        is_member: memberSet.has(c.id) || c.creator_id === user?.id,
        tags: c.tags || [],
      })),
    );
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const myCommunities = useMemo(
    () => communities.filter((c) => c.is_member),
    [communities],
  );
  const browseCommunities = useMemo(
    () => communities.filter((c) => !c.is_member),
    [communities],
  );

  const numColumns = isDesktop ? (width >= 1320 ? 3 : 2) : 1;

  function renderCard(c: Community) {
    return (
      <Pressable
        key={c.id}
        onPress={() => router.push("/paid-communities" as any)}
        style={({ hovered }: any) => [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            transform: hovered ? [{ translateY: -1 }] : [],
          },
        ]}
      >
        <View style={[styles.cardHeader, { backgroundColor: colors.accent + "15" }]}>
          <Text style={styles.cardEmoji}>{c.emoji}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{c.name}</Text>
          <Text style={[styles.cardCreator, { color: colors.textMuted }]} numberOfLines={1}>
            by @{c.creator_handle}
          </Text>
          {c.description ? (
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>
              {c.description}
            </Text>
          ) : null}
          <View style={styles.cardFooter}>
            <View style={styles.metric}>
              <Ionicons name="people-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.metricText, { color: colors.textMuted }]}>
                {c.member_count} {c.member_count === 1 ? "member" : "members"}
              </Text>
            </View>
            {c.is_member ? (
              <View style={[styles.badgeMember, { backgroundColor: colors.accent + "20" }]}>
                <Ionicons name="checkmark" size={12} color={colors.accent} />
                <Text style={[styles.badgeMemberText, { color: colors.accent }]}>Joined</Text>
              </View>
            ) : (
              <View style={[styles.badgePrice, { backgroundColor: colors.backgroundTertiary }]}>
                <Text style={[styles.badgePriceText, { color: colors.text }]}>
                  {c.price > 0 ? `${c.price} AC` : "Free"}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[
        styles.header,
        {
          paddingTop: insets.top + 12,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Communities</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>
            Spaces where members chat, share and grow together
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/paid-communities" as any)}
          style={({ hovered }: any) => [
            styles.createBtn,
            { backgroundColor: colors.accent, opacity: hovered ? 0.92 : 1 },
          ]}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.createBtnText}>New community</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={browseCommunities}
          key={`cols-${numColumns}`}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? { gap: 14, paddingHorizontal: 16 } : undefined}
          contentContainerStyle={{
            paddingVertical: 14,
            paddingHorizontal: numColumns > 1 ? 0 : 16,
            paddingBottom: insets.bottom + 80,
            gap: 14,
          }}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderCard(item)}
          ListHeaderComponent={
            myCommunities.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Your communities</Text>
                <View
                  style={[
                    styles.row,
                    { paddingHorizontal: numColumns > 1 ? 16 : 0, paddingTop: 4 },
                  ]}
                >
                  {myCommunities.slice(0, 6).map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => router.push("/paid-communities" as any)}
                      style={({ hovered }: any) => [
                        styles.pill,
                        {
                          backgroundColor: hovered ? colors.backgroundTertiary : colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={styles.pillEmoji}>{c.emoji}</Text>
                      <Text style={[styles.pillName, { color: colors.text }]} numberOfLines={1}>
                        {c.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 18 }]}>Discover</Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: numColumns > 1 ? 16 : 0 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Discover</Text>
              </View>
            )
          }
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Ionicons name="people-circle-outline" size={56} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No communities yet
              </Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                Be the first to start a paid community.
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.accent}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: -0.2 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    paddingHorizontal: 0,
    marginBottom: 6,
  },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 220,
  },
  pillEmoji: { fontSize: 14 },
  pillName: { fontFamily: "Inter_500Medium", fontSize: 13, flexShrink: 1 },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    flex: 1,
  },
  cardHeader: {
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  cardEmoji: { fontSize: 38 },
  cardBody: { padding: 14, gap: 4 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  cardCreator: { fontFamily: "Inter_400Regular", fontSize: 11 },
  cardDesc: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, marginTop: 2 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  metric: { flexDirection: "row", alignItems: "center", gap: 4 },
  metricText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  badgeMember: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeMemberText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  badgePrice: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgePriceText: { fontFamily: "Inter_700Bold", fontSize: 11 },
  emptyBlock: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  emptySub: { fontFamily: "Inter_400Regular", fontSize: 13 },
});
