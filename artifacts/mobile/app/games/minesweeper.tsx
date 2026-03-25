import React, { useCallback, useEffect, useState } from "react";
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import * as Haptics from "@/lib/haptics";
import { spendAcoin, GAME_PRICES } from "@/lib/gameCoins";

const DIFFICULTIES = [
  { name: "Easy", rows: 8, cols: 8, mines: 10, color: "#4CAF50" },
  { name: "Medium", rows: 12, cols: 10, mines: 25, color: "#FF9800" },
  { name: "Hard", rows: 16, cols: 10, mines: 40, color: "#F44336" },
];

type Cell = { mine: boolean; revealed: boolean; flagged: boolean; adjacent: number };
type Board = Cell[][];

function createBoard(rows: number, cols: number, mines: number, safeR: number, safeC: number): Board {
  const board: Board = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, revealed: false, flagged: false, adjacent: 0 }))
  );
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (board[r][c].mine) continue;
    if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
    board[r][c].mine = true;
    placed++;
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let count = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].mine) count++;
        }
      board[r][c].adjacent = count;
    }
  return board;
}

function reveal(board: Board, r: number, c: number): Board {
  const b = board.map((row) => row.map((cell) => ({ ...cell })));
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    if (cr < 0 || cr >= b.length || cc < 0 || cc >= b[0].length) continue;
    if (b[cr][cc].revealed || b[cr][cc].flagged) continue;
    b[cr][cc].revealed = true;
    if (b[cr][cc].adjacent === 0 && !b[cr][cc].mine) {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          stack.push([cr + dr, cc + dc]);
    }
  }
  return b;
}

const NUM_COLORS: Record<number, string> = {
  1: "#2196F3", 2: "#4CAF50", 3: "#F44336", 4: "#9C27B0", 5: "#FF9800", 6: "#00BCD4", 7: "#000", 8: "#888",
};

