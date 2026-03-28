import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown, FadeInRight } from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

const { width: SCREEN_W } = Dimensions.get("window");
const BRAND = "#00C2CB";
const GOLD = "#D4A853";

type SearchCategory = "all" | "people" | "posts" | "chats" | "channels" | "gifts";

const CATEGORIES: { id: SearchCategory; label: string; icon: string }[] = [
  { id: "all", label: "All", icon: "apps" },
  { id: "people", label: "People", icon: "people" },
  { id: "posts", label: "Posts", icon: "document-text" },
  { id: "chats", label: "Chats", icon: "chatbubbles" },
  { id: "channels", label: "Channels", icon: "megaphone" },
  { id: "gifts", label: "Gifts", icon: "gift" },
];

const TRENDING_TAGS = [
  "gaming", "photography", "music", "travel", "coding",
  "fitness", "cooking", "art", "fashion", "tech",
];

type PersonResult = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  current_grade: string;
  country: string | null;
};

type PostResult = {
  id: string;
  content: string;
  author_id: string;
  author_handle: string;
  author_name: string;
  author_avatar: string | null;
  view_count: number;
  created_at: string;
};

type ChatResult = {
  id: string;
  other_user_handle: string;
  other_user_name: string;
  other_user_avatar: string | null;
  last_message: string;
  updated_at: string;
};

type ChannelResult = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  subscriber_count: number;
};

type GiftResult = {
  id: string;
  name: string;
  emoji: string;
  base_xp_cost: number;
  rarity: string;
};

type SearchResults = {
  people: PersonResult[];
  posts: PostResult[];
  chats: ChatResult[];
  channels: ChannelResult[];
  gifts: GiftResult[];
};

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

