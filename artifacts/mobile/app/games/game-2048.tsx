import React, { useCallback, useState } from "react";
import { Dimensions, StyleSheet, Text, TouchableOpacity, View, PanResponder } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "@/lib/haptics";
import { spendAcoin, GAME_PRICES } from "@/lib/gameCoins";

const SIZE = 4;
const TILE_SIZE = Math.floor((Dimensions.get("window").width - 64) / SIZE);

type Grid = number[][];

const TILE_COLORS: Record<number, { bg: string; text: string }> = {
  0: { bg: "rgba(255,255,255,0.05)", text: "transparent" },
  2: { bg: "#eee4da", text: "#776e65" },
  4: { bg: "#ede0c8", text: "#776e65" },
  8: { bg: "#f2b179", text: "#fff" },
  16: { bg: "#f59563", text: "#fff" },
  32: { bg: "#f67c5f", text: "#fff" },
  64: { bg: "#f65e3b", text: "#fff" },
  128: { bg: "#edcf72", text: "#fff" },
  256: { bg: "#edcc61", text: "#fff" },
  512: { bg: "#edc850", text: "#fff" },
  1024: { bg: "#edc53f", text: "#fff" },
  2048: { bg: "#edc22e", text: "#fff" },
};

function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function addRandom(grid: Grid): Grid {
  const g = grid.map((r) => [...r]);
  const empty: [number, number][] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (g[r][c] === 0) empty.push([r, c]);
  if (empty.length === 0) return g;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  g[r][c] = Math.random() < 0.9 ? 2 : 4;
  return g;
}

function rotateRight(grid: Grid): Grid {
  const g = emptyGrid();
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      g[c][SIZE - 1 - r] = grid[r][c];
  return g;
}

function slideLeft(grid: Grid): { grid: Grid; score: number; moved: boolean } {
  let totalScore = 0;
  let moved = false;
  const g = grid.map((row) => {
    let tiles = row.filter((v) => v !== 0);
    const merged: number[] = [];
    for (let i = 0; i < tiles.length; i++) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
        merged.push(tiles[i] * 2);
        totalScore += tiles[i] * 2;
        i++;
      } else {
        merged.push(tiles[i]);
      }
    }
    while (merged.length < SIZE) merged.push(0);
    if (merged.some((v, idx) => v !== row[idx])) moved = true;
    return merged;
  });
  return { grid: g, score: totalScore, moved };
}

function moveGrid(grid: Grid, direction: string): { grid: Grid; score: number; moved: boolean } {
  let g = grid.map((r) => [...r]);
  let rotations = 0;
  if (direction === "right") rotations = 2;
  else if (direction === "up") rotations = 1;
  else if (direction === "down") rotations = 3;
  for (let i = 0; i < rotations; i++) g = rotateRight(g);
  const result = slideLeft(g);
  g = result.grid;
  for (let i = 0; i < (4 - rotations) % 4; i++) g = rotateRight(g);
  return { grid: g, score: result.score, moved: result.moved };
}

function canMove(grid: Grid): boolean {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 0) return true;
      if (c + 1 < SIZE && grid[r][c] === grid[r][c + 1]) return true;
      if (r + 1 < SIZE && grid[r][c] === grid[r + 1][c]) return true;
    }
  return false;
}

function hasWon(grid: Grid): boolean {
  return grid.some((row) => row.some((v) => v >= 2048));
}

function initGrid(): Grid {
  return addRandom(addRandom(emptyGrid()));
}

