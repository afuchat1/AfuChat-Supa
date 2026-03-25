import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";

export default function StopwatchScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const startRef = useRef(0);
  const accRef = useRef(0);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (loopRef.current) clearInterval(loopRef.current);
      return;
    }
    startRef.current = Date.now();
    loopRef.current = setInterval(() => {
      setElapsed(accRef.current + (Date.now() - startRef.current));
    }, 10);
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
  }, [running]);

  const toggle = () => {
    Haptics.selectionAsync();
    if (running) {
      accRef.current += Date.now() - startRef.current;
      setRunning(false);
    } else {
      setRunning(true);
    }
  };

  const lap = () => {
    if (!running) return;
    Haptics.selectionAsync();
    setLaps((l) => [elapsed, ...l]);
  };

  const reset = () => {
    Haptics.selectionAsync();
    setRunning(false);
    setElapsed(0);
    accRef.current = 0;
    setLaps([]);
  };

  const format = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
  };

  const bestLap = laps.length > 1 ? Math.min(...laps.map((l, i) => i === 0 ? l - (laps[1] || 0) : laps[i - 1] - l).filter((v) => v > 0)) : 0;
  const worstLap = laps.length > 1 ? Math.max(...laps.map((l, i) => i === 0 ? l - (laps[1] || 0) : laps[i - 1] - l).filter((v) => v > 0)) : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Stopwatch</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.timerArea}>
        <View style={[styles.timerCircle, { borderColor: running ? Colors.brand : colors.border }]}>
          <Text style={[styles.timerText, { color: colors.text }]}>{format(elapsed)}</Text>
        </View>
      </View>

      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.circleBtn, { backgroundColor: colors.surface }]} onPress={running ? lap : reset}>
          <Text style={[styles.btnLabel, { color: colors.text }]}>{running ? "Lap" : "Reset"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.circleBtn, { backgroundColor: running ? "#FF3B30" : Colors.brand }]} onPress={toggle}>
          <Text style={[styles.btnLabel, { color: "#fff" }]}>{running ? "Stop" : "Start"}</Text>
        </TouchableOpacity>
      </View>

      {laps.length > 0 && (
        <FlatList
          data={laps}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item, index }) => {
            const lapTime = index === laps.length - 1 ? item : item - laps[index + 1];
            const isBest = laps.length > 2 && lapTime === bestLap;
            const isWorst = laps.length > 2 && lapTime === worstLap;
            return (
              <View style={[styles.lapRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.lapNum, { color: isBest ? "#34C759" : isWorst ? "#FF3B30" : colors.textSecondary }]}>
                  Lap {laps.length - index}
                </Text>
                <Text style={[styles.lapTime, { color: isBest ? "#34C759" : isWorst ? "#FF3B30" : colors.text }]}>
                  {format(lapTime)}
                </Text>
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  timerArea: { alignItems: "center", paddingVertical: 40 },
  timerCircle: { width: 220, height: 220, borderRadius: 110, borderWidth: 4, alignItems: "center", justifyContent: "center" },
  timerText: { fontSize: 40, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"] },
  btnRow: { flexDirection: "row", justifyContent: "center", gap: 32, paddingBottom: 16 },
  circleBtn: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  btnLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  lapRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  lapNum: { fontSize: 15, fontFamily: "Inter_500Medium" },
  lapTime: { fontSize: 15, fontFamily: "Inter_600SemiBold", fontVariant: ["tabular-nums"] },
});
