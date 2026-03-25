import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "@/lib/haptics";
import { spendAcoin, GAME_PRICES } from "@/lib/gameCoins";

const { width: SW, height: SH } = Dimensions.get("window");
const BIRD_SIZE = 30;
const GRAVITY = 0.6;
const JUMP = -9;
const PIPE_WIDTH = 52;
const GAP = 160;
const PIPE_SPEED = 3;
const TICK = 16;

type Pipe = { x: number; gapY: number; scored: boolean };

export default function FlappyGame() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const gameAreaTop = insets.top + 56;
  const gameH = SH - gameAreaTop - insets.bottom - 80;

  const [birdY, setBirdY] = useState(gameH / 2);
  const [velocity, setVelocity] = useState(0);
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [showCoinOffer, setShowCoinOffer] = useState(false);

  const birdRef = useRef(gameH / 2);
  const velRef = useRef(0);
  const pipesRef = useRef<Pipe[]>([]);
  const scoreRef = useRef(0);
  const overRef = useRef(false);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startGame = () => {
    birdRef.current = gameH / 2;
    velRef.current = 0;
    pipesRef.current = [];
    scoreRef.current = 0;
    overRef.current = false;
    setBirdY(gameH / 2);
    setVelocity(0);
    setPipes([]);
    setScore(0);
    setGameOver(false);
    setStarted(true);
    setShowCoinOffer(false);
  };

  const flap = () => {
    if (overRef.current) return;
    if (!started) startGame();
    velRef.current = JUMP;
    Haptics.selectionAsync();
  };

  const tick = useCallback(() => {
    if (overRef.current) return;

    velRef.current += GRAVITY;
    birdRef.current += velRef.current;

    if (birdRef.current < 0 || birdRef.current > gameH - BIRD_SIZE) {
      overRef.current = true;
      setGameOver(true);
      setShowCoinOffer(true);
      Haptics.notificationAsync("error");
      if (scoreRef.current > best) setBest(scoreRef.current);
      return;
    }

    let ps = pipesRef.current.map((p) => ({ ...p, x: p.x - PIPE_SPEED }));
    ps = ps.filter((p) => p.x > -PIPE_WIDTH);

    if (ps.length === 0 || ps[ps.length - 1].x < SW - 200) {
      ps.push({ x: SW, gapY: 60 + Math.random() * (gameH - GAP - 120), scored: false });
    }

    const bx = 60, by = birdRef.current;
    for (const p of ps) {
      if (bx + BIRD_SIZE > p.x && bx < p.x + PIPE_WIDTH) {
        if (by < p.gapY || by + BIRD_SIZE > p.gapY + GAP) {
          overRef.current = true;
          setGameOver(true);
          setShowCoinOffer(true);
          Haptics.notificationAsync("error");
          if (scoreRef.current > best) setBest(scoreRef.current);
          return;
        }
      }
      if (!p.scored && p.x + PIPE_WIDTH < bx) {
        p.scored = true;
        scoreRef.current++;
        setScore(scoreRef.current);
        Haptics.selectionAsync();
      }
    }

    pipesRef.current = ps;
    setBirdY(birdRef.current);
    setVelocity(velRef.current);
    setPipes([...ps]);
  }, [gameH, best]);

  useEffect(() => {
    if (!started || gameOver) {
      if (loopRef.current) clearInterval(loopRef.current);
      return;
    }
    loopRef.current = setInterval(tick, TICK);
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
  }, [started, gameOver, tick]);

  const handleContinue = async () => {
    if (!user) return;
    const ok = await spendAcoin(user.id, GAME_PRICES.continueGame, "Flappy - Continue");
    if (ok) {
      Haptics.notificationAsync("success");
      birdRef.current = gameH / 2;
      velRef.current = 0;
      overRef.current = false;
      setBirdY(gameH / 2);
      setGameOver(false);
      setShowCoinOffer(false);
    }
  };

  if (!started) {
    return (
      <View style={[styles.root, { backgroundColor: "#70c5ce" }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#543847" /></TouchableOpacity>
          <Text style={styles.headerTitle}>Flappy</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.startScreen}>
          <Text style={styles.startEmoji}>🐤</Text>
          <Text style={[styles.startTitle, { color: "#543847" }]}>Flappy Bird</Text>
          <Text style={[styles.startDesc, { color: "#543847aa" }]}>Tap to fly through the pipes!</Text>
          {best > 0 && <Text style={[styles.highScore, { color: "#543847" }]}>Best: {best}</Text>}
          <TouchableOpacity style={[styles.playBtn, { backgroundColor: "#543847" }]} onPress={startGame}>
            <Ionicons name="play" size={24} color="#70c5ce" />
            <Text style={[styles.playBtnText, { color: "#70c5ce" }]}>Play</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.ground, { bottom: insets.bottom }]} />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={flap}>
      <View style={[styles.root, { backgroundColor: "#70c5ce" }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#543847" /></TouchableOpacity>
          <View style={styles.scoreBubble}>
            <Text style={styles.scoreText}>{score}</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        <View style={[styles.gameArea, { height: gameH }]}>
          <View style={[styles.bird, { top: birdY, transform: [{ rotate: `${Math.min(velocity * 3, 90)}deg` }] }]}>
            <Text style={{ fontSize: 24 }}>🐤</Text>
          </View>

          {pipes.map((p, i) => (
            <React.Fragment key={i}>
              <View style={[styles.pipe, styles.pipeTop, { left: p.x, height: p.gapY, width: PIPE_WIDTH }]} />
              <View style={[styles.pipe, styles.pipeBottom, { left: p.x, top: p.gapY + GAP, height: gameH - p.gapY - GAP, width: PIPE_WIDTH }]} />
            </React.Fragment>
          ))}
        </View>

        <View style={[styles.ground, { bottom: insets.bottom }]} />

        {gameOver && (
          <View style={styles.overlay}>
            <View style={styles.goCard}>
              <Text style={styles.goTitle}>Game Over</Text>
              <Text style={[styles.goScore, { color: "#FFD700" }]}>{score}</Text>
              <Text style={styles.goLabel}>Best: {best}</Text>
              {showCoinOffer && (
                <TouchableOpacity style={styles.coinBtn} onPress={handleContinue}>
                  <Text style={styles.coinBtnText}>Continue • {GAME_PRICES.continueGame} ACoins</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.retryBtn} onPress={startGame}>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.retryText}>New Game</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, zIndex: 10 },
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#543847" },
  scoreBubble: { backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 4, borderRadius: 20 },
  scoreText: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#543847" },
  gameArea: { position: "relative", overflow: "hidden" },
  bird: { position: "absolute", left: 60, width: BIRD_SIZE, height: BIRD_SIZE, zIndex: 5 },
  pipe: { position: "absolute", backgroundColor: "#73bf2e", borderRadius: 4 },
  pipeTop: { top: 0 },
  pipeBottom: {},
  ground: { height: 20, backgroundColor: "#ded895" },
  startScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  startEmoji: { fontSize: 80 },
  startTitle: { fontSize: 36, fontFamily: "Inter_700Bold" },
  startDesc: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  highScore: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 20 },
  playBtnText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", zIndex: 20 },
  goCard: { backgroundColor: "#1a1a2e", borderRadius: 24, padding: 32, alignItems: "center", gap: 8, width: 280, borderWidth: 1, borderColor: "#333" },
  goTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  goScore: { fontSize: 56, fontFamily: "Inter_700Bold" },
  goLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  coinBtn: { backgroundColor: "#FFD700", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, marginTop: 8 },
  coinBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#1a1a2e" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, marginTop: 4 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
