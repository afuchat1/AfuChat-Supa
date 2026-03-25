import React, { useState } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

const CARD_W = (Dimensions.get("window").width - 48) / 2;

type ServiceInfo = {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  route: string;
  fee: string;
};

type GameInfo = {
  id: string;
  title: string;
  icon: string;
  color: string;
  route: string;
};

const SERVICES: ServiceInfo[] = [
  { id: "airtime", title: "Airtime", description: "Buy airtime for any network", icon: "📱", color: "#4CAF50", route: "/mini-programs/airtime", fee: "2%" },
  { id: "data", title: "Data Bundles", description: "Internet data packages", icon: "📶", color: "#2196F3", route: "/mini-programs/data-bundles", fee: "2%" },
  { id: "bills", title: "Pay Bills", description: "Electricity, water, TV & more", icon: "🧾", color: "#FF9800", route: "/mini-programs/bills", fee: "3%" },
  { id: "hotels", title: "Book Hotel", description: "Find & book hotels", icon: "🏨", color: "#9C27B0", route: "/mini-programs/hotels", fee: "5%" },
  { id: "tickets", title: "Buy Tickets", description: "Events, concerts & shows", icon: "🎫", color: "#FF6B6B", route: "/mini-programs/tickets", fee: "4%" },
  { id: "transfer", title: "Send Money", description: "Transfer to anyone", icon: "💸", color: "#00BCD4", route: "/mini-programs/transfer", fee: "1.5%" },
];

const GAMES: GameInfo[] = [
  { id: "snake", title: "Snake", icon: "🐍", color: "#4ECDC4", route: "/games/snake" },
  { id: "tetris", title: "Tetris", icon: "🧱", color: "#00BCD4", route: "/games/tetris" },
  { id: "game-2048", title: "2048", icon: "🔢", color: "#EDC22E", route: "/games/game-2048" },
  { id: "flappy", title: "Flappy", icon: "🐤", color: "#70c5ce", route: "/games/flappy" },
  { id: "space-shooter", title: "Shooter", icon: "🚀", color: "#00E676", route: "/games/space-shooter" },
  { id: "brick-breaker", title: "Bricks", icon: "🧱", color: "#FF9800", route: "/games/brick-breaker" },
  { id: "minesweeper", title: "Mines", icon: "💣", color: "#4CAF50", route: "/games/minesweeper" },
  { id: "memory-match", title: "Memory", icon: "🧠", color: "#45B7D1", route: "/games/memory-match" },
];

export default function MiniProgramsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const filteredServices = SERVICES.filter((s) =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredGames = GAMES.filter((g) =>
    !search || g.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Services</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.searchBar, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search services & games..."
            placeholderTextColor={colors.textMuted}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {(!search || filteredServices.length > 0) && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily Services</Text>
              <TouchableOpacity onPress={() => router.push({ pathname: "/mini-programs/fee-details" as any, params: { service: "airtime", amount: "100", fee: "2", total: "102" } })}>
                <Text style={[styles.viewFees, { color: Colors.brand }]}>View All Fees</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.serviceGrid}>
              {filteredServices.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.serviceCard, { backgroundColor: colors.surface }]}
                  activeOpacity={0.7}
                  onPress={() => router.push(s.route as any)}
                >
                  <View style={[styles.serviceIconWrap, { backgroundColor: s.color + "15" }]}>
                    <Text style={styles.serviceIcon}>{s.icon}</Text>
                  </View>
                  <Text style={[styles.serviceTitle, { color: colors.text }]}>{s.title}</Text>
                  <Text style={[styles.serviceDesc, { color: colors.textSecondary }]} numberOfLines={1}>{s.description}</Text>
                  <View style={[styles.feeBadge, { backgroundColor: s.color + "15" }]}>
                    <Text style={[styles.feeText, { color: s.color }]}>Fee: {s.fee}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={[styles.txBanner, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "30" }]}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.txTitle, { color: Colors.brand }]}>Secure Transactions</Text>
            <Text style={[styles.txDesc, { color: colors.textSecondary }]}>
              All payments are recorded with fee details. Your money is safe.
            </Text>
          </View>
        </View>

        {(!search || filteredGames.length > 0) && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Games</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gamesRow}>
              {filteredGames.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.gameCard, { backgroundColor: g.color + "15" }]}
                  activeOpacity={0.7}
                  onPress={() => router.push(g.route as any)}
                >
                  <Text style={styles.gameIcon}>{g.icon}</Text>
                  <Text style={[styles.gameTitle, { color: colors.text }]}>{g.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {filteredServices.length === 0 && filteredGames.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No results found</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  content: { paddingHorizontal: 16, gap: 16, paddingTop: 12 },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  viewFees: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  serviceCard: { width: CARD_W, borderRadius: 16, padding: 14, gap: 8 },
  serviceIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  serviceIcon: { fontSize: 24 },
  serviceTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  serviceDesc: { fontSize: 11, fontFamily: "Inter_400Regular" },
  feeBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  feeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  txBanner: { flexDirection: "row", gap: 10, borderRadius: 14, padding: 14, borderWidth: 1, alignItems: "flex-start" },
  txTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  txDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  gamesRow: { gap: 10 },
  gameCard: { width: 80, borderRadius: 14, padding: 12, alignItems: "center", gap: 6 },
  gameIcon: { fontSize: 28 },
  gameTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
