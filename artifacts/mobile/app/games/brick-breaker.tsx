import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "@/lib/haptics";
import { spendAcoin, GAME_PRICES } from "@/lib/gameCoins";

const { width: SW } = Dimensions.get("window");
const PADDLE_W = 80;
const PADDLE_H = 14;
const BALL_R = 8;
const BRICK_ROWS = 5;
const BRICK_COLS = 7;
const BRICK_H = 22;
const BRICK_GAP = 4;
const BRICK_W = Math.floor((SW - 32 - BRICK_GAP * (BRICK_COLS + 1)) / BRICK_COLS);
const TICK = 16;

const COLORS = ["#F44336", "#FF9800", "#FFEB3B", "#4CAF50", "#2196F3"];

type Brick = { x: number; y: number; w: number; h: number; color: string; alive: boolean };
type Ball = { x: number; y: number; dx: number; dy: number };

function createBricks(): Brick[] {
  const bricks: Brick[] = [];
  const startX = 16 + BRICK_GAP;
  const startY = 80;
  for (let r = 0; r < BRICK_ROWS; r++)
    for (let c = 0; c < BRICK_COLS; c++)
      bricks.push({
        x: startX + c * (BRICK_W + BRICK_GAP),
        y: startY + r * (BRICK_H + BRICK_GAP),
        w: BRICK_W,
        h: BRICK_H,
        color: COLORS[r],
        alive: true,
      });
  return bricks;
}

