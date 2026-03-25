import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";

const WORDS = [
  "adventure", "beautiful", "champion", "discovery", "elephant",
  "freedom", "gravity", "horizon", "imagine", "journey",
  "kingdom", "library", "mountain", "network", "ocean",
  "paradise", "quantum", "rainbow", "sunrise", "thunder",
  "universe", "village", "whisper", "crystal", "dragon",
  "eclipse", "fortune", "glacier", "harmony", "island",
];

function scramble(word: string): string {
  const arr = word.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const result = arr.join("");
  return result === word ? scramble(word) : result;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function WordScrambleScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [words] = useState(() => shuffle(WORDS).slice(0, 10));
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [guess, setGuess] = useState("");
  const [scrambled, setScrambled] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [hints, setHints] = useState(3);
  const inputRef = useRef<TextInput>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  useEffect(() => {
    if (current < words.length) {
      setScrambled(scramble(words[current]));
      setGuess("");
      setFeedback(null);
    }
  }, [current]);

  const handleSubmit = useCallback(() => {
    if (!guess.trim()) return;
    const correct = guess.trim().toLowerCase() === words[current].toLowerCase();
    setFeedback(correct ? "correct" : "wrong");
    if (correct) {
      setScore((s) => s + 1);
      Haptics.notificationAsync("success");
    } else {
      Haptics.notificationAsync("error");
    }
    timerRef.current = setTimeout(() => {
      if (current + 1 >= words.length) setGameOver(true);
      else setCurrent((c) => c + 1);
    }, 1000);
  }, [guess, current, words]);

  const handleHint = () => {
    if (hints <= 0) return;
    setHints((h) => h - 1);
    const word = words[current];
    let revealed = guess.split("");
    for (let i = 0; i < word.length; i++) {
      if (!revealed[i] || revealed[i] !== word[i]) {
        revealed[i] = word[i];
        break;
      }
    }
    setGuess(revealed.join(""));
  };

  const restart = () => {
    setCurrent(0);
    setScore(0);
    setGuess("");
    setFeedback(null);
    setGameOver(false);
    setHints(3);
  };

  if (gameOver) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Word Scramble</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.resultContainer}>
          <Text style={styles.resultEmoji}>{score >= 8 ? "🏆" : score >= 5 ? "📝" : "💪"}</Text>
          <Text style={[styles.resultTitle, { color: colors.text }]}>Game Over!</Text>
          <Text style={[styles.resultScore, { color: Colors.brand }]}>{score}/{words.length}</Text>
          <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
            {score >= 8 ? "Word wizard!" : score >= 5 ? "Nice vocabulary!" : "Keep practicing!"}
          </Text>
          <TouchableOpacity style={[styles.restartBtn, { backgroundColor: Colors.brand }]} onPress={restart}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.restartText}>Play Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Word Scramble</Text>
        <Text style={[styles.scoreText, { color: Colors.brand }]}>{score}/{words.length}</Text>
      </View>

      <View style={styles.gameArea}>
        <Text style={[styles.progress, { color: colors.textMuted }]}>Round {current + 1} of {words.length}</Text>

        <View style={[styles.scrambleCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.scrambledWord, { color: Colors.brand }]}>
            {scrambled.toUpperCase().split("").join(" ")}
          </Text>
          <Text style={[styles.hintLength, { color: colors.textMuted }]}>{words[current].length} letters</Text>
        </View>

        <View style={[styles.inputRow, {
          backgroundColor: colors.surface,
          borderColor: feedback === "correct" ? "#34C759" : feedback === "wrong" ? "#FF3B30" : colors.border,
          borderWidth: feedback ? 2 : 1,
        }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.text }]}
            value={guess}
            onChangeText={setGuess}
            placeholder="Type your answer..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.hintBtn, { backgroundColor: colors.surface, opacity: hints > 0 ? 1 : 0.4 }]} onPress={handleHint} disabled={hints <= 0}>
            <Ionicons name="bulb-outline" size={18} color="#FFD60A" />
            <Text style={[styles.hintText, { color: colors.text }]}>Hint ({hints})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.submitBtn, { backgroundColor: Colors.brand }]} onPress={handleSubmit}>
            <Text style={styles.submitText}>Submit</Text>
            <Ionicons name="checkmark" size={18} color="#fff" />
          </TouchableOpacity>
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
  gameArea: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", gap: 20 },
  progress: { fontSize: 14, fontFamily: "Inter_500Medium" },
  scrambleCard: { padding: 24, borderRadius: 20, alignItems: "center", gap: 8, width: "100%" },
  scrambledWord: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  hintLength: { fontSize: 13, fontFamily: "Inter_400Regular" },
  inputRow: { width: "100%", borderRadius: 14, paddingHorizontal: 16 },
  input: { fontSize: 18, fontFamily: "Inter_500Medium", paddingVertical: 14, textAlign: "center" },
  actionRow: { flexDirection: "row", gap: 12, width: "100%" },
  hintBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14 },
  hintText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  submitBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14 },
  submitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  resultContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  resultEmoji: { fontSize: 64 },
  resultTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  resultScore: { fontSize: 48, fontFamily: "Inter_700Bold" },
  resultLabel: { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center" },
  restartBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginTop: 16 },
  restartText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