export default function Game2048() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [grid, setGrid] = useState<Grid>(initGrid);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [history, setHistory] = useState<{ grid: Grid; score: number }[]>([]);

  const handleMove = useCallback((direction: string) => {
    if (gameOver) return;
    const result = moveGrid(grid, direction);
    if (!result.moved) return;
    Haptics.selectionAsync();

    setHistory((h) => [...h.slice(-5), { grid, score }]);
    const newGrid = addRandom(result.grid);
    setGrid(newGrid);
    const newScore = score + result.score;
    setScore(newScore);
    if (newScore > best) setBest(newScore);

    if (hasWon(newGrid) && !won) {
      setWon(true);
      Haptics.notificationAsync("success");
    }
    if (!canMove(newGrid)) {
      setGameOver(true);
      Haptics.notificationAsync("error");
    }
  }, [grid, score, best, gameOver, won]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderRelease: (_, gs) => {
      const { dx, dy } = gs;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) handleMove(dx > 0 ? "right" : "left");
      else handleMove(dy > 0 ? "down" : "up");
    },
  });

  const handleUndo = async () => {
    if (history.length === 0 || !user) return;
    const ok = await spendAcoin(user.id, GAME_PRICES.undoMove, "2048 - Undo Move");
    if (ok) {
      Haptics.notificationAsync("success");
      const prev = history[history.length - 1];
      setGrid(prev.grid);
      setScore(prev.score);
      setHistory((h) => h.slice(0, -1));
      setGameOver(false);
    } else {
      Haptics.notificationAsync("error");
    }
  };

  const restart = () => {
    setGrid(initGrid());
    setScore(0);
    setGameOver(false);
    setWon(false);
    setHistory([]);
  };

  const tileColor = (v: number) => TILE_COLORS[v] || { bg: "#3c3a32", text: "#fff" };

  return (
    <View style={[styles.root, { backgroundColor: "#0f0e17" }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: "#222" }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle}>2048</Text>
        <TouchableOpacity onPress={restart}><Ionicons name="refresh" size={22} color="#fff" /></TouchableOpacity>
      </View>

      <View style={styles.scoreRow}>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreLabel}>Score</Text>
          <Text style={styles.scoreVal}>{score}</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreLabel}>Best</Text>
          <Text style={styles.scoreVal}>{best}</Text>
        </View>
        <TouchableOpacity style={styles.undoBtn} onPress={handleUndo}>
          <Ionicons name="arrow-undo" size={18} color="#fff" />
          <Text style={styles.undoCost}>{GAME_PRICES.undoMove}🪙</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.boardWrap} {...panResponder.panHandlers}>
        <View style={styles.board}>
          {grid.map((row, ri) => (
            <View key={ri} style={styles.boardRow}>
              {row.map((val, ci) => (
                <View key={ci} style={[styles.tile, { backgroundColor: tileColor(val).bg, width: TILE_SIZE, height: TILE_SIZE }]}>
                  {val > 0 && (
                    <Text style={[styles.tileText, { color: tileColor(val).text, fontSize: val >= 1024 ? 18 : val >= 128 ? 22 : 28 }]}>
                      {val}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>

      {gameOver && (
        <View style={styles.overlay}>
          <View style={styles.goCard}>
            <Text style={styles.goTitle}>Game Over</Text>
            <Text style={styles.goScore}>{score}</Text>
            <TouchableOpacity style={styles.coinBtn} onPress={handleUndo}>
              <Text style={styles.coinBtnText}>Undo Last Move • {GAME_PRICES.undoMove} ACoins</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.retryBtn} onPress={restart}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryText}>New Game</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {won && !gameOver && (
        <View style={styles.overlay}>
          <View style={styles.goCard}>
            <Text style={styles.winEmoji}>🎉</Text>
            <Text style={[styles.goTitle, { color: "#EDC22E" }]}>You Win!</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setWon(false)}>
              <Text style={styles.retryText}>Keep Going</Text>
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
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#EDC22E" },
  scoreRow: { flexDirection: "row", justifyContent: "center", gap: 12, paddingVertical: 16 },
  scoreBadge: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 8, alignItems: "center" },
  scoreLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" },
  scoreVal: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  undoBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  undoCost: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#FFD700" },
  boardWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  board: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 6, gap: 4 },
  boardRow: { flexDirection: "row", gap: 4 },
  tile: { borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tileText: { fontFamily: "Inter_700Bold" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  goCard: { backgroundColor: "#0f0e17", borderRadius: 24, padding: 32, alignItems: "center", gap: 8, width: 280, borderWidth: 1, borderColor: "#333" },
  goTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  goScore: { fontSize: 48, fontFamily: "Inter_700Bold", color: "#EDC22E" },
  winEmoji: { fontSize: 56 },
  coinBtn: { backgroundColor: "#FFD700", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, marginTop: 8 },
  coinBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#0f0e17" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, marginTop: 4 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
