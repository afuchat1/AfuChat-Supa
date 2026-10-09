import React, { useCallback, useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { deleteAllLocalMessages } from "@/lib/storage/localMessages";

export default function ChatDangerScreen() {
  const {
    id,
    displayName,
    otherId,
    isGroup: isGroupParam,
    isChannel: isChannelParam,
  } = useLocalSearchParams<{
    id: string;
    displayName?: string;
    otherId?: string;
    isGroup?: string;
    isChannel?: string;
  }>();

  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const isGroup   = isGroupParam   === "1";
  const isChannel = isChannelParam === "1";
  const isDM      = !isGroup && !isChannel;
  const name      = displayName ?? "this person";

  const [isBlocked, setIsBlocked] = useState(false);

  const checkBlock = useCallback(async () => {
    if (!user || !otherId) return;
    const res = await supabase
      .from("blocked_users").select("id")
      .eq("blocker_id", user.id).eq("blocked_id", otherId)
      .maybeSingle();
    setIsBlocked(!!res.data);
  }, [user, otherId]);

  useEffect(() => { checkBlock(); }, [checkBlock]);

  async function handleBlock() {
    if (!user || !otherId) return;
    if (isBlocked) {
      showAlert(
        "Unblock User",
        `Allow ${name} to message you again?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unblock",
            onPress: async () => {
              const { error } = await supabase.from("blocked_users").delete()
                .eq("blocker_id", user.id).eq("blocked_id", otherId);
              if (error) {
                showAlert("Could not unblock", error.message || "Please try again.");
                return;
              }
              setIsBlocked(false);
            },
          },
        ],
      );
    } else {
      showAlert(
        "Block User",
        `Block ${name}? They won't be able to send you messages or see your profile.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Block",
            style: "destructive",
            onPress: async () => {
              const { error } = await supabase
                .from("blocked_users")
                .insert({ blocker_id: user.id, blocked_id: otherId });
              if (error) {
                showAlert("Could not block", error.message || "Please try again.");
                return;
              }
              setIsBlocked(true);
            },
          },
        ],
      );
    }
  }

  function handleReport() {
    if (!user || !otherId) return;
    router.push({
      pathname: "/report/[userId]",
      params: { userId: otherId, displayName: name },
    } as any);
  }

  function handleClearChat() {
    if (!user) return;
    showAlert(
      "Clear Chat History",
      (isGroup || isChannel)
        ? "This removes all messages for you only. Other members won't be affected. This action cannot be undone."
        : "This removes all messages for you only. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Chat",
          style: "destructive",
          onPress: async () => {
            try {
              const clearedAt = new Date().toISOString();
              await AsyncStorage.setItem(`chat_cleared_${user.id}_${id}`, clearedAt);
              await deleteAllLocalMessages(id);
              showAlert("Chat Cleared", "All messages have been removed for you.");
            } catch {
              showAlert("Error", "Could not clear chat. Please try again.");
            }
          },
        },
      ],
    );
  }

  function handleDeleteOrLeave() {
    if (!user) return;
    const title = (isGroup || isChannel) ? (isChannel ? "Leave Channel" : "Leave Group") : "Delete Chat";
    const msg   = isChannel
      ? "Leave this channel? You won't receive messages anymore."
      : isGroup
        ? "Leave this group? You'll need an invite to rejoin."
        : "Delete this entire conversation? All messages will be permanently removed for you.";
    showAlert(
      title,
      msg,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: title,
          style: "destructive",
          onPress: async () => {
            try {
              if (isGroup || isChannel) {
                const { error } = await supabase.from("chat_members").delete()
                  .eq("chat_id", id).eq("user_id", user.id);
                if (error) throw error;
                if (isChannel) {
                  const { error: subscriptionError } = await supabase
                    .from("channel_subscriptions")
                    .delete()
                    .eq("channel_id", id)
                    .eq("user_id", user.id);
                  if (subscriptionError) throw subscriptionError;
                }
              } else {
                const { error: messagesError } = await supabase.from("messages").delete().eq("chat_id", id);
                if (messagesError) throw messagesError;
                const { error: chatError } = await supabase.from("chats").delete().eq("id", id);
                if (chatError) throw chatError;
              }
              router.replace("/(tabs)/chats" as any);
            } catch {
              showAlert("Error", "Could not complete this action. Please try again.");
            }
          },
        },
      ],
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Safety & Privacy" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Warning banner ── */}
        <View style={[s.warnCard, { backgroundColor: "#FF3B3012", borderColor: "#FF3B3030" }]}>
          <Ionicons name="warning" size={20} color="#FF3B30" />
          <Text style={[s.warnText, { color: colors.text }]}>
            Actions on this page affect your account. Some cannot be undone.
          </Text>
        </View>

        {/* ── Block / Report (DM only) ── */}
        {isDM && otherId ? (
          <>
            <SectionTitle label="USER SAFETY" colors={colors} />
            <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Row
                icon={isBlocked ? "checkmark-circle" : "ban"}
                bg={isBlocked ? "#34C759" : "#FF9500"}
                label={isBlocked ? `Unblock ${name}` : `Block ${name}`}
                sub={isBlocked ? "They cannot message you right now" : "Stop receiving messages from this person"}
                colors={colors}
                onPress={handleBlock}
              />
              <Sep color={colors.border} />
              <Row
                icon="flag"
                bg="#FF3B30"
                label={`Report ${name}`}
                sub="Report spam, harassment, or inappropriate content"
                colors={colors}
                onPress={handleReport}
              />
            </View>
          </>
        ) : null}

        {/* ── Clear / Leave / Delete ── */}
        <SectionTitle label="CHAT DATA" colors={colors} />
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row
            icon="trash"
            bg="#FF9500"
            label="Clear Chat History"
            sub="Removes all messages for you only. This cannot be undone"
            colors={colors}
            onPress={handleClearChat}
          />
          <Sep color={colors.border} />
          <Row
            icon={isGroup || isChannel ? "exit" : "close-circle"}
            bg="#FF3B30"
            label={isChannel ? "Leave Channel" : isGroup ? "Leave Group" : "Delete Conversation"}
            sub={
              isChannel ? "You'll stop receiving channel updates"
              : isGroup  ? "You'll be removed from this group"
              :            "Permanently removes this conversation for you"
            }
            colors={colors}
            onPress={handleDeleteOrLeave}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ label, colors }: { label: string; colors: any }) {
  return <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{label}</Text>;
}

function Sep({ color }: { color: string }) {
  return <View style={[s.sep, { backgroundColor: color }]} />;
}

function Row({
  colors, icon, bg, label, sub, onPress,
}: {
  colors: any; icon: string; bg: string; label: string; sub?: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.6}>
      <View style={[s.iconBadge, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={17} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, { color: colors.text }]}>{label}</Text>
        {sub ? <Text style={[s.rowSub, { color: colors.textMuted }]}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  warnCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  warnText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },

  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 6,
  },

  group: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
    minHeight: 56,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  rowSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    lineHeight: 16,
  },

  sep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },
});
