import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { safeRouter } from "@/lib/navUtils";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useTheme } from "@/hooks/useTheme";

type WalletService = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  category: string;
  description: string;
  section: string;
};

// These are launchers only. The transaction screens live under the Wallet
// route so there is one source of truth for each operation.
const SERVICES: WalletService[] = [
  {
    id: "airtime",
    label: "Airtime",
    icon: "phone-portrait",
    color: "#34C759",
    category: "Mobile",
    description: "Buy airtime for any network",
    section: "airtime",
  },
  {
    id: "data-bundles",
    label: "Data Bundles",
    icon: "cellular",
    color: "#5856D6",
    category: "Mobile",
    description: "Buy mobile data bundles",
    section: "data-bundles",
  },
  {
    id: "bills",
    label: "Bills & Utilities",
    icon: "flash",
    color: "#FF9500",
    category: "Utilities",
    description: "Pay electricity, water and TV",
    section: "bills",
  },
  {
    id: "transfer",
    label: "Money Transfer",
    icon: "swap-horizontal",
    color: "#007AFF",
    category: "Money",
    description: "Send money from your wallet",
    section: "transfer",
  },
  {
    id: "hotels",
    label: "Hotels",
    icon: "bed",
    color: "#FF3B30",
    category: "Travel",
    description: "Find and book accommodation",
    section: "hotels",
  },
  {
    id: "tickets",
    label: "Event Tickets",
    icon: "ticket",
    color: "#AF52DE",
    category: "Entertainment",
    description: "Buy tickets for events",
    section: "tickets",
  },
  {
    id: "fee-details",
    label: "Fees",
    icon: "receipt",
    color: "#8E8E93",
    category: "Money",
    description: "See Wallet transaction fees",
    section: "fee-details",
  },
];

const CATEGORIES = ["All", ...Array.from(new Set(SERVICES.map((item) => item.category)))];

export default function AfuServicesApp({
  embedded = false,
  onBack,
}: {
  initialScreen?: string;
  embedded?: boolean;
  onBack?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = React.useState("All");

  const visibleServices =
    selectedCategory === "All"
      ? SERVICES
      : SERVICES.filter((item) => item.category === selectedCategory);

  function openService(service: WalletService) {
    // Push so the service's back action returns to Wallet > Services.
    safeRouter.push(`/app/afupay?section=${service.section}` as any);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {embedded && (
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
              paddingTop: Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back to wallet"
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Services</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              All inside Wallet
            </Text>
          </View>
          <View style={styles.headerButton} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={{
          paddingTop: embedded ? 0 : insets.top + 12,
          paddingBottom: insets.bottom + 96,
        }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={["#0A2E1F", "#062218"]} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="wallet" size={25} color="#34C759" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Wallet Services</Text>
            <Text style={styles.heroSubtitle}>
              Pay bills, top up and access useful services without leaving Wallet.
            </Text>
          </View>
        </LinearGradient>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {CATEGORIES.map((category) => {
            const selected = selectedCategory === category;
            return (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryButton,
                  {
                    backgroundColor: selected ? colors.accent : colors.inputBg,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => setSelectedCategory(category)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.categoryText,
                    { color: selected ? "#fff" : colors.textMuted },
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.grid}>
          {visibleServices.map((service) => (
            <TouchableOpacity
              key={service.id}
              style={[
                styles.serviceCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => openService(service)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={service.label}
            >
              <View style={[styles.serviceIcon, { backgroundColor: service.color + "18" }]}>
                <Ionicons name={service.icon} size={23} color={service.color} />
              </View>
              <Text style={[styles.serviceLabel, { color: colors.text }]}>
                {service.label}
              </Text>
              <Text style={[styles.serviceDescription, { color: colors.textMuted }]} numberOfLines={2}>
                {service.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginTop: 1,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    borderRadius: 20,
    padding: 18,
    gap: 14,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(52,199,89,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
  },
  categoryRow: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 10,
  },
  serviceCard: {
    width: "47%",
    minHeight: 142,
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 14,
    gap: 8,
  },
  serviceIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  serviceDescription: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_400Regular",
  },
});