import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";

type Question = { q: string; options: string[]; answer: number };

const QUESTIONS: Question[] = [
  { q: "What planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], answer: 1 },
  { q: "How many continents are there?", options: ["5", "6", "7", "8"], answer: 2 },
  { q: "What is the largest ocean?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
  { q: "Who painted the Mona Lisa?", options: ["Van Gogh", "Picasso", "Da Vinci", "Michelangelo"], answer: 2 },
  { q: "What is the hardest natural substance?", options: ["Gold", "Iron", "Diamond", "Platinum"], answer: 2 },
  { q: "How many bones are in the human body?", options: ["106", "206", "306", "186"], answer: 1 },
  { q: "What country has the most people?", options: ["USA", "India", "China", "Indonesia"], answer: 1 },
  { q: "What year did the Titanic sink?", options: ["1905", "1912", "1920", "1898"], answer: 1 },
  { q: "What is the smallest country?", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], answer: 1 },
  { q: "Which gas do plants absorb?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], answer: 2 },
  { q: "What is the speed of light?", options: ["300 km/s", "300,000 km/s", "30,000 km/s", "3,000 km/s"], answer: 1 },
  { q: "Who wrote Romeo and Juliet?", options: ["Dickens", "Shakespeare", "Austen", "Tolkien"], answer: 1 },
  { q: "What is the largest mammal?", options: ["Elephant", "Blue Whale", "Giraffe", "Hippo"], answer: 1 },
  { q: "How many hearts does an octopus have?", options: ["1", "2", "3", "4"], answer: 2 },
  { q: "What is the chemical symbol for gold?", options: ["Go", "Gd", "Au", "Ag"], answer: 2 },
  { q: "Which planet has the most moons?", options: ["Jupiter", "Saturn", "Uranus", "Neptune"], answer: 1 },
  { q: "What is the tallest mountain?", options: ["K2", "Kangchenjunga", "Everest", "Lhotse"], answer: 2 },
  { q: "How many strings does a violin have?", options: ["3", "4", "5", "6"], answer: 1 },
  { q: "What is the capital of Japan?", options: ["Osaka", "Kyoto", "Tokyo", "Nagoya"], answer: 2 },
  { q: "Which element has atomic number 1?", options: ["Helium", "Hydrogen", "Lithium", "Carbon"], answer: 1 },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function TriviaScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [questions] = useState(() => shuffle(QUESTIONS).slice(0, 10));
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleSelect = useCallback((idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    const correct = idx === questions[current].answer;
    if (correct) {
      setScore((s) => s + 1);
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak > bestStreak) setBestStreak(newStreak);
      Haptics.notificationAsync("success");
    } else {
      setStreak(0);
      Haptics.notificationAsync("error");
    }
    timerRef.current = setTimeout(() => {
      if (current + 1 >= questions.length) setGameOver(true);
      else { setCurrent((c) => c + 1); setSelected(null); }
    }, 1200);
  }, [selected, current, questions, streak, bestStreak]);

  const restart = () => {
    setCurrent(0);
    setScore(0);
    setSelected(null);
    setGameOver(false);
    setStreak(0);
    setBestStreak(0);
  };

  if (gameOver) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Trivia Quiz</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.resultContainer}>
          <Text style={styles.resultEmoji}>{score >= 8 ? "🧠" : score >= 5 ? "📚" : "🤔"}</Text>
          <Text style={[styles.resultTitle, { color: colors.text }]}>Game Over!</Text>
          <Text style={[styles.resultScore, { color: Colors.brand }]}>{score}/{questions.length}</Text>
          <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>Best streak: {bestStreak}</Text>
          <TouchableOpacity style={[styles.restartBtn, { backgroundColor: Colors.brand }]} onPress={restart}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.restartText}>Play Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const question = questions[current];

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Trivia Quiz</Text>
        <Text style={[styles.scoreText, { color: Colors.brand }]}>{score}/{questions.length}</Text>
      </View>

      <View style={styles.gameArea}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((current + 1) / questions.length) * 100}%`, backgroundColor: Colors.brand }]} />
        </View>

        {streak >= 2 && (
          <View style={[styles.streakBadge, { backgroundColor: "#FFD60A" }]}>
            <Text style={styles.streakText}>🔥 {streak} streak!</Text>
          </View>
        )}

        <View style={[styles.questionCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.questionNum, { color: Colors.brand }]}>Question {current + 1}</Text>
          <Text style={[styles.questionText, { color: colors.text }]}>{question.q}</Text>
        </View>

        <View style={styles.optionsCol}>
          {question.options.map((opt, idx) => {
            const isCorrect = idx === question.answer;
            const isSelected = idx === selected;
            let bg = colors.surface;
            let border = colors.border;
            let textColor = colors.text;
            if (selected !== null) {
              if (isCorrect) { bg = "#34C759"; border = "#34C759"; textColor = "#fff"; }
              else if (isSelected) { bg = "#FF3B30"; border = "#FF3B30"; textColor = "#fff"; }
            }
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.optionBtn, { backgroundColor: bg, borderColor: border }]}
                onPress={() => handleSelect(idx)}
                disabled={selected !== null}
              >
                <View style={[styles.optionLetter, { backgroundColor: selected !== null && (isCorrect || isSelected) ? "rgba(255,255,255,0.3)" : Colors.brand + "20" }]}>
                  <Text style={[styles.letterText, { color: selected !== null && (isCorrect || isSelected) ? "#fff" : Colors.brand }]}>
                    {String.fromCharCode(65 + idx)}
                  </Text>
                </View>
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
  gameArea: { flex: 1, padding: 20, gap: 16 },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: "#E5E5EA", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  streakBadge: { alignSelf: "center", paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12 },
  streakText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  questionCard: { borderRadius: 16, padding: 20, gap: 8 },
  questionNum: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  questionText: { fontSize: 18, fontFamily: "Inter_600SemiBold", lineHeight: 26 },
  optionsCol: { gap: 10 },
  optionBtn: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  optionLetter: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  letterText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  optionText: { fontSize: 15, fontFamily: "Inter_500Medium", flex: 1 },
  resultContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  resultEmoji: { fontSize: 64 },
  resultTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  resultScore: { fontSize: 48, fontFamily: "Inter_700Bold" },
  resultLabel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  restartBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginTop: 16 },
  restartText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
