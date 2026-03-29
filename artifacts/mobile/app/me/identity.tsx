import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { Separator } from "@/components/ui/Separator";
import { useAuth } from "@/context/AuthContext";

type Item = { icon: React.ComponentProps<typeof Ionicons>["name"]; iconBg: string; label: string; sub: string; route: string; adminOnly?: boolean };

const items: Item[] = [
  { icon: "id-card-outline", iconBg: "#1E3A5F", label: "Digital ID", sub: "Your 3D identity card", route: "/digital-id" },
  { icon: "crown", iconBg: "#D4A853", label: "Prestige Status", sub: "Your rank and achievements", route: "/prestige" },
  { icon: "diamond-outline", iconBg: "#FFD60A", label: "Premium", sub: "Manage your subscription", route: "/premium" },
  { icon: "swap-horizontal-outline", iconBg: "#AF52DE", label: "Switch Accounts", sub: "Manage linked accounts", route: "/linked-accounts" },
  { icon: "videocam-outline", iconBg: "#32D74B", label: "Creator Studio", sub: "Monetise your content", route: "/monetize", adminOnly: true },
  { icon: "bag-handle-outline", iconBg: "#FF6B35", label: "My Shop", sub: "Manage your storefront", route: "/shop/manage", adminOnly: true },
];

export default function IdentityHubScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const isAdmin = !!profile?.is_admin;

  const visible = items.filter((i) => !i.adminOnly || isAdmin);

  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Identity & Account</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.group, { backgroundColor: colors.surface }]}>
          {visible.map((item, i) => (
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
              {i < visible.length - 1 && <Separator indent={72} />}
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
