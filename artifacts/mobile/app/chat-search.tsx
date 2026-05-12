import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { getEdgeFnBase, edgeHeaders } from "@/lib/aiHelper";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useTier } from "@/hooks/useTier";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import * as Haptics from "@/lib/haptics";

const AI_PURPLE = "#7B61FF";
const AI_TEAL   = "#00C2CB";
const GOLD      = "#D4A853";

type TabId = "chats" | "people" | "channels" | "groups" | "messages" | "media" | "links";

type ChatResult = {
  id: string; name: string | null; is_group: boolean; is_channel: boolean;
  avatar_url: string | null; other_display_name: string; other_avatar: string | null;
  other_id: string;
};

type PersonResult = {
  id: string; handle: string; display_name: string; avatar_url: string | null;
  bio: string | null; is_verified: boolean; is_organization_verified: boolean;
};

type ChannelResult = {
  id: string; name: string; description: string | null;
  avatar_url: string | null; member_count: number;
};

type GroupResult = {
  id: string; name: string; description: string | null;
  avatar_url: string | null; member_count: number;
};

type MessageResult = {
  id: string; chat_id: string; chat_name: string; chat_avatar: string | null;
  content: string; sender_name: string; sent_at: string; is_channel: boolean;
};

type MediaResult = {
  id: string; chat_id: string; chat_name: string; chat_avatar: string | null;
  attachment_url: string; attachment_type: "image" | "video" | "gif";
  sender_name: string; sent_at: string;
};

type LinkResult = {
  id: string; chat_id: string; chat_name: string; chat_avatar: string | null;
  url: string; preview_text: string; sender_name: string; sent_at: string;
};

type AiInsight = {
  summary: string; bestTab: TabId; suggestions: string[];
  filters: string[]; resultSummary: string; actions: string[];
};

const TABS: { id: TabId; label: string; icon: string; premium?: boolean }[] = [
  { id: "chats",    label: "Chats",    icon: "chatbubble-ellipses-outline" },
  { id: "people",   label: "People",   icon: "person-outline" },
  { id: "channels", label: "Channels", icon: "megaphone-outline" },
  { id: "groups",   label: "Groups",   icon: "people-outline" },
  { id: "messages", label: "Messages", icon: "mail-open-outline", premium: true },
  { id: "media",    label: "Media",    icon: "images-outline" },
  { id: "links",    label: "Links",    icon: "link-outline" },
];

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Robustly extract and parse a JSON object from an AI reply that may include markdown fences. */
function parseChatAiJson(raw: string): Record<string, any> | null {
  if (!raw) return null;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw;
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  try { return JSON.parse(objMatch[0]); } catch { return null; }
}

