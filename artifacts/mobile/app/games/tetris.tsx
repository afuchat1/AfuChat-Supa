import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "@/lib/haptics";
import { spendAcoin, GAME_PRICES } from "@/lib/gameCoins";

const COLS = 10;
const ROWS = 20;

const PIECES = [
  { shape: [[1,1,1,1]], color: "#00BCD4" },
  { shape: [[1,1],[1,1]], color: "#FFD700" },
  { shape: [[0,1,0],[1,1,1]], color: "#9C27B0" },
  { shape: [[1,0],[1,0],[1,1]], color: "#FF9800" },
  { shape: [[0,1],[0,1],[1,1]], color: "#2196F3" },
  { shape: [[1,1,0],[0,1,1]], color: "#4CAF50" },
  { shape: [[0,1,1],[1,1,0]], color: "#F44336" },
];

type Board = (string | null)[][];
type Piece = { shape: number[][]; color: string; x: number; y: number };

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomPiece(): Piece {
  const p = PIECES[Math.floor(Math.random() * PIECES.length)];
  return { shape: p.shape.map((r) => [...r]), color: p.color, x: Math.floor((COLS - p.shape[0].length) / 2), y: 0 };
}

function rotate(shape: number[][]): number[][] {
  const rows = shape.length, cols = shape[0].length;
  const result: number[][] = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function collides(board: Board, piece: Piece): boolean {
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const nr = piece.y + r, nc = piece.x + c;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return true;
      if (board[nr][nc]) return true;
    }
  return false;
}

function merge(board: Board, piece: Piece): Board {
  const b = board.map((r) => [...r]);
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c]) b[piece.y + r][piece.x + c] = piece.color;
  return b;
}

function clearLines(board: Board): { board: Board; lines: number } {
  const kept = board.filter((row) => row.some((c) => !c));
  const lines = ROWS - kept.length;
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
  return { board: kept, lines };
}

