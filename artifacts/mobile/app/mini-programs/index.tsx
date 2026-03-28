import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";


type ServiceItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  route: string;
};

type SectionData = {
  title: string;
  items: ServiceItem[];
};

const SECTIONS: SectionData[] = [
  {
    title: "Daily Services",
    items: [
      { icon: "phone-portrait-outline", label: "Mobile\nTop Up", color: "#007AFF", route: "/mini-programs/airtime" },
      { icon: "flash-outline", label: "Utilities", color: "#4CD964", route: "/mini-programs/bills" },
      { icon: "cellular-outline", label: "Data\nBundles", color: "#5856D6", route: "/mini-programs/data-bundles" },
      { icon: "receipt-outline", label: "Fee\nDetails", color: "#FF9500", route: "/mini-programs/fee-details" },
    ],
  },
  {
    title: "Travel & Entertainment",
    items: [
      { icon: "bed-outline", label: "Hotels &\nHomes", color: "#FF3B30", route: "/mini-programs/hotels" },
      { icon: "ticket-outline", label: "Event\nTickets", color: "#AF52DE", route: "/mini-programs/tickets" },
    ],
  },
  {
    title: "Gaming",
    items: [
      { icon: "skull-outline", label: "Snake", color: "#00BCD4", route: "/games/snake" },
      { icon: "grid-outline", label: "Tetris", color: "#00BCD4", route: "/games/tetris" },
      { icon: "apps-outline", label: "2048", color: "#EDC22E", route: "/games/game-2048" },
      { icon: "airplane-outline", label: "Flappy\nBird", color: "#70c5ce", route: "/games/flappy" },
      { icon: "rocket-outline", label: "Space\nShooter", color: "#00E676", route: "/games/space-shooter" },
      { icon: "cube-outline", label: "Brick\nBreaker", color: "#FF9800", route: "/games/brick-breaker" },
      { icon: "flag-outline", label: "Mine-\nsweeper", color: "#4CAF50", route: "/games/minesweeper" },
      { icon: "extension-puzzle-outline", label: "Memory\nMatch", color: "#45B7D1", route: "/games/memory-match" },
    ],
  },
];

function ServiceIcon({ item }: { item: ServiceItem }) {
  const { colors } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const ITEM_SIZE = (screenW - 32 - 36) / 4;
  return (
    <TouchableOpacity
      style={[styles.serviceItem, { width: ITEM_SIZE }]}
      activeOpacity={0.6}
      onPress={() => router.push(item.route as any)}
    >
      <View style={[styles.iconCircle, { backgroundColor: item.color + "15" }]}>
        <Ionicons name={item.icon} size={26} color={item.color} />
      </View>
      <Text style={[styles.serviceLabel, { color: colors.textSecondary }]} numberOfLines={2}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );
}

export default function PayAndServicesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Pay and Services</Text>
        <TouchableOpacity hitSlop={12} onPress={() => router.push({ pathname: "/mini-programs/fee-details" as any, params: { service: "airtime", amount: "100", fee: "2", total: "102" } })}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.topBanner, { backgroundColor: Colors.brand }]}>
          <TouchableOpacity style={styles.topBtn} activeOpacity={0.7} onPress={() => router.push("/mini-programs/transfer" as any)}>
            <View style={styles.topIconWrap}>
              <Ionicons name="swap-horizontal" size={28} color="#fff" />
            </View>
            <Text style={styles.topLabel}>Money</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} activeOpacity={0.7} onPress={() => router.push("/wallet" as any)}>
            <View style={styles.topIconWrap}>
              <Ionicons name="wallet-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.topLabel}>Wallet</Text>
          </TouchableOpacity>
        </View>

        {SECTIONS.map((section) => (
          <View key={section.title} style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
            <View style={styles.serviceGrid}>
              {section.items.map((item) => (
                <ServiceIcon key={item.label} item={item} />
              ))}
            </View>
          </View>
        ))}
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
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { paddingHorizontal: 16, gap: 10, paddingTop: 12 },
  topBanner: {
    flexDirection: "row",
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 20,
    gap: 32,
  },
  topBtn: { alignItems: "center", gap: 8 },
  topIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  topLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  sectionCard: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
    marginLeft: 4,
  },
  serviceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  serviceItem: {
    alignItems: "center",
    marginBottom: 12,
    gap: 6,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 14,
  },
});
