import React, { useCallback, useEffect, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "@/lib/haptics";
import { spendAcoin, GAME_PRICES } from "@/lib/gameCoins";

const SHIP_SIZE = 36;
const BULLET_SPEED = 8;
const ENEMY_SPEED = 2;
const TICK = 16;

type Bullet = { x: number; y: number; id: number };
type Enemy = { x: number; y: number; id: number; type: number };

const ENEMY_EMOJIS = ["👾", "🛸", "👽", "🤖"];

export default function SpaceShooterGame() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SW, height: windowHeight } = useWindowDimensions();
  const gameH = windowHeight - insets.top - 56 - insets.bottom - 60;

  const [shipX, setShipX] = useState(SW / 2 - SHIP_SIZE / 2);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [wave, setWave] = useState(1);
  const [shield, setShield] = useState(false);

  const shipRef = useRef(SW / 2 - SHIP_SIZE / 2);
  const bulletsRef = useRef<Bullet[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const overRef = useRef(false);
  const shieldRef = useRef(false);
  const frameRef = useRef(0);
  const bulletIdRef = useRef(0);
  const enemyIdRef = useRef(0);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        const nx = Math.max(0, Math.min(SW - SHIP_SIZE, shipRef.current + gs.dx * 0.3));
        shipRef.current = nx;
        setShipX(nx);
      },
    })
  ).current;

  const shoot = useCallback(() => {
    if (overRef.current) return;
    const b: Bullet = { x: shipRef.current + SHIP_SIZE / 2 - 3, y: gameH - 60, id: bulletIdRef.current++ };
    bulletsRef.current.push(b);
    Haptics.selectionAsync();
  }, [gameH]);

  const tick = useCallback(() => {
    if (overRef.current) return;
    frameRef.current++;

    let bs = bulletsRef.current.map((b) => ({ ...b, y: b.y - BULLET_SPEED })).filter((b) => b.y > -10);

    if (frameRef.current % Math.max(60 - wave * 5, 15) === 0) {
      const type = Math.floor(Math.random() * ENEMY_EMOJIS.length);
      enemiesRef.current.push({
        x: Math.random() * (SW - 30),
        y: -30,
        id: enemyIdRef.current++,
        type,
      });
    }

    let es = enemiesRef.current.map((e) => ({ ...e, y: e.y + ENEMY_SPEED + wave * 0.3 }));

    const hitEnemies = new Set<number>();
    const hitBullets = new Set<number>();
    for (const b of bs) {
      for (const e of es) {
        if (Math.abs(b.x - e.x) < 25 && Math.abs(b.y - e.y) < 25) {
          hitEnemies.add(e.id);
          hitBullets.add(b.id);
          scoreRef.current += 10;
        }
      }
    }

    if (hitEnemies.size > 0) {
      setScore(scoreRef.current);
      if (scoreRef.current > 0 && scoreRef.current % 100 === 0) setWave((w) => w + 1);
    }

    bs = bs.filter((b) => !hitBullets.has(b.id));
    es = es.filter((e) => !hitEnemies.has(e.id));

    for (const e of es) {
      if (e.y > gameH - 50 && Math.abs(e.x - shipRef.current) < 40) {
        if (shieldRef.current) {
          shieldRef.current = false;
          setShield(false);
          es = es.filter((en) => en.id !== e.id);
          Haptics.notificationAsync("warning");
        } else {
          livesRef.current--;
          setLives(livesRef.current);
          es = es.filter((en) => en.id !== e.id);
          Haptics.notificationAsync("error");
          if (livesRef.current <= 0) {
            overRef.current = true;
            setGameOver(true);
            return;
          }
        }
      }
    }

    es = es.filter((e) => e.y < gameH + 30);

    bulletsRef.current = bs;
    enemiesRef.current = es;
    setBullets([...bs]);
    setEnemies([...es]);

    if (frameRef.current % 5 === 0) shoot();
  }, [gameH, shoot, wave]);

  useEffect(() => {
    if (!started || gameOver) {
      if (loopRef.current) clearInterval(loopRef.current);
      return;
    }
    loopRef.current = setInterval(tick, TICK);
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
  }, [started, gameOver, tick]);

  const startGame = () => {
    shipRef.current = SW / 2 - SHIP_SIZE / 2;
    bulletsRef.current = [];
    enemiesRef.current = [];
    scoreRef.current = 0;
    livesRef.current = 3;
    overRef.current = false;
    shieldRef.current = false;
    frameRef.current = 0;
    setShipX(SW / 2 - SHIP_SIZE / 2);
    setBullets([]);
    setEnemies([]);
    setScore(0);
    setLives(3);
    setGameOver(false);
    setStarted(true);
    setWave(1);
    setShield(false);
  };

  const handleShield = async () => {
    if (!user) return;
    const ok = await spendAcoin(user.id, GAME_PRICES.shield, "Space Shooter - Shield");
    if (ok) {
      Haptics.notificationAsync("success");
      shieldRef.current = true;
      setShield(true);
    }
  };

  const handleExtraLife = async () => {
    if (!user) return;
    const ok = await spendAcoin(user.id, GAME_PRICES.extraLife, "Space Shooter - Extra Life");
    if (ok) {
      Haptics.notificationAsync("success");
      livesRef.current = 3;
      overRef.current = false;
      setLives(3);
      setGameOver(false);
    }
  };

  if (!started) {
    return (
      <View style={[styles.root, { backgroundColor: "#0a0a2a" }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: "#00E676" }]}>Space Shooter</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.startScreen}>
          <Text style={styles.startEmoji}>🚀</Text>
          <Text style={[styles.startTitle, { color: "#00E676" }]}>Space Shooter</Text>
          <Text style={styles.startDesc}>Drag to move. Auto-fire. Destroy all enemies!</Text>
          <TouchableOpacity style={[styles.playBtn, { backgroundColor: "#00E676" }]} onPress={startGame}>
            <Ionicons name="play" size={24} color="#0a0a2a" />
            <Text style={[styles.playBtnText, { color: "#0a0a2a" }]}>Launch</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: "#0a0a2a" }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {Array.from({ length: lives }).map((_, i) => <Text key={i} style={{ fontSize: 16 }}>❤️</Text>)}
        </View>
        <Text style={styles.scoreDisplay}>🏆 {score}</Text>
        <TouchableOpacity style={styles.shieldBtn} onPress={handleShield}>
          <Text style={{ fontSize: 14 }}>{shield ? "🛡️" : "🛡"}</Text>
          <Text style={styles.shieldCost}>{GAME_PRICES.shield}🪙</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.gameArea, { height: gameH }]} {...panResponder.panHandlers}>
        {enemies.map((e) => (
          <Text key={e.id} style={[styles.enemy, { left: e.x, top: e.y }]}>
            {ENEMY_EMOJIS[e.type]}
          </Text>
        ))}

        {bullets.map((b) => (
          <View key={b.id} style={[styles.bullet, { left: b.x, top: b.y }]} />
        ))}

        <View style={[styles.ship, { left: shipX }]}>
          {shield && <View style={styles.shieldGlow} />}
          <Text style={{ fontSize: 28 }}>🚀</Text>
        </View>

        <Text style={styles.waveLabel}>Wave {wave}</Text>
      </View>

      {gameOver && (
        <View style={styles.overlay}>
          <View style={styles.goCard}>
            <Text style={styles.goTitle}>Destroyed!</Text>
            <Text style={[styles.goScore, { color: "#00E676" }]}>{score}</Text>
            <Text style={styles.goLabel}>Wave {wave}</Text>
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
  scoreDisplay: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFD700" },
  shieldBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  shieldCost: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#FFD700" },
  gameArea: { position: "relative", overflow: "hidden" },
  ship: { position: "absolute", bottom: 20, width: SHIP_SIZE, height: SHIP_SIZE, alignItems: "center", justifyContent: "center" },
  shieldGlow: { position: "absolute", width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(0,230,118,0.2)", borderWidth: 2, borderColor: "#00E676" },
  bullet: { position: "absolute", width: 4, height: 12, backgroundColor: "#00E676", borderRadius: 2 },
  enemy: { position: "absolute", fontSize: 24 },
  waveLabel: { position: "absolute", top: 10, alignSelf: "center", fontSize: 12, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.3)" },
  startScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  startEmoji: { fontSize: 80 },
  startTitle: { fontSize: 36, fontFamily: "Inter_700Bold" },
  startDesc: { fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "center" },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 20 },
  playBtnText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", zIndex: 20 },
  goCard: { backgroundColor: "#0a0a2a", borderRadius: 24, padding: 32, alignItems: "center", gap: 8, width: 280, borderWidth: 1, borderColor: "#1a3a1a" },
  goTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  goScore: { fontSize: 56, fontFamily: "Inter_700Bold" },
  goLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  coinBtn: { backgroundColor: "#FFD700", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, marginTop: 8 },
  coinBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#0a0a2a" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, marginTop: 4 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