export default function TetrisGame() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const CELL = Math.floor((windowWidth - 48) / COLS);
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [piece, setPiece] = useState<Piece>(randomPiece);
  const [next, setNext] = useState<Piece>(randomPiece);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [linesCleared, setLinesCleared] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const speed = Math.max(800 - (level - 1) * 80, 100);

  const drop = useCallback(() => {
    setPiece((p) => {
      const moved = { ...p, y: p.y + 1 };
      if (!collides(board, moved)) return moved;

      const newBoard = merge(board, p);
      const { board: cleared, lines } = clearLines(newBoard);
      setBoard(cleared);
      if (lines > 0) {
        const pts = [0, 100, 300, 500, 800][lines] * level;
        setScore((s) => s + pts);
        setLinesCleared((l) => {
          const nl = l + lines;
          setLevel(Math.floor(nl / 10) + 1);
          return nl;
        });
        Haptics.notificationAsync("success");
      }

      const np = { ...next, x: Math.floor((COLS - next.shape[0].length) / 2), y: 0 };
      if (collides(cleared, np)) {
        setGameOver(true);
        Haptics.notificationAsync("error");
        return p;
      }
      setNext(randomPiece());
      return np;
    });
  }, [board, next, level]);

  useEffect(() => {
    if (!started || gameOver || paused) {
      if (loopRef.current) clearInterval(loopRef.current);
      return;
    }
    loopRef.current = setInterval(drop, speed);
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
  }, [started, gameOver, paused, speed, drop]);

  const move = (dx: number) => {
    const moved = { ...piece, x: piece.x + dx };
    if (!collides(board, moved)) { setPiece(moved); Haptics.selectionAsync(); }
  };

  const rotatePiece = () => {
    const rotated = { ...piece, shape: rotate(piece.shape) };
    if (!collides(board, rotated)) { setPiece(rotated); Haptics.selectionAsync(); }
  };

  const hardDrop = () => {
    let p = { ...piece };
    while (!collides(board, { ...p, y: p.y + 1 })) p.y++;
    setPiece(p);
    Haptics.selectionAsync();
    setTimeout(drop, 50);
  };

  const handleSlowDown = async () => {
    if (!user) return;
    const ok = await spendAcoin(user.id, GAME_PRICES.slowDown, "Tetris - Slow Down");
    if (ok) {
      Haptics.notificationAsync("success");
      setLevel((l) => Math.max(l - 2, 1));
    }
  };

  const startGame = () => {
    setBoard(emptyBoard());
    setPiece(randomPiece());
    setNext(randomPiece());
    setScore(0);
    setLevel(1);
    setLinesCleared(0);
    setGameOver(false);
    setStarted(true);
    setPaused(false);
  };

  const renderBoard = () => {
    const display = board.map((r) => [...r]);
    for (let r = 0; r < piece.shape.length; r++)
      for (let c = 0; c < piece.shape[r].length; c++)
        if (piece.shape[r][c] && piece.y + r >= 0 && piece.y + r < ROWS)
          display[piece.y + r][piece.x + c] = piece.color;
    return display;
  };

  if (!started) {
    return (
      <View style={[styles.root, { backgroundColor: "#0a0a1a" }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: "#222" }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
          <Text style={styles.headerTitle}>Tetris</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.startScreen}>
          <Text style={styles.startEmoji}>🧱</Text>
          <Text style={[styles.startTitle, { color: "#00BCD4" }]}>Tetris</Text>
          <Text style={styles.startDesc}>Stack blocks, clear lines, score big!</Text>
          <TouchableOpacity style={[styles.playBtn, { backgroundColor: "#00BCD4" }]} onPress={startGame}>
            <Ionicons name="play" size={24} color="#0a0a1a" />
            <Text style={[styles.playBtnText, { color: "#0a0a1a" }]}>Play</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const displayBoard = renderBoard();

  return (
    <View style={[styles.root, { backgroundColor: "#0a0a1a" }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: "#222" }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.statText}>Score: {score}</Text>
          <Text style={styles.statSub}>Level {level} • {linesCleared} lines</Text>
        </View>
        <TouchableOpacity onPress={() => setPaused(!paused)}>
          <Ionicons name={paused ? "play" : "pause"} size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.boardWrap}>
        <View style={[styles.board, { width: COLS * CELL + 4 }]}>
          {displayBoard.map((row, ri) => (
            <View key={ri} style={styles.boardRow}>
              {row.map((cell, ci) => (
                <View key={ci} style={[styles.cell, { width: CELL - 1, height: CELL - 1, backgroundColor: cell || "rgba(255,255,255,0.03)" }]} />
              ))}
            </View>
          ))}
        </View>

        <View style={styles.sidePanel}>
          <Text style={styles.nextLabel}>Next</Text>
          <View style={styles.nextBox}>
            {next.shape.map((row, ri) => (
              <View key={ri} style={{ flexDirection: "row" }}>
                {row.map((c, ci) => (
                  <View key={ci} style={{ width: 14, height: 14, backgroundColor: c ? next.color : "transparent", borderRadius: 2, margin: 0.5 }} />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.controlRow}>
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => move(-1)}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={hardDrop}>
            <Ionicons name="chevron-down" size={28} color="#00BCD4" />
            <Ionicons name="chevron-down" size={28} color="#00BCD4" style={{ marginTop: -16 }} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={rotatePiece}>
            <Ionicons name="refresh" size={24} color="#FFD700" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => move(1)}>
            <Ionicons name="chevron-forward" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {gameOver && (
        <View style={styles.overlay}>
          <View style={styles.goCard}>
            <Text style={styles.goTitle}>Game Over</Text>
            <Text style={[styles.goScore, { color: "#00BCD4" }]}>{score}</Text>
            <Text style={styles.goLabel}>Level {level} • {linesCleared} lines</Text>
            <TouchableOpacity style={styles.coinBtn} onPress={handleSlowDown}>
              <Text style={styles.coinBtnText}>Slow Down • {GAME_PRICES.slowDown} ACoins</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.retryBtn} onPress={startGame}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryText}>New Game</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {paused && !gameOver && (
        <View style={styles.overlay}>
          <View style={styles.goCard}>
            <Ionicons name="pause" size={48} color="#00BCD4" />
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
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#00BCD4" },
  statText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  statSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  boardWrap: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12, paddingHorizontal: 8 },
  board: { borderRadius: 4, padding: 2, backgroundColor: "rgba(255,255,255,0.05)" },
  boardRow: { flexDirection: "row", gap: 1 },
  cell: { borderRadius: 2 },
  sidePanel: { alignItems: "center", gap: 8 },
  nextLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" },
  nextBox: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 10 },
  controls: { gap: 8, paddingHorizontal: 16 },
  controlRow: { flexDirection: "row", justifyContent: "center", gap: 12 },
  ctrlBtn: { width: 64, height: 56, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  startScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  startEmoji: { fontSize: 80 },
  startTitle: { fontSize: 36, fontFamily: "Inter_700Bold" },
  startDesc: { fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "center" },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 20 },
  playBtnText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  goCard: { backgroundColor: "#0a0a1a", borderRadius: 24, padding: 32, alignItems: "center", gap: 8, width: 280, borderWidth: 1, borderColor: "#333" },
  goTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  goScore: { fontSize: 48, fontFamily: "Inter_700Bold" },
  goLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  coinBtn: { backgroundColor: "#FFD700", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, marginTop: 8 },
  coinBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#0a0a1a" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, marginTop: 4 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
