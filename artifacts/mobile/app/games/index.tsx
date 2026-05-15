import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";

const GAMES = [
  { id: "brick-breaker", label: "Brick Breaker", icon: "browsers-outline" },
  { id: "flappy", label: "Flappy Bird", icon: "airplane-outline" },
  { id: "game-2048", label: "2048", icon: "grid-outline" },
  { id: "memory-match", label: "Memory Match", icon: "copy-outline" },
  { id: "minesweeper", label: "Minesweeper", icon: "nuclear-outline" },
  { id: "snake", label: "Snake", icon: "infinite-outline" },
  { id: "space-shooter", label: "Space Shooter", icon: "planet-outline" },
  { id: "tetris", label: "Tetris", icon: "apps-outline" },
];

export default function GamesIndex() {
  const router = useRouter();
  return (
    <View style={s.root}>
      <Text style={s.title}>Games</Text>
      <View style={s.grid}>
        {GAMES.map((g) => (
          <TouchableOpacity key={g.id} style={s.card} onPress={() => router.push(`/games/${g.id}` as any)}>
            <Ionicons name={g.icon as any} size={32} color="#00BCD4" />
            <Text style={s.label}>{g.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a", padding: 20 },
  title: { color: "#fff", fontSize: 24, fontWeight: "700", marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { width: "47%", backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16, alignItems: "center", gap: 8 },
  label: { color: "#fff", fontSize: 13, textAlign: "center" },
});
