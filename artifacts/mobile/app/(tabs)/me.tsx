import React, { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MeTabSkeleton } from "@/components/ui/Skeleton";
import { Redirect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarViewer } from "@/components/ui/AvatarViewer";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import Colors from "@/constants/colors";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { PrestigeBadge } from "@/components/ui/PrestigeBadge";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtAcoin(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Flat Menu Item ───────────────────────────────────────────────────────────

type MenuItemProps = {
  icon: string;
  iconColor: string;
  label: string;
  value?: string;
  badge?: string;
  badgeColor?: string;
  onPress: () => void;
  showSeparator?: boolean;
  colors: any;
  destructive?: boolean;
};

function MenuItem({ icon, iconColor, label, value, badge, badgeColor, onPress, showSeparator, colors, destructive }: MenuItemProps) {
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  }
  function onPressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  }

  return (
    <>
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          style={mi.row}
          onPress={() => { Haptics.selectionAsync(); onPress(); }}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          activeOpacity={1}
        >
          <View style={[mi.iconWrap, { backgroundColor: iconColor + "18" }]}>
            <Ionicons name={icon as any} size={19} color={iconColor} />
          </View>
          <Text style={[mi.label, { color: destructive ? "#FF3B30" : colors.text }]} numberOfLines={1}>
            {label}
          </Text>
          <View style={mi.right}>
            {!!value && (
              <Text style={[mi.value, { color: colors.textMuted }]} numberOfLines={1}>{value}</Text>
            )}
            {!!badge && (
              <View style={[mi.badge, { backgroundColor: (badgeColor || colors.accent) + "20" }]}>
                <Text style={[mi.badgeText, { color: badgeColor || colors.accent }]}>{badge}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted + "80"} />
          </View>
        </TouchableOpacity>
      </Animated.View>
      {showSeparator && <View style={[mi.sep, { backgroundColor: colors.border }]} />}
    </>
  );
}

const mi = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  right: { flexDirection: "row", alignItems: "center", gap: 6 },
  value: { fontSize: 13, fontFamily: "Inter_400Regular" },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
});

// ─── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({ label, colors }: { label: string; colors: any }) {
  return (
    <Text style={[sl.text, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
  );
}
const sl = StyleSheet.create({
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 6, marginLeft: 4 },
});

// ─── Menu Card ────────────────────────────────────────────────────────────────