export default function SearchScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SearchCategory>("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({
    people: [], posts: [], chats: [], channels: [], gifts: [],
  });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trendingPeople, setTrendingPeople] = useState<PersonResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    loadTrending();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function loadTrending() {
    const { data } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, current_grade, country")
      .eq("is_verified", true)
      .order("xp", { ascending: false })
      .limit(10);
    if (data) setTrendingPeople(data);
  }

  const performSearch = useCallback(async (q: string, cat: SearchCategory) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults({ people: [], posts: [], chats: [], channels: [], gifts: [] });
      setHasSearched(false);
      return;
    }
    setLoading(true);
    setHasSearched(true);

    const searchAll = cat === "all";
    const pattern = `%${trimmed}%`;

    try {
      const promises: Promise<any>[] = [];

      if (searchAll || cat === "people") {
        promises.push(
          supabase
            .from("profiles")
            .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, current_grade, country")
            .or(`handle.ilike.${pattern},display_name.ilike.${pattern},bio.ilike.${pattern}`)
            .order("xp", { ascending: false })
            .limit(20)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if (searchAll || cat === "posts") {
        promises.push(
          supabase
            .from("posts")
            .select("id, content, author_id, view_count, created_at")
            .ilike("content", pattern)
            .order("created_at", { ascending: false })
            .limit(20)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if ((searchAll || cat === "chats") && user) {
        promises.push(
          supabase
            .from("messages")
            .select("id, encrypted_content, sender_id, chat_id, sent_at")
            .ilike("encrypted_content", pattern)
            .order("sent_at", { ascending: false })
            .limit(20)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if (searchAll || cat === "channels") {
        promises.push(
          supabase
            .from("channels")
            .select("id, name, description, avatar_url, subscriber_count")
            .or(`name.ilike.${pattern},description.ilike.${pattern}`)
            .order("subscriber_count", { ascending: false })
            .limit(20)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if (searchAll || cat === "gifts") {
        promises.push(
          supabase
            .from("gifts")
            .select("id, name, emoji, base_xp_cost, rarity")
            .ilike("name", pattern)
            .order("base_xp_cost", { ascending: true })
            .limit(20)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      const [peopleRes, postsRes, chatsRes, channelsRes, giftsRes] = await Promise.all(promises);

      const people: PersonResult[] = peopleRes.data || [];

      let posts: PostResult[] = [];
      if (postsRes.data && postsRes.data.length > 0) {
        const authorIds = [...new Set((postsRes.data as any[]).map((p: any) => p.author_id))];
        const { data: authors } = await supabase
          .from("profiles")
          .select("id, handle, display_name, avatar_url")
          .in("id", authorIds);
        const authorMap = new Map((authors || []).map((a: any) => [a.id, a]));
        posts = (postsRes.data as any[]).map((p: any) => {
          const author = authorMap.get(p.author_id) || {} as any;
          return {
            id: p.id,
            content: p.content,
            author_id: p.author_id,
            author_handle: author.handle || "",
            author_name: author.display_name || "",
            author_avatar: author.avatar_url || null,
            view_count: p.view_count || 0,
            created_at: p.created_at,
          };
        });
      }

      let chats: ChatResult[] = [];
      if (chatsRes.data && chatsRes.data.length > 0) {
        const grouped = new Map<string, any>();
        for (const msg of chatsRes.data as any[]) {
          if (!grouped.has(msg.chat_id)) {
            grouped.set(msg.chat_id, msg);
          }
        }
        const chatIds = [...grouped.keys()];
        const { data: chatData } = await supabase
          .from("chats")
          .select("id, user1_id, user2_id")
          .in("id", chatIds);
        if (chatData) {
          const otherUserIds = chatData.map((c: any) => c.user1_id === user?.id ? c.user2_id : c.user1_id);
          const { data: otherUsers } = await supabase
            .from("profiles")
            .select("id, handle, display_name, avatar_url")
            .in("id", otherUserIds);
          const userMap = new Map((otherUsers || []).map((u: any) => [u.id, u]));
          chats = chatData.map((c: any) => {
            const otherId = c.user1_id === user?.id ? c.user2_id : c.user1_id;
            const other = userMap.get(otherId) || {} as any;
            const msg = grouped.get(c.id);
            return {
              id: c.id,
              other_user_handle: other.handle || "",
              other_user_name: other.display_name || "",
              other_user_avatar: other.avatar_url || null,
              last_message: msg?.encrypted_content || "",
              updated_at: msg?.sent_at || "",
            };
          });
        }
      }

      const channels: ChannelResult[] = channelsRes.data || [];
      const gifts: GiftResult[] = giftsRes.data || [];

      setResults({ people, posts, chats, channels, gifts });

    } catch (e) {
      console.warn("Search error:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  function recordSearch(term: string) {
    const trimmed = term.trim();
    if (trimmed.length >= 2 && !recentSearches.includes(trimmed)) {
      setRecentSearches(prev => [trimmed, ...prev].slice(0, 8));
    }
  }

  function onChangeText(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(text, category), 400);
  }

  function onSubmitSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      recordSearch(trimmed);
      performSearch(query, category);
    }
  }

  function onCategoryPress(cat: SearchCategory) {
    setCategory(cat);
    if (query.trim().length >= 2) {
      performSearch(query, cat);
    }
  }

  function clearSearch() {
    setQuery("");
    setResults({ people: [], posts: [], chats: [], channels: [], gifts: [] });
    setHasSearched(false);
    inputRef.current?.focus();
  }

  function handleTagPress(tag: string) {
    setQuery(tag);
    recordSearch(tag);
    performSearch(tag, category);
  }

  function handleRecentPress(term: string) {
    setQuery(term);
    performSearch(term, category);
  }

  const totalResults =
    results.people.length +
    results.posts.length +
    results.chats.length +
    results.channels.length +
    results.gifts.length;

  function renderPersonCard(person: PersonResult, index: number) {
    return (
      <Animated.View key={person.id} entering={FadeInRight.delay(index * 40).duration(300)}>
        <TouchableOpacity
          style={[s.personCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
          onPress={() => router.push(`/contact/${person.id}` as any)}
        >
          {person.avatar_url ? (
            <Image source={{ uri: person.avatar_url }} style={s.personAvatar} />
          ) : (
            <View style={[s.personAvatar, { backgroundColor: BRAND + "20", justifyContent: "center", alignItems: "center" }]}>
              <Text style={{ color: BRAND, fontSize: 18, fontFamily: "Inter_700Bold" }}>
                {(person.display_name || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[s.personName, { color: colors.text }]} numberOfLines={1}>{person.display_name}</Text>
              {person.is_verified && (
                <Ionicons name="checkmark-circle" size={14} color={person.is_organization_verified ? GOLD : BRAND} />
              )}
            </View>
            <Text style={[s.personHandle, { color: colors.textMuted }]}>@{person.handle}</Text>
            {person.bio ? (
              <Text style={[s.personBio, { color: colors.textSecondary }]} numberOfLines={2}>{person.bio}</Text>
            ) : null}
          </View>
          {person.country ? (
            <View style={s.personCountry}>
              <Text style={{ fontSize: 11, color: colors.textMuted }}>{person.country}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderPostCard(post: PostResult, index: number) {
    return (
      <Animated.View key={post.id} entering={FadeInDown.delay(index * 40).duration(300)}>
        <TouchableOpacity
          style={[s.postCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
          onPress={() => router.push(`/contact/${post.author_id}` as any)}
        >
          <View style={s.postHeader}>
            {post.author_avatar ? (
              <Image source={{ uri: post.author_avatar }} style={s.postAvatar} />
            ) : (
              <View style={[s.postAvatar, { backgroundColor: colors.inputBg, justifyContent: "center", alignItems: "center" }]}>
                <Text style={{ color: colors.text, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                  {(post.author_name || "?")[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[s.postAuthor, { color: colors.text }]}>{post.author_name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>@{post.author_handle}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{timeAgo(post.created_at)}</Text>
          </View>
          <Text style={[s.postContent, { color: colors.text }]} numberOfLines={4}>{post.content}</Text>
          <View style={s.postFooter}>
            <View style={s.postStat}>
              <Ionicons name="eye-outline" size={13} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{post.view_count}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderChatCard(chat: ChatResult, index: number) {
    return (
      <Animated.View key={chat.id} entering={FadeInRight.delay(index * 40).duration(300)}>
        <TouchableOpacity
          style={[s.chatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
          onPress={() => router.push(`/chat/${chat.id}` as any)}
        >
          {chat.other_user_avatar ? (
            <Image source={{ uri: chat.other_user_avatar }} style={s.chatAvatar} />
          ) : (
            <View style={[s.chatAvatar, { backgroundColor: BRAND + "15", justifyContent: "center", alignItems: "center" }]}>
              <Ionicons name="chatbubble" size={16} color={BRAND} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[s.chatName, { color: colors.text }]}>{chat.other_user_name || `@${chat.other_user_handle}`}</Text>
            <Text style={[s.chatMsg, { color: colors.textSecondary }]} numberOfLines={1}>{chat.last_message}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>{timeAgo(chat.updated_at)}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderChannelCard(ch: ChannelResult, index: number) {
    return (
      <Animated.View key={ch.id} entering={FadeInDown.delay(index * 40).duration(300)}>
        <TouchableOpacity
          style={[s.channelCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          {ch.avatar_url ? (
            <Image source={{ uri: ch.avatar_url }} style={s.channelAvatar} />
          ) : (
            <LinearGradient colors={[BRAND, "#00A5AD"]} style={s.channelAvatar}>
              <Ionicons name="megaphone" size={18} color="#fff" />
            </LinearGradient>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[s.channelName, { color: colors.text }]}>{ch.name}</Text>
            {ch.description ? (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>{ch.description}</Text>
            ) : null}
          </View>
          <View style={s.channelSubs}>
            <Ionicons name="people" size={12} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{ch.subscriber_count || 0}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderGiftCard(gift: GiftResult, index: number) {
    return (
      <Animated.View key={gift.id} entering={FadeIn.delay(index * 40).duration(300)}>
        <TouchableOpacity
          style={[s.giftCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Text style={s.giftEmoji}>{gift.emoji}</Text>
          <Text style={[s.giftName, { color: colors.text }]}>{gift.name}</Text>
          <View style={s.giftPrice}>
            <Ionicons name="diamond" size={11} color={GOLD} />
            <Text style={{ color: GOLD, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{gift.base_xp_cost}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function SectionHeader({ title, count, icon }: { title: string; count: number; icon: string }) {
    if (count === 0) return null;
    return (
      <View style={s.sectionHeader}>
        <Ionicons name={icon as any} size={16} color={BRAND} />
        <Text style={[s.sectionTitle, { color: colors.text }]}>{title}</Text>
        <View style={[s.countBadge, { backgroundColor: BRAND + "15" }]}>
          <Text style={{ color: BRAND, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{count}</Text>
        </View>
      </View>
    );
  }

  function renderIdleState() {
    return (
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {recentSearches.length > 0 && (
          <Animated.View entering={FadeInDown.duration(300)} style={s.idleSection}>
            <View style={s.idleSectionHeader}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={[s.idleSectionTitle, { color: colors.text }]}>Recent Searches</Text>
              <TouchableOpacity onPress={() => setRecentSearches([])}>
                <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_500Medium" }}>Clear</Text>
              </TouchableOpacity>
            </View>
            <View style={s.tagWrap}>
              {recentSearches.map((term, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.recentChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => handleRecentPress(term)}
                >
                  <Ionicons name="search" size={12} color={colors.textMuted} />
                  <Text style={{ color: colors.text, fontSize: 13 }}>{term}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(100).duration(300)} style={s.idleSection}>
          <View style={s.idleSectionHeader}>
            <Ionicons name="trending-up" size={16} color={BRAND} />
            <Text style={[s.idleSectionTitle, { color: colors.text }]}>Trending Topics</Text>
          </View>
          <View style={s.tagWrap}>
            {TRENDING_TAGS.map((tag, i) => (
              <TouchableOpacity
                key={tag}
                style={[s.trendTag, { backgroundColor: BRAND + "10", borderColor: BRAND + "25" }]}
                onPress={() => handleTagPress(tag)}
              >
                <Text style={{ color: BRAND, fontSize: 13, fontFamily: "Inter_500Medium" }}>#{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {trendingPeople.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200).duration(300)} style={s.idleSection}>
            <View style={s.idleSectionHeader}>
              <Ionicons name="star" size={16} color={GOLD} />
              <Text style={[s.idleSectionTitle, { color: colors.text }]}>Top Users</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 24 }}>
              {trendingPeople.map((p, i) => (
                <TouchableOpacity key={p.id} style={[s.topUserCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7}>
                  {p.avatar_url ? (
                    <Image source={{ uri: p.avatar_url }} style={s.topUserAvatar} />
                  ) : (
                    <View style={[s.topUserAvatar, { backgroundColor: BRAND + "20", justifyContent: "center", alignItems: "center" }]}>
                      <Text style={{ color: BRAND, fontSize: 16, fontFamily: "Inter_700Bold" }}>
                        {(p.display_name || "?")[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={[s.topUserName, { color: colors.text }]} numberOfLines={1}>{p.display_name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Text style={[s.topUserHandle, { color: colors.textMuted }]} numberOfLines={1}>@{p.handle}</Text>
                    {p.is_verified && <Ionicons name="checkmark-circle" size={10} color={BRAND} />}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(300).duration(300)} style={s.idleSection}>
          <View style={s.idleSectionHeader}>
            <Ionicons name="flash" size={16} color="#FF9500" />
            <Text style={[s.idleSectionTitle, { color: colors.text }]}>Quick Actions</Text>
          </View>
          <View style={s.quickActions}>
            {[
              { label: "Scan QR", icon: "qr-code", color: BRAND, route: "/wallet/scan" },
              { label: "New Chat", icon: "chatbubble-ellipses", color: "#3B82F6", route: "/(tabs)" },
              { label: "Wallet", icon: "wallet", color: GOLD, route: "/wallet" },
              { label: "Digital ID", icon: "card", color: "#8B5CF6", route: "/digital-id" },
            ].map((action, i) => (
              <TouchableOpacity
                key={action.label}
                style={[s.quickAction, { backgroundColor: action.color + "10" }]}
                onPress={() => router.push(action.route as any)}
                activeOpacity={0.7}
              >
                <View style={[s.quickActionIcon, { backgroundColor: action.color + "20" }]}>
                  <Ionicons name={action.icon as any} size={20} color={action.color} />
                </View>
                <Text style={[s.quickActionLabel, { color: colors.text }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    );
  }

  function renderResults() {
    const showPeople = (category === "all" || category === "people") && results.people.length > 0;
    const showPosts = (category === "all" || category === "posts") && results.posts.length > 0;
    const showChats = (category === "all" || category === "chats") && results.chats.length > 0;
    const showChannels = (category === "all" || category === "channels") && results.channels.length > 0;
    const showGifts = (category === "all" || category === "gifts") && results.gifts.length > 0;

    if (totalResults === 0 && !loading) {
      return (
        <Animated.View entering={FadeIn.duration(300)} style={s.emptyState}>
          <Ionicons name="search-outline" size={56} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.text }]}>No results found</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>
            Try a different search term or category
          </Text>
        </Animated.View>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {showPeople && (
          <View style={s.resultSection}>
            <SectionHeader title="People" count={results.people.length} icon="people" />
            {category === "all" ? results.people.slice(0, 5).map(renderPersonCard) : results.people.map(renderPersonCard)}
          </View>
        )}

        {showPosts && (
          <View style={s.resultSection}>
            <SectionHeader title="Posts" count={results.posts.length} icon="document-text" />
            {category === "all" ? results.posts.slice(0, 4).map(renderPostCard) : results.posts.map(renderPostCard)}
          </View>
        )}

        {showChats && (
          <View style={s.resultSection}>
            <SectionHeader title="Messages" count={results.chats.length} icon="chatbubbles" />
            {category === "all" ? results.chats.slice(0, 4).map(renderChatCard) : results.chats.map(renderChatCard)}
          </View>
        )}

        {showChannels && (
          <View style={s.resultSection}>
            <SectionHeader title="Channels" count={results.channels.length} icon="megaphone" />
            {category === "all" ? results.channels.slice(0, 4).map(renderChannelCard) : results.channels.map(renderChannelCard)}
          </View>
        )}

        {showGifts && (
          <View style={s.resultSection}>
            <SectionHeader title="Gifts" count={results.gifts.length} icon="gift" />
            <View style={s.giftsGrid}>
              {(category === "all" ? results.gifts.slice(0, 8) : results.gifts).map(renderGiftCard)}
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[s.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <View style={[s.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={[s.searchInput, { color: colors.text }]}
            placeholder="Search people, posts, chats, channels..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={onChangeText}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            onSubmitEditing={onSubmitSearch}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <View style={[s.clearBtn, { backgroundColor: colors.textMuted + "30" }]}>
                <Ionicons name="close" size={14} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={[s.categoryBar, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  s.categoryChip,
                  active
                    ? { backgroundColor: BRAND, borderColor: BRAND }
                    : { backgroundColor: "transparent", borderColor: colors.border },
                ]}
                onPress={() => onCategoryPress(cat.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={14}
                  color={active ? "#fff" : colors.textMuted}
                />
                <Text
                  style={[
                    s.categoryText,
                    { color: active ? "#fff" : colors.textSecondary },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading && (
        <View style={s.loadingBar}>
          <View style={[s.loadingIndicator, { backgroundColor: BRAND }]} />
        </View>
      )}

      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
        {hasSearched ? renderResults() : renderIdleState()}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    gap: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: "100%",
    ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}),
  },
  clearBtn: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  categoryBar: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  loadingBar: { height: 2, overflow: "hidden" },
  loadingIndicator: { height: 2, width: "30%", borderRadius: 1 },

  idleSection: { marginBottom: 24 },
  idleSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  idleSectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", flex: 1 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  trendTag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  topUserCard: {
    width: 110,
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  topUserAvatar: { width: 52, height: 52, borderRadius: 26 },
  topUserName: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  topUserHandle: { fontSize: 11, fontFamily: "Inter_400Regular" },
  quickActions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  quickAction: {
    flex: 1,
    minWidth: (SCREEN_W - 64) / 2 - 5,
    maxWidth: (SCREEN_W - 64) / 2 - 5,
    alignItems: "center",
    paddingVertical: 18,
    borderRadius: 16,
    gap: 8,
  },
  quickActionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  resultSection: { marginBottom: 16 },

  personCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    gap: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  personAvatar: { width: 48, height: 48, borderRadius: 24 },
  personName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  personHandle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  personBio: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16, marginTop: 2 },
  personCountry: { alignSelf: "flex-start" },

  postCard: {
    padding: 14,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAvatar: { width: 32, height: 32, borderRadius: 16 },
  postAuthor: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  postContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  postFooter: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  postStat: { flexDirection: "row", alignItems: "center", gap: 4 },

  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    gap: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chatAvatar: { width: 42, height: 42, borderRadius: 21 },
  chatName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  chatMsg: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  channelCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    gap: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  channelAvatar: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  channelName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  channelSubs: { flexDirection: "row", alignItems: "center", gap: 4 },

  giftsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  giftCard: {
    width: (SCREEN_W - 56) / 4,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  giftEmoji: { fontSize: 28 },
  giftName: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  giftPrice: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },

  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
