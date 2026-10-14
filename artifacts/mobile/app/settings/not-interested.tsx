import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { Separator } from "@/components/ui/Separator";
import { useAppAccent } from "@/context/AppAccentContext";
import { Avatar } from "@/components/ui/Avatar";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { showAlert } from "@/lib/alert";
import {
  getNotInterestedSignals,
  removeNotInterestedAuthor,
  removeNotInterestedTopic,
  resetNotInterestedSignals,
} from "@/lib/feedAlgorithm";

type AuthorProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified?: boolean;
  is_organization_verified?: boolean;
};

const TOPIC_LABELS: Record<string, string> = {
  technology: "Technology",
  music: "Music",
  sports: "Sports",
  fashion: "Fashion",
  food: "Food & Cooking",
  travel: "Travel",
  art: "Art & Design",
  gaming: "Gaming",
  fitness: "Fitness",
  photography: "Photography",
  business: "Business",
  education: "Education",
  movies: "Movies & TV",
  reading: "Books & Reading",
  nature: "Nature",
  politics: "Politics",
  science: "Science",
  crypto: "Crypto & Web3",
};

const TOPIC_ICONS: Record<string, string> = {
  technology: "hardware-chip",
  music: "musical-notes",
  sports: "trophy",
  fashion: "shirt",
  food: "restaurant",
  travel: "airplane",
  art: "color-palette",
  gaming: "game-controller",
  fitness: "barbell",
  photography: "camera",
  business: "briefcase",
  education: "school",
  movies: "film",
  reading: "book",
  nature: "leaf",
  politics: "megaphone",
  science: "flask",
  crypto: "logo-bitcoin",
};

export default function NotInterestedScreen() {
  const { colors, isDark } = useTheme();
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();

  const [authors, setAuthors] = useState<AuthorProfile[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const signals = await getNotInterestedSignals();
    const authorIdList = [...signals.authorIds];
    const topicList = [...signals.topics].sort();

    let profileList: AuthorProfile[] = [];
    if (authorIdList.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, is_verified, is_organization_verified")
        .in("id", authorIdList);
      profileList = (data || []) as AuthorProfile[];
    }

    setAuthors(profileList);
    setTopics(topicList);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRemoveAuthor(author: AuthorProfile) {
    showAlert(
      "Remove author?",
      `${author.display_name} will start appearing in your feed again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          onPress: async () => {
            try {
              await removeNotInterestedAuthor(author.id);
              setAuthors((prev) => prev.filter((a) => a.id !== author.id));
            } catch (_) {}
          },
        },
      ],
    );
  }

  async function handleRemoveTopic(topic: string) {
    const label = TOPIC_LABELS[topic] ?? topic;
    showAlert(
      "Remove topic?",
      `${label} content will start appearing in your feed again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          onPress: async () => {
            try {
              await removeNotInterestedTopic(topic);
              setTopics((prev) => prev.filter((t) => t !== topic));
            } catch (_) {}
          },
        },
      ],
    );
  }

  async function handleResetAll() {
    showAlert(
      "Reset all?",
      "All muted authors and suppressed topics will be cleared. Your feed will start fresh.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await resetNotInterestedSignals();
              setAuthors([]);
              setTopics([]);
            } catch (_) {}
          },
        },
      ],
    );
  }

  const isEmpty = !loading && authors.length === 0 && topics.length === 0;

  const sectionBg   = isDark ? "#1C1C1E" : colors.surface;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Not Interested" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={accent} />
        </View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <Ionicons name="heart" size={52} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>All clear</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Authors and topics you mute will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 48, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── MUTED AUTHORS ─────────────────────────────────────────── */}
          {authors.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MUTED AUTHORS</Text>
              <View style={[styles.card, { backgroundColor: sectionBg }]}>
                {authors.map((author, i) => (
                  <View key={author.id}>
                    {i > 0 && <Separator />}
                    <View style={styles.row}>
                      <Avatar
                        uri={author.avatar_url}
                        name={author.display_name}
                        size={42}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                          {author.display_name}
                        </Text>
                        <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
                          @{author.handle}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.removeBtn, { borderColor: colors.border }]}
                        onPress={() => handleRemoveAuthor(author)}
                        activeOpacity={0.7}
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={14} color={colors.textMuted} />
                        <Text style={[styles.removeTxt, { color: colors.textMuted }]}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── SUPPRESSED TOPICS ─────────────────────────────────────── */}
          {topics.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SUPPRESSED TOPICS</Text>
              <View style={[styles.card, { backgroundColor: sectionBg }]}>
                {topics.map((topic, i) => {
                  const label = TOPIC_LABELS[topic] ?? topic.charAt(0).toUpperCase() + topic.slice(1);
                  const icon = (TOPIC_ICONS[topic] ?? "pricetag") as any;
                  return (
                    <View key={topic}>
                      {i > 0 && <Separator />}
                      <View style={styles.row}>
                        <View style={styles.topicIcon}>
                          <Ionicons name={icon} size={22} color={colors.text} />
                        </View>
                        <Text style={[styles.topicLabel, { color: colors.text }]}>{label}</Text>
                        <TouchableOpacity
                          style={[styles.removeBtn, { borderColor: colors.border }]}
                          onPress={() => handleRemoveTopic(topic)}
                          activeOpacity={0.7}
                          hitSlop={8}
                        >
                          <Ionicons name="close" size={14} color={colors.textMuted} />
                          <Text style={[styles.removeTxt, { color: colors.textMuted }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── RESET ALL ─────────────────────────────────────────────── */}
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.resetBtn, { backgroundColor: sectionBg, borderColor: "#FF3B30" + "44" }]}
              onPress={handleResetAll}
              activeOpacity={0.75}
            >
              <Ionicons name="refresh" size={16} color="#FF3B30" />
              <Text style={styles.resetTxt}>Reset all preferences</Text>
            </TouchableOpacity>
            <Text style={[styles.resetHint, { color: colors.textMuted }]}>
              Clears all muted authors and suppressed topics so your feed starts fresh.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyTitle:  { fontSize: 17, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  emptySub:    { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  section:     { paddingHorizontal: 16, marginBottom: 20 },
  sectionLabel:{ fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  card:        { borderRadius: 14, overflow: "hidden" },
  row:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  name:        { fontSize: 15, fontFamily: "Inter_500Medium" },
  handle:      { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  topicIcon:   { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  topicLabel:  { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  removeBtn:   { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  removeTxt:   { fontSize: 12, fontFamily: "Inter_500Medium" },
  resetBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  resetTxt:    { color: "#FF3B30", fontSize: 15, fontFamily: "Inter_500Medium" },
  resetHint:   { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8, lineHeight: 17 },
});
