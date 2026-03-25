import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";

const afuSymbol = require("@/assets/images/afu-symbol.png");

type NavItem = {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconActive: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "index", icon: "chatbubbles-outline", iconActive: "chatbubbles", label: "Chats" },
  { key: "discover", icon: "compass-outline", iconActive: "compass", label: "Discover" },
  { key: "me", icon: "person-outline", iconActive: "person", label: "Me" },
];

type Props = {
  activeTab: string;
  onTabPress: (tab: string) => void;
};

export function DesktopSidebar({ activeTab, onTabPress }: Props) {
  const { profile } = useAuth();
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
      <View style={styles.logoArea}>
        <Image source={afuSymbol} style={styles.logo} resizeMode="contain" />
      </View>

      <View style={styles.navItems}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => onTabPress(item.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive ? item.iconActive : item.icon}
                size={24}
                color={isActive ? Colors.brand : colors.textSecondary}
              />
              <Text
                style={[
                  styles.navLabel,
                  { color: isActive ? Colors.brand : colors.textSecondary },
                  isActive && styles.navLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.bottomArea}>
        {profile && (
          <TouchableOpacity style={styles.profileBtn} onPress={() => onTabPress("me")}>
            <Avatar uri={profile.avatar_url} name={profile.display_name} size={36} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 72,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoArea: {
    paddingVertical: 8,
    alignItems: "center",
  },
  logo: {
    width: 36,
    height: 36,
    tintColor: Colors.brand,
  },
  navItems: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
  },
  navItem: {
    width: 60,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  navItemActive: {
    backgroundColor: "rgba(0,194,203,0.08)",
  },
  navLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  navLabelActive: {
    fontFamily: "Inter_600SemiBold",
  },
  bottomArea: {
    paddingVertical: 8,
    alignItems: "center",
  },
  profileBtn: {
    padding: 4,
  },
});
