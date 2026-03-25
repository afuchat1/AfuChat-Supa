import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Habit = {
  id: string;
  name: string;
  icon: string;
  streak: number;
  completedDates: string[];
};

const ICONS = ["💪", "📚", "🧘", "🏃", "💧", "🍎", "😴", "✍️", "🎵", "🧹"];
const STORAGE_KEY = "afuchat_habits";

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export default function HabitTrackerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("💪");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) setHabits(JSON.parse(data));
    }).catch(() => {});
  }, []);

  const save = useCallback((updated: Habit[]) => {
    setHabits(updated);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  const addHabit = () => {
    if (!newName.trim()) return;
    Haptics.notificationAsync("success");
    const habit: Habit = {
      id: Date.now().toString(),
      name: newName.trim(),
      icon: newIcon,
      streak: 0,
      completedDates: [],
    };
    save([...habits, habit]);
    setNewName("");
    setShowAdd(false);
  };

  const toggleToday = (id: string) => {
    Haptics.selectionAsync();
    const today = todayStr();
    save(habits.map((h) => {
      if (h.id !== id) return h;
      const done = h.completedDates.includes(today);
      const dates = done ? h.completedDates.filter((d) => d !== today) : [...h.completedDates, today];
      let streak = 0;
      const d = new Date();
      while (true) {
        const ds = d.toISOString().split("T")[0];
        if (dates.includes(ds)) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }
      return { ...h, completedDates: dates, streak };
    }));
  };

  const deleteHabit = (id: string) => {
    Haptics.notificationAsync("warning");
    save(habits.filter((h) => h.id !== id));
  };

  const today = todayStr();
  const completedToday = habits.filter((h) => h.completedDates.includes(today)).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Habit Tracker</Text>
        <TouchableOpacity onPress={() => setShowAdd(!showAdd)}>
          <Ionicons name={showAdd ? "close" : "add"} size={24} color={Colors.brand} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.summaryCard, { backgroundColor: Colors.brand }]}>
          <Text style={styles.summaryTitle}>Today's Progress</Text>
          <Text style={styles.summaryCount}>{completedToday}/{habits.length}</Text>
          <View style={styles.summaryBar}>
            <View style={[styles.summaryFill, { width: habits.length > 0 ? `${(completedToday / habits.length) * 100}%` : "0%" }]} />
          </View>
        </View>

        {showAdd && (
          <View style={[styles.addCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.addLabel, { color: colors.text }]}>New Habit</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconRow}>
              {ICONS.map((ic) => (
                <TouchableOpacity
                  key={ic}
                  style={[styles.iconBtn, { backgroundColor: newIcon === ic ? Colors.brand + "20" : colors.inputBg }]}
                  onPress={() => setNewIcon(ic)}
                >
                  <Text style={styles.iconText}>{ic}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.addInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Habit name..."
              placeholderTextColor={colors.textMuted}
            />
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: Colors.brand }]} onPress={addHabit}>
              <Text style={styles.addBtnText}>Add Habit</Text>
            </TouchableOpacity>
          </View>
        )}

        {habits.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No habits yet. Tap + to add one!</Text>
          </View>
        ) : (
          <View style={styles.habitList}>
            {habits.map((habit) => {
              const done = habit.completedDates.includes(today);
              return (
                <View key={habit.id} style={[styles.habitRow, { backgroundColor: colors.surface }]}>
                  <TouchableOpacity
                    style={[styles.checkBox, { backgroundColor: done ? Colors.brand : colors.inputBg }]}
                    onPress={() => toggleToday(habit.id)}
                  >
                    {done && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.habitName, { color: colors.text, textDecorationLine: done ? "line-through" : "none" }]}>
                      {habit.icon} {habit.name}
                    </Text>
                    {habit.streak > 0 && (
                      <Text style={[styles.streakLabel, { color: Colors.brand }]}>🔥 {habit.streak} day streak</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => deleteHabit(habit.id)}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 16 },
  summaryCard: { borderRadius: 16, padding: 20, alignItems: "center", gap: 8 },
  summaryTitle: { fontSize: 14, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.8)" },
  summaryCount: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#fff" },
  summaryBar: { width: "100%", height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)" },
  summaryFill: { height: "100%", borderRadius: 3, backgroundColor: "#fff" },
  addCard: { borderRadius: 14, padding: 16, gap: 12 },
  addLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  iconRow: { gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 20 },
  addInput: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, fontSize: 15, fontFamily: "Inter_500Medium" },
  addBtn: { paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  addBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  habitList: { gap: 8 },
  habitRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, gap: 12 },
  checkBox: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  habitName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  streakLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 2 },
});
