import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";

const PUZZLES = [
  { emojis: "🌍🔥", answer: "global warming" },
  { emojis: "🎬🍿", answer: "movie" },
  { emojis: "🌙⭐", answer: "night sky" },
  { emojis: "🏖️☀️", answer: "beach" },
  { emojis: "🎂🎉", answer: "birthday" },
  { emojis: "❤️💔", answer: "heartbreak" },
  { emojis: "🎵🎸", answer: "rock music" },
  { emojis: "📱💬", answer: "texting" },
  { emojis: "🏠🔑", answer: "home" },
  { emojis: "✈️🌴", answer: "vacation" },
  { emojis: "🐶🦴", answer: "dog" },
  { emojis: "🌧️🌈", answer: "rainbow" },
  { emojis: "📚🤓", answer: "study" },
  { emojis: "🍕🧀", answer: "pizza" },
  { emojis: "⚽🏆", answer: "champion" },
  { emojis: "🎃👻", answer: "halloween" },
  { emojis: "🎅🎄", answer: "christmas" },
  { emojis: "💍👰", answer: "wedding" },
  { emojis: "🚀🌕", answer: "moon landing" },
  { emojis: "🎤🎶", answer: "singing" },
  { emojis: "🏋️💪", answer: "workout" },
  { emojis: "🍳🥓", answer: "breakfast" },
  { emojis: "🦁👑", answer: "lion king" },
  { emojis: "🌊🏄", answer: "surfing" },
  { emojis: "💻👨‍💻", answer: "coding" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateOptions(correct: string, all: string[]): string[] {
  const others = all.filter((a) => a !== correct);
  const picked = shuffle(others).slice(0, 3);
  return shuffle([correct, ...picked]);
}

export default function EmojiQuizScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [puzzles] = useState(() => shuffle(PUZZLES).slice(0, 10));
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState(false);

  const allAnswers = PUZZLES.map((p) => p.answer);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  useEffect(() => {
    if (current < puzzles.length) {
      setOptions(generateOptions(puzzles[current].answer, allAnswers));
      setSelected(null);
    }
  }, [current]);

  const handleSelect = useCallback((answer: string) => {
    if (selected) return;
    setSelected(answer);
    const correct = answer === puzzles[current].answer;
    if (correct) {
      setScore((s) => s + 1);
      Haptics.notificationAsync("success");
    } else {
      Haptics.notificationAsync("error");
    }
    timerRef.current = setTimeout(() => {
      if (current + 1 >= puzzles.length) {
        setGameOver(true);
      } else {
        setCurrent((c) => c + 1);
      }
    }, 1200);
  }, [selected, current, puzzles]);

  const restart = () => {
    setCurrent(0);
    setScore(0);
    setSelected(null);
    setGameOver(false);
  };

  if (gameOver) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Emoji Quiz</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.resultContainer}>
          <Text style={styles.resultEmoji}>{score >= 8 ? "🏆" : score >= 5 ? "🎉" : "💪"}</Text>
          <Text style={[styles.resultTitle, { color: colors.text }]}>Game Over!</Text>
          <Text style={[styles.resultScore, { color: Colors.brand }]}>{score}/{puzzles.length}</Text>
          <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
            {score >= 8 ? "Amazing! You're an emoji master!" : score >= 5 ? "Great job! Keep it up!" : "Good try! Play again to improve!"}
          </Text>
          <TouchableOpacity style={[styles.restartBtn, { backgroundColor: Colors.brand }]} onPress={restart}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.restartText}>Play Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const puzzle = puzzles[current];

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Emoji Quiz</Text>
        <Text style={[styles.scoreText, { color: Colors.brand }]}>{score}/{puzzles.length}</Text>
      </View>

      <View style={styles.gameArea}>
        <View style={styles.progressRow}>
          {puzzles.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i < current ? Colors.brand : i === current ? Colors.brand + "60" : colors.border }]} />
          ))}
        </View>

        <Text style={[styles.questionLabel, { color: colors.textSecondary }]}>What does this mean?</Text>
        <Text style={styles.emojiDisplay}>{puzzle.emojis}</Text>

        <View style={styles.optionsGrid}>
          {options.map((opt) => {
            const isCorrect = opt === puzzle.answer;
            const isSelected = opt === selected;
            let bg = colors.surface;
            let textColor = colors.text;
            if (selected) {
              if (isCorrect) { bg = "#34C759"; textColor = "#fff"; }
              else if (isSelected && !isCorrect) { bg = "#FF3B30"; textColor = "#fff"; }
            }
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.optionBtn, { backgroundColor: bg }]}
                onPress={() => handleSelect(opt)}
                disabled={!!selected}
              >
                <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  scoreText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  gameArea: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", gap: 24 },
  progressRow: { flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  questionLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  emojiDisplay: { fontSize: 64 },
  optionsGrid: { width: "100%", gap: 12 },
  optionBtn: { paddingVertical: 16, paddingHorizontal: 20, borderRadius: 14, alignItems: "center" },
  optionText: { fontSize: 16, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  resultContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  resultEmoji: { fontSize: 64 },
  resultTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  resultScore: { fontSize: 48, fontFamily: "Inter_700Bold" },
  resultLabel: { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center" },
  restartBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginTop: 16 },
  restartText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
