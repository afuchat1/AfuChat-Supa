import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";
import { spendAcoin, GAME_PRICES } from "@/lib/gameCoins";

const GRID = 20;
const INITIAL_SPEED = 150;

type Pos = { x: number; y: number };
type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";

function randomFood(snake: Pos[]): Pos {
  let pos: Pos;
  do {
    pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
  } while (snake.some((s) => s.x === pos.x && s.y === pos.y));
  return pos;
}

export default function SnakeGame() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const CELL = Math.floor((windowWidth - 32) / GRID);
  const [snake, setSnake] = useState<Pos[]>([{ x: 10, y: 10 }]);
  const [food, setFood] = useState<Pos>({ x: 15, y: 10 });
  const [dir, setDir] = useState<Dir>("RIGHT");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  const [showCoinOffer, setShowCoinOffer] = useState(false);
  const dirRef = useRef<Dir>("RIGHT");
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startGame = () => {
    setSnake([{ x: 10, y: 10 }]);
    setFood(randomFood([{ x: 10, y: 10 }]));
    dirRef.current = "RIGHT";
    setDir("RIGHT");
    setScore(0);
    setGameOver(false);
    setPaused(false);
    setStarted(true);
    setSpeed(INITIAL_SPEED);
    setShowCoinOffer(false);
  };

  const tick = useCallback(() => {
    setSnake((prev) => {
      const head = prev[0];
      const d = dirRef.current;
      const newHead: Pos = {
        x: d === "LEFT" ? head.x - 1 : d === "RIGHT" ? head.x + 1 : head.x,
        y: d === "UP" ? head.y - 1 : d === "DOWN" ? head.y + 1 : head.y,
      };

      if (newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID) {
        setGameOver(true);
        setShowCoinOffer(true);
        Haptics.notificationAsync("error");
        return prev;
      }
      if (prev.some((s) => s.x === newHead.x && s.y === newHead.y)) {
        setGameOver(true);
        setShowCoinOffer(true);
        Haptics.notificationAsync("error");
        return prev;
      }

      const newSnake = [newHead, ...prev];
      setFood((f) => {
        if (newHead.x === f.x && newHead.y === f.y) {
          setScore((s) => {
            const ns = s + 10;
            if (ns % 50 === 0) setSpeed((sp) => Math.max(sp - 10, 60));
            return ns;
          });
          Haptics.selectionAsync();
          setTimeout(() => setFood(randomFood(newSnake)), 0);
          return f;
        }
        newSnake.pop();
        return f;
      });
      return newSnake;
    });
  }, []);

  useEffect(() => {
    if (!started || gameOver || paused) {
      if (loopRef.current) clearInterval(loopRef.current);
      return;
    }
    loopRef.current = setInterval(tick, speed);
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
  }, [started, gameOver, paused, speed, tick]);

  useEffect(() => {
    if (gameOver && score > highScore) setHighScore(score);
  }, [gameOver, score]);

  const changeDir = (newDir: Dir) => {
    const opp: Record<Dir, Dir> = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };
    if (newDir !== opp[dirRef.current]) {
      dirRef.current = newDir;
      setDir(newDir);
      Haptics.selectionAsync();
    }
  };

  const handleContinue = async () => {
    if (!user) return;
    const ok = await spendAcoin(user.id, GAME_PRICES.extraLife, "Snake - Extra Life");
    if (ok) {
      Haptics.notificationAsync("success");
      const head = snake[0];
      const safeHead = { x: Math.min(Math.max(head.x, 2), GRID - 3), y: Math.min(Math.max(head.y, 2), GRID - 3) };
      setSnake([safeHead, { x: safeHead.x - 1, y: safeHead.y }, { x: safeHead.x - 2, y: safeHead.y }]);
      setGameOver(false);
      setShowCoinOffer(false);
    } else {
      Haptics.notificationAsync("error");
    }
  };

  if (!started) {
    return (
      <View style={[styles.root, { backgroundColor: "#1a1a2e" }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: "#333" }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: "#fff" }]}>Snake</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.startScreen}>
          <Text style={styles.startEmoji}>🐍</Text>
          <Text style={styles.startTitle}>Snake</Text>
          <Text style={styles.startDesc}>Swipe to change direction. Eat food to grow. Don't hit the walls or yourself!</Text>
          {highScore > 0 && <Text style={styles.highScoreText}>Best: {highScore}</Text>}
          <TouchableOpacity style={styles.playBtn} onPress={startGame}>
            <Ionicons name="play" size={24} color="#1a1a2e" />
            <Text style={styles.playBtnText}>Play</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: "#1a1a2e" }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: "#333" }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={[styles.scoreDisplay, { color: "#4ECDC4" }]}>🏆 {score}</Text>
        <TouchableOpacity onPress={() => setPaused(!paused)}>
          <Ionicons name={paused ? "play" : "pause"} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.boardWrap}>
        <View style={[styles.board, { width: GRID * CELL, height: GRID * CELL }]}>
          {snake.map((s, i) => (
            <View
              key={i}
              style={[styles.cell, {
                left: s.x * CELL,
                top: s.y * CELL,
                width: CELL - 1,
                height: CELL - 1,
                backgroundColor: i === 0 ? "#4ECDC4" : "#45B7A0",
                borderRadius: i === 0 ? 4 : 2,
              }]}
            />
          ))}
          <View style={[styles.cell, {
            left: food.x * CELL,
            top: food.y * CELL,
            width: CELL - 1,
            height: CELL - 1,
            backgroundColor: "#FF6B6B",
            borderRadius: CELL / 2,
          }]} />
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <View style={styles.controlSpacer} />
          <TouchableOpacity style={styles.controlBtn} onPress={() => changeDir("UP")}>
            <Ionicons name="chevron-up" size={32} color="#fff" />
          </TouchableOpacity>
          <View style={styles.controlSpacer} />
        </View>
        <View style={styles.controlRow}>
          <TouchableOpacity style={styles.controlBtn} onPress={() => changeDir("LEFT")}>
            <Ionicons name="chevron-back" size={32} color="#fff" />
          </TouchableOpacity>
          <View style={[styles.controlBtn, { backgroundColor: "transparent" }]} />
          <TouchableOpacity style={styles.controlBtn} onPress={() => changeDir("RIGHT")}>
            <Ionicons name="chevron-forward" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.controlRow}>
          <View style={styles.controlSpacer} />
          <TouchableOpacity style={styles.controlBtn} onPress={() => changeDir("DOWN")}>
            <Ionicons name="chevron-down" size={32} color="#fff" />
          </TouchableOpacity>
          <View style={styles.controlSpacer} />
        </View>
      </View>

      {gameOver && (
        <View style={styles.overlay}>
          <View style={styles.gameOverCard}>
            <Text style={styles.goTitle}>Game Over</Text>
            <Text style={styles.goScore}>{score}</Text>
            <Text style={styles.goLabel}>points</Text>
            {showCoinOffer && (
              <TouchableOpacity style={styles.coinBtn} onPress={handleContinue}>
                <Text style={styles.coinBtnText}>Continue • {GAME_PRICES.extraLife} ACoins</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.retryBtn} onPress={startGame}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryText}>New Game</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {paused && !gameOver && (
        <View style={styles.overlay}>
          <View style={styles.gameOverCard}>
            <Ionicons name="pause" size={48} color="#4ECDC4" />
            <Text style={[styles.goTitle, { marginTop: 8 }]}>Paused</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setPaused(false)}>
              <Ionicons name="play" size={18} color="#fff" />
              <Text style={styles.retryText}>Resume</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  scoreDisplay: { fontSize: 20, fontFamily: "Inter_700Bold" },
  boardWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  board: { backgroundColor: "#16213e", borderRadius: 8, position: "relative" },
  cell: { position: "absolute" },
  controls: { paddingBottom: 24, gap: 4 },
  controlRow: { flexDirection: "row", justifyContent: "center", gap: 4 },
  controlBtn: { width: 64, height: 64, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  controlSpacer: { width: 64, height: 64 },
  startScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  startEmoji: { fontSize: 80 },
  startTitle: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#4ECDC4" },
  startDesc: { fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "center" },
  highScoreText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#FFD700" },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#4ECDC4", paddingHorizontal: 32, paddingVertical: 16, borderRadius: 20 },
  playBtnText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#1a1a2e" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  gameOverCard: { backgroundColor: "#1a1a2e", borderRadius: 24, padding: 32, alignItems: "center", gap: 8, width: 280, borderWidth: 1, borderColor: "#333" },
  goTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  goScore: { fontSize: 56, fontFamily: "Inter_700Bold", color: "#4ECDC4" },
  goLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  coinBtn: { backgroundColor: "#FFD700", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, marginTop: 8 },
  coinBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#1a1a2e" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, marginTop: 4 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
