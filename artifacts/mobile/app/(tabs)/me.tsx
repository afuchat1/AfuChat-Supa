import React, { useEffect, useState } from "react";
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

import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { showAlert } from "@/lib/alert";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarViewer } from "@/components/ui/AvatarViewer";
import { Separator } from "@/components/ui/Separator";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import Colors from "@/constants/colors";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { PrestigeBadge } from "@/components/ui/PrestigeBadge";



type MenuItemProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  badge?: string;
  comingSoon?: boolean;
};

function MenuItem({ icon, iconBg, label, value, onPress, danger, badge, comingSoon }: MenuItemProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.menuItem, { backgroundColor: colors.surface, opacity: comingSoon ? 0.65 : 1 }]}
      onPress={() => {
        if (comingSoon) {
          showAlert("Coming Soon", `${label} will be available soon. Stay tuned!`);
          return;
        }
        Haptics.selectionAsync();
        onPress?.();
      }}
      activeOpacity={0.7}
    >
      <View style={[styles.menuIcon, { backgroundColor: comingSoon ? "#8E8E93" : iconBg }]}>
        <Ionicons name={comingSoon ? "time-outline" : icon} size={18} color="#fff" />
      </View>
      <Text style={[styles.menuLabel, { color: danger ? "#FF3B30" : colors.text }]}>{label}</Text>
      <View style={styles.menuRight}>
        {comingSoon ? (
          <View style={[styles.premiumBadge, { backgroundColor: "#8E8E9330" }]}>
            <Text style={[styles.premiumBadgeText, { color: "#8E8E93" }]}>Coming Soon</Text>
          </View>
        ) : badge ? (
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeText}>{badge}</Text>
          </View>
        ) : null}
        {value ? <Text style={[styles.menuValue, { color: colors.textSecondary }]}>{value}</Text> : null}
        {!danger && !comingSoon && <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
      </View>
    </TouchableOpacity>
  );
}

function MenuGroup({ children }: { children: React.ReactNode }) {
  return (
    <View style={[styles.menuGroup, { borderRadius: 14, overflow: "hidden" }]}>
      {children}
    </View>
  );
}

type ProfileFields = { avatar_url?: string | null; bio?: string | null; country?: string | null; website_url?: string | null; display_name?: string | null; handle?: string | null };

