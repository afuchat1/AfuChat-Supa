import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { parseInviteCode, generateGroupInviteLink } from "@/lib/groupInvite";
import Colors from "@/constants/colors";

const BRAND = Colors.brand;
const PENDING_INVITE_KEY = "afuchat_pending_invite_code";

type GroupInfo = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  handle: string | null;
  is_channel: boolean;
  member_count: number;
};

export default function JoinGroupScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user }  = useAuth();
  const { colors } = useTheme();
  const insets   = useSafeAreaInsets();

  const [group, setGroup]           = useState<GroupInfo | null>(null);
  const [loading, setLoading]       = useState(true);
  const [joining, setJoining]       = useState(false);
  const [isMember, setIsMember]     = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [joined, setJoined]         = useState(false);
  const [copied, setCopied]         = useState(false);
  const copiedTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chatId = parseInviteCode(code ?? "");

  const loadGroup = useCallback(async () => {
    if (!chatId) {
      setError("This invite link is invalid or has expired.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: chat, error: chatErr } = await supabase
        .from("chats")
        .select("id, name, description, avatar_url, is_group, is_channel")
        .eq("id", chatId)
        .or("is_group.eq.true,is_channel.eq.true")
        .maybeSingle();

      if (chatErr || !chat) {
        setError("This group or channel doesn't exist, or the link is no longer valid.");
        setLoading(false);
        return;
      }

      const [{ count }, { data: channelProfile }] = await Promise.all([
        supabase
          .from("chat_members")
          .select("*", { count: "exact", head: true })
          .eq("chat_id", chatId),
        chat.is_channel
          ? supabase.from("channels").select("handle").eq("id", chatId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setGroup({
        id:           chat.id,
        name:         chat.name ?? "Unnamed Group",
        description:  chat.description ?? null,
        avatar_url:   chat.avatar_url ?? null,
         handle:       channelProfile?.handle ?? null,
        is_channel:   !!chat.is_channel,
        member_count: count ?? 0,
      });

      if (user) {
        const { data: membership } = await supabase
          .from("chat_members")
          .select("user_id")
          .eq("chat_id", chatId)
          .eq("user_id", user.id)
          .maybeSingle();
        setIsMember(!!membership);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [chatId, user?.id]);

  useEffect(() => {
    loadGroup();
    return () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); };
  }, [loadGroup]);

  async function handleJoin() {
    if (!user) {
      await AsyncStorage.setItem(PENDING_INVITE_KEY, code ?? "").catch(() => {});
      router.replace("/(auth)/login" as any);
      return;
    }
    if (!group) return;
    setJoining(true);
    try {
      const { error: insertErr } = await supabase
        .from("chat_members")
        .insert({ chat_id: group.id, user_id: user.id, is_admin: false, joined_at: new Date().toISOString() });

      if (insertErr && !insertErr.message?.includes("duplicate")) {
        throw insertErr;
      }

       if (group.is_channel) {
         const { error: subscriptionError } = await supabase
           .from("channel_subscriptions")
           .upsert({ channel_id: group.id, user_id: user.id }, { onConflict: "channel_id,user_id" });
         if (subscriptionError) throw subscriptionError;
         await supabase.rpc("increment_channel_subscriber", { p_channel_id: group.id });
       } else {
         await supabase.from("messages").insert({
           chat_id:           group.id,
           sender_id:         user.id,
           encrypted_content: `joined via invite link`,
           type:              "system",
           sent_at:           new Date().toISOString(),
         }).then(() => {}, () => {});
       }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setJoined(true);
      setTimeout(() => {
        router.replace({ pathname: "/chat/[id]", params: { id: group.id } } as any);
      }, 800);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err?.message ?? "Failed to join. Please try again.");
      setJoining(false);
    }
  }

  function handleOpen() {
    if (!group) return;
    router.replace({ pathname: "/chat/[id]", params: { id: group.id } } as any);
  }

  async function handleCopyLink() {
    if (!group) return;
    const link = generateGroupInviteLink(group.id);
    await Clipboard.setStringAsync(link);
    Haptics.selectionAsync();
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!group) return;
    const link = generateGroupInviteLink(group.id);
    try {
      await Share.share({
        title:   `Join ${group.name} on AfuChat`,
        message: `Join ${group.name} on AfuChat: ${link}`,
        url:     link,
      });
    } catch {}
  }

  const labelColor  = colors.text;
  const mutedColor  = colors.textMuted;
  const bgColor     = colors.background;
  const surfaceColor = colors.surface;
  const borderColor  = colors.border;

  return (
    <View style={[st.root, { backgroundColor: bgColor, paddingTop: insets.top }]}>
      {/* Close button */}
      <TouchableOpacity
        onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/chats" as any); }}
        style={[st.closeBtn, { top: insets.top + 12 }]}
        hitSlop={12}
      >
        <Ionicons name="close" size={22} color={mutedColor} />
      </TouchableOpacity>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={BRAND} />
           <Text style={[st.loadingText, { color: mutedColor }]}>Loading {group?.is_channel ? "channel" : "group"} info…</Text>
        </View>
      ) : error ? (
        <View style={st.center}>
          <View style={[st.errorIcon, { backgroundColor: surfaceColor }]}>
            <Ionicons name="link" size={40} color="#FF3B30" />
          </View>
          <Text style={[st.errorTitle, { color: labelColor }]}>Invalid Link</Text>
          <Text style={[st.errorBody, { color: mutedColor }]}>{error}</Text>
          <TouchableOpacity
            style={[st.retryBtn, { backgroundColor: BRAND }]}
            onPress={loadGroup}
          >
            <Text style={st.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/chats" as any); }}
            style={{ marginTop: 16 }}
          >
            <Text style={[st.cancelLink, { color: mutedColor }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : group ? (
        <ScrollView
          contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar */}
          <View style={st.avatarWrap}>
            {group.avatar_url ? (
              <Image source={{ uri: group.avatar_url }} style={st.avatar} />
            ) : (
              <View style={[st.avatarFallback, { backgroundColor: BRAND }]}>
                <Text style={st.avatarInitial}>
                  {(group.name[0] ?? "G").toUpperCase()}
                </Text>
              </View>
            )}
            <View style={[st.typeBadge, { backgroundColor: BRAND }]}>
              <Ionicons
                name={group.is_channel ? "megaphone" : "people"}
                size={12}
                color="#fff"
              />
            </View>
          </View>

           {/* Group or channel identity */}
          <Text style={[st.groupName, { color: labelColor }]}>{group.name}</Text>
           {group.is_channel && group.handle ? (
             <Text style={[st.alreadyMember, { color: mutedColor, marginTop: 4 }]}>@{group.handle}</Text>
           ) : null}

          {/* Type + member count */}
          <View style={st.metaRow}>
            <View style={[st.metaChip, { backgroundColor: surfaceColor, borderColor }]}>
              <Ionicons name="people" size={13} color={mutedColor} style={{ marginRight: 5 }} />
              <Text style={[st.metaText, { color: mutedColor }]}>
                 {group.member_count.toLocaleString()} {group.is_channel
                   ? (group.member_count === 1 ? "subscriber" : "subscribers")
                   : (group.member_count === 1 ? "member" : "members")}
              </Text>
            </View>
            <View style={[st.metaChip, { backgroundColor: surfaceColor, borderColor }]}>
              <Ionicons
                name={group.is_channel ? "megaphone" : "people-circle"}
                size={13}
                color={mutedColor}
                style={{ marginRight: 5 }}
              />
              <Text style={[st.metaText, { color: mutedColor }]}>
                {group.is_channel ? "Channel" : "Group"}
              </Text>
            </View>
          </View>

          {/* Description */}
          {group.description ? (
            <View style={[st.descBox, { backgroundColor: surfaceColor, borderColor }]}>
              <Text style={[st.descText, { color: mutedColor }]}>{group.description}</Text>
            </View>
          ) : null}

          {/* Invite link box */}
          <View style={[st.linkBox, { backgroundColor: surfaceColor, borderColor }]}>
            <Ionicons name="link" size={16} color={mutedColor} style={{ marginRight: 8 }} />
            <Text style={[st.linkText, { color: mutedColor }]} numberOfLines={1} ellipsizeMode="middle">
              {generateGroupInviteLink(group.id)}
            </Text>
            <TouchableOpacity onPress={handleCopyLink} hitSlop={8} style={{ marginLeft: 8 }}>
              <Ionicons
                name={copied ? "checkmark-circle" : "copy"}
                size={18}
                color={copied ? "#34C759" : BRAND}
              />
            </TouchableOpacity>
          </View>

          {/* CTA */}
          {joined ? (
            <View style={[st.joinedBanner, { backgroundColor: "#34C75920" }]}>
              <Ionicons name="checkmark-circle" size={20} color="#34C759" style={{ marginRight: 8 }} />
              <Text style={[st.joinedText, { color: "#34C759" }]}>Joined! Opening chat…</Text>
            </View>
          ) : isMember ? (
            <>
              <TouchableOpacity
                style={[st.joinBtn, { backgroundColor: BRAND }]}
                onPress={handleOpen}
                activeOpacity={0.85}
              >
                <Ionicons name="chatbubbles" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={st.joinBtnText}>Open Chat</Text>
              </TouchableOpacity>
              <Text style={[st.alreadyMember, { color: mutedColor }]}>
                 You are already a member of this {group.is_channel ? "channel" : "group"}.
              </Text>
            </>
          ) : (
            <TouchableOpacity
              style={[st.joinBtn, { backgroundColor: BRAND, opacity: joining ? 0.7 : 1 }]}
              onPress={handleJoin}
              disabled={joining}
              activeOpacity={0.85}
            >
              {joining ? (
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="enter" size={18} color="#fff" style={{ marginRight: 8 }} />
              )}
               <Text style={st.joinBtnText}>{joining ? "Joining…" : group.is_channel ? "Subscribe" : "Join Group"}</Text>
            </TouchableOpacity>
          )}

          {/* Share row */}
          <TouchableOpacity style={st.shareRow} onPress={handleShare}>
            <Ionicons name="share-social" size={16} color={mutedColor} style={{ marginRight: 6 }} />
            <Text style={[st.shareText, { color: mutedColor }]}>Share this link</Text>
          </TouchableOpacity>

          {/* Cancel */}
          {!isMember && !joined && (
            <TouchableOpacity
              onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/chats" as any); }}
              style={{ marginTop: 8 }}
            >
              <Text style={[st.cancelLink, { color: mutedColor }]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  root: {
    flex: 1,
  },
  closeBtn: {
    position:  "absolute",
    right:     16,
    zIndex:    20,
    width:     36,
    height:    36,
    borderRadius: 18,
    alignItems:   "center",
    justifyContent: "center",
  },
  center: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop:  16,
    fontSize:   14,
    fontFamily: "Inter_400Regular",
  },
  errorIcon: {
    width:          80,
    height:         80,
    borderRadius:   40,
    alignItems:     "center",
    justifyContent: "center",
    marginBottom:   16,
  },
  errorTitle: {
    fontSize:   20,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
    textAlign:  "center",
  },
  errorBody: {
    fontSize:   14,
    fontFamily: "Inter_400Regular",
    textAlign:  "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  retryBtn: {
    paddingHorizontal: 32,
    paddingVertical:   12,
    borderRadius:      24,
  },
  retryBtnText: {
    color:      "#fff",
    fontSize:   15,
    fontFamily: "Inter_600SemiBold",
  },
  scroll: {
    alignItems:        "center",
    paddingHorizontal: 24,
    paddingTop:        64,
  },
  avatarWrap: {
    position: "relative",
    marginBottom: 20,
  },
  avatar: {
    width:        100,
    height:       100,
    borderRadius: 50,
  },
  avatarFallback: {
    width:          100,
    height:         100,
    borderRadius:   50,
    alignItems:     "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize:   40,
    color:      "#fff",
    fontFamily: "Inter_700Bold",
  },
  typeBadge: {
    position:       "absolute",
    bottom:         0,
    right:          0,
    width:          26,
    height:         26,
    borderRadius:   13,
    alignItems:     "center",
    justifyContent: "center",
    borderWidth:    2,
    borderColor:    "#fff",
  },
  groupName: {
    fontSize:     26,
    fontFamily:   "Inter_700Bold",
    textAlign:    "center",
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  metaRow: {
    flexDirection:  "row",
    gap:            8,
    marginBottom:   16,
  },
  metaChip: {
    flexDirection:  "row",
    alignItems:     "center",
    paddingHorizontal: 10,
    paddingVertical:   6,
    borderRadius:   20,
    borderWidth:    1,
  },
  metaText: {
    fontSize:   13,
    fontFamily: "Inter_400Regular",
  },
  descBox: {
    width:          "100%",
    padding:        14,
    borderRadius:   14,
    borderWidth:    1,
    marginBottom:   16,
  },
  descText: {
    fontSize:   14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    textAlign:  "center",
  },
  linkBox: {
    width:          "100%",
    flexDirection:  "row",
    alignItems:     "center",
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:   12,
    borderWidth:    1,
    marginBottom:   24,
  },
  linkText: {
    flex:       1,
    fontSize:   13,
    fontFamily: "Inter_400Regular",
  },
  joinedBanner: {
    flexDirection:  "row",
    alignItems:     "center",
    paddingHorizontal: 20,
    paddingVertical:   14,
    borderRadius:   14,
    marginBottom:   16,
    width:          "100%",
    justifyContent: "center",
  },
  joinedText: {
    fontSize:   15,
    fontFamily: "Inter_600SemiBold",
  },
  joinBtn: {
    width:          "100%",
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius:   16,
    marginBottom:   12,
  },
  joinBtnText: {
    color:      "#fff",
    fontSize:   16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  alreadyMember: {
    fontSize:   13,
    fontFamily: "Inter_400Regular",
    textAlign:  "center",
    marginBottom: 16,
  },
  shareRow: {
    flexDirection:  "row",
    alignItems:     "center",
    paddingVertical: 10,
    marginBottom:   4,
  },
  shareText: {
    fontSize:   14,
    fontFamily: "Inter_400Regular",
  },
  cancelLink: {
    fontSize:   14,
    fontFamily: "Inter_400Regular",
    textAlign:  "center",
    paddingVertical: 8,
  },
});
