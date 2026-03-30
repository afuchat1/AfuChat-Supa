import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

type NavRowProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  label: string;
  description: string;
  onPress: () => void;
  danger?: boolean;
};

function NavRow({ icon, iconBg, label, description, onPress, danger }: NavRowProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.navRow, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.navIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <View style={styles.navText}>
        <Text style={[styles.navLabel, { color: danger ? "#FF3B30" : colors.text }]}>{label}</Text>
        <Text style={[styles.navDesc, { color: colors.textMuted }]} numberOfLines={1}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
      {title.toUpperCase()}
    </Text>
  );
}

export default function PrivacySettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        <SectionHeader title="Account" />
        <View style={styles.group}>
          <NavRow
            icon="lock-closed"
            iconBg="#007AFF"
            label="Account Privacy"
            description="Private account, online status, profile visibility"
            onPress={() => router.push("/settings/privacy-account" as any)}
          />
          <View style={[styles.separator, { backgroundColor: colors.border, marginLeft: 60 }]} />
          <NavRow
            icon="eye-off"
            iconBg="#5856D6"
            label="Visibility"
            description="Who can see your followers and following list"
            onPress={() => router.push("/settings/privacy-visibility" as any)}
          />
        </View>

        <SectionHeader title="Interactions" />
        <View style={styles.group}>
          <NavRow
            icon="chatbubble-ellipses"
            iconBg="#34C759"
            label="Messages"
            description="Who can send you messages and calls"
            onPress={() => router.push("/settings/privacy-messages" as any)}
          />
          <View style={[styles.separator, { backgroundColor: colors.border, marginLeft: 60 }]} />
          <NavRow
            icon="heart"
            iconBg="#FF2D55"
            label="Reactions & Tags"
            description="Who can like, comment and tag you"
            onPress={() => router.push("/settings/privacy-interactions" as any)}
          />
        </View>

        <SectionHeader title="Safety" />
        <View style={styles.group}>
          <NavRow
            icon="ban"
            iconBg="#FF3B30"
            label="Blocked Users"
            description="Manage accounts you have blocked"
            onPress={() => router.push("/settings/blocked")}
            danger
          />
          <View style={[styles.separator, { backgroundColor: colors.border, marginLeft: 60 }]} />
          <NavRow
            icon="flag"
            iconBg="#FF9500"
            label="Restricted Accounts"
            description="Limit interactions without blocking"
            onPress={() => router.push("/settings/privacy-restricted" as any)}
          />
        </View>

        <SectionHeader title="Data" />
        <View style={styles.group}>
          <NavRow
            icon="analytics"
            iconBg="#00BCD4"
            label="Activity Data"
            description="Manage how your activity is used"
            onPress={() => router.push("/settings/privacy-data" as any)}
          />
          <View style={[styles.separator, { backgroundColor: colors.border, marginLeft: 60 }]} />
          <NavRow
            icon="cloud-download"
            iconBg="#BF5AF2"
            label="Download My Data"
            description="Request a copy of your AfuChat data"
            onPress={() => router.push("/settings/privacy-download" as any)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionHeader: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  group: {
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: "hidden",
  },
  separator: { height: StyleSheet.hairlineWidth },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 14,
  },
  navIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  navText: { flex: 1 },
  navLabel: { fontSize: 16, fontFamily: "Inter_400Regular", marginBottom: 2 },
  navDesc: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
