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
        {value && <Text style={[styles.menuValue, { color: colors.textSecondary }]}>{value}</Text>}
        {!danger && <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
      </View>
    </TouchableOpacity>
  );
}

function MenuGroup({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
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

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile Card */}
      <TouchableOpacity
        style={[styles.profileCard, { backgroundColor: colors.surface }]}
        onPress={() => router.push("/profile/edit")}
        activeOpacity={0.85}
      >
        <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={68} />
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: colors.text }]}>
            {profile?.display_name || "User"}
          </Text>
          <Text style={[styles.profileStatus, { color: colors.textSecondary }]} numberOfLines={1}>
            {profile?.status || "Set a status"}
          </Text>
          <Text style={[styles.profileUsername, { color: colors.textMuted }]}>
            @{profile?.username || "username"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Moments */}
      <MenuGroup>
        <MenuItem
          icon="images-outline"
          iconBg="#FF9500"
          label="My Moments"
          onPress={() => router.push("/discover")}
        />
      </MenuGroup>

      {/* Features */}
      <MenuGroup>
        <MenuItem icon="wallet-outline" iconBg="#07C160" label="Wallet" />
        <Separator indent={54} />
        <MenuItem icon="star-outline" iconBg="#FFD60A" label="Favorites" />
        <Separator indent={54} />
        <MenuItem icon="videocam-outline" iconBg="#FF3B30" label="Video Calls" />
      </MenuGroup>

      {/* Settings */}
      <MenuGroup>
        <MenuItem
          icon="settings-outline"
          iconBg="#8E8E93"
          label="Settings"
          onPress={() => {}}
        />
        <Separator indent={54} />
        <MenuItem
          icon="shield-checkmark-outline"
          iconBg="#30D158"
          label="Privacy"
          onPress={() => {}}
        />
        <Separator indent={54} />
        <MenuItem
          icon="notifications-outline"
          iconBg="#007AFF"
          label="Notifications"
          onPress={() => {}}
        />
        <Separator indent={54} />
        <MenuItem
          icon="phone-portrait-outline"
          iconBg="#5856D6"
          label="Device"
          onPress={() => {}}
        />
      </MenuGroup>

      {/* Sign Out */}
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
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  profileStatus: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 2 },
  profileUsername: { fontSize: 12, fontFamily: "Inter_400Regular" },
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
