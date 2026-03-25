import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";

const MODES = [
  { label: "Focus", minutes: 25, color: "#F44336" },
  { label: "Short Break", minutes: 5, color: "#4CAF50" },
  { label: "Long Break", minutes: 15, color: "#2196F3" },
];

export default function PomodoroScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState(0);
  const [seconds, setSeconds] = useState(MODES[0].minutes * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (loopRef.current) clearInterval(loopRef.current);
      return;
    }
    loopRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          Haptics.notificationAsync("success");
          if (mode === 0) setSessions((p) => p + 1);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
  }, [running, mode]);

  const selectMode = (idx: number) => {
    setMode(idx);
    setSeconds(MODES[idx].minutes * 60);
    setRunning(false);
    Haptics.selectionAsync();
  };

  const toggle = () => {
    Haptics.selectionAsync();
    if (seconds === 0) {
      setSeconds(MODES[mode].minutes * 60);
    }
    setRunning(!running);
  };

  const reset = () => {
    Haptics.selectionAsync();
    setRunning(false);
    setSeconds(MODES[mode].minutes * 60);
  };

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const total = MODES[mode].minutes * 60;
  const progress = 1 - seconds / total;
  const currentColor = MODES[mode].color;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Pomodoro</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.modesRow}>
        {MODES.map((m, i) => (
          <TouchableOpacity
            key={m.label}
            style={[styles.modeBtn, { backgroundColor: mode === i ? m.color : colors.surface }]}
            onPress={() => selectMode(i)}
          >
            <Text style={[styles.modeText, { color: mode === i ? "#fff" : colors.textSecondary }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.timerArea}>
        <View style={[styles.timerCircle, { borderColor: currentColor + "30" }]}>
          <View style={[styles.progressArc, { borderColor: currentColor, borderTopColor: "transparent", borderRightColor: progress > 0.5 ? currentColor : "transparent", transform: [{ rotate: `${progress * 360}deg` }] }]} />
          <Text style={[styles.timerText, { color: colors.text }]}>
            {m.toString().padStart(2, "0")}:{s.toString().padStart(2, "0")}
          </Text>
          <Text style={[styles.modeLabel, { color: currentColor }]}>{MODES[mode].label}</Text>
        </View>
      </View>

      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={reset}>
          <Ionicons name="refresh" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.mainBtn, { backgroundColor: running ? "#FF3B30" : currentColor }]} onPress={toggle}>
          <Ionicons name={running ? "pause" : "play"} size={28} color="#fff" />
        </TouchableOpacity>
        <View style={[styles.actionBtn, { backgroundColor: "transparent" }]}>
          <Text style={[styles.sessionCount, { color: currentColor }]}>{sessions}</Text>
          <Text style={[styles.sessionLabel, { color: colors.textMuted }]}>done</Text>
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.infoTitle, { color: colors.text }]}>How it works</Text>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          1. Focus for 25 minutes{"\n"}
          2. Take a 5-minute break{"\n"}
          3. After 4 sessions, take a 15-minute break{"\n"}
          4. Repeat!
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modesRow: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  modeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  timerArea: { alignItems: "center", paddingVertical: 40 },
  timerCircle: { width: 240, height: 240, borderRadius: 120, borderWidth: 6, alignItems: "center", justifyContent: "center", position: "relative" },
  progressArc: { position: "absolute", width: 228, height: 228, borderRadius: 114, borderWidth: 6 },
  timerText: { fontSize: 56, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"] },
  modeLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  btnRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 24 },
  actionBtn: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  mainBtn: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  sessionCount: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sessionLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  infoCard: { marginHorizontal: 16, marginTop: 32, borderRadius: 14, padding: 16, gap: 8 },
  infoTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 22 },
});
