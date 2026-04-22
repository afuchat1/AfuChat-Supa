import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";

const MATCH_PINK = "#FF2D55";

type MatchProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  match_bio?: string | null;
  age?: number | null;
  location?: string | null;
  is_verified?: boolean;
};

type MatchStatus = "none" | "liked" | "matched";

function StatPill({ icon, label, colors }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; colors: any }) {
  return (
    <View style={[styles.statPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={icon} size={13} color={colors.textMuted} />
      <Text style={[styles.statPillLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function ProfileCard({
  profile,
  status,
  onLike,
  onPass,
  colors,
  accent,
}: {
  profile: MatchProfile;
  status: MatchStatus;
  onLike: () => void;
  onPass: () => void;
  colors: any;
  accent: string;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Avatar uri={profile.avatar_url} name={profile.display_name} size={100} style={{ borderRadius: 16, alignSelf: "center", marginBottom: 14 }} />

      <View style={{ alignItems: "center", marginBottom: 10 }}>
        <Text style={[styles.cardName, { color: colors.text }]}>
          {profile.display_name}
          {profile.age ? `, ${profile.age}` : ""}
        </Text>
        <Text style={[styles.cardHandle, { color: colors.textMuted }]}>@{profile.handle}</Text>
      </View>

      <View style={styles.statsRow}>
        {profile.location && <StatPill icon="location-outline" label={profile.location} colors={colors} />}
        {profile.is_verified && <StatPill icon="checkmark-circle" label="Verified" colors={colors} />}
      </View>

      {(profile.match_bio || profile.bio) && (
        <Text style={[styles.cardBio, { color: colors.textMuted }]} numberOfLines={3}>
          {profile.match_bio || profile.bio}
        </Text>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity
          onPress={onPass}
          activeOpacity={0.8}
          style={[styles.actionBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
        >
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push(`/match/view-profile?id=${profile.id}` as any)}
          activeOpacity={0.8}
          style={[styles.viewBtn, { backgroundColor: accent + "14", borderColor: accent + "40" }]}
        >
          <Text style={[styles.viewBtnLabel, { color: accent }]}>View Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onLike}
          activeOpacity={0.8}
          style={[
            styles.actionBtn,
            status === "liked"
              ? { backgroundColor: MATCH_PINK, borderColor: MATCH_PINK }
              : { backgroundColor: MATCH_PINK + "14", borderColor: MATCH_PINK + "40" },
          ]}
        >
          <Ionicons name={status === "liked" ? "heart" : "heart-outline"} size={24} color={MATCH_PINK} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function DesktopMatchSection() {
  const { colors, accent } = useTheme();
  const { user, profile } = useAuth();

  const [profiles, setProfiles] = useState<MatchProfile[]>([]);
  const [index, setIndex] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, MatchStatus>>({});
  const [loading, setLoading] = useState(true);
  const [matchEnabled, setMatchEnabled] = useState(false);

  useEffect(() => {
    if (!user) return;
    checkMatchProfile();
    loadProfiles();
  }, [user?.id]);

  async function checkMatchProfile() {
    if (!user) return;
    const { data } = await supabase
      .from("match_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    setMatchEnabled(!!data);
  }

  async function loadProfiles() {
    if (!user) { setLoading(false); return; }
    try {
      // Get users with match profiles
      const { data } = await supabase
        .from("match_profiles")
        .select("user_id, match_bio, age, location, profiles!inner(id, display_name, handle, avatar_url, bio, is_verified)")
        .neq("user_id", user.id)
        .limit(20);

      if (data) {
        const mapped: MatchProfile[] = data.map((row: any) => ({
          id: row.profiles.id,
          display_name: row.profiles.display_name,
          handle: row.profiles.handle,
          avatar_url: row.profiles.avatar_url,
          bio: row.profiles.bio,
          match_bio: row.match_bio,
          age: row.age,
          location: row.location,
          is_verified: row.profiles.is_verified,
        }));
        setProfiles(mapped);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLike() {
    const p = profiles[index];
    if (!p || !user) return;
    setStatuses((s) => ({ ...s, [p.id]: "liked" }));
    await supabase.from("match_likes").upsert({ liker_id: user.id, liked_id: p.id }, { onConflict: "liker_id,liked_id" });
    setTimeout(() => next(), 600);
  }

  function next() {
    setIndex((i) => i + 1);
  }

  if (!user) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <LinearGradient colors={[MATCH_PINK, "#FF6B8A"]} style={styles.bigIcon}>
          <Ionicons name="heart" size={40} color="#fff" />
        </LinearGradient>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>AfuMatch</Text>
        <Text style={[styles.emptySub, { color: colors.textMuted }]}>Sign in to discover connections</Text>
        <TouchableOpacity
          onPress={() => router.push("/(auth)/login" as any)}
          activeOpacity={0.85}
          style={[styles.primaryBtn, { backgroundColor: MATCH_PINK }]}
        >
          <Text style={styles.primaryBtnLabel}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!matchEnabled) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <LinearGradient colors={[MATCH_PINK, "#FF6B8A"]} style={styles.bigIcon}>
          <Ionicons name="heart" size={40} color="#fff" />
        </LinearGradient>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>You're not on AfuMatch yet</Text>
        <Text style={[styles.emptySub, { color: colors.textMuted }]}>
          Set up your match profile to start discovering meaningful connections.
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/match/onboarding" as any)}
          activeOpacity={0.85}
          style={[styles.primaryBtn, { backgroundColor: MATCH_PINK }]}
        >
          <Ionicons name="heart" size={16} color="#fff" />
          <Text style={styles.primaryBtnLabel}>Join AfuMatch</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/match" as any)} activeOpacity={0.8} style={{ marginTop: 10 }}>
          <Text style={[styles.linkLabel, { color: accent }]}>Learn more →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <LinearGradient colors={[MATCH_PINK, "#FF6B8A"]} style={styles.headerIcon}>
          <Ionicons name="heart" size={18} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>AfuMatch</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Discover meaningful connections</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/match/preferences" as any)}
          activeOpacity={0.8}
          style={[styles.prefBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
        >
          <Ionicons name="options-outline" size={16} color={colors.text} />
          <Text style={[styles.prefBtnLabel, { color: colors.text }]}>Preferences</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Cards column */}
        <View style={styles.cardsCol}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={MATCH_PINK} size="large" />
            </View>
          ) : profiles.length === 0 || index >= profiles.length ? (
            <View style={styles.center}>
              <View style={[styles.bigIcon, { backgroundColor: MATCH_PINK + "18" }]}>
                <Ionicons name="heart-dislike-outline" size={40} color={MATCH_PINK} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No more profiles</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                Check back later for new connections, or adjust your preferences.
              </Text>
              <TouchableOpacity
                onPress={() => { setIndex(0); loadProfiles(); }}
                activeOpacity={0.8}
                style={[styles.primaryBtn, { backgroundColor: MATCH_PINK }]}
              >
                <Text style={styles.primaryBtnLabel}>Refresh</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} showsVerticalScrollIndicator={false}>
              <ProfileCard
                profile={profiles[index]}
                status={statuses[profiles[index].id] ?? "none"}
                onLike={handleLike}
                onPass={next}
                colors={colors}
                accent={MATCH_PINK}
              />
              {/* Stack preview of next */}
              {profiles[index + 1] && (
                <TouchableOpacity onPress={next} activeOpacity={0.85}>
                  <View style={[styles.nextPreview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Avatar uri={profiles[index + 1].avatar_url} name={profiles[index + 1].display_name} size={36} />
                    <Text style={[styles.nextName, { color: colors.text }]}>{profiles[index + 1].display_name}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>

        {/* Right sidebar: quick links */}
        <View style={[styles.rightSide, { borderLeftColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.sideTitle, { color: colors.textMuted }]}>AfuMatch</Text>
          {[
            { label: "My Matches",    icon: "heart" as const,          route: "/match/index" },
            { label: "My Profile",    icon: "person-circle" as const,   route: "/match/profile" },
            { label: "Preferences",   icon: "options" as const,         route: "/match/preferences" },
            { label: "Settings",      icon: "settings-outline" as const, route: "/match/settings" },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.8}
              style={[styles.sideLink, { borderBottomColor: colors.border }]}
            >
              <View style={[styles.sideLinkIcon, { backgroundColor: MATCH_PINK + "14" }]}>
                <Ionicons name={item.icon} size={15} color={MATCH_PINK} />
              </View>
              <Text style={[styles.sideLinkLabel, { color: colors.text }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          ))}

          <View style={styles.tipCard}>
            <LinearGradient colors={[MATCH_PINK, "#FF6B8A"]} style={styles.tipGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="bulb" size={20} color="#fff" />
              <Text style={styles.tipTitle}>Pro tip</Text>
              <Text style={styles.tipText}>Add more photos and a detailed bio to get 3x more matches!</Text>
              <TouchableOpacity onPress={() => router.push("/match/profile" as any)} activeOpacity={0.8} style={styles.tipBtn}>
                <Text style={styles.tipBtnLabel}>Update Profile</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create<any>({
  root: { flex: 1, flexDirection: "column" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },

  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  prefBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  prefBtnLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },

  content: { flex: 1, flexDirection: "row" },

  cardsCol: { flex: 1 },

  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  cardHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statPillLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardBio: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 16 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center" },
  actionBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  viewBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  viewBtnLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  nextPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nextName: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },

  rightSide: {
    width: 260,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingTop: 20,
    paddingHorizontal: 12,
  },
  sideTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  sideLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sideLinkIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sideLinkLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },

  tipCard: { marginTop: 20, borderRadius: 14, overflow: "hidden" },
  tipGrad: { padding: 16, gap: 6 },
  tipTitle: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  tipText: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, fontFamily: "Inter_400Regular", lineHeight: 18 },
  tipBtn: { marginTop: 8, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, alignSelf: "flex-start" },
  tipBtnLabel: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  bigIcon: {
    width: 80,
    height: 80,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, maxWidth: 340 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 4,
  },
  primaryBtnLabel: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  linkLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
