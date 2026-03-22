import React from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { Separator } from "@/components/ui/Separator";
import Colors from "@/constants/colors";

type MenuItemProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
};

function MenuItem({ icon, iconBg, label, value, onPress, danger }: MenuItemProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.menuItem, { backgroundColor: colors.surface }]}
      onPress={() => { Haptics.selectionAsync(); onPress?.(); }}
      activeOpacity={0.7}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <Text style={[styles.menuLabel, { color: danger ? "#FF3B30" : colors.text }]}>{label}</Text>
      <View style={styles.menuRight}>
        {value ? <Text style={[styles.menuValue, { color: colors.textSecondary }]}>{value}</Text> : null}
        {!danger && <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
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

export default function MeScreen() {
  const { colors } = useTheme();
  const { profile, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  const gradeIcon = profile?.current_grade === "Newcomer" ? "leaf-outline" : "star-outline";

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity
        style={[styles.profileCard, { backgroundColor: colors.surface }]}
        onPress={() => router.push("/profile/edit")}
        activeOpacity={0.85}
      >
        <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={68} />
        <View style={styles.profileInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.profileName, { color: colors.text }]}>
              {profile?.display_name || "User"}
            </Text>
            {profile?.is_verified && (
              <Ionicons name="checkmark-circle" size={16} color={Colors.brand} style={{ marginLeft: 4 }} />
            )}
          </View>
          <Text style={[styles.profileHandle, { color: colors.textSecondary }]}>
            @{profile?.handle || "handle"}
          </Text>
          {profile?.bio ? (
            <Text style={[styles.profileBio, { color: colors.textMuted }]} numberOfLines={1}>
              {profile.bio}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {/* XP & Acoin */}
      <View style={[styles.statsRow, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Ionicons name="flash" size={20} color="#FFD60A" />
          <Text style={[styles.statValue, { color: colors.text }]}>{profile?.xp || 0}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>XP</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Ionicons name="diamond" size={20} color="#FF9500" />
          <Text style={[styles.statValue, { color: colors.text }]}>{profile?.acoin || 0}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>ACoin</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Ionicons name={gradeIcon as any} size={20} color={Colors.brand} />
          <Text style={[styles.statValue, { color: colors.text }]}>{profile?.current_grade || "Newcomer"}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Grade</Text>
        </View>
      </View>

      <MenuGroup>
        <MenuItem icon="newspaper-outline" iconBg="#FF9500" label="My Posts" onPress={() => router.push("/(tabs)/discover")} />
        <Separator indent={54} />
        <MenuItem icon="images-outline" iconBg="#5856D6" label="Stories" onPress={() => router.push("/stories/create")} />
        <Separator indent={54} />
        <MenuItem icon="notifications-outline" iconBg="#007AFF" label="Notifications" onPress={() => router.push("/notifications")} />
      </MenuGroup>

      <MenuGroup>
        <MenuItem icon="wallet-outline" iconBg="#07C160" label="Wallet" onPress={() => router.push("/wallet")} />
        <Separator indent={54} />
        <MenuItem icon="gift-outline" iconBg="#FF3B30" label="Gifts" onPress={() => router.push("/gifts")} />
        <Separator indent={54} />
        <MenuItem icon="game-controller-outline" iconBg="#007AFF" label="Games" onPress={() => router.push("/games")} />
        <Separator indent={54} />
        <MenuItem icon="apps-outline" iconBg="#AF52DE" label="Mini Programs" onPress={() => router.push("/mini-programs")} />
      </MenuGroup>

      <MenuGroup>
        <MenuItem
          icon="chatbubble-ellipses-outline"
          iconBg="#34C759"
          label="Chat Settings"
          onPress={() => router.push("/settings/chat")}
        />
        <Separator indent={54} />
        <MenuItem
          icon="shield-checkmark-outline"
          iconBg="#30D158"
          label="Privacy"
          onPress={() => router.push("/settings/privacy")}
        />
        <Separator indent={54} />
        <MenuItem
          icon="notifications-outline"
          iconBg="#5856D6"
          label="Notification Settings"
          onPress={() => router.push("/settings/notifications")}
        />
      </MenuGroup>

      <MenuGroup>
        <MenuItem
          icon="log-out-outline"
          iconBg="#FF3B30"
          label="Sign Out"
          onPress={handleSignOut}
          danger
        />
      </MenuGroup>

      <Text style={[styles.version, { color: colors.textMuted }]}>AfuChat v1.0.0</Text>
    </ScrollView>
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
  statsRow: {
    flexDirection: "row",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
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
  version: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8 },
});
