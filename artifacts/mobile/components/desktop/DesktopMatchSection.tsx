import React, { useEffect, useState } from "react";
import {
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
import { Avatar } from "@/components/ui/Avatar";
import {
  DesktopButton,
  DesktopChip,
  DesktopEmptyState,
  DesktopLoadingState,
  DesktopPageHeader,
  DesktopPanel,
  DesktopSectionShell,
  useDesktopTheme,
  useHover,
} from "./ui";

const MATCH_PINK = "#FF2D55";
const MATCH_PINK_2 = "#FF6B8A";

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

function StatPill({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
}) {
  const t = useDesktopTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: t.chipBg,
        borderColor: t.border,
        borderWidth: StyleSheet.hairlineWidth,
      }}
    >
      <Ionicons name={icon} size={13} color={t.textMuted} />
      <Text
        style={{
          fontSize: 12,
          fontFamily: "Inter_500Medium",
          color: t.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function ProfileCard({
  profile,
  status,
  onLike,
  onPass,
}: {
  profile: MatchProfile;
  status: MatchStatus;
  onLike: () => void;
  onPass: () => void;
}) {
  const t = useDesktopTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.panelBgRaised,
          borderColor: t.border,
          ...(t.isDark
            ? {}
            : { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14 }),
        },
      ]}
    >
      <Avatar
        uri={profile.avatar_url}
        name={profile.display_name}
        size={108}
        style={{ borderRadius: 18, alignSelf: "center", marginBottom: 14 }}
      />

      <View style={{ alignItems: "center", marginBottom: 10 }}>
        <Text style={[styles.cardName, { color: t.text }]}>
          {profile.display_name}
          {profile.age ? `, ${profile.age}` : ""}
        </Text>
        <Text style={[styles.cardHandle, { color: t.textMuted }]}>
          @{profile.handle}
        </Text>
      </View>

      {(profile.location || profile.is_verified) && (
        <View style={styles.statsRow}>
          {profile.location && (
            <StatPill icon="location-outline" label={profile.location} />
          )}
          {profile.is_verified && (
            <StatPill icon="checkmark-circle" label="Verified" />
          )}
        </View>
      )}

      {(profile.match_bio || profile.bio) && (
        <Text style={[styles.cardBio, { color: t.textMuted }]} numberOfLines={3}>
          {profile.match_bio || profile.bio}
        </Text>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity
          onPress={onPass}
          activeOpacity={0.85}
          style={[
            styles.actionBtn,
            { backgroundColor: t.chipBg, borderColor: t.border },
          ]}
        >
          <Ionicons name="close" size={24} color={t.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() =>
            router.push(`/match/view-profile?id=${profile.id}` as any)
          }
          activeOpacity={0.85}
          style={[
            styles.viewBtn,
            { backgroundColor: t.accent + "14", borderColor: t.accent + "40" },
          ]}
        >
          <Text style={[styles.viewBtnLabel, { color: t.accent }]}>
            View Profile
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onLike}
          activeOpacity={0.85}
          style={[
            styles.actionBtn,
            status === "liked"
              ? { backgroundColor: MATCH_PINK, borderColor: MATCH_PINK }
              : {
                  backgroundColor: MATCH_PINK + "14",
                  borderColor: MATCH_PINK + "40",
                },
          ]}
        >
          <Ionicons
            name={status === "liked" ? "heart" : "heart-outline"}
            size={24}
            color={status === "liked" ? "#fff" : MATCH_PINK}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SideLink({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
}) {
  const t = useDesktopTheme();
  const [hovered, hp] = useHover();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 11,
        paddingHorizontal: 10,
        borderRadius: 9,
        backgroundColor: hovered ? t.rowHover : "transparent",
      }}
      {...(hp as any)}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          backgroundColor: MATCH_PINK + "14",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={15} color={MATCH_PINK} />
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          fontFamily: "Inter_500Medium",
          color: t.text,
        }}
      >
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={t.textMuted} />
    </TouchableOpacity>
  );
}

