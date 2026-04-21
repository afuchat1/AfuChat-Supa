import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Ionicons } from "@expo/vector-icons";
import { supabase, supabaseUrl as SUPA_URL, supabaseAnonKey as SUPA_KEY } from "@/lib/supabase";
import { AFUAI_BOT_ID } from "@/lib/afuAiBot";
import { uploadChatMedia } from "@/lib/mediaUpload";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useDataMode } from "@/context/DataModeContext";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";

type Message = {
  id: string;
  sender_id: string;
  encrypted_content: string;
  sent_at: string;
  attachment_type?: string;
  attachment_url?: string;
  sender?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    is_verified?: boolean;
  } | null;
};

type ChatInfo = {
  id: string;
  name: string | null;
  is_group: boolean;
  is_channel: boolean;
  avatar_url: string | null;
  other_display_name: string;
  other_avatar: string | null;
  other_id: string;
  is_verified: boolean;
  is_organization_verified: boolean;
  other_last_seen: string | null;
  other_show_online_status: boolean;
};

function formatLastSeen(ts: string | null | undefined, showOnlineStatus?: boolean): { text: string; isOnline: boolean } {
  if (showOnlineStatus === false) return { text: "last seen recently", isOnline: false };
  if (!ts) return { text: "last seen recently", isOnline: false };
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 2 * 60 * 1000) return { text: "Online", isOnline: true };
  if (diff < 60 * 60 * 1000) return { text: "last seen recently", isOnline: false };
  if (diff < 24 * 60 * 60 * 1000) {
    const h = Math.floor(diff / 3600000);
    return { text: `last seen ${h}h ago`, isOnline: false };
  }
  const date = new Date(ts);
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const day = date.toLocaleDateString([], { weekday: "long" });
    return { text: `last seen on ${day}`, isOnline: false };
  }
  if (diff < 30 * 24 * 60 * 60 * 1000) {
    const label = date.toLocaleDateString([], { day: "numeric", month: "short" });
    return { text: `last seen on ${label}`, isOnline: false };
  }
  return { text: "last seen long time ago", isOnline: false };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

const BRAND = "#00BCD4";
const ONLINE_GREEN = "#34C759";

