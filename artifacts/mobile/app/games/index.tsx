import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

type Challenge = {
  id: string;
  game_type: string;
  difficulty: string;
  status: string;
  created_at: string;
  challenger: { display_name: string; handle: string };
  opponent: { display_name: string; handle: string };
  winner_id: string | null;
};

type Score = {
  id: string;
  game_type: string;
  difficulty: string;
  score: number;
  created_at: string;
};

export default function GamesScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"challenges" | "scores">("challenges");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: cData }, { data: sData }] = await Promise.all([
      supabase.from("game_challenges")
        .select("id, game_type, difficulty, status, created_at, winner_id, profiles!game_challenges_challenger_id_fkey(display_name, handle), opponent:profiles!game_challenges_opponent_id_fkey(display_name, handle)")
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("game_scores")
        .select("id, game_type, difficulty, score, created_at")
        .eq("user_id", user.id)
        .order("score", { ascending: false })
        .limit(20),
    ]);
    if (cData) setChallenges(cData.map((c: any) => ({ ...c, challenger: c.profiles, opponent: c.opponent })));
    if (sData) setScores(sData);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const diffColor: Record<string, string> = { easy: Colors.brand, medium: "#FF9500", hard: "#FF3B30" };

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Games</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.surface }]}>
        {(["challenges", "scores"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && { borderBottomColor: Colors.brand, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? Colors.brand : colors.textSecondary }]}>
              {t === "challenges" ? "Challenges" : "My Scores"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} /> : tab === "challenges" ? (
        <FlatList
          data={challenges}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.cardTop}>
                <View style={[styles.badge, { backgroundColor: (diffColor[item.difficulty] || "#8E8E93") + "20" }]}>
                  <Text style={[styles.badgeText, { color: diffColor[item.difficulty] || "#8E8E93" }]}>{item.difficulty}</Text>
                </View>
                <Text style={[styles.gameType, { color: colors.text }]}>{item.game_type.replace(/_/g, " ")}</Text>
                <Text style={[styles.statusTag, { color: item.status === "active" ? Colors.brand : colors.textMuted }]}>{item.status}</Text>
              </View>
              <Text style={[styles.vs, { color: colors.textSecondary }]}>
                {item.challenger?.display_name} vs {item.opponent?.display_name}
              </Text>
            </View>
          )}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 90 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="game-controller-outline" size={64} color={colors.textMuted} /><Text style={[styles.emptyText, { color: colors.textSecondary }]}>No challenges yet</Text></View>}
        />
      ) : (
        <FlatList
          data={scores}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.scoreRow, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.gameType, { color: colors.text }]}>{item.game_type.replace(/_/g, " ")}</Text>
                <View style={styles.scoreMetaRow}>
                  <View style={[styles.badge, { backgroundColor: (diffColor[item.difficulty] || "#8E8E93") + "20" }]}>
                    <Text style={[styles.badgeText, { color: diffColor[item.difficulty] }]}>{item.difficulty}</Text>
                  </View>
                  <Text style={[styles.scoreDate, { color: colors.textMuted }]}>{new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
              </View>
              <Text style={[styles.scoreValue, { color: Colors.brand }]}>{item.score}</Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 90 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="trophy-outline" size={64} color={colors.textMuted} /><Text style={[styles.emptyText, { color: colors.textSecondary }]}>No scores yet</Text></View>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  tabs: { flexDirection: "row" },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  card: { borderRadius: 14, padding: 14, gap: 6 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  gameType: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1, textTransform: "capitalize" },
  statusTag: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  vs: { fontSize: 13, fontFamily: "Inter_400Regular" },
  scoreRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  scoreMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  scoreDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  scoreValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
