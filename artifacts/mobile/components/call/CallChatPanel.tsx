import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useIsDesktop } from "@/hooks/useIsDesktop";

type ChatMessage = {
  id: string;
  text: string;
  fromMe: boolean;
  authorName: string;
  ts: number;
};

interface Props {
  visible: boolean;
  callId: string;
  selfId: string;
  selfName: string;
  otherName: string;
  onClose: () => void;
}

export function CallChatPanel({
  visible,
  callId,
  selfId,
  selfName,
  otherName,
  onClose,
}: Props) {
  const { isDesktop } = useIsDesktop();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const channelRef = useRef<any>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const slide = useRef(new Animated.Value(visible ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  useEffect(() => {
    if (!callId) return;
    const channel = supabase.channel(`call_chat:${callId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "msg" }, ({ payload }: any) => {
      if (!payload || payload.from === selfId) return;
      setMessages((prev) => [
        ...prev,
        {
          id: payload.id || `${Date.now()}_r`,
          text: String(payload.text || ""),
          fromMe: false,
          authorName: payload.authorName || otherName,
          ts: payload.ts || Date.now(),
        },
      ]);
    });
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [callId, selfId, otherName]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() =>
        listRef.current?.scrollToEnd({ animated: true })
      );
    }
  }, [messages.length]);

  function send() {
    const text = draft.trim();
    if (!text || !channelRef.current) return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const ts = Date.now();
    channelRef.current.send({
      type: "broadcast",
      event: "msg",
      payload: { id, text, from: selfId, authorName: selfName, ts },
    });
    setMessages((prev) => [
      ...prev,
      { id, text, fromMe: true, authorName: selfName, ts },
    ]);
    setDraft("");
  }

  const transform = useMemo(() => {
    if (isDesktop) {
      return [
        {
          translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 360] }),
        },
      ];
    }
    return [
      {
        translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 480] }),
      },
    ];
  }, [isDesktop, slide]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        { pointerEvents: visible ? "auto" : "none" } as any,
        isDesktop ? styles.panelDesktop : styles.panelMobile,
        { transform, opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>In-call chat</Text>
            <Text style={styles.headerSub}>
              Just visible to you and {otherName}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={36} color="rgba(255,255,255,0.45)" />
              <Text style={styles.emptyText}>
                Send a message without interrupting the call.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.msgRow,
                { alignItems: item.fromMe ? "flex-end" : "flex-start" },
              ]}
            >
              <View
                style={[
                  styles.msgBubble,
                  item.fromMe ? styles.msgMine : styles.msgTheirs,
                ]}
              >
                <Text style={styles.msgText}>{item.text}</Text>
              </View>
            </View>
          )}
        />

        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            placeholder="Message"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={styles.input}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={send}
            disabled={!draft.trim()}
            style={[styles.sendBtn, !draft.trim() && { opacity: 0.4 }]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panelDesktop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 360,
    backgroundColor: "rgba(18,22,28,0.96)",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(255,255,255,0.1)",
    ...Platform.select({
      web: { boxShadow: "-8px 0 24px rgba(0,0,0,0.4)" } as any,
      default: { shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: -8, height: 0 } },
    }),
    zIndex: 30,
  },
  panelMobile: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "60%",
    backgroundColor: "rgba(18,22,28,0.97)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
    zIndex: 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  headerSub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    marginTop: 2,
  },
  listContent: {
    padding: 12,
    gap: 6,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
    minHeight: 160,
  },
  emptyText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    textAlign: "center",
  },
  msgRow: { flexDirection: "column" },
  msgBubble: {
    maxWidth: "82%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  msgMine: {
    backgroundColor: "#00BCD4",
    borderBottomRightRadius: 4,
  },
  msgTheirs: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderBottomLeftRadius: 4,
  },
  msgText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 19,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    color: "#fff",
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#00BCD4",
    alignItems: "center",
    justifyContent: "center",
  },
});
