import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { LinearGradient } from "@/components/ui/SafeGradient";

type Game = {
  id: string;
  name: string;
  genre: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  gradient: [string, string];
};

const GAMES: Game[] = [
  { id: "quiz",    name: "AfuQuiz",    genre: "Trivia",     icon: "help-circle", gradient: ["#FF9500", "#FFCC00"] },
  { id: "word",    name: "AfuWords",   genre: "Word",       icon: "text",        gradient: ["#34C759", "#30D158"] },
  { id: "chess",   name: "AfuChess",   genre: "Strategy",   icon: "grid",        gradient: ["#1C1C1E", "#3A3A3C"] },
  { id: "runner",  name: "AfuRun",     genre: "Action",     icon: "flash",       gradient: ["#FF3B30", "#FF6B35"] },
  { id: "cards",   name: "AfuCards",   genre: "Card",       icon: "card",        gradient: ["#5856D6", "#7B79E8"] },
  { id: "predict", name: "AfuPredict", genre: "Prediction", icon: "analytics",   gradient: ["#1018D8", "#0B10A8"] },
];

export default function AfuGamesApp() {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <LinearGradient
        colors={["#FF3B30", "#FF6B35"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
            <Ionicons name="game-controller" size={44} color="#FFFFFF" />
        <Text style={styles.heroTitle}>{"AfuGames"}</Text>
        <Text style={styles.heroSub}>
          {"Play with friends inside AfuChat.\nMini games coming soon!"}
        </Text>
      </LinearGradient>

      {/* Games grid — all coming soon, no fake player counts */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, paddingHorizontal: 16 }]}>
        {"COMING SOON"}
      </Text>
      <View style={styles.gamesGrid}>
        {GAMES.map((g) => (
          <View key={g.id} style={[styles.gameCard, { backgroundColor: colors.surface, opacity: 0.75 }]}>
            <LinearGradient
              colors={g.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gameIcon}
            >
              <Ionicons name={g.icon} size={26} color="#fff" />
            </LinearGradient>
            <Text style={[styles.gameName, { color: colors.text }]} numberOfLines={1}>
              {g.name}
            </Text>
            <Text style={[styles.gameGenre, { color: colors.textMuted }]}>
              {g.genre}
            </Text>
            <View style={[styles.soonBadge, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.soonText, { color: colors.textMuted }]}>{"Soon"}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Leaderboard — launches with games, not hardcoded */}
      <View style={[styles.launchCard, { backgroundColor: colors.surface, borderColor: accent + "33" }]}>
        <Ionicons name="trophy-outline" size={26} color={accent} />
        <Text style={[styles.launchTitle, { color: colors.text }]}>
          {"Leaderboard launching with games"}
        </Text>
        <Text style={[styles.launchSub, { color: colors.textMuted }]}>
                    {"Real rankings from real players. Coming when games go live."}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    margin: 16,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  heroTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  heroSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  gamesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 10,
    marginBottom: 16,
  },
  gameCard: {
    width: "29%",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  gameIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  gameName: { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  gameGenre: { fontSize: 10, fontFamily: "Inter_400Regular" },
  soonBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  soonText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  launchCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  launchTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  launchSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
