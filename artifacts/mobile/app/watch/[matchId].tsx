import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  REACTION_EMOJIS,
  formatStatus,
  getMatch,
  getRoomForMatch,
  listRecentMessages,
  sendMessage,
  sendReaction,
  type WatchMatch,
  type WatchMessage,
  type WatchRoom,
} from "@/lib/watchTogether";

type FloatingEmoji = { id: string; emoji: string; left: number; anim: Animated.Value };

export default function WatchRoomScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth() as any;
  const params = useLocalSearchParams<{ matchId: string }>();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<WatchMatch | null>(null);
  const [room, setRoom] = useState<WatchRoom | null>(null);
  const [messages, setMessages] = useState<WatchMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [presenceCount, setPresenceCount] = useState(0);
  const [floats, setFloats] = useState<FloatingEmoji[]>([]);

  const listRef = useRef<FlatList<WatchMessage>>(null);

  const load = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([getMatch(matchId), getRoomForMatch(matchId)]);
      setMatch(m);
      setRoom(r);
      if (r) {
        const msgs = await listRecentMessages(r.id);
        setMessages(msgs);
      }
    } catch (e) {
      console.warn("[watch room] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: match updates (score, status, minute)
  useEffect(() => {
    if (!matchId) return;
    const ch = supabase
      .channel(`watch:match:${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "watch_matches", filter: `id=eq.${matchId}` },
        (payload) => setMatch(payload.new as WatchMatch)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [matchId]);

  // Realtime: messages + reactions + presence on the room channel
  useEffect(() => {
    if (!room) return;
    const roomId = room.id;

    const msgCh = supabase
      .channel(`watch:room:${roomId}:messages`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "watch_messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const m = payload.new as WatchMessage;
          setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
        }
      )
      .subscribe();

    const reactCh = supabase
      .channel(`watch:room:${roomId}:reactions`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "watch_reactions", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const r = payload.new as { emoji: string };
          spawnFloat(r.emoji);
        }
      )
      .subscribe();

    const presCh = supabase.channel(`watch:room:${roomId}:presence`, {
      config: { presence: { key: user?.id || `guest-${Math.random().toString(36).slice(2, 8)}` } },
    });
    presCh
      .on("presence", { event: "sync" }, () => {
        const state = presCh.presenceState();
        const total = Object.values(state).reduce((acc, arr: any) => acc + (arr?.length || 0), 0);
        setPresenceCount(total);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presCh.track({
            user_id: user?.id || null,
            display_name: profile?.display_name || "Guest",
            joined_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(msgCh);
      supabase.removeChannel(reactCh);
      supabase.removeChannel(presCh);
    };
  }, [room?.id, user?.id, profile?.display_name]);

  function spawnFloat(emoji: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const left = 20 + Math.random() * 60; // % from left within reaction column
    const anim = new Animated.Value(0);
    setFloats((prev) => [...prev, { id, emoji, left, anim }]);
    Animated.timing(anim, { toValue: 1, duration: 2200, useNativeDriver: true }).start(() => {
      setFloats((prev) => prev.filter((f) => f.id !== id));
    });
  }

  async function handleSend() {
    if (!user || !room) return;
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    try {
      await sendMessage({
        roomId: room.id,
        userId: user.id,
        displayName: profile?.display_name || "Anonymous",
        avatarUrl: profile?.avatar_url || null,
        body,
      });
    } catch (e: any) {
      console.warn("[watch room] send failed", e);
      setText(body);
    } finally {
      setSending(false);
    }
  }

  async function handleReact(emoji: string) {
    if (!user || !room) return;
    spawnFloat(emoji); // optimistic
    try {
      await sendReaction({ roomId: room.id, userId: user.id, emoji });
    } catch (e) {
      console.warn("[watch room] react failed", e);
    }
  }

  const headerTitle = useMemo(() => {
    if (!match) return "Watch Room";
    return `${match.home_team} vs ${match.away_team}`;
  }, [match]);

  const renderMessage = ({ item }: { item: WatchMessage }) => {
    if (item.kind === "system") {
      return (
        <View style={styles.systemRow}>
          <View style={[styles.systemBubble, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            <Text style={[styles.systemText, { color: colors.text }]}>{item.body}</Text>
          </View>
        </View>
      );
    }
    const mine = item.user_id === user?.id;
    return (
      <View style={[styles.msgRow, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
        {!mine && (
          item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.msgAvatar} />
          ) : (
            <View style={[styles.msgAvatar, styles.msgAvatarFallback, { backgroundColor: colors.border }]}>
              <Text style={[styles.msgAvatarFallbackText, { color: colors.text }]}>
                {(item.display_name || "?").slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )
        )}
        <View
          style={[
            styles.msgBubble,
            mine
              ? { backgroundColor: colors.brand, marginLeft: 40 }
              : { backgroundColor: colors.backgroundSecondary, marginRight: 40, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
          ]}
        >
          {!mine && (
            <Text style={[styles.msgName, { color: colors.textMuted }]} numberOfLines={1}>
              {item.display_name || "Anonymous"}
            </Text>
          )}
          <Text style={[styles.msgBody, { color: mine ? "#fff" : colors.text }]}>{item.body}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!match || !room) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Match not found</Text>
          <View style={styles.headerBtn} />
        </View>
      </View>
    );
  }

  const isLive = match.status === "live" || match.status === "ht";

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{headerTitle}</Text>
            <View style={styles.headerSubRow}>
              <Ionicons name="people" size={12} color={colors.textMuted} />
              <Text style={[styles.headerSub, { color: colors.textMuted }]}>{presenceCount} watching · {formatStatus(match)}</Text>
            </View>
          </View>
          <View style={styles.headerBtn} />
        </View>

        {/* Match scoreboard */}
        <View style={[styles.scoreboard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <View style={styles.scoreTeam}>
            <Text style={[styles.scoreTeamName, { color: colors.text }]} numberOfLines={1}>{match.home_team}</Text>
          </View>
          <View style={styles.scoreCenter}>
            <Text style={[styles.scoreText, { color: colors.text }]}>{match.home_score} — {match.away_score}</Text>
            {isLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{formatStatus(match)}</Text>
              </View>
            )}
            {!isLive && (
              <Text style={[styles.scoreStatus, { color: colors.textMuted }]}>{formatStatus(match)}</Text>
            )}
          </View>
          <View style={styles.scoreTeam}>
            <Text style={[styles.scoreTeamName, { color: colors.text, textAlign: "right" }]} numberOfLines={1}>{match.away_team}</Text>
          </View>
        </View>
      </View>

      {/* Messages + floating reactions overlay */}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Floating emoji column on right */}
        <View pointerEvents="none" style={styles.floatLayer}>
          {floats.map((f) => {
            const translateY = f.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -260] });
            const opacity = f.anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
            const scale = f.anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.2, 1] });
            return (
              <Animated.Text
                key={f.id}
                style={[
                  styles.floatEmoji,
                  { right: 16 + (f.left % 40), transform: [{ translateY }, { scale }], opacity },
                ]}
              >
                {f.emoji}
              </Animated.Text>
            );
          })}
        </View>
      </View>

      {/* Reactions bar */}
      <View style={[styles.reactBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {REACTION_EMOJIS.map((e) => (
          <TouchableOpacity key={e} onPress={() => handleReact(e)} style={styles.reactBtn}>
            <Text style={styles.reactEmoji}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Composer */}
      <View style={[styles.composer, { borderTopColor: colors.border, paddingBottom: 8 + insets.bottom, backgroundColor: colors.background }]}>
        <View style={[styles.input, { backgroundColor: colors.backgroundSecondary }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={user ? "Say something…" : "Sign in to chat"}
            placeholderTextColor={colors.textMuted}
            editable={!!user}
            style={[styles.inputText, { color: colors.text }]}
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit
          />
        </View>
        <TouchableOpacity
          disabled={!user || !text.trim() || sending}
          onPress={handleSend}
          style={[styles.sendBtn, { backgroundColor: !user || !text.trim() ? colors.textMuted : colors.brand }]}
        >
          <Ionicons name={sending ? "hourglass" : "send"} size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  headerSubRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  headerSub: { fontSize: 11 },

  scoreboard: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scoreTeam: { flex: 1 },
  scoreTeamName: { fontSize: 14, fontWeight: "700" },
  scoreCenter: { alignItems: "center", paddingHorizontal: 12 },
  scoreText: { fontSize: 22, fontWeight: "800" },
  scoreStatus: { fontSize: 12, marginTop: 4 },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF3B30",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
    marginTop: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },

  msgRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 8, gap: 6 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  msgAvatarFallback: { alignItems: "center", justifyContent: "center" },
  msgAvatarFallbackText: { fontSize: 12, fontWeight: "700" },
  msgBubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, maxWidth: "75%" },
  msgName: { fontSize: 11, fontWeight: "600", marginBottom: 2 },
  msgBody: { fontSize: 14, lineHeight: 19 },

  systemRow: { alignItems: "center", marginVertical: 6 },
  systemBubble: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  systemText: { fontSize: 12, fontWeight: "600", textAlign: "center" },

  floatLayer: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end" },
  floatEmoji: { position: "absolute", bottom: 8, fontSize: 28 },

  reactBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reactBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  reactEmoji: { fontSize: 24 },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, maxHeight: 110 },
  inputText: { fontSize: 14, lineHeight: 19, minHeight: 22 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