export function DesktopChatView({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const { isLowData } = useDataMode();
  const [revealedImages, setRevealedImages] = useState<Set<string>>(new Set());
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [isAfuAiTyping, setIsAfuAiTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [attachPreview, setAttachPreview] = useState<{ uri: string; type: string; name: string; mimeType?: string } | null>(null);
  const [uploadingAttach, setUploadingAttach] = useState(false);
  const flatRef = useRef<FlatList>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingMapRef = useRef<Map<string, string>>(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const c = isDark
    ? {
        bg: "#0d1117",
        header: "#131d24",
        inputBar: "#131d24",
        inputPill: "#1c2b34",
        bubbleOut: "#006d7c",
        bubbleOutText: "#e9edef",
        bubbleIn: "#1c2b34",
        bubbleInText: "#e9edef",
        text: "#e9edef",
        muted: "#8a9ba8",
        border: "#1e2d38",
        datePill: "rgba(13,17,23,0.88)",
        datePillText: "#8a9ba8",
        typing: "#1c2b34",
      }
    : {
        bg: "#f2f8fa",
        header: "#ffffff",
        inputBar: "#ffffff",
        inputPill: "#eaf4f7",
        bubbleOut: "#00BCD4",
        bubbleOutText: "#ffffff",
        bubbleIn: "#ffffff",
        bubbleInText: "#111b21",
        text: "#111b21",
        muted: "#667781",
        border: "#dce8ec",
        datePill: "rgba(255,255,255,0.9)",
        datePillText: "#667781",
        typing: "#e8f5e9",
      };

  const updateMyLastSeen = useCallback(async () => {
    if (!user) return;
    await supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", user.id);
  }, [user]);

  const loadChat = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [chatRes, msgRes] = await Promise.all([
        supabase
          .from("chats")
          .select(`id, name, is_group, is_channel, avatar_url,
            chat_members(user_id, profiles(
              id, display_name, avatar_url,
              is_verified, is_organization_verified,
              last_seen, show_online_status
            ))`)
          .eq("id", chatId)
          .single(),
        supabase
          .from("messages")
          .select("id, sender_id, encrypted_content, sent_at, attachment_type, attachment_url")
          .eq("chat_id", chatId)
          .order("sent_at", { ascending: false })
          .limit(100),
      ]);

      if (chatRes.data) {
        const ch = chatRes.data;
        const others = (ch.chat_members || []).filter((m: any) => m.user_id !== user.id);
        const profileRaw = others[0]?.profiles;
        const other: any = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
        setChatInfo({
          id: ch.id,
          name: ch.name,
          is_group: !!ch.is_group,
          is_channel: !!ch.is_channel,
          avatar_url: ch.avatar_url,
          other_display_name: other?.display_name || "User",
          other_avatar: other?.avatar_url || null,
          other_id: other?.id || "",
          is_verified: !!other?.is_verified,
          is_organization_verified: !!other?.is_organization_verified,
          other_last_seen: other?.last_seen || null,
          other_show_online_status: other?.show_online_status !== false,
        });
      }

      const rawMessages: Message[] = (msgRes.data || []).reverse();
      if (rawMessages.length > 0) {
        const senderIds = [...new Set(rawMessages.map((m) => m.sender_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, is_verified")
          .in("id", senderIds);
        const profileMap: Record<string, any> = {};
        for (const p of profiles || []) profileMap[p.id] = p;
        setMessages(rawMessages.map((m) => ({ ...m, sender: profileMap[m.sender_id] || null })));
      } else {
        setMessages([]);
      }
    } catch {
      setError("Could not load messages. Tap to retry.");
    } finally {
      setLoading(false);
    }
  }, [chatId, user]);

  useEffect(() => {
    loadChat();
    updateMyLastSeen();
    heartbeatRef.current = setInterval(updateMyLastSeen, 30_000);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [loadChat, updateMyLastSeen]);

  useEffect(() => {
    if (!user) return;
    const chan = supabase
      .channel(`desktop-chat-msgs:${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          const msg = payload.new as Message;
          if (msg.sender_id === AFUAI_BOT_ID) return;
          if (msg.sender_id === user?.id) return;
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, is_verified")
            .eq("id", msg.sender_id)
            .single();
          setMessages((prev) => [...prev, { ...msg, sender: profile || null }]);
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [chatId, user]);

  useEffect(() => {
    if (!chatInfo?.other_id || chatInfo.is_group || chatInfo.is_channel) return;
    const otherId = chatInfo.other_id;
    const chan = supabase
      .channel(`desktop-presence:${otherId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${otherId}` },
        (payload) => {
          const updated: any = payload.new;
          setChatInfo((prev) =>
            prev
              ? {
                  ...prev,
                  other_last_seen: updated?.last_seen || null,
                  other_show_online_status: updated?.show_online_status !== false,
                }
              : prev
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [chatInfo?.other_id, chatInfo?.is_group, chatInfo?.is_channel]);

  useEffect(() => {
    if (!user) return;
    const typingChannel = supabase.channel(`typing:${chatId}`, { config: { broadcast: { self: false } } });
    typingChannelRef.current = typingChannel;
    typingChannel
      .on("broadcast", { event: "typing" }, (payload) => {
        const { user_id: uid, display_name: name, is_typing } = (payload.payload || {}) as any;
        if (!uid || uid === user?.id) return;
        const clearTyper = () => {
          if (typingTimersRef.current.has(uid)) {
            clearTimeout(typingTimersRef.current.get(uid)!);
            typingTimersRef.current.delete(uid);
          }
          typingMapRef.current.delete(uid);
          setTypingUsers(Array.from(typingMapRef.current.values()));
        };
        if (is_typing) {
          typingMapRef.current.set(uid, name || "Someone");
          if (typingTimersRef.current.has(uid)) clearTimeout(typingTimersRef.current.get(uid)!);
          typingTimersRef.current.set(uid, setTimeout(clearTyper, 6000));
          setTypingUsers(Array.from(typingMapRef.current.values()));
        } else {
          clearTyper();
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
      typingTimersRef.current.forEach((t) => clearTimeout(t));
      typingTimersRef.current.clear();
      typingMapRef.current.clear();
    };
  }, [chatId, user]);

  function handleTyping() {
    if (!user) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: user.id, display_name: profile?.display_name || "Someone", is_typing: true },
    });
    typingTimeoutRef.current = setTimeout(() => {
      typingChannelRef.current?.send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: user.id, display_name: profile?.display_name || "Someone", is_typing: false },
      });
    }, 3000);
  }

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 200);
    }
  }, [messages.length]);

  async function handleAfuAiReply(userText: string, currentMessages: Message[]) {
    setIsAfuAiTyping(true);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      const recent = currentMessages
        .filter((m) => m.encrypted_content)
        .slice(-12)
        .map((m) => ({
          role: m.sender_id === user?.id ? ("user" as const) : ("assistant" as const),
          content: m.encrypted_content,
        }));
      recent.push({ role: "user", content: userText });

      const res = await fetch(`${SUPA_URL}/functions/v1/ai-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPA_KEY}`,
          apikey: SUPA_KEY || "",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are AfuAI, a friendly and capable AI assistant built into AfuChat — a social super app from Uganda. Help with anything: questions, writing, analysis, coding, creative tasks, advice, translations, and more. Respond in the same language the user writes in. Keep replies conversational and appropriately concise for a chat. Never mention being built by another company — you are AfuAI.",
            },
            ...recent,
          ],
        }),
      });

      const data = await res.json();
      const reply = (data.reply || "Sorry, I couldn't respond right now. Please try again.").trim();
      const sentAt = new Date().toISOString();

      let savedId: string | null = null;
      try {
        const { data: rpcId } = await supabase.rpc("insert_afuai_message", {
          p_chat_id: chatId,
          p_content: reply,
        });
        if (typeof rpcId === "string") savedId = rpcId;
      } catch (_) {}

      setMessages((prev) => [
        ...prev,
        {
          id: savedId || `afuai_${Date.now()}`,
          sender_id: AFUAI_BOT_ID,
          encrypted_content: reply,
          sent_at: sentAt,
          sender: { id: AFUAI_BOT_ID, display_name: "AfuAI", avatar_url: null },
        },
      ]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `afuai_err_${Date.now()}`,
          sender_id: AFUAI_BOT_ID,
          encrypted_content: "Sorry, I couldn't respond right now. Please try again.",
          sent_at: new Date().toISOString(),
          sender: { id: AFUAI_BOT_ID, display_name: "AfuAI", avatar_url: null },
        },
      ]);
    } finally {
      setIsAfuAiTyping(false);
    }
  }

  function pickFile() {
    if (Platform.OS !== "web") return;
    const input = (document as any).createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx";
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const uri = URL.createObjectURL(file);
      const type = file.type.startsWith("image/") ? "image"
        : file.type.startsWith("video/") ? "video"
        : "file";
      setAttachPreview({ uri, type, name: file.name, mimeType: file.type || undefined });
    };
    input.click();
  }

  async function sendAttachment() {
    if (!user || !attachPreview || uploadingAttach) return;
    setUploadingAttach(true);
    const now = new Date().toISOString();
    const label = attachPreview.type === "image" ? "📷 Photo"
      : attachPreview.type === "video" ? "🎥 Video"
      : `📎 ${attachPreview.name}`;

    const optimisticMsg: Message = {
      id: `attach_${Date.now()}`,
      sender_id: user.id,
      encrypted_content: label,
      sent_at: now,
      attachment_type: attachPreview.type,
      attachment_url: attachPreview.uri,
      sender: null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 60);

    const { publicUrl, error: uploadErr } = await uploadChatMedia(
      "chat-attachments",
      chatId,
      user.id,
      attachPreview.uri,
      attachPreview.name,
      attachPreview.mimeType,
    );

    setAttachPreview(null);

    if (uploadErr || !publicUrl) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setUploadingAttach(false);
      return;
    }

    const { error: insertErr, data: inserted } = await supabase
      .from("messages")
      .insert({
        chat_id: chatId,
        sender_id: user.id,
        encrypted_content: label,
        attachment_url: publicUrl,
        attachment_type: attachPreview.type,
        sent_at: now,
      })
      .select("id")
      .single();

    if (!insertErr && inserted) {
      setMessages((prev) =>
        prev.map((m) => m.id === optimisticMsg.id ? { ...m, id: inserted.id, attachment_url: publicUrl } : m)
      );
      await Promise.all([
        supabase.from("chats").update({ updated_at: now }).eq("id", chatId),
        supabase.from("profiles").update({ last_seen: now }).eq("id", user.id),
      ]);
    }

    setUploadingAttach(false);
  }

  async function sendMessage() {
    if (!text.trim() || !user || sending) return;
    setSending(true);
    const content = text.trim();
    setText("");
    const now = new Date().toISOString();

    const optimisticMsg: Message = {
      id: `msg_${Date.now()}`,
      sender_id: user.id,
      encrypted_content: content,
      sent_at: now,
      sender: null,
    };
    const snapshot = [...messages, optimisticMsg];
    setMessages(snapshot);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 60);

    const isAfuAiChat = chatInfo?.other_id === AFUAI_BOT_ID;

    const { error: insertErr, data: inserted } = await supabase
      .from("messages")
      .insert({ chat_id: chatId, sender_id: user.id, encrypted_content: content, sent_at: now })
      .select("id")
      .single();

    if (!insertErr && inserted) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticMsg.id ? { ...m, id: inserted.id } : m))
      );
      await Promise.all([
        supabase.from("chats").update({ updated_at: now }).eq("id", chatId),
        supabase.from("profiles").update({ last_seen: now }).eq("id", user.id),
      ]);
    }

    setSending(false);

    if (isAfuAiChat) {
      handleAfuAiReply(content, snapshot);
    }
  }

  const displayName = chatInfo
    ? chatInfo.is_group || chatInfo.is_channel
      ? chatInfo.name
      : chatInfo.other_display_name
    : null;
  const avatarUri = chatInfo
    ? chatInfo.is_group || chatInfo.is_channel
      ? chatInfo.avatar_url
      : chatInfo.other_avatar
    : null;
  const isAfuAiChat = chatInfo?.other_id === AFUAI_BOT_ID;
  const presenceInfo =
    !chatInfo?.is_group && !chatInfo?.is_channel
      ? isAfuAiChat
        ? { text: "AI Assistant · Always active", isOnline: true }
        : formatLastSeen(chatInfo?.other_last_seen, chatInfo?.other_show_online_status)
      : null;

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender_id === user?.id;
    const dateLabel = formatDate(item.sent_at);
    const showDate = index === 0 || dateLabel !== formatDate(messages[index - 1]?.sent_at ?? "");
    const nextMsg = messages[index + 1];
    const isLastInGroup = !nextMsg || nextMsg.sender_id !== item.sender_id;
    const prevMsg = messages[index - 1];
    const isFirstInGroup = !prevMsg || prevMsg.sender_id !== item.sender_id;

    return (
      <View>
        {showDate && (
          <View style={st.dateRow}>
            <View style={[st.datePill, { backgroundColor: c.datePill }]}>
              <Text style={[st.dateText, { color: c.datePillText }]}>{dateLabel}</Text>
            </View>
          </View>
        )}
        <View
          style={[
            st.msgRow,
            isMe ? st.msgRowMe : st.msgRowOther,
            { marginTop: isFirstInGroup ? 8 : 2 },
          ]}
        >
          {!isMe && (
            <View style={st.avatarCol}>
              {isLastInGroup ? (
                <Avatar uri={avatarUri} name={item.sender?.display_name || "?"} size={30} />
              ) : (
                <View style={{ width: 30 }} />
              )}
            </View>
          )}
          <View
            style={[
              st.bubble,
              isMe
                ? [{ backgroundColor: c.bubbleOut }, isLastInGroup && st.bubbleMeTail]
                : [{ backgroundColor: c.bubbleIn }, isLastInGroup && st.bubbleOtherTail],
            ]}
          >
            {!isMe && chatInfo?.is_group && isFirstInGroup && item.sender?.display_name && (
              <Text style={[st.senderName, { color: BRAND }]} numberOfLines={1}>
                {item.sender.display_name}
              </Text>
            )}
            {item.attachment_type === "image" && item.attachment_url ? (
              <>
                {isLowData && !revealedImages.has(item.id) ? (
                  <TouchableOpacity
                    onPress={() => setRevealedImages((prev) => new Set([...prev, item.id]))}
                    style={[st.msgImage, { backgroundColor: "rgba(0,0,0,0.1)", alignItems: "center", justifyContent: "center" }]}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="image-outline" size={24} color="rgba(0,0,0,0.35)" />
                    <Text style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 4 }}>Tap to load image</Text>
                  </TouchableOpacity>
                ) : (
                  <Image source={{ uri: item.attachment_url }} style={st.msgImage} resizeMode="cover" />
                )}
                {item.encrypted_content && !["📷 Photo", "🎥 Video", "GIF"].includes(item.encrypted_content) && (
                  <Text style={[st.msgText, { color: isMe ? c.bubbleOutText : c.bubbleInText, marginTop: 6 }]}>
                    {item.encrypted_content}
                  </Text>
                )}
                <Text style={[st.msgMeta, { color: isMe ? "rgba(233,237,239,0.65)" : c.muted }]}>
                  {formatTime(item.sent_at)}{isMe ? "  ✓✓" : ""}
                </Text>
              </>
            ) : (
              <View style={st.msgBody}>
                <Text style={[st.msgText, { color: isMe ? c.bubbleOutText : c.bubbleInText }]}>
                  {item.encrypted_content}
                </Text>
                <Text style={[st.msgMeta, { color: isMe ? "rgba(233,237,239,0.65)" : c.muted }]}>
                  {formatTime(item.sent_at)}
                  {isMe ? "  ✓✓" : ""}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[st.root, { backgroundColor: c.bg }]}>
      <View style={[st.header, { backgroundColor: c.header, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={onClose} style={st.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={c.muted} />
        </TouchableOpacity>

        <View style={{ position: "relative" }}>
          <View
            style={[
              st.avatarRing,
              {
                borderColor: presenceInfo?.isOnline ? ONLINE_GREEN : "transparent",
              },
            ]}
          >
            <Avatar uri={avatarUri} name={displayName || "Chat"} size={36} />
          </View>
          {presenceInfo?.isOnline && <View style={st.onlineDot} />}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={[st.headerName, { color: c.text }]} numberOfLines={1}>
              {displayName || "Chat"}
            </Text>
            {(chatInfo?.is_verified || chatInfo?.is_organization_verified) && (
              <VerifiedBadge
                isVerified={chatInfo.is_verified}
                isOrganizationVerified={chatInfo.is_organization_verified}
                size={14}
              />
            )}
          </View>
          {chatInfo?.is_group ? (
            <Text style={[st.headerSub, { color: c.muted }]}>Group · tap for info</Text>
          ) : chatInfo?.is_channel ? (
            <Text style={[st.headerSub, { color: c.muted }]}>Channel</Text>
          ) : presenceInfo ? (
            <Text style={[st.headerSub, { color: presenceInfo.isOnline ? ONLINE_GREEN : BRAND }]}>
              {presenceInfo.text}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity style={st.headerIcon} hitSlop={8}>
          <Ionicons name="ellipsis-vertical" size={20} color={c.muted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={BRAND} size="large" />
          <Text style={[st.centerText, { color: c.muted }]}>Loading messages…</Text>
        </View>
      ) : error ? (
        <TouchableOpacity style={st.center} onPress={loadChat}>
          <Ionicons name="refresh-circle-outline" size={44} color={BRAND} />
          <Text style={[st.centerText, { color: c.muted }]}>{error}</Text>
        </TouchableOpacity>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={st.msgList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={st.emptyState}>
              <View style={[st.emptyIconWrap, { backgroundColor: BRAND + "18" }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={36} color={BRAND} />
              </View>
              <Text style={[st.emptyTitle, { color: c.text }]}>
                {displayName ? `Start chatting with ${displayName}` : "No messages yet"}
              </Text>
              <Text style={[st.emptySub, { color: c.muted }]}>
                Say something to begin the conversation
              </Text>
            </View>
          }
          ListFooterComponent={
            (isAfuAiTyping || typingUsers.length > 0) ? (
              <View>
                {isAfuAiTyping && (
                  <View style={[st.msgRow, st.msgRowOther, { marginTop: 6 }]}>
                    <View style={st.avatarCol}>
                      <Avatar uri={null} name="AfuAI" size={30} />
                    </View>
                    <View style={[st.bubble, st.bubbleOtherTail, { backgroundColor: c.bubbleIn }]}>
                      <View style={st.typingDots}>
                        <View style={[st.dot, { backgroundColor: c.muted }]} />
                        <View style={[st.dot, { backgroundColor: c.muted }]} />
                        <View style={[st.dot, { backgroundColor: c.muted }]} />
                      </View>
                    </View>
                  </View>
                )}
                {typingUsers.length > 0 && (
                  <View style={[st.msgRow, st.msgRowOther, { marginTop: 4, marginBottom: 4 }]}>
                    <View style={[st.bubble, st.bubbleOtherTail, { backgroundColor: c.bubbleIn }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={st.typingDots}>
                          <View style={[st.dot, { backgroundColor: c.muted }]} />
                          <View style={[st.dot, { backgroundColor: c.muted }]} />
                          <View style={[st.dot, { backgroundColor: c.muted }]} />
                        </View>
                        <Text style={{ color: c.muted, fontSize: 12 }}>
                          {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            ) : null
          }
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {attachPreview && (
          <View style={[st.attachStrip, { backgroundColor: c.inputBar, borderTopColor: c.border }]}>
            <View style={st.attachPreviewInner}>
              {attachPreview.type === "image" ? (
                <Image source={{ uri: attachPreview.uri }} style={st.attachThumb} resizeMode="cover" />
              ) : (
                <View style={[st.attachFileIcon, { backgroundColor: BRAND + "22" }]}>
                  <Ionicons
                    name={attachPreview.type === "video" ? "videocam-outline" : "document-outline"}
                    size={20}
                    color={BRAND}
                  />
                </View>
              )}
              <Text style={[st.attachName, { color: c.text }]} numberOfLines={1}>
                {attachPreview.type === "image" ? "Photo" : attachPreview.name}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TouchableOpacity
                style={[st.attachSendBtn, { backgroundColor: BRAND }]}
                onPress={sendAttachment}
                disabled={uploadingAttach}
                activeOpacity={0.8}
              >
                {uploadingAttach ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAttachPreview(null)} hitSlop={10} disabled={uploadingAttach}>
                <Ionicons name="close-circle" size={22} color={c.muted} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={[st.inputBar, { backgroundColor: c.inputBar, borderTopColor: c.border }]}>
          <TouchableOpacity style={st.inputAction} hitSlop={8}>
            <Ionicons name="happy-outline" size={24} color={c.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={st.inputAction} hitSlop={8} onPress={pickFile}>
            <Ionicons name="attach-outline" size={24} color={c.muted} />
          </TouchableOpacity>
          <View style={[st.inputPill, { backgroundColor: c.inputPill }]}>
            <TextInput
              style={[st.input, { color: c.text }]}
              placeholder={isAfuAiChat ? "Ask AfuAI anything…" : "Message…"}
              placeholderTextColor={c.muted}
              value={text}
              onChangeText={(t) => { setText(t); handleTyping(); }}
              multiline
              maxLength={4000}
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
          </View>
          {(text.trim() || sending || isAfuAiTyping) && (
            <TouchableOpacity
              style={[st.sendBtn, { backgroundColor: BRAND }]}
              onPress={sendMessage}
              disabled={sending || isAfuAiTyping}
              activeOpacity={0.8}
            >
              {sending || isAfuAiTyping ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingHorizontal: 2 },
  avatarRing: { borderRadius: 22, borderWidth: 2, padding: 1 },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: ONLINE_GREEN,
    borderWidth: 2,
    borderColor: "#131d24",
  },
  headerName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  headerIcon: { padding: 6 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  centerText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  msgList: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 16 },

  dateRow: { alignItems: "center", marginVertical: 10 },
  datePill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  dateText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  msgRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 2 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },

  avatarCol: { width: 34, marginRight: 6, alignItems: "center", justifyContent: "flex-end" },

  bubble: {
    maxWidth: "75%",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 18,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  bubbleMeTail: { borderBottomRightRadius: 4 },
  bubbleOtherTail: { borderBottomLeftRadius: 4 },

  senderName: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 3 },

  msgBody: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: 6 },
  msgText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, flex: 1 },
  msgImage: { width: 200, height: 150, borderRadius: 10, marginBottom: 2 },
  msgMeta: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginBottom: 1,
    flexShrink: 0,
    marginLeft: "auto" as any,
  },

  typingDots: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, opacity: 0.7 },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputAction: { paddingBottom: 8, paddingHorizontal: 2 },
  inputPill: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "web" ? 9 : 6,
    minHeight: 42,
    maxHeight: 120,
    justifyContent: "center",
  },
  input: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },

  attachStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  attachPreviewInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  attachThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    flexShrink: 0,
  },
  attachFileIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  attachName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  attachSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
