import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { navigateToProfile } from "@/lib/navigateToProfile";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatCompactNumber, formatDate } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarViewer } from "@/components/ui/AvatarViewer";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import QRPosterSheet from "@/components/ui/QRPosterSheet";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { getCachedProfileSync, isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { getLocalProfile } from "@/lib/storage/localProfile";
import { showToast } from "@/lib/toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── MenuItem ─────────────────────────────────────────────────────────────────

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
  rightIcon?: string;
};

function MenuItem({ icon, iconColor, label, value, badge, badgeColor, onPress, showSeparator, colors, destructive, rightIcon }: MenuItemProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { t } = useLanguage();
  return (
    <>
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          style={mi.row}
          onPress={() => { Haptics.selectionAsync(); onPress(); }}
          onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
          onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start()}
          activeOpacity={1}
        >
          <View style={mi.iconWrap}>
            <Ionicons name={icon as any} size={22} color={colors.text} />
          </View>
          <Text style={[mi.label, { color: destructive ? "#FF3B30" : colors.text }]} numberOfLines={1}>{t(label)}</Text>
          <View style={mi.right}>
            {!!value && <Text style={[mi.value, { color: colors.textMuted }]} numberOfLines={1}>{value}</Text>}
            {!!badge && (
              <View style={[mi.badge, { backgroundColor: (badgeColor || colors.accent) + "20" }]}>
                <Text style={[mi.badgeText, { color: badgeColor || colors.accent }]}>{t(badge)}</Text>
              </View>
            )}
            <Ionicons name={(rightIcon ?? "chevron-forward") as any} size={15} color={colors.textMuted + "80"} />
          </View>
        </TouchableOpacity>
      </Animated.View>
      {showSeparator && <View style={[mi.sep, { backgroundColor: colors.border }]} />}
    </>
  );
}

const mi = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  iconWrap: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  right: { flexDirection: "row", alignItems: "center", gap: 6 },
  value: { fontSize: 13, fontFamily: "Inter_400Regular" },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sep: { height: 0.5, marginLeft: 62 },
});

// ─── SectionLabel ────────────────────────────────────────────────────────────

function SectionLabel({ label, colors }: { label: string; colors: any }) {
  const { t } = useLanguage();
  return <Text style={[sl.text, { color: colors.textMuted }]}>{t(label).toUpperCase()}</Text>;
}
const sl = StyleSheet.create({
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.7, marginBottom: 6, marginTop: 24, marginLeft: 20 },
});

// ─── MenuCard ─────────────────────────────────────────────────────────────────

function MenuCard({ children, colors }: { children: React.ReactNode; colors: any }) {
  return (
    <View style={[mc.card, { backgroundColor: colors.surface }]}>
      {children}
    </View>
  );
}
const mc = StyleSheet.create({
  card: { overflow: "hidden" },
});

// ─── Profile Completion Bar ───────────────────────────────────────────────────

type ProfileFields = {
  avatar_url?: string | null; bio?: string | null; country?: string | null;
  website_url?: string | null; display_name?: string | null; handle?: string | null;
};