export function DesktopMatchSection() {
  const t = useDesktopTheme();
  const { user } = useAuth();

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
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await supabase
        .from("match_profiles")
        .select(
          "user_id, match_bio, age, location, profiles!inner(id, display_name, handle, avatar_url, bio, is_verified)",
        )
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
    await supabase
      .from("match_likes")
      .upsert(
        { liker_id: user.id, liked_id: p.id },
        { onConflict: "liker_id,liked_id" },
      );
    setTimeout(() => next(), 600);
  }

  function next() {
    setIndex((i) => i + 1);
  }

  if (!user) {
    return (
      <DesktopSectionShell>
        <DesktopPanel flex={1}>
          <DesktopEmptyState
            icon="heart"
            title="AfuMatch"
            subtitle="Sign in to discover meaningful connections."
            action={{
              label: "Sign In",
              onPress: () => router.push("/(auth)/login" as any),
            }}
          />
        </DesktopPanel>
      </DesktopSectionShell>
    );
  }

  if (!matchEnabled) {
    return (
      <DesktopSectionShell>
        <DesktopPanel flex={1}>
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: 36,
              gap: 14,
            }}
          >
            <LinearGradient
              colors={[MATCH_PINK, MATCH_PINK_2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bigIcon}
            >
              <Ionicons name="heart" size={36} color="#fff" />
            </LinearGradient>
            <Text style={[styles.emptyTitle, { color: t.text }]}>
              You're not on AfuMatch yet
            </Text>
            <Text style={[styles.emptySub, { color: t.textMuted }]}>
              Set up your match profile to start discovering meaningful
              connections.
            </Text>
            <DesktopButton
              label="Join AfuMatch"
              icon="heart"
              onPress={() => router.push("/match/onboarding" as any)}
              style={{ backgroundColor: MATCH_PINK, marginTop: 6 }}
            />
            <TouchableOpacity
              onPress={() => router.push("/match" as any)}
              activeOpacity={0.85}
              style={{ marginTop: 4 }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Inter_500Medium",
                  color: t.accent,
                }}
              >
                Learn more →
              </Text>
            </TouchableOpacity>
          </View>
        </DesktopPanel>
      </DesktopSectionShell>
    );
  }

  return (
    <DesktopSectionShell>
      <View style={{ flex: 1, flexDirection: "row", gap: 14 }}>
        {/* Left: cards */}
        <DesktopPanel flex={1}>
          <DesktopPageHeader
            icon="heart"
            title="AfuMatch"
            subtitle="Discover meaningful connections"
            right={
              <DesktopButton
                label="Preferences"
                icon="options-outline"
                variant="secondary"
                size="sm"
                onPress={() => router.push("/match/preferences" as any)}
              />
            }
          />
          {loading ? (
            <DesktopLoadingState />
          ) : profiles.length === 0 || index >= profiles.length ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                padding: 36,
                gap: 14,
              }}
            >
              <View
                style={[
                  styles.bigIcon,
                  { backgroundColor: MATCH_PINK + "18" },
                ]}
              >
                <Ionicons
                  name="heart-dislike-outline"
                  size={36}
                  color={MATCH_PINK}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: t.text }]}>
                No more profiles
              </Text>
              <Text style={[styles.emptySub, { color: t.textMuted }]}>
                Check back later, or adjust your preferences.
              </Text>
              <DesktopButton
                label="Refresh"
                icon="refresh"
                onPress={() => {
                  setIndex(0);
                  loadProfiles();
                }}
                style={{ backgroundColor: MATCH_PINK }}
              />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{
                padding: 22,
                gap: 14,
                alignItems: "center",
              }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ width: "100%", maxWidth: 480 }}>
                <ProfileCard
                  profile={profiles[index]}
                  status={statuses[profiles[index].id] ?? "none"}
                  onLike={handleLike}
                  onPass={next}
                />
              </View>

              {profiles[index + 1] && (
                <TouchableOpacity
                  onPress={next}
                  activeOpacity={0.85}
                  style={{ width: "100%", maxWidth: 480 }}
                >
                  <View
                    style={[
                      styles.nextPreview,
                      {
                        backgroundColor: t.panelBgRaised,
                        borderColor: t.border,
                      },
                    ]}
                  >
                    <Avatar
                      uri={profiles[index + 1].avatar_url}
                      name={profiles[index + 1].display_name}
                      size={36}
                    />
                    <Text style={[styles.nextName, { color: t.text }]}>
                      {profiles[index + 1].display_name}
                    </Text>
                    <DesktopChip label="Skip" icon="arrow-forward" />
                  </View>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </DesktopPanel>

        {/* Right: side rail */}
        <DesktopPanel style={{ width: 280 }}>
          <DesktopPageHeader
            title="Match Hub"
            compact
            border
          />
          <View style={{ padding: 8 }}>
            <SideLink
              label="My Matches"
              icon="heart"
              onPress={() => router.push("/match/index" as any)}
            />
            <SideLink
              label="My Profile"
              icon="person-circle"
              onPress={() => router.push("/match/profile" as any)}
            />
            <SideLink
              label="Preferences"
              icon="options"
              onPress={() => router.push("/match/preferences" as any)}
            />
            <SideLink
              label="Settings"
              icon="settings-outline"
              onPress={() => router.push("/match/settings" as any)}
            />
          </View>

          <View style={{ padding: 14 }}>
            <View style={styles.tipCard}>
              <LinearGradient
                colors={[MATCH_PINK, MATCH_PINK_2]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tipGrad}
              >
                <Ionicons name="bulb" size={20} color="#fff" />
                <Text style={styles.tipTitle}>Pro tip</Text>
                <Text style={styles.tipText}>
                  Add more photos and a detailed bio to get 3× more matches.
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/match/profile" as any)}
                  activeOpacity={0.85}
                  style={styles.tipBtn}
                >
                  <Text style={styles.tipBtnLabel}>Update Profile</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </DesktopPanel>
      </View>
    </DesktopSectionShell>
  );
}

const styles = StyleSheet.create<any>({
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
  },
  cardName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  cardHandle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  cardBio: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 16,
    textAlign: "center",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    justifyContent: "center",
  },
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
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nextName: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },

  tipCard: { borderRadius: 14, overflow: "hidden" },
  tipGrad: { padding: 16, gap: 6 },
  tipTitle: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  tipText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  tipBtn: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  tipBtnLabel: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  bigIcon: {
    width: 80,
    height: 80,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 13.5,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 360,
  },
});
