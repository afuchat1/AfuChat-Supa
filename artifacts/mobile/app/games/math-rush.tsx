import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";

type Problem = { display: string; answer: number };

function generateProblem(): Problem {
  const ops = ["+", "-", "×"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a: number, b: number, answer: number;
  switch (op) {
    case "+":
      a = Math.floor(Math.random() * 50) + 1;
      b = Math.floor(Math.random() * 50) + 1;
      answer = a + b;
      break;
    case "-":
      a = Math.floor(Math.random() * 50) + 10;
      b = Math.floor(Math.random() * a);
      answer = a - b;
      break;
    case "×":
      a = Math.floor(Math.random() * 12) + 2;
      b = Math.floor(Math.random() * 12) + 2;
      answer = a * b;
      break;
    default:
      a = 1; b = 1; answer = 2;
  }
  return { display: `${a} ${op} ${b}`, answer };
}

const GAME_DURATION = 60;

export default function MathRushScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [problem, setProblem] = useState<Problem>(generateProblem);
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [flash, setFlash] = useState<"correct" | "wrong" | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const iv = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { setGameOver(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [gameStarted, gameOver]);

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    if (!gameStarted) setGameStarted(true);
    const num = parseInt(input, 10);
    if (num === problem.answer) {
      setScore((s) => s + 1);
      setFlash("correct");
      Haptics.notificationAsync("success");
    } else {
      setFlash("wrong");
      Haptics.notificationAsync("error");
    }
    setProblem(generateProblem());
    setInput("");
    setTimeout(() => setFlash(null), 300);
  }, [input, problem, gameStarted]);

  const start = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setInput("");
    setProblem(generateProblem());
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  if (!gameStarted && !gameOver) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Math Rush</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.startContainer}>
          <Text style={styles.startEmoji}>🔢</Text>
          <Text style={[styles.startTitle, { color: colors.text }]}>Math Rush</Text>
          <Text style={[styles.startDesc, { color: colors.textSecondary }]}>
            Solve as many math problems as you can in {GAME_DURATION} seconds!
          </Text>
          <TouchableOpacity style={[styles.startBtn, { backgroundColor: Colors.brand }]} onPress={start}>
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.startBtnText}>Start</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (gameOver) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Math Rush</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.resultContainer}>
          <Text style={styles.resultEmoji}>{score >= 20 ? "🏆" : score >= 10 ? "⚡" : "🧮"}</Text>
          <Text style={[styles.resultTitle, { color: colors.text }]}>Time's Up!</Text>
          <Text style={[styles.resultScore, { color: Colors.brand }]}>{score}</Text>
          <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>problems solved</Text>
          <TouchableOpacity style={[styles.restartBtn, { backgroundColor: Colors.brand }]} onPress={start}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.restartText}>Play Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const timerColor = timeLeft <= 10 ? "#FF3B30" : timeLeft <= 20 ? "#FF9500" : Colors.brand;

  return (
    <View style={[styles.root, { backgroundColor: flash === "correct" ? "#34C75910" : flash === "wrong" ? "#FF3B3010" : colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Math Rush</Text>
        <Text style={[styles.timerText, { color: timerColor }]}>{timeLeft}s</Text>
      </View>

      <View style={styles.gameArea}>
        <View style={[styles.scoreChip, { backgroundColor: colors.surface }]}>
          <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Score</Text>
          <Text style={[styles.scoreValue, { color: Colors.brand }]}>{score}</Text>
        </View>

        <View style={[styles.problemCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.problemText, { color: colors.text }]}>{problem.display} = ?</Text>
        </View>

        <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.text }]}
            value={input}
            onChangeText={setInput}
            keyboardType="number-pad"
            placeholder="Answer"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
            autoFocus
          />
          <TouchableOpacity style={[styles.goBtn, { backgroundColor: Colors.brand }]} onPress={handleSubmit}>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
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
  timerText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  startContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  startEmoji: { fontSize: 64 },
  startTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  startDesc: { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center" },
  startBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16 },
  startBtnText: { color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  gameArea: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", gap: 24 },
  scoreChip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, alignItems: "center" },
  scoreLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  scoreValue: { fontSize: 32, fontFamily: "Inter_700Bold" },
  problemCard: { padding: 32, borderRadius: 20, width: "100%", alignItems: "center" },
  problemText: { fontSize: 36, fontFamily: "Inter_700Bold" },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, overflow: "hidden", width: "100%" },
  input: { flex: 1, fontSize: 24, fontFamily: "Inter_600SemiBold", paddingVertical: 14, paddingHorizontal: 20, textAlign: "center" },
  goBtn: { paddingHorizontal: 20, paddingVertical: 18 },
  resultContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  resultEmoji: { fontSize: 64 },
  resultTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  resultScore: { fontSize: 64, fontFamily: "Inter_700Bold" },
  resultLabel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  restartBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginTop: 16 },
  restartText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