async function fetchChatAiInsight(query: string): Promise<AiInsight | null> {
  try {
    const res = await fetch(`${getEdgeFnBase()}/afu-ai-reply`, {
      method: "POST",
      headers: edgeHeaders(),
      body: JSON.stringify({
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: `You are AfuChat's messaging search assistant. Analyze the search query and reply ONLY with a single JSON object — no markdown, no code fences, no text outside the JSON:
{"summary":"2-3 sentences on what the user wants","bestTab":"chats|people|channels|groups|messages","suggestions":["refined search","related search","alternative"],"filters":["filter term 1","filter term 2"],"resultSummary":"one sentence on expected results","actions":["specific step 1","specific step 2","specific step 3"]}

Tabs: chats=user's own DMs/group chats, people=profiles by name/@handle, channels=creator/brand broadcast feeds, groups=discussion spaces, messages=full-text inside channels/groups (premium). Actions must be specific to AfuChat (e.g. "Open the chat", "Message this person", "Join the group").`,
          },
          { role: "user", content: `Search query: "${query}"` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? data?.content ?? data?.reply ?? "";
    const p = parseChatAiJson(raw);
    if (!p) return null;
    return {
      summary:       typeof p.summary       === "string" ? p.summary       : "",
      bestTab:       (p.bestTab as TabId) || "chats",
      suggestions:   Array.isArray(p.suggestions) ? p.suggestions : [],
      filters:       Array.isArray(p.filters)     ? p.filters     : [],
      resultSummary: typeof p.resultSummary === "string" ? p.resultSummary : "",
      actions:       Array.isArray(p.actions)     ? p.actions     : [],
    };
  } catch { return null; }
}

export default function ChatSearchScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { hasTier } = useTier();
  const insets = useSafeAreaInsets();
  const { q: incomingQ, ai: aiParam } = useLocalSearchParams<{ q?: string; ai?: string }>();

  const inputRef    = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [query,      setQuery]      = useState(incomingQ || "");
  const [tab,        setTab]        = useState<TabId>("chats");
  const [aiMode,     setAiMode]     = useState(aiParam === "true");
  const [hasSearched,setHasSearched]= useState(false);
  const [loading,    setLoading]    = useState(false);

  const [chatResults,    setChatResults]    = useState<ChatResult[]>([]);
  const [peopleResults,  setPeopleResults]  = useState<PersonResult[]>([]);
  const [channelResults, setChannelResults] = useState<ChannelResult[]>([]);
  const [groupResults,   setGroupResults]   = useState<GroupResult[]>([]);
  const [messageResults, setMessageResults] = useState<MessageResult[]>([]);
  const [mediaResults,   setMediaResults]   = useState<MediaResult[]>([]);
  const [linkResults,    setLinkResults]    = useState<LinkResult[]>([]);

  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [insightExpanded, setInsightExpanded] = useState(false);

  const hasPremiumMessages = hasTier("silver");

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (incomingQ && incomingQ.trim().length > 0) {
      setQuery(incomingQ);
      performSearch(incomingQ, aiParam === "true");
    }
    if (aiParam === "true") setAiMode(true);
  }, []);

  const performSearch = useCallback(async (q: string, withAi = false) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setChatResults([]); setPeopleResults([]); setChannelResults([]);
      setGroupResults([]); setMessageResults([]); setHasSearched(false); return;
    }
    setLoading(true);
    setHasSearched(true);

    if (withAi && trimmed.length >= 2) {
      setAiLoading(true);
      fetchChatAiInsight(trimmed).then(insight => {
        setAiInsight(insight);
        setAiLoading(false);
        if (insight?.bestTab) setTab(insight.bestTab);
      });
    }

    await Promise.all([
      searchChats(trimmed),
      searchPeople(trimmed),
      searchChannels(trimmed),
      searchGroups(trimmed),
      hasPremiumMessages ? searchMessages(trimmed) : Promise.resolve(),
      searchMedia(trimmed),
      searchLinks(trimmed),
    ]);
    setLoading(false);
  }, [user, hasPremiumMessages]);

  async function searchChats(q: string) {
    if (!user) return;
    try {
      const { data: memberRows } = await supabase
        .from("chat_members").select("chat_id").eq("user_id", user.id);
      if (!memberRows?.length) { setChatResults([]); return; }
      const chatIds = memberRows.map((m: any) => m.chat_id);

      const [{ data: namedChats }, { data: dmChats }] = await Promise.all([
        supabase
          .from("chats")
          .select("id, name, is_group, is_channel, avatar_url, chat_members(user_id, profiles(id, display_name, avatar_url))")
          .in("id", chatIds).ilike("name", `%${q}%`).limit(15),
        supabase
          .from("chats")
          .select("id, name, is_group, is_channel, avatar_url, chat_members(user_id, profiles(id, display_name, avatar_url))")
          .in("id", chatIds).eq("is_group", false).eq("is_channel", false).limit(80),
      ]);

      const combined: any[] = [...(namedChats || [])];
      for (const c of dmChats || []) {
        if (combined.find((x: any) => x.id === c.id)) continue;
        const other = (c.chat_members || []).filter((m: any) => m.user_id !== user.id)[0]?.profiles;
        if (other?.display_name?.toLowerCase().includes(q.toLowerCase())) combined.push(c);
      }

      setChatResults(combined.slice(0, 20).map((c: any) => {
        const other = (c.chat_members || []).filter((m: any) => m.user_id !== user.id)[0]?.profiles;
        return {
          id: c.id, name: c.name, is_group: !!c.is_group, is_channel: !!c.is_channel,
          avatar_url: c.avatar_url, other_display_name: other?.display_name || "Unknown",
          other_avatar: other?.avatar_url || null, other_id: other?.id || "",
        };
      }));
    } catch { setChatResults([]); }
  }

  async function searchPeople(q: string) {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified")
        .or(`display_name.ilike.%${q}%,handle.ilike.%${q}%`)
        .limit(20);
      setPeopleResults(data || []);
    } catch { setPeopleResults([]); }
  }

  async function searchChannels(q: string) {
    try {
      const { data } = await supabase
        .from("chats").select("id, name, description, avatar_url")
        .eq("is_channel", true).ilike("name", `%${q}%`).limit(20);
      const results: ChannelResult[] = await Promise.all(
        (data || []).map(async (c: any) => {
          const { count } = await supabase
            .from("chat_members").select("id", { count: "exact", head: true }).eq("chat_id", c.id);
          return { id: c.id, name: c.name || "Channel", description: c.description, avatar_url: c.avatar_url, member_count: count || 0 };
        })
      );
      setChannelResults(results);
    } catch { setChannelResults([]); }
  }

  async function searchGroups(q: string) {
    try {
      const { data } = await supabase
        .from("chats").select("id, name, description, avatar_url")
        .eq("is_group", true).eq("is_channel", false).ilike("name", `%${q}%`).limit(20);
      const results: GroupResult[] = await Promise.all(
        (data || []).map(async (c: any) => {
          const { count } = await supabase
            .from("chat_members").select("id", { count: "exact", head: true }).eq("chat_id", c.id);
          return { id: c.id, name: c.name || "Group", description: c.description, avatar_url: c.avatar_url, member_count: count || 0 };
        })
      );
      setGroupResults(results);
    } catch { setGroupResults([]); }
  }

  async function searchMessages(q: string) {
    try {
      const { data: publicChats } = await supabase
        .from("chats").select("id, name, avatar_url, is_channel")
        .or("is_channel.eq.true,is_group.eq.true").limit(200);
      if (!publicChats?.length) { setMessageResults([]); return; }

      const chatIds = publicChats.map((c: any) => c.id);
      const chatMap = new Map(publicChats.map((c: any) => [c.id, c]));

      const { data: msgs } = await supabase
        .from("messages")
        .select("id, chat_id, encrypted_content, sent_at, sender_id")
        .in("chat_id", chatIds).ilike("encrypted_content", `%${q}%`)
        .order("sent_at", { ascending: false }).limit(30);

      if (!msgs?.length) { setMessageResults([]); return; }

      const senderIds = [...new Set(msgs.map((m: any) => m.sender_id))] as string[];
      const { data: profiles } = await supabase
        .from("profiles").select("id, display_name").in("id", senderIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      setMessageResults(msgs.map((m: any) => {
        const chat = chatMap.get(m.chat_id) as any;
        const sender = profileMap.get(m.sender_id) as any;
        return {
          id: m.id, chat_id: m.chat_id, chat_name: chat?.name || "Chat",
          chat_avatar: chat?.avatar_url || null, content: m.encrypted_content || "",
          sender_name: sender?.display_name || "User", sent_at: m.sent_at, is_channel: !!chat?.is_channel,
        };
      }));
    } catch { setMessageResults([]); }
  }

  async function searchMedia(q: string) {
    if (!user) return;
    try {
      const { data: memberRows } = await supabase
        .from("chat_members").select("chat_id").eq("user_id", user.id);
      if (!memberRows?.length) { setMediaResults([]); return; }
      const chatIds = memberRows.map((m: any) => m.chat_id);

      const { data: msgs } = await supabase
        .from("messages")
        .select("id, chat_id, attachment_url, attachment_type, sent_at, sender_id")
        .in("chat_id", chatIds)
        .in("attachment_type", ["image", "video", "gif"])
        .not("attachment_url", "is", null)
        .order("sent_at", { ascending: false })
        .limit(40);

      if (!msgs?.length) { setMediaResults([]); return; }

      const chatIdsUnique = [...new Set(msgs.map((m: any) => m.chat_id))] as string[];
      const senderIds = [...new Set(msgs.map((m: any) => m.sender_id))] as string[];
      const [{ data: chats }, { data: profiles }] = await Promise.all([
        supabase.from("chats").select("id, name, avatar_url, is_group, is_channel, chat_members(user_id, profiles(id, display_name, avatar_url))").in("id", chatIdsUnique),
        supabase.from("profiles").select("id, display_name").in("id", senderIds),
      ]);
      const chatMap = new Map((chats || []).map((c: any) => [c.id, c]));
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      setMediaResults(msgs.map((m: any) => {
        const chat = chatMap.get(m.chat_id) as any;
        const isGroup = chat?.is_group || chat?.is_channel;
        const other = !isGroup ? (chat?.chat_members || []).filter((mb: any) => mb.user_id !== user.id)[0]?.profiles : null;
        const chatName = isGroup ? (chat?.name || "Chat") : (other?.display_name || "Unknown");
        const chatAvatar = isGroup ? (chat?.avatar_url || null) : (other?.avatar_url || null);
        const sender = profileMap.get(m.sender_id) as any;
        return {
          id: m.id, chat_id: m.chat_id, chat_name: chatName, chat_avatar: chatAvatar,
          attachment_url: m.attachment_url, attachment_type: m.attachment_type,
          sender_name: sender?.display_name || "User", sent_at: m.sent_at,
        };
      }));
    } catch { setMediaResults([]); }
  }

  async function searchLinks(q: string) {
    if (!user) return;
    try {
      const { data: memberRows } = await supabase
        .from("chat_members").select("chat_id").eq("user_id", user.id);
      if (!memberRows?.length) { setLinkResults([]); return; }
      const chatIds = memberRows.map((m: any) => m.chat_id);

      const { data: msgs } = await supabase
        .from("messages")
        .select("id, chat_id, encrypted_content, sent_at, sender_id")
        .in("chat_id", chatIds)
        .ilike("encrypted_content", "%http%")
        .not("encrypted_content", "is", null)
        .order("sent_at", { ascending: false })
        .limit(60);

      const URL_RE = /https?:\/\/[^\s<>"]+/gi;
      const linkMsgs = (msgs || []).filter((m: any) => URL_RE.test(m.encrypted_content || ""));
      if (!linkMsgs.length) { setLinkResults([]); return; }

      const chatIdsUnique = [...new Set(linkMsgs.map((m: any) => m.chat_id))] as string[];
      const senderIds = [...new Set(linkMsgs.map((m: any) => m.sender_id))] as string[];
      const [{ data: chats }, { data: profiles }] = await Promise.all([
        supabase.from("chats").select("id, name, avatar_url, is_group, is_channel, chat_members(user_id, profiles(id, display_name, avatar_url))").in("id", chatIdsUnique),
        supabase.from("profiles").select("id, display_name").in("id", senderIds),
      ]);
      const chatMap = new Map((chats || []).map((c: any) => [c.id, c]));
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const results: LinkResult[] = [];
      for (const m of linkMsgs) {
        URL_RE.lastIndex = 0;
        const match = URL_RE.exec(m.encrypted_content || "");
        if (!match) continue;
        const chat = chatMap.get(m.chat_id) as any;
        const isGroup = chat?.is_group || chat?.is_channel;
        const other = !isGroup ? (chat?.chat_members || []).filter((mb: any) => mb.user_id !== user.id)[0]?.profiles : null;
        const chatName = isGroup ? (chat?.name || "Chat") : (other?.display_name || "Unknown");
        const chatAvatar = isGroup ? (chat?.avatar_url || null) : (other?.avatar_url || null);
        const sender = profileMap.get(m.sender_id) as any;
        const url = match[0];
        const previewText = (m.encrypted_content || "").replace(url, "").trim() || url;
        results.push({
          id: m.id, chat_id: m.chat_id, chat_name: chatName, chat_avatar: chatAvatar,
          url, preview_text: previewText, sender_name: sender?.display_name || "User", sent_at: m.sent_at,
        });
        if (results.length >= 30) break;
      }
      setLinkResults(results);
    } catch { setLinkResults([]); }
  }

  function onChangeQuery(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setChatResults([]); setPeopleResults([]); setChannelResults([]);
      setGroupResults([]); setMessageResults([]); setMediaResults([]); setLinkResults([]);
      setHasSearched(false); setAiInsight(null); return;
    }
    debounceRef.current = setTimeout(() => performSearch(text, aiMode), 320);
  }

  function onToggleAi() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next = !aiMode;
    setAiMode(next);
    if (next && query.trim().length >= 2) {
      setAiLoading(true);
      fetchChatAiInsight(query.trim()).then(insight => {
        setAiInsight(insight);
        setAiLoading(false);
        if (insight?.bestTab) setTab(insight.bestTab);
      });
    }
    if (!next) setAiInsight(null);
  }

  const counts: Record<TabId, number> = {
    chats: chatResults.length, people: peopleResults.length,
    channels: channelResults.length, groups: groupResults.length,
    messages: messageResults.length, media: mediaResults.length, links: linkResults.length,
  };

  function navigateToChat(id: string, params: Record<string, string>) {
    router.replace({ pathname: "/chat/[id]", params: { id, ...params } } as any);
  }

  function ChatRow({ item }: { item: ChatResult }) {
    const displayName = item.is_group ? (item.name || "Group")
      : item.is_channel ? (item.name || "Channel")
      : item.other_display_name;
    const avatarUri = (item.is_group || item.is_channel) ? item.avatar_url : item.other_avatar;
    return (
      <TouchableOpacity
        style={[ss.row, { borderBottomColor: colors.border }]}
        onPress={() => {
          Haptics.selectionAsync();
          navigateToChat(item.id, {
            otherName: displayName, otherAvatar: avatarUri || "", otherId: item.other_id,
            isGroup: item.is_group ? "true" : "false", isChannel: item.is_channel ? "true" : "false",
            chatName: item.name || "",
          });
        }}
        activeOpacity={0.72}
      >
        <View style={ss.avatarWrap}>
          <Avatar uri={avatarUri} name={displayName} size={46} />
          {(item.is_group || item.is_channel) && (
            <View style={[ss.typeChip, { backgroundColor: item.is_channel ? AI_PURPLE + "22" : "#007AFF22" }]}>
              <Ionicons name={item.is_channel ? "megaphone" : "people"} size={9} color={item.is_channel ? AI_PURPLE : "#007AFF"} />
            </View>
          )}
        </View>
        <View style={ss.rowBody}>
          <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{displayName}</Text>
          <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
            {item.is_channel ? "Channel" : item.is_group ? "Group" : "Direct message"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function PersonRow({ item }: { item: PersonResult }) {
    return (
      <TouchableOpacity
        style={[ss.row, { borderBottomColor: colors.border }]}
        onPress={() => { Haptics.selectionAsync(); router.back(); setTimeout(() => router.push(`/${item.handle}` as any), 50); }}
        activeOpacity={0.72}
      >
        <Avatar uri={item.avatar_url} name={item.display_name} size={46} />
        <View style={ss.rowBody}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{item.display_name}</Text>
            {(item.is_verified || item.is_organization_verified) && (
              <VerifiedBadge org={item.is_organization_verified} size={14} />
            )}
          </View>
          <Text style={[ss.rowSub, { color: colors.textMuted }]}>@{item.handle}</Text>
        </View>
        <TouchableOpacity
          style={[ss.msgBtn, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "35" }]}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const { data: chatId } = await supabase.rpc("get_or_create_direct_chat", { other_user_id: item.id });
            if (chatId) navigateToChat(chatId, { otherName: item.display_name, otherAvatar: item.avatar_url || "", otherId: item.id, isGroup: "false", isChannel: "false", chatName: "" });
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={13} color={colors.accent} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  function ChannelRow({ item }: { item: ChannelResult }) {
    return (
      <TouchableOpacity
        style={[ss.row, { borderBottomColor: colors.border }]}
        onPress={() => { Haptics.selectionAsync(); navigateToChat(item.id, { otherName: item.name, otherAvatar: item.avatar_url || "", otherId: "", isGroup: "false", isChannel: "true", chatName: item.name }); }}
        activeOpacity={0.72}
      >
        <View style={ss.avatarWrap}>
          <Avatar uri={item.avatar_url} name={item.name} size={46} />
          <View style={[ss.typeChip, { backgroundColor: AI_PURPLE + "22" }]}>
            <Ionicons name="megaphone" size={9} color={AI_PURPLE} />
          </View>
        </View>
        <View style={ss.rowBody}>
          <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
            {item.member_count > 0 ? `${item.member_count.toLocaleString()} subscribers` : "Channel"}
            {item.description ? `  ·  ${item.description}` : ""}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function GroupRow({ item }: { item: GroupResult }) {
    return (
      <TouchableOpacity
        style={[ss.row, { borderBottomColor: colors.border }]}
        onPress={() => { Haptics.selectionAsync(); navigateToChat(item.id, { otherName: item.name, otherAvatar: item.avatar_url || "", otherId: "", isGroup: "true", isChannel: "false", chatName: item.name }); }}
        activeOpacity={0.72}
      >
        <View style={ss.avatarWrap}>
          <Avatar uri={item.avatar_url} name={item.name} size={46} />
          <View style={[ss.typeChip, { backgroundColor: "#007AFF22" }]}>
            <Ionicons name="people" size={9} color="#007AFF" />
          </View>
        </View>
        <View style={ss.rowBody}>
          <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
            {item.member_count > 0 ? `${item.member_count.toLocaleString()} members` : "Group"}
            {item.description ? `  ·  ${item.description}` : ""}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function MessageRow({ item }: { item: MessageResult }) {
    const q = query.trim().toLowerCase();
    const content = item.content;
    const idx = q.length > 0 ? content.toLowerCase().indexOf(q) : -1;
    const before = idx >= 0 ? content.slice(0, idx) : content;
    const matchTxt = idx >= 0 ? content.slice(idx, idx + q.length) : "";
    const after = idx >= 0 ? content.slice(idx + q.length) : "";
    return (
      <TouchableOpacity
        style={[ss.row, { borderBottomColor: colors.border }]}
        onPress={() => { Haptics.selectionAsync(); navigateToChat(item.chat_id, { otherName: item.chat_name, otherAvatar: item.chat_avatar || "", otherId: "", isGroup: item.is_channel ? "false" : "true", isChannel: item.is_channel ? "true" : "false", chatName: item.chat_name }); }}
        activeOpacity={0.72}
      >
        <View style={ss.avatarWrap}>
          <Avatar uri={item.chat_avatar} name={item.chat_name} size={46} />
          <View style={[ss.typeChip, { backgroundColor: item.is_channel ? AI_PURPLE + "22" : "#007AFF22" }]}>
            <Ionicons name={item.is_channel ? "megaphone" : "people"} size={9} color={item.is_channel ? AI_PURPLE : "#007AFF"} />
          </View>
        </View>
        <View style={ss.rowBody}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{item.chat_name}</Text>
            <Text style={[ss.rowTime, { color: colors.textMuted }]}>{timeAgo(item.sent_at)}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" }} numberOfLines={2}>
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>{item.sender_name}: </Text>
            <Text>{before}</Text>
            {matchTxt.length > 0 && (
              <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", backgroundColor: colors.accent + "18" }}>{matchTxt}</Text>
            )}
            <Text>{after}</Text>
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  function MediaRow({ item }: { item: MediaResult }) {
    const isVideo = item.attachment_type === "video";
    return (
      <TouchableOpacity
        style={[ss.row, { borderBottomColor: colors.border }]}
        onPress={() => { Haptics.selectionAsync(); navigateToChat(item.chat_id, { otherName: item.chat_name, otherAvatar: item.chat_avatar || "", otherId: "", isGroup: "false", isChannel: "false", chatName: item.chat_name }); }}
        activeOpacity={0.72}
      >
        <View style={ss.mediaThumb}>
          {item.attachment_url ? (
            <Image source={{ uri: item.attachment_url }} style={ss.mediaThumbImg} resizeMode="cover" />
          ) : (
            <View style={[ss.mediaThumbImg, { backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name={isVideo ? "videocam" : "image"} size={20} color={colors.textMuted} />
            </View>
          )}
          {isVideo && (
            <View style={ss.mediaPlay}>
              <Ionicons name="play" size={10} color="#fff" />
            </View>
          )}
        </View>
        <View style={ss.rowBody}>
          <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{item.chat_name}</Text>
          <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
            {item.sender_name} · {timeAgo(item.sent_at)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function LinkRow({ item }: { item: LinkResult }) {
    const domain = (() => { try { return new URL(item.url).hostname.replace("www.", ""); } catch { return item.url.slice(0, 30); } })();
    return (
      <TouchableOpacity
        style={[ss.row, { borderBottomColor: colors.border }]}
        onPress={() => {
          Haptics.selectionAsync();
          Linking.openURL(item.url).catch(() => {});
        }}
        activeOpacity={0.72}
      >
        <View style={[ss.linkIconBg, { backgroundColor: colors.accent + "18" }]}>
          <Ionicons name="link" size={18} color={colors.accent} />
        </View>
        <View style={ss.rowBody}>
          <Text style={[ss.rowTitle, { color: colors.accent }]} numberOfLines={1}>{domain}</Text>
          <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
            {item.preview_text || item.url}
          </Text>
          <Text style={[ss.rowSub, { color: colors.textMuted, fontSize: 10 }]} numberOfLines={1}>
            {item.sender_name} in {item.chat_name} · {timeAgo(item.sent_at)}
          </Text>
        </View>
        <Ionicons name="open-outline" size={14} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function AiPanel() {
    if (aiLoading) {
      return (
        <View style={[ss.aiPanel, { backgroundColor: AI_PURPLE + "10", borderColor: AI_PURPLE + "30" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator size="small" color={AI_PURPLE} />
            <Text style={{ color: AI_PURPLE, fontSize: 13, fontFamily: "Inter_500Medium" }}>
              AI is analyzing your search…
            </Text>
          </View>
        </View>
      );
    }
    if (!aiInsight) return null;
    return (
      <Animated.View entering={FadeInDown.duration(260)}>
        <LinearGradient
          colors={isDark ? [AI_PURPLE + "22", AI_TEAL + "0C"] : [AI_PURPLE + "14", AI_TEAL + "06"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[ss.aiPanel, { borderColor: AI_PURPLE + "40" }]}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setInsightExpanded(v => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <LinearGradient colors={[AI_PURPLE, AI_TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ss.aiIconBg}>
              <Ionicons name="sparkles" size={13} color="#fff" />
            </LinearGradient>
            <Text style={{ color: AI_PURPLE, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, flex: 1 }}>
              AI SEARCH ASSISTANT
            </Text>
            {aiInsight.bestTab && !insightExpanded && (
              <View style={{ backgroundColor: AI_PURPLE + "20", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ color: AI_PURPLE, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
                  Best: {TABS.find(t => t.id === aiInsight.bestTab)?.label}
                </Text>
              </View>
            )}
            <Ionicons name={insightExpanded ? "chevron-up" : "chevron-down"} size={14} color={AI_PURPLE} />
          </TouchableOpacity>

          {insightExpanded && (
            <>
              <View style={{ height: 10 }} />

              <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18, marginBottom: 8 }}>{aiInsight.summary}</Text>

              {aiInsight.resultSummary ? (
                <View style={{ flexDirection: "row", gap: 6, backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", borderRadius: 8, padding: 8, marginBottom: 8, alignItems: "flex-start" }}>
                  <Ionicons name="bulb-outline" size={13} color={AI_TEAL} style={{ marginTop: 1 }} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, flex: 1 }}>{aiInsight.resultSummary}</Text>
                </View>
              ) : null}

              {aiInsight.actions && aiInsight.actions.length > 0 && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 6 }}>
                    WHAT TO DO
                  </Text>
                  {aiInsight.actions.map((a, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 7, marginBottom: 5 }}>
                      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: AI_PURPLE + "25", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                        <Text style={{ color: AI_PURPLE, fontSize: 9, fontFamily: "Inter_700Bold" }}>{i + 1}</Text>
                      </View>
                      <Text style={{ color: colors.text, fontSize: 12, lineHeight: 17, flex: 1 }}>{a}</Text>
                    </View>
                  ))}
                </View>
              )}

              {aiInsight.filters.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {aiInsight.filters.map((f, i) => (
                    <TouchableOpacity
                      key={i}
                      style={{ backgroundColor: AI_TEAL + "20", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}
                      onPress={() => { setQuery(f); onChangeQuery(f); }}
                    >
                      <Ionicons name="filter-outline" size={9} color={AI_TEAL} />
                      <Text style={{ color: AI_TEAL, fontSize: 11, fontFamily: "Inter_500Medium" }}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {aiInsight.suggestions.length > 0 && (
                <>
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 6 }}>
                    TRY ALSO
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {aiInsight.suggestions.map((s, i) => (
                      <TouchableOpacity
                        key={i}
                        style={{ backgroundColor: AI_PURPLE + "1A", borderColor: AI_PURPLE + "35", borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}
                        onPress={() => { setQuery(s); onChangeQuery(s); }}
                      >
                        <Text style={{ color: AI_PURPLE, fontSize: 11, fontFamily: "Inter_500Medium" }}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </LinearGradient>
      </Animated.View>
    );
  }

  function EmptyState({ tabId }: { tabId: TabId }) {
    const cfg: Record<TabId, { icon: string; title: string; sub: string }> = {
      chats:    { icon: "chatbubbles-outline",   title: "No chats found",    sub: "Try a name or username" },
      people:   { icon: "person-outline",        title: "No people found",   sub: "Try a different name or @handle" },
      channels: { icon: "megaphone-outline",     title: "No channels found", sub: "Try different keywords" },
      groups:   { icon: "people-outline",        title: "No groups found",   sub: "Try different keywords" },
      messages: { icon: "mail-open-outline",     title: "No messages found", sub: "Try different keywords in public channels and groups" },
      media:    { icon: "images-outline",        title: "No media found",    sub: "Photos and videos you've shared will appear here" },
      links:    { icon: "link-outline",          title: "No links found",    sub: "Links shared in your chats will appear here" },
    };
    const { icon, title, sub } = cfg[tabId];
    return (
      <View style={ss.empty}>
        <Ionicons name={icon as any} size={44} color={colors.textMuted} />
        <Text style={[ss.emptyTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[ss.emptySub, { color: colors.textMuted }]}>{sub}</Text>
      </View>
    );
  }

  function MessagesPremiumGate() {
    return (
      <View style={ss.premGate}>
        <LinearGradient colors={[GOLD, "#F59E0B"]} style={ss.premIconBg}>
          <Ionicons name="star" size={28} color="#fff" />
        </LinearGradient>
        <View style={[ss.premBadge, { borderColor: GOLD + "55", backgroundColor: GOLD + "18" }]}>
          <Text style={[ss.premBadgeText, { color: GOLD }]}>Silver Required</Text>
        </View>
        <Text style={[ss.premTitle, { color: colors.text }]}>Message Search</Text>
        <Text style={[ss.premSub, { color: colors.textMuted }]}>
          Search through messages in public channels and groups. Upgrade to Silver or higher to unlock this feature.
        </Text>
        <TouchableOpacity
          style={[ss.premBtn, { backgroundColor: GOLD }]}
          onPress={() => { router.back(); setTimeout(() => router.push("/premium"), 100); }}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-up-circle" size={16} color="#fff" />
          <Text style={ss.premBtnText}>Upgrade to Silver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function TabContent() {
    if (!hasSearched) {
      return (
        <View style={ss.empty}>
          <LinearGradient colors={[AI_PURPLE + "28", AI_TEAL + "14"]} style={ss.searchHintBg}>
            <Ionicons name="search-outline" size={30} color={AI_PURPLE} />
          </LinearGradient>
          <Text style={[ss.emptyTitle, { color: colors.text }]}>Search across AfuChat</Text>
          <Text style={[ss.emptySub, { color: colors.textMuted }]}>
            {"Find your chats, people, channels,\ngroups and messages all in one place"}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {[{ icon: "sparkles-outline", label: "Tap AI for smart search" }, { icon: "lock-closed-outline", label: "Messages need Silver" }].map((h, i) => (
              <View key={i} style={[ss.hintChip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <Ionicons name={h.icon as any} size={11} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" }}>{h.label}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    if (tab === "messages" && !hasPremiumMessages) return <MessagesPremiumGate />;

    if (loading) {
      return (
        <View style={ss.empty}>
          <ActivityIndicator size="large" color={AI_PURPLE} />
        </View>
      );
    }

    const dataMap: Record<TabId, any[]> = {
      chats: chatResults, people: peopleResults,
      channels: channelResults, groups: groupResults, messages: messageResults,
      media: mediaResults, links: linkResults,
    };
    const data = dataMap[tab];
    if (data.length === 0) return <EmptyState tabId={tab} />;

    return (
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          if (tab === "chats")    return <ChatRow    item={item} />;
          if (tab === "people")   return <PersonRow  item={item} />;
          if (tab === "channels") return <ChannelRow item={item} />;
          if (tab === "groups")   return <GroupRow   item={item} />;
          if (tab === "messages") return <MessageRow item={item} />;
          if (tab === "media")    return <MediaRow   item={item} />;
          if (tab === "links")    return <LinkRow    item={item} />;
          return null;
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      />
    );
  }

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[ss.header, { paddingTop: insets.top + 10, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={ss.backBtn} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={[ss.inputWrap, { backgroundColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.06)", borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)" }]}>
          <Ionicons name="search-outline" size={17} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={[ss.input, { color: colors.text }]}
            placeholder="Search chats, people, channels…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={onChangeQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => { if (debounceRef.current) clearTimeout(debounceRef.current); performSearch(query, aiMode); }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(""); onChangeQuery(""); }} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
              <View style={[ss.clearBtn, { backgroundColor: colors.textMuted + "28" }]}>
                <Ionicons name="close" size={12} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={onToggleAi} activeOpacity={0.75}>
          {aiMode ? (
            <LinearGradient colors={[AI_PURPLE, AI_TEAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ss.aiToggle}>
              <Ionicons name="sparkles" size={12} color="#fff" />
              <Text style={ss.aiToggleText}>AI</Text>
            </LinearGradient>
          ) : (
            <View style={[ss.aiToggleOff, { borderColor: colors.border }]}>
              <Ionicons name="sparkles-outline" size={12} color={colors.textMuted} />
              <Text style={[ss.aiToggleOffText, { color: colors.textMuted }]}>AI</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── AI Panel ───────────────────────────────────────────────────────── */}
      {aiMode && (aiLoading || aiInsight) && (
        <View style={[ss.aiPanelWrap, { borderBottomColor: colors.border }]}>
          <AiPanel />
        </View>
      )}

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <View style={[ss.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.tabContent}>
          {TABS.map(t => {
            const active  = tab === t.id;
            const locked  = !!t.premium && !hasPremiumMessages;
            const count   = counts[t.id];
            const tColor  = locked ? GOLD : active ? AI_PURPLE : colors.textMuted;
            return (
              <TouchableOpacity key={t.id} style={ss.tabBtn} onPress={() => setTab(t.id)} activeOpacity={0.7}>
                <View style={[ss.tabInner, active && { borderBottomWidth: 2, borderBottomColor: locked ? GOLD : AI_PURPLE }]}>
                  <Ionicons name={t.icon as any} size={14} color={tColor} />
                  <Text style={[ss.tabLabel, { color: tColor, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                    {t.label}
                  </Text>
                  {locked ? (
                    <Ionicons name="lock-closed" size={9} color={GOLD} />
                  ) : count > 0 ? (
                    <View style={[ss.tabBadge, { backgroundColor: active ? AI_PURPLE : colors.backgroundSecondary }]}>
                      <Text style={[ss.tabBadgeText, { color: active ? "#fff" : colors.textMuted }]}>
                        {count > 99 ? "99+" : count}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <TabContent />
    </View>
  );
}

const ss = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
  },
  inputWrap: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 22, paddingHorizontal: 12, height: 40, borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 40 },
  clearBtn: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  aiToggle: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
  },
  aiToggleText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  aiToggleOff: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  aiToggleOffText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  aiPanelWrap: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  aiPanel: {
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  aiIconBg: {
    width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center",
  },

  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabContent: { paddingHorizontal: 10, gap: 0 },
  tabBtn: { paddingHorizontal: 4 },
  tabInner: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 12,
  },
  tabLabel: { fontSize: 13 },
  tabBadge: {
    minWidth: 17, height: 17, borderRadius: 9,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },

  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: { position: "relative" },
  typeChip: {
    position: "absolute", bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  msgBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },

  mediaThumb: {
    width: 52, height: 52, borderRadius: 8, overflow: "hidden", position: "relative",
  },
  mediaThumbImg: {
    width: 52, height: 52,
  },
  mediaPlay: {
    position: "absolute", right: 3, bottom: 3,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 8, padding: 3,
  },
  linkIconBg: {
    width: 46, height: 46, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  searchHintBg: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  hintChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },

  premGate: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 32, gap: 14,
  },
  premIconBg: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center",
  },
  premBadge: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1 },
  premBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },
  premTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  premSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  premBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16, marginTop: 4,
  },
  premBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
