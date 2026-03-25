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
import Colors from "@/constants/colors";

type GameInfo = {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  route: string;
};

const GAMES: GameInfo[] = [
  { id: "emoji-quiz", title: "Emoji Quiz", description: "Guess the word from emoji clues", icon: "🎯", color: "#FF6B6B", route: "/games/emoji-quiz" },
  { id: "word-scramble", title: "Word Scramble", description: "Unscramble the letters", icon: "🔤", color: "#4ECDC4", route: "/games/word-scramble" },
  { id: "memory-match", title: "Memory Match", description: "Find matching card pairs", icon: "🧠", color: "#45B7D1", route: "/games/memory-match" },
  { id: "trivia", title: "Trivia Quiz", description: "Test your knowledge", icon: "💡", color: "#96CEB4", route: "/games/trivia" },
  { id: "math-rush", title: "Math Rush", description: "Solve equations fast", icon: "🔢", color: "#DDA0DD", route: "/games/math-rush" },
];

export default function GamesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Games</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.banner, { backgroundColor: Colors.brand }]}>
          <Text style={styles.bannerIcon}>🎮</Text>
          <Text style={styles.bannerTitle}>Play & Win</Text>
          <Text style={styles.bannerSub}>Challenge yourself and earn bragging rights</Text>
        </View>

        <View style={styles.grid}>
          {GAMES.map((game) => (
            <TouchableOpacity
              key={game.id}
              style={[styles.gameCard, { backgroundColor: colors.surface }]}
              activeOpacity={0.7}
              onPress={() => router.push(game.route as any)}
            >
              <View style={[styles.iconCircle, { backgroundColor: game.color + "20" }]}>
                <Text style={styles.iconEmoji}>{game.icon}</Text>
              </View>
              <Text style={[styles.gameTitle, { color: colors.text }]}>{game.title}</Text>
              <Text style={[styles.gameDesc, { color: colors.textSecondary }]} numberOfLines={2}>{game.description}</Text>
              <View style={[styles.playBtn, { backgroundColor: game.color }]}>
                <Ionicons name="play" size={14} color="#fff" />
                <Text style={styles.playText}>Play</Text>
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
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 16 },
  banner: { borderRadius: 20, padding: 24, alignItems: "center", gap: 8 },
  bannerIcon: { fontSize: 40 },
  bannerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
  bannerSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gameCard: { width: "47%", borderRadius: 16, padding: 16, alignItems: "center", gap: 8, flexGrow: 1 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  iconEmoji: { fontSize: 28 },
  gameTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  gameDesc: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 16 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14, marginTop: 4 },
  playText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
