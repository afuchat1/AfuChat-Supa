import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { Separator } from "@/components/ui/Separator";

type Item = { icon: React.ComponentProps<typeof Ionicons>["name"]; iconBg: string; label: string; sub: string; route: string };

const items: Item[] = [
  { icon: "person-add-outline", iconBg: "#00BCD4", label: "Find People", sub: "Discover new connections", route: "/user-discovery" },
  { icon: "notifications-outline", iconBg: "#007AFF", label: "Notifications", sub: "Your activity and alerts", route: "/notifications" },
  { icon: "gift-outline", iconBg: "#AF52DE", label: "Gifts", sub: "Send virtual gifts to friends", route: "/gifts" },
  { icon: "share-social-outline", iconBg: "#34C759", label: "Referral Program", sub: "Invite friends and earn rewards", route: "/referral" },
  { icon: "people-outline", iconBg: "#FF9500", label: "Phone Contacts", sub: "Find friends from your contacts", route: "/phone-contacts" },
];

export default function SocialHubScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Social & Friends</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.group, { backgroundColor: colors.surface }]}>
          {items.map((item, i) => (
            <React.Fragment key={item.route}>
              <TouchableOpacity style={styles.row} onPress={() => router.push(item.route as any)} activeOpacity={0.7}>
                <View style={[styles.iconBox, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={20} color="#fff" />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>{item.label}</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>{item.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {i < items.length - 1 && <Separator indent={72} />}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  list: { padding: 16, gap: 12 },
  group: { borderRadius: 16, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