function ProfileCompletionBar({ profile, isPremium, colors, accent }: { profile: ProfileFields | null; isPremium: boolean; colors: any; accent: string }) {
  const fillAnim = useRef(new Animated.Value(0)).current;
  const { t } = useLanguage();
  const checks = [
    { label: "profile.photo",   done: !!profile?.avatar_url },
    { label: "profile.bio",     done: !!profile?.bio },
    { label: "profile.country", done: !!profile?.country },
    { label: "profile.website", done: !!profile?.website_url },
    { label: "profile.premium", done: isPremium },
  ];
  const score = checks.filter((c) => c.done).length;
  const pct = score / checks.length;
  useEffect(() => {
    Animated.timing(fillAnim, { toValue: pct, duration: 900, delay: 400, useNativeDriver: false }).start();
  }, [pct]);
  if (score === checks.length) return null;
  return (
    <View>
      <SectionLabel label="profile.title" colors={colors} />
      <MenuCard colors={colors}>
        <TouchableOpacity style={pc.wrap} onPress={() => router.push("/profile/edit")} activeOpacity={0.8}>
          <View style={pc.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={[pc.title, { color: colors.text }]}>{t("profile.complete")}</Text>
              <Text style={[pc.sub, { color: colors.textMuted }]}>{t("common.completion_steps", { done: score, total: checks.length })}</Text>
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
                <Ionicons name={c.done ? "checkmark-circle" : "ellipse"} size={14} color={c.done ? "#34C759" : colors.border} />
                 <Text style={[pc.checkLabel, { color: c.done ? colors.textSecondary : colors.textMuted }]}>{t(c.label)}</Text>
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
  const { colors, accent, isDark } = useTheme();
  const { t, preferredLang } = useLanguage();
  const { profile: authProfile, isPremium, subscription, loading, user, equippedGoods } = useAuth();
  const planLabel = useMemo(() => {
    const tier = subscription?.plan_tier?.toLowerCase();
    if (tier === "premium") return t("profile.plan_premium");
    if (tier === "platinum") return t("profile.plan_platinum");
    if (tier === "free") return t("profile.plan_free");
    return subscription?.plan_tier || t("profile.active");
  }, [subscription?.plan_tier, t]);
  // Match ChatsScreen's cache-first behavior. AuthContext refreshes this row
  // in the background, but a cached profile is enough to render the Me tab
  // immediately during offline startup or a slow session restore.
  const cachedProfile = useMemo(() => {
    const cached = getCachedProfileSync();
    return cached && user?.id && cached.id === user.id ? cached : null;
  }, [user?.id]);
  const [localProfile, setLocalProfile] = useState<any>(null);
  const profile = authProfile ?? cachedProfile ?? localProfile;
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [qrPosterOpen, setQrPosterOpen] = useState(false);

  const afuId = useMemo(() => {
    if (!profile?.id) return "00000000";
    return String(parseInt(profile.id.replace(/-/g, "").slice(0, 8), 16) % 100000000).padStart(8, "0");
  }, [profile?.id]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const insets = useSafeAreaInsets();

  // MMKV is the instant path, but SQLite is the durable fallback used by
  // Discover-style offline hydration. Do not show a reconnect warning while
  // this second local store is still being read.
  useEffect(() => {
    let cancelled = false;
    if (!user?.id || cachedProfile) {
      setLocalProfile(null);
      return;
    }
    getLocalProfile(user.id)
      .then((stored) => {
        if (!cancelled && stored) setLocalProfile(stored);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id, cachedProfile]);

  type PurchaseInfo = { handle: string; price: number; purchasedAt: string; sellerHandle: string | null };
  const [purchasePopup, setPurchasePopup] = useState<PurchaseInfo | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  async function showHandlePurchase(handle: string) {
    void Haptics.selectionAsync();
    if (!isOnline()) {
      showToast(t("common.username_details_offline"));
      return;
    }
    setPurchaseLoading(true);
    try {
      const { data } = await supabase
        .from("username_listings")
        .select("price, created_at, seller_id, profiles!username_listings_seller_id_fkey(handle)")
        .eq("username", handle)
        .not("sold_to_id", "is", null)
        .maybeSingle();
      if (!data) return;
      setPurchasePopup({
        handle,
        price: (data as any).price ?? 0,
        purchasedAt: (data as any).created_at ?? "",
        sellerHandle: (data as any).profiles?.handle ?? null,
      });
    } catch {
      showToast(t("common.username_details_unavailable"));
    } finally {
      setPurchaseLoading(false);
    }
  }

  function fmtDate(iso: string) {
    if (!iso) return t("common.not_available");
    return formatDate(iso, preferredLang, { year: "numeric", month: "short", day: "numeric" });
  }

  // ── Load stats ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const STATS_KEY = `me_stats_${user.id}`;
    AsyncStorage.getItem(STATS_KEY).then((raw) => {
      if (raw) { try { const { fc, fgc, pc } = JSON.parse(raw); setFollowerCount(fc ?? 0); setFollowingCount(fgc ?? 0); setPostCount(pc ?? 0); } catch {} }
    }).catch(() => {});
    let cancelled = false;
    const loadRemoteStats = () => {
      if (cancelled || !isOnline()) return;
      Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
        supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", user.id),
      ]).then(([{ count: fc }, { count: fgc }, { count: pc }]) => {
        if (cancelled) return;
        setFollowerCount(fc ?? 0); setFollowingCount(fgc ?? 0); setPostCount(pc ?? 0);
        AsyncStorage.setItem(STATS_KEY, JSON.stringify({ fc, fgc, pc })).catch(() => {});
      }).catch(() => {});
    };
    const unsubscribe = onConnectivityChange((online) => {
      if (online) loadRemoteStats();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user?.id]);

  // ── Live stats via realtime ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const STATS_KEY = `me_stats_${user.id}`;
    function persist(patch: Record<string, number>) {
      AsyncStorage.getItem(STATS_KEY).then((raw) => {
        try { const cur = raw ? JSON.parse(raw) : {}; AsyncStorage.setItem(STATS_KEY, JSON.stringify({ ...cur, ...patch })).catch(() => {}); } catch {}
      });
    }
    let channel: any = null;
    let cancelled = false;

    const startRealtime = () => {
      if (cancelled || channel || !isOnline()) return;
      channel = supabase
        .channel(`me-stats:${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "follows", filter: `following_id=eq.${user.id}` }, () =>
          void (async () => {
            try {
              const { count } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id);
              setFollowerCount(count ?? 0);
              persist({ fc: count ?? 0 });
            } catch {}
          })()
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "follows", filter: `follower_id=eq.${user.id}` }, () =>
          void (async () => {
            try {
              const { count } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id);
              setFollowingCount(count ?? 0);
              persist({ fgc: count ?? 0 });
            } catch {}
          })()
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "posts", filter: `author_id=eq.${user.id}` }, () =>
          void (async () => {
            try {
              const { count } = await supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", user.id);
              setPostCount(count ?? 0);
              persist({ pc: count ?? 0 });
            } catch {}
          })()
        )
        .subscribe();
    };

    const stopRealtime = () => {
      if (!channel) return;
      const current = channel;
      channel = null;
      supabase.removeChannel(current).catch(() => {});
    };

    // Wait for NetInfo's first result before opening a channel. This avoids
    // Supabase's reconnect loop when the app is launched without connectivity.
    const unsubscribe = onConnectivityChange((online) => {
      if (online) startRealtime();
      else stopRealtime();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      stopRealtime();
    };
  }, [user?.id]);

  // A cached/synthetic user can keep the app shell usable while offline even
  // when this device has never persisted the full profile row. Do not bounce
  // the user out of the Me tab in that state.
  if (!profile && user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <MeTabSkeleton />
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }}>
        <MeTabSkeleton />
      </View>
    );
  }

  const acoin = profile?.acoin || 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, {
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 96,
          alignSelf: "center",
          width: "100%",
        }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero Card ───────────────────────────────────────────────────── */}
        <View style={[s.heroCard, { backgroundColor: colors.surface }]}>

          {/* Avatar + info row */}
          <View style={s.heroTop}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setAvatarOpen(true)}
              onLongPress={() => { void Haptics.impactAsync(); setQrPosterOpen(true); }}
              delayLongPress={400}
            >
              <Avatar
                uri={profile?.avatar_url}
                name={profile?.display_name}
                size={74}
                userId={user?.id}
                square={!!(profile?.is_organization_verified || profile?.is_business_mode)}
                prestigeRing={
                  equippedGoods.has('sg2') ? 'void' :
                  equippedGoods.has('sg3') ? 'diamond' : null
                }
              />
              {isPremium && (
                <View style={s.premiumDot}>
                  <Ionicons name="diamond" size={9} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text style={[s.heroName, { color: equippedGoods.has('sg4') ? Colors.gold : colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                  {profile?.display_name || t("common.user")}
                </Text>
                <VerifiedBadge isVerified={profile?.is_verified} isOrganizationVerified={profile?.is_organization_verified} size={17} />
              </View>

              <TouchableOpacity
                onPress={() => profile?.handle && showHandlePurchase(profile.handle)}
                activeOpacity={0.7}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                {purchaseLoading && <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: 4 }} />}
                <Text style={[s.heroHandle, { color: colors.textMuted }]}>@{profile?.handle || t("common.handle")}</Text>
                <Ionicons name="information-circle" size={13} color={colors.textMuted} style={{ opacity: 0.6 }} />
              </TouchableOpacity>

              {profile?.is_organization_verified && (
                <View style={[s.businessChip, { backgroundColor: Colors.gold + "20" }]}>
                  <Ionicons name="briefcase" size={10} color={Colors.gold} />
                <Text style={[s.businessChipText, { color: Colors.gold }]}>{t("common.business")}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Bio */}
          {!!profile?.bio && (
            <Text style={[s.heroBio, { color: colors.textSecondary, borderTopColor: colors.border }]} numberOfLines={2}>
              {profile.bio}
            </Text>
          )}

          {/* ACoin bar */}
          <TouchableOpacity
            style={[s.acoinBar, { backgroundColor: Colors.gold + "10", borderTopColor: colors.border }]}
            onPress={() => router.push("/prestige")}
            activeOpacity={0.8}
          >
            <View style={[s.acoinIconWrap, { backgroundColor: Colors.gold + "22" }]}>
              <Text style={s.acoinEmoji}>🪙</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[s.acoinBalance, { color: Colors.gold }]}>{formatCompactNumber(acoin, preferredLang)} {t("profile.acoin_balance")}</Text>
               <Text style={[s.acoinSub, { color: colors.textMuted }]}>{t("profile.activity_unlocks")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={Colors.gold + "80"} />
          </TouchableOpacity>
        </View>

        {/* ── Stats Row ───────────────────────────────────────────────────── */}
        <View style={[s.statsRow, { backgroundColor: colors.surface }]}>
          {[
            {
               label: "profile.followers", count: followerCount,
              onPress: () => profile?.id && router.push({ pathname: "/followers", params: { userId: profile.id, type: "followers", ownerHandle: profile.handle } } as any),
            },
            {
               label: "profile.following", count: followingCount,
              onPress: () => profile?.id && router.push({ pathname: "/followers", params: { userId: profile.id, type: "following", ownerHandle: profile.handle } } as any),
            },
            {
               label: "profile.posts", count: postCount,
              onPress: () => router.push("/my-posts"),
            },
          ].map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && <View style={[s.statDivider, { backgroundColor: colors.border }]} />}
              <TouchableOpacity style={s.statCell} onPress={stat.onPress} activeOpacity={0.7}>
                <Text style={[s.statValue, { color: colors.text }]}>{formatCompactNumber(stat.count, preferredLang)}</Text>
               <Text style={[s.statLabel, { color: colors.textMuted }]}>{t(stat.label)}</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* ── Quick Actions ───────────────────────────────────────────────── */}
        <View style={[s.quickRow, { backgroundColor: colors.surface }]}>
          {[
             { icon: "create",    label: "profile.edit_profile", color: accent, onPress: () => router.push("/profile/edit") },
             { icon: "person",    label: "profile.my_profile",   color: accent, onPress: () => profile?.handle && navigateToProfile(profile.handle, true).catch(() => {}) },
             { icon: "qr-code",   label: "profile.qr_code",      color: accent, onPress: () => router.push("/app/afuqr" as any) },
             { icon: "card",      label: "profile.digital_id",   color: accent, onPress: () => router.push("/digital-id" as any) },
          ].map((a) => (
            <TouchableOpacity key={a.label} style={s.quickBtn} onPress={a.onPress} activeOpacity={0.75}>
              <View style={[s.quickIconWrap, { backgroundColor: a.color + "15" }]}>
                <Ionicons name={a.icon as any} size={20} color={a.color} />
              </View>
               <Text style={[s.quickLabel, { color: colors.textSecondary }]} numberOfLines={1}>{t(a.label)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Premium Banner / Card ───────────────────────────────────────── */}
        {!isPremium ? (
          <TouchableOpacity
            style={[s.premiumBanner, { backgroundColor: isDark ? "#0f1923" : "#1A1208" }]}
            onPress={() => router.push("/premium")}
            activeOpacity={0.88}
          >
            <View style={[s.premiumIconWrap, { backgroundColor: "#FFD60A18" }]}>
              <Ionicons name="diamond" size={22} color="#FFD60A" />
            </View>
            <View style={{ flex: 1 }}>
               <Text style={s.premiumTitle}>{t("profile.upgrade_to_premium")}</Text>
               <Text style={s.premiumSub}>{t("profile.verified_perks")}</Text>
            </View>
            <View style={[s.premiumChip, { backgroundColor: "#FFD60A22" }]}>
               <Text style={s.premiumChipText}>{t("profile.upgrade")}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View>
             <SectionLabel label="profile.subscription" colors={colors} />
            <MenuCard colors={colors}>
              <MenuItem
                icon="diamond"
                iconColor={accent}
                 label="profile.premium_active"
                  value={planLabel}
                onPress={() => router.push("/premium")}
                colors={colors}
              />
            </MenuCard>
          </View>
        )}

        {/* ── Profile Completion ──────────────────────────────────────────── */}
        <ProfileCompletionBar profile={profile} isPremium={isPremium} colors={colors} accent={accent} />

        {/* ── My Content ─────────────────────────────────────────────────── */}
        <View>
           <SectionLabel label="profile.my_content" colors={colors} />
          <MenuCard colors={colors}>
            <MenuItem
              icon="grid"
              iconColor={accent}
               label="profile.my_posts"
                value={t("common.posts_count", { count: formatCompactNumber(postCount, preferredLang) })}
              onPress={() => router.push("/my-posts")}
              showSeparator
              colors={colors}
            />
            <MenuItem
              icon="bookmark"
              iconColor={accent}
               label="profile.saved_posts"
              onPress={() => router.push("/app/afusaved" as any)}
              showSeparator
              colors={colors}
            />
            <MenuItem
              icon="time"
              iconColor={accent}
               label="profile.watch_history"
              onPress={() => router.push("/watch-history" as any)}
              showSeparator
              colors={colors}
            />
          </MenuCard>
        </View>

        {/* ── Social & Growth ─────────────────────────────────────────────── */}
        <View>
           <SectionLabel label="profile.social_growth" colors={colors} />
          <MenuCard colors={colors}>
            <MenuItem
              icon="trophy"
              iconColor={accent}
               label="profile.prestige_rewards"
               badge="common.new"
              onPress={() => router.push("/prestige")}
              showSeparator
              colors={colors}
            />
            <MenuItem
              icon="ribbon"
              iconColor={accent}
               label="profile.achievements"
              onPress={() => router.push("/achievements" as any)}
              colors={colors}
            />
          </MenuCard>
        </View>

        {/* ── Settings ────────────────────────────────────────────────────── */}
        <View>
           <SectionLabel label="profile.app" colors={colors} />
          <MenuCard colors={colors}>
            <MenuItem
              icon="settings"
              iconColor={colors.textMuted}
               label="profile.settings"
              onPress={() => router.push("/settings" as any)}
              colors={colors}
            />
          </MenuCard>
        </View>

      </ScrollView>

      <AvatarViewer
        visible={avatarOpen}
        uri={profile?.avatar_url}
        name={profile?.display_name || undefined}
        onClose={() => setAvatarOpen(false)}
      />

      <QRPosterSheet
        visible={qrPosterOpen}
        onClose={() => setQrPosterOpen(false)}
        displayName={profile?.display_name || t("common.afuchat_user")}
        handle={profile?.handle || t("common.user")}
        avatarUrl={profile?.avatar_url || null}
        afuId={afuId}
        isVerified={!!profile?.is_verified}
        isOrgVerified={!!profile?.is_organization_verified}
      />

      {/* ── Username Purchase Details Modal ─────────────────────────────── */}
      <Modal visible={!!purchasePopup} transparent animationType="none" onRequestClose={() => setPurchasePopup(null)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}
          activeOpacity={1}
          onPress={() => setPurchasePopup(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{ width: "82%", backgroundColor: colors.surface, borderRadius: 22, padding: 24, borderWidth: 0.5, borderColor: colors.border, gap: 16 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.text }}>{t("common.username_details")}</Text>
              <TouchableOpacity onPress={() => setPurchasePopup(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <View style={{ backgroundColor: accent + "18", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 }}>
                <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: accent }}>@{purchasePopup?.handle}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
                <Ionicons name="storefront" size={13} color="#34C759" />
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#34C759" }}>{t("common.purchased_from_marketplace")}</Text>
              </View>
            </View>
            <View style={{ gap: 12, backgroundColor: colors.backgroundSecondary, borderRadius: 14, padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Ionicons name="cash" size={16} color={colors.icon} />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>{t("common.price_paid")}</Text>
                </View>
                <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFD60A" }}>🪙 {purchasePopup?.price.toLocaleString()} ACoin</Text>
              </View>
              <View style={{ height: 0.5, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Ionicons name="calendar" size={16} color={colors.icon} />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>{t("common.purchased_on")}</Text>
                </View>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }}>{purchasePopup ? fmtDate(purchasePopup.purchasedAt) : t("common.not_available")}</Text>
              </View>
              {purchasePopup?.sellerHandle && (
                <>
                  <View style={{ height: 0.5, backgroundColor: colors.border }} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Ionicons name="person" size={16} color={colors.icon} />
                      <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>{t("common.sold_by")}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }}>@{purchasePopup.sellerHandle}</Text>
                  </View>
                </>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setPurchasePopup(null)}
              style={{ backgroundColor: accent, borderRadius: 16, paddingVertical: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>{t("common.done")}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  content: { gap: 0, paddingHorizontal: 0 },

  // Hero
  heroCard: { overflow: "hidden" },
  heroTop: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, gap: 14 },
  heroName: { fontSize: 19, fontFamily: "Inter_700Bold", flexShrink: 1 },
  heroHandle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  heroBio: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, paddingHorizontal: 20, paddingBottom: 14, paddingTop: 12 },
  premiumDot: { position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFD60A", alignItems: "center", justifyContent: "center" },
  businessChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start", marginTop: 3 },
  businessChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  // ACoin bar
  acoinBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  acoinIconWrap: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  acoinEmoji: { fontSize: 18 },
  acoinBalance: { fontSize: 15, fontFamily: "Inter_700Bold" },
  acoinSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Stats
  statsRow: { flexDirection: "row", paddingVertical: 16, paddingHorizontal: 8 },
  statCell: { flex: 1, alignItems: "center", gap: 3 },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: 0.5, marginVertical: 4 },

  // Quick actions
  quickRow: { flexDirection: "row", paddingVertical: 16, paddingHorizontal: 4 },
  quickBtn: { flex: 1, alignItems: "center", gap: 7 },
  quickIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center" },

  // Premium banner
  premiumBanner: { padding: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  premiumIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  premiumTitle: { color: "#FFD60A", fontSize: 15, fontFamily: "Inter_700Bold" },
  premiumSub: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  premiumChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  premiumChipText: { color: "#FFD60A", fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