function MenuCard({ children, colors }: { children: React.ReactNode; colors: any }) {
  return (
    <View style={[mc.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}
const mc = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
});

// ─── Profile completion bar ───────────────────────────────────────────────────

type ProfileFields = {
  avatar_url?: string | null; bio?: string | null; country?: string | null;
  website_url?: string | null; display_name?: string | null; handle?: string | null;
};

function ProfileCompletionBar({ profile, isPremium, colors, accent }: { profile: ProfileFields | null; isPremium: boolean; colors: any; accent: string }) {
  const fillAnim = useRef(new Animated.Value(0)).current;

  const checks = [
    { label: "Photo",   done: !!profile?.avatar_url },
    { label: "Bio",     done: !!profile?.bio },
    { label: "Country", done: !!profile?.country },
    { label: "Website", done: !!profile?.website_url },
    { label: "Premium", done: isPremium },
  ];
  const score = checks.filter((c) => c.done).length;
  const pct   = score / checks.length;

  useEffect(() => {
    Animated.timing(fillAnim, { toValue: pct, duration: 900, delay: 400, useNativeDriver: false }).start();
  }, [pct]);

  if (score === checks.length) return null;

  return (
    <View>
      <SectionLabel label="Profile" colors={colors} />
      <MenuCard colors={colors}>
        <TouchableOpacity style={pc.wrap} onPress={() => router.push("/profile/edit")} activeOpacity={0.8}>
          <View style={pc.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={[pc.title, { color: colors.text }]}>Complete your profile</Text>
              <Text style={[pc.sub, { color: colors.textMuted }]}>{score} of {checks.length} steps done</Text>
            </View>
            <View style={[pc.pctBubble, { backgroundColor: accent + "18" }]}>
              <Text style={[pc.pctText, { color: accent }]}>{Math.round(pct * 100)}%</Text>
            </View>
          </View>
          <View style={[pc.track, { backgroundColor: colors.border }]}>
            <Animated.View
              style={[pc.fill, { backgroundColor: accent, width: fillAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
            />
          </View>
          <View style={pc.checks}>
            {checks.map((c) => (
              <View key={c.label} style={pc.checkItem}>
                <Ionicons name={c.done ? "checkmark-circle" : "ellipse-outline"} size={14} color={c.done ? "#34C759" : colors.border} />
                <Text style={[pc.checkLabel, { color: c.done ? colors.textSecondary : colors.textMuted }]}>{c.label}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>
      </MenuCard>
    </View>
  );
}
const pc = StyleSheet.create({
  wrap: { padding: 14, gap: 10 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pctBubble: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  pctText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2 },
  checks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  checkLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

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

  type PurchaseInfo = {
    handle: string;
    price: number;
    purchasedAt: string;
    sellerHandle: string | null;
  };
  const [purchasePopup, setPurchasePopup] = useState<PurchaseInfo | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  async function showHandlePurchase(handle: string) {
    void Haptics.selectionAsync();
    setPurchaseLoading(true);
    const { data } = await supabase
      .from("username_listings")
      .select("price, created_at, seller_id, profiles!username_listings_seller_id_fkey(handle)")
      .eq("username", handle)
      .not("sold_to_id", "is", null)
      .maybeSingle();
    setPurchaseLoading(false);
    if (!data) {
      return;
    }
    setPurchasePopup({
      handle,
      price: (data as any).price ?? 0,
      purchasedAt: (data as any).created_at ?? "",
      sellerHandle: (data as any).profiles?.handle ?? null,
    });
  }

  function fmtDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

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

  const acoin = profile?.acoin || 0;
  const showBusinessBanner = hasCompanyPage && !profile?.is_organization_verified && !isOrgPageVerified && !hasVerifApp && !verifyBannerDismissed;

  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
      <OfflineBanner />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Profile Hero Card ──────────────────────────────────────── */}
        <View style={[s.heroCard, { backgroundColor: colors.surface, borderColor: colors.border, borderTopColor: accent }]}>

          {/* Top row: avatar + info */}
          <TouchableOpacity
            style={s.heroTop}
            onPress={() => router.push("/profile/edit")}
            activeOpacity={0.85}
          >
            <TouchableOpacity activeOpacity={0.9} onPress={() => setAvatarOpen(true)} style={{ position: "relative" }}>
              <Avatar
                uri={profile?.avatar_url}
                name={profile?.display_name}
                size={76}
                premium={isPremium}
                square={!!(profile?.is_organization_verified || profile?.is_business_mode)}
              />
              {isPremium && (
                <View style={s.premiumDot}>
                  <Ionicons name="diamond" size={9} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text style={[s.heroName, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                  {profile?.display_name || "User"}
                </Text>
                <VerifiedBadge
                  isVerified={profile?.is_verified}
                  isOrganizationVerified={profile?.is_organization_verified}
                  size={17}
                />
              </View>
              <TouchableOpacity
                onPress={() => profile?.handle && showHandlePurchase(profile.handle)}
                activeOpacity={0.7}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                {purchaseLoading
                  ? <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: 4 }} />
                  : null}
                <Text style={[s.heroHandle, { color: colors.textMuted }]}>@{profile?.handle || "handle"}</Text>
                <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} style={{ opacity: 0.6 }} />
              </TouchableOpacity>
              <View style={{ marginTop: 2 }}>
                <PrestigeBadge acoin={acoin} size="sm" showLabel />
              </View>
              {profile?.is_organization_verified && (
                <View style={[s.businessChip, { backgroundColor: Colors.gold + "20" }]}>
                  <Ionicons name="briefcase" size={10} color={Colors.gold} />
                  <Text style={[s.businessChipText, { color: Colors.gold }]}>Business</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Bio */}
          {!!profile?.bio && (
            <Text style={[s.heroBio, { color: colors.textSecondary, borderTopColor: colors.border }]} numberOfLines={2}>
              {profile.bio}
            </Text>
          )}

          {/* ACoin bar */}
          <TouchableOpacity
            style={[s.acoinBar, { backgroundColor: Colors.gold + "12", borderTopColor: colors.border }]}
            onPress={() => router.push("/wallet")}
            activeOpacity={0.8}
          >
            <View style={[s.acoinIconWrap, { backgroundColor: Colors.gold + "22" }]}>
              <Text style={s.acoinEmoji}>🪙</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.acoinBalance, { color: Colors.gold }]}>{fmtAcoin(acoin)} ACoin</Text>
              <Text style={[s.acoinSub, { color: colors.textMuted }]}>Tap to open wallet</Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={Colors.gold + "80"} />
          </TouchableOpacity>
        </View>

        {/* ── Stats Row ─────────────────────────────────────────────── */}
        <View style={[s.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            {
              label: "Followers", count: followerCount,
              onPress: () => profile?.id && router.push({ pathname: "/followers", params: { userId: profile.id, type: "followers", ownerHandle: profile.handle } } as any),
            },
            {
              label: "Following", count: followingCount,
              onPress: () => profile?.id && router.push({ pathname: "/followers", params: { userId: profile.id, type: "following", ownerHandle: profile.handle } } as any),
            },
            {
              label: "Posts", count: postCount,
              onPress: () => profile?.id && router.push({ pathname: "/contact/[id]", params: { id: profile.id, init_name: profile.display_name ?? "", init_handle: profile.handle ?? "", init_avatar: profile.avatar_url ?? "" } }),
            },
          ].map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && <View style={[s.statDivider, { backgroundColor: colors.border }]} />}
              <TouchableOpacity style={s.statCell} onPress={stat.onPress} activeOpacity={0.7}>
                <Text style={[s.statValue, { color: colors.text }]}>{fmtCount(stat.count)}</Text>
                <Text style={[s.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* ── Quick Actions ─────────────────────────────────────────── */}
        <View style={[s.quickRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { icon: "person-circle-outline", label: "View Profile", color: accent,       onPress: () => profile?.id && router.push({ pathname: "/contact/[id]", params: { id: profile.id, init_name: profile.display_name ?? "", init_handle: profile.handle ?? "", init_avatar: profile.avatar_url ?? "" } }) },
            { icon: "pencil-outline",        label: "Edit Profile", color: colors.icon, onPress: () => router.push("/profile/edit") },
            { icon: "at-outline",            label: "Usernames",    color: colors.icon, onPress: () => router.push("/username-market") },
          ].map((a, i) => (
            <TouchableOpacity key={a.label} style={s.quickBtn} onPress={a.onPress} activeOpacity={0.75}>
              <View style={[s.quickIconWrap, { backgroundColor: a.color + "15" }]}>
                <Ionicons name={a.icon as any} size={20} color={a.color} />
              </View>
              <Text style={[s.quickLabel, { color: colors.textSecondary }]} numberOfLines={1}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Profile Completion ─────────────────────────────────────── */}
        <ProfileCompletionBar profile={profile} isPremium={isPremium} colors={colors} accent={accent} />

        {/* ── Business Verify Banner ─────────────────────────────────── */}
        {showBusinessBanner && (
          <View>
            <SectionLabel label="Business" colors={colors} />
            <View style={[s.verifyBanner, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: Colors.gold }]}>
              <View style={s.verifyLeft}>
                <View style={[s.verifyIconWrap, { backgroundColor: Colors.gold + "18" }]}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.verifyTitle, { color: Colors.gold }]}>Verify your business</Text>
                  <Text style={[s.verifySub, { color: colors.textMuted }]}>Get the gold badge — builds trust with followers.</Text>
                  <TouchableOpacity
                    style={[s.verifyBtn, { backgroundColor: Colors.gold }]}
                    onPress={() => router.push("/company" as any)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="checkmark-circle-outline" size={13} color="#fff" />
                    <Text style={s.verifyBtnText}>Company Pages</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity hitSlop={14} onPress={dismissVerifyBanner}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Premium Banner ─────────────────────────────────────────── */}
        {!isPremium && (
          <TouchableOpacity
            style={[s.premiumBanner, { backgroundColor: "#0f1923", borderColor: "#FFD60A30" }]}
            onPress={() => router.push("/premium")}
            activeOpacity={0.88}
          >
            <View style={[s.premiumIconWrap, { backgroundColor: "#FFD60A18" }]}>
              <Ionicons name="diamond" size={22} color="#FFD60A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.premiumTitle}>Upgrade to Premium</Text>
              <Text style={s.premiumSub}>Badges, linked accounts, exclusive perks & more</Text>
            </View>
            <View style={[s.premiumChip, { backgroundColor: "#FFD60A22" }]}>
              <Text style={s.premiumChipText}>Upgrade</Text>
            </View>
          </TouchableOpacity>
        )}

        {isPremium && (
          <View>
            <SectionLabel label="Subscription" colors={colors} />
            <MenuCard colors={colors}>
              <MenuItem
                icon="diamond"
                iconColor="#FFD60A"
                label="Premium Active"
                value={subscription?.plan_tier ? `Plan: ${subscription.plan_tier}` : "Active"}
                onPress={() => router.push("/premium")}
                colors={colors}
              />
            </MenuCard>
          </View>
        )}

        {/* ── Analytics ──────────────────────────────────────────────── */}
        <View>
          <SectionLabel label="Creator Analytics" colors={colors} />
          <MenuCard colors={colors}>
            <MenuItem icon="bar-chart" iconColor={accent} label="Creator Analytics" value={`${fmtCount(postCount)} posts`} onPress={() => router.push("/video-analytics" as any)} colors={colors} />
          </MenuCard>
        </View>

        {/* ── Growth & Social ────────────────────────────────────────── */}
        <View>
          <SectionLabel label="Growth" colors={colors} />
          <MenuCard colors={colors}>
            <MenuItem icon="trophy" iconColor={Colors.gold} label="Prestige Status" badge="NEW" badgeColor={Colors.gold} onPress={() => router.push("/prestige")} showSeparator colors={colors} />
            <MenuItem icon="business-outline" iconColor={accent} label="Company Pages" onPress={() => router.push("/company" as any)} showSeparator colors={colors} />
            <MenuItem icon="people" iconColor={colors.icon} label="Find People" badge="NEW" badgeColor={accent} onPress={() => router.push("/user-discovery")} showSeparator colors={colors} />
            <MenuItem icon="at" iconColor={colors.icon} label="Username Market" onPress={() => router.push("/username-market")} colors={colors} />
          </MenuCard>
        </View>

        {/* ── Creator (admin only) ───────────────────────────────────── */}
        {isAdmin && (
          <View>
            <SectionLabel label="Creator" colors={colors} />
            <MenuCard colors={colors}>
              <MenuItem icon="videocam-outline" iconColor={colors.icon} label="Creator Studio" badge="Admin" badgeColor={accent} onPress={() => router.push("/monetize")} colors={colors} />
            </MenuCard>
          </View>
        )}

        {/* ── Account ────────────────────────────────────────────────── */}
        <View>
          <SectionLabel label="Account" colors={colors} />
          <MenuCard colors={colors}>
            <MenuItem icon="sparkles-outline" iconColor={colors.icon} label="Advanced Features" onPress={() => router.push("/advanced-features")} showSeparator colors={colors} />
            <MenuItem icon="settings-outline" iconColor={colors.icon} label="Settings" onPress={() => router.push("/settings")} showSeparator colors={colors} />
            <MenuItem icon="help-buoy-outline" iconColor={colors.icon} label="Support Center" onPress={() => router.push("/support" as any)} showSeparator colors={colors} />
            <MenuItem icon="information-circle-outline" iconColor={colors.icon} label="About AfuChat" onPress={() => router.push("/about" as any)} colors={colors} />
          </MenuCard>
        </View>

        {/* ── Staff / Admin ──────────────────────────────────────────── */}
        {(profile?.is_admin || profile?.is_support_staff) && (
          <View>
            <SectionLabel label="Staff" colors={colors} />
            <MenuCard colors={colors}>
              <MenuItem icon="headset-outline" iconColor={colors.icon} label="Support Dashboard" badge="Staff" badgeColor={accent} onPress={() => router.push("/admin/support-dashboard" as any)} showSeparator={!!profile?.is_admin} colors={colors} />
              {profile?.is_admin && (
                <MenuItem icon="shield-checkmark" iconColor={accent} label="Admin Dashboard" badge="Admin" badgeColor={accent} onPress={() => router.push("/admin")} colors={colors} />
              )}
            </MenuCard>
          </View>
        )}

      </ScrollView>

      <AvatarViewer
        visible={avatarOpen}
        uri={profile?.avatar_url}
        name={profile?.display_name || undefined}
        onClose={() => setAvatarOpen(false)}
      />

      {/* ── Username Purchase Details Modal ── */}
      <Modal
        visible={!!purchasePopup}
        transparent
        animationType="fade"
        onRequestClose={() => setPurchasePopup(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}
          activeOpacity={1}
          onPress={() => setPurchasePopup(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: "82%",
              backgroundColor: colors.surface,
              borderRadius: 22,
              padding: 24,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              gap: 16,
            }}
          >
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.text }}>
                Username Details
              </Text>
              <TouchableOpacity onPress={() => setPurchasePopup(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Handle pill */}
            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <View style={{ backgroundColor: accent + "18", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 }}>
                <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: accent }}>
                  @{purchasePopup?.handle}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
                <Ionicons name="storefront-outline" size={13} color="#34C759" />
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#34C759" }}>
                  Purchased from Marketplace
                </Text>
              </View>
            </View>

            {/* Details */}
            <View style={{ gap: 12, backgroundColor: colors.backgroundSecondary, borderRadius: 14, padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Ionicons name="cash-outline" size={16} color={colors.icon} />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>Price Paid</Text>
                </View>
                <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFD60A" }}>
                  🪙 {purchasePopup?.price.toLocaleString()} ACoin
                </Text>
              </View>

              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Ionicons name="calendar-outline" size={16} color={colors.icon} />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>Purchased On</Text>
                </View>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }}>
                  {purchasePopup ? fmtDate(purchasePopup.purchasedAt) : "—"}
                </Text>
              </View>

              {purchasePopup?.sellerHandle && (
                <>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Ionicons name="person-outline" size={16} color={colors.icon} />
                      <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>Sold By</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }}>
                      @{purchasePopup.sellerHandle}
                    </Text>
                  </View>
                </>
              )}
            </View>

            <TouchableOpacity
              onPress={() => setPurchasePopup(null)}
              style={{ backgroundColor: accent, borderRadius: 16, paddingVertical: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  content: { gap: 14, paddingHorizontal: 14 },

  // Hero card
  heroCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 3,
    overflow: "hidden",
  },
  heroTop: { flexDirection: "row", alignItems: "flex-start", padding: 16, gap: 14 },
  heroName: { fontSize: 19, fontFamily: "Inter_700Bold", flexShrink: 1 },
  heroHandle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  heroBio: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, paddingHorizontal: 16, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  premiumDot: { position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFD60A", alignItems: "center", justifyContent: "center" },
  businessChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start", marginTop: 3 },
  businessChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  // ACoin bar
  acoinBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
  acoinIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  acoinEmoji: { fontSize: 18 },
  acoinBalance: { fontSize: 15, fontFamily: "Inter_700Bold" },
  acoinSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Stats row
  statsRow: { flexDirection: "row", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 14, paddingHorizontal: 8 },
  statCell: { flex: 1, alignItems: "center", gap: 3 },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },

  // Quick actions
  quickRow: { flexDirection: "row", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 14, paddingHorizontal: 6 },
  quickBtn: { flex: 1, alignItems: "center", gap: 7 },
  quickIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },

  // Business verify
  verifyBanner: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  verifyLeft: { flex: 1, flexDirection: "row", gap: 12, alignItems: "flex-start" },
  verifyIconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  verifyTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  verifySub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  verifyBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, marginTop: 8 },
  verifyBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Premium banner
  premiumBanner: { borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  premiumIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  premiumTitle: { color: "#FFD60A", fontSize: 15, fontFamily: "Inter_700Bold" },
  premiumSub: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  premiumChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  premiumChipText: { color: "#FFD60A", fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
