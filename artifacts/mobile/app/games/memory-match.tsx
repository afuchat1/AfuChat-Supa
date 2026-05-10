import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { GlassHeader } from "@/components/ui/GlassHeader";
import * as Haptics from "@/lib/haptics";

const EMOJIS = ["🎸", "🌺", "🦋", "🍕", "🎨", "🚀", "🌈", "🎪"];

type Card = { id: number; emoji: string; flipped: boolean; matched: boolean };

function createDeck(): Card[] {
  const pairs = [...EMOJIS, ...EMOJIS];
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs.map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }));
}

export default function MemoryMatchScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<Card[]>(createDeck);
  const [flippedIds, setFlippedIds] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [locked, setLocked] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [timer, setTimer] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started || gameOver) return;
    const iv = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [started, gameOver]);

  const handleFlip = useCallback((id: number) => {
    if (locked) return;
    const card = cards[id];
    if (card.flipped || card.matched) return;
    if (!started) setStarted(true);

    const newCards = cards.map((c) => c.id === id ? { ...c, flipped: true } : c);
    setCards(newCards);
    Haptics.selectionAsync();

    const newFlipped = [...flippedIds, id];
    setFlippedIds(newFlipped);

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      setLocked(true);
      const [first, second] = newFlipped;
      if (newCards[first].emoji === newCards[second].emoji) {
        Haptics.notificationAsync("success");
        const matched = newCards.map((c) =>
          c.id === first || c.id === second ? { ...c, matched: true } : c
        );
        setCards(matched);
        setFlippedIds([]);
        setLocked(false);
        const newMatches = matches + 1;
        setMatches(newMatches);
        if (newMatches === EMOJIS.length) setGameOver(true);
      } else {
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === first || c.id === second ? { ...c, flipped: false } : c
            )
          );
          setFlippedIds([]);
          setLocked(false);
        }, 800);
      }
    }
  }, [cards, flippedIds, locked, started, matches]);

  const restart = () => {
    setCards(createDeck());
    setFlippedIds([]);
    setMoves(0);
    setMatches(0);
    setLocked(false);
    setGameOver(false);
    setTimer(0);
    setStarted(false);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const stars = moves <= 10 ? 3 : moves <= 16 ? 2 : 1;

  if (gameOver) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <GlassHeader title="Memory Match" />
        <View style={styles.resultContainer}>
          <Text style={styles.resultStars}>{"⭐".repeat(stars)}</Text>
          <Text style={[styles.resultTitle, { color: colors.text }]}>Complete!</Text>
          <Text style={[styles.resultStat, { color: colors.textSecondary }]}>{moves} moves in {formatTime(timer)}</Text>
          <TouchableOpacity style={[styles.restartBtn, { backgroundColor: colors.accent }]} onPress={restart}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.restartText}>Play Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Memory Match" />

      <View style={styles.statsRow}>
        <View style={[styles.statChip, { backgroundColor: colors.surface }]}>
          <Ionicons name="swap-horizontal" size={16} color={colors.accent} />
          <Text style={[styles.statVal, { color: colors.text }]}>{moves}</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: colors.surface }]}>
          <Ionicons name="time-outline" size={16} color={colors.accent} />
          <Text style={[styles.statVal, { color: colors.text }]}>{formatTime(timer)}</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: colors.surface }]}>
          <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
          <Text style={[styles.statVal, { color: colors.text }]}>{matches}/{EMOJIS.length}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {cards.map((card) => (
          <TouchableOpacity
            key={card.id}
            style={[
              styles.card,
              { backgroundColor: card.matched ? colors.accent + "20" : card.flipped ? colors.surface : colors.accent },
            ]}
            onPress={() => handleFlip(card.id)}
            activeOpacity={0.7}
            disabled={card.flipped || card.matched || locked}
          >
            <Text style={styles.cardEmoji}>
              {card.flipped || card.matched ? card.emoji : "?"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", justifyContent: "center", gap: 12, paddingVertical: 12 },
  statChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statVal: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, padding: 16 },
  card: { width: 72, height: 72, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardEmoji: { fontSize: 30 },
  resultContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  resultStars: { fontSize: 48 },
  resultTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  resultStat: { fontSize: 16, fontFamily: "Inter_400Regular" },
  restartBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginTop: 16 },
  restartText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
