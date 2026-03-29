import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { PrestigeBadge } from "@/components/ui/PrestigeBadge";
import Colors from "@/constants/colors";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { showAlert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";

type SectionTileProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  iconBg: string;
  iconColor: string;
  onPress: () => void;
};

function SectionTile({ icon, label, iconBg, iconColor, onPress }: SectionTileProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.tile, { backgroundColor: colors.surface }]}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      activeOpacity={0.75}
    >
      <View style={[styles.tileIconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={[styles.tileLabel, { color: colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function QuickAction({ icon, label, bg, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; bg: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={styles.quickAction} onPress={() => { Haptics.selectionAsync(); onPress(); }} activeOpacity={0.75}>
      <View style={[styles.quickActionIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color="#fff" />
      </View>
      <Text style={[styles.quickActionLabel, { color: colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function MeScreen() {
  const { colors, isDark } = useTheme();
  const { profile, isPremium } = useAuth();
  const insets = useSafeAreaInsets();

  async function handleSignOut() {
    showAlert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
      <OfflineBanner />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

        <LinearGradient
          colors={isDark ? ["#0d1117", "#0d1117"] : [Colors.brand + "18", colors.backgroundSecondary]}
          style={[styles.topGradient, { paddingTop: insets.top + 16 }]}
        >
          <TouchableOpacity style={styles.profileCard} onPress={() => router.push("/profile/edit")} activeOpacity={0.85}>
            <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={72} premium={isPremium} />
            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
                  {profile?.display_name || "User"}
                </Text>
                <VerifiedBadge isVerified={profile?.is_verified} isOrganizationVerified={profile?.is_organization_verified} size={17} />
                {isPremium && (
                  <View style={styles.premiumDot}>
                    <Ionicons name="diamond" size={10} color="#fff" />
                  </View>
                )}
              </View>
              <Text style={[styles.handle, { color: colors.textMuted }]}>@{profile?.handle || "handle"}</Text>
              <PrestigeBadge acoin={profile?.acoin || 0} size="sm" showLabel />
              {profile?.bio
                ? <Text style={[styles.bio, { color: colors.textSecondary }]} numberOfLines={1}>{profile.bio}</Text>
                : <Text style={[styles.bio, { color: Colors.brand }]}>Tap to add a bio →</Text>
              }
            </View>
            <Ionicons name="create-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.statsRow, { backgroundColor: colors.surface }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{(profile?.xp || 0).toLocaleString()}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Nexa</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{(profile?.acoin || 0).toLocaleString()}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>ACoin</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>{profile?.current_grade || "Newcomer"}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Grade</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {!isPremium && (
            <TouchableOpacity style={styles.premiumBanner} onPress={() => router.push("/premium")} activeOpacity={0.85}>
              <Ionicons name="diamond" size={22} color="#FFD60A" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.premiumTitle}>Upgrade to Premium</Text>
                <Text style={styles.premiumSub}>Unlock badges, linked accounts & more</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}

          <View style={styles.quickRow}>
            <QuickAction icon="wallet-outline" label="Wallet" bg="#00BCD4" onPress={() => router.push("/wallet")} />
            <QuickAction icon="sparkles-outline" label="AfuAI" bg="#5856D6" onPress={() => router.push("/ai")} />
            <QuickAction icon="notifications-outline" label="Alerts" bg="#007AFF" onPress={() => router.push("/notifications")} />
            <QuickAction icon="storefront-outline" label="Shop" bg="#AF52DE" onPress={() => router.push("/store")} />
          </View>

          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>FEATURES</Text>

          <View style={styles.tilesGrid}>
            <SectionTile
              icon="newspaper-outline"
              label="Content & Media"
              iconBg="#FF950022"
              iconColor="#FF9500"
              onPress={() => router.push("/me/content" as any)}
            />
            <SectionTile
              icon="people-outline"
              label="Social & Friends"
              iconBg="#34C75922"
              iconColor="#34C759"
              onPress={() => router.push("/me/social" as any)}
            />
            <SectionTile
              icon="diamond-outline"
              label="Economy & Rewards"
              iconBg="#00BCD422"
              iconColor={Colors.brand}
              onPress={() => router.push("/me/economy" as any)}
            />
            <SectionTile
              icon="id-card-outline"
              label="Identity & Account"
              iconBg="#D4A85322"
              iconColor="#D4A853"
              onPress={() => router.push("/me/identity" as any)}
            />
            <SectionTile
              icon="settings-outline"
              label="Settings"
              iconBg="#8E8E9322"
              iconColor="#8E8E93"
              onPress={() => router.push("/me/settings" as any)}
            />
          </View>

          <TouchableOpacity style={[styles.signOutBtn, { backgroundColor: colors.surface }]} onPress={handleSignOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          <Text style={[styles.version, { color: colors.textMuted }]}>AfuChat v1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topGradient: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 },
  profileInfo: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold", maxWidth: 160 },
  premiumDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.brand, alignItems: "center", justifyContent: "center" },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  bio: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statsRow: { flexDirection: "row", borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8 },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 17, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  body: { paddingHorizontal: 16, gap: 12, marginTop: 4 },
  premiumBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 14, padding: 14 },
  premiumTitle: { color: "#FFD60A", fontSize: 15, fontFamily: "Inter_700Bold" },
  premiumSub: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  quickRow: { flexDirection: "row", justifyContent: "space-between" },
  quickAction: { alignItems: "center", gap: 6, flex: 1 },
  quickActionIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  sectionHeader: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginTop: 4, marginLeft: 4 },
  tilesGrid: { gap: 10 },
  tile: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 14, gap: 14 },
  tileIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tileLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium" },
  signOutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, padding: 14, marginTop: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: "#FF3B3040" },
  signOutText: { color: "#FF3B30", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  version: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
});