export default function MinesweeperGame() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [diff, setDiff] = useState(0);
  const [board, setBoard] = useState<Board | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [flagMode, setFlagMode] = useState(false);
  const [firstClick, setFirstClick] = useState(true);
  const [timer, setTimer] = useState(0);
  const [timerRef] = useState<{ iv: ReturnType<typeof setInterval> | null }>({ iv: null });

  const d = DIFFICULTIES[diff];
  const cellSize = Math.floor((Dimensions.get("window").width - 32) / d.cols);

  useEffect(() => {
    return () => {
      if (timerRef.iv) clearInterval(timerRef.iv);
    };
  }, []);

  const startGame = (diffIdx?: number) => {
    const di = diffIdx ?? diff;
    setDiff(di);
    setBoard(null);
    setGameOver(false);
    setWon(false);
    setFlagMode(false);
    setFirstClick(true);
    setTimer(0);
    if (timerRef.iv) clearInterval(timerRef.iv);
  };

  const checkWin = (b: Board): boolean => {
    for (const row of b)
      for (const cell of row)
        if (!cell.mine && !cell.revealed) return false;
    return true;
  };

  const handlePress = useCallback((r: number, c: number) => {
    if (gameOver || won) return;

    if (firstClick) {
      const newBoard = createBoard(d.rows, d.cols, d.mines, r, c);
      const revealed = reveal(newBoard, r, c);
      setBoard(revealed);
      setFirstClick(false);
      timerRef.iv = setInterval(() => setTimer((t) => t + 1), 1000);
      Haptics.selectionAsync();
      if (checkWin(revealed)) {
        setWon(true);
        if (timerRef.iv) clearInterval(timerRef.iv);
        Haptics.notificationAsync("success");
      }
      return;
    }

    if (!board) return;

    if (flagMode) {
      if (board[r][c].revealed) return;
      const b = board.map((row) => row.map((cell) => ({ ...cell })));
      b[r][c].flagged = !b[r][c].flagged;
      setBoard(b);
      Haptics.selectionAsync();
      return;
    }

    if (board[r][c].flagged || board[r][c].revealed) return;

    if (board[r][c].mine) {
      const b = board.map((row) => row.map((cell) => ({ ...cell, revealed: true })));
      setBoard(b);
      setGameOver(true);
      if (timerRef.iv) clearInterval(timerRef.iv);
      Haptics.notificationAsync("error");
      return;
    }

    const newBoard = reveal(board, r, c);
    setBoard(newBoard);
    Haptics.selectionAsync();

    if (checkWin(newBoard)) {
      setWon(true);
      if (timerRef.iv) clearInterval(timerRef.iv);
      Haptics.notificationAsync("success");
    }
  }, [board, gameOver, won, flagMode, firstClick, d]);

  const handleRevealSafe = async () => {
    if (!user || !board) return;
    const ok = await spendAcoin(user.id, GAME_PRICES.revealCell, "Minesweeper - Reveal Safe Cell");
    if (ok) {
      Haptics.notificationAsync("success");
      for (let r = 0; r < d.rows; r++)
        for (let c = 0; c < d.cols; c++)
          if (!board[r][c].mine && !board[r][c].revealed) {
            const newBoard = reveal(board, r, c);
            setBoard(newBoard);
            if (checkWin(newBoard)) { setWon(true); if (timerRef.iv) clearInterval(timerRef.iv); }
            return;
          }
    }
  };

  if (!board && firstClick) {
    return (
      <View style={[styles.root, { backgroundColor: "#1a1a2e" }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: "#333" }]}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: "#4CAF50" }]}>Minesweeper</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.startScreen}>
          <Text style={styles.startEmoji}>💣</Text>
          <Text style={[styles.startTitle, { color: "#4CAF50" }]}>Minesweeper</Text>
          <Text style={styles.startDesc}>Find all safe cells. Don't hit a mine!</Text>
          <View style={styles.diffRow}>
            {DIFFICULTIES.map((di, i) => (
              <TouchableOpacity
                key={di.name}
                style={[styles.diffBtn, { backgroundColor: diff === i ? di.color : "rgba(255,255,255,0.1)" }]}
                onPress={() => setDiff(i)}
              >
                <Text style={[styles.diffText, { color: diff === i ? "#fff" : "rgba(255,255,255,0.5)" }]}>{di.name}</Text>
                <Text style={[styles.diffSub, { color: diff === i ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)" }]}>
                  {di.rows}×{di.cols} • {di.mines} mines
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.playBtn, { backgroundColor: "#4CAF50" }]} onPress={() => startGame()}>
            <Ionicons name="play" size={24} color="#1a1a2e" />
            <Text style={[styles.playBtnText, { color: "#1a1a2e" }]}>Start</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const flagCount = board ? board.flat().filter((c) => c.flagged).length : 0;

  return (
    <View style={[styles.root, { backgroundColor: "#1a1a2e" }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: "#333" }]}>
        <TouchableOpacity onPress={() => startGame()}><Ionicons name="refresh" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.timerText}>{Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}</Text>
          <Text style={styles.mineCount}>💣 {d.mines - flagCount}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={[styles.modeBtn, { backgroundColor: flagMode ? "#F44336" : "rgba(255,255,255,0.1)" }]}
            onPress={() => { setFlagMode(!flagMode); Haptics.selectionAsync(); }}
          >
            <Text style={{ fontSize: 16 }}>🚩</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.hintBtn} onPress={handleRevealSafe}>
            <Text style={{ fontSize: 12 }}>💡{GAME_PRICES.revealCell}🪙</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.boardWrap}>
        <View style={styles.board}>
          {(board || Array.from({ length: d.rows }, () => Array(d.cols).fill(null))).map((row, ri) => (
            <View key={ri} style={styles.boardRow}>
              {row.map((cell: Cell | null, ci: number) => {
                const isRevealed = cell?.revealed;
                const isMine = cell?.mine;
                const isFlagged = cell?.flagged;
                const adj = cell?.adjacent || 0;

                let bg = "rgba(255,255,255,0.08)";
                if (isRevealed) bg = isMine ? "#F44336" : "rgba(255,255,255,0.02)";

                return (
                  <TouchableOpacity
                    key={ci}
                    style={[styles.cell, { width: cellSize - 2, height: cellSize - 2, backgroundColor: bg }]}
                    onPress={() => handlePress(ri, ci)}
                    activeOpacity={0.6}
                  >
                    {isFlagged && !isRevealed && <Text style={{ fontSize: cellSize * 0.5 }}>🚩</Text>}
                    {isRevealed && isMine && <Text style={{ fontSize: cellSize * 0.5 }}>💣</Text>}
                    {isRevealed && !isMine && adj > 0 && (
                      <Text style={[styles.adjText, { color: NUM_COLORS[adj] || "#fff", fontSize: cellSize * 0.5 }]}>{adj}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {(gameOver || won) && (
        <View style={styles.overlay}>
          <View style={styles.goCard}>
            <Text style={styles.goEmoji}>{won ? "🎉" : "💥"}</Text>
            <Text style={styles.goTitle}>{won ? "You Win!" : "Game Over"}</Text>
            <Text style={styles.goLabel}>Time: {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}</Text>
            <TouchableOpacity style={[styles.retryBtn, { backgroundColor: DIFFICULTIES[diff].color }]} onPress={() => startGame()}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryText}>Play Again</Text>
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
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  timerText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  mineCount: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)" },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  hintBtn: { backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 },
  boardWrap: { alignItems: "center", paddingVertical: 16 },
  board: { gap: 2 },
  boardRow: { flexDirection: "row", gap: 2 },
  cell: { borderRadius: 4, alignItems: "center", justifyContent: "center" },
  adjText: { fontFamily: "Inter_700Bold" },
  startScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  startEmoji: { fontSize: 80 },
  startTitle: { fontSize: 36, fontFamily: "Inter_700Bold" },
  startDesc: { fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "center" },
  diffRow: { flexDirection: "row", gap: 8 },
  diffBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, alignItems: "center", gap: 2 },
  diffText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  diffSub: { fontSize: 10, fontFamily: "Inter_400Regular" },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 20 },
  playBtnText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", zIndex: 20 },
  goCard: { backgroundColor: "#1a1a2e", borderRadius: 24, padding: 32, alignItems: "center", gap: 8, width: 280, borderWidth: 1, borderColor: "#333" },
  goEmoji: { fontSize: 56 },
  goTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  goLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16, marginTop: 8 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