export default function BrickBreakerGame() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const gameH = Dimensions.get("window").height - insets.top - 56 - insets.bottom - 20;

  const [paddleX, setPaddleX] = useState(SW / 2 - PADDLE_W / 2);
  const [ball, setBall] = useState<Ball>({ x: SW / 2, y: gameH - 60, dx: 3, dy: -3 });
  const [bricks, setBricks] = useState<Brick[]>(createBricks);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [level, setLevel] = useState(1);

  const paddleRef = useRef(SW / 2 - PADDLE_W / 2);
  const ballRef = useRef({ x: SW / 2, y: gameH - 60, dx: 3, dy: -3 });
  const bricksRef = useRef(createBricks());
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const overRef = useRef(false);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        const nx = Math.max(16, Math.min(SW - 16 - PADDLE_W, paddleRef.current + gs.dx * 0.5));
        paddleRef.current = nx;
        setPaddleX(nx);
      },
    })
  ).current;

  const tick = useCallback(() => {
    if (overRef.current) return;
    const b = { ...ballRef.current };
    b.x += b.dx;
    b.y += b.dy;

    if (b.x <= 16 + BALL_R || b.x >= SW - 16 - BALL_R) b.dx = -b.dx;
    if (b.y <= BALL_R) b.dy = -b.dy;

    if (b.y >= gameH - 30 - BALL_R && b.y <= gameH - 20 &&
        b.x >= paddleRef.current && b.x <= paddleRef.current + PADDLE_W) {
      b.dy = -Math.abs(b.dy);
      const hit = (b.x - paddleRef.current) / PADDLE_W - 0.5;
      b.dx = hit * 6;
      Haptics.selectionAsync();
    }

    if (b.y > gameH) {
      livesRef.current--;
      setLives(livesRef.current);
      if (livesRef.current <= 0) {
        overRef.current = true;
        setGameOver(true);
        Haptics.notificationAsync("error");
      } else {
        b.x = SW / 2; b.y = gameH - 60; b.dx = 3; b.dy = -3;
        Haptics.notificationAsync("warning");
      }
    }

    const br = bricksRef.current;
    for (let i = 0; i < br.length; i++) {
      if (!br[i].alive) continue;
      const bk = br[i];
      if (b.x + BALL_R > bk.x && b.x - BALL_R < bk.x + bk.w &&
          b.y + BALL_R > bk.y && b.y - BALL_R < bk.y + bk.h) {
        br[i] = { ...bk, alive: false };
        b.dy = -b.dy;
        scoreRef.current += 10;
        setScore(scoreRef.current);
        Haptics.selectionAsync();
        break;
      }
    }

    if (br.every((bk) => !bk.alive)) {
      setLevel((l) => l + 1);
      const newBricks = createBricks();
      bricksRef.current = newBricks;
      setBricks(newBricks);
      b.x = SW / 2; b.y = gameH - 60; b.dx = 3 + level * 0.5; b.dy = -(3 + level * 0.5);
      Haptics.notificationAsync("success");
    }

    ballRef.current = b;
    bricksRef.current = br;
    setBall({ ...b });
    setBricks([...br]);
  }, [gameH, level]);

  useEffect(() => {
    if (!started || gameOver) {
      if (loopRef.current) clearInterval(loopRef.current);
      return;
    }
    loopRef.current = setInterval(tick, TICK);
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
  }, [started, gameOver, tick]);

  const startGame = () => {
    const newBricks = createBricks();
    paddleRef.current = SW / 2 - PADDLE_W / 2;
    ballRef.current = { x: SW / 2, y: gameH - 60, dx: 3, dy: -3 };
    bricksRef.current = newBricks;
    scoreRef.current = 0;
    livesRef.current = 3;
    overRef.current = false;
    setPaddleX(SW / 2 - PADDLE_W / 2);
    setBall({ x: SW / 2, y: gameH - 60, dx: 3, dy: -3 });
    setBricks(newBricks);
    setScore(0);
    setLives(3);
    setGameOver(false);
    setStarted(true);
    setLevel(1);
  };

  const handleExtraLife = async () => {
    if (!user) return;
    const ok = await spendAcoin(user.id, GAME_PRICES.extraLife, "Brick Breaker - Extra Life");
    if (ok) {
      Haptics.notificationAsync("success");
      livesRef.current = 3;
      overRef.current = false;
      ballRef.current = { x: SW / 2, y: gameH - 60, dx: 3, dy: -3 };
      setLives(3);
      setGameOver(false);
    }
  };

  if (!started) {
    return (
      <View style={[styles.root, { backgroundColor: "#1a0a2e" }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: "#FF9800" }]}>Brick Breaker</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.startScreen}>
          <Text style={styles.startEmoji}>🧱</Text>
          <Text style={[styles.startTitle, { color: "#FF9800" }]}>Brick Breaker</Text>
          <Text style={styles.startDesc}>Drag to move the paddle. Break all the bricks!</Text>
          <TouchableOpacity style={[styles.playBtn, { backgroundColor: "#FF9800" }]} onPress={startGame}>
            <Ionicons name="play" size={24} color="#1a0a2e" />
            <Text style={[styles.playBtnText, { color: "#1a0a2e" }]}>Play</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: "#1a0a2e" }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {Array.from({ length: lives }).map((_, i) => <Text key={i} style={{ fontSize: 16 }}>❤️</Text>)}
        </View>
        <Text style={styles.scoreDisplay}>{score}</Text>
        <Text style={styles.levelDisplay}>Lv.{level}</Text>
      </View>

      <View style={[styles.gameArea, { height: gameH }]} {...panResponder.panHandlers}>
        {bricks.filter((b) => b.alive).map((bk, i) => (
          <View key={i} style={[styles.brick, { left: bk.x, top: bk.y, width: bk.w, height: bk.h, backgroundColor: bk.color }]} />
        ))}

        <View style={[styles.ball, { left: ball.x - BALL_R, top: ball.y - BALL_R }]} />

        <View style={[styles.paddle, { left: paddleX, bottom: 20 }]} />
      </View>

      {gameOver && (
        <View style={styles.overlay}>
          <View style={styles.goCard}>
            <Text style={styles.goTitle}>Game Over</Text>
            <Text style={[styles.goScore, { color: "#FF9800" }]}>{score}</Text>
            <Text style={styles.goLabel}>Level {level}</Text>
            <TouchableOpacity style={styles.coinBtn} onPress={handleExtraLife}>
              <Text style={styles.coinBtnText}>Revive • {GAME_PRICES.extraLife} ACoins</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.retryBtn} onPress={startGame}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryText}>New Game</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, zIndex: 10 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  scoreDisplay: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#FFD700" },
  levelDisplay: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.5)" },
  gameArea: { position: "relative", overflow: "hidden" },
  brick: { position: "absolute", borderRadius: 4 },
  ball: { position: "absolute", width: BALL_R * 2, height: BALL_R * 2, borderRadius: BALL_R, backgroundColor: "#fff" },
  paddle: { position: "absolute", width: PADDLE_W, height: PADDLE_H, borderRadius: 7, backgroundColor: "#FF9800" },
  startScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  startEmoji: { fontSize: 80 },
  startTitle: { fontSize: 36, fontFamily: "Inter_700Bold" },
  startDesc: { fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "center" },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 20 },
  playBtnText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", zIndex: 20 },
  goCard: { backgroundColor: "#1a0a2e", borderRadius: 24, padding: 32, alignItems: "center", gap: 8, width: 280, borderWidth: 1, borderColor: "#333" },
  goTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  goScore: { fontSize: 48, fontFamily: "Inter_700Bold" },
  goLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  coinBtn: { backgroundColor: "#FFD700", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, marginTop: 8 },
  coinBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#1a0a2e" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, marginTop: 4 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
