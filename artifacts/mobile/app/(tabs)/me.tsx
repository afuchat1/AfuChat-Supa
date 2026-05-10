import React, { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MeTabSkeleton } from "@/components/ui/Skeleton";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { showAlert } from "@/lib/alert";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarViewer } from "@/components/ui/AvatarViewer";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import Colors from "@/constants/colors";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { PrestigeBadge } from "@/components/ui/PrestigeBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassMenuSection, GlassMenuItem, GlassMenuSeparator } from "@/components/ui/GlassMenuItem";

// ─── Profile completion bar ───────────────────────────────────────────────────
type ProfileFields = {
  avatar_url?: string | null; bio?: string | null; country?: string | null;
  website_url?: string | null; display_name?: string | null; handle?: string | null;
};

function ProfileCompletionBar({ profile, isPremium }: { profile: ProfileFields | null; isPremium: boolean }) {
  const { colors, isDark } = useTheme();
  const fillAnim = useSharedValue(0);

  const checks = [
    { label: "Avatar",  done: !!profile?.avatar_url },
    { label: "Bio",     done: !!profile?.bio },
    { label: "Country", done: !!profile?.country },
    { label: "Website", done: !!profile?.website_url },
    { label: "Premium", done: isPremium },
  ];
  const score = checks.filter((c) => c.done).length;
  const pct   = score / checks.length;

  useEffect(() => {
    fillAnim.value = withDelay(400, withTiming(pct, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [pct]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fillAnim.value * 100}%` as any }));

  if (score === checks.length) return null;

  return (
    <GlassCard style={{ borderRadius: 16, overflow: "hidden" }} variant="subtle" noShadow>
      <TouchableOpacity
        style={{ padding: 16 }}
        onPress={() => router.push("/profile/edit")}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Profile Completion</Text>
          <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 13 }}>{Math.round(pct * 100)}%</Text>
        </View>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <Animated.View style={[{ height: "100%", borderRadius: 3, overflow: "hidden" }, fillStyle]}>
            <LinearGradient colors={[colors.accent, Colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          {checks.map((c) => (
            <View key={c.label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name={c.done ? "checkmark-circle" : "ellipse-outline"} size={13} color={c.done ? "#34C759" : colors.textMuted} />
              <Text style={{ color: c.done ? colors.textSecondary : colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" }}>{c.label}</Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    </GlassCard>
  );
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function MeScreen() {
  const { colors, isDark, accent } = useTheme();
  const { profile, isPremium, subscription, loading, user } = useAuth();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [hasCompanyPage, setHasCompanyPage] = useState(false);
  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(true);
  const [hasVerifApp, setHasVerifApp] = useState(false);
  const [isOrgPageVerified, setIsOrgPageVerified] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const isAdmin = !!profile?.is_admin;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
      supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", user.id),
    ]).then(([{ count: fc }, { count: fgc }, { count: pc }]) => {
      setFollowerCount(fc ?? 0); setFollowingCount(fgc ?? 0); setPostCount(pc ?? 0);
    });
    Promise.all([
      supabase.from("organization_pages").select("id, is_verified", { count: "exact" }).eq("admin_id", user.id),
      supabase.from("business_verification_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]).then(([{ data: pageData, count: pageCount }, { count: appCount }]) => {
      setHasCompanyPage((pageCount ?? 0) > 0);
      setHasVerifApp((appCount ?? 0) > 0);
      setIsOrgPageVerified(!!(pageData && (pageData as any[]).some((p: any) => p.is_verified)));
    });
    AsyncStorage.getItem("afu_verify_business_banner_dismissed").then((val) => {
      setVerifyBannerDismissed(val === "1");
    });
  }, [user?.id]);

  const dismissVerifyBanner = useCallback(() => {
    setVerifyBannerDismissed(true);
    AsyncStorage.setItem("afu_verify_business_banner_dismissed", "1");
  }, []);

  if (!loading && !profile) return <Redirect href="/discover" />;

  if (loading || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }}>
        <MeTabSkeleton />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
      <OfflineBanner />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 88 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile card ──────────────────────────────────────────────── */}
        <GlassCard style={styles.profileCard} variant="medium">
          <TouchableOpacity
            style={styles.profileCardInner}
            onPress={() => router.push("/profile/edit")}
            activeOpacity={0.8}
          >
            <TouchableOpacity activeOpacity={0.85} onPress={() => setAvatarOpen(true)}>
              <Avatar
                uri={profile?.avatar_url} name={profile?.display_name} size={70}
                premium={isPremium} square={!!(profile?.is_organization_verified || profile?.is_business_mode)}
              />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                  {profile?.display_name || "User"}
                </Text>
                <VerifiedBadge isVerified={profile?.is_verified} isOrganizationVerified={profile?.is_organization_verified} size={18} />
                {isPremium && (
                  <View style={styles.premiumBadge}>
                    <Ionicons name="diamond" size={11} color="#fff" />
                  </View>
                )}
              </View>
              <PrestigeBadge acoin={profile?.acoin || 0} size="md" showLabel />
              <Text style={[styles.profileHandle, { color: colors.textMuted }]}>
                @{profile?.handle || "handle"}
              </Text>
              {profile?.is_organization_verified && (
                <View style={styles.businessTag}>
                  <Ionicons name="briefcase" size={10} color="#fff" />
                  <Text style={styles.businessTagText}>Business</Text>
                </View>
              )}
              {profile?.bio ? (
                <Text style={[styles.profileBio, { color: colors.textMuted }]} numberOfLines={1}>
                  {profile.bio}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </GlassCard>

        {/* ── View public profile ──────────────────────────────────────── */}
        {profile?.id && (
          <GlassCard style={styles.viewProfileBtn} variant="subtle" noShadow>
            <TouchableOpacity
              style={styles.viewProfileInner}
              activeOpacity={0.75}
              onPress={() => router.push({ pathname: "/contact/[id]", params: { id: profile.id, init_name: profile.display_name ?? "", init_handle: profile.handle ?? "", init_avatar: profile.avatar_url ?? "" } })}
            >
              <Ionicons name="person-circle-outline" size={17} color={colors.accent} />
              <Text style={[styles.viewProfileText, { color: colors.accent }]}>View public profile</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accent} style={{ marginLeft: "auto" }} />
            </TouchableOpacity>
          </GlassCard>
        )}

        {/* ── Social stats ─────────────────────────────────────────────── */}
        <GlassCard style={styles.statsCard} variant="medium">
          {[
            { label: "Followers", count: followerCount, onPress: () => profile?.id && router.push({ pathname: "/followers", params: { userId: profile.id, type: "followers", ownerHandle: profile.handle } } as any) },
            { label: "Following", count: followingCount, onPress: () => profile?.id && router.push({ pathname: "/followers", params: { userId: profile.id, type: "following", ownerHandle: profile.handle } } as any) },
            { label: "Posts",     count: postCount,      onPress: () => profile?.id && router.push({ pathname: "/contact/[id]", params: { id: profile.id, init_name: profile.display_name ?? "", init_handle: profile.handle ?? "", init_avatar: profile.avatar_url ?? "" } }) },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={[styles.statDivider, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)" }]} />}
              <TouchableOpacity style={styles.statCell} activeOpacity={0.7} onPress={s.onPress}>
                <Text style={[styles.statValue, { color: colors.text }]}>{fmtCount(s.count)}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </GlassCard>

        {/* ── Profile completion ───────────────────────────────────────── */}
        <ProfileCompletionBar profile={profile} isPremium={isPremium} />

        {/* ── Business verify banner ───────────────────────────────────── */}
        {hasCompanyPage && !profile?.is_organization_verified && !isOrgPageVerified && !hasVerifApp && !verifyBannerDismissed && (
          <GlassCard style={{ borderRadius: 16, overflow: "hidden" }} variant="subtle">
            <LinearGradient
              colors={["rgba(212,168,83,0.20)", "rgba(212,168,83,0.06)"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.verifyBannerInner}>
              <View style={styles.verifyBannerLeft}>
                <View style={styles.verifyIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={22} color="#D4A853" />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.verifyTitle}>Verify your business</Text>
                  <Text style={styles.verifySub}>Stand out with the gold badge — it builds trust with followers.</Text>
                  <TouchableOpacity style={styles.verifyBtn} onPress={() => router.push("/company" as any)} activeOpacity={0.85}>
                    <Ionicons name="checkmark-circle-outline" size={13} color="#fff" />
                    <Text style={styles.verifyBtnText}>Go to Company Pages</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity hitSlop={12} onPress={dismissVerifyBanner} style={{ padding: 2, marginTop: -2 }}>
                <Ionicons name="close" size={17} color="#D4A85380" />
              </TouchableOpacity>
            </View>
          </GlassCard>
        )}

        {/* ── Premium banner ───────────────────────────────────────────── */}
        {!isPremium && (
          <TouchableOpacity onPress={() => router.push("/premium")} activeOpacity={0.85}>
            <LinearGradient
              colors={["#1a1a2e", "#16213e", "#0f3460"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.premiumBanner}
            >
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,214,10,0.06)", borderRadius: 16 }]} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={styles.premiumIconWrap}>
                  <Ionicons name="diamond" size={24} color="#FFD60A" />
                </View>
                <View>
                  <Text style={styles.premiumTitle}>Upgrade to Premium</Text>
                  <Text style={styles.premiumSub}>Pay with ACoin for badges, linked accounts & more</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* ── Menu sections ─────────────────────────────────────────────── */}
        <GlassMenuSection>
          <GlassMenuItem icon="business-outline" iconBg={["#00BCD4", "#0097A7"]} label="Company Pages" onPress={() => router.push("/company" as any)} />
        </GlassMenuSection>

        <GlassMenuSection>
          <GlassMenuItem icon="trophy" iconBg={["#D4A853", "#B8902A"]} label="Prestige Status" badge="NEW" badgeColor="#D4A853" onPress={() => router.push("/prestige")} />
          {isAdmin && (
            <>
              <GlassMenuSeparator />
              <GlassMenuItem icon="videocam-outline" iconBg={["#32D74B", "#25A83A"]} label="Creator Studio" badge="Admin" badgeColor={colors.accent} onPress={() => router.push("/monetize")} />
            </>
          )}
        </GlassMenuSection>

        <GlassMenuSection>
          <GlassMenuItem icon="person-add-outline" iconBg={["#00BCD4", "#0097A7"]} label="Find People" badge="NEW" badgeColor={colors.accent} onPress={() => router.push("/user-discovery")} />
        </GlassMenuSection>

        <GlassMenuSection>
          <GlassMenuItem
            icon="diamond-outline" iconBg={["#FFD60A", "#F0C000"]}
            label="Premium"
            value={isPremium ? `Active (${subscription?.plan_tier})` : ""}
            onPress={() => router.push("/premium")}
          />
        </GlassMenuSection>

        <GlassMenuSection>
          <GlassMenuItem icon="sparkles-outline" iconBg={["#BF5AF2", "#9B3FD5"]} label="Advanced Features" onPress={() => router.push("/advanced-features")} />
          <GlassMenuSeparator />
          <GlassMenuItem icon="settings-outline" iconBg={["#636366", "#48484A"]} label="Settings" onPress={() => router.push("/settings")} />
          <GlassMenuSeparator />
          <GlassMenuItem icon="help-buoy-outline" iconBg={["#5856D6", "#3D3BAA"]} label="Support Center" onPress={() => router.push("/support" as any)} />
          <GlassMenuSeparator />
          <GlassMenuItem icon="information-circle-outline" iconBg={["#007AFF", "#0055FF"]} label="About AfuChat" onPress={() => router.push("/about" as any)} />
        </GlassMenuSection>

        {(profile?.is_admin || profile?.is_support_staff) && (
          <GlassMenuSection>
            <GlassMenuItem icon="headset-outline" iconBg={["#FF6B35", "#E05020"]} label="Support Dashboard" badge="Staff" badgeColor="#FF6B35" onPress={() => router.push("/admin/support-dashboard" as any)} />
            {profile?.is_admin && (
              <>
                <GlassMenuSeparator />
                <GlassMenuItem icon="shield-checkmark" iconBg={[colors.accent, "#0097A7"]} label="Admin Dashboard" badge="Admin" badgeColor={colors.accent} onPress={() => router.push("/admin")} />
              </>
            )}
          </GlassMenuSection>
        )}
      </ScrollView>

      <AvatarViewer
        visible={avatarOpen} uri={profile?.avatar_url}
        name={profile?.display_name || undefined} onClose={() => setAvatarOpen(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  content: { gap: 14, paddingHorizontal: 16 },

  profileCard: { borderRadius: 20, overflow: "hidden" },
  profileCardInner: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  profileHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  profileBio: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  premiumBadge: { backgroundColor: "#FFD60A", width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  businessTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.gold, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 4, alignSelf: "flex-start" },
  businessTagText: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },

  viewProfileBtn: { borderRadius: 12, overflow: "hidden" },
  viewProfileInner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11 },
  viewProfileText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  statsCard: { borderRadius: 16, overflow: "hidden", flexDirection: "row", paddingVertical: 16, paddingHorizontal: 8 },
  statCell: { flex: 1, alignItems: "center", gap: 3 },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },

  premiumBanner: { borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  premiumIconWrap: { width: 46, height: 46, borderRadius: 14, backgroundColor: "rgba(255,214,10,0.15)", alignItems: "center", justifyContent: "center" },
  premiumTitle: { color: "#FFD60A", fontSize: 15, fontFamily: "Inter_700Bold" },
  premiumSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  verifyBannerInner: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14 },
  verifyBannerLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  verifyIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(212,168,83,0.20)", alignItems: "center", justifyContent: "center", marginTop: 2 },
  verifyTitle: { color: "#D4A853", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  verifySub: { color: "#888", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  verifyBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#D4A853", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginTop: 8 },
  verifyBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