function ProfileCompletionBar({ profile, isPremium }: { profile: ProfileFields | null; isPremium: boolean }) {
  const { colors } = useTheme();
  const fillAnim = useSharedValue(0);

  const checks = [
    { label: "Avatar", done: !!profile?.avatar_url },
    { label: "Bio", done: !!profile?.bio },
    { label: "Country", done: !!profile?.country },
    { label: "Website", done: !!profile?.website_url },
    { label: "Premium", done: isPremium },
  ];
  const score = checks.filter((c) => c.done).length;
  const pct = score / checks.length;

  useEffect(() => {
    fillAnim.value = withDelay(400, withTiming(pct, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [pct]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fillAnim.value * 100}%` as any }));

  if (score === checks.length) return null;

  return (
    <TouchableOpacity
      style={[{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginVertical: 4 }]}
      onPress={() => router.push("/profile/edit")}
      activeOpacity={0.8}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Profile Completion</Text>
        <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 13 }}>{Math.round(pct * 100)}%</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.backgroundTertiary, overflow: "hidden" }}>
        <Animated.View style={[{ height: "100%", borderRadius: 3, overflow: "hidden" }, fillStyle]}>
          <LinearGradient colors={[colors.accent, Colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {checks.map((c) => (
          <View key={c.label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name={c.done ? "checkmark-circle" : "ellipse-outline"} size={13} color={c.done ? "#34C759" : colors.textMuted} />
            <Text style={{ color: c.done ? colors.textSecondary : colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" }}>{c.label}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

function XpLevelBar({ xp }: { xp: number }) {
  const { colors } = useTheme();
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const xpForLevel = (level - 1) * (level - 1) * 100;
  const xpForNext = level * level * 100;
  const progress = Math.min((xp - xpForLevel) / (xpForNext - xpForLevel), 1);
  const fillAnim = useSharedValue(0);

  useEffect(() => {
    fillAnim.value = withDelay(300, withTiming(progress, { duration: 1000, easing: Easing.out(Easing.cubic) }));
  }, [xp]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillAnim.value * 100}%` as any,
  }));

  return (
    <View style={[styles.xpBar, { backgroundColor: colors.surface }]}>
      <View style={styles.xpRow}>
        <View style={[styles.xpLevelBadge, { backgroundColor: colors.accent }]}>
          <Text style={styles.xpLevelText}>Lv.{level}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={[styles.xpTrack, { backgroundColor: colors.backgroundTertiary }]}>
            <Animated.View style={[styles.xpFill, fillStyle]}>
              <LinearGradient
                colors={[colors.accent, "#AF52DE"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
          <Text style={[styles.xpSubLabel, { color: colors.textMuted }]}>
            {xp.toLocaleString()} / {xpForNext.toLocaleString()} XP to Level {level + 1}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function MeScreen() {
  const { colors, accent } = useTheme();
  const { profile, isPremium, subscription, loading } = useAuth();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const isAdmin = !!profile?.is_admin;
  const insets = useSafeAreaInsets();

  const gradeIcon = profile?.current_grade === "Newcomer" ? "leaf-outline" : "star-outline";

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
        style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 72 },
        ]}
        showsVerticalScrollIndicator={false}
      >
      <TouchableOpacity
        style={[styles.profileCard, { backgroundColor: colors.surface }]}
        onPress={() => router.push("/profile/edit")}
        activeOpacity={0.85}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setAvatarOpen(true)}
        >
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={68} premium={isPremium} />
        </TouchableOpacity>
        <View style={styles.profileInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.profileName, { color: colors.text }]}>
              {profile?.display_name || "User"}
            </Text>
            <VerifiedBadge isVerified={profile?.is_verified} isOrganizationVerified={profile?.is_organization_verified} size={18} />
            {isPremium && (
              <View style={styles.premiumStarBadge}>
                <Ionicons name="diamond" size={12} color="#fff" />
              </View>
            )}
          </View>
          <PrestigeBadge acoin={profile?.acoin || 0} size="md" showLabel />
          <Text style={[styles.profileHandle, { color: colors.textSecondary }]}>
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

      <View style={[styles.statsRow, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Ionicons name="flash" size={20} color="#FFD60A" />
          <Text style={[styles.statValue, { color: colors.text }]}>{profile?.xp || 0}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Nexa</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Ionicons name="diamond" size={20} color="#FF9500" />
          <Text style={[styles.statValue, { color: colors.text }]}>{profile?.acoin || 0}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>ACoin</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Ionicons name={gradeIcon as any} size={20} color={colors.accent} />
          <Text style={[styles.statValue, { color: colors.text }]}>{profile?.current_grade || "Newcomer"}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Grade</Text>
        </View>
      </View>

      <XpLevelBar xp={profile?.xp || 0} />

      <ProfileCompletionBar profile={profile} isPremium={isPremium} />

      {!isPremium && (
        <TouchableOpacity
          style={styles.premiumBanner}
          onPress={() => router.push("/premium")}
          activeOpacity={0.85}
        >
          <View style={styles.premiumBannerLeft}>
            <Ionicons name="diamond" size={24} color="#FFD60A" />
            <View>
              <Text style={styles.premiumBannerTitle}>Upgrade to Premium</Text>
              <Text style={styles.premiumBannerSub}>Pay with ACoin for badges, linked accounts & more</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      )}

      <MenuGroup>
        <MenuItem icon="trophy" iconBg="#D4A853" label="Prestige Status" onPress={() => router.push("/prestige")} badge="NEW" />
        {isAdmin && (
          <>
            <Separator indent={54} />
            <MenuItem
              icon="videocam-outline"
              iconBg="#32D74B"
              label="Creator Studio"
              onPress={() => router.push("/monetize")}
              badge="Admin"
            />
          </>
        )}
      </MenuGroup>

      <MenuGroup>
        <Separator indent={54} />
        <MenuItem icon="person-add-outline" iconBg="#00BCD4" label="Find People" onPress={() => router.push("/user-discovery")} badge="NEW" />
        {Platform.OS !== "web" && <Separator indent={54} />}
        {Platform.OS !== "web" && <MenuItem icon="notifications-outline" iconBg="#007AFF" label="Notifications" onPress={() => router.push("/notifications")} />}
      </MenuGroup>

      <MenuGroup>
        <MenuItem
          icon="diamond-outline"
          iconBg="#FFD60A"
          label="Premium"
          onPress={() => router.push("/premium")}
          value={isPremium ? `Active (${subscription?.plan_tier})` : ""}
        />
      </MenuGroup>

      <MenuGroup>
        <MenuItem
          icon="sparkles-outline"
          iconBg="#BF5AF2"
          label="Advanced Features"
          onPress={() => router.push("/advanced-features")}
        />
        <Separator indent={54} />
        <MenuItem
          icon="settings-outline"
          iconBg="#8E8E93"
          label="Settings"
          onPress={() => router.push("/settings")}
        />
        <Separator indent={54} />
        <MenuItem
          icon="help-buoy-outline"
          iconBg="#5856D6"
          label="Support Center"
          onPress={() => router.push("/support" as any)}
        />
        <Separator indent={54} />
        <MenuItem
          icon="information-circle-outline"
          iconBg="#007AFF"
          label="About AfuChat"
          onPress={() => router.push("/about" as any)}
        />
      </MenuGroup>

      {(profile?.is_admin || profile?.is_support_staff) && (
        <MenuGroup>
          <MenuItem
            icon="headset-outline"
            iconBg="#FF6B35"
            label="Support Dashboard"
            onPress={() => router.push("/admin/support-dashboard" as any)}
            badge="Staff"
          />
          {profile?.is_admin && (
            <>
              <Separator indent={54} />
              <MenuItem
                icon="shield-checkmark"
                iconBg={colors.accent}
                label="Admin Dashboard"
                onPress={() => router.push("/admin")}
                badge="Admin"
              />
            </>
          )}
        </MenuGroup>
      )}

    </ScrollView>
    <AvatarViewer
      visible={avatarOpen}
      uri={profile?.avatar_url}
      name={profile?.display_name || undefined}
      onClose={() => setAvatarOpen(false)}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 16, paddingHorizontal: 16 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    gap: 14,
  },
  profileInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 2 },
  profileHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 2 },
  profileBio: { fontSize: 13, fontFamily: "Inter_400Regular" },
  businessTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.gold,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 2,
    alignSelf: "flex-start",
  },
  businessTagText: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  premiumStarBadge: {
    backgroundColor: "#FFD60A",
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: "row",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 16, fontWeight: "700" },
  statLabel: { fontSize: 11 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  xpBar: { borderRadius: 14, padding: 12 },
  xpRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  xpLevelBadge: {
    backgroundColor: Colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  xpLevelText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  xpTrack: { height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 4 },
  xpFill: { height: "100%", borderRadius: 3, overflow: "hidden" },
  xpSubLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  premiumBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    padding: 16,
  },
  premiumBannerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  premiumBannerTitle: { color: "#FFD60A", fontSize: 16, fontFamily: "Inter_700Bold" },
  premiumBannerSub: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  menuGroup: { gap: 0 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 14,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  menuRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  menuValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  premiumBadge: {
    backgroundColor: "#FFD60A",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  premiumBadgeText: { color: "#1C1C1E", fontSize: 10, fontFamily: "Inter_700Bold" },
});
