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

function useGameCardWidth() {
  const { width } = useWindowDimensions();
  return (width - 48) / 2;
}

type GameInfo = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  gradient: [string, string];
  route: string;
  tag?: string;
};

const FEATURED: GameInfo[] = [
  { id: "snake", title: "Snake", subtitle: "Classic arcade", icon: "🐍", gradient: ["#1a1a2e", "#00BCD4"], route: "/games/snake", tag: "Popular" },
  { id: "tetris", title: "Tetris", subtitle: "Block stacking", icon: "🧱", gradient: ["#0a0a1a", "#00BCD4"], route: "/games/tetris", tag: "Classic" },
  { id: "flappy", title: "Flappy Bird", subtitle: "Tap to fly", icon: "🐤", gradient: ["#70c5ce", "#ded895"], route: "/games/flappy", tag: "Hot" },
];

const ALL_GAMES: GameInfo[] = [
  { id: "game-2048", title: "2048", subtitle: "Sliding puzzle", icon: "🔢", gradient: ["#0f0e17", "#EDC22E"], route: "/games/game-2048" },
  { id: "space-shooter", title: "Space Shooter", subtitle: "Destroy aliens", icon: "🚀", gradient: ["#0a0a2a", "#00E676"], route: "/games/space-shooter" },
  { id: "brick-breaker", title: "Brick Breaker", subtitle: "Break 'em all", icon: "🧱", gradient: ["#1a0a2e", "#FF9800"], route: "/games/brick-breaker" },
  { id: "minesweeper", title: "Minesweeper", subtitle: "Find the mines", icon: "💣", gradient: ["#1a1a2e", "#4CAF50"], route: "/games/minesweeper" },
  { id: "memory-match", title: "Memory Match", subtitle: "Card pairs", icon: "🧠", gradient: ["#1a1a2e", "#45B7D1"], route: "/games/memory-match" },
];

export default function GamesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const CARD_W = useGameCardWidth();

  return (
    <View style={[styles.root, { backgroundColor: "#0a0a1a" }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Games</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Featured</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
          {FEATURED.map((game) => (
            <TouchableOpacity
              key={game.id}
              style={[styles.featuredCard, { backgroundColor: game.gradient[0] }]}
              activeOpacity={0.8}
              onPress={() => router.push(game.route as any)}
            >
              <View style={[styles.featuredGlow, { backgroundColor: game.gradient[1] + "30" }]} />
              <Text style={styles.featuredIcon}>{game.icon}</Text>
              <View>
                {game.tag && (
                  <View style={[styles.tagBadge, { backgroundColor: game.gradient[1] }]}>
                    <Text style={styles.tagText}>{game.tag}</Text>
                  </View>
                )}
                <Text style={styles.featuredTitle}>{game.title}</Text>
                <Text style={styles.featuredSub}>{game.subtitle}</Text>
              </View>
              <TouchableOpacity style={[styles.playPill, { backgroundColor: game.gradient[1] }]} onPress={() => router.push(game.route as any)}>
                <Ionicons name="play" size={16} color="#fff" />
                <Text style={styles.playPillText}>Play</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.coinBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.coinTitle}>Spend ACoins in Games</Text>
            <Text style={styles.coinDesc}>Buy extra lives, power-ups, and continues</Text>
          </View>
          <Text style={styles.coinIcon}>🪙</Text>
        </View>

        <Text style={styles.sectionTitle}>All Games</Text>
        <View style={styles.grid}>
          {ALL_GAMES.map((game) => (
            <TouchableOpacity
              key={game.id}
              style={[styles.gameCard, { backgroundColor: game.gradient[0], width: CARD_W }]}
              activeOpacity={0.8}
              onPress={() => router.push(game.route as any)}
            >
              <Text style={styles.cardIcon}>{game.icon}</Text>
              <Text style={styles.cardTitle}>{game.title}</Text>
              <Text style={styles.cardSub}>{game.subtitle}</Text>
              <View style={[styles.cardPlayBtn, { backgroundColor: game.gradient[1] + "40" }]}>
                <Ionicons name="play" size={12} color={game.gradient[1]} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  content: { paddingVertical: 8 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", paddingHorizontal: 16, marginTop: 16, marginBottom: 12 },
  featuredRow: { paddingHorizontal: 16, gap: 12 },
  featuredCard: { width: 200, borderRadius: 20, padding: 16, gap: 12, overflow: "hidden", position: "relative" },
  featuredGlow: { position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: 50 },
  featuredIcon: { fontSize: 40 },
  tagBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  tagText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  featuredTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  featuredSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },
  playPill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14 },
  playPillText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  coinBanner: { marginHorizontal: 16, marginTop: 16, flexDirection: "row", alignItems: "center", backgroundColor: "#FFD700" + "15", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#FFD700" + "30" },
  coinTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#FFD700" },
  coinDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", marginTop: 2 },
  coinIcon: { fontSize: 32 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12 },
  gameCard: { borderRadius: 16, padding: 14, gap: 6 },
  cardIcon: { fontSize: 32 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  cardSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  cardPlayBtn: { alignSelf: "flex-start", padding: 6, borderRadius: 10, marginTop: 4 },
});
