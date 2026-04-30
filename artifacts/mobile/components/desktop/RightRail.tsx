/**
 * Desktop right rail — "Who to follow" + "Trending".
 *
 * Mounted only on the desktop layout next to the centered feed column.
 * Fetches a small batch of suggested profiles and recent trending hashtags
 * from Supabase and renders them as compact cards.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";

type SuggestedProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  bio: string | null;
};

type TrendingTag = {
  tag: string;
  posts: number;
};

function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/#\w+/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1).toLowerCase());
}

export function RightRail() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [suggested, setSuggested] = useState<SuggestedProfile[]>([]);
  const [trending, setTrending] = useState<TrendingTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);

    // ── Who to follow ──
    let myFollowing = new Set<string>();
    if (user) {
      const { data: f } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);
      myFollowing = new Set((f || []).map((r: any) => r.following_id));
      setFollowingIds(myFollowing);
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, is_verified, is_organization_verified, bio")
      .neq("id", user?.id || "00000000-0000-0000-0000-000000000000")
      .order("created_at", { ascending: false })
      .limit(40);

    const filtered = (profiles || [])
      .filter((p: any) => !myFollowing.has(p.id))
      .slice(0, 5);
    setSuggested(filtered as SuggestedProfile[]);

    // ── Trending hashtags (from posts in the last 7 days) ──
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recent } = await supabase
      .from("posts")
      .select("content")
      .eq("visibility", "public")
      .eq("is_blocked", false)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200);

    const counts = new Map<string, number>();
    for (const row of recent || []) {
      for (const tag of extractHashtags((row as any).content)) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const sorted: TrendingTag[] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, posts]) => ({ tag, posts }));
    setTrending(sorted);

    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleFollow(targetId: string) {
    if (!user) { router.push("/(auth)/login" as any); return; }
    await supabase
      .from("follows")
      .upsert({ follower_id: user.id, following_id: targetId }, { onConflict: "follower_id,following_id" });
    setFollowingIds((prev) => {
      const next = new Set(prev);
      next.add(targetId);
      return next;
    });
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Who to follow card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Who to follow</Text>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
        ) : suggested.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>No suggestions right now</Text>
        ) : (
          suggested.map((p) => {
            const isFollowing = followingIds.has(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: p.id } } as any)}
                style={({ hovered }: any) => [
                  styles.suggestRow,
                  { backgroundColor: hovered ? colors.backgroundTertiary : "transparent" },
                ]}
              >
                <Avatar uri={p.avatar_url} name={p.display_name} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {p.display_name}
                    </Text>
                    <VerifiedBadge isVerified={p.is_verified} isOrganizationVerified={p.is_organization_verified} size={12} />
                  </View>
                  <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
                    @{p.handle}
                  </Text>
                </View>
                <Pressable
                  onPress={() => { if (!isFollowing) handleFollow(p.id); }}
                  style={({ hovered }: any) => [
                    styles.followBtn,
                    {
                      backgroundColor: isFollowing ? "transparent" : colors.text,
                      borderColor: isFollowing ? colors.border : colors.text,
                      opacity: hovered ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[
                    styles.followBtnText,
                    { color: isFollowing ? colors.textMuted : colors.background },
                  ]}>
                    {isFollowing ? "Following" : "Follow"}
                  </Text>
                </Pressable>
              </Pressable>
            );
          })
        )}
        <Pressable
          onPress={() => router.push("/user-discovery" as any)}
          style={({ hovered }: any) => [
            styles.showMore,
            { opacity: hovered ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.showMoreText, { color: colors.accent }]}>Show more</Text>
        </Pressable>
      </View>

      {/* Trending card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Trending</Text>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
        ) : trending.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>Nothing trending yet</Text>
        ) : (
          trending.map((t, i) => (
            <Pressable
              key={t.tag}
              onPress={() => router.push({ pathname: "/(tabs)/search", params: { q: `#${t.tag}` } } as any)}
              style={({ hovered }: any) => [
                styles.trendRow,
                { backgroundColor: hovered ? colors.backgroundTertiary : "transparent" },
              ]}
            >
              <Text style={[styles.trendIndex, { color: colors.textMuted }]}>
                {i + 1} · Trending
              </Text>
              <Text style={[styles.trendTag, { color: colors.text }]} numberOfLines={1}>
                #{t.tag}
              </Text>
              <Text style={[styles.trendCount, { color: colors.textMuted }]}>
                {t.posts} {t.posts === 1 ? "post" : "posts"}
              </Text>
            </Pressable>
          ))
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          AfuChat © {new Date().getFullYear()}
        </Text>
        <View style={styles.footerLinks}>
          <Pressable onPress={() => router.push("/terms" as any)}>
            <Text style={[styles.footerLink, { color: colors.textMuted }]}>Terms</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/privacy" as any)}>
            <Text style={[styles.footerLink, { color: colors.textMuted }]}>Privacy</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/about" as any)}>
            <Text style={[styles.footerLink, { color: colors.textMuted }]}>About</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
    width: "100%",
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 6,
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    marginBottom: 6,
  },
  center: { paddingVertical: 16, alignItems: "center" },
  empty: { fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 8 },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontFamily: "Inter_700Bold", fontSize: 14 },
  handle: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  followBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  showMore: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  showMoreText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  trendRow: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    gap: 1,
  },
  trendIndex: { fontFamily: "Inter_400Regular", fontSize: 11 },
  trendTag: { fontFamily: "Inter_700Bold", fontSize: 14 },
  trendCount: { fontFamily: "Inter_400Regular", fontSize: 11 },
  footer: {
    paddingHorizontal: 6,
    paddingTop: 8,
    gap: 4,
  },
  footerText: { fontFamily: "Inter_400Regular", fontSize: 11 },
  footerLinks: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  footerLink: { fontFamily: "Inter_400Regular", fontSize: 11 },
});
